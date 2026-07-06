'use strict';

/**
 * Theme persistence — file-based theme storage (IPC file, not Chromium localStorage).
 *
 * Extracted from electron/main.js (Phase 7 main.js split).
 */

const fs = require('fs');
const path = require('path');

// T198: lazy-require to avoid circular dependency
let _facade = null;
function _getFacade() {
  if (!_facade) _facade = require('../packages/agent/electron/settingsFacade');
  return _facade;
}

const VALID_THEMES = ['dark', 'light', 'blue', 'brown'];

/** @deprecated — theme.json path helper kept for backward compat, no longer the authority */
function getThemeFilePath(userDataPath) {
  return path.join(userDataPath, 'theme.json');
}

function loadThemeFromFile(userDataPath) {
  const theme = _getFacade().getTheme();
  if (theme && VALID_THEMES.includes(theme)) return theme;
  return null;
}

function saveThemeToFile(userDataPath, name) {
  if (!VALID_THEMES.includes(name)) return;
  _getFacade().setTheme(name);
}

module.exports = {
  VALID_THEMES,
  loadThemeFromFile,
  saveThemeToFile,
  getThemeFilePath,
};
