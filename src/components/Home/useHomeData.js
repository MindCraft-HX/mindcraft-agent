import { ref, watch, onMounted } from 'vue'

const defaultStats = () => ({
  claude: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 },
  codex: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 },
  combined: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 },
})

export function useHomeData() {
  const recentProject = ref({ hasRecent: false })
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

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return diffMin + '分钟前'
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return diffHr + '小时前'
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return '昨天'
  if (diffDay < 7) return diffDay + '天前'

  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}-${day}`
}
