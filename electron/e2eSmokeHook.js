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

      // ── Phase 1: IPC contract smoke ──
      let pingOk = hasPreloadBridge, providerCount = -1;
      try {
        const pcResult = await win.webContents.executeJavaScript(`
          (async () => {
            try {
              const api = window.electronAPI;
              if (!api) return { count: -1 };
              const fn = api.claudeGetProviders || api.codexGetProviders;
              if (!fn) return { count: -1 };
              const data = await fn();
              return { count: data?.providers?.length ?? 0 };
            } catch (e) { return { count: -1, error: e.message }; }
          })()`);
        providerCount = pcResult.count;
      } catch (e) { console.error('[e2e] Phase 1 error:', e.message); }

      // ── Phase 2: Settings boundary ──
      let settingsLoaded = false, settingsKeys = [];
      let appVersion = null, diagnosticsEnabled = null;
      try {
        const allSettings = await win.webContents.executeJavaScript(`
          (async () => {
            try { return await window.electronAPI?.getSetting?.(null); }
            catch (e) { return null; }
          })()`);
        settingsLoaded = allSettings !== null && typeof allSettings === 'object';
        settingsKeys = settingsLoaded ? Object.keys(allSettings) : [];

        appVersion = await win.webContents.executeJavaScript(`
          (async () => {
            try { return await window.electronAPI?.getAppVersion?.(); }
            catch (e) { return null; }
          })()`);

        const diag = await win.webContents.executeJavaScript(`
          (async () => {
            try { return await window.electronAPI?.getDiagnosticsEnabled?.(); }
            catch (e) { return null; }
          })()`);
        diagnosticsEnabled = diag?.enabled ?? null;
      } catch (e) { console.error('[e2e] Phase 2 error:', e.message); }

      // ── Phase 3: Session restore ──
      const os = require('os');
      const tmpDir = os.tmpdir();
      let claudeSessionsCount = -1, codexSessionsCount = -1;
      try {
        claudeSessionsCount = await win.webContents.executeJavaScript(`
          (async () => {
            try {
              const api = window.electronAPI;
              if (!api?.claudeScanProjectsSessions) return -1;
              const sessions = await api.claudeScanProjectsSessions(${JSON.stringify(tmpDir)});
              return Array.isArray(sessions) ? sessions.length : -1;
            } catch (e) { return -1; }
          })()`);

        codexSessionsCount = await win.webContents.executeJavaScript(`
          (async () => {
            try {
              const api = window.electronAPI;
              if (!api?.codexListSessionsByCwd) return -1;
              const sessions = await api.codexListSessionsByCwd(${JSON.stringify(tmpDir)});
              return Array.isArray(sessions) ? sessions.length : -1;
            } catch (e) { return -1; }
          })()`);
      } catch (e) { console.error('[e2e] Phase 3 error:', e.message); }

      // ── Phase 4: Provider CRUD smoke ──
      let providerRoundtripOk = false;
      let providerCrudDetail = { initialCount: -1, afterWriteCount: -1, afterDeleteCount: -1 };
      try {
        const crud = await win.webContents.executeJavaScript(`
          (async () => {
            const detail = { initialCount: -1, afterWriteCount: -1, afterDeleteCount: -1 };
            try {
              const api = window.electronAPI;
              const mockProviders = [{ name: 'e2e_smoke', key: 'sk-mock', url: 'https://mock.example.com' }];

              // Use CodeX provider CRUD only.
              // Claude provider persistence can sync official ~/.claude/settings.json
              // and would pollute the developer's real runtime during E2E.
              const getFn = api?.codexGetProviders;
              const setFn = api?.codexSetProviders;
              if (!getFn || !setFn) return { ok: false, detail, error: 'No codex provider API available' };

              const initial = await getFn();
              detail.initialCount = initial?.providers?.length ?? 0;

              let writeResult = await setFn({ providers: mockProviders, activeIdx: 0 });
              if (!writeResult?.ok) return { ok: false, detail, error: 'write failed' };

              const afterWrite = await getFn();
              detail.afterWriteCount = afterWrite?.providers?.length ?? 0;

              const delResult = await setFn({ providers: [], activeIdx: -1 });
              const afterDelete = await getFn();
              detail.afterDeleteCount = afterDelete?.providers?.length ?? 0;

              return { ok: detail.afterWriteCount === 1 && detail.afterDeleteCount === 0, detail };
            } catch (e) { return { ok: false, detail, error: e.message }; }
          })()`);
        providerRoundtripOk = crud?.ok === true;
        if (crud?.detail) providerCrudDetail = crud.detail;
      } catch (e) { console.error('[e2e] Phase 4 error:', e.message); }

      // ── Phases errored tracker ──
      const phasesErrored = [];
      if (!pingOk) phasesErrored.push('phase1:ping');
      if (providerCount === -1) phasesErrored.push('phase1:providerCount');
      if (!settingsLoaded) phasesErrored.push('phase2:settingsLoaded');
      if (appVersion === null) phasesErrored.push('phase2:appVersion');
      if (claudeSessionsCount === -1) phasesErrored.push('phase3:claudeSessions');
      if (codexSessionsCount === -1) phasesErrored.push('phase3:codexSessions');
      if (!providerRoundtripOk && providerCrudDetail.initialCount === -1) phasesErrored.push('phase4:providerCRUD');

      const signal = {
        mode,
        route,
        preloadKeys,
        hasPreloadBridge,
        timestamp: new Date().toISOString(),
        // Phase 1
        pingOk,
        providerCount,
        // Phase 2
        settingsKeys,
        settingsLoaded,
        appVersion,
        diagnosticsEnabled,
        // Phase 3
        claudeSessionsCount,
        codexSessionsCount,
        // Phase 4
        providerRoundtripOk,
        providerCrudDetail,
        // meta
        phasesErrored,
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
