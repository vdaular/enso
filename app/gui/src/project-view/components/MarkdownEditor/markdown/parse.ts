import { markdown as baseMarkdown, markdownLanguage } from '@codemirror/lang-markdown'
import type { Extension } from '@codemirror/state'
import type { Tree } from '@lezer/common'
import type { BlockContext, BlockParser, Line, MarkdownParser, NodeSpec } from '@lezer/markdown'
import { Element } from '@lezer/markdown'
import { assertDefined } from 'ydoc-shared/util/assert'

/**
 * Enso Markdown extension. Differences from CodeMirror's base Markdown extension:
 * - It defines the flavor of Markdown supported in Enso documentation. Currently, this is mostly CommonMark except we
 *   don't support setext headings. Planned features include support for some GFM extensions.
 * - Many of the parsers differ from the `@lezer/markdown` parsers in their treatment of whitespace, in order to support
 *   a rendering mode where markup (and some associated spacing) is hidden.
 */
export function markdown(): Extension {
  return baseMarkdown({
    base: markdownLanguage,
    extensions: [
      {
        parseBlock: [headerParser, bulletList, orderedList, blockquoteParser, disableSetextHeading],
        defineNodes: [blockquoteNode],
      },
    ],
  })
}

function getType({ parser }: { parser: MarkdownParser }, name: string) {
  const ty = parser.nodeSet.types.find((ty) => ty.name === name)
  assertDefined(ty)
  return ty.id
}

/** Parser override to include the space in the delimiter. */
const headerParser: BlockParser = {
  name: 'ATXHeading',
  parse: (cx, line) => {
    let size = isAtxHeading(line)
    if (size < 0) return false
    const level = size
    // If the character after the hashes is a space, treat it as part of the `HeaderMark`.
    if (isSpace(line.text.charCodeAt(size))) size += 1
    const off = line.pos
    const from = cx.lineStart + off
    // Trailing spaces at EOL
    const endOfSpace = skipSpaceBack(line.text, line.text.length, off)
    let after = endOfSpace
    // Trailing sequence of # (before EOL spaces)
    while (after > off && line.text.charCodeAt(after - 1) == line.next) after--
    if (after == endOfSpace || after == off || !isSpace(line.text.charCodeAt(after - 1)))
      after = line.text.length
    const headerMark = getType(cx, 'HeaderMark')
    const buf = cx.buffer
      .write(headerMark, 0, size)
      .writeElements(cx.parser.parseInline(line.text.slice(off + size, after), from + size), -from)
    if (after < line.text.length) buf.write(headerMark, after - off, endOfSpace - off)
    const node = buf.finish(getType(cx, `ATXHeading${level}`), line.text.length - off)
    cx.nextLine()
    cx.addNode(node, from)
    return true
  },
}

/** Parser override to include the space in the delimiter. */
const bulletList: BlockParser = {
  name: 'BulletList',
  parse: (cx, line) => {
    const size = isBulletList(line, cx, false)
    if (size < 0) return false
    const length = size + (isSpace(line.text.charCodeAt(line.pos + 1)) ? 1 : 0)
    const bulletList = getType(cx, 'BulletList')
    if (cx.block.type != bulletList) cx.startContext(bulletList, line.basePos, line.next)
    const newBase = getListIndent(line, line.pos + 1)
    cx.startContext(getType(cx, 'ListItem'), line.basePos, newBase - line.baseIndent)
    cx.addNode(getType(cx, 'ListMark'), cx.lineStart + line.pos, cx.lineStart + line.pos + length)
    line.moveBaseColumn(newBase)
    return null
  },
}

/** Parser override to include the space in the delimiter. */
const orderedList: BlockParser = {
  name: 'OrderedList',
  parse: (cx, line) => {
    const size = isOrderedList(line, cx, false)
    if (size < 0) return false
    const orderedList = getType(cx, 'OrderedList')
    if (cx.block.type != orderedList)
      cx.startContext(orderedList, line.basePos, line.text.charCodeAt(line.pos + size - 1))
    const newBase = getListIndent(line, line.pos + size)
    cx.startContext(getType(cx, 'ListItem'), line.basePos, newBase - line.baseIndent)
    cx.addNode(getType(cx, 'ListMark'), cx.lineStart + line.pos, cx.lineStart + line.pos + size)
    line.moveBaseColumn(newBase)
    return null
  },
}

const ENSO_BLOCKQUOTE_TYPE = 'EnsoBlockquote'

/** Parser override to include the space in the delimiter. */
const blockquoteParser: BlockParser = {
  name: ENSO_BLOCKQUOTE_TYPE,
  parse: (cx, line) => {
    const size = isBlockquote(line)
    if (size < 0) return false
    const type = getType(cx, ENSO_BLOCKQUOTE_TYPE)
    cx.startContext(type, line.pos)
    cx.addNode(getType(cx, 'QuoteMark'), cx.lineStart + line.pos, cx.lineStart + line.pos + size)
    line.moveBase(line.pos + size)
    return null
  },
  before: 'Blockquote',
}

/**
 * Replaces setext heading parser with a parser that never matches.
 *
 * When starting a bulleted list, the `SetextHeading` parser can match when a `-` has been typed and a following space
 * hasn't been entered yet; the resulting style changes are distracting. To prevent this, we don't support setext
 * headings; ATX headings seem to be much more popular anyway.
 */
const disableSetextHeading: BlockParser = {
  name: 'SetextHeading',
  parse: () => false,
}

const blockquoteNode: NodeSpec = {
  name: ENSO_BLOCKQUOTE_TYPE,
  block: true,
  composite: (cx, line) => {
    if (line.next != 62 /* '>' */) return false
    const size = isSpace(line.text.charCodeAt(line.pos + 1)) ? 2 : 1
    line.addMarker(
      elt(getType(cx, 'QuoteMark'), cx.lineStart + line.pos, cx.lineStart + line.pos + size),
    )
    line.moveBase(line.pos + size)
    //bl.end = cx.lineStart + line.text.length
    return true
  },
}

function elt(type: number, from: number, to: number): Element {
  return new (Element as any)(type, from, to)
}

function isBlockquote(line: Line) {
  return (
    line.next != 62 /* '>' */ ? -1
    : line.text.charCodeAt(line.pos + 1) == 32 ? 2
    : 1
  )
}

function isBulletList(line: Line, cx: BlockContext, breaking: boolean) {
  return (
      (line.next == 45 || line.next == 43 || line.next == 42) /* '-+*' */ &&
        (line.pos == line.text.length - 1 || isSpace(line.text.charCodeAt(line.pos + 1))) &&
        (!breaking || inList(cx, 'BulletList') || line.skipSpace(line.pos + 2) < line.text.length)
    ) ?
      1
    : -1
}

function isOrderedList(line: Line, cx: BlockContext, breaking: boolean) {
  let pos = line.pos
  let next = line.next
  for (;;) {
    if (next >= 48 && next <= 57 /* '0-9' */) pos++
    else break
    if (pos == line.text.length) return -1
    next = line.text.charCodeAt(pos)
  }
  if (
    pos == line.pos ||
    pos > line.pos + 9 ||
    (next != 46 && next != 41) /* '.)' */ ||
    (pos < line.text.length - 1 && !isSpace(line.text.charCodeAt(pos + 1))) ||
    (breaking &&
      !inList(cx, 'OrderedList') &&
      (line.skipSpace(pos + 1) == line.text.length ||
        pos > line.pos + 1 ||
        line.next != 49)) /* '1' */
  )
    return -1
  return pos + 1 - line.pos
}

function inList(cx: BlockContext, typeName: string) {
  const type = getType(cx, typeName)
  for (let i = cx.stack.length - 1; i >= 0; i--) if (cx.stack[i]!.type == type) return true
  return false
}

function getListIndent(line: Line, pos: number) {
  const indentAfter = line.countIndent(pos, line.pos, line.indent)
  const indented = line.countIndent(line.skipSpace(pos), pos, indentAfter)
  return indented >= indentAfter + 5 ? indentAfter + 1 : indented
}

// === Debugging ===

/** Represents the structure of a @{link Tree} in a JSON-compatible format. */
export interface DebugTree {
  /** The name of the {@link NodeType} */
  name: string
  children: DebugTree[]
}

// noinspection JSUnusedGlobalSymbols
/** @returns A debug representation of the provided {@link Tree} */
export function debugTree(tree: Tree): DebugTree {
  const cursor = tree.cursor()
  let current: DebugTree[] = []
  const stack: DebugTree[][] = []
  cursor.iterate(
    (node) => {
      const children: DebugTree[] = []
      current.push({
        name: node.name,
        children,
      })
      stack.push(current)
      current = children
    },
    () => (current = stack.pop()!),
  )
  return current[0]!
}

// === Helpers ===

function skipSpaceBack(line: string, i: number, to: number) {
  while (i > to && isSpace(line.charCodeAt(i - 1))) i--
  return i
}

/** Returns the number of hash marks at the beginning of the line, or -1 if it is not in the range [1, 6] */
function isAtxHeading(line: Line) {
  if (line.next != 35 /* '#' */) return -1
  let pos = line.pos + 1
  while (pos < line.text.length && line.text.charCodeAt(pos) == 35) pos++
  if (pos < line.text.length && line.text.charCodeAt(pos) != 32) return -1
  const size = pos - line.pos
  return size > 6 ? -1 : size
}

function isSpace(ch: number) {
  return ch == 32 || ch == 9 || ch == 10 || ch == 13
}
