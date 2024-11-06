<script setup lang="ts">
import EditorRoot from '@/components/EditorRoot.vue'
import { highlightStyle } from '@/components/MarkdownEditor/highlight'
import {
  provideDocumentationImageUrlTransformer,
  type UrlTransformer,
} from '@/components/MarkdownEditor/imageUrlTransformer'
import { ensoMarkdown } from '@/components/MarkdownEditor/markdown'
import VueComponentHost from '@/components/VueComponentHost.vue'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import { type ComponentInstance, onMounted, ref, toRef, useCssModule, watch } from 'vue'
import { yCollab } from 'y-codemirror.next'
import * as awarenessProtocol from 'y-protocols/awareness.js'
import * as Y from 'yjs'

const editorRoot = ref<ComponentInstance<typeof EditorRoot>>()

const props = defineProps<{
  yText: Y.Text
  transformImageUrl?: UrlTransformer | undefined
  toolbarContainer: HTMLElement | undefined
}>()

const vueHost = ref<ComponentInstance<typeof VueComponentHost>>()

provideDocumentationImageUrlTransformer(toRef(props, 'transformImageUrl'))

const awareness = new awarenessProtocol.Awareness(new Y.Doc())
const editorView = new EditorView()
const constantExtensions = [minimalSetup, highlightStyle(useCssModule()), EditorView.lineWrapping]

watch([vueHost, toRef(props, 'yText')], ([vueHost, yText]) => {
  if (!vueHost) return
  editorView.setState(
    EditorState.create({
      doc: yText.toString(),
      extensions: [...constantExtensions, ensoMarkdown({ vueHost }), yCollab(yText, awareness)],
    }),
  )
})

onMounted(() => {
  const content = editorView.dom.getElementsByClassName('cm-content')[0]!
  content.addEventListener('focusin', () => (editing.value = true))
  editorRoot.value?.rootElement?.prepend(editorView.dom)
})

const editing = ref(false)
</script>

<template>
  <EditorRoot
    ref="editorRoot"
    class="MarkdownEditor"
    :class="{ editing }"
    @focusout="editing = false"
  />
  <VueComponentHost ref="vueHost" />
</template>

<style scoped>
:deep(.cm-content) {
  font-family: var(--font-sans);
}

:deep(.cm-scroller) {
  /* Prevent touchpad back gesture, which can be triggered while panning. */
  overscroll-behavior: none;
}

.EditorRoot :deep(.cm-editor) {
  position: relative;
  width: 100%;
  height: 100%;
  opacity: 1;
  color: black;
  font-size: 12px;
  outline: none;
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

/* === Editing-mode === */

/* There are currently no style overrides for editing mode, so this is commented out to appease the Vue linter. */
/* :global(.MarkdownEditor):global(.editing) :global(.cm-line):global(.cm-has-cursor) {} */

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
  a > .link {
    display: inline;
    cursor: pointer;
    color: #555;
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
