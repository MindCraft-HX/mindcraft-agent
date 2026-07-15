<template>
  <Teleport to="body">
    <transition name="git-drawer-fade">
      <div v-if="modelValue" class="git-drawer-overlay" @click.self="emit('update:modelValue', false)">
        <div class="git-drawer" :class="themeClass">
          <!-- Header -->
          <div class="git-drawer-header">
            <div class="git-drawer-header-left">
              <span class="git-drawer-title">{{ $t('git.changes') || 'Workspace Changes' }}</span>
              <span v-if="branch" class="git-drawer-branch">🔀 {{ branch }}</span>
            </div>
            <div class="git-drawer-header-right">
              <button
                class="git-drawer-btn"
                :title="$t('git.refresh') || 'Refresh'"
                @click="handleRefresh"
                :disabled="loading"
              >
                🔄
              </button>
              <button
                class="git-drawer-btn git-drawer-close"
                @click="emit('update:modelValue', false)"
                :title="$t('common.close') || 'Close'"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="loading" class="git-drawer-loading">
            <div class="git-drawer-spinner"></div>
            <span>{{ $t('common.loading') || 'Loading...' }}</span>
          </div>

          <!-- Error: not a git repo -->
          <div v-else-if="errorCode === 'NOT_GIT_REPO' || (errorCode === '' && !isGitRepo)" class="git-drawer-empty">
            <span class="git-drawer-empty-icon">📂</span>
            <p>{{ $t('git.noRepo') || 'Not a Git repository' }}</p>
          </div>

          <!-- Error: no CWD -->
          <div v-else-if="errorCode === 'NO_CWD'" class="git-drawer-empty">
            <span class="git-drawer-empty-icon">📁</span>
            <p>{{ $t('git.noCwd') || 'Open a project folder first' }}</p>
          </div>

          <!-- Error: git not found -->
          <div v-else-if="errorCode === 'GIT_NOT_FOUND'" class="git-drawer-empty">
            <span class="git-drawer-empty-icon">⚠️</span>
            <p>{{ $t('git.gitNotFound') || 'Git not found on this system' }}</p>
          </div>

          <!-- Error: generic -->
          <div v-else-if="errorCode && errorCode !== ''" class="git-drawer-empty">
            <span class="git-drawer-empty-icon">⚠️</span>
            <p>{{ $t('git.loadError') || 'Failed to fetch changes' }}</p>
            <button class="git-drawer-retry" @click="handleRefresh">
              {{ $t('git.retry') || 'Retry' }}
            </button>
          </div>

          <!-- Empty -->
          <div v-else-if="!loading && !entries.length" class="git-drawer-empty">
            <span class="git-drawer-empty-icon">✅</span>
            <p>{{ $t('git.noChanges') || 'No working tree changes' }}</p>
          </div>

          <!-- File list -->
          <div v-else class="git-drawer-body">
            <!-- Summary bar -->
            <div class="git-drawer-summary">
              <span v-if="summary.staged" class="git-summary-tag git-summary-tag--staged">
                {{ $t('git.staged') || 'Staged' }} {{ summary.staged }}
              </span>
              <span v-if="summary.unstaged" class="git-summary-tag git-summary-tag--unstaged">
                {{ $t('git.unstaged') || 'Modified' }} {{ summary.unstaged }}
              </span>
              <span v-if="summary.untracked" class="git-summary-tag git-summary-tag--untracked">
                {{ $t('git.untracked') || 'Untracked' }} {{ summary.untracked }}
              </span>
            </div>

            <!-- Groups -->
            <template v-for="group in groups" :key="group.key">
              <div v-if="group.entries.length" class="git-group">
                <div class="git-group-header">
                  <span class="git-group-title">{{ group.label }}</span>
                  <span class="git-group-count">{{ group.entries.length }}</span>
                </div>

                <div
                  v-for="entry in group.entries"
                  :key="entry.id"
                  class="git-file-entry"
                  :class="{ 'git-file-entry--active': expandedEntryId === entry.id }"
                >
                  <!-- File row -->
                  <div class="git-file-row" @click="props.gitState.toggleEntry(entry, props.cwd)">
                    <span class="git-file-status" :class="'git-file-status--' + entry.status">
                      {{ entry.status }}
                    </span>
                    <span class="git-file-path" :title="entry.relativePath">
                      <template v-if="entry.oldRelativePath && entry.oldRelativePath !== entry.relativePath">
                        <span class="git-file-path-old">{{ entry.oldRelativePath }}</span>
                        <span class="git-file-path-arrow"> → </span>
                      </template>
                      {{ entry.relativePath }}
                    </span>
                    <span class="git-file-stats">
                      <template v-if="entry.binary">
                        <span class="git-file-stat-binary">Binary</span>
                      </template>
                      <template v-else-if="entry.additions !== null">
                        <span class="git-file-stat git-file-stat--add">+{{ entry.additions }}</span>
                        <span class="git-file-stat git-file-stat--del">-{{ entry.deletions }}</span>
                      </template>
                    </span>
                    <button
                      v-if="entry.canOpen"
                      class="git-file-open-btn"
                      :title="$t('git.openFile') || 'Open file'"
                      @click.stop="handleOpenFile(entry)"
                    >
                      📂
                    </button>
                  </div>

                  <!-- Diff preview -->
                  <div v-if="expandedEntryId === entry.id" class="git-file-diff">
                    <div v-if="isDiffLoading(entry)" class="git-diff-loading">
                      <div class="git-drawer-spinner git-drawer-spinner--sm"></div>
                    </div>

                    <div v-else-if="isDiffError(entry)" class="git-diff-error">
                      <span>{{ $t('git.diffLoadError') || 'Failed to load diff' }}</span>
                    </div>

                    <template v-else>
                      <div v-if="diffData(entry)?.binary" class="git-diff-binary">
                        {{ $t('git.binaryNoPreview') || 'Binary file - no text preview available' }}
                      </div>
                      <div v-else-if="!diffData(entry)?.diff" class="git-diff-empty">
                        {{ $t('git.noChanges') || 'No changes' }}
                      </div>
                      <GitUnifiedDiffView
                        v-else
                        :hunks="parsedDiffHunks(entry)"
                        :binary="false"
                        :truncated="diffData(entry)?.truncated || false"
                        :truncatedAtLines="diffData(entry)?.truncatedAtLines"
                      />
                    </template>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useClaudeThemeStore } from '../../../stores/claudeTheme.js'
import GitUnifiedDiffView from './GitUnifiedDiffView.vue'
import { parseSingleFileDiff } from '../utils/unifiedDiff.js'

// ── Props / Emits ──

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  cwd: { type: String, default: '' },
  // Injected by parent: useGitWorkspaceChanges instance
  gitState: { type: Object, required: true },
})

const emit = defineEmits(['update:modelValue', 'toggleEntry', 'openFile', 'refresh'])

// ── Theme ──

const claudeTheme = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)

// ── Shortcuts from injected state ──

const loading = computed(() => props.gitState.loading.value)
const entries = computed(() => props.gitState.entries.value)
const isGitRepo = computed(() => props.gitState.isGitRepo.value)
const branch = computed(() => props.gitState.branch.value)
const summary = computed(() => props.gitState.summary.value)
const errorCode = computed(() => props.gitState.errorCode.value)
const expandedEntryId = computed(() => props.gitState.expandedEntryId.value)

// ── Grouped entries ──

const groups = computed(() => {
  const grouped = props.gitState.getGroupedEntries()
  return [
    {
      key: 'staged',
      label: props.gitState.$t ? (props.gitState.$t('git.staged') || 'Staged Changes') : 'Staged Changes',
      entries: grouped.staged,
    },
    {
      key: 'unstaged',
      label: props.gitState.$t ? (props.gitState.$t('git.unstaged') || 'Unstaged Changes') : 'Unstaged Changes',
      entries: grouped.unstaged,
    },
    {
      key: 'untracked',
      label: props.gitState.$t ? (props.gitState.$t('git.untracked') || 'Untracked') : 'Untracked',
      entries: grouped.untracked,
    },
  ].filter(g => g.entries.length)
})

// ── Diff helpers ──

function diffData(entry) {
  return props.gitState.getDiff(entry)
}

function isDiffLoading(entry) {
  return props.gitState.isDiffLoading(entry)
}

function isDiffError(entry) {
  return props.gitState.isDiffError(entry)
}

/**
 * Parse diff on demand (lazy).
 * Cache parsed hunks per entry id.
 */
const parsedHunksCache = new Map()
const parsedHunksVersion = new Map()

function parsedDiffHunks(entry) {
  if (!entry) return []
  const data = diffData(entry)
  if (!data || !data.diff) return []

  const key = entry.id
  const version = data.diff.length + '_' + (data.truncated ? '1' : '0')

  if (parsedHunksCache.has(key) && parsedHunksVersion.get(key) === version) {
    return parsedHunksCache.get(key)
  }

  const parsed = parseSingleFileDiff(data.diff)
  const hunks = parsed ? parsed.hunks : []

  parsedHunksCache.set(key, hunks)
  parsedHunksVersion.set(key, version)

  return hunks
}

// ── Watch: open/close ──

watch(() => props.modelValue, (val) => {
  if (val && props.cwd) {
    props.gitState.refresh(props.cwd)
  } else if (!val) {
    parsedHunksCache.clear()
    parsedHunksVersion.clear()
  }
})

// ── Handlers ──

function handleRefresh() {
  if (!loading.value && props.cwd) {
    parsedHunksCache.clear()
    parsedHunksVersion.clear()
    props.gitState.refresh(props.cwd)
    emit('refresh')
  }
}

function handleOpenFile(entry) {
  if (!entry || !entry.canOpen || !entry.absolutePath) return

  const api = window.electronAPI
  if (api && api.openMdWin) {
    api.openMdWin({
      filePath: entry.absolutePath,
      name: entry.relativePath,
      source: 'git-changes-drawer',
    })
  }

  emit('openFile', entry)
}

// ── ESC to close ──

function onKeyDown(e) {
  if (e.key === 'Escape' && props.modelValue) {
    emit('update:modelValue', false)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
/* ── Overlay & Drawer ── */

.git-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 8000;
  display: flex;
  justify-content: flex-end;
}

.git-drawer {
  width: 420px;
  max-width: 90vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--cc-bg-deepest, #0d0d0d);
  border-left: 1px solid var(--cc-border-strong, #333);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

/* ── Header ── */

.git-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--cc-border-light, #2a2a2a);
  background: var(--cc-bg-surface, #1a1a1a);
  flex-shrink: 0;
  min-height: 44px;
  -webkit-app-region: no-drag;
}

.git-drawer-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.git-drawer-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cc-text-primary, #e0e0e0);
  white-space: nowrap;
}

.git-drawer-branch {
  font-size: 12px;
  color: var(--cc-text-secondary, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.git-drawer-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.git-drawer-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--cc-text-secondary, #888);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.git-drawer-btn:hover {
  background: var(--cc-bg-hover, #333);
  color: var(--cc-text-primary, #e0e0e0);
}

.git-drawer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.git-drawer-close:hover {
  color: var(--cc-danger-text, #f44336);
}

/* ── Loading / Empty ── */

.git-drawer-loading,
.git-drawer-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--cc-text-secondary, #888);
  padding: 24px;
}

.git-drawer-empty-icon {
  font-size: 32px;
}

.git-drawer-empty p {
  margin: 0;
  font-size: 13px;
  text-align: center;
}

.git-drawer-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--cc-border-light, #333);
  border-top-color: var(--cc-accent, #4caf50);
  border-radius: 50%;
  animation: git-spin 0.8s linear infinite;
}

.git-drawer-spinner--sm {
  width: 16px;
  height: 16px;
  border-width: 1.5px;
}

@keyframes git-spin {
  to { transform: rotate(360deg); }
}

.git-drawer-retry {
  padding: 6px 16px;
  border: 1px solid var(--cc-border-light, #444);
  border-radius: 4px;
  background: var(--cc-bg-surface, #1a1a1a);
  color: var(--cc-text-primary, #e0e0e0);
  font-size: 12px;
  cursor: pointer;
}

.git-drawer-retry:hover {
  background: var(--cc-bg-hover, #333);
}

/* ── Summary bar ── */

.git-drawer-summary {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.git-summary-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
}

.git-summary-tag--staged {
  background: var(--cc-diff-add-bg, #1a3a1a);
  color: var(--cc-diff-add-prefix, #4caf50);
}

.git-summary-tag--unstaged {
  background: var(--cc-diff-del-bg, #3a1a1a);
  color: var(--cc-warning-text, #e6a23c);
}

.git-summary-tag--untracked {
  background: var(--cc-bg-surface, #1a1a1a);
  color: var(--cc-text-secondary, #888);
}

/* ── Body ── */

.git-drawer-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.git-drawer-body::-webkit-scrollbar {
  width: 5px;
}

.git-drawer-body::-webkit-scrollbar-thumb {
  background: var(--cc-scrollbar-thumb, #444);
  border-radius: 3px;
}

/* ── Group ── */

.git-group {
  border-bottom: 1px solid var(--cc-border-light, #2a2a2a);
}

.git-group:last-child {
  border-bottom: none;
}

.git-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--cc-bg-surface, #1a1a1a);
  position: sticky;
  top: 0;
  z-index: 1;
}

.git-group-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cc-text-secondary, #888);
}

.git-group-count {
  font-size: 11px;
  color: var(--cc-text-secondary, #666);
  background: var(--cc-bg-hover, #333);
  padding: 1px 6px;
  border-radius: 8px;
}

/* ── File Entry ── */

.git-file-entry {
  border-top: 1px solid var(--cc-border-lightest, #222);
}

.git-file-row {
  display: flex;
  align-items: center;
  padding: 5px 12px;
  gap: 8px;
  cursor: pointer;
  transition: background 0.12s;
  min-height: 30px;
}

.git-file-row:hover {
  background: var(--cc-bg-hover, #2a2a2a);
}

.git-file-entry--active > .git-file-row {
  background: var(--cc-bg-selected, #1a3a5c);
}

/* ── Status badge ── */

.git-file-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
}

.git-file-status--M { background: #e6a23c; color: #1a1a1a; }
.git-file-status--A { background: #4caf50; color: #fff; }
.git-file-status--D { background: #f44336; color: #fff; }
.git-file-status--R { background: #42a5f5; color: #fff; }
.git-file-status--C { background: #ab47bc; color: #fff; }
.git-file-status--U { background: #ff7043; color: #fff; }
.git-file-status--\?\? { background: var(--cc-bg-hover, #444); color: var(--cc-text-secondary, #888); }

/* ── File path ── */

.git-file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-family: 'Cascadia Code', Consolas, monospace;
  color: var(--cc-text-primary, #e0e0e0);
}

.git-file-path-old {
  color: var(--cc-text-secondary, #888);
  text-decoration: line-through;
}

.git-file-path-arrow {
  color: var(--cc-text-secondary, #666);
  font-family: inherit;
}

/* ── Stats ── */

.git-file-stats {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  font-size: 11px;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.git-file-stat--add { color: var(--cc-diff-add-prefix, #4caf50); }
.git-file-stat--del { color: var(--cc-diff-del-prefix, #f44336); }
.git-file-stat-binary { color: var(--cc-text-secondary, #888); font-style: italic; }

/* ── Open file button ── */

.git-file-open-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity 0.12s, background 0.12s;
}

.git-file-open-btn:hover {
  opacity: 1;
  background: var(--cc-bg-hover, #333);
}

/* ── Diff preview ── */

.git-file-diff {
  border-top: 1px solid var(--cc-border-lightest, #222);
  max-height: 360px;
  overflow: auto;
}

.git-file-diff::-webkit-scrollbar { width: 4px; height: 4px; }
.git-file-diff::-webkit-scrollbar-thumb {
  background: var(--cc-scrollbar-thumb, #444);
  border-radius: 2px;
}

.git-diff-loading,
.git-diff-error,
.git-diff-binary,
.git-diff-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--cc-text-secondary, #888);
}

.git-diff-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.git-diff-error {
  color: var(--cc-danger-text, #f44336);
}

/* ── Transition ── */

.git-drawer-fade-enter-active,
.git-drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.git-drawer-fade-enter-active .git-drawer,
.git-drawer-fade-leave-active .git-drawer {
  transition: transform 0.2s ease;
}

.git-drawer-fade-enter-from,
.git-drawer-fade-leave-to {
  opacity: 0;
}

.git-drawer-fade-enter-from .git-drawer,
.git-drawer-fade-leave-to .git-drawer {
  transform: translateX(100%);
}
</style>
