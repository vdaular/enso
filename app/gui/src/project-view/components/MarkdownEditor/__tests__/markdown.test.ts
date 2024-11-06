import { ensoMarkdown } from '@/components/MarkdownEditor/markdown'
import { EditorState } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { expect, test } from 'vitest'

function decorations<T>(
  source: string,
  recognize: (from: number, to: number, decoration: Decoration) => T | undefined,
) {
  const vueHost = {
    register: () => ({ unregister: () => {} }),
  }
  const state = EditorState.create({
    doc: source,
    extensions: [ensoMarkdown({ vueHost })],
  })
  const view = new EditorView({ state })
  const decorationSets = state.facet(EditorView.decorations)
  const results = []
  for (const decorationSet of decorationSets) {
    const resolvedDecorations =
      decorationSet instanceof Function ? decorationSet(view) : decorationSet
    const cursor = resolvedDecorations.iter()
    while (cursor.value != null) {
      const recognized = recognize(cursor.from, cursor.to, cursor.value)
      if (recognized) results.push(recognized)
      cursor.next()
    }
  }
  return results
}

function links(source: string) {
  return decorations(source, (from, to, deco) => {
    if (deco.spec.tagName === 'a') {
      return {
        text: source.substring(from, to),
        href: deco.spec.attributes.href,
      }
    }
  })
}

function images(source: string) {
  return decorations(source, (from, to, deco) => {
    if ('widget' in deco.spec && 'props' in deco.spec.widget && 'src' in deco.spec.widget.props) {
      return {
        from,
        to,
        src: deco.spec.widget.props.src,
        alt: deco.spec.widget.props.alt,
      }
    }
  })
}

test.each([
  {
    markdown: '[Link text](https://www.example.com/index.html)',
    expectedLinks: [
      {
        text: 'Link text',
        href: 'https://www.example.com/index.html',
      },
    ],
  },
  {
    markdown: '[Unclosed url](https://www.example.com/index.html',
    expectedLinks: [],
  },
  {
    markdown: '[](https://www.example.com/index.html)',
    expectedLinks: [],
  },
  {
    markdown: '[With empty URL]()',
    expectedLinks: [],
  },
  {
    markdown: '[With no URL]',
    expectedLinks: [],
  },
  {
    markdown: '[Unclosed',
    expectedLinks: [],
  },
])('Link decoration: $markdown', ({ markdown, expectedLinks }) => {
  expect(links(markdown)).toEqual(expectedLinks)
  expect(images(markdown)).toEqual([])
})

test.each([
  {
    markdown: '![Image](https://www.example.com/image.avif)',
    image: {
      src: 'https://www.example.com/image.avif',
      alt: 'Image',
    },
  },
  {
    markdown: '![](https://www.example.com/image.avif)',
    image: {
      src: 'https://www.example.com/image.avif',
      alt: '',
    },
  },
  {
    markdown: '![Image](https://www.example.com/image.avif',
    image: null,
  },
  {
    markdown: '![Image]()',
    image: null,
  },
  {
    markdown: '![Image]',
    image: null,
  },
  {
    markdown: '![Image',
    image: null,
  },
])('Image decoration: $markdown', ({ markdown, image }) => {
  expect(links(markdown)).toEqual([])
  expect(images(markdown)).toEqual(
    image == null ?
      []
    : [
        {
          from: markdown.length,
          to: markdown.length,
          src: image.src,
          alt: image.alt,
        },
      ],
  )
})
