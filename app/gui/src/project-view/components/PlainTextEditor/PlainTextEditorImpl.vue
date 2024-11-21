<script setup lang="ts">
import EditorRoot from '@/components/codemirror/EditorRoot.vue'
import { yCollab } from '@/components/codemirror/yCollab'
import { linkifyUrls } from '@/components/PlainTextEditor/linkifyUrls'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { type ComponentInstance, computed, onMounted, ref, watchEffect } from 'vue'
import { Awareness } from 'y-protocols/awareness'
import { assert } from 'ydoc-shared/util/assert'
import * as Y from 'yjs'

const { content } = defineProps<{ content: Y.Text | string }>()

const editorRoot = ref<ComponentInstance<typeof EditorRoot>>()
const awareness = new Awareness(new Y.Doc())
const editorView = new EditorView()

function init(content: Y.Text | string) {
  const baseExtensions = [linkifyUrls]
  if (typeof content === 'string') {
    return { doc: content, extensions: baseExtensions }
  } else {
    assert(content.doc !== null)
    const yTextWithDoc: Y.Text & { doc: Y.Doc } = content as any
    const doc = content.toString()
    const syncExt = yCollab(yTextWithDoc, awareness)
    return { doc, extensions: [...baseExtensions, syncExt] }
  }
}

watchEffect(() => {
  const { doc, extensions } = init(content)
  editorView.setState(EditorState.create({ doc, extensions }))
})

onMounted(() => editorRoot.value?.rootElement?.prepend(editorView.dom))

defineExpose({
  contentElement: computed(() => editorView.contentDOM),
})
</script>

<template>
  <EditorRoot ref="editorRoot" />
</template>
