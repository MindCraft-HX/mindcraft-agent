<template>
  <div class="home-page" :class="themeClass">
    <div class="home-hero">
      <h1 class="hero-title">欢迎使用 MindCraft</h1>
      <p class="hero-sub">选择一种方式开始工作</p>
    </div>

    <div class="home-cards">
      <!-- 开始项目对话 -->
      <div class="home-card home-card-project" @click="router.push('/main/codeHub')">
        <div class="card-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="11 8 5 16 11 24"/>
            <polyline points="21 8 27 16 21 24"/>
          </svg>
        </div>
        <div class="card-content">
          <h3 class="card-title">开始项目对话</h3>
          <template v-if="recentProject.hasRecent">
            <p class="card-desc">
              <span class="badge" :style="{ background: recentProject.agentColor }">
                {{ recentProject.agentName }}
              </span>
              {{ recentProject.projectName }}
            </p>
            <p class="card-meta" v-if="recentProject.chatName">
              {{ recentProject.chatName }} · {{ formatTime(recentProject.updatedAt) }}
            </p>
          </template>
          <template v-else>
            <p class="card-desc muted">暂无最近项目，点击开始第一个对话</p>
          </template>
        </div>
        <div class="card-arrow">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="6 3 12 9 6 15"/>
          </svg>
        </div>
      </div>

      <!-- 浏览文档 -->
      <div class="home-card home-card-doc" @click="router.push('/main/mdViewer')">
        <div class="card-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 4H8.5a2.5 2.5 0 0 0-2.5 2.5v19a2.5 2.5 0 0 0 2.5 2.5h15a2.5 2.5 0 0 0 2.5-2.5V12l-6-8z"/>
            <polyline points="18 4 18 12 26 12"/>
          </svg>
        </div>
        <div class="card-content">
          <h3 class="card-title">浏览文档</h3>
          <p class="card-desc muted">查看和管理项目中的 Markdown、PDF、Office 文档</p>
        </div>
        <div class="card-arrow">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="6 3 12 9 6 15"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- 用量统计 -->
    <div class="home-stats">
      <div class="stats-header">
        <h2 class="stats-title">用量统计</h2>
        <div class="trend-toggle">
          <button :class="{ active: trendDays === 7 }" @click="trendDays = 7">7天</button>
          <button :class="{ active: trendDays === 30 }" @click="trendDays = 30">30天</button>
        </div>
      </div>

      <div class="stats-body">
        <div class="stats-today">
          <div class="stat-item">
            <span class="stat-label">输入</span>
            <span class="stat-value">{{ formatNumber(todayStats.combined.inputTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">输出</span>
            <span class="stat-value">{{ formatNumber(todayStats.combined.outputTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">缓存</span>
            <span class="stat-value">{{ formatNumber(todayStats.combined.cacheReadTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">费用</span>
            <span class="stat-value accent">{{ formatCost(todayStats.combined.costUsd) }}</span>
          </div>
        </div>
        <div class="stats-chart">
          <TokenChart v-if="trendData.length" :data="trendData" />
          <div v-else class="chart-empty">暂无用量数据</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useClaudeThemeStore } from '@mindcraft/agent'
import TokenChart from '@/components/Home/TokenChart.vue'
import { useHomeData, formatNumber, formatCost, formatTime } from '@/components/Home/useHomeData.js'

const router = useRouter()
const claudeTheme = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)

const { recentProject, todayStats, trendData, trendDays } = useHomeData()
</script>

<style lang="scss" scoped>
.home-page {
  height: 100%;
  overflow-y: auto;
  padding: 36px 40px;
  background: var(--cc-bg-secondary, #1e1e1e);
}

/* ===== Hero ===== */
.home-hero {
  margin-bottom: 28px;
}

.hero-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--cc-text, #e0e0e0);
  margin: 0 0 6px;
}

.hero-sub {
  font-size: 14px;
  color: var(--cc-text-muted, #bbb);
  margin: 0;
}

/* ===== Cards ===== */
.home-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.home-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 10px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg, #1a1a1a);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
  user-select: none;

  &:hover {
    border-color: var(--cc-primary, #c6613f);
    background: var(--cc-panel-item-hover, #1e1e1e);
    box-shadow: 0 0 0 1px var(--cc-primary, #c6613f);

    .card-arrow {
      opacity: 1;
      transform: translateX(2px);
      color: var(--cc-primary, #c6613f);
    }
  }

  &:active {
    transform: scale(0.99);
  }
}

.card-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: var(--cc-primary-bg, #1c1408);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cc-primary, #c6613f);
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
  margin: 0 0 5px;
}

.card-desc {
  font-size: 13px;
  color: var(--cc-text-secondary, #d4d4d4);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  &.muted {
    color: var(--cc-text-muted, #bbb);
  }
}

.card-meta {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  margin: 3px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-arrow {
  color: var(--cc-text-dim, #888);
  opacity: 0.4;
  transition: all 0.18s;
  flex-shrink: 0;
}

.badge {
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  padding: 1px 8px;
  border-radius: 3px;
  white-space: nowrap;
  letter-spacing: 0.2px;
}

/* ===== Stats ===== */
.home-stats {
  border-radius: 10px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg, #1a1a1a);
  overflow: hidden;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.stats-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
  margin: 0;
}

.trend-toggle {
  display: flex;
  gap: 2px;
  background: var(--cc-bg-secondary, #1e1e1e);
  border-radius: 6px;
  padding: 2px;

  button {
    padding: 4px 14px;
    font-size: 12px;
    font-weight: 500;
    color: var(--cc-text-muted, #bbb);
    background: transparent;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      color: var(--cc-text, #e0e0e0);
    }

    &.active {
      color: var(--cc-btn-primary-text, #fff);
      background: var(--cc-primary, #c6613f);
    }
  }
}

.stats-body {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 28px;
  padding: 16px 24px 24px;
}

.stats-today {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat-label {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  letter-spacing: 0.3px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--cc-text, #e0e0e0);
  font-variant-numeric: tabular-nums;

  &.accent {
    color: var(--cc-primary, #c6613f);
  }
}

.stats-chart {
  min-height: 220px;
  position: relative;
}

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 220px;
  color: var(--cc-text-dim, #888);
  font-size: 13px;
}
</style>
