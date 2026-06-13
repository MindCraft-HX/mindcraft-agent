<template>
  <div class="locale-popover">
    <div
      v-for="l in localeStore.locales"
      :key="l.key"
      class="locale-option"
      :class="{ active: localeStore.locale === l.key }"
      @click="localeStore.setLocale(l.key)"
    >
      <span class="locale-name">{{ l.label }}</span>
      <svg v-if="localeStore.locale === l.key" class="locale-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { useLocaleStore } from '@/stores/locale'

const localeStore = useLocaleStore()
</script>

<style scoped>
.locale-popover {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}

.locale-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
  font-size: 13px;
  color: var(--cc-text, #e0e0e0);
  user-select: none;
}

.locale-option:hover {
  background: var(--cc-panel-item-hover, #252525);
}

.locale-option.active {
  color: var(--cc-primary, #c6613f);
}

.locale-check {
  color: var(--cc-primary, #c6613f);
  flex-shrink: 0;
}

.locale-name {
  font-weight: 500;
}
</style>
