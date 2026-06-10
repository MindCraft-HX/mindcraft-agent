<template>
  <div class="cc-sidebar" :class="{ collapsed: !sidebarOpen }">
    <div class="sidebar-header">
      <span v-if="sidebarOpen" class="sidebar-title">对话</span>
      <div class="sidebar-header-actions">
        <button
          v-if="sidebarOpen"
          class="sidebar-icon-btn"
          :disabled="locked"
          @click="emit('openSettings')"
          title="设置"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"/>
          </svg>
        </button>
        <button
          class="sidebar-toggle"
          type="button"
          @click="emit('update:sidebarOpen', !sidebarOpen)"
          :title="sidebarOpen ? '收起' : '展开'"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path v-if="sidebarOpen" d="M11.354 1.646a.5.5 0 010 .708L5.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/>
            <path v-else d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/>
          </svg>
        </button>
      </div>
    </div>

    <template v-if="sidebarOpen">

      <div class="sidebar-list">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="sidebar-item"
          :class="{ active: tab.id === activeId }"
          @click="emit('switchTab', tab.id)"
        >
          <template v-if="renamingId === tab.id">
            <input
              class="rename-input"
              :value="renamingText"
              ref="renameInputEl"
              @input="onRenameInput"
              @keydown.enter="emit('confirmRename')"
              @keydown.esc="emit('cancelRename')"
              @blur="emit('confirmRename')"
              @click.stop
            />
          </template>
          <template v-else>
            <span class="sidebar-item-name" :title="tab.name">{{ tab.name }}</span>
            <div class="sidebar-item-actions">
              <button class="sib-btn" type="button" :disabled="locked" @click.stop="emit('startRename', tab)" title="重命名">✎</button>
              <button class="sib-btn del" type="button" :disabled="locked" @click.stop="emit('requestDelete', tab)" title="删除对话">×</button>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  tabs: { type: Array, default: () => [] },
  activeId: { type: String, default: null },
  sidebarOpen: { type: Boolean, default: true },
  renamingId: { type: String, default: null },
  renamingText: { type: String, default: '' },
  locked: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:sidebarOpen',
  'update:renamingText',
  'newTab',
  'switchTab',
  'startRename',
  'confirmRename',
  'cancelRename',
  'requestDelete',
  'openSettings',
])

const renameInputEl = ref(null)

function onRenameInput(e) {
  emit('update:renamingText', e.target.value)
}

watch(
  () => props.renamingId,
  async (id) => {
    if (!id) return
    await nextTick()
    // v-for ref 是数组
    renameInputEl.value?.[0]?.focus?.()
  }
)
</script>

<style scoped>
.cc-sidebar {
  width: 200px;
  height: 100%;
  flex-shrink: 0;
  background: var(--cc-panel-bg);
  border-right: 1px solid var(--cc-panel-border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
}
.cc-sidebar.collapsed { width: 36px; }
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--cc-border);
}
.sidebar-title { font-size: 11px; color: var(--cc-panel-title); font-weight: 600; letter-spacing: 0.05em; }
.sidebar-header-actions { display: flex; align-items: center; gap: 4px; }
.sidebar-icon-btn,
.sidebar-toggle {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: none;
  border: none;
  color: var(--cc-panel-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sidebar-icon-btn:hover { background: var(--cc-panel-item-hover); color: var(--cc-primary); }
.sidebar-toggle:hover { background: var(--cc-panel-item-hover); color: var(--cc-primary); }
.sidebar-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.sidebar-new-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  color: var(--cc-panel-text);
  font-size: 12px;
  cursor: pointer;
}
.sidebar-new-btn:hover { background: var(--cc-bg-elevated); color: var(--cc-primary); border-color: var(--cc-menu-border); }
.sidebar-new-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.sidebar-list { flex: 1; overflow-y: auto; padding: 4px 6px; }
.sidebar-list::-webkit-scrollbar { width: 3px; }
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  min-height: 30px;
  transition: background 0.1s;
}
.sidebar-item:hover { background: var(--cc-panel-item-hover); }
.sidebar-item.active { background: var(--cc-panel-item-active); }
.sidebar-item-name {
  flex: 1;
  font-size: 12px;
  color: var(--cc-panel-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.sidebar-item.active .sidebar-item-name { color: var(--cc-panel-active-text); }
.sidebar-item-actions { display: none; gap: 2px; flex-shrink: 0; }
.sidebar-item:hover .sidebar-item-actions { display: flex; }
.sib-btn {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  background: none;
  border: none;
  color: var(--cc-panel-text);
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sib-btn:hover { background: var(--cc-btn-bg); color: var(--cc-btn-text); }
.sib-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.sib-btn.del:hover { background: var(--cc-error-bg); color: var(--cc-error); }
.rename-input {
  flex: 1;
  background: var(--cc-bg);
  border: 1px solid var(--cc-primary);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--cc-panel-active-text);
  font-size: 12px;
  outline: none;
}
</style>

