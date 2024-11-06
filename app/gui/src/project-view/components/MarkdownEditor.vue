<script setup lang="ts">
import type { UrlTransformer } from '@/components/MarkdownEditor/imageUrlTransformer'
import { defineAsyncComponent } from 'vue'
import * as Y from 'yjs'

const props = defineProps<{
  yText: Y.Text
  transformImageUrl?: UrlTransformer
  toolbarContainer: HTMLElement | undefined
}>()

const LazyMarkdownEditor = defineAsyncComponent(
  () => import('@/components/MarkdownEditor/MarkdownEditorImpl.vue'),
)
</script>

<template>
  <Suspense>
    <LazyMarkdownEditor v-bind="props" />
  </Suspense>
</template>
