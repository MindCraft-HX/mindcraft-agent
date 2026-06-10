<template>
  <div class="msg-tool" :class="[`tool-${msg.status}`, toolMeta.className, `tool-kind-${toolMeta.detailKind}`]">
    <div class="tool-header" @click="msg.expanded = !msg.expanded">
      <ToolIcon :icon="toolMeta.icon" :size="15" />
      <div class="tool-header-main">
        <span class="tool-name">{{ displayLabel }}</span>
        <span class="tool-mcp-info" v-if="toolType === 'mcp_tool_call' && msg.mcpToolName">
          {{ msg.serverName ? `${msg.serverName}/` : '' }}{{ msg.mcpToolName }}
        </span>
        <span
          v-if="msg.filePath"
          class="tool-path"
          :class="{ 'doc-file-link': Boolean(msg.filePath) }"
          @click.stop="openInDocumentViewer()"
        >{{ msg.filePath }}</span>
        <code class="tool-cmd" v-else-if="msg.bashCmd">{{ msg.bashCmd }}</code>
        <span class="tool-thinking-preview" v-else-if="isThinking && !msg.expanded && thinkingPreview" :title="msg.text">{{ thinkingPreview }}</span>
      </div>
      <ToolStatusBadge :status="msg.status" />
      <span class="tool-chevron">{{ msg.expanded ? '▲' : '▼' }}</span>
    </div>

    <div v-if="msg.expanded" class="tool-detail">
      <details v-if="msg.status === 'error' && msg.toolError" class="tool-error-details">
        <summary class="tool-error-summary">错误信息</summary>
        <pre class="tool-error-output">{{ msg.toolError }}</pre>
      </details>

      <div v-if="msg.status === 'pending'" class="tool-permission">
        <div class="perm-desc">{{ msg.permDesc }}</div>
        <div class="perm-actions">
          <button class="perm-btn allow-once" @click.stop="emit('respondPermission', msg, true)">允许</button>
          <button class="perm-btn deny" @click.stop="emit('respondPermission', msg, false)">拒绝</button>
        </div>
      </div>

      <component :is="detailComponent" v-if="detailComponent" :msg="msg" v-bind="detailProps" @expand="showDiffModal = true" />
    </div>
  </div>

  <DiffModal
    :visible="showDiffModal"
    :title="modalTitle"
    :diffLines="modalDiffLines"
    :filePath="modalFilePath"
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
import ToolTodo from './tools/ToolTodo.vue'
import ToolUpdatePlan from './tools/ToolUpdatePlan.vue'
import ToolWebSearch from './tools/ToolWebSearch.vue'
import ToolGeneric from './tools/ToolGeneric.vue'
import { buildDiffLines } from '../../../agentCommon/utils/helpers.js'

/** Synchronous parse of unified diff (fallback for modalDiffLines) */
function parseUnifiedDiffForCard(diffText) {
  if (!diffText) return []
  const lines = diffText.split(/\r?\n/)
  const parsed = []
  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('\\')) continue
    if (line.startsWith(' ')) parsed.push({ type: 'ctx', text: line.slice(1) })
    else if (line.startsWith('-')) parsed.push({ type: 'del', text: line.slice(1) })
    else if (line.startsWith('+')) parsed.push({ type: 'add', text: line.slice(1) })
  }

  const CONTEXT_RADIUS = 2
  const keep = new Set()
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].type === 'del' || parsed[i].type === 'add') {
      for (let j = Math.max(0, i - CONTEXT_RADIUS); j <= Math.min(parsed.length - 1, i + CONTEXT_RADIUS); j++) keep.add(j)
    }
  }

  const compact = parsed.filter((_, i) => keep.has(i))
  const hunks = []
  let i = 0
  while (i < compact.length) {
    if (compact[i].type === 'ctx') {
      hunks.push({ type: 'ctx', text: compact[i].text })
      i++
      continue
    }
    const h = { type: 'hunk', del: [], add: [] }
    while (i < compact.length && compact[i].type !== 'ctx') {
      if (compact[i].type === 'del') h.del.push(compact[i].text)
      if (compact[i].type === 'add') h.add.push(compact[i].text)
      i++
    }
    if (h.del.length || h.add.length) hunks.push(h)
  }
  return hunks
}

const props = defineProps({
  msg: { type: Object, required: true },
  // Backward-compatible props
  toolIcon: { type: Function, required: false, default: () => '' },
  toolLabel: { type: Function, required: false, default: () => '' },
  isWriteTool: { type: Function, required: false, default: () => false },
  isEditTool: { type: Function, required: false, default: () => false },
  isBashTool: { type: Function, required: false, default: () => false },
  isReadTool: { type: Function, required: false, default: () => false },
})

const emit = defineEmits(['respondPermission'])
const showDiffModal = ref(false)

const toolType = computed(() => String(props.msg.rawType || props.msg.toolName || '').toLowerCase())
const toolName = computed(() => String(props.msg.toolName || '').toLowerCase())
const isThinking = computed(() => toolName.value === 'thinking')

const toolMeta = computed(() => resolveToolMeta({ toolName: props.msg.toolName, rawType: props.msg.rawType }))

// Display label: activityLabel > Codex thinking override > toolMeta label
const displayLabel = computed(() => {
  if (props.msg?.activityLabel) return String(props.msg.activityLabel)
  if (isThinking.value) return 'Thinking'
  return toolMeta.value.label
})

const thinkingPreview = computed(() => {
  if (!isThinking.value) return ''
  const txt = typeof props.msg?.text === 'string' ? props.msg.text.trim() : ''
  if (!txt) return ''
  const maxLen = 80
  if (txt.length <= maxLen) return txt
  return txt.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
})

// detailKind-based routing (local mapping)
const detailComponent = computed(() => {
  const kind = toolMeta.value.detailKind
  if (kind === 'write') return ToolWrite
  if (kind === 'terminal') return ToolBash
  if (kind === 'read') return ToolRead
  if (kind === 'think') return ToolThinking
  if (kind === 'todo') return ToolTodo
  if (kind === 'plan') return ToolUpdatePlan
  if (kind === 'webSearch') return ToolWebSearch
  return ToolGeneric
})

const detailProps = computed(() => ({}))

const modalRawContent = computed(() => {
  const name = toolName.value
  if (['shell', 'bash', 'execute'].includes(name)) return props.msg.bashOutput || ''
  if (['read_file', 'read'].includes(name)) return props.msg.readContent || ''
  if (toolType.value === 'file_change') return props.msg._fileChanges?.map(fc => fc.unified_diff || '').join('\n') || ''
  if (toolType.value === 'apply_patch') return props.msg._fileChanges?.map(fc => fc.unified_diff || '').join('\n') || ''
  return props.msg.newContent || ''
})

function openInDocumentViewer() {
  if (!props.msg.filePath) return
  window.electronAPI?.openMdWin?.({
    filePath: props.msg.filePath,
    content: props.msg.readContent || '',
  })
}

// file_change / apply_patch get diff lines from _fileChanges, other tools from msg.diffLines
const modalDiffLines = computed(() => {
  if (toolType.value === 'file_change' && props.msg._fileChanges?.length) {
    const lines = props.msg._fileChanges.map(fc => {
      if (fc.diffLines?.length) return fc.diffLines
      if (fc._diffHunks?.length) return fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
      if (fc.unified_diff) return parseUnifiedDiffForCard(fc.unified_diff)
      if (fc._oldStr || fc._newStr) return buildDiffLines(fc._oldStr, fc._newStr)
      return []
    }).flat()
    return lines
  }
  if (toolType.value === 'apply_patch' && props.msg._fileChanges?.length) {
    const lines = props.msg._fileChanges.map(fc => {
      if (fc.diffLines?.length) return fc.diffLines
      if (fc._diffHunks?.length) return fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
      return []
    }).flat()
    if (lines.length) return lines
  }
  if (toolType.value === 'apply_patch') {
    const input = extractApplyPatchInput(props.msg.text)
    if (input) return parseApplyPatchText(input).hunks
  }
  return props.msg.diffLines || []
})

function extractApplyPatchInput(text) {
  if (!text) return ''
  try {
    const parsed = JSON.parse(text)
    return parsed.input || parsed._inputText || ''
  } catch (_) {}
  if (text.includes('*** Begin Patch') || text.includes('*** Update File:')) return text
  return ''
}

function parseApplyPatchText(input) {
  if (!input || typeof input !== 'string') return { hunks: [], filePath: '' }
  const lines = input.split(/\r?\n/)
  const hunks = []
  let filePath = ''
  let curDel = []
  let curAdd = []

  function parsePatchFileHeader(line) {
    const match = line.match(/^\*\*\*\s+(Update|Add|Delete) File:\s*(.+)$/)
    if (!match) return null
    const [, , rawPath] = match
    return rawPath.trim()
  }

  function flushHunk() {
    if (curDel.length || curAdd.length) {
      hunks.push({ type: 'hunk', del: [...curDel], add: [...curAdd] })
      curDel = []
      curAdd = []
    }
  }

  for (const line of lines) {
    const nextFilePath = parsePatchFileHeader(line)
    if (nextFilePath) {
      filePath = nextFilePath
      flushHunk()
    } else if (line.startsWith('***')) {
      // ignore markers
    } else if (line.startsWith('@@')) { flushHunk(); continue }
    else if (line.startsWith('-')) curDel.push(line.slice(1))
    else if (line.startsWith('+')) curAdd.push(line.slice(1))
  }
  flushHunk()
  return { hunks, filePath }
}

const modalTitle = computed(() => {
  if (toolType.value === 'file_change' && props.msg._fileChanges?.length) return props.msg._fileChanges.map(fc => fc.path).filter(Boolean).join('\n')
  if (toolType.value === 'apply_patch' && props.msg._fileChanges?.length) return props.msg._fileChanges.map(fc => fc.path).filter(Boolean).join('\n')
  return props.msg.filePath || props.msg.bashCmd || ''
})

const modalFilePath = computed(() => {
  if (toolType.value === 'file_change' && props.msg._fileChanges?.length) return props.msg._fileChanges[0]?.path || ''
  if (toolType.value === 'apply_patch' && props.msg._fileChanges?.length) return props.msg._fileChanges[0]?.path || ''
  return props.msg.filePath || ''
})
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
.tool-pending { border-color: var(--cc-warning-border); }
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
.tool-mcp-info {
  font-size: 10px; color: var(--cc-tool-label);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 200px; opacity: 0.7;
}
.tool-path {
  font-size: 11px; color: var(--cc-tool-label);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tool-path.doc-file-link {
  cursor: pointer; color: var(--cc-link, var(--cc-assistant-heading));
  text-decoration: underline; text-underline-offset: 2px;
}
.tool-path.doc-file-link:hover { color: var(--cc-primary); }
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
.tool-thinking-preview {
  font-size: 10px; color: var(--cc-text-dim);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 240px; opacity: 0.7;
}

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
