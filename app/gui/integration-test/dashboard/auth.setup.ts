import { test as setup } from '@playwright/test'
import path from 'node:path'
import * as actions from './actions'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const authFile = path.join(__dirname, '../../playwright/.auth/user.json')

setup('authenticate', ({ page }) => {
  setup.slow()
  return actions
    .mockAll({ page })
    .login()
    .do(async () => {
      await page.context().storageState({ path: authFile })
    })
})
