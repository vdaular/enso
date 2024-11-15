import { test as setup } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import * as actions from './actions'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const authFile = path.join(__dirname, '../../playwright/.auth/user.json')
const isProd = process.env.NODE_ENV === 'production'

const isFileExists = () => {
  if (isProd) {
    return false
  }

  return existsSync(authFile)
}

setup('authenticate', ({ page }) => {
  if (isFileExists()) {
    return setup.skip()
  }

  return actions
    .mockAll({ page })
    .login()
    .do(async () => {
      await page.context().storageState({ path: authFile })
    })
})
