<template>
  <div class="tool-write-wrap">
    <div v-if="toolBadgeLabel" class="tool-kind-meta">
      <span class="tool-kind-badge" :class="`tool-kind-${toolKind}`">{{ toolBadgeLabel }}</span>
      <span v-if="summaryText" class="tool-kind-summary">{{ summaryText }}</span>
    </div>
    <!-- 单文件：直接展示 diff -->
    <template v-if="!(isFileChange || isApplyPatch) || renderFileChanges.length <= 1">
      <div class="tool-file-label" @dblclick.stop="$emit('expand')">{{ msg.filePath }}
        <span v-if="effectiveDiffLines.length" class="diff-expand-btn" @click.stop="$emit('expand')">⤢</span>
      </div>
      <template v-if="effectiveDiffLines.length">
        <div @dblclick.stop="$emit('expand')" style="cursor:pointer">
          <DiffSplitView :diffLines="effectiveDiffLines" :filePath="msg.filePath" />
        </div>
      </template>
      <template v-else-if="msg.newContent">
        <pre class="tool-code"><code v-html="highlight(msg.newContent, msg.filePath)"></code></pre>
      </template>
      <div v-else-if="isFileChange || isApplyPatch" class="diff-empty-note">{{ t('agent.noDiffPreview') }}</div>
    </template>
    <!-- 多文件变更：展示文件列表 + 各文件 diff -->
    <template v-else-if="isFileChange || isApplyPatch">
      <div v-for="(fc, i) in renderFileChanges" :key="i" class="file-change-block">
        <div class="tool-file-label" @dblclick.stop="openModal(i)">{{ fc.path }}
          <span v-if="fc._renderDiffLines.length" class="diff-expand-btn" @click.stop="openModal(i)">⤢</span>
        </div>
        <div v-if="fc._renderDiffLines.length" @dblclick.stop="openModal(i)" style="cursor:pointer">
          <DiffSplitView :diffLines="fc._renderDiffLines" :filePath="fc.path" />
        </div>
        <div v-else class="diff-empty-note">{{ t('agent.noDiffPreview') }}</div>
      </div>
    </template>
  </div>

  <DiffModal
    :visible="showModal"
    :title="modalTitle"
    :diffLines="modalDiffLines"
    :filePath="modalFilePath"
    @close="showModal = false"
  />
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { highlight } from '../../../../agentCommon/render.js'

const { t } = useI18n()
import DiffSplitView from '../../../../agentCommon/components/DiffSplitView.vue'
import DiffModal from '../../../../agentCommon/components/DiffModal.vue'
import { buildDiffLinesEnhanced } from '../../../../agentCommon/utils/helpers.js'
import { isCodeXEditToolName, isCodeXWriteToolName } from '../../../utils/toolNameMatchers.mjs'

const props = defineProps({
  msg: { type: Object, required: true },
})
defineEmits(['expand'])

const toolType = computed(() => String(props.msg.rawType || props.msg.toolName || '').toLowerCase())
const isFileChange = computed(() => toolType.value === 'file_change')
const isApplyPatch = computed(() => toolType.value === 'apply_patch')
const isWriteTool = computed(() => isCodeXWriteToolName(toolType.value))
const isEditTool = computed(() => isCodeXEditToolName(toolType.value))
const toolKind = computed(() => {
  if (isWriteTool.value) return 'write'
  if (isEditTool.value) return 'edit'
  if (isFileChange.value) return 'file-change'
  if (isApplyPatch.value) return 'apply-patch'
  return 'generic'
})
const toolBadgeLabel = computed(() => {
  if (toolKind.value === 'write') return 'Write'
  if (toolKind.value === 'edit') return 'Edit'
  if (toolKind.value === 'file-change') return 'Files changed'
  if (toolKind.value === 'apply-patch') return 'Patch'
  return ''
})
const fileChanges = computed(() => {
  const fc = props.msg._fileChanges
  if (fc && fc.length) return fc
  // B022 兜底：历史恢复消息可能没有 _fileChanges，从 msg.text JSON 还原
  if (props.msg.text) {
    try {
      const parsed = JSON.parse(props.msg.text)
      const raw = Array.isArray(parsed.changes) ? parsed.changes : []
      if (raw.length) {
        return raw.map(c => ({
          path: c.path || '',
          operation: c.operation || c.kind || '',
          unified_diff: c.unified_diff || '',
          _diffSource: c._diffSource || '',
          _noDiffReason: c._noDiffReason || '',
          _oldStr: '',
          _newStr: '',
          diffLines: [],
        }))
      }
    } catch (_) {}
  }
  return []
})

// P1: 只读已计算的 diffLines / _diffHunks，不同步 parse
// 同步 parse 由 computeFileChangeDiffs() 的 requestIdleCallback 写入 fc.diffLines
const renderFileChanges = computed(() => fileChanges.value.map(fc => {
  let lines = []
  if (fc.diffLines?.length) lines = fc.diffLines
  else if (fc._diffHunks?.length) lines = fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
  return { ...fc, _renderDiffLines: lines }
}))

/** file_change: 从 _fileChanges 取 unified_diff 或 diffLines */
const summaryText = computed(() => {
  if (isWriteTool.value && !effectiveDiffLines.value.length && props.msg.newContent) return t('agent.writeNew')
  if (isEditTool.value && effectiveDiffLines.value.length) return t('agent.diffView')
  if (isEditTool.value && props.msg.newContent) return t('agent.editView')
  if (isFileChange.value && fileChanges.value.length > 1) return t('agent.nFiles', { n: fileChanges.value.length })
  if (isApplyPatch.value && fileChanges.value.length > 1) return t('agent.nFiles', { n: fileChanges.value.length })
  return ''
})

// P1: 只读已计算的 diffLines / _diffHunks，不同步 parse unified_diff
// 同步 parse 只在 computeFileChangeDiffs() 的 requestIdleCallback 中执行
const effectiveDiffLines = computed(() => {
  if (isFileChange.value && fileChanges.value.length > 0) {
    const fc = fileChanges.value[0]
    if (fc._diffHunks?.length) return fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
    if (fc.diffLines?.length) return fc.diffLines
    return []
  }
  // apply_patch: _diffHunks 有数据直接用
  if (isApplyPatch.value && fileChanges.value.length > 0) {
    const fc = fileChanges.value[0]
    if (fc._diffHunks?.length) return fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
    if (fc.diffLines?.length) return fc.diffLines
  }
  // apply_patch 回退：从 msg.text 中解析 input 文本（历史数据兜底，不涉及 streaming）
  if (isApplyPatch.value && props.msg.text) {
    const input = extractApplyPatchInput(props.msg.text)
    if (input) {
      const { hunks, filePath: fp } = parseApplyPatchText(input)
      if (fp && !props.msg.filePath) Object.assign(props.msg, { filePath: fp })
      return hunks
    }
  }
  // write/edit 工具：从 msg.diffLines 取
  return props.msg.diffLines || []
})

/** 从 msg.text（可能是 JSON 或纯文本）中提取 apply_patch input */
function extractApplyPatchInput(text) {
  if (!text) return ''
  // 尝试 JSON 解析
  try {
    const parsed = JSON.parse(text)
    return parsed.input || parsed._inputText || ''
  } catch (_) {}
  // 纯文本：如果直接包含 patch 内容
  if (text.includes('*** Begin Patch') || text.includes('*** Update File:')) return text
  return ''
}

/** 解析 apply_patch input 文本为 { hunks, filePath }（历史数据回退用） */
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
      // 忽略 *** Begin Patch 等标记
    } else if (line.startsWith('@@')) { flushHunk(); continue }
    else if (line.startsWith('-')) curDel.push(line.slice(1))
    else if (line.startsWith('+')) curAdd.push(line.slice(1))
  }
  flushHunk()
  return { hunks, filePath }
}

const showModal = ref(false)
const modalDiffLines = ref([])
const modalFilePath = ref('')
const modalTitle = ref('')

/** 同步计算单个 fileChange 的 diffLines（供弹窗展示用） */
function computeFileChangeDiffsSync(fc) {
  if (fc.diffLines?.length) return fc.diffLines
  if (fc.unified_diff) return parseUnifiedDiff(fc.unified_diff)
  if (fc._diffHunks?.length) return fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
  if (fc._oldStr || fc._newStr) return buildDiffLinesEnhanced(fc._oldStr, fc._newStr)
  return []
}

function openModal(index) {
  const fc = fileChanges.value[index]
  if (!fc) return
  // 同步计算 diff，确保弹窗打开时数据已就绪
  const lines = computeFileChangeDiffsSync(fc)
  if (!lines.length) return
  modalDiffLines.value = lines
  modalFilePath.value = fc.path
  modalTitle.value = fc.path
  showModal.value = true
}

/** 解析 unified diff 文本为 diffLines 格式（供 file_change 使用） */
function parseUnifiedDiff(diffText) {
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

// 组件挂载或展开时懒计算 diff（用 requestIdleCallback 分批，不阻塞渲染）
function computeDiff() {
  const m = props.msg
  if (m.diffLines?.length || !m._diffInput) return
  const inp = m._diffInput
  if (!inp.oldStr && !inp.newStr) return
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      if (!m.diffLines?.length) m.diffLines = buildDiffLinesEnhanced(inp.oldStr, inp.newStr)
    })
  } else {
    setTimeout(() => {
      if (!m.diffLines?.length) m.diffLines = buildDiffLinesEnhanced(inp.oldStr, inp.newStr)
    }, 0)
  }
}

// 懒计算 diff（file_change 从 unified_diff，apply_patch 从 _diffHunks）
function computeFileChangeDiffs() {
  if (!(isFileChange.value || isApplyPatch.value) || !fileChanges.value.length) return
  for (const fc of fileChanges.value) {
    if (fc.diffLines?.length) continue
    // 优先用 unified_diff 直接解析
    if (fc.unified_diff) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          if (!fc.diffLines?.length) fc.diffLines = parseUnifiedDiff(fc.unified_diff)
        })
      } else {
        setTimeout(() => {
          if (!fc.diffLines?.length) fc.diffLines = parseUnifiedDiff(fc.unified_diff)
        }, 0)
      }
    } else if (fc._diffHunks?.length) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          if (!fc.diffLines?.length) fc.diffLines = fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
        })
      } else {
        setTimeout(() => {
          if (!fc.diffLines?.length) fc.diffLines = fc._diffHunks.map(h => ({ type: 'hunk', del: h.del || [], add: h.add || [] }))
        }, 0)
      }
    } else if (fc._oldStr || fc._newStr) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          if (!fc.diffLines?.length) fc.diffLines = buildDiffLinesEnhanced(fc._oldStr, fc._newStr)
        })
      } else {
        setTimeout(() => {
          if (!fc.diffLines?.length) fc.diffLines = buildDiffLinesEnhanced(fc._oldStr, fc._newStr)
        }, 0)
      }
    }
  }
}

onMounted(() => { computeDiff(); computeFileChangeDiffs() })
watch(() => props.msg.expanded, (val) => { if (val) { computeDiff(); computeFileChangeDiffs() } })
// P1: msg.text watcher 已删除 — 对齐 ClaudeCode ToolWrite
// file_change/apply_patch 数据在 _fileChanges，由下面签名 watcher 驱动
// write/edit 的 _diffInput 在消息创建时已固定，不需要 per-chunk 重算
watch(
  () => (props.msg._fileChanges || []).map(fc => [
    fc?.path || '',
    fc?.unified_diff ? 1 : 0,
    fc?._diffHunks?.length || 0,
    fc?._oldStr?.length || 0,
    fc?._newStr?.length || 0,
  ].join(':')).join('|'),
  () => { computeFileChangeDiffs() }
)
</script>

<style scoped>
.tool-write-wrap { }
.tool-kind-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 4px;
}
.tool-kind-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.tool-kind-write {
  color: var(--cc-tool-color-write);
  background: var(--cc-info-bg);
  border-color: var(--cc-info-bg);
}
.tool-kind-edit {
  color: var(--cc-warning);
  background: var(--cc-warning-bg);
  border-color: var(--cc-warning-border);
}
.tool-kind-file-change,
.tool-kind-apply-patch {
  color: var(--cc-tool-label);
  background: var(--cc-bg-tertiary);
  border-color: var(--cc-border, var(--cc-bg-tertiary));
}
.tool-kind-summary {
  font-size: 11px;
  color: var(--cc-text-dim);
}
.file-change-block { border-bottom: 1px solid var(--cc-bg-tertiary); }
.file-change-block:last-child { border-bottom: none; }
.tool-file-label {
  font-size: 10px; color: var(--cc-tool-label); padding: 5px 10px 2px;
  font-family: 'Cascadia Code', Consolas, monospace;
}
.tool-code {
  margin: 0; padding: 7px 10px; font-size: 11px; color: var(--cc-tool-output);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: auto; max-height: 320px; white-space: pre;
}
.diff-empty-note {
  padding: 7px 10px 9px;
  font-size: 11px;
  color: var(--cc-text-dim);
}
.diff-expand-btn {
  float: right; cursor: pointer; font-size: 14px;
  color: var(--cc-diff-expand-btn); padding: 0 4px; border-radius: 3px;
}
.diff-expand-btn:hover {
  color: var(--cc-diff-expand-btn-hover-color);
  background: var(--cc-diff-expand-btn-hover-bg);
}
</style>
