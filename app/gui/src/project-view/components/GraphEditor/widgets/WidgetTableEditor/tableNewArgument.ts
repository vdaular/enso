import type { WidgetInput, WidgetUpdate } from '@/providers/widgetRegistry'
import { requiredImportsByFQN, type RequiredImport } from '@/stores/graph/imports'
import type { SuggestionDb } from '@/stores/suggestionDatabase'
import { assert } from '@/util/assert'
import { Ast } from '@/util/ast'
import { tryEnsoToNumber, tryNumberToEnso } from '@/util/ast/abstract'
import * as iterable from '@/util/data/iterable'
import { Err, Ok, transposeResult, unwrapOrWithLog, type Result } from '@/util/data/result'
import { qnLastSegment, type QualifiedName } from '@/util/qualifiedName'
import type { ToValue } from '@/util/reactivity'
import type { ColDef, MenuItemDef } from 'ag-grid-enterprise'
import { computed, toValue } from 'vue'

const NEW_COLUMN_ID = 'NewColumn'
const ROW_INDEX_COLUMN_ID = 'RowIndex'
const NEW_COLUMN_HEADER = 'New Column'
const ROW_INDEX_HEADER = '#'
const NOTHING_PATH = 'Standard.Base.Nothing.Nothing' as QualifiedName
const NOTHING_NAME = qnLastSegment(NOTHING_PATH)

export type RowData = {
  index: number
  /* Column id to given row's cell id. */
  cells: Record<Ast.AstId, Ast.AstId>
}

/**
 * A more specialized version of AGGrid's `MenuItemDef` to simplify testing (the tests need to provide
 * only values actually used by the composable)
 */
export interface MenuItem extends MenuItemDef<RowData> {
  action: (params: { node: { data: RowData | undefined } | null }) => void
}

/**
 * A more specialized version of AGGrid's `ColDef` to simplify testing (the tests need to provide
 * only values actually used by the composable)
 */
export interface ColumnDef extends ColDef<RowData> {
  valueGetter: ({ data }: { data: RowData | undefined }) => any
  valueSetter?: ({ data, newValue }: { data: RowData; newValue: any }) => boolean
  mainMenuItems: (string | MenuItem)[]
  contextMenuItems: (string | MenuItem)[]
  rowDrag?: ({ data }: { data: RowData | undefined }) => boolean
}

namespace cellValueConversion {
  /** TODO: Add docs */
  export function astToAgGrid(ast: Ast.Ast) {
    if (ast instanceof Ast.TextLiteral) return Ok(ast.rawTextContent)
    else if (ast instanceof Ast.Ident && ast.code() === NOTHING_NAME) return Ok(null)
    else if (ast instanceof Ast.PropertyAccess && ast.rhs.code() === NOTHING_NAME) return Ok(null)
    else {
      const asNumber = tryEnsoToNumber(ast)
      if (asNumber != null) return Ok(asNumber)
      else return Err('Ast is not convertible to AGGrid value')
    }
  }

  /** TODO: Add docs */
  export function agGridToAst(
    value: unknown,
    module: Ast.MutableModule,
  ): { ast: Ast.Owned; requireNothingImport: boolean } {
    if (value == null || value === '') {
      return { ast: Ast.Ident.new(module, 'Nothing' as Ast.Identifier), requireNothingImport: true }
    } else if (typeof value === 'number') {
      return {
        ast: tryNumberToEnso(value, module) ?? Ast.TextLiteral.new(`${value}`, module),
        requireNothingImport: false,
      }
    } else {
      return {
        ast:
          Ast.NumericLiteral.tryParseWithSign(`${value}`, module) ??
          Ast.TextLiteral.new(`${value}`, module),
        requireNothingImport: false,
      }
    }
  }
}

function retrieveColumnsAst(call: Ast.Ast) {
  if (!(call instanceof Ast.App)) return Ok(undefined)
  if (call.argument instanceof Ast.Vector) return Ok(call.argument)
  if (call.argument instanceof Ast.Wildcard) return Ok(undefined)
  return Err('Expected Table.new argument to be a vector of columns or placeholder')
}

function readColumn(
  ast: Ast.Ast,
): Result<{ id: Ast.AstId; name: Ast.TextLiteral; data: Ast.Vector }> {
  const errormsg = () => `${ast.code} is not a vector of two elements`
  if (!(ast instanceof Ast.Vector)) return Err(errormsg())
  const elements = ast.values()
  const first = elements.next()
  if (first.done) return Err(errormsg())
  const second = elements.next()
  if (second.done) return Err(errormsg())
  if (!elements.next().done) return Err(errormsg())

  if (!(first.value instanceof Ast.TextLiteral))
    return Err(
      `First element in column definition is ${first.value.code()} instead of a text literal`,
    )
  if (!(second.value instanceof Ast.Vector))
    return Err(`Second element in column definition is ${second.value.code()} instead of a vector`)
  return Ok({ id: ast.id, name: first.value, data: second.value })
}

function retrieveColumnsDefinitions(columnsAst: Ast.Vector) {
  return transposeResult(Array.from(columnsAst.values(), readColumn))
}

/**
 * Check if given ast is a `Table.new` call which may be handled by the TableEditorWidget.
 *
 * This widget may handle table definitions filled with literals or `Nothing` values.
 */
export function tableNewCallMayBeHandled(call: Ast.Ast) {
  const columnsAst = retrieveColumnsAst(call)
  if (!columnsAst.ok) return false
  if (!columnsAst.value) return true // We can handle lack of the argument
  const columns = retrieveColumnsDefinitions(columnsAst.value)
  if (!columns.ok) return false
  for (const col of columns.value) {
    for (const val of col.data.values()) {
      if (!cellValueConversion.astToAgGrid(val).ok) return false
    }
  }
  return true
}

/**
 * A composable responsible for interpreting `Table.new` expressions, creating AGGrid column
 * definitions allowing also editing AST through AGGrid editing.
 * @param input the widget's input
 * @param graph the graph store
 * @param onUpdate callback called when AGGrid was edited by user, resulting in AST change.
 */
export function useTableNewArgument(
  input: ToValue<WidgetInput & { value: Ast.Ast }>,
  graph: {
    startEdit(): Ast.MutableModule
    addMissingImports(edit: Ast.MutableModule, newImports: RequiredImport[]): void
  },
  suggestions: SuggestionDb,
  onUpdate: (update: WidgetUpdate) => void,
) {
  const errorMessagePreamble = 'Table Editor Widget should not have been matched'
  const columnsAst = computed(() => retrieveColumnsAst(toValue(input).value))

  const columns = computed(() => {
    if (!columnsAst.value.ok) return []
    if (columnsAst.value.value == null) return []
    const cols = retrieveColumnsDefinitions(columnsAst.value.value)
    return unwrapOrWithLog(cols, [], errorMessagePreamble)
  })

  const rowCount = computed(() =>
    columns.value.reduce((soFar, col) => Math.max(soFar, col.data.length), 0),
  )

  const undersizedColumns = computed(() =>
    columns.value.filter((col) => col.data.length < rowCount.value),
  )

  function fixColumns(edit: Ast.MutableModule) {
    for (const column of undersizedColumns.value) {
      const data = edit.getVersion(column.data)
      while (data.length < rowCount.value) {
        data.push(convertWithImport(null, edit))
      }
      while (data.length > rowCount.value) {
        data.pop()
      }
    }
  }

  function addRow(edit: Ast.MutableModule, columnWithValue?: Ast.AstId, value?: unknown) {
    for (const column of columns.value) {
      const editedCol = edit.getVersion(column.data)
      if (column.data.id === columnWithValue) {
        editedCol.push(convertWithImport(value, edit))
      } else {
        editedCol.push(convertWithImport(null, edit))
      }
    }
  }

  function removeRow(edit: Ast.MutableModule, index: number) {
    for (const column of columns.value) {
      const editedCol = edit.getVersion(column.data)
      editedCol.splice(index, 1)
    }
  }

  function addColumn(
    edit: Ast.MutableModule,
    name: string,
    rowWithValue?: number,
    value?: unknown,
  ) {
    const newColumnSize = Math.max(rowCount.value, rowWithValue != null ? rowWithValue + 1 : 0)
    function* cellsGenerator() {
      for (let i = 0; i < newColumnSize; ++i) {
        if (i === rowWithValue) yield convertWithImport(value, edit)
        else yield convertWithImport(null, edit)
      }
    }
    const cells = Ast.Vector.new(edit, Array.from(cellsGenerator()))
    const newCol = Ast.Vector.new(edit, [Ast.TextLiteral.new(name), cells])
    const ast = unwrapOrWithLog(columnsAst.value, undefined, errorMessagePreamble)
    if (ast) {
      edit.getVersion(ast).push(newCol)
    } else {
      const inputAst = edit.getVersion(toValue(input).value)
      const newArg = Ast.Vector.new(edit, [newCol])
      if (inputAst instanceof Ast.MutableApp) {
        inputAst.setArgument(newArg)
      } else {
        inputAst.updateValue((func) => Ast.App.new(edit, func, undefined, newArg))
      }
    }
  }

  function removeColumn(edit: Ast.MutableModule, columnId: Ast.AstId) {
    const editedCols = unwrapOrWithLog(columnsAst.value, undefined, errorMessagePreamble)
    if (!editedCols) {
      console.error(`Cannot remove column in Table Editor, because there is no column list`)
      return
    }
    for (const [index, col] of editedCols.enumerate()) {
      if (col?.id === columnId) {
        edit.getVersion(editedCols).splice(index, 1)
        return
      }
    }
  }

  const removeRowMenuItem = {
    name: 'Remove Row',
    action: ({ node }: { node: { data: RowData | undefined } | null }) => {
      if (!node?.data) return
      const edit = graph.startEdit()
      fixColumns(edit)
      removeRow(edit, node.data.index)
      onUpdate({ edit })
    },
  }

  const removeColumnMenuItem = (colId: Ast.AstId) => ({
    name: 'Remove Column',
    action: () => {
      const edit = graph.startEdit()
      fixColumns(edit)
      removeColumn(edit, colId)
      onUpdate({ edit })
    },
  })

  const newColumnDef = computed<ColumnDef>(() => ({
    colId: NEW_COLUMN_ID,
    headerName: NEW_COLUMN_HEADER,
    valueGetter: () => null,
    valueSetter: ({ data, newValue }: { data: RowData; newValue: any }) => {
      const edit = graph.startEdit()
      if (data.index === rowCount.value) {
        addRow(edit)
      }
      addColumn(edit, NEW_COLUMN_HEADER, data.index, newValue)
      onUpdate({ edit })
      return true
    },
    headerComponentParams: {
      nameSetter: (newName: string) => {
        const edit = graph.startEdit()
        fixColumns(edit)
        addColumn(edit, newName)
        onUpdate({ edit })
      },
      virtualColumn: true,
    },
    mainMenuItems: ['autoSizeThis', 'autoSizeAll'],
    contextMenuItems: ['paste', 'separator', removeRowMenuItem],
    lockPosition: 'right',
  }))

  const rowIndexColumnDef = computed<ColumnDef>(() => ({
    colId: ROW_INDEX_COLUMN_ID,
    headerName: ROW_INDEX_HEADER,
    valueGetter: ({ data }: { data: RowData | undefined }) => data?.index,
    editable: false,
    mainMenuItems: ['autoSizeThis', 'autoSizeAll'],
    contextMenuItems: [removeRowMenuItem],
    cellStyle: { color: 'rgba(0, 0, 0, 0.4)' },
    lockPosition: 'left',
    rowDrag: ({ data }) => data?.index != null && data.index < rowCount.value,
  }))

  const columnDefs = computed(() => {
    const cols: ColumnDef[] = Array.from(
      columns.value,
      (col) =>
        ({
          colId: col.id,
          headerName: col.name.rawTextContent,
          valueGetter: ({ data }: { data: RowData | undefined }) => {
            if (data == null) return undefined
            const ast = toValue(input).value.module.tryGet(data.cells[col.data.id])
            if (ast == null) return null
            const value = cellValueConversion.astToAgGrid(ast)
            if (!value.ok) {
              console.error(
                `Cannot read \`${ast.code}\` as value in Table Widget; the Table widget should not be matched here!`,
              )
              return null
            }
            return value.value
          },
          valueSetter: ({ data, newValue }: { data: RowData; newValue: any }): boolean => {
            const astId = data?.cells[col.data.id]
            const edit = graph.startEdit()
            fixColumns(edit)
            if (data.index === rowCount.value) {
              addRow(edit, col.data.id, newValue)
            } else {
              const newValueAst = convertWithImport(newValue, edit)
              if (astId != null) edit.replaceValue(astId, newValueAst)
              else edit.getVersion(col.data).set(data.index, newValueAst)
            }
            onUpdate({ edit })
            return true
          },
          headerComponentParams: {
            nameSetter: (newName: string) => {
              const edit = graph.startEdit()
              fixColumns(edit)
              edit.getVersion(col.name).setRawTextContent(newName)
              onUpdate({ edit })
            },
          },
          mainMenuItems: ['autoSizeThis', 'autoSizeAll', removeColumnMenuItem(col.id)],
          contextMenuItems: [
            'cut',
            'copy',
            'copyWithHeaders',
            'paste',
            'separator',
            removeRowMenuItem,
            removeColumnMenuItem(col.id),
            'separator',
            'export',
          ],
        }) satisfies ColDef<RowData>,
    )
    cols.unshift(rowIndexColumnDef.value)
    cols.push(newColumnDef.value)
    return cols
  })

  const rowData = computed(() => {
    const rows: RowData[] = []
    for (const col of columns.value) {
      for (const [rowIndex, value] of col.data.enumerate()) {
        const row: RowData = rows.at(rowIndex) ?? { index: rowIndex, cells: {} }
        assert(rowIndex <= rows.length)
        if (rowIndex === rows.length) {
          rows.push(row)
        }
        if (value?.id) {
          row.cells[col.data.id] = value?.id
        }
      }
    }
    rows.push({ index: rows.length, cells: {} })
    return rows
  })

  const nothingImport = computed(() => requiredImportsByFQN(suggestions, NOTHING_PATH, true))

  function convertWithImport(value: unknown, edit: Ast.MutableModule) {
    const { ast, requireNothingImport } = cellValueConversion.agGridToAst(value, edit)
    if (requireNothingImport) {
      graph.addMissingImports(edit, nothingImport.value)
    }
    return ast
  }

  function moveColumn(colId: string, toIndex: number) {
    if (!columnsAst.value.ok) {
      columnsAst.value.error.log('Cannot reorder columns: The table AST is not available')
      return
    }
    if (!columnsAst.value.value) {
      console.error('Cannot reorder columns on placeholders! This should not be possible in the UI')
      return
    }
    const edit = graph.startEdit()
    const columns = edit.getVersion(columnsAst.value.value)
    const fromIndex = iterable.find(columns.enumerate(), ([, ast]) => ast?.id === colId)?.[0]
    if (fromIndex != null) {
      columns.move(fromIndex, toIndex - 1)
      onUpdate({ edit })
    }
  }

  function moveRow(rowIndex: number, overIndex: number) {
    if (!columnsAst.value.ok) {
      columnsAst.value.error.log('Cannot reorder rows: The table AST is not available')
      return
    }
    if (!columnsAst.value.value) {
      console.error('Cannot reorder rows on placeholders! This should not be possible in the UI')
      return
    }
    // If dragged out of grid, we do nothing.
    if (overIndex === -1) return
    const edit = graph.startEdit()
    for (const col of columns.value) {
      const editedCol = edit.getVersion(col.data)
      editedCol.move(rowIndex, overIndex)
    }
    onUpdate({ edit })
  }

  return {
    /** All column definitions, to be passed to AgGrid component. */
    columnDefs,
    /**
     * Row Data, to be passed to AgGrid component. They do not contain values, but AstIds.
     * The column definitions have proper getters for obtaining value from AST.
     */
    rowData,
    /**
     * Move column in AST. Do not change colunDefs, they are updated upon expected widgetInput change.
     * @param colId the id of moved column (as got from `getColId()`)
     * @param toIndex the new index of column as in view (counting in the row index column).
     */
    moveColumn,
    /**
     * Move row in AST. Do not change rowData, its updated upon expected widgetInput change.
     * @param rowIndex the index of moved row.
     * @param overIndex the index of row over which this row was dropped, as in RowDragEndEvent's
     * `overIndex` (the -1 case is handled)
     */
    moveRow,
  }
}
