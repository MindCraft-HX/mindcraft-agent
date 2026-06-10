import { defineStore } from 'pinia'
import { ref } from 'vue'

const THEMES = ['dark', 'light', 'blue']

function readPersistedTheme() {
  // 1. IPC 文件存储（主进程 userData 目录，跨启动可靠）
  try {
    const ipcTheme = window.electronAPI?.loadTheme?.()
    if (ipcTheme && THEMES.includes(ipcTheme)) return ipcTheme
  } catch (_) {}

  // 2. localStorage 回退（同一次启动内有效）
  try {
    const raw = localStorage.getItem('claudeTheme')
    if (raw) {
      const parsed = JSON.parse(raw)
      const val = parsed?.theme
      if (val && THEMES.includes(val)) return val
    }
  } catch (_) {}

  return 'dark'
}

export const useClaudeThemeStore = defineStore('claudeTheme', () => {
  const theme = ref(readPersistedTheme())

  const themes = THEMES

  function persistTheme(name) {
    // IPC 文件存储（主进程 userData 目录，可靠持久化）
    try { window.electronAPI?.saveTheme?.(name) } catch (_) {}
    // localStorage 兜底（同次启动内有效）
    try {
      localStorage.setItem('claudeTheme', JSON.stringify({ theme: name }))
    } catch (_) {}
  }

  function setTheme(name) {
    if (themes.includes(name)) {
      theme.value = name
      persistTheme(name)
    }
  }

  function nextTheme() {
    const idx = themes.indexOf(theme.value)
    const next = themes[(idx + 1) % themes.length]
    theme.value = next
    persistTheme(next)
  }

  return { theme, themes, setTheme, nextTheme }
}, {
  persist: {
    key: 'claudeTheme',
    storage: localStorage,
    paths: ['theme'],
  }
})
