import { i18n } from '@/i18n'
import { ref, watch, onMounted, computed } from 'vue'

function normalizeRecentDocs(docs) {
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
}

export function useHomeData() {
  const recentProject = ref({ hasRecent: false })
  const recentDocs = ref([])
  const trendData = ref([])
  const trendDays = ref(1)
  const projectLoading = ref(true)
  const docsLoading = ref(true)
  const statsLoading = ref(true)
  const trendLoading = ref(false)

  const summaryStats = computed(() => {
    const combined = trendData.value.reduce((acc, day) => {
      acc.inputTokens += day.totalInput || 0
      acc.outputTokens += day.totalOutput || 0
      acc.cacheReadTokens += day.totalCache || 0
      return acc
    }, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
    })
    return combined
  })

  async function loadRecentDocs() {
    docsLoading.value = true
    try {
      const docs = await window.electronAPI?.getSetting?.('recentDocs')
      if (Array.isArray(docs) && docs.length) {
        recentDocs.value = normalizeRecentDocs(docs)
        docsLoading.value = false
        return
      }
    } catch (_) {}

    try {
      const legacyDocs = JSON.parse(localStorage.getItem('mindcraft_agent_recent_docs') || '[]')
      const normalized = normalizeRecentDocs(legacyDocs)
      recentDocs.value = normalized
      if (normalized.length) {
        await window.electronAPI?.setSetting?.('recentDocs', normalized.slice(0, 5))
      }
    } catch (_) {
      recentDocs.value = []
    }
    docsLoading.value = false
  }

  async function loadRecentProject() {
    projectLoading.value = true
    const api = window.electronAPI
    if (!api) {
      projectLoading.value = false
      return
    }
    try {
      const project = await api.loadRecentProject().catch(() => ({ hasRecent: false }))
      if (project) recentProject.value = project
    } catch (_) {}
    projectLoading.value = false
  }

  async function refresh() {
    loadRecentProject()
    loadRecentDocs()
  }

  async function loadTrend() {
    statsLoading.value = true
    trendLoading.value = true
    const api = window.electronAPI
    if (!api) {
      trendLoading.value = false
      statsLoading.value = false
      return
    }

    try {
      const data = await api.loadTokenTrend(trendDays.value).catch(() => [])
      if (Array.isArray(data)) trendData.value = data
    } catch (_) {}

    trendLoading.value = false
    statsLoading.value = false
  }

  watch(trendDays, () => {
    loadTrend()
  })

  onMounted(() => {
    refresh()
    requestAnimationFrame(() => {
      setTimeout(() => {
        loadTrend()
      }, 0)
    })
  })

  return {
    recentProject,
    recentDocs,
    summaryStats,
    trendData,
    trendDays,
    setTrendDays: (days) => { trendDays.value = days },
    projectLoading,
    docsLoading,
    statsLoading,
    trendLoading,
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
