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
  GET_METRICS: 'claude-get-metrics',
  GET_CONTEXT_USAGE: 'claude-get-context-usage',
  SCAN_SESSIONS: 'claude-scan-sessions',
  GET_SESSION: 'claude-get-session',
  READ_SESSION: 'claude-read-session-file',
  DELETE_SESSION: 'claude-delete-session',
  RENAME_SESSION: 'claude-rename-session',
  GET_SESSION_TITLE: 'claude-get-session-title',
  GET_TASK_STATE: 'claude-get-task-state',
  SETTINGS_REPAIR: 'claude-settings-repair',
  SET_EFFORT_LEVEL: 'claude-set-effort-level',
  SET_PERMISSION_MODE: 'claude-set-permission-mode',
  GIT_MIRROR_GET: 'claude-git-mirror-get',
  GIT_MIRROR_SET: 'claude-git-mirror-set',
  SANDBOX_GET_MODE: 'claude-sandbox-get-mode',
  SANDBOX_SET_MODE: 'claude-sandbox-set-mode',
  CONFIG_IMPORT_PICK_FILE: 'claude-config-import-pick-file',
  CONFIG_IMPORT_PREVIEW: 'claude-config-import-preview',
  CONFIG_IMPORT_COMMIT: 'claude-config-import-commit',

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

  // Streaming push events
  STREAM_CHUNK: 'codex-stream-chunk',
  STREAM_THINKING: 'codex-stream-thinking',
  STREAM_TOOL_DELTA: 'codex-stream-tool-delta',
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

  // Local search
  LOCAL_SEARCH: 'local-search',
  LOCAL_SEARCH_INDEX: 'local-search-index',

  // Session instruction
  GET_SESSION_INSTRUCTION: 'get-session-instruction',
  SET_SESSION_INSTRUCTION: 'set-session-instruction',
  GET_ATTACHMENTS: 'get-attachments',
  SET_ATTACHMENTS: 'set-attachments',

  // Home / codeHub
  GET_HOME_METRICS: 'get-home-metrics',
  GET_RECENT_PROJECTS: 'get-recent-projects',

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
  FOUND_IN_PAGE: 'found-in-page',
  MD_CONTENT: 'md-content',
  MD_VIEWER_READY: 'md-viewer-ready',
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
