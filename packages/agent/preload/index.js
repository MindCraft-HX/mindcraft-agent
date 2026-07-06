let CORE_CHANNELS, CLAUDE_CHANNELS, CODEX_CHANNELS
try {
  const ipcChannels = require('../shared/ipcChannels')
  CORE_CHANNELS = ipcChannels.CORE_CHANNELS
  CLAUDE_CHANNELS = ipcChannels.CLAUDE_CHANNELS
  CODEX_CHANNELS = ipcChannels.CODEX_CHANNELS
} catch (_) {
  CORE_CHANNELS = { LOAD_CODEHUB_SESSION_INDEX: 'agent-load-codehub-session-index' }
  // Fallback: hardcode streaming channel names so streaming push events
  // survive a failed require of ../shared/ipcChannels (e.g. build artifact
  // mismatch, bundler tree-shaking). Without these, ipcRenderer.on(undefined)
  // silently drops all stream data.
  CLAUDE_CHANNELS = {
    STREAM_CHUNK: 'claude-stream-chunk',
    STREAM_THINKING: 'claude-stream-thinking',
    STREAM_TOOL_START: 'claude-stream-tool-start',
    STREAM_TOOL_INPUT: 'claude-stream-tool-input',
  }
  CODEX_CHANNELS = {
    STREAM_CHUNK: 'codex-stream-chunk',
    STREAM_THINKING: 'codex-stream-thinking',
    STREAM_TOOL_DELTA: 'codex-stream-tool-delta',
  }
}

function createAgentBridge(ipcRenderer) {
  return {
  claudeGetKey: () => ipcRenderer.invoke('claude-get-key'),
  claudeSetKey: (key) => ipcRenderer.invoke('claude-set-key', key),
  claudeGetBaseURL: () => ipcRenderer.invoke('claude-get-base-url'),
  claudeSetBaseURL: (url) => ipcRenderer.invoke('claude-set-base-url', url),
  claudeGetPermissionPolicy: () => ipcRenderer.invoke('claude-get-permission-policy'),
  claudeSetPermissionPolicy: (policy) => ipcRenderer.invoke('claude-set-permission-policy', policy),
  claudeGetLanguage: () => ipcRenderer.invoke('claude-get-language'),
  claudeSetLanguage: (language) => ipcRenderer.invoke('claude-set-language', language),
  claudeGetEffortLevel: () => ipcRenderer.invoke('claude-get-effort-level'),
  claudeSetEffortLevel: (effortLevel) => ipcRenderer.invoke('claude-set-effort-level', effortLevel),
  claudeGetThinkingEnabled: () => ipcRenderer.invoke('claude-get-thinking-enabled'),
  claudeSetThinkingEnabled: (enabled) => ipcRenderer.invoke('claude-set-thinking-enabled', enabled),
  claudeGetModel: () => ipcRenderer.invoke('claude-get-model'),
  claudeSetModel: (model) => ipcRenderer.invoke('claude-set-model', model),
  claudeGetModels: () => ipcRenderer.invoke('claude-get-models'),
  claudeSetModels: (models) => ipcRenderer.invoke('claude-set-models', models),
  claudeAddModel: (model) => ipcRenderer.invoke('claude-add-model', model),
  claudeRemoveModel: (modelId) => ipcRenderer.invoke('claude-remove-model', modelId),
  claudeGetProviders: () => ipcRenderer.invoke('claude-get-providers'),
  claudeSetProviders: (data) => ipcRenderer.invoke('claude-set-providers', data),
  claudeActivateProvider: (data) => ipcRenderer.invoke('claude-activate-provider', data),
  claudeGetTierModels: () => ipcRenderer.invoke('claude-get-tier-models'),
  claudeSetTierModels: (data) => ipcRenderer.invoke('claude-set-tier-models', data),
  claudeGetSelectedTier: () => ipcRenderer.invoke('claude-get-selected-tier'),
  claudeSetSelectedTier: (tier) => ipcRenderer.invoke('claude-set-selected-tier', tier),
  claudeValidateKey: (key, baseURL, model) => ipcRenderer.invoke('claude-validate-key', { key, baseURL, model }),
  claudeCheckEnvironment: () => ipcRenderer.invoke('claude-check-environment'),
  claudeCheckLatestVersion: () => ipcRenderer.invoke('claude-check-latest-version'),
  claudeInstallClaudeCode: () => ipcRenderer.invoke('claude-install-claude-code'),
  claudeGetExecutablePath: () => ipcRenderer.invoke('claude-get-executable-path'),
  claudeSetExecutablePath: (p) => ipcRenderer.invoke('claude-set-executable-path', p),
  claudeBrowseExecutable: () => ipcRenderer.invoke('claude-browse-executable'),
  claudeReadSettingsJson: () => ipcRenderer.invoke('claude-read-settings-json'),
  claudePatchSettingsJson: (patch) => ipcRenderer.invoke('claude-patch-settings-json', patch),
  claudeRepairSettingsJson: (content) => ipcRenderer.invoke('claude-repair-settings-json', content),
  claudeFreezeDiagGetEnabled: () => ipcRenderer.invoke('claude-freeze-diag-get-enabled'),
  claudeFreezeDiagSetEnabled: (enabled) => ipcRenderer.invoke('claude-freeze-diag-set-enabled', { enabled }),
  claudeGetSkipWebFetchPreflight: () => ipcRenderer.invoke('claude-get-skip-webfetch-preflight'),
  claudeSetSkipWebFetchPreflight: (v) => ipcRenderer.invoke('claude-set-skip-webfetch-preflight', v),
  claudeGetAutoCompactWindow: () => ipcRenderer.invoke('claude-get-auto-compact-window'),
  claudeSetAutoCompactWindow: (v) => ipcRenderer.invoke('claude-set-auto-compact-window', v),
  claudeImportLegacyConfig: (customPath) => ipcRenderer.invoke('claude-import-legacy-config', customPath),
  claudeConfigImportPickFile: () => ipcRenderer.invoke('claude-config-import-pick-file'),
  claudeConfigImportPreview: (payload) => ipcRenderer.invoke('claude-config-import-preview', payload),
  claudeConfigImportCommit: (payload) => ipcRenderer.invoke('claude-config-import-commit', payload),
  // Claude Agent SDK
  claudeAgentQuery: (payload) => ipcRenderer.invoke('claude-agent-query', payload),
  claudeAgentAbort: (sessionId) => ipcRenderer.invoke('claude-agent-abort', sessionId),
  claudeAgentUpdateRunMode: (sessionId, runMode) => ipcRenderer.invoke('claude-agent-update-runmode', { sessionId, runMode }),
  claudeAgentQueryMetrics: (payload) => ipcRenderer.invoke('claude-agent-query-metrics', payload),
  setPerfEnabled: (v) => ipcRenderer.invoke('agent-set-perf-enabled', v),
  claudeSelectDirectory: () => ipcRenderer.invoke('select-directory'),
  claudeListFiles: (payload) => ipcRenderer.invoke('claude-list-files', payload),
  claudeListSlashCommands: (payload) => ipcRenderer.invoke('claude-list-slash-commands', payload),
  claudeListLocalSkills: (payload) => ipcRenderer.invoke('claude-list-local-skills', payload),
  claudeGetLastCompactSummary: (sessionId) => ipcRenderer.invoke('claude-get-last-compact-summary', sessionId),
  claudeReadSessionMeta: (payload) => ipcRenderer.invoke('claude-read-session-meta', payload),
  claudeWriteSessionMeta: (payload) => ipcRenderer.invoke('claude-write-session-meta', payload),
  claudeLoadCodePanelState: (cwd) => ipcRenderer.invoke('claude-load-code-panel-state', { cwd }),
  claudeSaveCodePanelState: (payload) => ipcRenderer.invoke('claude-save-code-panel-state', payload),
  claudeSaveCodePanelStateSync: (payload) => ipcRenderer.sendSync('claude-save-code-panel-state-sync', payload),
  getSessionInstruction: (chatKey) => ipcRenderer.invoke('agent-get-session-instruction', { chatKey }),
  setSessionInstruction: (payload) => ipcRenderer.invoke('agent-set-session-instruction', payload),
  setSessionTitle: (payload) => ipcRenderer.invoke('agent-set-session-title', payload),
  getSessionDraft: (chatKey) => ipcRenderer.invoke('agent-get-session-draft', { chatKey }),
  setSessionDraft: (payload) => ipcRenderer.invoke('agent-set-session-draft', payload),
  setSessionDraftSync: (payload) => ipcRenderer.sendSync('agent-set-session-draft-sync', payload),
  clearSessionDraft: (chatKey) => ipcRenderer.invoke('agent-clear-session-draft', { chatKey }),
  openSessionAttachmentDialog: () => ipcRenderer.invoke('agent-open-session-attachment-dialog'),
  resolveSessionAttachments: (attachments) => ipcRenderer.invoke('agent-resolve-session-attachments', { attachments }),
  buildSessionInstructionPrompt: (instruction) => ipcRenderer.invoke('agent-build-session-instruction-prompt', { instruction }),
  pluginsGetState: () => ipcRenderer.invoke(CORE_CHANNELS.PLUGINS_GET_STATE),
  pluginsInstall: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGINS_INSTALL, pluginId),
  pluginsUninstall: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGINS_UNINSTALL, pluginId),
  pluginsEnable: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGINS_ENABLE, pluginId),
  pluginsDisable: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGINS_DISABLE, pluginId),
  skillsGetCatalog: () => ipcRenderer.invoke(CORE_CHANNELS.SKILLS_GET_CATALOG),
  skillsGetState: (cwd) => ipcRenderer.invoke(CORE_CHANNELS.SKILLS_GET_STATE, { cwd }),
  skillsInstall: (payload) => ipcRenderer.invoke(CORE_CHANNELS.SKILLS_INSTALL, payload),
  skillsUninstall: (payload) => ipcRenderer.invoke(CORE_CHANNELS.SKILLS_UNINSTALL, payload),
  skillsMarketInstall: (payload) => ipcRenderer.invoke(CORE_CHANNELS.SKILLS_MARKET_INSTALL, payload),
  onSkillsInstallProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('skills-install-progress', handler)
    return () => ipcRenderer.removeListener('skills-install-progress', handler)
  },
  claudeScanProjectsSessions: (cwd) => ipcRenderer.invoke('claude-scanner-projects-sessions', { cwd }),
  claudeRenameSession: (payload) => ipcRenderer.invoke('claude-rename-session', payload),
  claudeReadSessionFile: (filePath) => ipcRenderer.invoke('claude-read-session-file', { filePath }),
  // 主题持久化（IPC 文件存储，绕过 Chromium localStorage）
  loadTheme: () => ipcRenderer.sendSync('load-theme'),
  saveTheme: (name) => ipcRenderer.send('save-theme', name),
  claudeReadSessionFileRange: (params) => ipcRenderer.invoke('claude-read-session-file-range', params),
  claudeGetFileStat: (filePath) => ipcRenderer.invoke('claude-get-file-stat', { filePath }),
  claudeDeleteSessionFile: (filePath) => ipcRenderer.invoke('claude-delete-session-file', { filePath }),
  claudeWriteClipboard: (text) => ipcRenderer.invoke('claude-write-clipboard', text),
  claudeScanCliSessions: (cwd) => ipcRenderer.invoke('claude-scan-cli-sessions', { cwd }),
  claudeRegisterCliSessions: (map) => ipcRenderer.invoke('claude-register-cli-sessions', map),
  // Memory 管理
  claudeMemoryList: (cwd, scope) => ipcRenderer.invoke('claude-memory-list', { cwd, scope }),
  claudeMemoryRead: ({ cwd, filename, scope }) => ipcRenderer.invoke('claude-memory-read', { cwd, filename, scope }),
  claudeMemoryWrite: (payload) => ipcRenderer.invoke('claude-memory-write', payload),
  claudeMemoryDelete: ({ cwd, filename, scope }) => ipcRenderer.invoke('claude-memory-delete', { cwd, filename, scope }),
  claudeMemoryGetInjectMode: () => ipcRenderer.invoke('claude-memory-get-inject-mode'),
  claudeMemorySetInjectMode: (mode) => ipcRenderer.invoke('claude-memory-set-inject-mode', mode),
  localSearchCapability: () => ipcRenderer.invoke(CORE_CHANNELS.LOCAL_SEARCH_CAPABILITY),
  localSearchText: (payload) => ipcRenderer.invoke(CORE_CHANNELS.LOCAL_SEARCH_TEXT, payload),
  localSearchFiles: (payload) => ipcRenderer.invoke(CORE_CHANNELS.LOCAL_SEARCH_FILES, payload),
  localSearchDiagnose: () => ipcRenderer.invoke(CORE_CHANNELS.LOCAL_SEARCH_DIAGNOSE),
  onClaudeAgentMessage: (callback) => ipcRenderer.on('claude-agent-message', (_, data) => callback(data)),
  onClaudeAgentDone: (callback) => ipcRenderer.on('claude-agent-done', (_, data) => callback(data)),
  onClaudeAgentPermission: (callback) => ipcRenderer.on('claude-agent-permission', (_, data) => callback(data)),
  onClaudeAgentAskQuestion: (callback) => ipcRenderer.on('claude-agent-ask-question', (_, data) => callback(data)),
  onClaudeAgentPlanReview: (callback) => ipcRenderer.on('claude-agent-plan-review', (_, data) => callback(data)),
  onClaudeAgentMetrics: (callback) => ipcRenderer.on('claude-agent-metrics', (_, data) => callback(data)),
  onClaudeAgentEarlyCliSession: (callback) => ipcRenderer.on('claude-agent-early-cli-session', (_, data) => callback(data)),
  offClaudeAgentMetrics: (callback) => ipcRenderer.removeListener('claude-agent-metrics', callback),
  claudePermissionResponse: (payload) => ipcRenderer.invoke('claude-permission-response', payload),
  claudeAskQuestionResponse: (payload) => ipcRenderer.invoke('claude-ask-question-response', payload),
  claudePlanReviewResponse: (payload) => ipcRenderer.invoke('claude-plan-review-response', payload),
  offClaudeAgentListeners: () => {
    ipcRenderer.removeAllListeners('claude-agent-message')
    ipcRenderer.removeAllListeners('claude-agent-done')
    ipcRenderer.removeAllListeners('claude-agent-permission')
    ipcRenderer.removeAllListeners('claude-agent-ask-question')
    ipcRenderer.removeAllListeners('claude-agent-plan-review')
    ipcRenderer.removeAllListeners('claude-agent-metrics')
    ipcRenderer.removeAllListeners('claude-agent-early-cli-session')
  },
  // 简易对话：Claude
  claudeChat: (payload) => ipcRenderer.invoke('claude-chat', payload),
  claudeChatContinue: (payload) => ipcRenderer.invoke('claude-chat-continue', payload),
  claudeChatAbort: (payload) => ipcRenderer.invoke('claude-chat-abort', payload),
  chatWebSearch: (payload) => ipcRenderer.invoke(CORE_CHANNELS.CHAT_WEB_SEARCH, payload),
  onClaudeStreamChunk: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CLAUDE_CHANNELS.STREAM_CHUNK, handler)
    return () => ipcRenderer.removeListener(CLAUDE_CHANNELS.STREAM_CHUNK, handler)
  },
  onClaudeStreamThinking: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CLAUDE_CHANNELS.STREAM_THINKING, handler)
    return () => ipcRenderer.removeListener(CLAUDE_CHANNELS.STREAM_THINKING, handler)
  },
  onClaudeStreamToolStart: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CLAUDE_CHANNELS.STREAM_TOOL_START, handler)
    return () => ipcRenderer.removeListener(CLAUDE_CHANNELS.STREAM_TOOL_START, handler)
  },
  onClaudeStreamToolInput: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CLAUDE_CHANNELS.STREAM_TOOL_INPUT, handler)
    return () => ipcRenderer.removeListener(CLAUDE_CHANNELS.STREAM_TOOL_INPUT, handler)
  },
  // 简易对话：会话管理
  chatListSessions: () => ipcRenderer.invoke(CORE_CHANNELS.CHAT_LIST_SESSIONS),
  chatGetSession: (id) => ipcRenderer.invoke(CORE_CHANNELS.CHAT_GET_SESSION, id),
  chatSaveSession: (id, data) => ipcRenderer.invoke(CORE_CHANNELS.CHAT_SAVE_SESSION, { id, data }),
  chatDeleteSession: (id) => ipcRenderer.invoke(CORE_CHANNELS.CHAT_DELETE_SESSION, id),
  chatGenerateTitle: (payload) => ipcRenderer.invoke(CORE_CHANNELS.CHAT_GENERATE_TITLE, payload),
  // Codex Agent SDK
  codexAgentQuery: (payload) => ipcRenderer.invoke('codex-agent-query', payload),
  codexAgentAbort: (sessionId) => ipcRenderer.invoke('codex-agent-abort', sessionId),
  codexSelectDirectory: () => ipcRenderer.invoke('codex-select-directory'),
  codexRegisterCliSessions: (map) => ipcRenderer.invoke('codex-register-cli-sessions', map),
  codexUnregisterCliSession: (sessionId) => ipcRenderer.invoke('codex-unregister-cli-session', sessionId),
  codexListSessionsByCwd: (cwd) => ipcRenderer.invoke('codex-list-sessions-by-cwd', cwd),
  codexRenameSession: (payload) => ipcRenderer.invoke('codex-rename-session', payload),
  codexDeleteSession: (payload) => ipcRenderer.invoke('codex-delete-session', payload),
  codexDeleteSessionFile: (filePath) => ipcRenderer.invoke('codex-delete-session-file', { filePath }),
  codexReadSessionFileRange: (params) => ipcRenderer.invoke('codex-read-session-file-range', params),
  codexGetFileStat: (filePath) => ipcRenderer.invoke('codex-get-file-stat', { filePath }),
  codexListSlashCommands: (payload) => ipcRenderer.invoke('codex-list-slash-commands', payload),
  codexListLocalSkills: (payload) => ipcRenderer.invoke('codex-list-local-skills', payload),
  codexAgentQueryMetrics: (payload) => ipcRenderer.invoke('codex-agent-query-metrics', payload),
  onCodexAgentMessage: (callback) => ipcRenderer.on('codex-agent-message', (_, data) => callback(data)),
  onCodexAgentDone: (callback) => ipcRenderer.on('codex-agent-done', (_, data) => callback(data)),
  onCodexAgentMetrics: (callback) => ipcRenderer.on('codex-agent-metrics', (_, data) => callback(data)),
  offCodexAgentListeners: () => {
    ipcRenderer.removeAllListeners('codex-agent-message')
    ipcRenderer.removeAllListeners('codex-agent-done')
    ipcRenderer.removeAllListeners('codex-agent-metrics')
  },
  // Codex 配置管理
  codexGetProviders: () => ipcRenderer.invoke('codex-get-providers'),
  codexSetProviders: (data) => ipcRenderer.invoke('codex-set-providers', data),
  codexWriteAuthJson: (obj) => ipcRenderer.invoke('codex-write-auth-json', obj),
  codexReadConfigToml: () => ipcRenderer.invoke('codex-read-config-toml'),
  codexWriteConfigToml: (content) => ipcRenderer.invoke('codex-write-config-toml', content),
  codexRepairConfigToml: (content) => ipcRenderer.invoke('codex-repair-config-toml', content),
  codexGetLastCwd: () => ipcRenderer.invoke('codex-get-last-cwd'),
  codexCheckEnvironment: () => ipcRenderer.invoke('codex-check-environment'),
  codexCheckLatestVersion: () => ipcRenderer.invoke('codex-check-latest-version'),
  codexInstallCodex: () => ipcRenderer.invoke('codex-install-codex'),
  codexGetKey: () => ipcRenderer.invoke('codex-get-key'),
  codexSetKey: (key) => ipcRenderer.invoke('codex-set-key', key),
  codexGetBaseURL: () => ipcRenderer.invoke('codex-get-base-url'),
  codexSetBaseURL: (url) => ipcRenderer.invoke('codex-set-base-url', url),
  codexGetModel: () => ipcRenderer.invoke('codex-get-model'),
  codexSetModel: (model) => ipcRenderer.invoke('codex-set-model', model),
  codexGetReasoningEffort: () => ipcRenderer.invoke('codex-get-reasoning-effort'),
  codexSetReasoningEffort: (effort) => ipcRenderer.invoke('codex-set-reasoning-effort', effort),
  codexGetApiFormat: () => ipcRenderer.invoke('codex-get-api-format'),
  codexSetApiFormat: (format) => ipcRenderer.invoke('codex-set-api-format', format),
  codexImportLegacyConfig: (customPath) => ipcRenderer.invoke('codex-import-legacy-config', customPath),
  codexConfigImportPickFile: () => ipcRenderer.invoke('codex-config-import-pick-file'),
  codexConfigImportPreview: (payload) => ipcRenderer.invoke('codex-config-import-preview', payload),
  codexConfigImportCommit: (payload) => ipcRenderer.invoke('codex-config-import-commit', payload),
  // System-level config import (T163: CC Switch global import)
  configImportPickFile: () => ipcRenderer.invoke('config-import-pick-file'),
  configImportPreview: (payload) => ipcRenderer.invoke('config-import-preview', payload),
  configImportCommit: (payload) => ipcRenderer.invoke('config-import-commit', payload),
  // System-level config export (mindcraft-providers.sql)
  configExportPreview: () => ipcRenderer.invoke('config-export-preview'),
  configExportSave: (payload) => ipcRenderer.invoke('config-export-save', payload),
  codexGetSandboxMode: () => ipcRenderer.invoke('codex-get-sandbox-mode'),
  codexSetSandboxMode: (mode) => ipcRenderer.invoke('codex-set-sandbox-mode', mode),
  codexGetProjectSettings: (cwd) => ipcRenderer.invoke('codex-get-project-settings', { cwd }),
  codexSetProjectSettings: (cwd, settings) => ipcRenderer.invoke('codex-set-project-settings', { cwd, settings }),
  codexGetDefaultNetworkAccess: () => ipcRenderer.invoke('codex-get-default-network-access'),
  codexSetDefaultNetworkAccess: (val) => ipcRenderer.invoke('codex-set-default-network-access', val),
  codexGetDefaultWebSearch: () => ipcRenderer.invoke('codex-get-default-web-search'),
  codexSetDefaultWebSearch: (val) => ipcRenderer.invoke('codex-set-default-web-search', val),
  codexValidateKey: (key, baseURL, model) => ipcRenderer.invoke('codex-validate-key', { key, baseURL, model }),
  codexListAvailableModels: () => ipcRenderer.invoke('codex-list-available-models'),
  codexRunGitDiff: (cwd) => ipcRenderer.invoke('codex-run-git-diff', { cwd }),
  codexLoadCodePanelState: () => ipcRenderer.invoke('codex-load-code-panel-state'),
  codexSaveCodePanelState: (payload) => ipcRenderer.invoke('codex-save-code-panel-state', payload),
  codexSaveCodePanelStateSync: (payload) => ipcRenderer.sendSync('codex-save-code-panel-state-sync', payload),
  // CodeX 插件管理
  codexPluginsGetState: () => ipcRenderer.invoke('codex-plugins-get-state'),
  codexPluginsInstall: (pluginId) => ipcRenderer.invoke('codex-plugins-install', pluginId),
  codexPluginsUninstall: (pluginId) => ipcRenderer.invoke('codex-plugins-uninstall', pluginId),
  codexPluginsEnable: (pluginId) => ipcRenderer.invoke('codex-plugins-enable', pluginId),
  codexPluginsDisable: (pluginId) => ipcRenderer.invoke('codex-plugins-disable', pluginId),
  codexSkillsGetCatalog: () => ipcRenderer.invoke('codex-skills-get-catalog'),
  codexSkillsGetState: (cwd) => ipcRenderer.invoke('codex-skills-get-state', { cwd }),
  codexSkillsInstall: (payload) => ipcRenderer.invoke('codex-skills-install', payload),
  codexSkillsUninstall: (payload) => ipcRenderer.invoke('codex-skills-uninstall', payload),
  codexSkillsMarketInstall: (payload) => ipcRenderer.invoke('codex-skills-market-install', payload),
  onCodexSkillsInstallProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('skills-install-progress', handler)
    return () => ipcRenderer.removeListener('skills-install-progress', handler)
  },
  // 简易对话：CodeX
  codexChat: (payload) => ipcRenderer.invoke('codex-chat', payload),
  codexChatContinue: (payload) => ipcRenderer.invoke('codex-chat-continue', payload),
  codexChatAbort: (payload) => ipcRenderer.invoke('codex-chat-abort', payload),
  onCodexStreamChunk: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CODEX_CHANNELS.STREAM_CHUNK, handler)
    return () => ipcRenderer.removeListener(CODEX_CHANNELS.STREAM_CHUNK, handler)
  },
  onCodexStreamThinking: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CODEX_CHANNELS.STREAM_THINKING, handler)
    return () => ipcRenderer.removeListener(CODEX_CHANNELS.STREAM_THINKING, handler)
  },
  onCodexStreamToolDelta: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CODEX_CHANNELS.STREAM_TOOL_DELTA, handler)
    return () => ipcRenderer.removeListener(CODEX_CHANNELS.STREAM_TOOL_DELTA, handler)
  },
  // CodeHub SessionIndex (T184)
  loadCodehubSessionIndex: () => ipcRenderer.invoke(CORE_CHANNELS.LOAD_CODEHUB_SESSION_INDEX),
  // Home 页数据
  loadRecentProject: () => ipcRenderer.invoke(CORE_CHANNELS.HOME_GET_RECENT_PROJECT),
  loadTodayStats: () => ipcRenderer.invoke(CORE_CHANNELS.HOME_GET_TODAY_STATS),
  loadTokenTrend: (days) => ipcRenderer.invoke(CORE_CHANNELS.HOME_GET_TOKEN_TREND, days),
  // Locale
  loadLocale: () => ipcRenderer.invoke(CORE_CHANNELS.LOAD_LOCALE),
  saveLocale: (locale) => ipcRenderer.send(CORE_CHANNELS.SAVE_LOCALE, locale),
  // Agent 领域事件（PR 2：Main 双发，Renderer 暂不消费）
  onAgentEvent: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },
  }
}

module.exports = { createAgentBridge }
