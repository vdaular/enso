<script setup lang="ts">
import MenuButton from '@/components/MenuButton.vue'
import SizeTransition from '@/components/SizeTransition.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import { useUnrefHTMLElement } from '@/composables/events'
import { injectInteractionHandler } from '@/providers/interactionHandler'
import { endOnClickOutside } from '@/util/autoBlur'
import { shift, useFloating, type Placement } from '@floating-ui/vue'
import { ref, shallowRef, useTemplateRef, type VueElement } from 'vue'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  title?: string | undefined
  placement?: Placement
  alwaysShowArrow?: boolean | undefined
}>()

const rootElement = shallowRef<HTMLElement>()
const menuPanel = useTemplateRef<Element | VueElement | undefined | null>('menuPanel')
const floatElement = useUnrefHTMLElement(menuPanel)
const hovered = ref(false)

injectInteractionHandler().setWhen(
  open,
  endOnClickOutside(rootElement, {
    cancel: () => (open.value = false),
    end: () => (open.value = false),
  }),
)

const { floatingStyles } = useFloating(rootElement, floatElement, {
  placement: props.placement ?? 'bottom-start',
  middleware: [shift()],
})
</script>

<template>
  <div ref="rootElement" class="DropdownMenu" @pointerdown.prevent>
    <MenuButton
      v-model="open"
      class="DropdownMenuButton"
      :title="props.title"
      @pointerenter="hovered = true"
      @pointerleave="hovered = false"
    >
      <slot name="button" />
    </MenuButton>
    <SvgIcon
      v-if="alwaysShowArrow || (hovered && !open)"
      name="arrow_right_head_only"
      class="arrow"
    />
    <SizeTransition height :duration="100">
      <slot v-if="open" ref="menuPanel" name="menu" :style="floatingStyles" />
    </SizeTransition>
  </div>
</template>

<style scoped>
.DropdownMenu {
  position: relative;
  outline: 0;
  margin: -4px;
}

.arrow {
  position: absolute;
  bottom: -5px;
  left: 50%;
  opacity: 0.5;
  /* Prevent the parent from receiving a pointerout event if the mouse is over the arrow, which causes flickering. */
  pointer-events: none;
  --icon-transform: translateX(-50%) rotate(90deg) scale(0.7);
  --icon-transform-origin: center;
}
</style>
