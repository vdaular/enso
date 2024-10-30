<script setup lang="ts">
import SvgButton from '@/components/SvgButton.vue'
import { useProjectStore } from '@/stores/project'
import ControlButtons from './ControlButtons.vue'

const project = useProjectStore()
</script>

<template>
  <ControlButtons class="RecordControl">
    <template #left>
      <SvgButton
        title="Refresh"
        class="iconButton"
        name="refresh"
        draggable="false"
        @click.stop="project.executionContext.recompute()"
      />
    </template>
    <template #right>
      <SvgButton
        title="Write All"
        class="iconButton"
        name="workflow_play"
        draggable="false"
        @click.stop="project.executionContext.recompute('all', 'Live')"
      />
    </template>
  </ControlButtons>
</template>

<style scoped>
.iconButton:active {
  color: #ba4c40;
}
</style>
