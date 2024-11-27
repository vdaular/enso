/** @file Test the login flow. */
import * as test from '@playwright/test'

import * as actions from './actions'

// =============
// === Tests ===
// =============

// Reset storage state for this file to avoid being authenticated
test.test.use({ storageState: { cookies: [], origins: [] } })

test.test('login and logout', ({ page }) =>
  actions
    .mockAll({ page })
    .login()
    .do(async (thePage) => {
      await test.expect(actions.locateDriveView(thePage)).toBeVisible()
      await test.expect(actions.locateLoginButton(thePage)).not.toBeVisible()
    })
    .openUserMenu()
    .userMenu.logout()
    .do(async (thePage) => {
      await test.expect(actions.locateDriveView(thePage)).not.toBeVisible()
      await test.expect(actions.locateLoginButton(thePage)).toBeVisible()
    }),
)
