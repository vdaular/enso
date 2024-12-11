/** @file Test copying, moving, cutting and pasting. */
import { test } from '@playwright/test'

import * as actions from './actions'

test('edit name (double click)', async ({ page }) => {
  await actions.mockAllAndLogin({ page })
  const assetRows = actions.locateAssetRows(page)
  const row = assetRows.nth(0)
  const newName = 'foo bar baz'

  await actions.locateNewFolderIcon(page).click()
  await actions.locateAssetRowName(row).click()
  await actions.locateAssetRowName(row).click()
  await actions.locateAssetRowName(row).fill(newName)
  await actions.locateEditingTick(row).click()
  await test.expect(row).toHaveText(new RegExp('^' + newName))
})

test('edit name (context menu)', async ({ page }) => {
  await actions.mockAllAndLogin({
    page,
    setupAPI: (api) => {
      api.addAsset(api.createDirectory({ title: 'foo' }))
    },
  })

  const assetRows = actions.locateAssetRows(page)
  const row = assetRows.nth(0)
  const newName = 'foo bar baz'

  await actions.locateAssetRowName(row).click({ button: 'right' })
  await actions
    .locateContextMenu(page)
    .getByText(/Rename/)
    .click()

  const input = page.getByTestId('asset-row-name')

  await test.expect(input).toBeVisible()
  await test.expect(input).toBeFocused()

  await input.fill(newName)

  await test.expect(input).toHaveValue(newName)

  await input.press('Enter')

  await test.expect(row).toHaveText(new RegExp('^' + newName))
})

test('edit name (keyboard)', async ({ page }) => {
  await actions.mockAllAndLogin({ page })

  const assetRows = actions.locateAssetRows(page)
  const row = assetRows.nth(0)
  const newName = 'foo bar baz quux'

  await actions.locateNewFolderIcon(page).click()
  await actions.locateAssetRowName(row).click()
  await actions.press(page, 'Mod+R')
  await actions.locateAssetRowName(row).fill(newName)
  await actions.locateAssetRowName(row).press('Enter')
  await test.expect(row).toHaveText(new RegExp('^' + newName))
})

test('cancel editing name (double click)', async ({ page }) => {
  await actions.mockAllAndLogin({ page })

  const assetRows = actions.locateAssetRows(page)
  const row = assetRows.nth(0)
  const newName = 'foo bar baz'

  await actions.locateNewFolderIcon(page).click()
  const oldName = (await actions.locateAssetRowName(row).textContent()) ?? ''
  await actions.locateAssetRowName(row).click()
  await actions.locateAssetRowName(row).click()

  await actions.locateAssetRowName(row).fill(newName)
  await actions.locateEditingCross(row).click()
  await test.expect(row).toHaveText(new RegExp('^' + oldName))
})

test('cancel editing name (keyboard)', async ({ page }) => {
  await actions.mockAllAndLogin({ page })

  const assetRows = actions.locateAssetRows(page)
  const row = assetRows.nth(0)
  const newName = 'foo bar baz quux'

  await actions.locateNewFolderIcon(page).click()
  const oldName = (await actions.locateAssetRowName(row).textContent()) ?? ''
  await actions.locateAssetRowName(row).click()
  await actions.press(page, 'Mod+R')
  await actions.locateAssetRowName(row).fill(newName)
  await actions.locateAssetRowName(row).press('Escape')
  await test.expect(row).toHaveText(new RegExp('^' + oldName))
})

test('change to blank name (double click)', async ({ page }) => {
  await actions.mockAllAndLogin({ page })

  const assetRows = actions.locateAssetRows(page)
  const row = assetRows.nth(0)

  await actions.locateNewFolderIcon(page).click()
  const oldName = (await actions.locateAssetRowName(row).textContent()) ?? ''
  await actions.locateAssetRowName(row).click()
  await actions.locateAssetRowName(row).click()
  await actions.locateAssetRowName(row).fill('')
  await test.expect(actions.locateEditingTick(row)).not.toBeVisible()
  await actions.locateEditingCross(row).click()
  await test.expect(row).toHaveText(new RegExp('^' + oldName))
})

test('change to blank name (keyboard)', async ({ page }) => {
  await actions.mockAllAndLogin({ page })

  const assetRows = actions.locateAssetRows(page)
  const row = assetRows.nth(0)

  await actions.locateNewFolderIcon(page).click()
  const oldName = (await actions.locateAssetRowName(row).textContent()) ?? ''
  await actions.locateAssetRowName(row).click()
  await actions.press(page, 'Mod+R')
  await actions.locateAssetRowName(row).fill('')
  await actions.locateAssetRowName(row).press('Enter')
  await test.expect(row).toHaveText(new RegExp('^' + oldName))
})
