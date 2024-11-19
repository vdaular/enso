/** @file Private lezer-markdown symbols used by lezer-markdown parsers we have customized versions of. */

import { Tree, TreeBuffer } from '@lezer/common'
import { Element } from '@lezer/markdown'

declare module '@lezer/markdown' {
  export interface BlockContext {
    block: CompositeBlock
    stack: CompositeBlock[]
    readonly buffer: Buffer

    addNode: (block: number | Tree, from: number, to?: number) => void
    startContext: (type: number, start: number, value?: number) => void
  }

  export interface CompositeBlock {
    readonly type: number
    // Used for indentation in list items, markup character in lists
    readonly value: number
    readonly from: number
    readonly hash: number
    end: number
    readonly children: (Tree | TreeBuffer)[]
    readonly positions: number[]
  }

  export interface Buffer {
    content: number[]
    nodes: Tree[]

    write: (type: number, from: number, to: number, children?: number) => Buffer
    writeElements: (elts: readonly Element[], offset?: number) => Buffer
    finish: (type: number, length: number) => Tree
  }

  export interface InlineDelimiter {
    readonly type: DelimiterType
    readonly from: number
    readonly to: number
    side: Mark
  }

  export interface InlineContext {
    parts: (Element | InlineDelimiter | null)[]
  }
}
