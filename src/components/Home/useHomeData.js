import { i18n } from '@/i18n'
import { ref, watch, onMounted } from 'vue'

const defaultStats = () => ({
  claude: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 },
  codex: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 },
  combined: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 },
})

function loadRecentDocs() {
  try {
    const docs = JSON.parse(localStorage.getItem('mindcraft_agent_recent_docs') || '[]')
    if (!Array.isArray(docs)) return []
    return docs
      .filter(doc => doc && doc.filePath)
      .map((doc) => {
        const filePath = String(doc.filePath || '')
        const name = doc.name || filePath.split(/[\\/]/).pop() || ''
        return {
          ...doc,
          name,
          ext: doc.ext || name.split('.').pop() || '',
        }
      })
  } catch (_) { return [] }
}

export function useHomeData() {
  const recentProject = ref({ hasRecent: false })
  const recentDocs = ref(loadRecentDocs())
  const todayStats = ref(defaultStats())
  const trendData = ref([])
  const trendDays = ref(7)
  const trendLoading = ref(false)
  const loading = ref(true)

  async function refresh() {
    loading.value = true
    const api = window.electronAPI
    if (!api) {
      loading.value = false
      return
    }

    try {
      const [project, stats] = await Promise.all([
        api.loadRecentProject().catch(() => ({ hasRecent: false })),
        api.loadTodayStats().catch(() => defaultStats()),
      ])
      if (project) recentProject.value = project
      if (stats) todayStats.value = stats
    } catch (_) {}

    await loadTrend()
    loading.value = false
  }

  async function loadTrend() {
    trendLoading.value = true
    const api = window.electronAPI
    if (!api) {
      trendLoading.value = false
      return
    }

    try {
      const data = await api.loadTokenTrend(trendDays.value).catch(() => [])
      if (Array.isArray(data)) trendData.value = data
    } catch (_) {}

    trendLoading.value = false
  }

  watch(trendDays, () => {
    loadTrend()
  })

  onMounted(() => {
    refresh()
  })

  return {
    recentProject,
    recentDocs,
    todayStats,
    trendData,
    trendDays,
    trendLoading,
    loading,
    refresh,
  }
}

export function formatNumber(n) {
  if (n == null || n === 0) return '0'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString()
}

export function formatCost(n) {
  if (n == null || n === 0) return '$0'
  if (n >= 0.01) return '$' + n.toFixed(2)
  return '$' + n.toFixed(4)
}

export function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return i18n.global.t('time.justNow')
  if (diffMin < 60) return i18n.global.t('time.minAgo', { n: diffMin })
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return i18n.global.t('time.hourAgo', { n: diffHr })
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return i18n.global.t('time.yesterday')
  if (diffDay < 7) return i18n.global.t('time.dayAgo', { n: diffDay })

  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}-${day}`
}
