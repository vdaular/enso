import type { GraphStore } from '@/stores/graph'
import { Annotation, ChangeSet, type ChangeSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { createDebouncer } from 'lib0/eventloop'
import { onUnmounted } from 'vue'
import { MutableModule } from 'ydoc-shared/ast'
import { SourceRangeEdit, textChangeToEdits } from 'ydoc-shared/util/data/text'
import type { Origin } from 'ydoc-shared/yjsModel'

function changeSetToTextEdits(changes: ChangeSet) {
  const textEdits = new Array<SourceRangeEdit>()
  changes.iterChanges((from, to, _fromB, _toB, insert) =>
    textEdits.push({ range: [from, to], insert: insert.toString() }),
  )
  return textEdits
}

function textEditToChangeSpec({ range: [from, to], insert }: SourceRangeEdit): ChangeSpec {
  return { from, to, insert }
}

// Indicates a change updating the text to correspond to the given module state.
const synchronizedModule = Annotation.define<MutableModule>()

/** @returns A CodeMirror Extension that synchronizes the editor state with the AST of an Enso module. */
export function useEnsoSourceSync(
  graphStore: Pick<GraphStore, 'moduleSource' | 'viewModule' | 'startEdit' | 'commitEdit'>,
  editorView: EditorView,
) {
  let pendingChanges: ChangeSet | undefined
  let currentModule: MutableModule | undefined

  const debounceUpdates = createDebouncer(0)
  const updateListener = EditorView.updateListener.of((update) => {
    for (const transaction of update.transactions) {
      const newModule = transaction.annotation(synchronizedModule)
      if (newModule) {
        // Flush the pipeline of edits that were based on the old module.
        commitPendingChanges()
        currentModule = newModule
      } else if (transaction.docChanged && currentModule) {
        pendingChanges =
          pendingChanges ? pendingChanges.compose(transaction.changes) : transaction.changes
        // Defer the update until after pending events have been processed, so that if changes are arriving faster
        // than we would be able to apply them individually we coalesce them to keep up.
        debounceUpdates(commitPendingChanges)
      }
    }
  })

  /** Set the editor contents the current module state, discarding any pending editor-initiated changes. */
  function resetView() {
    pendingChanges = undefined
    currentModule = undefined
    const viewText = editorView.state.doc.toString()
    const code = graphStore.moduleSource.text
    const changes = textChangeToEdits(viewText, code).map(textEditToChangeSpec)
    console.info('Resetting the editor to the module code.', changes)
    editorView.dispatch({
      changes,
      annotations: synchronizedModule.of(graphStore.startEdit()),
    })
  }

  function checkSync() {
    const code = graphStore.viewModule.root()?.code() ?? ''
    const viewText = editorView.state.doc.toString()
    const uncommitted = textChangeToEdits(code, viewText).map(textEditToChangeSpec)
    if (uncommitted.length > 0) {
      console.warn(`Module source was not synced to editor content\n${code}`, uncommitted)
    }
  }

  /** Apply any pending changes to the currently-synchronized module, clearing the set of pending changes. */
  function commitPendingChanges() {
    if (!pendingChanges || !currentModule) return
    const changes = pendingChanges
    pendingChanges = undefined
    const edits = changeSetToTextEdits(changes)
    try {
      currentModule.applyTextEdits(edits, graphStore.viewModule)
      graphStore.commitEdit(currentModule, undefined, 'local:userAction:CodeEditor')
      checkSync()
    } catch (error) {
      console.error(`Code Editor failed to modify module`, error)
      resetView()
    }
  }

  let needResync = false
  function observeSourceChange(textEdits: readonly SourceRangeEdit[], origin: Origin | undefined) {
    // If we received an update from outside the Code Editor while the editor contained uncommitted changes, we cannot
    // proceed incrementally; we wait for the changes to be merged as Y.Js AST updates, and then set the view to the
    // resulting code.
    if (needResync) {
      if (!pendingChanges) {
        resetView()
        needResync = false
      }
      return
    }
    // When we aren't in the `needResync` state, we can ignore updates that originated in the Code Editor.
    if (origin === 'local:userAction:CodeEditor') {
      return
    }
    if (pendingChanges) {
      console.info(`Deferring update (editor dirty).`)
      needResync = true
      return
    }

    // If none of the above exit-conditions were reached, the transaction is applicable to our current state.
    editorView.dispatch({
      changes: textEdits.map(textEditToChangeSpec),
      annotations: synchronizedModule.of(graphStore.startEdit()),
    })
  }
  onUnmounted(() => graphStore.moduleSource.unobserve(observeSourceChange))
  return {
    updateListener,
    connectModuleListener: () => graphStore.moduleSource.observe(observeSourceChange),
  }
}
