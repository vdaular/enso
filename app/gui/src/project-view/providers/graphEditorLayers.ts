import { createContextStore } from '@/providers'
import { identity } from '@vueuse/core'
import type { Ref } from 'vue'

export interface GraphEditorLayers {
  /** An element that fullscreen elements should be placed inside. */
  fullscreen: Readonly<Ref<HTMLElement | undefined>>
  floating: Readonly<Ref<HTMLElement | undefined>>
}

export { provideFn as provideGraphEditorLayers, injectFn as useGraphEditorLayers }
const { provideFn, injectFn } = createContextStore(
  'Graph editor layers',
  identity<GraphEditorLayers>,
)
