import { Ast, RawAst } from '@/util/ast'
import { AliasAnalyzer } from '@/util/ast/aliasAnalysis'
import { visitRecursive } from '@/util/ast/raw'
import { MappedKeyMap, MappedSet } from '@/util/containers'
import type { AstId } from 'ydoc-shared/ast'
import type { SourceDocument } from 'ydoc-shared/ast/sourceDocument'
import { assert } from 'ydoc-shared/util/assert'
import { type SourceRange, sourceRangeKey, type SourceRangeKey } from 'ydoc-shared/yjsModel'

/** A variable name, and information about its usages. */
export interface BindingInfo {
  identifier: string
  usages: Set<Ast.AstId>
}

/** Find variables bound in the function, and their usages. */
export function analyzeBindings(
  func: Ast.FunctionDef,
  moduleSource: Pick<SourceDocument, 'text' | 'getSpan'>,
): Map<Ast.AstId, BindingInfo> {
  const toRaw = new Map<SourceRangeKey, RawAst.Tree.Function>()
  visitRecursive(Ast.rawParseModule(moduleSource.text), (node) => {
    if (node.type === RawAst.Tree.Type.Function) {
      const start = node.whitespaceStartInCodeParsed + node.whitespaceLengthInCodeParsed
      const end = start + node.childrenLengthInCodeParsed
      toRaw.set(sourceRangeKey([start, end]), node)
      return false
    }
    return true
  })
  const methodSpan = moduleSource.getSpan(func.id)
  assert(methodSpan != null)
  const rawFunc = toRaw.get(sourceRangeKey(methodSpan))
  const getSpan = (id: Ast.AstId) => moduleSource.getSpan(id)
  const moduleCode = moduleSource.text

  // TODO[ao]: Rename 'alias' to 'binding' in AliasAnalyzer and it's more accurate term.
  const analyzer = new AliasAnalyzer(moduleCode, rawFunc)
  analyzer.process()

  const bindingRangeToTree = rangeMappings(func, analyzer, getSpan)

  const bindings = new Map<Ast.AstId, BindingInfo>()
  for (const [bindingRange, usagesRanges] of analyzer.aliases) {
    const aliasAst = bindingRangeToTree.get(bindingRange)
    if (aliasAst == null) {
      console.warn(`Binding not found`, bindingRange)
      continue
    }
    const usages = new Set<Ast.AstId>()
    for (const usageRange of usagesRanges) {
      const usageAst = bindingRangeToTree.get(usageRange)
      assert(usageAst != null)
      if (usageAst != null) usages.add(usageAst.id)
    }
    bindings.set(aliasAst.id, {
      identifier: aliasAst.code(),
      usages,
    })
  }
  return bindings
}

/**
 * Create mappings between bindings' ranges and AST
 *
 * The AliasAnalyzer is general and returns ranges, but we're interested in AST nodes. This
 * method creates mappings in both ways. For given range, only the shallowest AST node will be
 * assigned (RawAst.Tree.Identifier, not RawAst.Token.Identifier).
 */
function rangeMappings(
  ast: Ast.Ast,
  analyzer: AliasAnalyzer,
  getSpan: (id: AstId) => SourceRange | undefined,
): MappedKeyMap<SourceRange, Ast.Ast> {
  const bindingRangeToTree = new MappedKeyMap<SourceRange, Ast.Ast>(sourceRangeKey)
  const bindingRanges = new MappedSet(sourceRangeKey)
  for (const [binding, usages] of analyzer.aliases) {
    bindingRanges.add(binding)
    for (const usage of usages) bindingRanges.add(usage)
  }
  ast.visitRecursive((ast) => {
    const span = getSpan(ast.id)
    assert(span != null)
    if (bindingRanges.has(span)) {
      bindingRangeToTree.set(span, ast)
      return false
    }
    return true
  })
  return bindingRangeToTree
}
