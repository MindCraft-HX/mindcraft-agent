<template>
  <div class="msg-tool" :class="[`tool-${msg.status}`, toolMeta.className, `tool-kind-${toolMeta.detailKind}`]">
    <div class="tool-header" @click="msg.expanded = !msg.expanded">
      <ToolIcon :icon="toolMeta.icon" :size="15" />
      <div class="tool-header-main">
        <span class="tool-name">{{ toolMeta.label }}</span>
        <span class="tool-path" v-if="toolHeaderInfo">{{ toolHeaderInfo }}</span>
        <span
          v-else-if="msg.filePath"
          class="tool-path"
          :class="{ 'md-file-link': isMdFilePath }"
          @click.stop="isMdFilePath && openInMdViewer()"
        >{{ msg.filePath }}</span>
        <code class="tool-cmd" v-else-if="msg.bashCmd">{{ msg.bashCmd }}</code>
      </div>
      <ToolStatusBadge :status="msg.status" />
      <span class="tool-chevron">{{ msg.expanded ? '▲' : '▼' }}</span>
    </div>

    <div v-if="msg.expanded" class="tool-detail">
      <details v-if="msg.status === 'error' && msg.toolError" class="tool-error-details">
        <summary class="tool-error-summary">{{ $t('agent.errorInfo') }}</summary>
        <pre class="tool-error-output">{{ msg.toolError }}</pre>
      </details>

      <component :is="detailComponent" v-if="detailComponent" :msg="msg" v-bind="detailProps" @expand="showDiffModal = true" />

      <div v-if="msg.status === 'pending' && !isAskQuestion && !isExitPlan" class="tool-permission">
        <div class="perm-desc">{{ msg.permDesc }}</div>
        <div class="perm-actions">
          <button class="perm-btn allow-once" @click.stop="emit('respondPermission', msg, true)">{{ $t('agent.allow') }}</button>
          <button class="perm-btn deny" @click.stop="emit('respondPermission', msg, false)">{{ $t('agent.deny') }}</button>
        </div>
      </div>
    </div>
  </div>

  <DiffModal
    :visible="showDiffModal"
    :title="msg.filePath || msg.bashCmd || ''"
    :diffLines="msg.diffLines || []"
    :filePath="msg.filePath || ''"
    :rawContent="modalRawContent"
    @close="showDiffModal = false"
  />
</template>

<script setup>
import { ref, computed } from 'vue'
import DiffModal from '../../../agentCommon/components/DiffModal.vue'
import ToolIcon from '../../../agentCommon/components/ToolIcon.vue'
import ToolStatusBadge from '../../../agentCommon/components/ToolStatusBadge.vue'
import { resolveToolMeta } from '../../../agentCommon/tools/toolMeta.js'
import ToolWrite from './tools/ToolWrite.vue'
import ToolBash from './tools/ToolBash.vue'
import ToolRead from './tools/ToolRead.vue'
import ToolThinking from './tools/ToolThinking.vue'
import ToolPlan from './tools/ToolPlan.vue'
import ToolTodo from './tools/ToolTodo.vue'
import ToolAskQuestion from './tools/ToolAskQuestion.vue'
import ToolPowerShell from './tools/ToolPowerShell.vue'
import ToolAgent from './tools/ToolAgent.vue'
import ToolGeneric from './tools/ToolGeneric.vue'

const props = defineProps({
  msg: { type: Object, required: true },
  // Backward-compatible props — kept for MessageItem.vue compat.
  // Actual rendering uses resolveToolMeta() internally.
  toolIcon: { type: Function, required: false, default: () => '' },
  toolLabel: { type: Function, required: false, default: () => '' },
  isWriteTool: { type: Function, required: false, default: () => false },
  isEditTool: { type: Function, required: false, default: () => false },
  isBashTool: { type: Function, required: false, default: () => false },
  isReadTool: { type: Function, required: false, default: () => false },
})

const emit = defineEmits(['respondPermission'])
const showDiffModal = ref(false)

const toolMeta = computed(() => resolveToolMeta(props.msg.toolName || ''))

const toolName = computed(() => String(props.msg.toolName || '').toLowerCase())
const isThinking = computed(() => toolName.value === 'thinking')
const isAskQuestion = computed(() => ['askquestion', 'askuserquestion', 'ask_user_question'].includes(toolName.value))
const isEnterPlan = computed(() => ['enterplanmode', 'enter_plan_mode'].includes(toolName.value))
const isExitPlan = computed(() => ['exitplanmode', 'exit_plan_mode'].includes(toolName.value))
const isPowerShell = computed(() => toolName.value === 'powershell')
const isSkill = computed(() => toolName.value === 'skill')

// Extract skill name from tool input (e.g. "frontend-design")
const skillNameDisplay = computed(() => {
  if (!isSkill.value) return null
  try {
    const input = JSON.parse(props.msg.text || '')
    return input?.skill || null
  } catch (_) { return null }
})

// Header info: grep/glob show pattern, skill shows skill name, fallback to filePath/bashCmd
const toolHeaderInfo = computed(() => {
  const name = toolName.value
  if (name === 'skill' && skillNameDisplay.value) {
    return skillNameDisplay.value
  }
  if (name === 'grep' || name === 'glob') {
    try {
      const input = JSON.parse(props.msg.text || '')
      if (input && typeof input === 'object' && input.pattern) {
        return input.pattern
      }
    } catch (_) {}
  }
  return null
})

// detailKind-based routing (local mapping)
const detailComponent = computed(() => {
  const kind = toolMeta.value.detailKind
  if (kind === 'write') return ToolWrite
  if (kind === 'terminal') return isPowerShell.value ? ToolPowerShell : ToolBash
  if (kind === 'read') return ToolRead
  if (kind === 'agent') return ToolAgent
  if (kind === 'think') return ToolThinking
  if (kind === 'plan') return ToolPlan
  if (kind === 'todo') return ToolTodo
  if (kind === 'question') return ToolAskQuestion
  return ToolGeneric
})

const detailProps = computed(() => {
  if (isEnterPlan.value) return { isEnter: true }
  if (isExitPlan.value) return { isEnter: false }
  return {}
})

const modalRawContent = computed(() => {
  const name = toolName.value
  if (['bash', 'execute', 'run_command', 'powershell'].includes(name)) return props.msg.bashOutput || ''
  if (['read_file', 'read'].includes(name)) return props.msg.readContent || ''
  return props.msg.newContent || ''
})

const isMdFilePath = computed(() => {
  const fp = String(props.msg.filePath || '').toLowerCase()
  return fp.endsWith('.md') || fp.endsWith('.markdown')
})

function openInMdViewer() {
  window.electronAPI?.openMdWin?.({
    filePath: props.msg.filePath,
    content: props.msg.readContent || '',
    source: 'agent-file-link',
  })
}
</script>

<style scoped>
.msg-tool {
  position: relative;
  margin: 4px 0 4px 46px; display: inline-block;
  width: min(calc(100% - 92px), 980px); border-radius: 7px;
  border: 1px solid var(--cc-tool-border);
  background: var(--cc-bg-tertiary); overflow: hidden;
}
.msg-tool::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--tool-group-color, var(--cc-tool-color-other));
  pointer-events: none;
}
.msg-tool:hover {
  box-shadow: 0 0 0 1px var(--cc-border-hover);
}
.tool-running { border-color: var(--cc-success-border); }
.tool-pending { border-color: var(--cc-attention-border, #164e63); }
.tool-pending::before { background: var(--cc-attention, #38bdf8); }
.tool-denied { border-color: var(--cc-error-border); opacity: 0.7; }
.tool-error { border-color: var(--cc-error-border); }
.tool-header {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 10px; cursor: pointer; user-select: none;
}
.tool-header:hover { background: var(--cc-tool-hover-bg); }
.tool-header-main { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 7px; overflow: hidden; }
.tool-name { font-size: 11px; font-weight: 600; color: var(--cc-text); flex-shrink: 0; }
.tool-status-badge { opacity: 0.86; }
.tool-path {
  font-size: 11px; color: var(--cc-tool-label);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tool-path.md-file-link {
  cursor: pointer; color: var(--cc-link, var(--cc-assistant-heading));
  text-decoration: underline; text-underline-offset: 2px;
}
.tool-path.md-file-link:hover { color: var(--cc-primary); }
.tool-cmd {
  font-size: 11px; color: var(--cc-tool-done);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tool-chevron { font-size: 9px; color: var(--cc-tool-chevron); flex-shrink: 0; }
.tool-detail { background: var(--cc-bg-tertiary); }
.tool-kind-terminal .tool-detail {
  border-top: 1px solid var(--cc-border);
  background: var(--cc-bg-code-deep);
}
.tool-error-output {
  margin: 0; padding: 8px 10px; font-size: 11px; color: var(--cc-error-text);
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: pre-wrap; word-break: break-all;
  background: var(--cc-error-bg); border-bottom: 1px solid var(--cc-error-border);
}
.tool-error-details { border-top: 1px solid var(--cc-border); }
.tool-error-details > summary {
  cursor: pointer; font-size: 11px; color: var(--cc-error-text);
  padding: 6px 10px 4px; user-select: none;
}
.tool-permission {
  padding: 8px 12px 10px; border-top: 1px solid var(--cc-border);
  display: flex; flex-direction: column; gap: 8px;
}
.perm-desc { font-size: 12px; color: var(--cc-panel-text); line-height: 1.5; }
.perm-actions { display: flex; gap: 6px; }
.perm-btn {
  height: 26px; padding: 0 12px; border-radius: 5px;
  font-size: 11px; cursor: pointer; border: 1px solid transparent;
}
.perm-btn.allow-once { background: var(--cc-tool-allow-bg); border-color: var(--cc-tool-allow-border); color: var(--cc-tool-allow-text); }
.perm-btn.allow-once:hover { background: var(--cc-tool-allow-hover-bg); color: var(--cc-tool-allow-hover-text); }
.perm-btn.deny { background: var(--cc-tool-deny-bg); border-color: var(--cc-tool-deny-border); color: var(--cc-tool-deny-text); }
.perm-btn.deny:hover { background: var(--cc-tool-deny-hover-bg); color: var(--cc-tool-deny-hover-text); }

/* Tool group left stripe colors */
.tool-group-write    { --tool-group-color: var(--cc-tool-color-write); }
.tool-group-edit     { --tool-group-color: var(--cc-tool-color-edit); }
.tool-group-read     { --tool-group-color: var(--cc-tool-color-read); }
.tool-group-terminal { --tool-group-color: var(--cc-tool-color-terminal); }
.tool-group-search   { --tool-group-color: var(--cc-tool-color-search); }
.tool-group-plan     { --tool-group-color: var(--cc-tool-color-plan); }
.tool-group-todo     { --tool-group-color: var(--cc-tool-color-todo); }
.tool-group-think    { --tool-group-color: var(--cc-tool-color-think); }
.tool-group-change   { --tool-group-color: var(--cc-tool-color-change); }
.tool-group-plugin   { --tool-group-color: var(--cc-tool-color-plugin); }
.tool-group-agent    { --tool-group-color: var(--cc-tool-color-agent); }
.tool-group-other    { --tool-group-color: var(--cc-tool-color-other); }
</style>
