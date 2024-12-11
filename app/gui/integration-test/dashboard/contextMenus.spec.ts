/** @file Test the drive view. */
import * as test from '@playwright/test'

import { COLORS } from 'enso-common/src/services/Backend'
import * as actions from './actions'

const LABEL_NAME = 'aaaa'

test.test('drive view', ({ page }) =>
  actions
    .mockAllAndLogin({
      page,
      setupAPI: (api) => {
        api.addLabel(LABEL_NAME, COLORS[0])
      },
    })
    .driveTable.expectPlaceholderRow()
    .withDriveView(async (view) => {
      await view.click({ button: 'right' })
    })
    .do(async (thePage) => {
      await test.expect(actions.locateContextMenu(thePage)).toHaveCount(1)
    })
    .press('Escape')
    .do(async (thePage) => {
      await test.expect(actions.locateContextMenu(thePage)).toHaveCount(0)
    })
    .createFolder()
    .driveTable.withRows(async (rows, _, thePage) => {
      await actions.locateLabelsPanelLabels(page, LABEL_NAME).dragTo(rows.nth(0))
      await actions.locateAssetLabels(thePage).first().click({ button: 'right' })
      await test.expect(actions.locateContextMenu(thePage)).toHaveCount(1)
    })
    .press('Escape')
    .do(async (thePage) => {
      await test.expect(actions.locateContextMenu(thePage)).toHaveCount(0)
    }),
)
