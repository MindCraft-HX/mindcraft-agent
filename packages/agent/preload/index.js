let CORE_CHANNELS, CLAUDE_CHANNELS, CODEX_CHANNELS
try {
  const ipcChannels = require('../shared/ipcChannels')
  CORE_CHANNELS = ipcChannels.CORE_CHANNELS
  CLAUDE_CHANNELS = ipcChannels.CLAUDE_CHANNELS
  CODEX_CHANNELS = ipcChannels.CODEX_CHANNELS
} catch (_) {
  // Fallback: ONLY covers streaming push events.
  // Push events MUST survive a failed require because ipcRenderer.on(undefined)
  // silently drops all stream data, breaking the entire renderer.
  //
  // All other channels (CLAUDE_CHANNELS.*, CODEX_CHANNELS.*, and most
  // CORE_CHANNELS.*) will be undefined — the app is already broken if
  // ../shared/ipcChannels cannot be required.
  // When adding new channels to this bridge, prefer registering them in
  // ipcChannels.js; do NOT add them here.
  CORE_CHANNELS = {}
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
  claudeGetKey: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_KEY),
  claudeSetKey: (key) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_KEY, key),
  claudeGetBaseURL: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_BASE_URL),
  claudeSetBaseURL: (url) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_BASE_URL, url),
  claudeGetPermissionPolicy: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_PERMISSION_POLICY),
  claudeSetPermissionPolicy: (policy) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_PERMISSION_POLICY, policy),
  claudeGetLanguage: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_LANGUAGE),
  claudeSetLanguage: (language) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_LANGUAGE, language),
  claudeGetEffortLevel: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_EFFORT_LEVEL),
  claudeSetEffortLevel: (effortLevel) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_EFFORT_LEVEL, effortLevel),
  claudeGetThinkingEnabled: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_THINKING_ENABLED),
  claudeSetThinkingEnabled: (enabled) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_THINKING_ENABLED, enabled),
  claudeGetModel: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_MODEL),
  claudeSetModel: (model) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_MODEL, model),
  claudeGetModels: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_MODELS),
  claudeSetModels: (models) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_MODELS, models),
  claudeAddModel: (model) => ipcRenderer.invoke(CLAUDE_CHANNELS.ADD_MODEL, model),
  claudeRemoveModel: (modelId) => ipcRenderer.invoke(CLAUDE_CHANNELS.REMOVE_MODEL, modelId),
  claudeGetProviders: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_PROVIDERS),
  claudeSetProviders: (data) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_PROVIDERS, data),
  claudeActivateProvider: (data) => ipcRenderer.invoke(CLAUDE_CHANNELS.ACTIVATE_PROVIDER, data),
  claudeGetTierModels: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_TIER_MODELS),
  claudeSetTierModels: (data) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_TIER_MODELS, data),
  claudeGetSelectedTier: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_SELECTED_TIER),
  claudeSetSelectedTier: (tier) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_SELECTED_TIER, tier),
  claudeValidateKey: (key, baseURL, model) => ipcRenderer.invoke(CLAUDE_CHANNELS.VALIDATE_KEY, { key, baseURL, model }),
  claudeCheckEnvironment: () => ipcRenderer.invoke(CLAUDE_CHANNELS.CHECK_ENVIRONMENT),
  claudeCheckLatestVersion: () => ipcRenderer.invoke(CLAUDE_CHANNELS.CHECK_LATEST_VERSION),
  claudeInstallClaudeCode: () => ipcRenderer.invoke(CLAUDE_CHANNELS.INSTALL_CLAUDE_CODE),
  claudeGetExecutablePath: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_EXECUTABLE_PATH),
  claudeSetExecutablePath: (p) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_EXECUTABLE_PATH, p),
  claudeBrowseExecutable: () => ipcRenderer.invoke(CLAUDE_CHANNELS.BROWSE_EXECUTABLE),
  claudeReadSettingsJson: () => ipcRenderer.invoke(CLAUDE_CHANNELS.READ_SETTINGS_JSON),
  claudePatchSettingsJson: (patch) => ipcRenderer.invoke(CLAUDE_CHANNELS.PATCH_SETTINGS_JSON, patch),
  claudeRepairSettingsJson: (content) => ipcRenderer.invoke(CLAUDE_CHANNELS.REPAIR_SETTINGS_JSON, content),
  claudeFreezeDiagGetEnabled: () => ipcRenderer.invoke(CLAUDE_CHANNELS.FREEZE_DIAG_GET_ENABLED),
  claudeFreezeDiagSetEnabled: (enabled) => ipcRenderer.invoke(CLAUDE_CHANNELS.FREEZE_DIAG_SET_ENABLED, { enabled }),
  claudeGetSkipWebFetchPreflight: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_SKIP_WEBFETCH_PREFLIGHT),
  claudeSetSkipWebFetchPreflight: (v) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_SKIP_WEBFETCH_PREFLIGHT, v),
  claudeGetAutoCompactWindow: () => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_AUTO_COMPACT_WINDOW),
  claudeSetAutoCompactWindow: (v) => ipcRenderer.invoke(CLAUDE_CHANNELS.SET_AUTO_COMPACT_WINDOW, v),
  claudeImportLegacyConfig: (customPath) => ipcRenderer.invoke(CLAUDE_CHANNELS.IMPORT_LEGACY_CONFIG, customPath),
  claudeConfigImportPickFile: () => ipcRenderer.invoke(CLAUDE_CHANNELS.CONFIG_IMPORT_PICK_FILE),
  claudeConfigImportPreview: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.CONFIG_IMPORT_PREVIEW, payload),
  claudeConfigImportCommit: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.CONFIG_IMPORT_COMMIT, payload),
  // Claude Agent SDK
  claudeAgentQuery: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_QUERY, payload),
  claudeAgentAbort: (sessionId) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_ABORT, sessionId),
  claudeAgentUpdateRunMode: (sessionId, runMode) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_UPDATE_RUNMODE, { sessionId, runMode }),
  claudeAgentQueryMetrics: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.AGENT_QUERY_METRICS, payload),
  setPerfEnabled: (v) => ipcRenderer.invoke(CORE_CHANNELS.SET_PERF_ENABLED, v),
  claudeSelectDirectory: () => ipcRenderer.invoke(CLAUDE_CHANNELS.SELECT_DIRECTORY),
  claudeListFiles: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.LIST_FILES, payload),
  claudeListSlashCommands: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.LIST_SLASH_COMMANDS, payload),
  claudeListLocalSkills: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.LIST_LOCAL_SKILLS, payload),
  claudeGetLastCompactSummary: (sessionId) => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_LAST_COMPACT_SUMMARY, sessionId),
  claudeReadSessionMeta: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.READ_SESSION_META, payload),
  claudeWriteSessionMeta: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.WRITE_SESSION_META, payload),
  claudeLoadCodePanelState: (cwd) => ipcRenderer.invoke(CLAUDE_CHANNELS.LOAD_CODE_PANEL_STATE, { cwd }),
  claudeSaveCodePanelState: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.SAVE_CODE_PANEL_STATE, payload),
  claudeSaveCodePanelStateSync: (payload) => ipcRenderer.sendSync(CLAUDE_CHANNELS.SAVE_CODE_PANEL_STATE_SYNC, payload),
  getSessionInstruction: (chatKey) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_GET_SESSION_INSTRUCTION, { chatKey }),
  setSessionInstruction: (payload) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_SET_SESSION_INSTRUCTION, payload),
  setSessionTitle: (payload) => ipcRenderer.invoke(CORE_CHANNELS.AGENT_SET_SESSION_TITLE, payload),
  getSessionDraft: (chatKey) => ipcRenderer.invoke(CORE_CHANNELS.GET_SESSION_DRAFT, { chatKey }),
  setSessionDraft: (payload) => ipcRenderer.invoke(CORE_CHANNELS.SET_SESSION_DRAFT, payload),
  setSessionDraftSync: (payload) => ipcRenderer.sendSync(CORE_CHANNELS.SET_SESSION_DRAFT_SYNC, payload),
  clearSessionDraft: (chatKey) => ipcRenderer.invoke(CORE_CHANNELS.CLEAR_SESSION_DRAFT, { chatKey }),
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
    ipcRenderer.on(CORE_CHANNELS.SKILLS_INSTALL_PROGRESS, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.SKILLS_INSTALL_PROGRESS, handler)
  },
  claudeScanProjectsSessions: (cwd) => ipcRenderer.invoke(CLAUDE_CHANNELS.SCANNER_PROJECTS_SESSIONS, { cwd }),
  claudeRenameSession: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.RENAME_SESSION, payload),
  claudeReadSessionFile: (filePath) => ipcRenderer.invoke(CLAUDE_CHANNELS.READ_SESSION, { filePath }),
  // 主题持久化（IPC 文件存储，绕过 Chromium localStorage）
  loadTheme: () => ipcRenderer.sendSync(CORE_CHANNELS.LOAD_THEME),
  saveTheme: (name) => ipcRenderer.send(CORE_CHANNELS.SAVE_THEME, name),
  claudeReadSessionFileRange: (params) => ipcRenderer.invoke(CLAUDE_CHANNELS.READ_SESSION_FILE_RANGE, params),
  claudeGetFileStat: (filePath) => ipcRenderer.invoke(CLAUDE_CHANNELS.GET_FILE_STAT, { filePath }),
  claudeDeleteSessionFile: (filePath) => ipcRenderer.invoke(CLAUDE_CHANNELS.DELETE_SESSION_FILE, { filePath }),
  claudeWriteClipboard: (text) => ipcRenderer.invoke(CLAUDE_CHANNELS.WRITE_CLIPBOARD, text),
  claudeScanCliSessions: (cwd) => ipcRenderer.invoke(CLAUDE_CHANNELS.SCAN_CLI_SESSIONS, { cwd }),
  claudeRegisterCliSessions: (map) => ipcRenderer.invoke(CLAUDE_CHANNELS.REGISTER_CLI_SESSIONS, map),
  // Memory 管理
  claudeMemoryList: (cwd, scope) => ipcRenderer.invoke(CLAUDE_CHANNELS.MEMORY_LIST, { cwd, scope }),
  claudeMemoryRead: ({ cwd, filename, scope }) => ipcRenderer.invoke(CLAUDE_CHANNELS.MEMORY_READ, { cwd, filename, scope }),
  claudeMemoryWrite: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.MEMORY_WRITE, payload),
  claudeMemoryDelete: ({ cwd, filename, scope }) => ipcRenderer.invoke(CLAUDE_CHANNELS.DELETE_MEMORY, { cwd, filename, scope }),
  claudeMemoryGetInjectMode: () => ipcRenderer.invoke(CLAUDE_CHANNELS.MEMORY_GET_INJECT_MODE),
  claudeMemorySetInjectMode: (mode) => ipcRenderer.invoke(CLAUDE_CHANNELS.MEMORY_SET_INJECT_MODE, mode),
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
  claudeChat: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.CHAT, payload),
  claudeChatContinue: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.CHAT_CONTINUE, payload),
  claudeChatAbort: (payload) => ipcRenderer.invoke(CLAUDE_CHANNELS.CHAT_ABORT, payload),
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
  codexSelectDirectory: () => ipcRenderer.invoke(CODEX_CHANNELS.SELECT_DIRECTORY),
  codexRegisterCliSessions: (map) => ipcRenderer.invoke(CODEX_CHANNELS.REGISTER_CLI_SESSIONS, map),
  codexUnregisterCliSession: (sessionId) => ipcRenderer.invoke(CODEX_CHANNELS.UNREGISTER_CLI_SESSION, sessionId),
  codexListSessionsByCwd: (cwd) => ipcRenderer.invoke(CODEX_CHANNELS.LIST_SESSIONS_BY_CWD, cwd),
  codexRenameSession: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.RENAME_SESSION, payload),
  codexDeleteSession: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.DELETE_SESSION, payload),
  codexDeleteSessionFile: (filePath) => ipcRenderer.invoke(CODEX_CHANNELS.DELETE_SESSION_FILE, { filePath }),
  codexReadSessionFileRange: (params) => ipcRenderer.invoke(CODEX_CHANNELS.READ_SESSION_FILE_RANGE, params),
  codexGetFileStat: (filePath) => ipcRenderer.invoke(CODEX_CHANNELS.GET_FILE_STAT, { filePath }),
  codexListSlashCommands: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.LIST_SLASH_COMMANDS, payload),
  codexListLocalSkills: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.LIST_LOCAL_SKILLS, payload),
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
  codexWriteAuthJson: (obj) => ipcRenderer.invoke(CODEX_CHANNELS.WRITE_AUTH_JSON, obj),
  codexReadConfigToml: () => ipcRenderer.invoke(CODEX_CHANNELS.READ_CONFIG_TOML),
  codexWriteConfigToml: (content) => ipcRenderer.invoke(CODEX_CHANNELS.WRITE_CONFIG_TOML, content),
  codexRepairConfigToml: (content) => ipcRenderer.invoke(CODEX_CHANNELS.REPAIR_CONFIG_TOML, content),
  codexGetLastCwd: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_LAST_CWD),
  codexCheckEnvironment: () => ipcRenderer.invoke(CODEX_CHANNELS.CHECK_ENVIRONMENT),
  codexCheckLatestVersion: () => ipcRenderer.invoke(CODEX_CHANNELS.CHECK_LATEST_VERSION),
  codexInstallCodex: () => ipcRenderer.invoke(CODEX_CHANNELS.INSTALL_CODEX),
  codexGetKey: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_KEY),
  codexSetKey: (key) => ipcRenderer.invoke(CODEX_CHANNELS.SET_KEY, key),
  codexGetBaseURL: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_BASE_URL),
  codexSetBaseURL: (url) => ipcRenderer.invoke(CODEX_CHANNELS.SET_BASE_URL, url),
  codexGetModel: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_MODEL),
  codexSetModel: (model) => ipcRenderer.invoke(CODEX_CHANNELS.SET_MODEL, model),
  codexGetReasoningEffort: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_REASONING_EFFORT),
  codexSetReasoningEffort: (effort) => ipcRenderer.invoke(CODEX_CHANNELS.SET_REASONING_EFFORT, effort),
  codexGetApiFormat: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_API_FORMAT),
  codexSetApiFormat: (format) => ipcRenderer.invoke(CODEX_CHANNELS.SET_API_FORMAT, format),
  codexImportLegacyConfig: (customPath) => ipcRenderer.invoke(CODEX_CHANNELS.IMPORT_LEGACY_CONFIG, customPath),
  codexConfigImportPickFile: () => ipcRenderer.invoke(CODEX_CHANNELS.CONFIG_IMPORT_PICK_FILE),
  codexConfigImportPreview: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.CONFIG_IMPORT_PREVIEW, payload),
  codexConfigImportCommit: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.CONFIG_IMPORT_COMMIT, payload),
  // System-level config import (T163: CC Switch global import)
  configImportPickFile: () => ipcRenderer.invoke(CORE_CHANNELS.CONFIG_IMPORT_PICK_FILE),
  configImportPreview: (payload) => ipcRenderer.invoke(CORE_CHANNELS.CONFIG_IMPORT_PREVIEW, payload),
  configImportCommit: (payload) => ipcRenderer.invoke(CORE_CHANNELS.CONFIG_IMPORT_COMMIT, payload),
  // System-level config export (mindcraft-providers.sql)
  configExportPreview: () => ipcRenderer.invoke(CORE_CHANNELS.CONFIG_EXPORT_PREVIEW),
  configExportSave: (payload) => ipcRenderer.invoke(CORE_CHANNELS.CONFIG_EXPORT_SAVE, payload),
  codexGetSandboxMode: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_SANDBOX_MODE),
  codexSetSandboxMode: (mode) => ipcRenderer.invoke(CODEX_CHANNELS.SET_SANDBOX_MODE, mode),
  codexGetProjectSettings: (cwd) => ipcRenderer.invoke(CODEX_CHANNELS.GET_PROJECT_SETTINGS, { cwd }),
  codexSetProjectSettings: (cwd, settings) => ipcRenderer.invoke(CODEX_CHANNELS.SET_PROJECT_SETTINGS, { cwd, settings }),
  codexGetDefaultNetworkAccess: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_DEFAULT_NETWORK_ACCESS),
  codexSetDefaultNetworkAccess: (val) => ipcRenderer.invoke(CODEX_CHANNELS.SET_DEFAULT_NETWORK_ACCESS, val),
  codexGetDefaultWebSearch: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_DEFAULT_WEB_SEARCH),
  codexSetDefaultWebSearch: (val) => ipcRenderer.invoke(CODEX_CHANNELS.SET_DEFAULT_WEB_SEARCH, val),
  codexValidateKey: (key, baseURL, model) => ipcRenderer.invoke(CODEX_CHANNELS.VALIDATE_KEY, { key, baseURL, model }),
  codexListAvailableModels: () => ipcRenderer.invoke(CODEX_CHANNELS.LIST_AVAILABLE_MODELS),
  codexRunGitDiff: (cwd) => ipcRenderer.invoke(CODEX_CHANNELS.RUN_GIT_DIFF, { cwd }),
  // Git workspace changes drawer (shared: ClaudeCode + CodeX)
  gitGetWorkspaceChanges: (cwd) => ipcRenderer.invoke(CORE_CHANNELS.GIT_WORKSPACE_CHANGES, { cwd }),
  gitGetFileDiff: (cwd, relativePath, changeKind) => ipcRenderer.invoke(CORE_CHANNELS.GIT_FILE_DIFF, { cwd, relativePath, changeKind }),
  codexLoadCodePanelState: () => ipcRenderer.invoke(CODEX_CHANNELS.LOAD_CODE_PANEL_STATE),
  codexSaveCodePanelState: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.SAVE_CODE_PANEL_STATE, payload),
  codexSaveCodePanelStateSync: (payload) => ipcRenderer.sendSync(CODEX_CHANNELS.SAVE_CODE_PANEL_STATE_SYNC, payload),
  // CodeX 插件管理
  codexPluginsGetState: () => ipcRenderer.invoke(CODEX_CHANNELS.GET_PLUGINS_STATE),
  codexPluginsInstall: (pluginId) => ipcRenderer.invoke(CODEX_CHANNELS.INSTALL_PLUGIN, pluginId),
  codexPluginsUninstall: (pluginId) => ipcRenderer.invoke(CODEX_CHANNELS.UNINSTALL_PLUGIN, pluginId),
  codexPluginsEnable: (pluginId) => ipcRenderer.invoke(CODEX_CHANNELS.ENABLE_PLUGIN, pluginId),
  codexPluginsDisable: (pluginId) => ipcRenderer.invoke(CODEX_CHANNELS.DISABLE_PLUGIN, pluginId),
  codexSkillsGetCatalog: () => ipcRenderer.invoke(CODEX_CHANNELS.SKILLS_GET_CATALOG),
  codexSkillsGetState: (cwd) => ipcRenderer.invoke(CODEX_CHANNELS.GET_SKILLS_STATE, { cwd }),
  codexSkillsInstall: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.INSTALL_SKILL, payload),
  codexSkillsUninstall: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.UNINSTALL_SKILL, payload),
  codexSkillsMarketInstall: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.MARKET_INSTALL_SKILL, payload),
  onCodexSkillsInstallProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on(CORE_CHANNELS.SKILLS_INSTALL_PROGRESS, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.SKILLS_INSTALL_PROGRESS, handler)
  },
  // 简易对话：CodeX
  codexChat: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.CHAT, payload),
  codexChatContinue: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.CHAT_CONTINUE, payload),
  codexChatAbort: (payload) => ipcRenderer.invoke(CODEX_CHANNELS.CHAT_ABORT, payload),
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
