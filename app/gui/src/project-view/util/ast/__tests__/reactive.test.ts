import { Ast } from '@/util/ast'
import { reactiveModule } from '@/util/ast/reactive'
import { expect, test } from 'vitest'
import { nextTick, watchEffect } from 'vue'
import * as Y from 'yjs'

test('Module reactivity: applyEdit', async () => {
  const beforeEdit = Ast.parseBlock('func arg1 arg2')
  beforeEdit.module.setRoot(beforeEdit)

  const module = reactiveModule(new Y.Doc(), () => {})
  module.applyEdit(beforeEdit.module)
  expect(module.root()!.code()).toBe(beforeEdit.code())

  const app2 = (
    (module.root() as Ast.MutableBodyBlock).lines[0]!.statement!
      .node as Ast.MutableExpressionStatement
  ).expression as unknown as Ast.App
  let app2Code: string | undefined = undefined
  watchEffect(() => (app2Code = app2.argument.code()))
  expect(app2Code).toBe('arg2')

  const edit = beforeEdit.module.edit()
  const editApp2 = (
    edit.getVersion(beforeEdit).lines[0]!.statement!.node as Ast.MutableExpressionStatement
  ).expression as Ast.MutableApp
  const newArg = Ast.Ident.tryParse('newArg', edit)
  expect(newArg).toBeDefined()
  editApp2.setArgument(newArg!)
  const codeAfterEdit = 'func arg1 newArg'
  expect(edit.root()!.code()).toBe(codeAfterEdit)

  module.applyEdit(edit)
  expect(app2Code).toBe('arg2')
  await nextTick()
  expect(app2Code).toBe('newArg')
})

test('Module reactivity: Direct Edit', async () => {
  const beforeEdit = Ast.parseExpression('func arg1 arg2')
  beforeEdit.module.setRoot(beforeEdit)

  const module = reactiveModule(new Y.Doc(), () => {})
  module.applyEdit(beforeEdit.module)
  expect(module.root()!.code()).toBe(beforeEdit.code())

  const app2 = module.root() as unknown as Ast.MutableApp
  let app2Code: string | undefined = undefined
  watchEffect(() => (app2Code = app2.argument.code()))
  expect(app2Code).toBe('arg2')

  app2.setArgument(Ast.Ident.tryParse('newArg', module)!)
  const codeAfterEdit = 'func arg1 newArg'
  expect(module.root()!.code()).toBe(codeAfterEdit)

  expect(app2Code).toBe('arg2')
  await nextTick()
  expect(app2Code).toBe('newArg')
})

test('Module reactivity: Tracking access to ancestors', async () => {
  const beforeEdit = Ast.parseModule('main = 23\nother = f')
  beforeEdit.module.setRoot(beforeEdit)

  const module = reactiveModule(new Y.Doc(), () => {})
  module.applyEdit(beforeEdit.module)
  expect(module.root()!.code()).toBe(beforeEdit.code())

  const block = module.root() as any as Ast.BodyBlock

  const [func, otherFunc] = block.statements() as [Ast.Function, Ast.Function]
  expect(func.name.code()).toBe('main')
  expect(otherFunc.name.code()).toBe('other')
  const expression = Array.from(func.bodyExpressions())[0]!
  expect(expression.code()).toBe('23')
  const otherExpression = Array.from(otherFunc.bodyExpressions())[0]!
  expect(otherExpression.code()).toBe('f')

  let parentAccesses = 0
  watchEffect(() => {
    expect(expression.parent()).toBeDefined()
    parentAccesses += 1
  })
  expect(parentAccesses).toBe(1)

  const edit = beforeEdit.module.edit()
  const taken = edit.getVersion(expression).replaceValue(Ast.parseExpression('replacement', edit))
  edit.getVersion(otherExpression).updateValue((oe) => Ast.App.positional(oe, taken, edit))
  module.applyEdit(edit)

  expect(module.root()?.code()).toBe('main = replacement\nother = f 23')
  expect(parentAccesses).toBe(1)
  await nextTick()
  expect(parentAccesses).toBe(2)
})
