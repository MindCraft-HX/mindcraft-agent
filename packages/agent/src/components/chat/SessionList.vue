<template>
  <div class="session-list" :class="{ collapsed: collapsed }">
    <!-- 头部 -->
    <div class="sl-header">
      <span v-if="!collapsed" class="sl-title">对话列表</span>
      <button class="sl-new-btn" @click="$emit('new-session')" title="新建对话">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="8" y1="3" x2="8" y2="13"/>
          <line x1="3" y1="8" x2="13" y2="8"/>
        </svg>
      </button>
    </div>

    <!-- 会话列表 -->
    <div class="sl-items">
      <div
        v-for="s in sessions"
        :key="s.id"
        class="sl-item"
        :class="{ active: s.id === currentId }"
        @click="$emit('switch', s.id)"
      >
        <div class="sl-item-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M2.5 3h8a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H6l-3.5 2.5V4.5A1.5 1.5 0 0 1 4 3z"/>
          </svg>
        </div>
        <div class="sl-item-body" v-if="!collapsed">
          <span class="sl-item-title">{{ s.title || '新对话' }}</span>
          <span class="sl-item-meta">{{ providerLabel(s.provider) }} · {{ timeLabel(s.updatedAt) }}</span>
        </div>
        <button
          v-if="!collapsed"
          class="sl-delete-btn"
          @click.stop="$emit('delete', s.id)"
          title="删除"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="4" y1="4" x2="12" y2="12"/>
            <line x1="12" y1="4" x2="4" y2="12"/>
          </svg>
        </button>
      </div>

      <div v-if="!sessions.length && !collapsed" class="sl-empty">
        暂无对话
      </div>
    </div>

    <!-- 折叠按钮 -->
    <button class="sl-toggle" @click="$emit('toggle')" :title="collapsed ? '展开' : '收起'">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <polyline v-if="collapsed" points="4 2 8 6 4 10"/>
        <polyline v-else points="8 2 4 6 8 10"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
defineProps({
  sessions: { type: Array, default: () => [] },
  currentId: { type: String, default: null },
  collapsed: { type: Boolean, default: false },
})

defineEmits(['new-session', 'switch', 'delete', 'toggle'])

function providerLabel(p) {
  return p === 'codex' ? 'CodeX' : 'Claude'
}

function timeLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}/${day}`
}
</script>

<style lang="scss" scoped>
.session-list {
  display: flex;
  flex-direction: column;
  width: 220px;
  min-width: 220px;
  border-right: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg-deepest, #0d1117);
  transition: width 0.2s, min-width 0.2s;

  &.collapsed {
    width: 48px;
    min-width: 48px;
  }
}

.sl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--cc-border, #2a2a2a);

  .collapsed & {
    justify-content: center;
    padding: 12px 8px;
  }
}

.sl-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
}

.sl-new-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--cc-text-muted, #bbb);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    background: var(--cc-bg-hover, rgba(255,255,255,0.08));
    color: var(--cc-text, #e0e0e0);
  }
}

.sl-items {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.sl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
  position: relative;

  &:hover {
    background: var(--cc-bg-hover, rgba(255,255,255,0.06));
  }

  &.active {
    background: var(--cc-primary-bg, rgba(64,158,255,0.12));

    .sl-item-title {
      color: var(--cc-primary, #409eff);
    }
  }

  .collapsed & {
    justify-content: center;
    padding: 10px;
  }
}

.sl-item-icon {
  flex-shrink: 0;
  color: var(--cc-text-muted, #8b949e);
  display: flex;
}

.sl-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sl-item-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--cc-text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sl-item-meta {
  font-size: 10px;
  color: var(--cc-text-dim, #888);
}

.sl-delete-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--cc-text-dim, #888);
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;

  .sl-item:hover & {
    display: flex;
  }

  &:hover {
    background: rgba(220, 50, 50, 0.15);
    color: #f87171;
  }
}

.sl-empty {
  text-align: center;
  padding: 20px 12px;
  font-size: 12px;
  color: var(--cc-text-dim, #888);
}

.sl-toggle {
  width: 100%;
  height: 32px;
  border: none;
  border-top: 1px solid var(--cc-border, #2a2a2a);
  background: transparent;
  color: var(--cc-text-dim, #888);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;

  &:hover {
    color: var(--cc-text, #e0e0e0);
  }
}
</style>
