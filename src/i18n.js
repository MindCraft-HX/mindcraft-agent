import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'

function detectLocale() {
  // 1. 检查用户持久化偏好 (localStorage)
  try {
    const stored = JSON.parse(localStorage.getItem('mindcraft_locale') || 'null')
    if (stored?.locale === 'zh' || stored?.locale === 'en') return stored.locale
  } catch (_) {}
  // 2. 跟随系统语言
  const navLang = (navigator.language || '').toLowerCase()
  return navLang.startsWith('zh') ? 'zh' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh',
  messages: { zh: zhCN, en },
  missingWarn: false,
  fallbackWarn: false,
})
