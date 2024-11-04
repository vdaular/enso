import * as map from 'lib0/map'
import {
  AstId,
  FunctionFields,
  Module,
  MutableInvalid,
  NodeChild,
  Owned,
  OwnedRefs,
  TextElement,
  TextToken,
  Token,
  asOwned,
  isTokenId,
  newExternalId,
  parentId,
  rewriteRefs,
  subtreeRoots,
  syncFields,
  syncNodeMetadata,
} from '.'
import { assert, assertDefined, assertEqual } from '../util/assert'
import { tryGetSoleValue, zip } from '../util/data/iterable'
import type { SourceRangeEdit, SpanTree } from '../util/data/text'
import {
  applyTextEdits,
  applyTextEditsToSpans,
  enclosingSpans,
  textChangeToEdits,
  trimEnd,
} from '../util/data/text'
import {
  IdMap,
  isUuid,
  rangeLength,
  sourceRangeFromKey,
  sourceRangeKey,
  type SourceRange,
  type SourceRangeKey,
} from '../yjsModel'
import { parse_block, parse_module, xxHash128 } from './ffi'
import * as RawAst from './generated/ast'
import { MutableModule } from './mutableModule'
import type { LazyObject } from './parserSupport'
import {
  App,
  Assignment,
  Ast,
  AutoscopedIdentifier,
  BodyBlock,
  ExpressionStatement,
  Function,
  Generic,
  Group,
  Ident,
  Import,
  Invalid,
  MutableAssignment,
  MutableAst,
  MutableBodyBlock,
  MutableExpression,
  MutableExpressionStatement,
  MutableIdent,
  MutableStatement,
  NegationApp,
  NumericLiteral,
  OprApp,
  PropertyAccess,
  TextLiteral,
  UnaryOprApp,
  Vector,
  Wildcard,
} from './tree'

/** Return the raw parser output for the given code, parsed as a module. */
export function rawParseModule(code: string): RawAst.Tree.BodyBlock {
  return deserializeBlock(parse_module(code))
}

/** Return the raw parser output for the given code, parsed as a body block. */
export function rawParseBlock(code: string): RawAst.Tree.BodyBlock {
  return deserializeBlock(parse_block(code))
}

function deserializeBlock(blob: Uint8Array): RawAst.Tree.BodyBlock {
  const tree = RawAst.Tree.read(new DataView(blob.buffer), blob.byteLength - 4)
  // The root of the parser output is always a body block.
  assert(tree.type === RawAst.Tree.Type.BodyBlock)
  return tree
}

/** Print the AST and re-parse it, copying `externalId`s (but not other metadata) from the original. */
export function normalize(rootIn: Ast): Ast {
  const printed = print(rootIn)
  const idMap = spanMapToIdMap(printed.info)
  const module = MutableModule.Transient()
  const tree = rawParseModule(printed.code)
  const { root: parsed, spans } = abstract(module, tree, printed.code)
  module.setRoot(parsed)
  setExternalIds(module, spans, idMap)
  return parsed
}

/** Produce `Ast` types from `RawAst` parser output. */
export function abstract(
  module: MutableModule,
  tree: RawAst.Tree.BodyBlock,
  code: string,
  substitutor?: (key: NodeKey) => Owned | undefined,
): { root: Owned<MutableBodyBlock>; spans: SpanMap; toRaw: Map<AstId, RawAst.Tree> }
export function abstract(
  module: MutableModule,
  tree: RawAst.Tree,
  code: string,
  substitutor?: (key: NodeKey) => Owned | undefined,
): { root: Owned; spans: SpanMap; toRaw: Map<AstId, RawAst.Tree> }
/** Implementation of `abstract`. */
export function abstract(
  module: MutableModule,
  tree: RawAst.Tree,
  code: string,
  substitutor?: (key: NodeKey) => Owned | undefined,
): { root: Owned; spans: SpanMap; toRaw: Map<AstId, RawAst.Tree> } {
  const abstractor = new Abstractor(module, code, substitutor)
  const root = abstractor.abstractTree(tree).node
  const spans = { tokens: abstractor.tokens, nodes: abstractor.nodes }
  return { root: root as Owned<MutableBodyBlock>, spans, toRaw: abstractor.toRaw }
}

/** Produces `Ast` types from `RawAst` parser output. */
class Abstractor {
  private readonly module: MutableModule
  private readonly code: string
  private readonly substitutor: ((key: NodeKey) => Owned | undefined) | undefined
  readonly nodes: NodeSpanMap
  readonly tokens: TokenSpanMap
  readonly toRaw: Map<AstId, RawAst.Tree>

  /**
   *  @param module - Where to allocate the new nodes.
   *  @param code - Source code that will be used to resolve references in any passed `RawAst` objects.
   *  @param substitutor - A function that can inject subtrees for some spans, instead of the abstractor producing them.
   *    This can be used for incremental abstraction.
   */
  constructor(
    module: MutableModule,
    code: string,
    substitutor?: (key: NodeKey) => Owned | undefined,
  ) {
    this.module = module
    this.code = code
    this.substitutor = substitutor
    this.nodes = new Map()
    this.tokens = new Map()
    this.toRaw = new Map()
  }

  abstractStatement(tree: RawAst.Tree): {
    whitespace: string | undefined
    node: Owned<MutableStatement>
  } {
    return this.abstractTree(tree) as any
  }

  abstractExpression(tree: RawAst.Tree): {
    whitespace: string | undefined
    node: Owned<MutableExpression>
  } {
    return this.abstractTree(tree) as any
  }

  abstractTree(tree: RawAst.Tree): { whitespace: string | undefined; node: Owned } {
    const whitespaceStart = tree.whitespaceStartInCodeParsed
    const whitespaceEnd = whitespaceStart + tree.whitespaceLengthInCodeParsed
    const whitespace = this.code.substring(whitespaceStart, whitespaceEnd)
    const codeStart = whitespaceEnd
    const codeEnd = codeStart + tree.childrenLengthInCodeParsed
    const spanKey = nodeKey(codeStart, codeEnd - codeStart)
    const substitute = this.substitutor?.(spanKey)
    if (substitute) return { node: substitute, whitespace }
    let node: Owned
    switch (tree.type) {
      case RawAst.Tree.Type.BodyBlock: {
        const lines = Array.from(tree.statements, line => {
          const newline = this.abstractToken(line.newline)
          const statement = line.expression ? this.abstractStatement(line.expression) : undefined
          return { newline, statement }
        })
        node = BodyBlock.concrete(this.module, lines)
        break
      }
      case RawAst.Tree.Type.Function: {
        node = this.abstractFunction(tree)
        break
      }
      case RawAst.Tree.Type.Ident: {
        const token = this.abstractToken(tree.token)
        node = Ident.concrete(this.module, token)
        break
      }
      case RawAst.Tree.Type.Assignment: {
        const docLine = tree.docLine && this.abstractDocLine(tree.docLine)
        const pattern = this.abstractExpression(tree.pattern)
        const equals = this.abstractToken(tree.equals)
        const value = this.abstractExpression(tree.expr)
        node = Assignment.concrete(this.module, docLine, pattern, equals, value)
        break
      }
      case RawAst.Tree.Type.App: {
        const func = this.abstractExpression(tree.func)
        const arg = this.abstractExpression(tree.arg)
        node = App.concrete(this.module, func, undefined, undefined, arg)
        break
      }
      case RawAst.Tree.Type.NamedApp: {
        const func = this.abstractExpression(tree.func)
        const open = tree.open ? this.abstractToken(tree.open) : undefined
        const name = this.abstractToken(tree.name)
        const equals = this.abstractToken(tree.equals)
        const arg = this.abstractExpression(tree.arg)
        const close = tree.close ? this.abstractToken(tree.close) : undefined
        const parens = open && close ? { open, close } : undefined
        const nameSpecification = { name, equals }
        node = App.concrete(this.module, func, parens, nameSpecification, arg)
        break
      }
      case RawAst.Tree.Type.UnaryOprApp: {
        const opr = this.abstractToken(tree.opr)
        const arg = tree.rhs ? this.abstractExpression(tree.rhs) : undefined
        if (arg && opr.node.code() === '-') {
          node = NegationApp.concrete(this.module, opr, arg)
        } else {
          node = UnaryOprApp.concrete(this.module, opr, arg)
        }
        break
      }
      case RawAst.Tree.Type.AutoscopedIdentifier: {
        const opr = this.abstractToken(tree.opr)
        const ident = this.abstractToken(tree.ident)
        node = AutoscopedIdentifier.concrete(this.module, opr, ident)
        break
      }
      case RawAst.Tree.Type.OprApp: {
        const lhs = tree.lhs ? this.abstractExpression(tree.lhs) : undefined
        const opr =
          tree.opr.ok ?
            [this.abstractToken(tree.opr.value)]
          : Array.from(tree.opr.error.payload.operators, this.abstractToken.bind(this))
        const rhs = tree.rhs ? this.abstractExpression(tree.rhs) : undefined
        const soleOpr = tryGetSoleValue(opr)
        if (soleOpr?.node.code() === '.' && rhs?.node instanceof MutableIdent) {
          // Propagate type.
          const rhs_ = { ...rhs, node: rhs.node }
          node = PropertyAccess.concrete(this.module, lhs, soleOpr, rhs_)
        } else {
          node = OprApp.concrete(this.module, lhs, opr, rhs)
        }
        break
      }
      case RawAst.Tree.Type.Number: {
        const tokens = []
        if (tree.base) tokens.push(this.abstractToken(tree.base))
        if (tree.integer) tokens.push(this.abstractToken(tree.integer))
        if (tree.fractionalDigits) {
          tokens.push(this.abstractToken(tree.fractionalDigits.dot))
          tokens.push(this.abstractToken(tree.fractionalDigits.digits))
        }
        node = NumericLiteral.concrete(this.module, tokens)
        break
      }
      case RawAst.Tree.Type.Wildcard: {
        const token = this.abstractToken(tree.token)
        node = Wildcard.concrete(this.module, token)
        break
      }
      // These expression types are (or will be) used for backend analysis.
      // The frontend can ignore them, avoiding some problems with expressions sharing spans
      // (which makes it impossible to give them unique IDs in the current IdMap format).
      case RawAst.Tree.Type.OprSectionBoundary:
      case RawAst.Tree.Type.TemplateFunction:
        return { whitespace, node: this.abstractExpression(tree.ast).node }
      case RawAst.Tree.Type.Invalid: {
        const expression = this.abstractTree(tree.ast)
        node = Invalid.concrete(this.module, expression)
        break
      }
      case RawAst.Tree.Type.Group: {
        const open = tree.open ? this.abstractToken(tree.open) : undefined
        const expression = tree.body ? this.abstractExpression(tree.body) : undefined
        const close = tree.close ? this.abstractToken(tree.close) : undefined
        node = Group.concrete(this.module, open, expression, close)
        break
      }
      case RawAst.Tree.Type.TextLiteral: {
        const open = tree.open ? this.abstractToken(tree.open) : undefined
        const newline = tree.newline ? this.abstractToken(tree.newline) : undefined
        const elements = Array.from(tree.elements, raw => this.abstractTextElement(raw))
        const close = tree.close ? this.abstractToken(tree.close) : undefined
        node = TextLiteral.concrete(this.module, open, newline, elements, close)
        break
      }
      case RawAst.Tree.Type.ExpressionStatement: {
        const docLine = tree.docLine && this.abstractDocLine(tree.docLine)
        const expression = this.abstractExpression(tree.expression)
        node = ExpressionStatement.concrete(this.module, docLine, expression)
        break
      }
      case RawAst.Tree.Type.Import: {
        const recurseBody = (tree: RawAst.Tree) => {
          const body = this.abstractExpression(tree)
          if (body.node instanceof MutableInvalid && body.node.code() === '') return undefined
          return body
        }
        const recurseSegment = (segment: RawAst.MultiSegmentAppSegment) => ({
          header: this.abstractToken(segment.header),
          body: segment.body ? recurseBody(segment.body) : undefined,
        })
        const polyglot = tree.polyglot ? recurseSegment(tree.polyglot) : undefined
        const from = tree.from ? recurseSegment(tree.from) : undefined
        const import_ = recurseSegment(tree.import)
        const all = tree.all ? this.abstractToken(tree.all) : undefined
        const as = tree.as ? recurseSegment(tree.as) : undefined
        const hiding = tree.hiding ? recurseSegment(tree.hiding) : undefined
        node = Import.concrete(this.module, polyglot, from, import_, all, as, hiding)
        break
      }
      case RawAst.Tree.Type.Array: {
        const left = this.abstractToken(tree.left)
        const elements = []
        if (tree.first) elements.push({ value: this.abstractExpression(tree.first) })
        else if (!tree.rest.next().done) elements.push({ value: undefined })
        for (const rawElement of tree.rest) {
          elements.push({
            delimiter: this.abstractToken(rawElement.operator),
            value: rawElement.body && this.abstractExpression(rawElement.body),
          })
        }
        const right = this.abstractToken(tree.right)
        node = Vector.concrete(this.module, left, elements, right)
        break
      }
      default: {
        node = Generic.concrete(this.module, this.abstractChildren(tree))
      }
    }
    this.toRaw.set(node.id, tree)
    map.setIfUndefined(this.nodes, spanKey, (): Ast[] => []).unshift(node)
    return { node, whitespace }
  }

  private abstractFunction(tree: RawAst.Tree.Function) {
    const docLine = tree.docLine && this.abstractDocLine(tree.docLine)
    const annotationLines = Array.from(tree.annotationLines, anno => ({
      annotation: {
        operator: this.abstractToken(anno.annotation.operator),
        annotation: this.abstractToken(anno.annotation.annotation),
        argument: anno.annotation.argument && this.abstractExpression(anno.annotation.argument),
      },
      newlines: Array.from(anno.newlines, this.abstractToken.bind(this)),
    }))
    const signatureLine = tree.signatureLine && {
      signature: this.abstractTypeSignature(tree.signatureLine.signature),
      newlines: Array.from(tree.signatureLine.newlines, this.abstractToken.bind(this)),
    }
    const private_ = tree.private && this.abstractToken(tree.private)
    const name = this.abstractExpression(tree.name)
    const argumentDefinitions = Array.from(tree.args, arg => ({
      open: arg.open && this.abstractToken(arg.open),
      open2: arg.open2 && this.abstractToken(arg.open2),
      suspension: arg.suspension && this.abstractToken(arg.suspension),
      pattern: this.abstractExpression(arg.pattern),
      type: arg.typeNode && {
        operator: this.abstractToken(arg.typeNode.operator),
        type: this.abstractExpression(arg.typeNode.typeNode),
      },
      close2: arg.close2 && this.abstractToken(arg.close2),
      defaultValue: arg.default && {
        equals: this.abstractToken(arg.default.equals),
        expression: this.abstractExpression(arg.default.expression),
      },
      close: arg.close && this.abstractToken(arg.close),
    }))
    const equals = this.abstractToken(tree.equals)
    const body = tree.body !== undefined ? this.abstractExpression(tree.body) : undefined
    return Function.concrete(this.module, {
      docLine,
      annotationLines,
      signatureLine,
      private_,
      name,
      argumentDefinitions,
      equals,
      body,
    } satisfies FunctionFields<OwnedRefs>)
  }

  private abstractToken(token: RawAst.Token): { whitespace: string; node: Token } {
    const whitespaceStart = token.whitespaceStartInCodeBuffer
    const whitespaceEnd = whitespaceStart + token.whitespaceLengthInCodeBuffer
    const whitespace = this.code.substring(whitespaceStart, whitespaceEnd)
    const codeStart = token.startInCodeBuffer
    const codeEnd = codeStart + token.lengthInCodeBuffer
    const tokenCode = this.code.substring(codeStart, codeEnd)
    const key = tokenKey(codeStart, codeEnd - codeStart)
    const node = Token.new(tokenCode, token.type)
    this.tokens.set(key, node)
    return { whitespace, node }
  }

  private abstractChildren(tree: LazyObject): (NodeChild<Owned> | NodeChild<Token>)[] {
    const children: (NodeChild<Owned> | NodeChild<Token>)[] = []
    const visitor = (child: LazyObject) => {
      if (RawAst.Tree.isInstance(child)) {
        children.push(this.abstractTree(child))
      } else if (RawAst.Token.isInstance(child)) {
        children.push(this.abstractToken(child))
      } else {
        child.visitChildren(visitor)
      }
    }
    tree.visitChildren(visitor)
    return children
  }

  private abstractTextElement(raw: RawAst.TextElement): TextElement<OwnedRefs> {
    switch (raw.type) {
      case RawAst.TextElement.Type.Newline:
      case RawAst.TextElement.Type.Escape:
      case RawAst.TextElement.Type.Section:
        return this.abstractTextToken(raw)
      case RawAst.TextElement.Type.Splice:
        return {
          type: 'splice',
          open: this.abstractToken(raw.open),
          expression: raw.expression && this.abstractExpression(raw.expression),
          close: this.abstractToken(raw.close),
        }
    }
  }

  private abstractTextToken(raw: RawAst.TextElement): TextToken<OwnedRefs> {
    switch (raw.type) {
      case RawAst.TextElement.Type.Newline:
        return { type: 'token', token: this.abstractToken(raw.newline) }
      case RawAst.TextElement.Type.Escape: {
        const negativeOneU32 = 4294967295
        return {
          type: 'token',
          token: this.abstractToken(raw.token),
          interpreted:
            raw.token.value !== negativeOneU32 ? String.fromCodePoint(raw.token.value) : undefined,
        }
      }
      case RawAst.TextElement.Type.Section:
        return { type: 'token', token: this.abstractToken(raw.text) }
      case RawAst.TextElement.Type.Splice:
        throw new Error('Unreachable: Splice in non-interpolated text field')
    }
  }

  private abstractTypeSignature(signature: RawAst.TypeSignature) {
    return {
      name: this.abstractExpression(signature.name),
      operator: this.abstractToken(signature.operator),
      type: this.abstractExpression(signature.typeNode),
    }
  }

  private abstractDocLine(docLine: RawAst.DocLine) {
    return {
      docs: {
        open: this.abstractToken(docLine.docs.open),
        elements: Array.from(docLine.docs.elements, this.abstractTextToken.bind(this)),
      },
      newlines: Array.from(docLine.newlines, this.abstractToken.bind(this)),
    }
  }
}

declare const nodeKeyBrand: unique symbol
/** A source-range key for an `Ast`. */
export type NodeKey = SourceRangeKey & { [nodeKeyBrand]: never }
declare const tokenKeyBrand: unique symbol
/** A source-range key for a `Token`. */
export type TokenKey = SourceRangeKey & { [tokenKeyBrand]: never }
/** Create a source-range key for an `Ast`. */
export function nodeKey(start: number, length: number): NodeKey {
  return sourceRangeKey([start, start + length]) as NodeKey
}
/** Create a source-range key for a `Token`. */
export function tokenKey(start: number, length: number): TokenKey {
  return sourceRangeKey([start, start + length]) as TokenKey
}

/** Maps from source ranges to `Ast`s. */
export type NodeSpanMap = Map<NodeKey, Ast[]>
/** Maps from source ranges to `Token`s. */
export type TokenSpanMap = Map<TokenKey, Token>

/** Maps from source ranges to `Ast`s and `Token`s. */
export interface SpanMap {
  nodes: NodeSpanMap
  tokens: TokenSpanMap
}

/** Code with an associated mapping to `Ast` types. */
interface PrintedSource {
  info: SpanMap
  code: string
}

/** Generate an `IdMap` from a `SpanMap`. */
export function spanMapToIdMap(spans: SpanMap): IdMap {
  const idMap = new IdMap()
  for (const [key, token] of spans.tokens.entries()) {
    assert(isUuid(token.id))
    idMap.insertKnownId(sourceRangeFromKey(key), token.id)
  }
  for (const [key, asts] of spans.nodes.entries()) {
    for (const ast of asts) {
      assert(isUuid(ast.externalId))
      idMap.insertKnownId(sourceRangeFromKey(key), ast.externalId)
    }
  }
  return idMap
}

/** Given a `SpanMap`, return a function that can look up source ranges by AST ID. */
export function spanMapToSpanGetter(spans: SpanMap): (id: AstId) => SourceRange | undefined {
  const reverseMap = new Map<AstId, SourceRange>()
  for (const [key, asts] of spans.nodes) {
    for (const ast of asts) {
      reverseMap.set(ast.id, sourceRangeFromKey(key))
    }
  }
  return id => reverseMap.get(id)
}

/** Return stringification with associated ID map. This is only exported for testing. */
export function print(ast: Ast): PrintedSource {
  const info: SpanMap = {
    nodes: new Map(),
    tokens: new Map(),
  }
  const code = ast.printSubtree(info, 0, null)
  return { info, code }
}

/**
 * Used by `Ast.printSubtree`.
 * @internal
 */
export function printAst(
  ast: Ast,
  info: SpanMap,
  offset: number,
  parentIndent: string | null,
  verbatim: boolean = false,
): string {
  let code = ''
  let currentLineIndent = parentIndent
  let prevIsNewline = false
  let isFirstToken = offset === 0
  for (const child of ast.concreteChildren({ verbatim, indent: parentIndent })) {
    if (!isTokenId(child.node) && ast.module.get(child.node) === undefined) continue
    if (prevIsNewline) currentLineIndent = child.whitespace
    const token = isTokenId(child.node) ? ast.module.getToken(child.node) : undefined
    // Every line in a block starts with a newline token. In an AST produced by the parser, the newline token at the
    // first line of a module is zero-length. In order to handle whitespace correctly if the lines of a module are
    // rearranged, if a zero-length newline is encountered within a block, it is printed as an ordinary newline
    // character, and if an ordinary newline is found at the beginning of the output, it is not printed; however if the
    // output begins with a newline including a (plain) comment, we print the line as we would in any other block.
    if (
      token?.tokenType_ == RawAst.Token.Type.Newline &&
      isFirstToken &&
      (!token.code_ || token.code_ === '\n')
    ) {
      prevIsNewline = true
      isFirstToken = false
      continue
    }
    code += child.whitespace
    if (token) {
      const tokenStart = offset + code.length
      prevIsNewline = token.tokenType_ == RawAst.Token.Type.Newline
      let tokenCode = token.code_
      if (token.tokenType_ == RawAst.Token.Type.Newline) {
        tokenCode = tokenCode || '\n'
      }
      const span = tokenKey(tokenStart, tokenCode.length)
      info.tokens.set(span, token)
      code += tokenCode
    } else {
      assert(!isTokenId(child.node))
      prevIsNewline = false
      const childNode = ast.module.get(child.node)
      code += childNode.printSubtree(info, offset + code.length, currentLineIndent, verbatim)
      // Extra structural validation.
      assertEqual(childNode.id, child.node)
      if (parentId(childNode) !== ast.id) {
        console.error(`Inconsistent parent pointer (expected ${ast.id})`, childNode)
      }
      assertEqual(parentId(childNode), ast.id)
    }
    isFirstToken = false
  }
  // Adjustment to handle an edge case: A module starts with a zero-length newline token. If its first line is indented,
  // the initial whitespace belongs to the first line because it isn't hoisted past the (zero-length) newline to be the
  // leading whitespace for the block. In that case, our representation of the block contains leading whitespace at the
  // beginning, which must be excluded when calculating spans.
  const leadingWhitespace = code.match(/ */)?.[0].length ?? 0
  const span = nodeKey(offset + leadingWhitespace, code.length - leadingWhitespace)
  map.setIfUndefined(info.nodes, span, (): Ast[] => []).unshift(ast)
  return code
}

/** Parse the input as a complete module. */
export function parseModule(code: string, module?: MutableModule): Owned<MutableBodyBlock> {
  return parseModuleWithSpans(code, module).root
}

/** Parse the input as a body block, not the top level of a module. */
export function parseBlock(code: string, module?: MutableModule): Owned<MutableBodyBlock> {
  const tree = rawParseBlock(code)
  return abstract(module ?? MutableModule.Transient(), tree, code).root
}

/**
 * Parse the input as a statement. If it cannot be parsed as a statement (e.g. it is invalid or a block), returns
 * `undefined`.
 */
export function parseStatement(
  code: string,
  module?: MutableModule,
): Owned<MutableStatement> | undefined {
  const module_ = module ?? MutableModule.Transient()
  const ast = parseBlock(code, module)
  const soleStatement = tryGetSoleValue(ast.statements())
  if (!soleStatement) return
  const parent = parentId(soleStatement)
  if (parent) module_.delete(parent)
  soleStatement.fields.set('parent', undefined)
  return asOwned(soleStatement)
}

/**
 * Parse the input as an expression. If it cannot be parsed as an expression (e.g. it is a statement or block), returns
 * `undefined`.
 */
export function parseExpression(
  code: string,
  module?: MutableModule,
): Owned<MutableExpression> | undefined {
  const module_ = module ?? MutableModule.Transient()
  const ast = parseBlock(code, module)
  const soleStatement = tryGetSoleValue(ast.statements())
  if (!(soleStatement instanceof MutableExpressionStatement)) return undefined
  const expression = soleStatement.expression
  module_.delete(soleStatement.id)
  const parent = parentId(expression)
  if (parent) module_.delete(parent)
  expression.fields.set('parent', undefined)
  return asOwned(expression)
}

/** Parse a module, and return it along with a mapping from source locations to parsed objects. */
export function parseModuleWithSpans(
  code: string,
  module?: MutableModule | undefined,
): { root: Owned<MutableBodyBlock>; spans: SpanMap } {
  const tree = rawParseModule(code)
  return abstract(module ?? MutableModule.Transient(), tree, code)
}

/**
 * Parse the input, and apply the given `IdMap`. Return the parsed tree, the updated `IdMap`, the span map, and a
 *  mapping to the `RawAst` representation.
 */
export function parseExtended(code: string, idMap?: IdMap | undefined, inModule?: MutableModule) {
  const rawRoot = rawParseModule(code)
  const module = inModule ?? MutableModule.Transient()
  const { root, spans, toRaw } = module.transact(() => {
    const { root, spans, toRaw } = abstract(module, rawRoot, code)
    root.module.setRoot(root)
    if (idMap) setExternalIds(root.module, spans, idMap)
    return { root, spans, toRaw }
  })
  const getSpan = spanMapToSpanGetter(spans)
  const idMapOut = spanMapToIdMap(spans)
  return { root, idMap: idMapOut, getSpan, toRaw }
}

/** Return the number of `Ast`s in the tree, including the provided root. */
export function astCount(ast: Ast): number {
  let count = 0
  ast.visitRecursive(_subtree => {
    count += 1
  })
  return count
}

/**
 * Apply an `IdMap` to a module, using the given `SpanMap`.
 *  @returns The number of IDs that were assigned from the map.
 */
export function setExternalIds(edit: MutableModule, spans: SpanMap, ids: IdMap): number {
  let astsMatched = 0
  for (const [key, externalId] of ids.entries()) {
    const asts = spans.nodes.get(key as NodeKey)
    if (asts) {
      for (const ast of asts) {
        astsMatched += 1
        const editAst = edit.getVersion(ast)
        if (editAst.externalId !== externalId) editAst.setExternalId(externalId)
      }
    }
  }
  return astsMatched
}

/**
 * Try to find all the spans in `expected` in `encountered`. If any are missing, use the provided `code` to determine
 *  whether the lost spans are single-line or multi-line.
 */
function checkSpans(expected: NodeSpanMap, encountered: NodeSpanMap, code: string) {
  const lost = new Array<readonly [NodeKey, Ast]>()
  for (const [key, asts] of expected) {
    const outermostPrinted = asts[0]
    if (!outermostPrinted) continue
    for (let i = 1; i < asts.length; ++i) assertEqual(asts[i]?.parentId, asts[i - 1]?.id)
    const encounteredAsts = encountered.get(key)
    if (encounteredAsts === undefined) lost.push([key, outermostPrinted])
  }
  const lostInline = new Array<Ast>()
  const lostBlock = new Array<Ast>()
  for (const [key, ast] of lost) {
    const [start, end] = sourceRangeFromKey(key)
    // Do not report lost empty body blocks, we don't want them to be considered for repair.
    if (start === end && ast instanceof BodyBlock) continue
    ;(code.substring(start, end).match(/[\r\n]/) ? lostBlock : lostInline).push(ast)
  }
  return { lostInline, lostBlock }
}

/**
 * If the input tree's concrete syntax has precedence errors (i.e. its expected code would not parse back to the same
 *  structure), try to fix it. If possible, it will be repaired by inserting parentheses; if that doesn't fix it, the
 *  affected subtree will be re-synced to faithfully represent the source code the incorrect tree prints to.
 */
export function repair(
  root: BodyBlock,
  module?: MutableModule,
): { code: string; fixes: MutableModule | undefined } {
  // Print the input to see what spans its nodes expect to have in the output.
  const printed = print(root)
  // Parse the printed output to see what spans actually correspond to nodes in the printed code.
  const reparsed = parseModuleWithSpans(printed.code)
  // See if any span we expected to be a node isn't; if so, it likely merged with its parent due to wrong precedence.
  const { lostInline, lostBlock } = checkSpans(
    printed.info.nodes,
    reparsed.spans.nodes,
    printed.code,
  )
  if (lostInline.length === 0) {
    if (lostBlock.length !== 0) {
      console.warn(`repair: Bad block elements, but all inline elements OK?`)
      const fixes = module ?? root.module.edit()
      resync(lostBlock, printed.info.nodes, reparsed.spans.nodes, fixes)
      return { code: printed.code, fixes }
    }
    return { code: printed.code, fixes: undefined }
  }

  // Wrap any "lost" nodes in parentheses.
  const fixes = module ?? root.module.edit()
  for (const ast of lostInline) {
    if (ast instanceof Group) continue
    fixes.getVersion(ast).update(ast => Group.new(fixes, ast as any))
  }

  // Verify that it's fixed.
  const printed2 = print(fixes.root()!)
  const reparsed2 = parseModuleWithSpans(printed2.code)
  const { lostInline: lostInline2, lostBlock: lostBlock2 } = checkSpans(
    printed2.info.nodes,
    reparsed2.spans.nodes,
    printed2.code,
  )
  if (lostInline2.length !== 0 || lostBlock2.length !== 0)
    resync([...lostInline2, ...lostBlock2], printed2.info.nodes, reparsed2.spans.nodes, fixes)

  return { code: printed2.code, fixes }
}

/**
 * Replace subtrees in the module to ensure that the module contents are consistent with the module's code.
 * @param badAsts - ASTs that, if printed, would not parse to exactly their current content.
 * @param badSpans - Span map produced by printing the `badAsts` nodes and all their parents.
 * @param goodSpans - Span map produced by parsing the code from the module of `badAsts`.
 * @param edit - Module to apply the fixes to; must contain all ASTs in `badAsts`.
 */
function resync(
  badAsts: Iterable<Ast>,
  badSpans: NodeSpanMap,
  goodSpans: NodeSpanMap,
  edit: MutableModule,
) {
  const parentsOfBadSubtrees = new Set<AstId>()
  const badAstIds = new Set(Array.from(badAsts, ast => ast.id))
  for (const id of subtreeRoots(edit, badAstIds)) {
    const parent = edit.get(id)?.parentId
    if (parent) parentsOfBadSubtrees.add(parent)
  }

  const spanOfBadParent = new Array<readonly [AstId, NodeKey]>()
  for (const [span, asts] of badSpans) {
    for (const ast of asts) {
      if (parentsOfBadSubtrees.has(ast.id)) spanOfBadParent.push([ast.id, span])
    }
  }
  // All ASTs in the module of badAsts should have entries in badSpans.
  assertEqual(spanOfBadParent.length, parentsOfBadSubtrees.size)

  for (const [id, span] of spanOfBadParent) {
    const parent = edit.get(id)
    const goodAst = goodSpans.get(span)?.[0]
    // The parent of the root of a bad subtree must be a good AST.
    assertDefined(goodAst)
    parent.syncToCode(goodAst.code())
  }

  console.warn(
    `repair: Replaced ${parentsOfBadSubtrees.size} subtrees with their reparsed equivalents.`,
    parentsOfBadSubtrees,
  )
}

/**
 * Recursion helper for {@link syntaxHash}.
 * @internal
 */
function hashSubtreeSyntax(ast: Ast, hashesOut: Map<SyntaxHash, Ast[]>): SyntaxHash {
  let content = ''
  content += ast.typeName + ':'
  for (const child of ast.concreteChildren({ verbatim: false, indent: '' })) {
    content += child.whitespace ?? '?'
    if (isTokenId(child.node)) {
      content += 'Token:' + hashString(ast.module.getToken(child.node).code())
    } else {
      content += hashSubtreeSyntax(ast.module.get(child.node), hashesOut)
    }
  }
  const astHash = hashString(content)
  map.setIfUndefined(hashesOut, astHash, (): Ast[] => []).unshift(ast)
  return astHash
}

declare const brandHash: unique symbol
/** See {@link syntaxHash}. */
type SyntaxHash = string & { [brandHash]: never }
/** Applies the syntax-data hashing function to the input, and brands the result as a `SyntaxHash`. */
function hashString(input: string): SyntaxHash {
  return xxHash128(input) as SyntaxHash
}

/**
 * Calculates `SyntaxHash`es for the given node and all its children.
 *
 *  Each `SyntaxHash` summarizes the syntactic content of an AST. If two ASTs have the same code and were parsed the
 *  same way (i.e. one was not parsed in a context that resulted in a different interpretation), they will have the same
 *  hash. Note that the hash is invariant to metadata, including `externalId` assignments.
 */
function syntaxHash(root: Ast) {
  const hashes = new Map<SyntaxHash, Ast[]>()
  const rootHash = hashSubtreeSyntax(root, hashes)
  return { root: rootHash, hashes }
}

/** Update `ast` to match the given source code, while modifying it as little as possible. */
export function syncToCode(ast: MutableAst, code: string, metadataSource?: Module) {
  const codeBefore = ast.code()
  const textEdits = textChangeToEdits(codeBefore, code)
  applyTextEditsToAst(ast, textEdits, metadataSource ?? ast.module)
}

/** Find nodes in the input `ast` that should be treated as equivalents of nodes in `parsedRoot`. */
function calculateCorrespondence(
  ast: Ast,
  astSpans: NodeSpanMap,
  parsedRoot: Ast,
  parsedSpans: NodeSpanMap,
  textEdits: SourceRangeEdit[],
  codeAfter: string,
): Map<AstId, Ast> {
  const newSpans = new Map<AstId, SourceRange>()
  for (const [key, asts] of parsedSpans) {
    for (const ast of asts) newSpans.set(ast.id, sourceRangeFromKey(key))
  }

  // Retained-code matching: For each new tree, check for some old tree of the same type such that the new tree is the
  // smallest node to contain all characters of the old tree's code that were not deleted in the edit.
  //
  // If the new node's span exactly matches the retained code, add the match to `toSync`. If the new node's span
  // contains additional code, add the match to `candidates`.
  const toSync = new Map<AstId, Ast>()
  const candidates = new Map<AstId, Ast>()
  const allSpansBefore = Array.from(astSpans.keys(), sourceRangeFromKey)
  const spansBeforeAndAfter = applyTextEditsToSpans(textEdits, allSpansBefore).map(
    ([before, after]) => [before, trimEnd(after, codeAfter)] satisfies [any, any],
  )
  const partAfterToAstBefore = new Map<SourceRangeKey, Ast>()
  for (const [spanBefore, partAfter] of spansBeforeAndAfter) {
    const astBefore = astSpans.get(sourceRangeKey(spanBefore) as NodeKey)![0]!
    partAfterToAstBefore.set(sourceRangeKey(partAfter), astBefore)
  }
  const matchingPartsAfter = spansBeforeAndAfter.map(([_before, after]) => after)
  const parsedSpanTree = new AstWithSpans(parsedRoot, id => newSpans.get(id)!)
  const astsMatchingPartsAfter = enclosingSpans(parsedSpanTree, matchingPartsAfter)
  for (const [astAfter, partsAfter] of astsMatchingPartsAfter) {
    for (const partAfter of partsAfter) {
      const astBefore = partAfterToAstBefore.get(sourceRangeKey(partAfter))!
      if (astBefore.typeName() === astAfter.typeName()) {
        ;(rangeLength(newSpans.get(astAfter.id)!) === rangeLength(partAfter) ?
          toSync
        : candidates
        ).set(astBefore.id, astAfter)
        break
      }
    }
  }

  // Index the matched nodes.
  const oldIdsMatched = new Set<AstId>()
  const newIdsMatched = new Set<AstId>()
  for (const [oldId, newAst] of toSync) {
    oldIdsMatched.add(oldId)
    newIdsMatched.add(newAst.id)
  }

  // Movement matching: For each new tree that hasn't been matched, match it with any identical unmatched old tree.
  const newHashes = syntaxHash(parsedRoot).hashes
  const oldHashes = syntaxHash(ast).hashes
  for (const [hash, newAsts] of newHashes) {
    const unmatchedNewAsts = newAsts.filter(ast => !newIdsMatched.has(ast.id))
    const unmatchedOldAsts = oldHashes.get(hash)?.filter(ast => !oldIdsMatched.has(ast.id)) ?? []
    for (const [unmatchedNew, unmatchedOld] of zip(unmatchedNewAsts, unmatchedOldAsts)) {
      toSync.set(unmatchedOld.id, unmatchedNew)
      // Update the matched-IDs indices.
      oldIdsMatched.add(unmatchedOld.id)
      newIdsMatched.add(unmatchedNew.id)
    }
  }

  // Apply any non-optimal span matches from `candidates`, if the nodes involved were not matched during
  // movement-matching.
  for (const [beforeId, after] of candidates) {
    if (oldIdsMatched.has(beforeId) || newIdsMatched.has(after.id)) continue
    toSync.set(beforeId, after)
  }

  return toSync
}

/** Update `ast` according to changes to its corresponding source code. */
export function applyTextEditsToAst(
  ast: MutableAst,
  textEdits: SourceRangeEdit[],
  metadataSource: Module,
) {
  const printed = print(ast)
  const code = applyTextEdits(printed.code, textEdits)
  const astModuleRoot = ast.module.root()
  const rawParsedBlock =
    ast instanceof MutableBodyBlock && astModuleRoot && ast.is(astModuleRoot) ?
      rawParseModule(code)
    : rawParseBlock(code)
  const rawParsedStatement =
    ast instanceof MutableBodyBlock ? undefined : (
      tryGetSoleValue(rawParsedBlock.statements)?.expression
    )
  const rawParsedExpression =
    ast.isExpression() ?
      rawParsedStatement?.type === RawAst.Tree.Type.ExpressionStatement ?
        rawParsedStatement.expression
      : undefined
    : undefined
  const rawParsed = rawParsedExpression ?? rawParsedStatement ?? rawParsedBlock
  const parsed = abstract(ast.module, rawParsed, code)
  const toSync = calculateCorrespondence(
    ast,
    printed.info.nodes,
    parsed.root,
    parsed.spans.nodes,
    textEdits,
    code,
  )
  syncTree(ast, parsed.root, toSync, ast.module, metadataSource)
}

/** Replace `target` with `newContent`, reusing nodes according to the correspondence in `toSync`. */
function syncTree(
  target: Ast,
  newContent: Owned,
  toSync: Map<AstId, Ast>,
  edit: MutableModule,
  metadataSource: Module,
) {
  const newIdToEquivalent = new Map<AstId, AstId>()
  for (const [beforeId, after] of toSync) newIdToEquivalent.set(after.id, beforeId)
  const childReplacerFor = (parentId: AstId) => (id: AstId) => {
    const original = newIdToEquivalent.get(id)
    if (original) {
      const replacement = edit.get(original)
      if (replacement.parentId !== parentId) replacement.fields.set('parent', parentId)
      return original
    } else {
      const child = edit.get(id)
      if (child.parentId !== parentId) child.fields.set('parent', parentId)
    }
  }
  const parentId = target.fields.get('parent')
  assertDefined(parentId)
  const parent = edit.get(parentId)
  const targetSyncEquivalent = toSync.get(target.id)
  const syncRoot = targetSyncEquivalent?.id === newContent.id ? targetSyncEquivalent : undefined
  if (!syncRoot) {
    parent.replaceChild(target.id, newContent)
    newContent.fields.set('metadata', target.fields.get('metadata').clone())
    target.fields.get('metadata').set('externalId', newExternalId())
  }
  const newRoot = syncRoot ? target : newContent
  newRoot.visitRecursive(ast => {
    const syncFieldsFrom = toSync.get(ast.id)
    const editAst = edit.getVersion(ast)
    if (syncFieldsFrom) {
      const originalAssignmentExpression =
        ast instanceof Assignment ?
          metadataSource.get(ast.fields.get('expression').node)
        : undefined
      syncFields(edit.getVersion(ast), syncFieldsFrom, childReplacerFor(ast.id))
      if (editAst instanceof MutableAssignment && originalAssignmentExpression) {
        if (editAst.expression.externalId !== originalAssignmentExpression.externalId)
          editAst.expression.setExternalId(originalAssignmentExpression.externalId)
        syncNodeMetadata(
          editAst.expression.mutableNodeMetadata(),
          originalAssignmentExpression.nodeMetadata,
        )
      }
    } else {
      rewriteRefs(editAst, childReplacerFor(ast.id))
    }
    return true
  })
}

/** Provides a `SpanTree` view of an `Ast`, given span information. */
class AstWithSpans implements SpanTree<Ast> {
  private readonly ast: Ast
  private readonly getSpan: (astId: AstId) => SourceRange

  constructor(ast: Ast, getSpan: (astId: AstId) => SourceRange) {
    this.ast = ast
    this.getSpan = getSpan
  }

  id(): Ast {
    return this.ast
  }

  span(): SourceRange {
    return this.getSpan(this.ast.id)
  }

  *children(): IterableIterator<SpanTree<Ast>> {
    for (const child of this.ast.children()) {
      if (child instanceof Ast) yield new AstWithSpans(child, this.getSpan)
    }
  }
}
