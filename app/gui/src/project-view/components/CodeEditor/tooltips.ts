import type { GraphStore, NodeId } from '@/stores/graph'
import { type SuggestionDbStore } from '@/stores/suggestionDatabase'
import { type RawAstExtended } from '@/util/ast/extended'
import { RawAst } from '@/util/ast/raw'
import { qnJoin, tryQualifiedName } from '@/util/qualifiedName'
import { syntaxTree } from '@codemirror/language'
import { type Extension } from '@codemirror/state'
import {
  type EditorView,
  hoverTooltip as originalHoverTooltip,
  tooltips,
  type TooltipView,
} from '@codemirror/view'
import { NodeProp, type SyntaxNode } from '@lezer/common'
import { unwrap } from 'ydoc-shared/util/data/result'
import { rangeEncloses } from 'ydoc-shared/yjsModel'

type AstNode = RawAstExtended<RawAst.Tree | RawAst.Token, false>
const astProp = new NodeProp<AstNode>({ perNode: true })

/** TODO: Add docs */
function hoverTooltip(
  create: (
    ast: AstNode,
    syntax: SyntaxNode,
  ) => TooltipView | ((view: EditorView) => TooltipView) | null | undefined,
): Extension {
  return [
    tooltips({ position: 'absolute' }),
    originalHoverTooltip((view, pos, side) => {
      const syntaxNode = syntaxTree(view.state).resolveInner(pos, side)
      const astNode = syntaxNode.tree?.prop(astProp)
      if (astNode == null) return null
      const domOrCreate = create(astNode, syntaxNode)
      if (domOrCreate == null) return null

      return {
        pos: syntaxNode.from,
        end: syntaxNode.to,
        above: true,
        arrow: true,
        create: typeof domOrCreate !== 'function' ? () => domOrCreate : domOrCreate,
      }
    }),
  ]
}

/** @returns A CodeMirror extension that creates tooltips containing type and syntax information for Enso code. */
export function ensoHoverTooltip(
  graphStore: Pick<GraphStore, 'moduleSource' | 'db'>,
  suggestionDbStore: Pick<SuggestionDbStore, 'entries'>,
) {
  return hoverTooltip((ast, syn) => {
    const dom = document.createElement('div')
    const astSpan = ast.span()
    let foundNode: NodeId | undefined
    for (const [id, node] of graphStore.db.nodeIdToNode.entries()) {
      const rootSpan = graphStore.moduleSource.getSpan(node.rootExpr.id)
      if (rootSpan && rangeEncloses(rootSpan, astSpan)) {
        foundNode = id
        break
      }
    }
    const expressionInfo = foundNode && graphStore.db.getExpressionInfo(foundNode)
    const nodeColor = foundNode && graphStore.db.getNodeColorStyle(foundNode)

    if (foundNode != null) {
      dom
        .appendChild(document.createElement('div'))
        .appendChild(document.createTextNode(`AST ID: ${foundNode}`))
    }
    if (expressionInfo != null) {
      dom
        .appendChild(document.createElement('div'))
        .appendChild(document.createTextNode(`Type: ${expressionInfo.typename ?? 'Unknown'}`))
    }
    if (expressionInfo?.profilingInfo[0] != null) {
      const profile = expressionInfo.profilingInfo[0]
      const executionTime = (profile.ExecutionTime.nanoTime / 1_000_000).toFixed(3)
      const text = `Execution Time: ${executionTime}ms`
      dom.appendChild(document.createElement('div')).appendChild(document.createTextNode(text))
    }

    dom
      .appendChild(document.createElement('div'))
      .appendChild(document.createTextNode(`Syntax: ${syn.toString()}`))
    const method = expressionInfo?.methodCall?.methodPointer
    if (method != null) {
      const moduleName = tryQualifiedName(method.module)
      const methodName = tryQualifiedName(method.name)
      const qualifiedName = qnJoin(unwrap(moduleName), unwrap(methodName))
      const [id] = suggestionDbStore.entries.nameToId.lookup(qualifiedName)
      const suggestionEntry = id != null ? suggestionDbStore.entries.get(id) : undefined
      if (suggestionEntry != null) {
        const groupNode = dom.appendChild(document.createElement('div'))
        groupNode.appendChild(document.createTextNode('Group: '))
        const groupNameNode = groupNode.appendChild(document.createElement('span'))
        groupNameNode.appendChild(document.createTextNode(`${method.module}.${method.name}`))
        if (nodeColor) {
          groupNameNode.style.color = nodeColor
        }
      }
    }
    return { dom }
  })
}
