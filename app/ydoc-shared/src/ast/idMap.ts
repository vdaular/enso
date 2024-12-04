import * as random from 'lib0/random'
import {
  type ExternalId,
  type SourceRange,
  type SourceRangeKey,
  IdMap,
  sourceRangeFromKey,
  sourceRangeKey,
} from '../yjsModel'
import { type Token } from './token'
import { type Ast, type AstId, ExpressionStatement } from './tree'

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

/** Create a new random {@link ExternalId}. */
export function newExternalId(): ExternalId {
  return random.uuidv4() as ExternalId
}

/** Generate an `IdMap` from a `SpanMap`. */
export function spanMapToIdMap(spans: SpanMap): IdMap {
  const idMap = new IdMap()
  for (const [key, token] of spans.tokens.entries()) {
    idMap.insertKnownId(sourceRangeFromKey(key), token.id)
  }
  for (const [key, asts] of spans.nodes.entries()) {
    for (const ast of asts) {
      if (ast instanceof ExpressionStatement && asts.length > 1) continue
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
