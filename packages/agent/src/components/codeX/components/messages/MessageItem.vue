<template>
  <template v-if="msg.role === 'user'">
    <UserMessageBubble
      v-if="hasUserContent(msg)"
      :msg="msg"
      @openImage="(src) => emit('openImage', src)"
    />
  </template>

  <template v-else-if="msg.role === 'assistant'">
    <AssistantMessageBubble :msg="msg" />
  </template>

  <template v-else-if="msg.role === 'tool'">
    <ToolMessageCard
      :msg="msg"
      :toolIcon="toolIcon"
      :toolLabel="toolLabel"
      :isWriteTool="isWriteTool"
      :isEditTool="isEditTool"
      :isBashTool="isBashTool"
      :isReadTool="isReadTool"
    />
  </template>

  <template v-else-if="msg.role === 'system'">
    <SystemMessageCard :msg="msg" />
  </template>
</template>

<script setup>
import UserMessageBubble from './UserMessageBubble.vue'
import AssistantMessageBubble from './AssistantMessageBubble.vue'
import ToolMessageCard from './ToolMessageCard.vue'
import SystemMessageCard from './SystemMessageCard.vue'

defineProps({
  msg: { type: Object, required: true },
  toolIcon: { type: Function, required: true },
  toolLabel: { type: Function, required: true },
  isWriteTool: { type: Function, required: true },
  isEditTool: { type: Function, required: true },
  isBashTool: { type: Function, required: true },
  isReadTool: { type: Function, required: true },
})

const emit = defineEmits(['openImage'])

function hasUserContent(msg) {
  if (!msg) return false
  if (msg.text && msg.text.trim()) return true
  if (msg.content && Array.isArray(msg.content)) {
    return msg.content.some(item =>
      ((item.type === 'text' || item.type === 'input_text' || item.type === 'output_text') && item.text && item.text.trim()) ||
      (item.type === 'image' && item.source) ||
      (item.type === 'file' && item.source)
    )
  }
  return false
}
</script>
