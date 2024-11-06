import { describe, expect, test } from 'vitest'
import { assert } from '../../util/assert'
import { MutableModule } from '../mutableModule'
import { parseBlock, parseModule, parseStatement } from '../parse'
import { MutableAssignment, MutableExpressionStatement, MutableFunctionDef } from '../tree'

test.each([
  { code: '## Simple\nnode', documentation: 'Simple' },
  {
    code: '## Preferred indent\n   2nd line\n   3rd line\nnode',
    documentation: 'Preferred indent\n2nd line\n3rd line',
  },
  {
    code: '## Extra-indented child\n 2nd line\n   3rd line\nnode',
    documentation: 'Extra-indented child\n2nd line\n3rd line',
    normalized: '## Extra-indented child\n   2nd line\n   3rd line\nnode',
  },
  {
    code: '## Extra-indented child, beyond 4th column\n 2nd line\n        3rd line\nnode',
    documentation: 'Extra-indented child, beyond 4th column\n2nd line\n    3rd line',
    normalized: '## Extra-indented child, beyond 4th column\n   2nd line\n       3rd line\nnode',
  },
  {
    code: '##Preferred indent, no initial space\n  2nd line\n  3rd line\nnode',
    documentation: 'Preferred indent, no initial space\n2nd line\n3rd line',
    normalized: '## Preferred indent, no initial space\n   2nd line\n   3rd line\nnode',
  },
  {
    code: '## Minimum indent\n 2nd line\n 3rd line\nnode',
    documentation: 'Minimum indent\n2nd line\n3rd line',
    normalized: '## Minimum indent\n   2nd line\n   3rd line\nnode',
  },
])('Documentation edit round-trip: $code', docCase => {
  const { code, documentation } = docCase
  const parsed = parseStatement(code)!
  const parsedDocumentation = parsed.documentationText()
  expect(parsedDocumentation).toBe(documentation)
  const edited = MutableModule.Transient().copy(parsed)
  assert('setDocumentationText' in edited)
  edited.setDocumentationText(parsedDocumentation)
  expect(edited.code()).toBe(docCase.normalized ?? code)
})

test.each([
  '## Some documentation\nf x = 123',
  '## Some documentation\n    and a second line\nf x = 123',
  '## Some documentation## Another documentation??\nf x = 123',
])('Finding documentation: $code', code => {
  const block = parseBlock(code)
  const method = [...block.statements()][0]
  assert(method instanceof MutableFunctionDef)
  expect(method.documentationText()).toBeTruthy()
})

test.each([
  {
    code: '## Already documented\nf x = 123',
    expected: '## Already documented\nf x = 123',
  },
  {
    code: 'f x = 123',
    expected: '##\nf x = 123',
  },
])('Adding documentation: $code', ({ code, expected }) => {
  const block = parseBlock(code)
  const method = [...block.statements()][0]
  assert(method instanceof MutableFunctionDef)
  if (method.documentationText() === undefined) method.setDocumentationText('')
  expect(block.code()).toBe(expected)
})

test('Creating comments', () => {
  const block = parseBlock('2 + 2')
  block.module.setRoot(block)
  const statement = [...block.statements()][0]
  assert(statement instanceof MutableExpressionStatement)
  const docText = 'Calculate five'
  statement.setDocumentationText(docText)
  expect(statement.module.root()?.code()).toBe(`## ${docText}\n2 + 2`)
})

test('Creating comments: indented', () => {
  const topLevel = parseModule('main =\n    x = 1')
  topLevel.module.setRoot(topLevel)
  const main = [...topLevel.statements()][0]
  assert(main instanceof MutableFunctionDef)
  const statement = [...main.bodyAsBlock().statements()][0]
  assert(statement instanceof MutableAssignment)
  const docText = 'The smallest natural number'
  statement.setDocumentationText(docText)
  expect(statement.module.root()?.code()).toBe(`main =\n    ## ${docText}\n    x = 1`)
})

describe('Markdown documentation', () => {
  const cases = [
    {
      source: '## My function',
      markdown: 'My function',
    },
    {
      source: '## My function\n\n   Second paragraph',
      markdown: 'My function\nSecond paragraph',
    },
    {
      source: '## My function\n\n\n   Second paragraph after extra gap',
      markdown: 'My function\n\nSecond paragraph after extra gap',
    },
    {
      source: '## My function\n   with one hard-wrapped paragraph',
      markdown: 'My function with one hard-wrapped paragraph',
      normalized: '## My function with one hard-wrapped paragraph',
    },
    {
      source: '## ICON group\n   My function with an icon',
      markdown: 'ICON group\nMy function with an icon',
    },
    {
      source: [
        '## This paragraph is hard-wrapped because it its contents are very very very very long,',
        'and such long long lines can be inconvenient to work with in most text editors',
        'because no one likes to scroll horizontally',
        'but if it is edited the reprinted version will be hard-wrapped differently,',
        'because apparently someone has gone and wrapped their source code in a manner',
        'not conforming to the Enso syntax specification',
        'which requires line length not to exceed 100 characters.',
      ].join('\n   '),
      markdown: [
        'This paragraph is hard-wrapped because it its contents are very very very very long,',
        'and such long long lines can be inconvenient to work with in most text editors',
        'because no one likes to scroll horizontally',
        'but if it is edited the reprinted version will be hard-wrapped differently,',
        'because apparently someone has gone and wrapped their source code in a manner',
        'not conforming to the Enso syntax specification',
        'which requires line length not to exceed 100 characters.',
      ].join(' '),
      normalized: [
        '## This paragraph is hard-wrapped because it its contents are very very very very long, and such',
        'long long lines can be inconvenient to work with in most text editors because no one likes to',
        'scroll horizontally but if it is edited the reprinted version will be hard-wrapped differently,',
        'because apparently someone has gone and wrapped their source code in a manner not conforming to',
        'the Enso syntax specification which requires line length not to exceed 100 characters.',
      ].join(' '), // TODO: This should be '\n   ' when hard-wrapping is implemented.
    },
  ]

  test.each(cases)('Enso source comments to markdown', ({ source, markdown }) => {
    const moduleSource = `${source}\nmain =\n    x = 1`
    const topLevel = parseModule(moduleSource)
    topLevel.module.setRoot(topLevel)
    const main = [...topLevel.statements()][0]
    assert(main instanceof MutableFunctionDef)
    expect(main.mutableDocumentationMarkdown().toJSON()).toBe(markdown)
  })

  test.each(cases)('Markdown to Enso source', ({ source, markdown, normalized }) => {
    const functionCode = 'main =\n    x = 1'
    const topLevel = parseModule(functionCode)
    topLevel.module.setRoot(topLevel)
    const main = [...topLevel.statements()][0]
    assert(main instanceof MutableFunctionDef)
    const markdownYText = main.mutableDocumentationMarkdown()
    expect(markdownYText.toJSON()).toBe('')
    markdownYText.insert(0, markdown)
    expect(topLevel.code()).toBe((normalized ?? source) + '\n' + functionCode)
  })

  test.each(cases)('Unedited comments printed verbatim', ({ source, normalized }) => {
    if (normalized == null) return
    const functionCode = `main =\n    x = 1`
    const moduleSource = source + '\n' + functionCode
    const topLevel = parseModule(moduleSource)
    expect(topLevel.code()).not.toBe(normalized + '\n' + functionCode)
    expect(topLevel.code()).toBe(moduleSource)
  })

  test.each(cases)('Editing different comments with syncToCode', ({ source }) => {
    const functionCode = (docs: string) => `${docs}\nmain =\n    x = 1`
    const moduleOriginalSource = functionCode(source)
    const topLevel = parseModule(moduleOriginalSource)
    topLevel.module.setRoot(topLevel)
    assert(topLevel.code() === moduleOriginalSource)
    const moduleEditedSource = functionCode('Some new docs')
    topLevel.syncToCode(moduleEditedSource)
    expect(topLevel.code()).toBe(moduleEditedSource)
  })

  test.each(cases)('Setting comments to different content with syncToCode', ({ source }) => {
    const functionCode = (docs: string) => `${docs}\nmain =\n    x = 1`
    const moduleOriginalSource = functionCode('## Original docs')
    const topLevel = parseModule(moduleOriginalSource)
    const module = topLevel.module
    module.setRoot(topLevel)
    assert(module.root()?.code() === moduleOriginalSource)
    const moduleEditedSource = functionCode(source)
    module.syncToCode(moduleEditedSource)
    expect(module.root()?.code()).toBe(moduleEditedSource)
  })

  test('Setting empty markdown content removes comment', () => {
    const functionCodeWithoutDocs = `main =\n    x = 1`
    const originalSourceWithDocComment = '## Some docs\n' + functionCodeWithoutDocs
    const topLevel = parseModule(originalSourceWithDocComment)
    expect(topLevel.code()).toBe(originalSourceWithDocComment)

    const main = [...topLevel.statements()][0]
    assert(main instanceof MutableFunctionDef)
    const markdownYText = main.mutableDocumentationMarkdown()
    markdownYText.delete(0, markdownYText.length)
    expect(topLevel.code()).toBe(functionCodeWithoutDocs)
  })
})
