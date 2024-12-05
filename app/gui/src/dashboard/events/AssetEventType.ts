/** @file Possible types of asset state change. */

// ======================
// === AssetEventType ===
// ======================

/** Possible types of asset state change. */
enum AssetEventType {
  move = 'move',
  delete = 'delete',
  deleteForever = 'delete-forever',
  restore = 'restore',
  download = 'download',
  downloadSelected = 'download-selected',
  removeSelf = 'remove-self',
  temporarilyAddLabels = 'temporarily-add-labels',
  temporarilyRemoveLabels = 'temporarily-remove-labels',
  addLabels = 'add-labels',
  removeLabels = 'remove-labels',
}

export default AssetEventType
