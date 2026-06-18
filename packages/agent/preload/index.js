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
  // Claude Agent SDK
  claudeAgentQuery: (payload) => ipcRenderer.invoke('claude-agent-query', payload),
  claudeAgentAbort: (sessionId) => ipcRenderer.invoke('claude-agent-abort', sessionId),
  claudeAgentUpdateRunMode: (sessionId, runMode) => ipcRenderer.invoke('claude-agent-update-runmode', { sessionId, runMode }),
  claudeAgentQueryMetrics: (payload) => ipcRenderer.invoke('claude-agent-query-metrics', payload),
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
  openSessionAttachmentDialog: () => ipcRenderer.invoke('agent-open-session-attachment-dialog'),
  resolveSessionAttachments: (attachments) => ipcRenderer.invoke('agent-resolve-session-attachments', { attachments }),
  buildSessionInstructionPrompt: (instruction) => ipcRenderer.invoke('agent-build-session-instruction-prompt', { instruction }),
  pluginsGetState: () => ipcRenderer.invoke('plugins-get-state'),
  pluginsInstall: (pluginId) => ipcRenderer.invoke('plugins-install', pluginId),
  pluginsUninstall: (pluginId) => ipcRenderer.invoke('plugins-uninstall', pluginId),
  pluginsEnable: (pluginId) => ipcRenderer.invoke('plugins-enable', pluginId),
  pluginsDisable: (pluginId) => ipcRenderer.invoke('plugins-disable', pluginId),
  skillsGetCatalog: () => ipcRenderer.invoke('skills-get-catalog'),
  skillsGetState: (cwd) => ipcRenderer.invoke('skills-get-state', { cwd }),
  skillsInstall: (payload) => ipcRenderer.invoke('skills-install', payload),
  skillsUninstall: (payload) => ipcRenderer.invoke('skills-uninstall', payload),
  skillsMarketInstall: (payload) => ipcRenderer.invoke('skills-market-install', payload),
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
  localSearchCapability: () => ipcRenderer.invoke('local-search-capability'),
  localSearchText: (payload) => ipcRenderer.invoke('local-search-text', payload),
  localSearchFiles: (payload) => ipcRenderer.invoke('local-search-files', payload),
  localSearchDiagnose: () => ipcRenderer.invoke('local-search-diagnose'),
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
  chatWebSearch: (payload) => ipcRenderer.invoke('chat-web-search', payload),
  onClaudeStreamChunk: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-stream-chunk', handler)
    return () => ipcRenderer.removeListener('claude-stream-chunk', handler)
  },
  onClaudeStreamThinking: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-stream-thinking', handler)
    return () => ipcRenderer.removeListener('claude-stream-thinking', handler)
  },
  onClaudeStreamToolStart: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-stream-tool-start', handler)
    return () => ipcRenderer.removeListener('claude-stream-tool-start', handler)
  },
  onClaudeStreamToolInput: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-stream-tool-input', handler)
    return () => ipcRenderer.removeListener('claude-stream-tool-input', handler)
  },
  // 简易对话：会话管理
  chatListSessions: () => ipcRenderer.invoke('chat-list-sessions'),
  chatGetSession: (id) => ipcRenderer.invoke('chat-get-session', id),
  chatSaveSession: (id, data) => ipcRenderer.invoke('chat-save-session', { id, data }),
  chatDeleteSession: (id) => ipcRenderer.invoke('chat-delete-session', id),
  chatGenerateTitle: (payload) => ipcRenderer.invoke('chat-generate-title', payload),
  // Codex Agent SDK
  codexAgentQuery: (payload) => ipcRenderer.invoke('codex-agent-query', payload),
  codexAgentAbort: (sessionId) => ipcRenderer.invoke('codex-agent-abort', sessionId),
  codexSelectDirectory: () => ipcRenderer.invoke('codex-select-directory'),
  codexRegisterCliSessions: (map) => ipcRenderer.invoke('codex-register-cli-sessions', map),
  codexUnregisterCliSession: (sessionId) => ipcRenderer.invoke('codex-unregister-cli-session', sessionId),
  codexListSessionsByCwd: (cwd) => ipcRenderer.invoke('codex-list-sessions-by-cwd', cwd),
  codexRenameSession: (payload) => ipcRenderer.invoke('codex-rename-session', payload),
  codexDeleteSessionFile: (filePath) => ipcRenderer.invoke('codex-delete-session-file', { filePath }),
  codexReadSessionFileRange: (params) => ipcRenderer.invoke('codex-read-session-file-range', params),
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
    ipcRenderer.on('codex-stream-chunk', handler)
    return () => ipcRenderer.removeListener('codex-stream-chunk', handler)
  },
  onCodexStreamThinking: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('codex-stream-thinking', handler)
    return () => ipcRenderer.removeListener('codex-stream-thinking', handler)
  },
  onCodexStreamToolDelta: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('codex-stream-tool-delta', handler)
    return () => ipcRenderer.removeListener('codex-stream-tool-delta', handler)
  },
  // Home 页数据
  loadRecentProject: () => ipcRenderer.invoke('home-get-recent-project'),
  loadTodayStats: () => ipcRenderer.invoke('home-get-today-stats'),
  loadTokenTrend: (days) => ipcRenderer.invoke('home-get-token-trend', days),
  // Locale
  loadLocale: () => ipcRenderer.invoke('load-locale'),
  saveLocale: (locale) => ipcRenderer.send('save-locale', locale),
  }
}

module.exports = { createAgentBridge }
