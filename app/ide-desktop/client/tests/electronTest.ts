/** @file Commonly used functions for electron tests */

import { _electron, expect, type Page, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import pathModule from 'node:path'

const LOADING_TIMEOUT = 10000

/**
 * Tests run on electron executable.
 *
 * Similar to playwright's test, but launches electron, and passes Page of the main window.
 */
export function electronTest(
  name: string,
  body: (args: { page: Page; projectsDir: string }) => Promise<void> | void,
) {
  test(name, async () => {
    const app = await _electron.launch({
      executablePath: process.env.ENSO_TEST_EXEC_PATH ?? '',
      args: process.env.ENSO_TEST_APP_ARGS != null ? process.env.ENSO_TEST_APP_ARGS.split(',') : [],
      env: { ...process.env, ['ENSO_TEST']: name },
    })
    const page = await app.firstWindow()
    // Wait until page will be finally loaded: we expect login screen.
    // There's bigger timeout, because the page may load longer on CI machines.
    await expect(page.getByText('Login to your account')).toBeVisible({ timeout: LOADING_TIMEOUT })
    const projectsDir = pathModule.join(os.tmpdir(), 'enso-test-projects', name)
    await body({ page, projectsDir })
    await app.close()
  })
}

/**
 * Login as test user. This function asserts that page is the login page, and uses
 * credentials from ENSO_TEST_USER and ENSO_TEST_USER_PASSWORD env variables.
 */
export async function loginAsTestUser(page: Page) {
  // Login screen
  await expect(page.getByRole('textbox', { name: 'email' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'password' })).toBeVisible()
  if (process.env.ENSO_TEST_USER == null || process.env.ENSO_TEST_USER_PASSWORD == null) {
    throw Error(
      'Cannot log in; `ENSO_TEST_USER` and `ENSO_TEST_USER_PASSWORD` env variables are not provided',
    )
  }
  await page.getByRole('textbox', { name: 'email' }).click()
  await page.keyboard.insertText(process.env.ENSO_TEST_USER)
  await page.keyboard.press('Tab')
  await page.keyboard.insertText(process.env.ENSO_TEST_USER_PASSWORD)
  await page.keyboard.press('Enter')

  // Accept terms screen
  await expect(page.getByText('I agree')).toHaveCount(2)
  await expect(page.getByRole('button')).toHaveCount(1)
  for (const checkbox of await page.getByText('I agree').all()) {
    await checkbox.click()
  }
  await page.getByRole('button').click()
}

/**
 * Find the most recently edited Enso project in `projectsDir` and return its absolute path.
 * There can be multiple projects, as the directory can be reused by subsequent test runs.
 * We precisely know the naming schema for new projects, and we use this knowledge to
 * find the project that was created most recently.
 */
export async function findMostRecentlyCreatedProject(projectsDir: string): Promise<string | null> {
  const dirContent = await fs.readdir(projectsDir)
  const sorted = dirContent.sort((a, b) => {
    // Project names always end with a number, so we can sort them by that number.
    const numA = parseInt(a.match(/\d+/)![0], 10)
    const numB = parseInt(b.match(/\d+/)![0], 10)
    return numA - numB
  })
  const last = sorted.pop()
  return last != null ? pathModule.join(projectsDir, last) : null
}
