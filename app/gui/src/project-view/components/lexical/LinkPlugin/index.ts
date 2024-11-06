import { documentationEditorBindings } from '@/bindings'
import type { LexicalPlugin } from '@/components/lexical'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { $getNearestNodeOfType } from '@lexical/utils'
import {
  $getSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
} from 'lexical'
import { shallowRef } from 'vue'
import { createLinkMatcherWithRegExp, useAutoLink } from './autoMatcher'

const URL_REGEX =
  /(?<!\]\()((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/

const EMAIL_REGEX =
  /(?<!\]\()(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/

export const __TEST = { URL_REGEX, EMAIL_REGEX }

/** TODO: Add docs */
export function $getSelectedLinkNode() {
  const selection = $getSelection()
  if (selection?.isCollapsed) {
    const node = selection?.getNodes()[0]
    if (node) {
      return (
        $getNearestNodeOfType(node, LinkNode) ??
        $getNearestNodeOfType(node, AutoLinkNode) ??
        undefined
      )
    }
  }
}

const autoLinkClickHandler = documentationEditorBindings.handler({
  openLink() {
    const link = $getSelectedLinkNode()
    if (link instanceof AutoLinkNode) {
      window.open(link.getURL(), '_blank')?.focus()
      return true
    }
    return false
  },
})

export const autoLinkPlugin: LexicalPlugin = {
  nodes: [AutoLinkNode],
  register(editor: LexicalEditor): void {
    editor.registerCommand(
      CLICK_COMMAND,
      (event) => autoLinkClickHandler(event),
      COMMAND_PRIORITY_CRITICAL,
    )

    useAutoLink(editor, [
      createLinkMatcherWithRegExp(URL_REGEX, (t) => (t.startsWith('http') ? t : `https://${t}`)),
      createLinkMatcherWithRegExp(EMAIL_REGEX, (text) => `mailto:${text}`),
    ])
  },
}

/** TODO: Add docs */
export function useLinkNode(editor: LexicalEditor) {
  const urlUnderCursor = shallowRef<string>()
  editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    () => {
      urlUnderCursor.value = $getSelectedLinkNode()?.getURL()
      return false
    },
    COMMAND_PRIORITY_LOW,
  )
  return { urlUnderCursor }
}
