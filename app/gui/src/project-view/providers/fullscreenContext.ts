import { createContextStore } from '@/providers'
import type { Ref } from 'vue'

export { provideFn as provideFullscreenContext, injectFn as useFullscreenContext }
const { provideFn, injectFn } = createContextStore(
  'fullscreen context',
  (fullscreenContainer: Readonly<Ref<HTMLElement | undefined>>) => ({
    /** An element that fullscreen elements should be placed inside. */
    fullscreenContainer,
  }),
)
