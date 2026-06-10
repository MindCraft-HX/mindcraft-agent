<template>
  <div class="user-msg">
    <!-- 代码/图片/文件：放在气泡上方（中性底色） -->
    <div v-if="hasExtras" class="user-extras">
      <div v-for="(code, i) in codeBlocks" :key="'code-'+i" class="extra-card code-card" v-html="renderContent(code)"></div>

      <div v-for="(ide, i) in ideBlocks" :key="'ide-'+i" class="extra-card ide-card">
        <div class="ide-title">IDE</div>
        <pre class="ide-pre">{{ ide }}</pre>
      </div>

      <div v-for="(img, i) in imageBlocks" :key="'img-'+i" class="extra-card image-card">
        <img
          :src="getImageSrc(img.source)"
          class="msg-img"
          title="点击查看大图"
          @click="emit('openImage', getImageSrc(img.source))"
        />
      </div>

      <div v-for="(f, i) in fileBlocks" :key="'file-'+i" class="extra-card file-card">
        <span class="file-icon">📄</span>
        <span class="file-name">{{ f.source?.filename || '文件' }}</span>
      </div>
    </div>

    <!-- 普通文本：只在橙色气泡内展示 -->
    <div v-if="plainText && plainText.trim()" class="user-bubble">
      <div class="msg-text" v-html="renderContent(plainText)"></div>
    </div>
  </div>
</template>

<script setup>
import { renderContent } from '../../../agentCommon/render.js'
import { computed } from 'vue'
import '../../../agentCommon/markdown.css'

const props = defineProps({
  msg: { type: Object, required: true },
})

const emit = defineEmits(['openImage'])

function splitTextAndCode(raw = '') {
  const s = String(raw || '').replace(/\r\n/g, '\n')
  const codeBlocks = []
  const ideBlocks = []

  // 仅抽离 ide_ 包裹内容：文本仍保留在橙色气泡里，其它都不做“像代码”判断
  const withoutIde = s.replace(/<ide_[^>]*>[\s\S]*?<\/ide_[^>]*>/g, (m) => {
    ideBlocks.push(m)
    return '\n'
  })
  // 抽离 fenced code blocks，避免它们进入橙色气泡
  const plain = withoutIde.replace(/```[\w-]*\n?[\s\S]*?```/g, (m) => {
    codeBlocks.push(m)
    return '\n'
  })
  return { plain, codeBlocks, ideBlocks }
}

const contentBlocks = computed(() => {
  const m = props.msg || {}
  if (Array.isArray(m.content)) return m.content
  if (typeof m.text === 'string' && m.text.trim()) return [{ type: 'text', text: m.text }]
  return []
})

const imageBlocks = computed(() => contentBlocks.value.filter(b => b?.type === 'image' && b.source))
const fileBlocks = computed(() => contentBlocks.value.filter(b => b?.type === 'file' && b.source))
const rawText = computed(() =>
  contentBlocks.value
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('')
)

const split = computed(() => splitTextAndCode(rawText.value || ''))
const codeBlocks = computed(() => split.value.codeBlocks)
const ideBlocks = computed(() => split.value.ideBlocks)
const plainText = computed(() => split.value.plain)

const hasExtras = computed(() => codeBlocks.value.length || ideBlocks.value.length || imageBlocks.value.length || fileBlocks.value.length)

/** 根据 source 类型生成图片 src */
function getImageSrc(source) {
  if (!source) return ''

  if (source.type === 'base64') {
    // base64 格式：data:image/png;base64,...
    const mediaType = source.media_type || 'image/png'
    return `data:${mediaType};base64,${source.data}`
  }

  return source.uri || source.url || ''
}
</script>

<style scoped>
/* 用户消息整体容器：右对齐 */
.user-msg {
  margin-left: auto;
  max-width: 78%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 用户气泡 */
.user-bubble {
  background: var(--cc-user-bg);
  color: var(--cc-user-text);
  padding: 8px 12px;
  border-radius: 12px 12px 3px 12px;
  line-height: 1.55;
  word-break: break-word;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.msg-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-text:deep(.agent-markdown),
.msg-text.agent-markdown { color: inherit; }

/* 上方“附件/代码”区域 */
.user-extras {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.extra-card {
  border-radius: 8px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  padding: 8px 10px;
}
.code-card :deep(.code-block) {
  margin: 0;
  display: inline-block;
  width: 78%;
  box-sizing: border-box;
}
.file-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cc-text-secondary);
}

.msg-img {
  max-width: 200px;
  aspect-ratio: 16 / 10;
  object-fit: contain;
  border-radius: 5px;
  cursor: zoom-in;
  display: block;
  background: var(--cc-bg-tertiary);
}

.file-icon {
  font-size: 12px;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.ide-card {
  padding: 8px 10px;
}
.ide-title {
  font-size: 10px;
  color: var(--cc-text-muted);
  font-family: 'Cascadia Code', Consolas, monospace;
  margin-bottom: 6px;
}
.ide-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11px;
  line-height: 1.5;
  color: var(--cc-text-secondary);
  font-family: 'Cascadia Code', Consolas, monospace;
  background: var(--cc-bg-secondary);
  border-radius: 6px;
  padding: 8px 10px;
  max-height: 320px;
  overflow: auto;
}

/* 让用户消息的 markdown/代码块与 assistant 一致（配色适配橙色气泡） */
/* 仅作用于橙色气泡内的 markdown/代码样式 */
.user-bubble :deep(.code-block) {
  background: var(--cc-user-code-bg) !important;
  border: 1px solid var(--cc-user-code-border);
  border-radius: 6px;
  box-sizing: border-box;
}
.user-bubble :deep(.code-block .code-header) {
  color: rgba(255, 255, 255, 0.78);
  background: color-mix(in srgb, var(--cc-user-code-bg) 88%, #fff 12%);
}
.user-bubble :deep(.code-block pre),
.user-bubble :deep(.code-block code) { color: var(--cc-user-code-text); }
.user-bubble :deep(.inline-code) {
  background: var(--cc-user-code-bg);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 12px;
  color: var(--cc-user-code-text);
  font-family: 'Cascadia Code', Consolas, monospace;
}
.user-bubble :deep(.md-h1),
.user-bubble :deep(.md-h2),
.user-bubble :deep(.md-h3),
.user-bubble :deep(.md-h4),
.user-bubble :deep(.md-strong-line) { color: var(--cc-user-heading); }
.user-bubble :deep(.md-link) { color: #fff3b0; }
.user-bubble :deep(.md-blockquote) {
  border-left-color: rgba(255, 255, 255, 0.35);
  color: rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.08);
}
.user-bubble :deep(.md-table-wrap) {
  display: inline-block;
  max-width: 100%; overflow-x: auto;
  margin: 8px 0;
  border: 1px solid var(--cc-user-code-border);
  border-radius: 6px;
  background: var(--cc-user-code-bg);
}
.user-bubble :deep(.md-table) { border-collapse: collapse; font-size: 11px; }
.user-bubble :deep(.md-table th),
.user-bubble :deep(.md-table td) {
  border-right: 1px solid var(--cc-user-code-border);
  border-bottom: 1px solid var(--cc-user-code-border);
  text-align: left;
}
.user-bubble :deep(.md-table th) { color: var(--cc-user-heading); background: var(--cc-user-code-bg); font-weight: 700; position: sticky; top: 0; }
.user-bubble :deep(.md-table td) { color: var(--cc-user-code-text); }
.user-bubble :deep(.md-table th:last-child),
.user-bubble :deep(.md-table td:last-child) { border-right: none; }

/* highlight.js token（偏浅色，保证在用户气泡里可读） */
.user-bubble :deep(.hljs-keyword)  { color: #ffd6ff; }
.user-bubble :deep(.hljs-built_in) { color: #b9f6ca; }
.user-bubble :deep(.hljs-string)   { color: #ffe0b2; }
.user-bubble :deep(.hljs-number)   { color: #d7ffb8; }
.user-bubble :deep(.hljs-comment)  { color: rgba(255, 255, 255, 0.65); font-style: italic; }
.user-bubble :deep(.hljs-function) { color: #fff3b0; }
.user-bubble :deep(.hljs-title)    { color: #fff3b0; }
.user-bubble :deep(.hljs-params)   { color: #c8e1ff; }
.user-bubble :deep(.hljs-variable) { color: #c8e1ff; }
.user-bubble :deep(.hljs-attr)     { color: #c8e1ff; }
.user-bubble :deep(.hljs-name)     { color: #b9f6ca; }
.user-bubble :deep(.hljs-tag)      { color: #c8e1ff; }
.user-bubble :deep(.hljs-type)     { color: #b9f6ca; }
.user-bubble :deep(.hljs-literal)  { color: #c8e1ff; }
.user-bubble :deep(.hljs-operator) { color: var(--cc-user-code-text); }
.user-bubble :deep(.hljs-punctuation) { color: var(--cc-user-code-text); }
</style>
