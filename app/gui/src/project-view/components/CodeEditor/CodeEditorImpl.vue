<script setup lang="ts">
import { useEnsoDiagnostics } from '@/components/CodeEditor/diagnostics'
import { ensoSyntax } from '@/components/CodeEditor/ensoSyntax'
import { useEnsoSourceSync } from '@/components/CodeEditor/sync'
import { ensoHoverTooltip } from '@/components/CodeEditor/tooltips'
import EditorRoot from '@/components/codemirror/EditorRoot.vue'
import { testSupport } from '@/components/codemirror/testSupport'
import { useGraphStore } from '@/stores/graph'
import { useProjectStore } from '@/stores/project'
import { useSuggestionDbStore } from '@/stores/suggestionDatabase'
import { useAutoBlur } from '@/util/autoBlur'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintGutter } from '@codemirror/lint'
import { highlightSelectionMatches } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { type Highlighter } from '@lezer/highlight'
import { minimalSetup } from 'codemirror'
import { computed, onMounted, ref, watch, type ComponentInstance } from 'vue'

const projectStore = useProjectStore()
const graphStore = useGraphStore()
const suggestionDbStore = useSuggestionDbStore()
const editorRoot = ref<ComponentInstance<typeof EditorRoot>>()
const rootElement = computed(() => editorRoot.value?.rootElement)
useAutoBlur(rootElement)

const editorView = new EditorView()
;(window as any).__codeEditorApi = testSupport(editorView)

const { updateListener, connectModuleListener } = useEnsoSourceSync(graphStore, editorView)
const ensoDiagnostics = useEnsoDiagnostics(projectStore, graphStore, editorView)

watch(
  () => projectStore.module,
  (module) => {
    if (!module) return
    editorView.setState(
      EditorState.create({
        extensions: [
          minimalSetup,
          syntaxHighlighting(defaultHighlightStyle as Highlighter),
          bracketMatching(),
          foldGutter(),
          lintGutter(),
          highlightSelectionMatches(),
          ensoSyntax(),
          updateListener,
          ensoHoverTooltip(graphStore, suggestionDbStore),
          ensoDiagnostics,
        ],
      }),
    )
    connectModuleListener()
  },
  { immediate: true },
)

onMounted(() => {
  editorView.focus()
  rootElement.value?.prepend(editorView.dom)
})
</script>

<template>
  <EditorRoot ref="editorRoot" class="CodeEditor" />
</template>

<style scoped>
.CodeEditor {
  font-family: var(--font-mono);
  backdrop-filter: var(--blur-app-bg);
  background-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.4);
}

:deep(.cm-scroller) {
  font-family: var(--font-mono);
  /* Prevent touchpad back gesture, which can be triggered while panning. */
  overscroll-behavior: none;
}

:deep(.cm-editor) {
  position: relative;
  width: 100%;
  height: 100%;
  opacity: 1;
  color: black;
  text-shadow: 0 0 2px rgba(255, 255, 255, 0.4);
  font-size: 12px;
  outline: 1px solid transparent;
  transition: outline 0.1s ease-in-out;
}

:deep(.cm-focused) {
  outline: 1px solid rgba(0, 0, 0, 0.5);
}

:deep(.cm-tooltip-hover) {
  padding: 4px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.4);
  text-shadow: 0 0 2px rgba(255, 255, 255, 0.4);

  &::before {
    content: '';
    background-color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(64px);
    border-radius: 4px;
  }
}

:deep(.cm-gutters) {
  border-radius: 3px 0 0 3px;
  min-width: 32px;
}
</style>
