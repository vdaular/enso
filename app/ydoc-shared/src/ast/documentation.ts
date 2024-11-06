import { LINE_BOUNDARIES } from 'enso-common/src/utilities/data/string'
import { xxHash128 } from './ffi'
import type { ConcreteChild, RawConcreteChild } from './print'
import { ensureUnspaced, firstChild, preferUnspaced, unspaced } from './print'
import { Token, TokenType } from './token'
import type { ConcreteRefs, DeepReadonly, DocLine, TextToken } from './tree'

/** Render a documentation line to concrete tokens. */
export function* docLineToConcrete(
  docLine: DeepReadonly<DocLine>,
  indent: string | null,
): IterableIterator<RawConcreteChild> {
  yield firstChild(docLine.docs.open)
  let prevType = undefined
  let extraIndent = ''
  for (const { token } of docLine.docs.elements) {
    if (token.node.tokenType_ === TokenType.Newline) {
      yield ensureUnspaced(token, false)
    } else {
      if (prevType === TokenType.Newline) {
        yield { whitespace: indent + extraIndent, node: token.node }
      } else {
        if (prevType === undefined) {
          const leadingSpace = token.node.code_.match(/ */)
          extraIndent = '  ' + (leadingSpace ? leadingSpace[0] : '')
        }
        yield { whitespace: '', node: token.node }
      }
    }
    prevType = token.node.tokenType_
  }
  for (const newline of docLine.newlines) yield preferUnspaced(newline)
}

/**
 * Render function documentation to concrete tokens. If the `markdown` content has the same value as when `docLine` was
 * parsed (as indicated by `hash`), the `docLine` will be used (preserving concrete formatting). If it is different, the
 * `markdown` text will be converted to source tokens.
 */
export function functionDocsToConcrete(
  markdown: string,
  hash: string | undefined,
  docLine: DeepReadonly<DocLine> | undefined,
  indent: string | null,
): IterableIterator<RawConcreteChild> | undefined {
  return (
    hash && docLine && xxHash128(markdown) === hash ? docLineToConcrete(docLine, indent)
    : markdown ? yTextToTokens(markdown, (indent || '') + '   ')
    : undefined
  )
}

/**
 * Given Enso documentation comment tokens, returns a model of their Markdown content. This model abstracts away details
 * such as the locations of line breaks that are not paragraph breaks (e.g. lone newlines denoting hard-wrapping of the
 * source code).
 */
export function abstractMarkdown(elements: undefined | TextToken<ConcreteRefs>[]) {
  let markdown = ''
  let newlines = 0
  let readingTags = true
  let elidedNewline = false
  ;(elements ?? []).forEach(({ token: { node } }, i) => {
    if (node.tokenType_ === TokenType.Newline) {
      if (readingTags || newlines > 0) {
        markdown += '\n'
        elidedNewline = false
      } else {
        elidedNewline = true
      }
      newlines += 1
    } else {
      let nodeCode = node.code()
      if (i === 0) nodeCode = nodeCode.trimStart()
      if (elidedNewline) markdown += ' '
      markdown += nodeCode
      newlines = 0
      if (readingTags) {
        if (!nodeCode.startsWith('ICON ')) {
          readingTags = false
        }
      }
    }
  })
  const hash = xxHash128(markdown)
  return { markdown, hash }
}

// TODO: Paragraphs should be hard-wrapped to fit within the column limit, but this requires:
//  - Recognizing block elements other than paragraphs; we must not split non-paragraph elements.
//  - Recognizing inline elements; some cannot be split (e.g. links), while some can be broken into two (e.g. bold).
//    If we break inline elements, we must also combine them when encountered during parsing.
const ENABLE_INCOMPLETE_WORD_WRAP_SUPPORT = false

function* yTextToTokens(yText: string, indent: string): IterableIterator<ConcreteChild<Token>> {
  yield unspaced(Token.new('##', TokenType.TextStart))
  const lines = yText.split(LINE_BOUNDARIES)
  let printingTags = true
  for (const [i, value] of lines.entries()) {
    if (i) {
      yield unspaced(Token.new('\n', TokenType.Newline))
      if (value && !printingTags) yield unspaced(Token.new('\n', TokenType.Newline))
    }
    printingTags = printingTags && value.startsWith('ICON ')
    let offset = 0
    while (offset < value.length) {
      if (offset !== 0) yield unspaced(Token.new('\n', TokenType.Newline))
      let wrappedLineEnd = value.length
      let printableOffset = offset
      if (i !== 0) {
        while (printableOffset < value.length && value[printableOffset] === ' ')
          printableOffset += 1
      }
      if (ENABLE_INCOMPLETE_WORD_WRAP_SUPPORT && !printingTags) {
        const ENSO_SOURCE_MAX_COLUMNS = 100
        const MIN_DOC_COLUMNS = 40
        const availableWidth = Math.max(
          ENSO_SOURCE_MAX_COLUMNS - indent.length - (i === 0 && offset === 0 ? '## '.length : 0),
          MIN_DOC_COLUMNS,
        )
        if (availableWidth < wrappedLineEnd - printableOffset) {
          const wrapIndex = value.lastIndexOf(' ', printableOffset + availableWidth)
          if (printableOffset < wrapIndex) {
            wrappedLineEnd = wrapIndex
          }
        }
      }
      while (printableOffset < value.length && value[printableOffset] === ' ') printableOffset += 1
      const whitespace = i === 0 && offset === 0 ? ' ' : indent
      const wrappedLine = value.substring(printableOffset, wrappedLineEnd)
      yield { whitespace, node: Token.new(wrappedLine, TokenType.TextSection) }
      offset = wrappedLineEnd
    }
  }
  yield unspaced(Token.new('\n', TokenType.Newline))
}
