<template>
  <UserMessageBubble
    v-if="msg.role === 'user' && hasUserContent(msg)"
    :msg="msg"
    @openImage="(src) => emit('openImage', src)"
  />
  <AssistantMessageBubble
    v-else-if="msg.role === 'assistant'"
    :msg="msg"
  />
  <ToolMessageCard
    v-else-if="msg.role === 'tool'"
    :msg="msg"
    :toolIcon="toolIcon"
    :toolLabel="toolLabel"
    :isWriteTool="isWriteTool"
    :isEditTool="isEditTool"
    :isBashTool="isBashTool"
    :isReadTool="isReadTool"
    @respondPermission="(toolMsg, allowed) => emit('respondPermission', toolMsg, allowed)"
    @respondAskQuestion="(toolMsg, q, opt) => emit('respondAskQuestion', toolMsg, q, opt)"
  />
  <SystemMessageCard
    v-else-if="msg.role === 'system'"
    :msg="msg"
  />
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

const emit = defineEmits(['openImage', 'respondPermission', 'respondAskQuestion'])

// 检查用户消息是否有实际内容
function hasUserContent(msg) {
  if (!msg) return false
  // 有 text 字段且有值
  if (msg.text && msg.text.trim()) return true
  // 有 content 数组且包含有效的 text/image/file
  if (msg.content && Array.isArray(msg.content)) {
    return msg.content.some(item =>
      (item.type === 'text' && item.text && item.text.trim()) ||
      (item.type === 'image' && item.source) ||
      (item.type === 'file' && item.source)
    )
  }
  return false
}
</script>

