import test from 'playwright/test'
import * as actions from './actions'
import { expect } from './customExpect'
import { CONTROL_KEY } from './keyboard'
import * as locate from './locate'

test('Edit comment by click', async ({ page }) => {
  await actions.goToGraph(page)
  const nodeComment = locate.nodeComment(locate.graphNodeByBinding(page, 'final'))
  await expect(nodeComment).toHaveText('This node can be entered')

  await nodeComment.click()
  await page.keyboard.press(`${CONTROL_KEY}+A`)
  const NEW_COMMENT = 'New comment text'
  await nodeComment.fill(NEW_COMMENT)
  await page.keyboard.press(`Enter`)
  await expect(nodeComment).not.toBeFocused()
  await expect(nodeComment).toHaveText(NEW_COMMENT)
})

test('Start editing comment via menu', async ({ page }) => {
  await actions.goToGraph(page)
  const node = locate.graphNodeByBinding(page, 'final')
  await node.click()
  await locate.circularMenu(node).getByRole('button', { name: 'More' }).click()
  await locate.circularMenu(node).getByRole('button', { name: 'Comment' }).click()
  await expect(locate.nodeComment(node)).toBeFocused()
})

test('Start editing comment via context menu', async ({ page }) => {
  await actions.goToGraph(page)
  const node = locate.graphNodeByBinding(page, 'final')
  await node.click({ button: 'right' })
  await page.getByRole('button', { name: 'Add Comment' }).click()
  await expect(locate.nodeComment(node)).toBeFocused()
})

test('Start editing comment via context menu when multiple components initially selected', async ({
  page,
}) => {
  await actions.goToGraph(page)
  const otherNode = locate.graphNodeByBinding(page, 'sum')
  await otherNode.click()
  const node = locate.graphNodeByBinding(page, 'final')
  await node.click({ modifiers: ['Shift'] })
  const anotherNode = locate.graphNodeByBinding(page, 'list')
  await anotherNode.click({ modifiers: ['Shift'] })
  await node.click({ button: 'right' })
  await expect(locate.selectedNodes(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Add Comment' }).click()
  await expect(locate.selectedNodes(page)).toHaveCount(1)
  await expect(locate.nodeComment(node)).toBeFocused()
})

test('Add new comment via menu', async ({ page }) => {
  await actions.goToGraph(page)
  const INITIAL_NODE_COMMENTS = 1
  await expect(locate.nodeComment(page)).toHaveCount(INITIAL_NODE_COMMENTS)
  const node = locate.graphNodeByBinding(page, 'data')
  const nodeComment = locate.nodeComment(node)

  await node.click()
  await locate.circularMenu(node).getByRole('button', { name: 'More' }).click()
  await locate.circularMenu(node).getByRole('button', { name: 'Comment' }).click()
  await expect(locate.nodeComment(node)).toBeFocused()
  const NEW_COMMENT = 'New comment text'
  await nodeComment.fill(NEW_COMMENT)
  await page.keyboard.press(`Enter`)
  await expect(nodeComment).not.toBeFocused()
  await expect(nodeComment).toHaveText(NEW_COMMENT)
  await expect(locate.nodeComment(page)).toHaveCount(INITIAL_NODE_COMMENTS + 1)
})

test('Delete comment by clearing text', async ({ page }) => {
  await actions.goToGraph(page)
  const nodeComment = locate.nodeComment(locate.graphNodeByBinding(page, 'final'))
  await expect(nodeComment).toHaveText('This node can be entered')

  await nodeComment.click()
  await page.keyboard.press(`${CONTROL_KEY}+A`)
  await page.keyboard.press(`Delete`)
  await page.keyboard.press(`Enter`)
  await expect(nodeComment).not.toExist()
})

test('URL added to comment is rendered as link', async ({ page }) => {
  await actions.goToGraph(page)
  const nodeComment = locate.nodeComment(locate.graphNodeByBinding(page, 'final'))
  await expect(nodeComment).toHaveText('This node can be entered')
  await expect(nodeComment.locator('a')).not.toExist()

  await nodeComment.click()
  await page.keyboard.press(`${CONTROL_KEY}+A`)
  const NEW_COMMENT = "Here's a URL: https://example.com"
  await nodeComment.fill(NEW_COMMENT)
  await page.keyboard.press(`Enter`)
  await expect(nodeComment).not.toBeFocused()
  await expect(nodeComment).toHaveText(NEW_COMMENT)
  await expect(nodeComment.locator('a')).toHaveCount(1)
})
