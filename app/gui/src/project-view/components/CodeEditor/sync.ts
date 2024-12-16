import { type GraphStore } from '@/stores/graph'
import { type ProjectStore } from '@/stores/project'
import { changeSetToTextEdits } from '@/util/codemirror/text'
import { useToast } from '@/util/toast'
import {
  Annotation,
  ChangeSet,
  type EditorSelection,
  type Extension,
  type Text,
} from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { createDebouncer } from 'lib0/eventloop'
import { onUnmounted, watch } from 'vue'
import { MutableModule } from 'ydoc-shared/ast'
import { SourceRangeEdit, textChangeToEdits } from 'ydoc-shared/util/data/text'
import { type Origin } from 'ydoc-shared/yjsModel'

// Indicates a change updating the text to correspond to the given module state.
const synchronizedModule = Annotation.define<MutableModule>()

/** @returns A CodeMirror Extension that synchronizes the editor state with the AST of an Enso module. */
export function useEnsoSourceSync(
  projectStore: Pick<ProjectStore, 'module'>,
  graphStore: Pick<GraphStore, 'moduleSource' | 'viewModule' | 'startEdit' | 'commitEdit'>,
  editorView: EditorView,
) {
  let pendingChanges:
    | { changes: ChangeSet; selectionBefore: EditorSelection; textBefore: Text }
    | undefined
  let currentModule: MutableModule | undefined

  const notifyErrorToast = useToast.error()
  const notifyError = notifyErrorToast.show.bind(notifyErrorToast)

  const debounceUpdates = createDebouncer(0)
  const updateListener: Extension = EditorView.updateListener.of((update) => {
    for (const transaction of update.transactions) {
      const newModule = transaction.annotation(synchronizedModule)
      if (newModule) {
        // Flush the pipeline of edits that were based on the old module.
        commitPendingChanges()
        currentModule = newModule
      } else if (transaction.docChanged && currentModule) {
        pendingChanges =
          pendingChanges ?
            {
              ...pendingChanges,
              changes: pendingChanges.changes.compose(transaction.changes),
            }
          : {
              changes: transaction.changes,
              selectionBefore: transaction.startState.selection,
              textBefore: transaction.startState.doc,
            }
        // Defer the update until after pending events have been processed, so that if changes are arriving faster
        // than we would be able to apply them individually we coalesce them to keep up.
        debounceUpdates(commitPendingChanges)
      }
    }
  })

  /** Set the editor contents to the current module state, discarding any pending editor-initiated changes. */
  function resetView() {
    pendingChanges = undefined
    currentModule = undefined
    const viewText = editorView.state.doc.toString()
    const code = graphStore.moduleSource.text
    const changes = textChangeToEdits(viewText, code)
    console.info('Resetting the editor to the module code.', changes)
    editorView.dispatch({
      changes,
      annotations: synchronizedModule.of(graphStore.startEdit()),
    })
  }

  /** Apply any pending changes to the currently-synchronized module, clearing the set of pending changes. */
  function commitPendingChanges() {
    if (!pendingChanges || !currentModule) return
    const { changes, selectionBefore, textBefore } = pendingChanges
    pendingChanges = undefined
    const edits = changeSetToTextEdits(changes)
    try {
      const editedModule = currentModule.edit()
      editedModule.applyTextEdits(edits, graphStore.viewModule)
      if (editedModule.root()?.code() === editorView.state.doc.toString()) {
        graphStore.commitEdit(editedModule, undefined, 'local:userAction:CodeEditor')
        currentModule = editedModule
        return
      }
    } catch (error) {
      console.error(`Code Editor failed to modify module`, error)
    }
    notifyError('Unable to apply source code edit.')
    editorView.dispatch({
      changes: changes.invert(textBefore),
      selection: selectionBefore,
      annotations: synchronizedModule.of(currentModule),
    })
    if (currentModule.root()?.code() !== editorView.state.doc.toString()) {
      console.warn('Unexpected: Applying inverted edit did not yield original module source')
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
      changes: textEdits,
      annotations: synchronizedModule.of(graphStore.startEdit()),
    })
  }

  onUnmounted(() => graphStore.moduleSource.unobserve(observeSourceChange))
  /**
   * Starts synchronizing the editor with module updates. This must be called *after* installing the `updateListener`
   * extension in the editor.
   */
  function connectModuleListener() {
    watch(
      () => projectStore.module,
      (module, _oldValue, onCleanup) => {
        if (!module) return
        graphStore.moduleSource.observe(observeSourceChange)
        onCleanup(() => graphStore.moduleSource.unobserve(observeSourceChange))
      },
      { immediate: true },
    )
  }
  return {
    /** The extension to install in the editor. */
    updateListener,
    connectModuleListener,
  }
}
