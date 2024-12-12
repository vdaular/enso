/** @file Test copying, moving, cutting and pasting. */
import { expect, test, type Locator, type Page } from '@playwright/test'

import { TEXT, mockAllAndLogin } from './actions'

const NEW_NAME = 'foo bar baz'
const NEW_NAME_2 = 'foo bar baz quux'

/** Find the context menu. */
function locateContextMenu(page: Page) {
  // This has no identifying features.
  return page.getByTestId('context-menu')
}

/** Find the name column of the given assets table row. */
function locateAssetRowName(locator: Locator) {
  return locator.getByTestId('asset-row-name')
}

/** Find a tick button. */
function locateEditingTick(page: Locator) {
  return page.getByLabel(TEXT.confirmEdit)
}

/** Find a cross button. */
function locateEditingCross(page: Locator) {
  return page.getByLabel(TEXT.cancelEdit)
}

test('edit name (double click)', ({ page }) =>
  mockAllAndLogin({ page })
    .createFolder()
    .driveTable.withRows(async (rows, _, { api }) => {
      const row = rows.nth(0)
      const nameEl = locateAssetRowName(row)
      await nameEl.click()
      await nameEl.click()
      await nameEl.fill(NEW_NAME)
      const calls = api.trackCalls()
      await locateEditingTick(row).click()
      await expect(row).toHaveText(new RegExp('^' + NEW_NAME))
      expect(calls.updateDirectory).toMatchObject([{ title: NEW_NAME }])
    }))

test('edit name (context menu)', ({ page }) =>
  mockAllAndLogin({ page })
    .createFolder()
    .driveTable.withRows(async (rows, _, { api }) => {
      const row = rows.nth(0)
      await locateAssetRowName(row).click({ button: 'right' })
      await locateContextMenu(page)
        .getByText(/Rename/)
        .click()
      const nameEl = locateAssetRowName(row)
      await expect(nameEl).toBeVisible()
      await expect(nameEl).toBeFocused()
      await nameEl.fill(NEW_NAME)
      await expect(nameEl).toHaveValue(NEW_NAME)
      const calls = api.trackCalls()
      await nameEl.press('Enter')
      await expect(row).toHaveText(new RegExp('^' + NEW_NAME))
      expect(calls.updateDirectory).toMatchObject([{ title: NEW_NAME }])
    }))

test('edit name (keyboard)', ({ page }) =>
  mockAllAndLogin({ page })
    .createFolder()
    .driveTable.withRows(async (rows) => {
      await locateAssetRowName(rows.nth(0)).click()
    })
    .press('Mod+R')
    .driveTable.withRows(async (rows, _, { api }) => {
      const row = rows.nth(0)
      const nameEl = locateAssetRowName(row)
      await nameEl.fill(NEW_NAME_2)
      const calls = api.trackCalls()
      await nameEl.press('Enter')
      await expect(row).toHaveText(new RegExp('^' + NEW_NAME_2))
      expect(calls.updateDirectory).toMatchObject([{ title: NEW_NAME_2 }])
    }))

test('cancel editing name (double click)', ({ page }) =>
  mockAllAndLogin({ page })
    .createFolder()
    .driveTable.withRows(async (rows, _, { api }) => {
      const row = rows.nth(0)
      const nameEl = locateAssetRowName(row)
      const oldName = (await nameEl.textContent()) ?? ''
      await nameEl.click()
      await nameEl.click()
      await nameEl.fill(NEW_NAME)
      const calls = api.trackCalls()
      await locateEditingCross(row).click()
      await expect(row).toHaveText(new RegExp('^' + oldName))
      expect(calls.updateDirectory).toMatchObject([])
    }))

test('cancel editing name (keyboard)', ({ page }) => {
  let oldName = ''
  return mockAllAndLogin({ page })
    .createFolder()
    .driveTable.withRows(async (rows) => {
      await rows.nth(0).click()
    })
    .press('Mod+R')
    .driveTable.withRows(async (rows, _, { api }) => {
      const row = rows.nth(0)
      const nameEl = locateAssetRowName(row)
      oldName = (await nameEl.textContent()) ?? ''
      await nameEl.fill(NEW_NAME_2)
      const calls = api.trackCalls()
      await nameEl.press('Escape')
      await expect(row).toHaveText(new RegExp('^' + oldName))
      expect(calls.updateDirectory).toMatchObject([])
    })
})

test('change to blank name (double click)', ({ page }) =>
  mockAllAndLogin({ page })
    .createFolder()
    .driveTable.withRows(async (rows, _, { api }) => {
      const row = rows.nth(0)
      const nameEl = locateAssetRowName(row)
      const oldName = (await nameEl.textContent()) ?? ''
      await nameEl.click()
      await nameEl.click()
      await nameEl.fill('')
      await expect(locateEditingTick(row)).not.toBeVisible()
      const calls = api.trackCalls()
      await locateEditingCross(row).click()
      await expect(row).toHaveText(new RegExp('^' + oldName))
      expect(calls.updateDirectory).toMatchObject([])
    }))

test('change to blank name (keyboard)', ({ page }) =>
  mockAllAndLogin({ page })
    .createFolder()
    .driveTable.withRows(async (rows) => {
      await locateAssetRowName(rows.nth(0)).click()
    })
    .press('Mod+R')
    .driveTable.withRows(async (rows, _, { api }) => {
      const row = rows.nth(0)
      const nameEl = locateAssetRowName(row)
      const oldName = (await nameEl.textContent()) ?? ''
      await nameEl.fill('')
      const calls = api.trackCalls()
      await nameEl.press('Enter')
      await expect(row).toHaveText(new RegExp('^' + oldName))
      expect(calls.updateDirectory).toMatchObject([])
    }))
