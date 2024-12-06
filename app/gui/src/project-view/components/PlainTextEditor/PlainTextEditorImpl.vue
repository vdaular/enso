<script setup lang="ts">
import CodeMirror from '@/components/CodeMirror.vue'
import { linkifyUrls } from '@/components/PlainTextEditor/linkifyUrls'
import VueComponentHost from '@/components/VueComponentHost.vue'
import { useCodeMirror } from '@/util/codemirror'
import { useLinkTitles } from '@/util/codemirror/links'
import { type ComponentInstance, useTemplateRef } from 'vue'
import * as Y from 'yjs'

const { content } = defineProps<{ content: Y.Text | string }>()

const editorRoot = useTemplateRef<ComponentInstance<typeof CodeMirror>>('editorRoot')
const vueHost = useTemplateRef<InstanceType<typeof VueComponentHost>>('vueHost')
const { editorView, readonly, contentElement } = useCodeMirror(editorRoot, {
  content: () => content,
  extensions: [linkifyUrls],
  vueHost: () => vueHost.value || undefined,
})

useLinkTitles(editorView, { readonly })

defineExpose({
  contentElement,
})
</script>

<template>
  <CodeMirror ref="editorRoot" v-bind="$attrs" />
  <VueComponentHost ref="vueHost" />
</template>

<style scoped>
:deep(a) {
  color: lightskyblue;
}
</style>
