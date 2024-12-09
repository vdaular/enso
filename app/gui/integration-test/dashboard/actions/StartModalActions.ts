/** @file Actions for the "home" page. */
import * as test from '@playwright/test'
import * as actions from '.'
import BaseActions from './BaseActions'
import EditorPageActions from './EditorPageActions'

// =========================
// === StartModalActions ===
// =========================

/** Actions for the "start" modal. */
export default class StartModalActions extends BaseActions {
  /** Close this modal and go back to the Drive page. */
  async close() {
    const isOnScreen = await this.isStartModalShown()

    if (isOnScreen) {
      return test.test.step('Close start modal', async () => {
        await this.locateStartModal().getByTestId('close-button').click()
      })
    }
  }

  /** Locate the "start" modal. */
  locateStartModal() {
    return this.page.getByTestId('start-modal')
  }

  /**
   * Check if the Asset Panel is shown.
   */
  isStartModalShown() {
    return this.locateStartModal()
      .isHidden()
      .then(
        (result) => !result,
        () => false,
      )
  }

  /** Create a project from the template at the given index. */
  createProjectFromTemplate(index: number) {
    return this.step(`Create project from template #${index}`, (page) =>
      actions
        .locateSamples(page)
        .nth(index + 1)
        .click(),
    ).into(EditorPageActions)
  }
}
