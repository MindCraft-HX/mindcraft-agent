<template>
  <div class="special-card" :class="['special-type-' + specialType, { expanded: expanded }]">
    <div class="special-header" @click="expanded = !expanded">
      <!-- Use name as title if available, otherwise use type -->
      <span class="special-type">{{ cardTitle }}</span>
      <span class="special-chevron">{{ expanded ? '▲' : '▼' }}</span>
    </div>

    <div v-if="expanded" class="special-content">
      <!-- thinking type -->
      <template v-if="specialType === 'thinking'">
        <pre class="special-text">{{ special.thinking || '' }}</pre>
      </template>

      <!-- tool_result type - show result/code -->
      <template v-else-if="specialType === 'tool_result'">
        <template v-if="Array.isArray(special.content)">
          <!-- content is array -->
          <template v-for="(item, idx) in special.content" :key="idx">
            <div v-if="item.type === 'text'" class="result-text-section">
              <pre class="special-text">{{ item.text }}</pre>
            </div>
            <div v-else-if="item.type === 'image'" class="result-image-section">
              <img :src="getImageUrl(item)" alt="Image result" />
            </div>
          </template>
        </template>
        <template v-else>
          <!-- content is string (code/text result) -->
          <pre class="special-text">{{ special.content || '' }}</pre>
        </template>
      </template>

      <!-- tool_use type - display based on name -->
      <template v-else-if="specialType === 'tool_use'">
        <div class="tool-meta">
          <span class="tool-name-label">Name:</span>
          <code class="tool-name">{{ toolName }}</code>
        </div>
        <div class="tool-meta" v-if="special.id">
          <span class="tool-id-label">ID:</span>
          <code class="tool-id">{{ special.id }}</code>
        </div>

        <!-- Read tool -->
        <template v-if="toolName === 'Read' || toolName === 'read_file' || toolName === 'read'">
          <div class="tool-meta" v-if="special.input?.file_path">
            <span class="tool-path-label">File:</span>
            <code class="tool-path">{{ special.input.file_path }}</code>
          </div>
          <div v-if="special.input?.limit || special.input?.offset" class="tool-meta">
            <span class="tool-meta-label">Range:</span>
            <span class="tool-meta-text">
              {{ special.input.offset || 0 }} ~ {{ (special.input.offset || 0) + (special.input.limit || 0) }}
            </span>
          </div>
        </template>

        <!-- Write/Edit tools -->
        <template v-else-if="toolName === 'Write' || toolName === 'write_file' ||
                            toolName === 'Edit' || toolName === 'edit_file' ||
                            toolName === 'str_replace_based_edit'">
          <div class="tool-meta" v-if="special.input?.file_path">
            <span class="tool-path-label">File:</span>
            <code class="tool-path">{{ special.input.file_path }}</code>
          </div>
          <!-- old_content and new_content (Edit) -->
          <template v-if="special.input?.old_content && special.input?.new_content">
            <div class="diff-section">
              <div class="section-title">Old:</div>
              <pre class="diff-old">{{ special.input.old_content }}</pre>
            </div>
            <div class="diff-section">
              <div class="section-title">New:</div>
              <pre class="diff-new">{{ special.input.new_content }}</pre>
            </div>
          </template>
          <!-- only content (Write) -->
          <div v-else-if="special.input?.content" class="diff-section">
            <div class="section-title">Content:</div>
            <pre class="special-text">{{ special.input.content }}</pre>
          </div>
        </template>

        <!-- Bash tool -->
        <template v-else-if="toolName === 'Bash' || toolName === 'bash' || toolName === 'execute'">
          <div class="tool-meta" v-if="special.input?.command">
            <span class="tool-cmd-label">$</span>
            <code class="tool-cmd">{{ special.input.command }}</code>
          </div>
          <div class="tool-meta" v-if="special.input?.cwd">
            <span class="tool-cwd-label">CWD:</span>
            <code class="tool-cwd">{{ special.input.cwd }}</code>
          </div>
        </template>

        <!-- Other tools - show input parameters -->
        <template v-else>
          <div v-if="special.input" class="tool-input-section">
            <div class="section-title">Input:</div>
            <pre class="special-text">{{ JSON.stringify(special.input, null, 2) }}</pre>
          </div>
        </template>
      </template>

      <!-- ide_* type -->
      <template v-else-if="specialType && specialType.startsWith('ide_')">
        <pre class="special-text">{{ prettyPrintSpecialData(special) }}</pre>
      </template>

      <!-- Other types -->
      <template v-else>
        <pre class="special-text">{{ prettyPrintSpecialData(special) }}</pre>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  special: { type: Object, required: true },
})

// Special type
const specialType = computed(() => {
  return props.special.type || 'unknown'
})

// Expanded state
const expanded = computed({
  get: () => props.special.expanded !== false,
  set: (val) => { props.special.expanded = val }
})

// Card title - use name if available, otherwise type
const cardTitle = computed(() => {
  // tool_use type, get name from special
  if (specialType.value === 'tool_use' && props.special.name) {
    return props.special.name
  }
  // Other types directly return type
  return specialType.value
})

// Tool name
const toolName = computed(() => {
  return props.special.name || ''
})

// Get image URL
function getImageUrl(item) {
  if (!item.source) return ''
  if (item.source.type === 'base64') {
    const mediaType = item.source.media_type || 'image/png'
    return `data:${mediaType};base64,${item.source.data}`
  }
  return item.source.uri || item.source.url || ''
}

// Pretty print special data
function prettyPrintSpecialData(data) {
  if (!data) return '(empty)'
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return JSON.stringify(data, null, 2)
  try {
    return JSON.stringify(data, null, 2)
  } catch (e) {
    return String(data)
  }
}
</script>

<style scoped>
.special-card {
  margin: 3px 0 3px 31px;
  border-radius: 7px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  overflow: hidden;
}

.special-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--cc-border-light);
}

.special-header:hover {
  background: var(--cc-bg);
}

.special-type {
  font-size: 11px;
  color: var(--cc-text-muted);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-weight: 600;
}

.special-chevron {
  font-size: 9px;
  color: var(--cc-text-dim);
  flex-shrink: 0;
}

.special-content {
  padding: 10px;
}

.section-title {
  font-size: 11px;
  color: var(--cc-text-dim);
  margin-bottom: 5px;
  font-weight: 600;
}

.tool-meta,
.tool-path,
.tool-meta-label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  font-size: 11px;
}

.tool-name-label,
.tool-id-label,
.tool-path-label,
.tool-cmd-label,
.tool-cwd-label,
.tool-meta-label {
  color: var(--cc-text-dim);
  flex-shrink: 0;
}

.tool-name,
.tool-id,
.tool-path,
.tool-cmd,
.tool-cwd,
.tool-meta-text {
  color: var(--cc-hljs-params);
  font-family: 'Cascadia Code', Consolas, monospace;
  background: var(--cc-bg-secondary);
  padding: 2px 6px;
  border-radius: 3px;
}

.tool-path {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-text-section,
.diff-section,
.tool-input-section,
.ide-content,
.default-content {
  width: 100%;
}

.diff-old,
.diff-new {
  margin-top: 5px;
  padding: 8px;
  font-size: 11px;
  line-height: 1.5;
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.diff-old {
  background: var(--cc-error-bg);
  color: var(--cc-error-text);
  border: 1px solid var(--cc-error-border);
}

.diff-new {
  background: var(--cc-success-bg);
  color: var(--cc-success);
  border: 1px solid var(--cc-success-border);
}

.special-text {
  margin: 0;
  padding: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cc-text-secondary);
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--cc-bg-secondary);
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.result-image-section img {
  max-width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: contain;
  border-radius: 4px;
  margin-top: 5px;
  background: var(--cc-bg-tertiary);
}
</style>
