<template>
  <div class="user-msg">
    <div v-if="hasExtras" class="user-extras">
      <div v-for="(code, i) in codeBlocks" :key="'code-'+i" class="extra-card code-card" v-html="renderContent(code)"></div>

      <div v-for="(ide, i) in ideBlocks" :key="'ide-'+i" class="extra-card ide-card">
        <div class="ide-title">IDE</div>
        <pre class="ide-pre">{{ ide }}</pre>
      </div>

      <div v-for="(img, i) in imageBlocks" :key="'img-'+i" class="extra-card image-card">
        <img
          :src="getImageSrc(img)"
          class="msg-img"
          title="点击查看大图"
          @click="emit('openImage', getImageSrc(img))"
        />
      </div>

      <div v-for="(f, i) in fileBlocks" :key="'file-'+i" class="extra-card file-card">
        <span class="file-icon">📄</span>
        <span class="file-name">{{ f.source?.filename || '文件' }}</span>
      </div>
    </div>

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

  const withoutIde = s.replace(/<ide_[^>]*>[\s\S]*?<\/ide_[^>]*>/g, (m) => {
    ideBlocks.push(m)
    return '\n'
  })
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

const imageBlocks = computed(() => contentBlocks.value.filter(b =>
  (b?.type === 'image' && b.source) || (b?.type === 'input_image' && b.image_url)
))
const fileBlocks = computed(() => contentBlocks.value.filter(b =>
  (b?.type === 'file' && b.source) || (b?.type === 'input_file' && b.file_url)
))
const rawText = computed(() => {
  const blocks = contentBlocks.value
  const textParts = blocks
    .filter(b => (b?.type === 'text' || b?.type === 'input_text' || b?.type === 'output_text') && typeof b.text === 'string')
    .map(b => b.text)
    .join('')
    // 过滤 Codex 的 <image> 包裹标签
    .replace(/<image\s[^>]*>/g, '')
    .replace(/<\/image>/g, '')
  if (textParts) return textParts
  if (typeof props.msg?.text === 'string' && props.msg.text.trim()) return props.msg.text
  return ''
})

const split = computed(() => splitTextAndCode(rawText.value || ''))
const codeBlocks = computed(() => split.value.codeBlocks)
const ideBlocks = computed(() => split.value.ideBlocks)
const plainText = computed(() => split.value.plain)

const hasExtras = computed(() => codeBlocks.value.length || ideBlocks.value.length || imageBlocks.value.length || fileBlocks.value.length)

function getImageSrc(block) {
  if (!block) return ''
  // Codex 格式：image_url 是完整的 data URL
  if (block.image_url) return block.image_url
  // Claude/Anthropic 格式：source 对象
  if (block.source) {
    if (block.source.type === 'base64') {
      const mediaType = block.source.media_type || 'image/png'
      return `data:${mediaType};base64,${block.source.data}`
    }
    return block.source.uri || block.source.url || ''
  }
  return ''
}
</script>

<style scoped>
.user-msg {
  margin-left: auto; max-width: 78%;
  display: flex; flex-direction: column; gap: 6px;
}
.user-bubble {
  background: var(--cc-user-bg); color: var(--cc-user-text);
  padding: 8px 12px; border-radius: 12px 12px 3px 12px;
  line-height: 1.55; word-break: break-word; font-size: 13px;
  display: flex; flex-direction: column; gap: 4px;
}
.msg-text { white-space: pre-wrap; word-break: break-word; }
.msg-text:deep(.agent-markdown),
.msg-text.agent-markdown { color: inherit; }
.user-extras { display: flex; flex-direction: column; gap: 6px; }
.extra-card {
  border-radius: 8px; border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary); padding: 8px 10px;
}
.code-card :deep(.code-block) {
  margin: 0; display: inline-block; width: 78%;
  box-sizing: border-box;
}
.file-card { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--cc-text-secondary); }
.msg-img { max-width: 200px; height: auto; border-radius: 5px; cursor: zoom-in; display: block; }
.file-icon { font-size: 12px; }
.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
.ide-card { padding: 8px 10px; }
.ide-title { font-size: 10px; color: var(--cc-text-muted); font-family: 'Cascadia Code', Consolas, monospace; margin-bottom: 6px; }
.ide-pre {
  margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.5;
  color: var(--cc-text-secondary); font-family: 'Cascadia Code', Consolas, monospace;
  background: var(--cc-bg-secondary); border-radius: 6px; padding: 8px 10px;
  max-height: 320px; overflow: auto;
}
.user-bubble :deep(.code-block) {
  background: var(--cc-user-code-bg) !important; border: 1px solid var(--cc-user-code-border);
  border-radius: 6px; box-sizing: border-box;
}
.user-bubble :deep(.code-block .code-header) {
  color: rgba(255, 255, 255, 0.78);
  background: color-mix(in srgb, var(--cc-user-code-bg) 88%, #fff 12%);
}
.user-bubble :deep(.code-block .hljs) { background: transparent !important; padding: 0; color: var(--cc-user-code-text); }
.user-bubble :deep(.code-block pre),
.user-bubble :deep(.code-block code) { color: var(--cc-user-code-text); }
.user-bubble :deep(.inline-code) {
  background: var(--cc-user-code-bg); border-radius: 3px; padding: 1px 5px;
  font-size: 12px; color: var(--cc-user-code-text);
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
.user-bubble :deep(.md-table-scroll) { max-width: 100%; overflow-x: auto; }
.user-bubble :deep(.md-table-wrap) {
  display: inline-block; margin: 8px 0; border: 1px solid var(--cc-user-code-border);
  border-radius: 6px; background: var(--cc-user-code-bg);
}
.user-bubble :deep(.md-table) { border-collapse: collapse; font-size: 11px; }
.user-bubble :deep(.md-table th),
.user-bubble :deep(.md-table td) {
  border-right: 1px solid var(--cc-user-code-border);
  border-bottom: 1px solid var(--cc-user-code-border); text-align: left;
}
.user-bubble :deep(.md-table th) { color: var(--cc-user-heading); background: var(--cc-user-code-bg); font-weight: 700; position: sticky; top: 0; }
.user-bubble :deep(.md-table td) { color: var(--cc-user-code-text); }
.user-bubble :deep(.md-table th:last-child),
.user-bubble :deep(.md-table td:last-child) { border-right: none; }
</style>
