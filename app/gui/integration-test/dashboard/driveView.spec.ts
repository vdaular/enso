/** @file Test the drive view. */
import * as test from '@playwright/test'

import * as actions from './actions'

test.test('drive view', ({ page }) =>
  actions
    .mockAllAndLogin({ page })
    .withDriveView(async (view) => {
      await test.expect(view).toBeVisible()
    })
    .driveTable.expectPlaceholderRow()
    .newEmptyProject()
    // FIXME[sb]: https://github.com/enso-org/cloud-v2/issues/1615
    // Uncomment once cloud execution in the browser is re-enabled.
    // .do(async () => {
    //   await test.expect(actions.locateEditor(page)).toBeAttached()
    // })
    // .goToPage.drive()
    .driveTable.withRows(async (rows) => {
      await test.expect(rows).toHaveCount(1)
    })
    .do(async () => {
      await test.expect(actions.locateAssetsTable(page)).toBeVisible()
    })
    .newEmptyProject()
    // FIXME[sb]: https://github.com/enso-org/cloud-v2/issues/1615
    // Uncomment once cloud execution in the browser is re-enabled.
    // .do(async () => {
    //   await test.expect(actions.locateEditor(page)).toBeAttached()
    // })
    // .goToPage.drive()
    .driveTable.withRows(async (rows) => {
      await test.expect(rows).toHaveCount(2)
    })
    // FIXME[sb]: https://github.com/enso-org/cloud-v2/issues/1615
    // Uncomment once cloud execution in the browser is re-enabled.
    // // The last opened project needs to be stopped, to remove the toast notification notifying the
    // // user that project creation may take a while. Previously opened projects are stopped when the
    // // new project is created.
    // .driveTable.withRows(async (rows) => {
    //   await actions.locateStopProjectButton(rows.nth(1)).click()
    // })
    // Project context menu
    .driveTable.rightClickRow(0)
    .contextMenu.moveNonFolderToTrash()
    .driveTable.withRows(async (rows) => {
      await test.expect(rows).toHaveCount(1)
    }),
)
