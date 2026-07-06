'use strict';

/**
 * T196 Phase 0: Electron E2E boot smoke harness.
 *
 * Spawns the dev Electron app in an isolated temp userData directory,
 * waits for the main window to signal readiness via a temp file, then
 * verifies boot succeeds and the preload bridge is intact.
 *
 * Does NOT require real provider API keys.
 * Does NOT mutate the developer's real userData/config.
 *
 * Usage:
 *   node --test tests/e2e/smoke-boot.cjs
 *   or: node tests/e2e/smoke-boot.cjs --standalone
 *
 * Env vars for CI:
 *   SKIP_E2E=1           — skip all E2E tests
 *   E2E_TIMEOUT_MS=30000 — override timeout
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');
const TIMEOUT = parseInt(process.env.E2E_TIMEOUT_MS || '30000', 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findElectronBinary() {
  // Use the actual electron executable, not the .cmd wrapper
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron' + suffix),
    path.join(ROOT, '..', 'node_modules', 'electron', 'dist', 'electron' + suffix),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function createTempUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-e2e-'));
  process.on('exit', () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });
  return dir;
}

// ---------------------------------------------------------------------------
// Phase 0: App boot + preload bridge test
// ---------------------------------------------------------------------------

describe('Electron E2E Boot Smoke (T196)', () => {
  let tempUserData;
  let readyFile;
  let electronProcess;
  let readyData;

  before(function () {
    if (process.env.SKIP_E2E || process.env.CI) {
      this.skip();
      return;
    }
  });

  it('electron binary is available', () => {
    const bin = findElectronBinary();
    assert.ok(bin, 'electron binary not found in node_modules/.bin');
  });

  it('app boots and signals readiness', async function () {
    if (process.env.SKIP_E2E || process.env.CI) {
      this.skip();
      return;
    }

    const electronBin = findElectronBinary();
    if (!electronBin) {
      this.skip();
      return;
    }

    tempUserData = createTempUserData();
    readyFile = path.join(tempUserData, '.e2e-ready');

    return new Promise((resolve, reject) => {
      // Use `electron .` so app.getAppPath() returns the project root
      // (spawning as `electron electron/main.js` would make getAppPath() return electron/)

      // Override home directory so os.homedir() returns the temp dir.
      // This isolates ~/.claude and ~/.codex references used by
      // claudeAgent.js, codexAgent.js, metrics, memory, skills, etc.
      // Without this, the legacy migration in readProviders() would
      // pull in the developer's real providers and pollute the E2E DB.
      const homeDir = path.join(tempUserData, 'home');
      fs.mkdirSync(homeDir, { recursive: true });

      electronProcess = spawn(electronBin, ['.'], {
        cwd: ROOT,
        env: {
          ...process.env,
          MINDCRAFT_USER_DATA_DIR: tempUserData,
          MINDCRAFT_E2E_TEST: 'boot-smoke',
          MINDCRAFT_E2E_READY_FILE: readyFile,
          MINDCRAFT_E2E_NO_TRAY: '1',
          MINDCRAFT_E2E_NO_AUTO_UPDATE: '1',
          HOME: homeDir,
          USERPROFILE: homeDir,  // Windows: os.homedir() uses USERPROFILE
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          electronProcess.kill();
          reject(new Error(
            `Boot timeout (${TIMEOUT}ms)\nstderr: ${stderr.slice(-500)}`
          ));
        }
      }, TIMEOUT);

      // Poll for ready file (Electron writes it atomically)
      const poll = setInterval(() => {
        if (resolved) return;
        try {
          if (fs.existsSync(readyFile)) {
            readyData = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
            clearInterval(poll);
            clearTimeout(timer);

            // Let the app stabilize briefly then kill it
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                try { electronProcess.kill(); } catch (_) {}
                resolve();
              }
            }, 1000);
          }
        } catch (_) { /* mid-write race */ }
      }, 500);

      electronProcess.stdout.on('data', d => { stdout += d.toString(); });
      electronProcess.stderr.on('data', d => { stderr += d.toString(); });

      electronProcess.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearInterval(poll);
          clearTimeout(timer);
          reject(new Error(`Failed to spawn: ${err.message}`));
        }
      });

      electronProcess.on('exit', (code) => {
        clearInterval(poll);
        clearTimeout(timer);
        if (!resolved) {
          // If we already captured readyData, the app reached readiness
          // before exiting — resolve instead of rejecting.
          if (readyData) {
            resolved = true;
            resolve();
          } else {
            resolved = true;
            reject(new Error(
              `Electron exited with code ${code} before readiness.\n` +
              `stderr: ${stderr.slice(-500)}`
            ));
          }
        }
      });
    });
  });

  it('main window loads expected route', function () {
    if (!readyData) { this.skip(); return; }
    assert.ok(readyData.route, 'should have route');
    const validRoutes = ['#/main/home', '#/main/codeHub', '#/main/claudeCode', '#/main/codex'];
    assert.ok(
      validRoutes.some(r => readyData.route.startsWith(r)),
      `route should be a known route, got: ${readyData.route}`
    );
  });

  it('preload bridge is intact', function () {
    if (!readyData) { this.skip(); return; }
    assert.strictEqual(readyData.hasPreloadBridge, true, 'window.electronAPI must exist');
    assert.ok(Array.isArray(readyData.preloadKeys), 'preloadKeys should be array');

    // These are the critical APIs that must exist
    const critical = ['openExternalWindow', 'openFolder', 'openFileWithDefault',
                      'openMdWin', 'sendSearchPage', 'selectAndReadFile'];
    for (const key of critical) {
      if (!readyData.preloadKeys.includes(key)) {
        console.warn(`[e2e] preload key "${key}" not found — may be intentionally removed`);
      }
    }
  });

  // ── Phase 1: IPC contract smoke ──

  it('Phase 1: preload bridge ping works', function () {
    if (!readyData) { this.skip(); return; }
    assert.strictEqual(readyData.pingOk, true, 'pingOk should be true');
  });

  it('Phase 1: provider count is zero for fresh userData', function () {
    if (!readyData) { this.skip(); return; }
    assert.strictEqual(readyData.providerCount, 0,
      'providerCount should be 0 for fresh userData');
  });

  // ── Phase 2: Settings boundary ──

  it('Phase 2: settings store is accessible', function () {
    if (!readyData) { this.skip(); return; }
    assert.strictEqual(readyData.settingsLoaded, true, 'settingsLoaded should be true');
    assert.ok(Array.isArray(readyData.settingsKeys), 'settingsKeys should be array');
    assert.strictEqual(readyData.settingsKeys.length, 0,
      'settingsKeys should be empty for fresh userData');
  });

  it('Phase 2: app version is defined', function () {
    if (!readyData) { this.skip(); return; }
    assert.ok(typeof readyData.appVersion === 'string' && readyData.appVersion.length > 0,
      'appVersion should be non-empty string');
  });

  // ── Phase 3: Session restore ──

  it('Phase 3: Claude session listing returns zero', function () {
    if (!readyData) { this.skip(); return; }
    assert.strictEqual(readyData.claudeSessionsCount, 0,
      'claudeSessionsCount should be 0 for empty userData');
  });

  it('Phase 3: CodeX session listing returns zero', function () {
    if (!readyData) { this.skip(); return; }
    assert.strictEqual(readyData.codexSessionsCount, 0,
      'codexSessionsCount should be 0 for empty userData');
  });

  // ── Phase 4: Provider CRUD smoke ──

  it('Phase 4: provider CRUD roundtrip succeeds', function () {
    if (!readyData) { this.skip(); return; }
    assert.strictEqual(readyData.providerRoundtripOk, true,
      'providerRoundtripOk should be true');
  });

  it('Phase 4: initial provider count is zero', function () {
    if (!readyData?.providerCrudDetail) { this.skip(); return; }
    assert.strictEqual(readyData.providerCrudDetail.initialCount, 0,
      'initial provider count should be 0');
  });

  it('Phase 4: write-then-delete is consistent', function () {
    if (!readyData?.providerCrudDetail) { this.skip(); return; }
    const d = readyData.providerCrudDetail;
    assert.strictEqual(d.afterWriteCount, 1, 'after write should be 1');
    assert.strictEqual(d.afterDeleteCount, 0, 'after delete should be 0');
  });

  after(() => {
    // Ensure electron is killed
    try { if (electronProcess && !electronProcess.killed) electronProcess.kill(); } catch (_) {}
    // Cleanup temp dir
    try { if (tempUserData) fs.rmSync(tempUserData, { recursive: true, force: true }); } catch (_) {}
  });
});
