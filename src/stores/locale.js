import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n } from '@/i18n'

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref(i18n.global.locale.value)

  const locales = [
    { key: 'zh', label: '简体中文' },
    { key: 'en', label: 'English' },
  ]

  function persist(val) {
    try {
      window.electronAPI?.saveLocale?.(val)
    } catch (_) {}
    localStorage.setItem('mindcraft_locale', JSON.stringify({ locale: val }))
  }

  function setLocale(val) {
    if (['zh', 'en'].includes(val)) {
      locale.value = val
      i18n.global.locale.value = val
      persist(val)
    }
  }

  // 启动时同步 electron-conf 的持久化值（覆盖浏览器检测）
  async function syncFromElectron() {
    try {
      const stored = await window.electronAPI?.loadLocale?.()
      if (stored === 'zh' || stored === 'en') setLocale(stored)
    } catch (_) {}
  }

  return { locale, locales, setLocale, syncFromElectron }
}, {
  persist: {
    key: 'mindcraft_locale',
    storage: localStorage,
    paths: ['locale'],
  },
})
