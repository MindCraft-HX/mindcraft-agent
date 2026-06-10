<template>
  <svg
    class="tool-icon-svg"
    :class="`tool-icon-${icon}`"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <component
      :is="'g'"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <template v-for="(node, i) in nodes" :key="i">
        <component
          :is="node.tag"
          v-bind="node.attrs"
        />
      </template>
    </component>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { getIconNodes } from '../tools/toolIcons.js'

const props = defineProps({
  icon: { type: String, default: 'tool' },
  size: { type: [Number, String], default: 16 },
})

const nodes = computed(() => getIconNodes(props.icon))
</script>

<style scoped>
.tool-icon-svg {
  flex-shrink: 0;
  display: block;
}
</style>
