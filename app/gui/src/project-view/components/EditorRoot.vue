<script setup lang="ts">
import { ref } from 'vue'

const rootElement = ref<HTMLElement>()
defineExpose({ rootElement })
</script>

<template>
  <div
    ref="rootElement"
    class="EditorRoot"
    @keydown.arrow-left.stop
    @keydown.arrow-right.stop
    @keydown.arrow-up.stop
    @keydown.arrow-down.stop
    @keydown.enter.stop
    @keydown.backspace.stop
    @keydown.delete.stop
    @wheel.stop.passive
    @contextmenu.stop
  ></div>
</template>

<style scoped>
.EditorRoot {
  width: 100%;
  height: 100%;
}
</style>
