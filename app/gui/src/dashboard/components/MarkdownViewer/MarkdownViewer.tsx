/** @file A WYSIWYG editor using Lexical.js. */

import { useSuspenseQuery } from '@tanstack/react-query'
import type { RendererObject } from 'marked'
import { marked } from 'marked'
import { useMemo } from 'react'
import { BUTTON_STYLES, TEXT_STYLE } from '../AriaComponents'

/** Props for a {@link MarkdownViewer}. */
export interface MarkdownViewerProps {
  /** Markdown markup to parse and display. */
  readonly text: string
  readonly imgUrlResolver: (relativePath: string) => Promise<string>
  readonly renderer?: RendererObject
}

const defaultRenderer: RendererObject = {
  /** The renderer for headings. */
  heading({ depth, tokens }) {
    return `<h${depth} class="${TEXT_STYLE({ variant: 'h1', className: 'my-2' })}">${this.parser.parseInline(tokens)}</h${depth}>`
  },
  /** The renderer for paragraphs. */
  paragraph({ tokens }) {
    return `<p class="${TEXT_STYLE({ variant: 'body', className: 'my-1' })}">${this.parser.parseInline(tokens)}</p>`
  },
  /** The renderer for list items. */
  listitem({ tokens }) {
    return `<li class="${TEXT_STYLE({ variant: 'body' })}">${this.parser.parseInline(tokens)}</li>`
  },
  /** The renderer for lists. */
  list({ items }) {
    return `<ul class="my-1 list-disc pl-3">${items.map((item) => this.listitem(item)).join('\n')}</ul>`
  },
  /** The renderer for links. */
  link({ href, tokens }) {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="${BUTTON_STYLES({ variant: 'link' }).base()}">${this.parser.parseInline(tokens)}</a>`
  },
  /** The renderer for images. */
  image({ href, title }) {
    return `<img src="${href}" alt="${title}" class="my-1 h-auto max-w-full" />`
  },
  /** The renderer for code. */
  code({ text }) {
    return `<code class="block my-1 p-2 bg-primary/5 rounded-lg max-w-full overflow-auto max-h-48" >
      <pre class="${TEXT_STYLE({ variant: 'body-sm' })}">${text}</pre>
    </code>`
  },
  /** The renderer for blockquotes. */
  blockquote({ tokens }) {
    return `<blockquote class="${'relative my-1 pl-2 before:bg-primary/20 before:absolute before:left-0 before:top-0 before:h-full before:w-[1.5px] before:rounded-full'}">${this.parser.parse(tokens)}</blockquote>`
  },
}

/**
 * Markdown viewer component.
 * Parses markdown passed in as a `text` prop into HTML and displays it.
 */
export function MarkdownViewer(props: MarkdownViewerProps) {
  const { text, imgUrlResolver, renderer = defaultRenderer } = props

  const markedInstance = useMemo(
    () => marked.use({ renderer: Object.assign({}, defaultRenderer, renderer), async: true }),
    [renderer],
  )

  const { data: markdownToHtml } = useSuspenseQuery({
    queryKey: ['markdownToHtml', { text }],
    queryFn: () =>
      markedInstance.parse(text, {
        async: true,
        walkTokens: async (token) => {
          if (token.type === 'image' && 'href' in token && typeof token.href === 'string') {
            token.href = await imgUrlResolver(token.href)
          }
        },
      }),
  })

  // eslint-disable-next-line @typescript-eslint/naming-convention
  return <div className="select-text" dangerouslySetInnerHTML={{ __html: markdownToHtml }} />
}
