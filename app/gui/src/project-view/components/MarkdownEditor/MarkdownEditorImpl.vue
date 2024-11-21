<script setup lang="ts">
import EditorRoot from '@/components/codemirror/EditorRoot.vue'
import { yCollab } from '@/components/codemirror/yCollab'
import { highlightStyle } from '@/components/MarkdownEditor/highlight'
import { ensoMarkdown } from '@/components/MarkdownEditor/markdown'
import VueComponentHost from '@/components/VueComponentHost.vue'
import { assert } from '@/util/assert'
import { Vec2 } from '@/util/data/vec2'
import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import { type ComponentInstance, computed, onMounted, ref, toRef, useCssModule, watch } from 'vue'
import { Awareness } from 'y-protocols/awareness.js'
import * as Y from 'yjs'

const editorRoot = ref<ComponentInstance<typeof EditorRoot>>()

const props = defineProps<{
  content: Y.Text | string
  toolbarContainer?: HTMLElement | undefined
}>()

const vueHost = ref<ComponentInstance<typeof VueComponentHost>>()
const focused = ref(false)
const readonly = computed(() => typeof props.content === 'string')
const editing = computed(() => !readonly.value && focused.value)

const awareness = new Awareness(new Y.Doc())
const editorView = new EditorView()
// Disable EditContext API because of https://github.com/codemirror/dev/issues/1458.
;(EditorView as any).EDIT_CONTEXT = false
const constantExtensions = [minimalSetup, highlightStyle(useCssModule()), EditorView.lineWrapping]
watch([vueHost, toRef(props, 'content')], ([vueHost, content]) => {
  if (!vueHost) return
  let doc = ''
  const extensions = [...constantExtensions, ensoMarkdown({ vueHost })]
  if (typeof content === 'string') {
    doc = content
  } else {
    assert(content.doc !== null)
    const yTextWithDoc: Y.Text & { doc: Y.Doc } = content as any
    doc = content.toString()
    extensions.push(yCollab(yTextWithDoc, awareness))
  }
  editorView.setState(EditorState.create({ doc, extensions }))
})

onMounted(() => {
  // Enable rendering the line containing the current cursor in `editing` mode if focus enters the element *inside* the
  // scroll area--if we attached the handler to the editor root, clicking the scrollbar would cause editing mode to be
  // activated.
  editorView.dom
    .getElementsByClassName('cm-content')[0]!
    .addEventListener('focusin', () => (focused.value = true))
  editorRoot.value?.rootElement?.prepend(editorView.dom)
})

/**
 * Replace text in given document range with `text`, putting text cursor after inserted text.
 *
 * If text contains multiple lines, it should use '\n', not '\r\n' for line endings.
 */
function putTextAt(text: string, from: number, to: number) {
  const insert = Text.of(text.split('\n'))
  editorView.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  })
}

defineExpose({
  putText: (text: string) => {
    const range = editorView.state.selection.main
    putTextAt(text, range.from, range.to)
  },
  putTextAt,
  putTextAtCoords: (text: string, coords: Vec2) => {
    const pos = editorView.posAtCoords(coords, false)
    putTextAt(text, pos, pos)
  },
})
</script>

<template>
  <EditorRoot ref="editorRoot" v-bind="$attrs" :class="{ editing }" @focusout="focused = false" />
  <VueComponentHost ref="vueHost" />
</template>

<style scoped>
:deep(.cm-content) {
  font-family: var(--font-sans);
}

:deep(.cm-editor) {
  opacity: 1;
  color: black;
  font-size: 12px;
}

:deep(img.uploading) {
  opacity: 0.5;
}
</style>

<!--suppress CssUnusedSymbol -->
<style module>
/* === Syntax styles === */

.heading1 {
  font-weight: 700;
  font-size: 20px;
  line-height: 1.75;
}
.heading2 {
  font-weight: 700;
  font-size: 16px;
  line-height: 1.75;
}
.heading3,
.heading4,
.heading5,
.heading6 {
  font-size: 14px;
  line-height: 2;
}
.processingInstruction {
  opacity: 20%;
}
.emphasis:not(.processingInstruction) {
  font-style: italic;
}
.strong:not(.processingInstruction) {
  font-weight: bold;
}
.strikethrough:not(.processingInstruction) {
  text-decoration: line-through;
}
.monospace {
  /*noinspection CssNoGenericFontName*/
  font-family: var(--font-mono);
}
.url {
  color: royalblue;
}

/* === View-mode === */

:global(.MarkdownEditor):not(:global(.editing)) :global(.cm-line),
:global(.cm-line):not(:global(.cm-has-cursor)) {
  :global(.cm-image-markup) {
    display: none;
  }
  .processingInstruction {
    display: none;
  }
  .url {
    display: none;
  }
  a .url {
    display: inline;
  }
  a {
    cursor: pointer;
    color: blue;
    &:hover {
      text-decoration: underline;
    }
  }
  &:has(.list.processingInstruction) {
    display: list-item;
    list-style-type: disc;
    list-style-position: inside;
  }
}
</style>
