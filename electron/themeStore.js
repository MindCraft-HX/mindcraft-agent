'use strict';

/**
 * Theme persistence — file-based theme storage (IPC file, not Chromium localStorage).
 *
 * Extracted from electron/main.js (Phase 7 main.js split).
 */

const fs = require('fs');
const path = require('path');

const VALID_THEMES = ['dark', 'light', 'blue', 'brown'];

function getThemeFilePath(userDataPath) {
  return path.join(userDataPath, 'theme.json');
}

function loadThemeFromFile(userDataPath) {
  try {
    const themeFilePath = getThemeFilePath(userDataPath);
    if (fs.existsSync(themeFilePath)) {
      const data = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8'));
      if (data?.theme && VALID_THEMES.includes(data.theme)) return data.theme;
    }
  } catch (_) {}
  return null;
}

function saveThemeToFile(userDataPath, name) {
  if (!VALID_THEMES.includes(name)) return;
  try {
    const themeFilePath = getThemeFilePath(userDataPath);
    const dir = path.dirname(themeFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(themeFilePath, JSON.stringify({ theme: name }), 'utf-8');
  } catch (_) {}
}

module.exports = {
  VALID_THEMES,
  loadThemeFromFile,
  saveThemeToFile,
  getThemeFilePath,
};
