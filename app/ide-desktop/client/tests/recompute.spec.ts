/**
 * @file A test for `Write` button in the node menu – check that nodes do not write
 * to files unless specifically asked for.
 */

import { expect } from '@playwright/test'
import assert from 'node:assert'
import fs from 'node:fs/promises'
import pathModule from 'node:path'
import { electronTest, findMostRecentlyCreatedProject, loginAsTestUser } from './electronTest'

electronTest('Recompute', async ({ page, projectsDir }) => {
  await loginAsTestUser(page)
  await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New Project', exact: true }).click()
  await expect(page.locator('.GraphNode')).toHaveCount(1, { timeout: 60000 })

  // We see the node type and visualization, so the engine is running the program
  await expect(page.locator('.node-type')).toHaveText('Table', { timeout: 30000 })
  await expect(page.locator('.TableVisualization')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.TableVisualization')).toContainText('Welcome To Enso!')

  const OUTPUT_FILE = 'output.txt'
  const EXPECTED_OUTPUT = 'Some text'

  // Create first node (text literal)
  await page.locator('.PlusButton').click()
  await expect(page.locator('.ComponentBrowser')).toBeVisible()
  const input = page.locator('.ComponentBrowser input')
  await input.fill(`'${EXPECTED_OUTPUT}'`)
  await page.keyboard.press('Enter')
  await expect(page.locator('.GraphNode'), {}).toHaveCount(2)

  // Create second node (write)
  await page.keyboard.press('Enter')
  await expect(page.locator('.ComponentBrowser')).toBeVisible()
  const code = `write (enso_project.root / '${OUTPUT_FILE}') on_existing_file=..Append`
  await input.fill(code)
  await page.keyboard.press('Enter')
  await expect(page.locator('.GraphNode'), {}).toHaveCount(3)

  // Check that the output file is not created yet.
  const writeNode = page.locator('.GraphNode', { hasText: 'write' })
  await writeNode.click()
  await writeNode.getByRole('button', { name: 'Visualization' }).click()
  await expect(writeNode.locator('.TableVisualization')).toContainText('output_ensodryrun')

  const ourProject = await findMostRecentlyCreatedProject(projectsDir)
  expect(ourProject).not.toBeNull()
  assert(ourProject)
  expect(await listFiles(ourProject)).not.toContain(OUTPUT_FILE)

  // Press `Write once` button.
  await writeNode.locator('.More').click()
  await writeNode.getByTestId('recompute').click()

  // Check that the output file is created and contains expected text.
  await expect(writeNode.locator('.TableVisualization')).toContainText(OUTPUT_FILE)
  const projectFiles = await listFiles(ourProject)
  expect(projectFiles).toContain(OUTPUT_FILE)
  if (projectFiles.includes(OUTPUT_FILE)) {
    const content = await readFile(ourProject, OUTPUT_FILE)
    expect(content).toStrictEqual(EXPECTED_OUTPUT)
  }
})

async function listFiles(projectDir: string): Promise<string[]> {
  return await fs.readdir(projectDir)
}

async function readFile(projectDir: string, fileName: string): Promise<string> {
  return await fs.readFile(pathModule.join(projectDir, fileName), 'utf8')
}
