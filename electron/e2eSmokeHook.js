'use strict';

/**
 * T196 E2E smoke hook — injected conditionally when MINDCRAFT_E2E_TEST is set.
 *
 * This module does NOT affect production behavior. It is only activated
 * by the E2E test harness via env vars and writes a readiness signal file
 * once the main window has loaded and the preload bridge is confirmed.
 *
 * Related: tests/e2e/smoke-boot.cjs
 */

const fs = require('fs');

function installE2EHook(win) {
  const mode = process.env.MINDCRAFT_E2E_TEST;
  const readyFile = process.env.MINDCRAFT_E2E_READY_FILE;

  if (!mode || !readyFile) {
    return; // Not in E2E mode — no-op
  }

  console.log('[e2e] E2E mode active:', mode);

  // Disable tray in E2E mode to avoid dangling tray icons
  // (handled by MINDCRAFT_E2E_NO_TRAY check in main.js)

  // ── Phase 0: Boot readiness signal ──

  async function emitReady() {
    try {
      const route = await win.webContents.executeJavaScript(
        'location.hash || "#/main/home"'
      );

      const preloadKeys = await win.webContents.executeJavaScript(
        'window.electronAPI ? Object.keys(window.electronAPI).sort() : []'
      );

      const hasPreloadBridge = await win.webContents.executeJavaScript(
        'typeof window.electronAPI !== "undefined"'
      );

      const signal = {
        mode,
        route,
        preloadKeys,
        hasPreloadBridge,
        timestamp: new Date().toISOString(),
      };

      // Atomic write: write to temp then rename
      const tmpFile = readyFile + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(signal, null, 2), 'utf8');
      fs.renameSync(tmpFile, readyFile);

      console.log('[e2e] readiness signal written:', readyFile);
      console.log('[e2e] route:', route);
      console.log('[e2e] preload keys count:', preloadKeys.length);
      console.log('[e2e] preload bridge:', hasPreloadBridge ? 'OK' : 'MISSING');
    } catch (e) {
      console.error('[e2e] failed to emit ready signal:', e.message);
      // Write error signal so the test harness knows something went wrong
      try {
        fs.writeFileSync(readyFile, JSON.stringify({
          mode,
          error: e.message,
          timestamp: new Date().toISOString(),
        }, null, 2), 'utf8');
      } catch (_) { /* best-effort */ }
    }
  }

  // Wait for the window to finish loading, then signal readiness
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      // Small delay to let the renderer bootstrap
      setTimeout(emitReady, 2000);
    });
  } else {
    setTimeout(emitReady, 2000);
  }

  // ── Phase 1: Read-only IPC contract smoke ──
  // Register a test IPC handler that the test harness can call
  const { ipcMain } = require('electron');
  const { CORE_CHANNELS } = require('../packages/agent/shared/ipcChannels');

  ipcMain.handle(CORE_CHANNELS.E2E_GET_PROVIDER_COUNT, async () => {
    try {
      // This calls the real provider read path but in the isolated userData
      // (no real provider keys are touched)
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          try {
            if (window.electronAPI && (window.electronAPI.claudeGetProviders || window.electronAPI.codexGetProviders)) {
              const getProvidersFn = window.electronAPI.claudeGetProviders || window.electronAPI.codexGetProviders;
              const data = await getProvidersFn();
              return { ok: true, count: data?.providers?.length || 0 };
            }
            return { ok: false, error: 'getProviders not available' };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        })()
      `);
      return result;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(CORE_CHANNELS.E2E_PING, () => {
    return { ok: true, mode, timestamp: Date.now() };
  });
}

module.exports = { installE2EHook };
