import { ref } from 'vue'
import { perfStart } from '../../agentCommon/utils/rendererPerfProbe.mjs'

export function useSlashCommands({ getActiveTab, getCwd, getInputText, setInputText, focusInput, autosizeSchedule, onEffortChange }) {
  const slashCommands = ref([
    { cmd: '/model', desc: '选择模型（本地命令）' },
    { cmd: '/memory', desc: '管理项目记忆（查看/添加/删除）' },
    { cmd: '/plugins', desc: '管理插件（安装/卸载/市场源）' },
    { cmd: '/skills', desc: '查看所有可用 Skills（本地命令）' },
    { cmd: '/commands', desc: '查看所有可用命令（本地命令）' },
  ])
  const slashSuggestions = ref([])
  const slashIdx = ref(0)
  const slashLoadingRemote = ref(false)

  const slashModelName = ref('')
  const slashEffortLevel = ref('medium')
  const slashThinkingEnabled = ref(true)

  let slashRemoteLoading = false
  let slashLocalRefreshTimer = null
  let slashRemoteRefreshTimer = null
  let modelPanelStateCache = null
  let modelPanelStateCacheTime = 0

  const SLASH_LOCAL_REFRESH_DEBOUNCE_MS = 220
  const SLASH_REMOTE_REFRESH_DEBOUNCE_MS = 800
  const MODEL_PANEL_STATE_TTL_MS = 30_000

  function invalidateModelPanelStateCache() {
    modelPanelStateCache = null
    modelPanelStateCacheTime = 0
  }

  function applyModelPanelState(defaults = {}) {
    const tab = getActiveTab?.() || null
    const tabEffort = String(tab?.effort || '').trim().toLowerCase()
    const tabModel = String(tab?.model || '').trim()
    slashEffortLevel.value = ['low', 'medium', 'high', 'xhigh'].includes(tabEffort)
      ? tabEffort
      : defaults.effort
    slashModelName.value = tabModel || defaults.modelName
    slashThinkingEnabled.value = defaults.thinking
  }

  async function loadModelPanelState(opts = {}) {
    try {
      const force = opts?.force === true
      if (!force && modelPanelStateCache && Date.now() - modelPanelStateCacheTime < MODEL_PANEL_STATE_TTL_MS) {
        applyModelPanelState(modelPanelStateCache)
        return
      }
      // 读取全局 conf
      const [effort, model, tier, thinking] = await Promise.all([
        window.electronAPI?.claudeGetEffortLevel?.(),
        window.electronAPI?.claudeGetModel?.(),
        window.electronAPI?.claudeGetSelectedTier?.(),
        window.electronAPI?.claudeGetThinkingEnabled?.(),
      ])
      const tierLabel = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', reasoning: 'Reasoning' }
      modelPanelStateCache = {
        effort: ['low', 'medium', 'high', 'xhigh'].includes(effort) ? effort : 'medium',
        modelName: model || tierLabel[tier] || '未配置模型',
        thinking: thinking !== false,
      }
      modelPanelStateCacheTime = Date.now()
      applyModelPanelState(modelPanelStateCache)
    } catch (_) {}
  }

  async function setEffortLevel(level) {
    const valid = ['low', 'medium', 'high', 'xhigh']
    if (!valid.includes(level)) return
    slashEffortLevel.value = level
    if (modelPanelStateCache) {
      modelPanelStateCache.effort = level
      modelPanelStateCacheTime = Date.now()
    }
    await window.electronAPI?.claudeSetEffortLevel?.(level)
    await onEffortChange?.(level, getActiveTab?.() || null)
  }

  async function toggleThinking() {
    const next = !slashThinkingEnabled.value
    slashThinkingEnabled.value = next
    if (modelPanelStateCache) {
      modelPanelStateCache.thinking = next
      modelPanelStateCacheTime = Date.now()
    }
    await window.electronAPI?.claudeSetThinkingEnabled?.(next)
  }

  async function refreshSlashCommands(includeRemote = false) {
    try {
      const cwd = getCwd?.() || undefined
      const localSkills = await window.electronAPI.claudeListLocalSkills?.({
        cwd,
      })
      const merged = [
        { cmd: '/model', desc: '选择模型（本地命令）' },
        { cmd: '/memory', desc: '管理项目记忆（查看/添加/删除）' },
        { cmd: '/plugins', desc: '管理插件（安装/卸载/市场源）' },
        { cmd: '/skills', desc: '查看所有可用 Skills（本地命令）' },
        { cmd: '/commands', desc: '查看所有可用命令（本地命令）' },
      ]
      if (includeRemote) {
        const remote = await window.electronAPI.claudeListSlashCommands?.({
          cwd,
          sessionId: getActiveTab?.()?.sessionId || undefined,
        })
        for (const c of (remote || [])) {
          const n = (c?.name || '').trim()
          if (!n) continue
          const cmd = n.startsWith('/') ? n : `/${n}`
          if (cmd === '/clear') continue
          const i = merged.findIndex(x => x.cmd === cmd)
          if (i >= 0) merged[i] = { cmd, desc: c?.description || merged[i].desc }
          else merged.push({ cmd, desc: c?.description || 'Claude 命令' })
        }
      }
      for (const s of [...(localSkills?.system || []), ...(localSkills?.project || [])]) {
        const n = (s?.name || '').trim()
        if (!n) continue
        const cmd = n.startsWith('/') ? n : `/${n}`
        if (cmd === '/clear') continue
        if (merged.some(x => x.cmd === cmd)) continue
        merged.push({ cmd, desc: `Skill（本地）${s?.description ? `：${s.description}` : ''}` })
      }
      slashCommands.value = merged
    } catch (_) {}
  }

  function refreshSlashCommandsInBackground() {
    if (slashRemoteLoading) return
    if (slashRemoteRefreshTimer) clearTimeout(slashRemoteRefreshTimer)
    slashRemoteRefreshTimer = setTimeout(async () => {
      if (slashRemoteLoading) return
      slashRemoteLoading = true
      slashLoadingRemote.value = true
      try {
        await refreshSlashCommands(true)
        const val = getInputText?.() || ''
        if (val.startsWith('/') && !val.includes(' ')) {
          slashSuggestions.value = slashCommands.value.filter(s => s.cmd.startsWith(val))
        }
      } catch (_) {}
      finally {
        slashRemoteLoading = false
        slashLoadingRemote.value = false
      }
    }, SLASH_REMOTE_REFRESH_DEBOUNCE_MS)
  }

  function refreshSlashCommandsLocalDebounced() {
    if (slashLocalRefreshTimer) clearTimeout(slashLocalRefreshTimer)
    slashLocalRefreshTimer = setTimeout(async () => {
      await refreshSlashCommands(false).catch(() => {})
      const val = getInputText?.() || ''
      if (val.startsWith('/') && !val.includes(' ')) {
        slashSuggestions.value = slashCommands.value.filter(s => s.cmd.startsWith(val))
      }
    }, SLASH_LOCAL_REFRESH_DEBOUNCE_MS)
  }

  function applySlash(s) {
    setInputText?.(s.cmd + ' ')
    slashSuggestions.value = []
    focusInput?.()
  }

  function onInput(e) {
    const stop = perfStart('claude.autosize')
    autosizeSchedule?.()  // Phase 5: rAF 合并，不再同步读写 layout
    stop()
    const val = getInputText?.() || ''
    if (val.startsWith('/') && !val.includes(' ')) {
      slashSuggestions.value = slashCommands.value.filter(s => s.cmd.startsWith(val))
      slashIdx.value = 0
      refreshSlashCommandsLocalDebounced()
      refreshSlashCommandsInBackground()
      if (val === '/') loadModelPanelState()
    } else {
      slashSuggestions.value = []
    }
  }

  function onKeydown(e, { onSend } = {}) {
    if (slashSuggestions.value.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); slashIdx.value = (slashIdx.value + 1) % slashSuggestions.value.length; return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); slashIdx.value = (slashIdx.value - 1 + slashSuggestions.value.length) % slashSuggestions.value.length; return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        applySlash(slashSuggestions.value[slashIdx.value])
        return
      }
      if (e.key === 'Escape') { slashSuggestions.value = []; return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend?.() }
  }

  function resetSuggestions() {
    slashSuggestions.value = []
    slashIdx.value = 0
  }

  return {
    slashCommands,
    slashSuggestions,
    slashIdx,
    slashLoadingRemote,
    slashModelName,
    slashEffortLevel,
    slashThinkingEnabled,
    refreshSlashCommands,
    invalidateModelPanelStateCache,
    loadModelPanelState,
    setEffortLevel,
    toggleThinking,
    onInput,
    onKeydown,
    applySlash,
    resetSuggestions,
  }
}

