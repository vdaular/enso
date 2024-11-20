import { type GraphStore } from '@/stores/graph'
import { type ProjectStore } from '@/stores/project'
import { type Diagnostic, forceLinting, linter } from '@codemirror/lint'
import { type Extension, StateEffect, StateField } from '@codemirror/state'
import { type EditorView } from '@codemirror/view'
import * as iter from 'enso-common/src/utilities/data/iter'
import { computed, shallowRef, watch } from 'vue'
import { type Diagnostic as LSDiagnostic, type Position } from 'ydoc-shared/languageServerTypes'

const executionContextDiagnostics = shallowRef<Diagnostic[]>([])

// Effect that can be applied to the document to invalidate the linter state.
const diagnosticsUpdated = StateEffect.define()
// State value that is perturbed by any `diagnosticsUpdated` effect.
const diagnosticsVersion = StateField.define({
  create: (_state) => 0,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(diagnosticsUpdated)) value += 1
    }
    return value
  },
})

/** Given a text, indexes it and returns a function for converting between different ways of identifying positions. */
function stringPosConverter(text: string) {
  let pos = 0
  const lineStartIndex: number[] = []
  for (const line of text.split('\n')) {
    lineStartIndex.push(pos)
    pos += line.length + 1
  }
  const length = text.length

  function lineColToIndex({
    line,
    character,
  }: {
    line: number
    character: number
  }): number | undefined {
    const startIx = lineStartIndex[line]
    if (startIx == null) return
    const ix = startIx + character
    if (ix > length) return
    return ix
  }

  return { lineColToIndex }
}

/** Convert the Language Server's diagnostics to CodeMirror diagnostics. */
function lsDiagnosticsToCMDiagnostics(
  diagnostics: LSDiagnostic[],
  lineColToIndex: (lineCol: Position) => number | undefined,
) {
  const results: Diagnostic[] = []
  for (const diagnostic of diagnostics) {
    if (!diagnostic.location) continue
    const from = lineColToIndex(diagnostic.location.start)
    const to = lineColToIndex(diagnostic.location.end)
    if (to == null || from == null) {
      // Suppress temporary errors if the source is not the version of the document the LS is reporting diagnostics for.
      continue
    }
    const severity =
      diagnostic.kind === 'Error' ? 'error'
      : diagnostic.kind === 'Warning' ? 'warning'
      : 'info'
    results.push({ from, to, message: diagnostic.message, severity })
  }
  return results
}

/**
 * CodeMirror extension providing diagnostics for an Enso module. Provides CodeMirror diagnostics based on dataflow
 * errors, and diagnostics the LS provided in an `executionStatus` message.
 */
export function useEnsoDiagnostics(
  projectStore: Pick<ProjectStore, 'computedValueRegistry' | 'dataflowErrors' | 'diagnostics'>,
  graphStore: Pick<GraphStore, 'moduleSource' | 'db'>,
  editorView: EditorView,
): Extension {
  const expressionUpdatesDiagnostics = computed(() => {
    const updates = projectStore.computedValueRegistry.db
    const panics = updates.type.reverseLookup('Panic')
    const errors = updates.type.reverseLookup('DataflowError')
    const diagnostics: Diagnostic[] = []
    for (const externalId of iter.chain(panics, errors)) {
      const update = updates.get(externalId)
      if (!update) continue
      const astId = graphStore.db.idFromExternal(externalId)
      if (!astId) continue
      const span = graphStore.moduleSource.getSpan(astId)
      if (!span) continue
      const [from, to] = span
      switch (update.payload.type) {
        case 'Panic': {
          diagnostics.push({ from, to, message: update.payload.message, severity: 'error' })
          break
        }
        case 'DataflowError': {
          const error = projectStore.dataflowErrors.lookup(externalId)
          if (error?.value?.message) {
            diagnostics.push({ from, to, message: error.value.message, severity: 'error' })
          }
          break
        }
      }
    }
    return diagnostics
  })
  watch([executionContextDiagnostics, expressionUpdatesDiagnostics], () => {
    editorView.dispatch({ effects: diagnosticsUpdated.of(null) })
    forceLinting(editorView)
  })
  // The LS protocol doesn't identify what version of the file updates are in reference to. When diagnostics are
  // received from the LS, we map them to the text assuming that they are applicable to the current version of the
  // module. This will be correct if there is no one else editing, and we aren't editing faster than the LS can send
  // updates. Typing too quickly can result in incorrect ranges, but at idle it should correct itself when we receive
  // new diagnostics.
  watch(
    () => projectStore.diagnostics,
    (diagnostics) => {
      const { lineColToIndex } = stringPosConverter(graphStore.moduleSource.text)
      executionContextDiagnostics.value = lsDiagnosticsToCMDiagnostics(diagnostics, lineColToIndex)
    },
  )
  return [
    diagnosticsVersion,
    linter(() => [...executionContextDiagnostics.value, ...expressionUpdatesDiagnostics.value], {
      needsRefresh(update) {
        return (
          update.state.field(diagnosticsVersion) !== update.startState.field(diagnosticsVersion)
        )
      },
    }),
  ]
}
