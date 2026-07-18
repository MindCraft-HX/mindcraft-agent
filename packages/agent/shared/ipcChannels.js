'use strict';

/**
 * IPC Channel Registry — single source of truth for all IPC channel names.
 *
 * Every ipcMain.handle/on and ipcRenderer.invoke/send/on MUST reference a
 * value from one of the three channel groups below.  Raw strings are
 * forbidden for new code and should be replaced on touch for existing code.
 *
 * Naming convention (not enforced yet — future migration):
 *   claude:<verb>-<noun>
 *   codex:<verb>-<noun>
 *   core:<verb>-<noun>
 */

const CLAUDE_CHANNELS = Object.freeze({
  GET_KEY: 'claude-get-key',
  SET_KEY: 'claude-set-key',
  GET_ENABLED: 'claude-get-enabled',
  SET_ENABLED: 'claude-set-enabled',
  CHECK_ENV: 'claude-check-env',
  GET_API_CONFIG: 'claude-get-api-config',
  SET_API_CONFIG: 'claude-set-api-config',
  SET_THEME: 'claude-set-theme',
  SET_AUTO_COMPACT_WINDOW: 'claude-set-auto-compact-window',
  SET_BASE_URL: 'claude-set-base-url',
  SET_EXECUTABLE_PATH: 'claude-set-executable-path',
  SET_LANGUAGE: 'claude-set-language',
  SET_MODEL: 'claude-set-model',
  SET_MODELS: 'claude-set-models',
  SET_PERMISSION_POLICY: 'claude-set-permission-policy',
  SET_PROVIDERS: 'claude-set-providers',
  SET_SELECTED_TIER: 'claude-set-selected-tier',
  SET_SKIP_WEBFETCH_PREFLIGHT: 'claude-set-skip-webfetch-preflight',
  SET_THINKING_ENABLED: 'claude-set-thinking-enabled',
  SET_TIER_MODELS: 'claude-set-tier-models',
  GET_THEME: 'claude-get-theme',
  CHAT_SEND: 'claude-chat-send',
  CHAT_ABORT: 'claude-chat-abort',
  CHAT_INTERRUPT: 'claude-chat-interrupt',
  GET_SKILLS_STATE: 'claude-skills-get-state',
  INSTALL_SKILL: 'claude-skills-install',
  UNINSTALL_SKILL: 'claude-skills-uninstall',
  MARKET_INSTALL_SKILL: 'claude-skills-market-install',
  GET_PLUGINS_STATE: 'claude-plugins-get-state',
  ENABLE_PLUGIN: 'claude-plugins-enable',
  DISABLE_PLUGIN: 'claude-plugins-disable',
  INSTALL_PLUGIN: 'claude-plugins-install',
  UNINSTALL_PLUGIN: 'claude-plugins-uninstall',
  GET_MEMORY: 'claude-memory-get',
  SET_MEMORY: 'claude-memory-set',
  DELETE_MEMORY: 'claude-memory-delete',
  MEMORY_GET_INJECT_MODE: 'claude-memory-get-inject-mode',
  MEMORY_SET_INJECT_MODE: 'claude-memory-set-inject-mode',
  MEMORY_LIST: 'claude-memory-list',
  MEMORY_READ: 'claude-memory-read',
  MEMORY_WRITE: 'claude-memory-write',
  GET_METRICS: 'claude-get-metrics',
  GET_CONTEXT_USAGE: 'claude-get-context-usage',
  GET_AUTO_COMPACT_WINDOW: 'claude-get-auto-compact-window',
  GET_BASE_URL: 'claude-get-base-url',
  GET_EFFORT_LEVEL: 'claude-get-effort-level',
  GET_EXECUTABLE_PATH: 'claude-get-executable-path',
  GET_FILE_STAT: 'claude-get-file-stat',
  GET_LANGUAGE: 'claude-get-language',
  GET_LAST_COMPACT_SUMMARY: 'claude-get-last-compact-summary',
  GET_MODEL: 'claude-get-model',
  GET_MODELS: 'claude-get-models',
  GET_PERMISSION_POLICY: 'claude-get-permission-policy',
  GET_PROVIDERS: 'claude-get-providers',
  GET_SELECTED_TIER: 'claude-get-selected-tier',
  GET_SKIP_WEBFETCH_PREFLIGHT: 'claude-get-skip-webfetch-preflight',
  GET_THINKING_ENABLED: 'claude-get-thinking-enabled',
  GET_TIER_MODELS: 'claude-get-tier-models',
  SCAN_SESSIONS: 'claude-scan-sessions',
  GET_SESSION: 'claude-get-session',
  READ_SESSION: 'claude-read-session-file',
  DELETE_SESSION: 'claude-delete-session',
  RENAME_SESSION: 'claude-rename-session',
  GET_SESSION_TITLE: 'claude-get-session-title',
  GET_TASK_STATE: 'claude-get-task-state',
  SETTINGS_REPAIR: 'claude-settings-repair',
  ACTIVATE_PROVIDER: 'claude-activate-provider',
  ADD_MODEL: 'claude-add-model',
  REMOVE_MODEL: 'claude-remove-model',
  BROWSE_EXECUTABLE: 'claude-browse-executable',
  CHAT: 'claude-chat',
  CHAT_CONTINUE: 'claude-chat-continue',
  CHECK_ENVIRONMENT: 'claude-check-environment',
  CHECK_LATEST_VERSION: 'claude-check-latest-version',
  DELETE_SESSION_FILE: 'claude-delete-session-file',
  FREEZE_DIAG_GET_ENABLED: 'claude-freeze-diag-get-enabled',
  FREEZE_DIAG_SET_ENABLED: 'claude-freeze-diag-set-enabled',
  IMPORT_LEGACY_CONFIG: 'claude-import-legacy-config',
  INSTALL_CLAUDE_CODE: 'claude-install-claude-code',
  LIST_FILES: 'claude-list-files',
  LIST_LOCAL_SKILLS: 'claude-list-local-skills',
  LIST_SLASH_COMMANDS: 'claude-list-slash-commands',
  LOAD_CODE_PANEL_STATE: 'claude-load-code-panel-state',
  PATCH_SETTINGS_JSON: 'claude-patch-settings-json',
  READ_SESSION_FILE_RANGE: 'claude-read-session-file-range',
  READ_SESSION_META: 'claude-read-session-meta',
  READ_SETTINGS_JSON: 'claude-read-settings-json',
  REGISTER_CLI_SESSIONS: 'claude-register-cli-sessions',
  REPAIR_SETTINGS_JSON: 'claude-repair-settings-json',
  SAVE_CODE_PANEL_STATE: 'claude-save-code-panel-state',
  SAVE_CODE_PANEL_STATE_SYNC: 'claude-save-code-panel-state-sync',
  SCAN_CLI_SESSIONS: 'claude-scan-cli-sessions',
  SCANNER_PROJECTS_SESSIONS: 'claude-scanner-projects-sessions',
  SELECT_DIRECTORY: 'claude-select-directory',
  VALIDATE_KEY: 'claude-validate-key',
  WRITE_CLIPBOARD: 'claude-write-clipboard',
  WRITE_SESSION_META: 'claude-write-session-meta',
  SET_EFFORT_LEVEL: 'claude-set-effort-level',
  SET_PERMISSION_MODE: 'claude-set-permission-mode',
  GIT_MIRROR_GET: 'claude-git-mirror-get',
  GIT_MIRROR_SET: 'claude-git-mirror-set',
  SANDBOX_GET_MODE: 'claude-sandbox-get-mode',
  SANDBOX_SET_MODE: 'claude-sandbox-set-mode',
  CONFIG_IMPORT_PICK_FILE: 'claude-config-import-pick-file',
  CONFIG_IMPORT_PREVIEW: 'claude-config-import-preview',
  CONFIG_IMPORT_COMMIT: 'claude-config-import-commit',

  // Agent lifecycle
  AGENT_QUERY: 'claude-agent-query',
  AGENT_ABORT: 'claude-agent-abort',
  AGENT_UPDATE_RUNMODE: 'claude-agent-update-runmode',
  AGENT_QUERY_METRICS: 'claude-agent-query-metrics',
  AGENT_MESSAGE: 'claude-agent-message',
  AGENT_DONE: 'claude-agent-done',
  AGENT_PERMISSION: 'claude-agent-permission',
  AGENT_ASK_QUESTION: 'claude-agent-ask-question',
  AGENT_PLAN_REVIEW: 'claude-agent-plan-review',
  AGENT_METRICS: 'claude-agent-metrics',
  AGENT_EARLY_CLI_SESSION: 'claude-agent-early-cli-session',
  PERMISSION_RESPONSE: 'claude-permission-response',
  ASK_QUESTION_RESPONSE: 'claude-ask-question-response',
  PLAN_REVIEW_RESPONSE: 'claude-plan-review-response',

  // Streaming push events
  STREAM_CHUNK: 'claude-stream-chunk',
  STREAM_THINKING: 'claude-stream-thinking',
  STREAM_TOOL_START: 'claude-stream-tool-start',
  STREAM_TOOL_INPUT: 'claude-stream-tool-input',
});

const CODEX_CHANNELS = Object.freeze({
  GET_KEY: 'codex-get-key',
  SET_KEY: 'codex-set-key',
  GET_ENABLED: 'codex-get-enabled',
  SET_ENABLED: 'codex-set-enabled',
  CHECK_ENV: 'codex-check-env',
  GET_API_CONFIG: 'codex-get-api-config',
  SET_API_CONFIG: 'codex-set-api-config',
  GET_SANDBOX_MODE: 'codex-get-sandbox-mode',
  SET_SANDBOX_MODE: 'codex-set-sandbox-mode',
  GET_NETWORK_ACCESS: 'codex-get-network-access',
  SET_NETWORK_ACCESS: 'codex-set-network-access',
  GET_WEB_SEARCH: 'codex-get-web-search',
  SET_WEB_SEARCH: 'codex-set-web-search',
  GET_API_FORMAT: 'codex-get-api-format',
  SET_API_FORMAT: 'codex-set-api-format',
  GET_BASE_URL: 'codex-get-base-url',
  GET_EXECUTABLE_PATH: 'codex-get-executable-path',
  SET_BASE_URL: 'codex-set-base-url',
  SET_EXECUTABLE_PATH: 'codex-set-executable-path',
  GET_DEFAULT_NETWORK_ACCESS: 'codex-get-default-network-access',
  SET_DEFAULT_NETWORK_ACCESS: 'codex-set-default-network-access',
  GET_DEFAULT_WEB_SEARCH: 'codex-get-default-web-search',
  SET_DEFAULT_WEB_SEARCH: 'codex-set-default-web-search',
  GET_LAST_CWD: 'codex-get-last-cwd',
  GET_MODEL: 'codex-get-model',
  SET_MODEL: 'codex-set-model',
  GET_PROJECT_SETTINGS: 'codex-get-project-settings',
  SET_PROJECT_SETTINGS: 'codex-set-project-settings',
  GET_PROVIDERS: 'codex-get-providers',
  SET_PROVIDERS: 'codex-set-providers',
  GET_REASONING_EFFORT: 'codex-get-reasoning-effort',
  CHAT_SEND: 'codex-chat-send',
  CHAT_ABORT: 'codex-chat-abort',
  CHAT_CONTINUE: 'codex-chat-continue',
  GET_SKILLS_STATE: 'codex-skills-get-state',
  INSTALL_SKILL: 'codex-skills-install',
  UNINSTALL_SKILL: 'codex-skills-uninstall',
  MARKET_INSTALL_SKILL: 'codex-skills-market-install',
  GET_PLUGINS_STATE: 'codex-plugins-get-state',
  ENABLE_PLUGIN: 'codex-plugins-enable',
  DISABLE_PLUGIN: 'codex-plugins-disable',
  INSTALL_PLUGIN: 'codex-plugins-install',
  UNINSTALL_PLUGIN: 'codex-plugins-uninstall',
  GET_METRICS: 'codex-get-metrics',
  GET_CONTEXT_USAGE: 'codex-get-context-usage',
  SCAN_SESSIONS: 'codex-scan-sessions',
  GET_SESSION: 'codex-get-session',
  DELETE_SESSION: 'codex-delete-session',
  RENAME_SESSION: 'codex-rename-session',
  GET_SESSION_TITLE: 'codex-get-session-title',
  REPAIR_CONFIG: 'codex-repair-config',
  IMPORT_CONFIG: 'codex-import-config',
  GET_RUNTIME_CONFIG: 'codex-get-runtime-config',
  SET_REASONING_EFFORT: 'codex-set-reasoning-effort',
  GET_FILE_CHANGE_PREVIEW: 'codex-get-file-change-preview',
  GET_CURRENT_PLAN: 'codex-get-current-plan',
  CONFIG_IMPORT_PICK_FILE: 'codex-config-import-pick-file',
  CONFIG_IMPORT_PREVIEW: 'codex-config-import-preview',
  CONFIG_IMPORT_COMMIT: 'codex-config-import-commit',
  GET_FILE_STAT: 'codex-get-file-stat',

  // Agent lifecycle
  AGENT_QUERY: 'codex-agent-query',
  AGENT_ABORT: 'codex-agent-abort',
  AGENT_DONE: 'codex-agent-done',
  AGENT_MESSAGE: 'codex-agent-message',
  AGENT_METRICS: 'codex-agent-metrics',
  AGENT_QUERY_METRICS: 'codex-agent-query-metrics',

  // Streaming push events
  STREAM_CHUNK: 'codex-stream-chunk',
  STREAM_THINKING: 'codex-stream-thinking',
  STREAM_TOOL_DELTA: 'codex-stream-tool-delta',

  // Chat
  CHAT: 'codex-chat',

  // Environment & updates
  CHECK_ENVIRONMENT: 'codex-check-environment',
  CHECK_LATEST_VERSION: 'codex-check-latest-version',
  INSTALL_CODEX: 'codex-install-codex',

  // Session lifecycle
  LIST_SESSIONS_BY_CWD: 'codex-list-sessions-by-cwd',
  REGISTER_CLI_SESSIONS: 'codex-register-cli-sessions',
  UNREGISTER_CLI_SESSION: 'codex-unregister-cli-session',
  DELETE_SESSION_FILE: 'codex-delete-session-file',
  READ_SESSION_FILE_RANGE: 'codex-read-session-file-range',

  // Commands & skills
  LIST_SLASH_COMMANDS: 'codex-list-slash-commands',
  LIST_LOCAL_SKILLS: 'codex-list-local-skills',
  SKILLS_GET_CATALOG: 'codex-skills-get-catalog',

  // Panel state
  LOAD_CODE_PANEL_STATE: 'codex-load-code-panel-state',
  SAVE_CODE_PANEL_STATE: 'codex-save-code-panel-state',
  SAVE_CODE_PANEL_STATE_SYNC: 'codex-save-code-panel-state-sync',

  // Auth & config
  VALIDATE_KEY: 'codex-validate-key',
  LIST_AVAILABLE_MODELS: 'codex-list-available-models',
  WRITE_AUTH_JSON: 'codex-write-auth-json',

  // Config TOML
  READ_CONFIG_TOML: 'codex-read-config-toml',
  WRITE_CONFIG_TOML: 'codex-write-config-toml',
  REPAIR_CONFIG_TOML: 'codex-repair-config-toml',
  IMPORT_LEGACY_CONFIG: 'codex-import-legacy-config',
  BROWSE_EXECUTABLE: 'codex-browse-executable',

  // Git
  RUN_GIT_DIFF: 'codex-run-git-diff',

  // Directory
  SELECT_DIRECTORY: 'codex-select-directory',
});

const CORE_CHANNELS = Object.freeze({
  // Settings & config
  GET_SETTING: 'get-setting',
  SET_SETTING: 'set-setting',
  GET_ALL_SETTINGS: 'get-all-settings',

  // Window management
  OPEN_MAIN_WINDOW: 'open-main-window',
  OPEN_CODE_WINDOW: 'open-code-window',
  OPEN_SETTINGS: 'open-settings',

  // App lifecycle
  CHECK_FOR_UPDATES: 'check-for-updates',
  DOWNLOAD_UPDATE: 'download-update',
  INSTALL_UPDATE: 'install-update',

  // File system
  SELECT_DIRECTORY: 'select-directory',
  SELECT_FILE: 'select-file',
  READ_FILE: 'read-file',
  WRITE_FILE: 'write-file',
  OPEN_EXTERNAL: 'open-external',
  OPEN_EXTERNAL_CONFIRM: 'open-external-confirm',
  READ_FILE_BY_PATH: 'read-file-by-path',
  READ_FILE_SYNC: 'read-file-sync',
  WRITE_FILE_SYNC: 'write-file-sync',
  UNLINK_FILE_SYNC: 'unlink-file-sync',
  RMDIR_SYNC: 'rmdir-sync',
  EXISTS_FILE_SYNC: 'exists-file-sync',
  MKDIR_SYNC: 'mkdir-sync',
  COPY_FILE_SYNC: 'copy-file-sync',
  RENAME_FILE_SYNC: 'rename-file-sync',
  READ_DIR_SYNC: 'read-dir-Sync',
  EXEC_CMD: 'exec-cmd',
  OPEN_FILE_DIALOG: 'open-file-dialog',
  OPEN_FILE_WITH_DEFAULT: 'open-file-with-default',
  OPEN_FOLDER: 'open-folder',
  OPEN_EMAIL: 'openEmail',
  SELECT_AND_READ_FILE: 'select-and-read-file',
  UNCOMPRESS_ZIP_FILE: 'unCompress-zip-file',

  // Window / document
  OPEN_DOCUMENT_CANDIDATE: 'open-document-candidate',
  RESOLVE_DOCUMENT_CANDIDATE: 'resolve-document-candidate',
  OPEN_CLAUDE_WIN: 'open-claude-win',
  OPEN_CODEX_WIN: 'open-codex-win',
  OPEN_EXTERNAL_WINDOW: 'open-external-window',
  OPEN_MD_VIEWER: 'open-md-viewer',
  OPEN_MD_WIN: 'open-md-win',
  OPEN_SYSTEM_SETTINGS: 'open-system-settings',
  OPEN_TAB_BY_NAME: 'open-tab-by-name',

  // Window management
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_MAXIMIZE: 'window-maximize',
  WINDOW_CLOSE: 'window-close',
  WINDOW_IS_MAXIMIZED: 'window-is-maximized',
  WINDOW_PERFORMANCE_STATE: 'window-performance-state',
  WINDOW_ROLE_GET: 'window-role-get',

  // Workbench platform (main-workbench only)
  WORKBENCH_LAYOUT_LOAD: 'workbench-layout-load',
  WORKBENCH_LAYOUT_SAVE: 'workbench-layout-save',
  CLOSE_COORDINATOR_REQUEST: 'close-coordinator-request',
  CLOSE_COORDINATOR_RESPONSE: 'close-coordinator-response',

  // Local search
  LOCAL_SEARCH: 'local-search',
  LOCAL_SEARCH_INDEX: 'local-search-index',
  LOCAL_SEARCH_CAPABILITY: 'local-search-capability',
  LOCAL_SEARCH_TEXT: 'local-search-text',
  LOCAL_SEARCH_FILES: 'local-search-files',
  LOCAL_SEARCH_DIAGNOSE: 'local-search-diagnose',

  // Session instruction
  GET_SESSION_INSTRUCTION: 'get-session-instruction',
  SET_SESSION_INSTRUCTION: 'set-session-instruction',
  GET_ATTACHMENTS: 'get-attachments',
  SET_ATTACHMENTS: 'set-attachments',
  AGENT_GET_SESSION_INSTRUCTION: 'agent-get-session-instruction',
  AGENT_SET_SESSION_INSTRUCTION: 'agent-set-session-instruction',
  AGENT_SET_SESSION_TITLE: 'agent-set-session-title',
  AGENT_OPEN_SESSION_ATTACHMENT_DIALOG: 'agent-open-session-attachment-dialog',
  AGENT_RESOLVE_SESSION_ATTACHMENTS: 'agent-resolve-session-attachments',
  AGENT_BUILD_SESSION_INSTRUCTION_PROMPT: 'agent-build-session-instruction-prompt',
  AGENT_EVENT: 'agent:event',

  // Home / codeHub
  GET_HOME_METRICS: 'get-home-metrics',
  GET_RECENT_PROJECTS: 'get-recent-projects',
  HOME_GET_RECENT_PROJECT: 'home-get-recent-project',
  HOME_GET_TODAY_STATS: 'home-get-today-stats',
  HOME_GET_TOKEN_TREND: 'home-get-token-trend',

  // Chat
  CHAT_WEB_SEARCH: 'chat-web-search',

  // Skills (cross-agent)
  SKILLS_GET_CATALOG: 'skills-get-catalog',
  SKILLS_GET_STATE: 'skills-get-state',
  SKILLS_INSTALL: 'skills-install',
  SKILLS_UNINSTALL: 'skills-uninstall',
  SKILLS_MARKET_INSTALL: 'skills-market-install',

  // Plugin system
  PLUGIN_GET_INSTALLED: 'plugin-get-installed',
  PLUGIN_MARKETPLACE_LISTING: 'plugin-marketplace-listing',
  PLUGIN_MARKETPLACE_INSTALL: 'plugin-marketplace-install',
  PLUGIN_MARKETPLACE_UNINSTALL: 'plugin-marketplace-uninstall',
  PLUGIN_MARKETPLACE_ENABLE: 'plugin-marketplace-enable',
  PLUGIN_MARKETPLACE_DISABLE: 'plugin-marketplace-disable',
  PLUGIN_GET_DATA: 'plugin-get-data',
  PLUGIN_SET_DATA: 'plugin-set-data',
  PLUGIN_DELETE_DATA: 'plugin-delete-data',
  PLUGIN_READ_ASSET: 'plugin-read-asset',
  PLUGIN_READ_ENTRY: 'plugin-read-entry',
  PLUGIN_REGISTRY_CHANGED: 'plugin-registry-changed',
  PLUGINS_GET_STATE: 'plugins-get-state',
  PLUGINS_SAVE_STATE: 'plugins-save-state',
  PLUGINS_INSTALL: 'plugins-install',
  PLUGINS_UNINSTALL: 'plugins-uninstall',
  PLUGINS_ENABLE: 'plugins-enable',
  PLUGINS_DISABLE: 'plugins-disable',

  // Config import (system-level, cross-agent)
  CONFIG_IMPORT_PICK_FILE: 'config-import-pick-file',
  CONFIG_IMPORT_PREVIEW: 'config-import-preview',
  CONFIG_IMPORT_COMMIT: 'config-import-commit',
  CONFIG_EXPORT_PREVIEW: 'config-export-preview',
  CONFIG_EXPORT_SAVE: 'config-export-save',

  // Cross-agent
  SKILLS_INSTALL_PROGRESS: 'skills-install-progress',
  LOG: 'log',
  NOTIFICATION_AUDIO_UNLOCK: 'notification-audio-unlock',

  // Chat persistence (cross-agent session index)
  CHAT_LIST_SESSIONS: 'chat-list-sessions',
  CHAT_GET_SESSION: 'chat-get-session',
  CHAT_SAVE_SESSION: 'chat-save-session',
  CHAT_DELETE_SESSION: 'chat-delete-session',
  CHAT_GENERATE_TITLE: 'chat-generate-title',

  // Auto-start on boot
  GET_LOGIN_ITEM: 'get-login-item-settings',
  SET_LOGIN_ITEM: 'set-login-item-settings',

  // CodeHub SessionIndex (T184)
  LOAD_CODEHUB_SESSION_INDEX: 'agent-load-codehub-session-index',

  // Session draft (cross-agent sessionInstruction)
  GET_SESSION_DRAFT: 'agent-get-session-draft',
  SET_SESSION_DRAFT: 'agent-set-session-draft',
  SET_SESSION_DRAFT_SYNC: 'agent-set-session-draft-sync',
  CLEAR_SESSION_DRAFT: 'agent-clear-session-draft',

  // Git workspace changes (shared drawer for ClaudeCode + CodeX)
  GIT_WORKSPACE_CHANGES: 'core-git-workspace-changes',
  GIT_FILE_DIFF: 'core-git-file-diff',

  // Performance diagnostics
  SET_PERF_ENABLED: 'agent-set-perf-enabled',

  // E2E test infrastructure (T196: only active when MINDCRAFT_E2E_TEST is set)
  E2E_GET_PROVIDER_COUNT: '__e2e_get_provider_count',
  E2E_PING: '__e2e_ping',

  // App diagnostics / lifecycle
  GET_APP_VERSION: 'get-app-version',
  GET_DIAGNOSTICS_ENABLED: 'get-diagnostics-enabled',
  SET_DIAGNOSTICS_ENABLED: 'set-diagnostics-enabled',
  GET_APP_UPDATE_STATUS: 'get-app-update-status',
  GET_UPDATE_INFO_DATA: 'get-update-info-data',
  APP_UPDATE_STATUS: 'app-update-status',
  CLIENT_UPDATE_INFO_DATA: 'client-update-info-data',
  LOAD_LOCALE: 'load-locale',
  SAVE_LOCALE: 'save-locale',
  LOAD_THEME: 'load-theme',
  SAVE_THEME: 'save-theme',
  FLASH_TASKBAR: 'flash-taskbar',
  APPEND_TASK_LOG: 'append-task-log',
  MD_CONTENT: 'md-content',
  MD_VIEWER_READY: 'md-viewer-ready',
  EDITOR_OPEN_SEARCH: 'editor-open-search',
  EDITOR_SEARCH_ENABLED: 'editor-search-enabled',
});

/**
 * All valid channel names (for validation / test assertions).
 */
const ALL_CHANNELS = new Set([
  ...Object.values(CLAUDE_CHANNELS),
  ...Object.values(CODEX_CHANNELS),
  ...Object.values(CORE_CHANNELS),
]);

module.exports = {
  CLAUDE_CHANNELS,
  CODEX_CHANNELS,
  CORE_CHANNELS,
  ALL_CHANNELS,
};
