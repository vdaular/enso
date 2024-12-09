import { test as setup } from '@playwright/test'
import fs from 'node:fs'
import * as actions from './actions'

setup('authenticate', ({ page }) => {
  const authFilePath = actions.getAuthFilePath()
  setup.skip(fs.existsSync(authFilePath), 'Already authenticated')

  return actions.mockAllAndLogin({ page })
})
