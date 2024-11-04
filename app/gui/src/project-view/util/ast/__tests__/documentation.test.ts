import { assert } from '@/util/assert'
import { Ast } from '@/util/ast'
import { test } from '@fast-check/vitest'
import { expect } from 'vitest'

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
])('Documentation edit round-trip: $code', (docCase) => {
  const { code, documentation } = docCase
  const parsed = Ast.parseStatement(code)!
  const parsedDocumentation = parsed.documentationText()
  expect(parsedDocumentation).toBe(documentation)
  const edited = Ast.MutableModule.Transient().copy(parsed)
  assert('setDocumentationText' in edited)
  edited.setDocumentationText(parsedDocumentation)
  expect(edited.code()).toBe(docCase.normalized ?? code)
})

test.each([
  '## Some documentation\nf x = 123',
  '## Some documentation\n    and a second line\nf x = 123',
  '## Some documentation## Another documentation??\nf x = 123',
])('Finding documentation: $code', (code) => {
  const block = Ast.parseBlock(code)
  const method = Ast.findModuleMethod(block, 'f')!.statement
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
  const block = Ast.parseBlock(code)
  const module = block.module
  const method = module.getVersion(Ast.findModuleMethod(block, 'f')!.statement)
  if (method.documentationText() === undefined) {
    method.setDocumentationText('')
  }
  expect(block.code()).toBe(expected)
})

test('Creating comments', () => {
  const block = Ast.parseBlock('2 + 2')
  block.module.setRoot(block)
  const statement = [...block.statements()][0]! as Ast.MutableExpressionStatement
  const docText = 'Calculate five'
  statement.setDocumentationText(docText)
  expect(statement.module.root()?.code()).toBe(`## ${docText}\n2 + 2`)
})

test('Creating comments: indented', () => {
  const block = Ast.parseBlock('main =\n    x = 1')
  const module = block.module
  module.setRoot(block)
  const main = module.getVersion(Ast.findModuleMethod(block, 'main')!.statement)
  const statement = [...main.bodyAsBlock().statements()][0]! as Ast.MutableAssignment
  const docText = 'The smallest natural number'
  statement.setDocumentationText(docText)
  expect(statement.module.root()?.code()).toBe(`main =\n    ## ${docText}\n    x = 1`)
})
