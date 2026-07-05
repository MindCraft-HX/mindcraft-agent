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

  // Auto-start on boot
  GET_LOGIN_ITEM: 'get-login-item-settings',
  SET_LOGIN_ITEM: 'set-login-item-settings',

  // CodeHub SessionIndex (T184)
  LOAD_CODEHUB_SESSION_INDEX: 'agent-load-codehub-session-index',
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
