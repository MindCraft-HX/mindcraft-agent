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
  claudeGetBaseURL: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_BASE_URL),
  claudeSetBaseURL: (url) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_BASE_URL, url),
  claudeGetPermissionPolicy: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_PERMISSION_POLICY),
  claudeSetPermissionPolicy: (policy) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_PERMISSION_POLICY, policy),
  claudeGetLanguage: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_LANGUAGE),
  claudeSetLanguage: (language) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_LANGUAGE, language),
  claudeGetEffortLevel: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_EFFORT_LEVEL),
  claudeSetEffortLevel: (effortLevel) => ipcRenderer.invoke('claude-set-effort-level', effortLevel),
  claudeGetThinkingEnabled: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_THINKING_ENABLED),
  claudeSetThinkingEnabled: (enabled) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_THINKING_ENABLED, enabled),
  claudeGetModel: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_MODEL),
  claudeSetModel: (model) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_MODEL, model),
  claudeGetModels: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_MODELS),
  claudeSetModels: (models) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_MODELS, models),
  claudeAddModel: (model) => ipcRenderer.invoke('claude-add-model', model),
  claudeRemoveModel: (modelId) => ipcRenderer.invoke('claude-remove-model', modelId),
  claudeGetProviders: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_PROVIDERS),
  claudeSetProviders: (data) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_PROVIDERS, data),
  claudeActivateProvider: (data) => ipcRenderer.invoke('claude-activate-provider', data),
  claudeGetTierModels: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_TIER_MODELS),
  claudeSetTierModels: (data) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_TIER_MODELS, data),
  claudeGetSelectedTier: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_SELECTED_TIER),
  claudeSetSelectedTier: (tier) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_SELECTED_TIER, tier),
  claudeValidateKey: (key, baseURL, model) => ipcRenderer.invoke('claude-validate-key', { key, baseURL, model }),
  claudeCheckEnvironment: () => ipcRenderer.invoke('claude-check-environment'),
  claudeCheckLatestVersion: () => ipcRenderer.invoke('claude-check-latest-version'),
  claudeInstallClaudeCode: () => ipcRenderer.invoke('claude-install-claude-code'),
  claudeGetExecutablePath: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_EXECUTABLE_PATH),
  claudeSetExecutablePath: (p) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_EXECUTABLE_PATH, p),
  claudeBrowseExecutable: () => ipcRenderer.invoke('claude-browse-executable'),
  claudeReadSettingsJson: () => ipcRenderer.invoke('claude-read-settings-json'),
  claudePatchSettingsJson: (patch) => ipcRenderer.invoke('claude-patch-settings-json', patch),
  claudeRepairSettingsJson: (content) => ipcRenderer.invoke('claude-repair-settings-json', content),
  claudeFreezeDiagGetEnabled: () => ipcRenderer.invoke('claude-freeze-diag-get-enabled'),
  claudeFreezeDiagSetEnabled: (enabled) => ipcRenderer.invoke('claude-freeze-diag-set-enabled', { enabled }),
  claudeGetSkipWebFetchPreflight: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_SKIP_WEBFETCH_PREFLIGHT),
  claudeSetSkipWebFetchPreflight: (v) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_SKIP_WEBFETCH_PREFLIGHT, v),
  claudeGetAutoCompactWindow: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_AUTO_COMPACT_WINDOW),
  claudeSetAutoCompactWindow: (v) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_AUTO_COMPACT_WINDOW, v),
  claudeImportLegacyConfig: (customPath) => ipcRenderer.invoke('claude-import-legacy-config', customPath),
  claudeConfigImportPickFile: () => ipcRenderer.invoke('claude-config-import-pick-file'),
  claudeConfigImportPreview: (payload) => ipcRenderer.invoke('claude-config-import-preview', payload),
  claudeConfigImportCommit: (payload) => ipcRenderer.invoke('claude-config-import-commit', payload),
  // Claude Agent SDK
  claudeAgentQuery: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_QUERY, payload),
  claudeAgentAbort: (sessionId) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_ABORT, sessionId),
  claudeAgentUpdateRunMode: (sessionId, runMode) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_UPDATE_RUNMODE, { sessionId, runMode }),
  claudeAgentQueryMetrics: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_QUERY_METRICS, payload),
  setPerfEnabled: (v) => ipcRenderer.invoke('agent-set-perf-enabled', v),
  claudeSelectDirectory: () => ipcRenderer.invoke('select-directory'),
  claudeListFiles: (payload) => ipcRenderer.invoke('claude-list-files', payload),
  claudeListSlashCommands: (payload) => ipcRenderer.invoke('claude-list-slash-commands', payload),
  claudeListLocalSkills: (payload) => ipcRenderer.invoke('claude-list-local-skills', payload),
  claudeGetLastCompactSummary: (sessionId) => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_LAST_COMPACT_SUMMARY, sessionId),
  claudeReadSessionMeta: (payload) => ipcRenderer.invoke('claude-read-session-meta', payload),
  claudeWriteSessionMeta: (payload) => ipcRenderer.invoke('claude-write-session-meta', payload),
  claudeLoadCodePanelState: (cwd) => ipcRenderer.invoke('claude-load-code-panel-state', { cwd }),
  claudeSaveCodePanelState: (payload) => ipcRenderer.invoke('claude-save-code-panel-state', payload),
  claudeSaveCodePanelStateSync: (payload) => ipcRenderer.sendSync('claude-save-code-panel-state-sync', payload),
  getSessionInstruction: (chatKey) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_GET_SESSION_INSTRUCTION, { chatKey }),
  setSessionInstruction: (payload) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_SET_SESSION_INSTRUCTION, payload),
  setSessionTitle: (payload) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_SET_SESSION_TITLE, payload),
  getSessionDraft: (chatKey) => ipcRenderer.invoke('agent-get-session-draft', { chatKey }),
  setSessionDraft: (payload) => ipcRenderer.invoke('agent-set-session-draft', payload),
  setSessionDraftSync: (payload) => ipcRenderer.sendSync('agent-set-session-draft-sync', payload),
  clearSessionDraft: (chatKey) => ipcRenderer.invoke('agent-clear-session-draft', { chatKey }),
  openSessionAttachmentDialog: () => ipcRenderer.invoke(CORE_CHANNELS.AGENT_OPEN_SESSION_ATTACHMENT_DIALOG),
  resolveSessionAttachments: (attachments) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_RESOLVE_SESSION_ATTACHMENTS, { attachments }),
  buildSessionInstructionPrompt: (instruction) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_BUILD_SESSION_INSTRUCTION_PROMPT, { instruction }),
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
  claudeGetFileStat: (filePath) => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_FILE_STAT, { filePath }),
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
  onClaudeAgentMessage: (callback) => ipcRenderer.on(CLAUDE_CHANNELS.AGENT_MESSAGE, (_, data) => callback(data)),
  onClaudeAgentDone: (callback) => ipcRenderer.on(CLAUDE_CHANNELS.AGENT_DONE, (_, data) => callback(data)),
  onClaudeAgentPermission: (callback) => ipcRenderer.on(CLAUDE_CHANNELS.AGENT_PERMISSION, (_, data) => callback(data)),
  onClaudeAgentAskQuestion: (callback) => ipcRenderer.on(CLAUDE_CHANNELS.AGENT_ASK_QUESTION, (_, data) => callback(data)),
  onClaudeAgentPlanReview: (callback) => ipcRenderer.on(CLAUDE_CHANNELS.AGENT_PLAN_REVIEW, (_, data) => callback(data)),
  onClaudeAgentMetrics: (callback) => ipcRenderer.on(CLAUDE_CHANNELS.AGENT_METRICS, (_, data) => callback(data)),
  onClaudeAgentEarlyCliSession: (callback) => ipcRenderer.on(CLAUDE_CHANNELS.AGENT_EARLY_CLI_SESSION, (_, data) => callback(data)),
  offClaudeAgentMetrics: (callback) => ipcRenderer.removeListener(CLAUDE_CHANNELS.AGENT_METRICS, callback),
  claudePermissionResponse: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.PERMISSION_RESPONSE, payload),
  claudeAskQuestionResponse: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.ASK_QUESTION_RESPONSE, payload),
  claudePlanReviewResponse: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.PLAN_REVIEW_RESPONSE, payload),
  offClaudeAgentListeners: () => {
    ipcRenderer.removeAllListeners(CLAUDE_CHANNELS.AGENT_MESSAGE)
    ipcRenderer.removeAllListeners(CLAUDE_CHANNELS.AGENT_DONE)
    ipcRenderer.removeAllListeners(CLAUDE_CHANNELS.AGENT_PERMISSION)
    ipcRenderer.removeAllListeners(CLAUDE_CHANNELS.AGENT_ASK_QUESTION)
    ipcRenderer.removeAllListeners(CLAUDE_CHANNELS.AGENT_PLAN_REVIEW)
    ipcRenderer.removeAllListeners(CLAUDE_CHANNELS.AGENT_METRICS)
    ipcRenderer.removeAllListeners(CLAUDE_CHANNELS.AGENT_EARLY_CLI_SESSION)
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
  codexAgentQuery: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.AGENT_QUERY, payload),
  codexAgentAbort: (sessionId) => ipcRenderer.invoke(CODEX_CHANNELS.AGENT_ABORT, sessionId),
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
  codexAgentQueryMetrics: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.AGENT_QUERY_METRICS, payload),
  onCodexAgentMessage: (callback) => ipcRenderer.on(CODEX_CHANNELS.AGENT_MESSAGE, (_, data) => callback(data)),
  onCodexAgentDone: (callback) => ipcRenderer.on(CODEX_CHANNELS.AGENT_DONE, (_, data) => callback(data)),
  onCodexAgentMetrics: (callback) => ipcRenderer.on(CODEX_CHANNELS.AGENT_METRICS, (_, data) => callback(data)),
  offCodexAgentListeners: () => {
    ipcRenderer.removeAllListeners(CODEX_CHANNELS.AGENT_MESSAGE)
    ipcRenderer.removeAllListeners(CODEX_CHANNELS.AGENT_DONE)
    ipcRenderer.removeAllListeners(CODEX_CHANNELS.AGENT_METRICS)
  },
  // Codex 配置管理
  codexGetProviders: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_PROVIDERS),
  codexSetProviders: (data) => ipcRenderer.invoke(CODEX_CHANNELS.SET_PROVIDERS, data),
  codexWriteAuthJson: (obj) => ipcRenderer.invoke('codex-write-auth-json', obj),
  codexReadConfigToml: () => ipcRenderer.invoke('codex-read-config-toml'),
  codexWriteConfigToml: (content) => ipcRenderer.invoke('codex-write-config-toml', content),
  codexRepairConfigToml: (content) => ipcRenderer.invoke('codex-repair-config-toml', content),
  codexGetLastCwd: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_LAST_CWD),
  codexCheckEnvironment: () => ipcRenderer.invoke('codex-check-environment'),
  codexCheckLatestVersion: () => ipcRenderer.invoke('codex-check-latest-version'),
  codexInstallCodex: () => ipcRenderer.invoke('codex-install-codex'),
  codexGetKey: () => ipcRenderer.invoke('codex-get-key'),
  codexSetKey: (key) => ipcRenderer.invoke('codex-set-key', key),
  codexGetBaseURL: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_BASE_URL),
  codexSetBaseURL: (url) => ipcRenderer.invoke(CODEX_CHANNELS.SET_BASE_URL, url),
  codexGetModel: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_MODEL),
  codexSetModel: (model) => ipcRenderer.invoke(CODEX_CHANNELS.SET_MODEL, model),
  codexGetReasoningEffort: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_REASONING_EFFORT),
  codexSetReasoningEffort: (effort) => ipcRenderer.invoke(CODEX_CHANNELS.SET_REASONING_EFFORT, effort),
  codexGetApiFormat: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_API_FORMAT),
  codexSetApiFormat: (format) => ipcRenderer.invoke(CODEX_CHANNELS.SET_API_FORMAT, format),
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
  codexGetProjectSettings: (cwd) => ipcRenderer.invoke(CODEX_CHANNELS.GET_PROJECT_SETTINGS, { cwd }),
  codexSetProjectSettings: (cwd, settings) => ipcRenderer.invoke(CODEX_CHANNELS.SET_PROJECT_SETTINGS, { cwd, settings }),
  codexGetDefaultNetworkAccess: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_DEFAULT_NETWORK_ACCESS),
  codexSetDefaultNetworkAccess: (val) => ipcRenderer.invoke(CODEX_CHANNELS.SET_DEFAULT_NETWORK_ACCESS, val),
  codexGetDefaultWebSearch: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_DEFAULT_WEB_SEARCH),
  codexSetDefaultWebSearch: (val) => ipcRenderer.invoke(CODEX_CHANNELS.SET_DEFAULT_WEB_SEARCH, val),
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
    ipcRenderer.on(CORE_CHANNELS.AGENT_EVENT, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.AGENT_EVENT, handler)
  },
  }
}

module.exports = { createAgentBridge }
