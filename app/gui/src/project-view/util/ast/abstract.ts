import { normalizeQualifiedName, qnFromSegments } from '@/util/qualifiedName'
import {
  Ast,
  BodyBlock,
  Expression,
  Function,
  Ident,
  IdentifierOrOperatorIdentifier,
  Mutable,
  MutableAst,
  MutableBodyBlock,
  MutableExpression,
  MutableFunction,
  MutableIdent,
  MutableModule,
  MutablePropertyAccess,
  MutableStatement,
  NegationApp,
  NumericLiteral,
  OprApp,
  Owned,
  PropertyAccess,
  QualifiedName,
  Statement,
  Token,
  isTokenId,
  parseExpression,
  print,
} from 'ydoc-shared/ast'

export * from 'ydoc-shared/ast'

/** Given an output of {@link serializeExpression}, returns a deserialized expression. */
export function deserializeExpression(serialized: string): Owned<MutableExpression> {
  // Not implemented: restoring serialized external IDs. This is not the best approach anyway;
  // Y.Js can't merge edits to objects when they're being serialized and deserialized.
  return parseExpression(serialized)!
}

/** Returns a serialized representation of the expression. */
export function serializeExpression(ast: Expression): string {
  return print(ast).code
}

export type TokenTree = (TokenTree | string)[]
/** Returns a debug representation. */
export function tokenTree(root: Ast): TokenTree {
  const module = root.module
  return Array.from(root.concreteChildren({ verbatim: false, indent: '' }), (child) => {
    if (isTokenId(child.node)) {
      return module.getToken(child.node).code()
    } else {
      const node = module.tryGet(child.node)
      return node ? tokenTree(node) : '<missing>'
    }
  })
}

/** TODO: Add docs */
export function tokenTreeWithIds(root: Ast): TokenTree {
  const module = root.module
  return [
    root.externalId,
    ...Array.from(root.concreteChildren({ verbatim: false, indent: '' }), (child) => {
      if (isTokenId(child.node)) {
        return module.getToken(child.node).code()
      } else {
        const node = module.tryGet(child.node)
        return node ? tokenTreeWithIds(node) : ['<missing>']
      }
    }),
  ]
}

/** TODO: Add docs */
export function moduleMethodNames(topLevel: BodyBlock): Set<string> {
  const result = new Set<string>()
  for (const statement of topLevel.statements()) {
    if (statement instanceof Function) result.add(statement.name.code())
  }
  return result
}

export function findModuleMethod(
  topLevel: MutableBodyBlock,
  name: string,
): { statement: MutableFunction; index: number } | undefined
export function findModuleMethod(
  topLevel: BodyBlock,
  name: string,
): { statement: Function; index: number } | undefined
/** Find the definition of the function with the specified name in the given block. */
export function findModuleMethod(
  topLevel: BodyBlock,
  name: string,
): { statement: Function; index: number } | undefined {
  // FIXME: We should use alias analysis to handle shadowing correctly.
  const isFunctionWithName = (statement: Statement, name: string) =>
    statement instanceof Function && statement.name.code() === name
  const index = topLevel.lines.findIndex(
    (line) => line.statement && isFunctionWithName(line.statement.node, name),
  )
  if (index === -1) return undefined
  const statement = topLevel.lines[index]!.statement!.node as Function
  return {
    /** The `Function` definition. */
    statement,
    /** The index into the block's `lines` where the definition was found. */
    index,
  }
}

/** Delete the specified statement from its containing block. */
export function deleteFromParentBlock(ast: MutableStatement) {
  const parent = ast.mutableParent()
  if (parent instanceof MutableBodyBlock)
    parent.updateLines((lines) => lines.filter((line) => line.statement?.node.id !== ast.id))
}

/**
 * If the input is a chain of applications of the given left-associative operator, and all the leaves of the
 *  operator-application tree are identifier expressions, return the identifiers from left to right.
 *  This is analogous to `ast.code().split(operator)`, but type-enforcing.
 */
export function unrollOprChain(
  ast: Ast,
  leftAssociativeOperator: string,
): IdentifierOrOperatorIdentifier[] | null {
  const idents: IdentifierOrOperatorIdentifier[] = []
  let ast_: Ast | undefined = ast
  while (
    ast_ instanceof OprApp &&
    ast_.operator.ok &&
    ast_.operator.value.code() === leftAssociativeOperator
  ) {
    if (!(ast_.rhs instanceof Ident)) return null
    idents.unshift(ast_.rhs.code())
    ast_ = ast_.lhs
  }
  if (!(ast_ instanceof Ident)) return null
  idents.unshift(ast_.code())
  return idents
}

/**
 * If the input is a chain of property accesses (uses of the `.` operator with a syntactic identifier on the RHS), and
 *  the value at the beginning of the sequence is an identifier expression, return all the identifiers from left to
 *  right. This is analogous to `ast.code().split('.')`, but type-enforcing.
 */
export function unrollPropertyAccess(ast: Ast): IdentifierOrOperatorIdentifier[] | null {
  const idents: IdentifierOrOperatorIdentifier[] = []
  let ast_: Ast | undefined = ast
  while (ast_ instanceof PropertyAccess) {
    idents.unshift(ast_.rhs.code())
    ast_ = ast_.lhs
  }
  if (!(ast_ instanceof Ident)) return null
  idents.unshift(ast_.code())
  return idents
}

/** TODO: Add docs */
export function parseIdent(ast: Ast): IdentifierOrOperatorIdentifier | null {
  if (ast instanceof Ident) {
    return ast.code()
  } else {
    return null
  }
}

/** TODO: Add docs */
export function parseIdents(ast: Ast): IdentifierOrOperatorIdentifier[] | null {
  return unrollOprChain(ast, ',')
}

/** TODO: Add docs */
export function parseQualifiedName(ast: Ast): QualifiedName | null {
  const idents = unrollPropertyAccess(ast)
  return idents && normalizeQualifiedName(qnFromSegments(idents))
}

/**
 * Substitute `pattern` inside `expression` with `to`.
 * Will only replace the first item in the property acccess chain.
 */
export function substituteIdentifier(
  expr: MutableAst,
  pattern: IdentifierOrOperatorIdentifier,
  to: IdentifierOrOperatorIdentifier,
) {
  if (expr instanceof MutableIdent && expr.code() === pattern) {
    expr.setToken(to)
  } else if (expr instanceof MutablePropertyAccess) {
    // Substitute only the first item in the property access chain.
    if (expr.lhs != null) substituteIdentifier(expr.lhs, pattern, to)
  } else {
    for (const child of expr.children()) {
      if (child instanceof Token) {
        continue
      }
      const mutableChild = expr.module.getVersion(child)
      substituteIdentifier(mutableChild, pattern, to)
    }
  }
}

/**
 * Substitute `pattern` inside `expression` with `to`.
 * Replaces identifier, the whole qualified name, or the beginning of the qualified name (first segments of property access chain).
 */
export function substituteQualifiedName(
  expr: MutableAst,
  pattern: QualifiedName | IdentifierOrOperatorIdentifier,
  to: QualifiedName,
) {
  if (expr instanceof MutablePropertyAccess || expr instanceof MutableIdent) {
    const qn = parseQualifiedName(expr)
    if (qn === pattern) {
      expr.updateValue(() => parseExpression(to, expr.module)!)
    } else if (qn && qn.startsWith(pattern)) {
      const withoutPattern = qn.replace(pattern, '')
      expr.updateValue(() => parseExpression(to + withoutPattern, expr.module)!)
    }
  } else {
    for (const child of expr.children()) {
      if (child instanceof Token) {
        continue
      }
      const mutableChild = expr.module.getVersion(child)
      substituteQualifiedName(mutableChild, pattern, to)
    }
  }
}

/**
 * Try to convert the number to an Enso value.
 *
 *  Returns `undefined` if the input is not a real number. NOTE: The current implementation doesn't support numbers that
 *  JS prints in scientific notation.
 */
export function tryNumberToEnso(value: number, module: MutableModule) {
  if (!Number.isFinite(value)) return
  const literal = NumericLiteral.tryParse(Math.abs(value).toString(), module)
  if (!literal)
    console.warn(`Not implemented: Converting scientific-notation number to Enso value`, value)
  if (literal && value < 0) {
    return NegationApp.new(module, literal)
  } else {
    return literal
  }
}

/** TODO: Add docs */
export function tryEnsoToNumber(ast: Ast) {
  const [sign, literal] = ast instanceof NegationApp ? [-1, ast.argument] : [1, ast]
  if (!(literal instanceof NumericLiteral)) return
  // JS parsing is accidentally the same as our rules for literals: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number#number_coercion
  // except `_` separators: https://stackoverflow.com/questions/72548282/why-does-number-constructor-fail-to-parse-numbers-with-separators
  return sign * Number(literal.code().replace(/_/g, ''))
}

/** TODO: Add docs */
export function copyIntoNewModule<T extends Ast>(ast: T): Owned<Mutable<T>> {
  const module = MutableModule.Transient()
  module.importCopy(ast)
  return module.getVersion(ast) as Owned<Mutable<T>>
}

/** Safely cast a mutable or owned value to its base type. */
export function dropMutability<T extends Ast>(value: Owned<Mutable<T>>): T {
  return value as unknown as T
}

declare const tokenKey: unique symbol
declare module '@/providers/widgetRegistry' {
  export interface WidgetInputTypes {
    [tokenKey]: Token
  }
}
