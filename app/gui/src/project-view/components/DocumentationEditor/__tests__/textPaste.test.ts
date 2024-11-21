import { transformPastedText } from '@/components/DocumentationEditor/textPaste'
import { expect, test } from 'vitest'

test.each([
  {
    clipboard: '',
  },
  {
    clipboard: 'Text without links',
  },
  {
    clipboard: 'example.com',
    inserted: '<https://example.com>',
  },
  {
    clipboard: 'http://example.com',
    inserted: '<http://example.com>',
  },
  {
    clipboard: 'Complete URL: http://example.com',
    inserted: 'Complete URL: <http://example.com>',
  },
  {
    clipboard: 'example.com/Address containing spaces and a < character',
    inserted: '<https://example.com/Address containing spaces and a %3C character>',
  },
  {
    clipboard: 'example.com/Address resembling *bold syntax*',
    inserted: '<https://example.com/Address resembling %2Abold syntax%2A>',
  },
  {
    clipboard: 'Url: www.a.example.com, another: www.b.example.com',
    inserted: 'Url: <https://www.a.example.com>, another: <https://www.b.example.com>',
  },
  {
    clipboard: 'gopher:///no/autolinking/unusual/protocols',
  },
  {
    clipboard: '/',
  },
  {
    clipboard: '//',
  },
  {
    clipboard: 'nodomain',
  },
  {
    clipboard: '/relative',
  },
  {
    clipboard: 'Sentence.',
  },
  {
    clipboard: 'example.com with trailing text',
  },
])('Auto-linking pasted text: $clipboard', ({ clipboard, inserted }) => {
  expect(transformPastedText(clipboard)).toBe(inserted ?? clipboard)
})
