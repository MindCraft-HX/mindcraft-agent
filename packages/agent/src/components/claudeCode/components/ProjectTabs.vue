<template>
  <div class="project-tabs-bar">
    <div class="project-tabs">
      <div
        v-for="(p, idx) in projects"
        :key="p.id"
        class="project-tab"
        :class="{
          active: p.id === activeProjectId,
          'task-done': p.hasDoneNotification,
          'session-running': p.runningCount > 0,
          'session-pending': p.hasPendingTool,
          'drag-over': dragOverIndex === idx,
          dragging: dragIndex === idx,
        }"
        draggable="true"
        @click="$emit('switchProject', p.id)"
        @contextmenu.prevent="showContextMenu($event, p)"
        @dragstart="onDragStart($event, idx)"
        @dragover.prevent="onDragOver($event, idx)"
        @dragleave="onDragLeave"
        @dragend="onDragEnd($event)"
        @drop="onDrop($event, idx)"
        :title="p.cwdLocked ? p.cwd : $t('codehub.noFolder')"
      >
        <span class="project-tab-title">
          <span v-if="p.hasPendingTool" class="pending-dot" :title="$t('codehub.waitingUser')"></span>
          <span v-else-if="p.runningCount === 1" class="running-dot" :title="$t('codehub.running')"></span>
          <span v-else-if="p.runningCount >= 2" class="running-badge" :title="$t('codehub.sessionsRunning', { n: p.runningCount })">{{ p.runningCount }}</span>
          {{ p.cwdLocked ? (p.cwd.split(/[\\/]/).pop() || $t('codehub.folder')) : $t('codehub.noFolder') }}
        </span>
        <button class="project-tab-close" type="button" @click.stop="$emit('deleteProject', p)">×</button>
      </div>
    </div>
    <button class="add-project-btn" @click="$emit('newProject')" :title="$t('codehub.newTab')">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/></svg>
    </button>

    <!-- 右键菜单 -->
    <div v-if="contextMenuVisible" class="context-menu" :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }">
      <div class="menu-item" @click="handleCloseThis">
        <span class="menu-icon">✕</span> {{ $t('codehub.closeTab') }}
      </div>
      <div class="menu-item" @click="handleCloseAll">
        <span class="menu-icon">✖</span> {{ $t('codehub.closeAllTabs') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  projects: { type: Array, default: () => [] },
  activeProjectId: { type: String, default: null },
})

const emit = defineEmits([
  'switchProject',
  'deleteProject',
  'newProject',
  'closeAll',
  'reorderProjects',
])

const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextProject = ref(null)

function showContextMenu(e, project) {
  contextProject.value = project
  contextMenuX.value = e.clientX
  contextMenuY.value = e.clientY + 30
  contextMenuVisible.value = true
  const hide = () => {
    contextMenuVisible.value = false
    document.removeEventListener('click', hide)
  }
  setTimeout(() => document.addEventListener('click', hide), 0)
}

function handleCloseThis() {
  if (contextProject.value) emit('deleteProject', contextProject.value)
  contextMenuVisible.value = false
}

function handleCloseAll() {
  emit('closeAll')
  contextMenuVisible.value = false
}

// ── TAB 拖拽排序 ──
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)

function onDragStart(e, index) {
  dragIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(index))
  if (e.target) {
    e.target.style.opacity = '0.45'
  }
}

function onDragOver(e, index) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = -1
}

function onDragEnd(e) {
  if (e.target) {
    e.target.style.opacity = ''
  }
  dragIndex.value = -1
  dragOverIndex.value = -1
}

function onDrop(e, toIndex) {
  e.preventDefault()
  const fromIndex = dragIndex.value
  if (e.target) {
    e.target.style.opacity = ''
  }
  dragIndex.value = -1
  dragOverIndex.value = -1
  if (fromIndex < 0 || fromIndex === toIndex) return
  emit('reorderProjects', { fromIndex, toIndex })
}
</script>

<style scoped>
.project-tabs-bar {
  display: flex; align-items: center; background: var(--cc-bg-tertiary);
  border-bottom: 1px solid var(--cc-border); min-height: 32px; height: 32px;
  overflow-x: auto; overflow-y: hidden; user-select: none; flex-shrink: 0;
  padding: 0 4px;
  gap: 6px;
}

.project-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.project-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 8px 0 10px;
  border-radius: 0;
  border: 0;
  border-right: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-secondary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  min-width: 92px;
  max-width: 220px;
  transition: background 0.12s, color 0.12s;
}
.project-tab:hover {
  background: var(--cc-border);
  color: var(--cc-text);
}
.project-tab.active {
  background: var(--cc-bg);
  color: var(--cc-btn-text-hover);
  font-weight: 600;
  border-bottom: 2px solid var(--cc-primary);
  box-shadow: 0 -2px 10px var(--cc-shadow);
  position: relative;
  z-index: 1;
}
.project-tab-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-flex;
  align-items: center;
}
.running-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cc-warning);
  margin-right: 6px;
  flex-shrink: 0;
  animation: running-pulse 1.2s ease-in-out infinite;
}
@keyframes running-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}
.running-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 14px;
  padding: 0 4px;
  border-radius: 7px;
  background: var(--cc-warning);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  margin-right: 6px;
  flex-shrink: 0;
}
.pending-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cc-warning);
  margin-right: 6px;
  flex-shrink: 0;
  animation: pending-pulse 1.4s ease-in-out infinite;
}
@keyframes pending-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}
.project-tab.session-pending {
  color: var(--cc-warning);
  border-bottom: 2px solid var(--cc-warning);
}
.project-tab-close {
  width: 18px;
  height: 18px;
  border-radius: 0;
  border: none;
  background: transparent;
  color: var(--cc-text-dim);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  transition: background 0.12s, color 0.12s;
}
.project-tab:hover .project-tab-close { color: var(--cc-text-tertiary); }
.project-tab-close:hover { background: var(--cc-bg); color: var(--cc-btn-text-hover); }

.project-tab.dragging {
  opacity: 0.35;
}
.project-tab.drag-over {
  border-left: 2px solid var(--cc-primary);
  background: var(--cc-menu-hover);
}

.project-tab.task-done {
  color: var(--cc-warning);
  border-bottom: 2px solid var(--cc-warning);
  animation: tab-done-pulse 1.6s ease-in-out infinite;
}
.project-tab.task-done .project-tab-title {
  font-weight: 600;
}
@keyframes tab-done-pulse {
  0%, 100% { background: var(--cc-bg-secondary); }
  50% { background: var(--cc-warning-bg); }
}
.add-project-btn {
  width: 28px; height: 28px; border-radius: 4px;
  border: none; background: var(--cc-border); color: var(--cc-text-dim);
  cursor: pointer; display: flex; align-items: center;
  justify-content: center; margin-left: 4px; margin-right: 4px;
  flex-shrink: 0; transition: all 0.1s;
}
.add-project-btn:hover { background: var(--cc-menu-hover); color: var(--cc-primary); }

.context-menu {
  position: fixed;
  background: var(--cc-menu-bg);
  border: 1px solid var(--cc-menu-border);
  border-radius: 6px;
  box-shadow: 0 4px 16px var(--cc-shadow);
  z-index: 1000;
  min-width: 140px;
  padding: 4px 0;
}
.menu-item {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--cc-menu-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.1s;
}
.menu-item:hover { background: var(--cc-menu-hover); }
.menu-icon { color: var(--cc-text-dim); }
</style>
