<script setup lang="ts">
/**
 * @file This component is equivalent to `Teleport` except when `disabled` is `true`, `to` doesn't have to specify a
 * valid teleportation target (works around a Vue issue present at least in 3.5.2-3.5.13).
 */
import { type RendererElement } from 'vue'

const { disabled } = defineProps<{
  disabled: boolean
  to: string | RendererElement | null | undefined
}>()
</script>

<template>
  <!-- Note: `defer` must not be used here, or Vue errors will occur when unmounting components as of 3.5.2. -->
  <Teleport v-if="!disabled" :to="to">
    <slot />
  </Teleport>
  <slot v-else />
</template>
