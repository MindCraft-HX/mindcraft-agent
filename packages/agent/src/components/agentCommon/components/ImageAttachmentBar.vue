<template>
  <div v-if="images?.length" class="cc-imgbar">
    <template v-for="(img, i) in images" :key="i">
      <!-- 图片：缩略图+预览 -->
      <div v-if="img.isImage" class="img-wrap">
        <img
          :src="img.dataUrl"
          class="img-thumb"
          :title="$t('agent.clickViewLarge')"
          @click="emit('preview', img.dataUrl)"
        />
        <button class="img-rm" type="button" @click.stop="emit('remove', i)">×</button>
      </div>
      <!-- 非图片文件：文件徽章 -->
      <div v-else class="file-badge">
        <span class="file-icon">📄</span>
        <span class="file-name" :title="img.name">{{ img.name }}</span>
        <span class="file-size">{{ formatSize(img.size) }}</span>
        <button class="img-rm" type="button" @click.stop="emit('remove', i)">×</button>
      </div>
    </template>
  </div>
</template>

<script setup>
defineProps({
  images: { type: Array, default: () => [] },
})

const emit = defineEmits(['preview', 'remove'])

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}
</script>

<style scoped>
.cc-imgbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: var(--cc-bg-tertiary);
  border-top: 1px solid var(--cc-border);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  max-height: 60px;
}
.img-wrap {
  position: relative;
  flex-shrink: 0;
  max-width: 60px;
}
.img-thumb {
  width: 42px;
  height: 42px;
  object-fit: cover;
  border-radius: 5px;
  border: 1px solid var(--cc-border);
  display: block;
  cursor: zoom-in;
  max-height: 50px;
}
.file-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 6px;
  background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border);
  border-radius: 5px;
  flex-shrink: 0;
  max-width: 160px;
}
.file-icon { font-size: 14px; flex-shrink: 0; }
.file-name {
  font-size: 11px;
  color: var(--cc-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  font-size: 10px;
  color: var(--cc-text-dim);
  flex-shrink: 0;
}
.img-rm {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--cc-error);
  color: var(--cc-btn-primary-text);
  border: none;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
