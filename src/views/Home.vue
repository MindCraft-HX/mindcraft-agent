<template>
  <div class="home-page" :class="themeClass">
    <!-- 上方卡片区 -->
    <div class="home-cards">
      <!-- 开始项目对话 -->
      <div class="home-card home-card-project">
        <div class="home-card-inner">
          <div class="card-header">
            <svg class="card-icon" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9.5 7 4.5 14 9.5 21"/>
              <polyline points="18.5 7 23.5 14 18.5 21"/>
            </svg>
            <h2 class="card-title">开始项目对话</h2>
          </div>

          <div class="card-body">
            <template v-if="recentProject.hasRecent">
              <div class="project-info">
                <span class="project-agent-badge" :style="{ background: recentProject.agentColor }">
                  {{ recentProject.agentName }}
                </span>
                <span class="project-name">{{ recentProject.projectName }}</span>
                <span class="project-meta" v-if="recentProject.chatName">
                  {{ recentProject.chatName }} · {{ formatTime(recentProject.updatedAt) }}
                </span>
                <span class="project-cwd" v-if="recentProject.cwd">{{ recentProject.cwd }}</span>
              </div>
            </template>
            <template v-else>
              <div class="home-empty">
                <p class="home-empty-text">暂无最近项目</p>
                <p class="home-empty-hint">点击下方按钮开始你的第一个对话</p>
              </div>
            </template>
          </div>

          <button class="card-action" @click="$router.push('/main/codeHub')">
            进入项目
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="5 2.5 10 7 5 11.5"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 浏览文档 -->
      <div class="home-card home-card-doc">
        <div class="home-card-inner">
          <div class="card-header">
            <svg class="card-icon" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15.5 3.5H7.5a2 2 0 0 0-2 2v17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V10l-7-6.5z"/>
              <polyline points="15.5 3.5 15.5 10 22.5 10"/>
              <line x1="9.5" y1="16" x2="18.5" y2="16"/>
              <line x1="9.5" y1="20" x2="15.5" y2="20"/>
            </svg>
            <h2 class="card-title">浏览文档</h2>
          </div>

          <div class="card-body">
            <p class="card-desc">浏览和管理项目中的 Markdown 文档与笔记</p>
            <ul class="card-features">
              <li>Markdown 实时预览与语法高亮</li>
              <li>支持 PDF、Office 等格式查看</li>
              <li>目录导航，快速定位内容</li>
            </ul>
          </div>

          <button class="card-action" @click="$router.push('/main/mdViewer')">
            浏览文档
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="5 2.5 10 7 5 11.5"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 下方用量统计 -->
    <div class="home-stats">
      <div class="stats-header">
        <h2 class="stats-title">用量统计</h2>
        <div class="trend-toggle">
          <button
            class="trend-btn"
            :class="{ active: trendDays === 7 }"
            @click="trendDays = 7"
          >7天</button>
          <button
            class="trend-btn"
            :class="{ active: trendDays === 30 }"
            @click="trendDays = 30"
          >30天</button>
        </div>
      </div>

      <div class="stats-body">
        <!-- 今日数字 -->
        <div class="stats-today">
          <div class="stat-item">
            <span class="stat-label">输入 Tokens</span>
            <span class="stat-value">{{ formatNumber(todayStats.combined.inputTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">输出 Tokens</span>
            <span class="stat-value">{{ formatNumber(todayStats.combined.outputTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">缓存 Tokens</span>
            <span class="stat-value">{{ formatNumber(todayStats.combined.cacheReadTokens + todayStats.combined.cacheCreationTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">预估费用</span>
            <span class="stat-value stat-cost">{{ formatCost(todayStats.combined.costUsd) }}</span>
          </div>
        </div>

        <!-- 趋势图 -->
        <div class="stats-chart">
          <TokenChart :data="trendData" />
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

const { recentProject, todayStats, trendData, trendDays, refresh } = useHomeData()
</script>

<style lang="scss" scoped>
.home-page {
  height: 100%;
  padding: 28px 32px;
  overflow-y: auto;
  background: var(--cc-bg-secondary, #161b22);
}

/* ===== 卡片区 ===== */
.home-cards {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
}

.home-card {
  flex: 1;
  min-width: 280px;
  border-radius: 12px;
  border: 1px solid var(--cc-border, #30363d);
  background: var(--cc-bg-elevated, #0d1117);
  transition: border-color 0.2s, box-shadow 0.2s;
  overflow: hidden;

  &:hover {
    border-color: var(--cc-primary, #409eff);
    box-shadow: 0 2px 16px var(--cc-shadow, rgba(0,0,0,0.3));
  }
}

.home-card-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.card-icon {
  color: var(--cc-primary, #409eff);
  flex-shrink: 0;
}

.card-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--cc-text, #e0e5e9);
  margin: 0;
}

.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 80px;
}

/* 项目信息 */
.project-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-agent-badge {
  display: inline-block;
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  padding: 2px 10px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}

.project-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--cc-text, #e0e5e9);
}

.project-meta {
  font-size: 12px;
  color: var(--cc-text-muted, #8b949e);
}

.project-cwd {
  font-size: 11px;
  color: var(--cc-text-dim, #6b7280);
  font-family: 'SF Mono', 'Fira Code', monospace;
  word-break: break-all;
  line-height: 1.4;
}

/* 空状态 */
.home-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;

  .home-empty-text {
    font-size: 14px;
    color: var(--cc-text-muted, #8b949e);
    margin: 0;
  }

  .home-empty-hint {
    font-size: 12px;
    color: var(--cc-text-dim, #6b7280);
    margin: 0;
  }
}

/* 文档卡片 */
.card-desc {
  font-size: 14px;
  color: var(--cc-text-muted, #8b949e);
  margin: 0 0 12px;
}

.card-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  li {
    font-size: 12px;
    color: var(--cc-text-dim, #6b7280);
    padding-left: 14px;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 5px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--cc-primary, #409eff);
      opacity: 0.5;
    }
  }
}

/* 按钮 */
.card-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin-top: 16px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--cc-primary, #409eff);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;

  &:hover {
    background: var(--cc-primary-hover, #337ecc);
  }

  &:active {
    transform: scale(0.97);
  }

  svg {
    flex-shrink: 0;
    transition: transform 0.15s;
  }

  &:hover svg {
    transform: translateX(2px);
  }
}

/* ===== 用量统计 ===== */
.home-stats {
  border-radius: 12px;
  border: 1px solid var(--cc-border, #30363d);
  background: var(--cc-bg-elevated, #0d1117);
  overflow: hidden;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 0;
}

.stats-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--cc-text, #e0e5e9);
  margin: 0;
}

.trend-toggle {
  display: flex;
  border-radius: 6px;
  border: 1px solid var(--cc-border, #30363d);
  overflow: hidden;
}

.trend-btn {
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--cc-text-muted, #8b949e);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: var(--cc-text, #e0e5e9);
    background: var(--cc-bg-hover, rgba(255,255,255,0.06));
  }

  &.active {
    color: #fff;
    background: var(--cc-primary, #409eff);
  }

  & + .trend-btn {
    border-left: 1px solid var(--cc-border, #30363d);
  }
}

.stats-body {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 24px;
  padding: 16px 24px 24px;
  align-items: start;
}

.stats-today {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  color: var(--cc-text-muted, #8b949e);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--cc-text, #e0e5e9);
  font-variant-numeric: tabular-nums;

  &.stat-cost {
    color: var(--cc-primary, #409eff);
  }
}

.stats-chart {
  min-height: 200px;
}
</style>
