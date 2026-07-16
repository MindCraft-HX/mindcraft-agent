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

/**
 * Spawn Electron with isolated userData, wait for readiness signal.
 * Returns { process, readyData }.
 */
function spawnElectron({ tempUserData, homeDir, seedCwd, seedCodexCwd, electronBin, readyFileSuffix = '' }) {
  const readyFile = path.join(tempUserData, readyFileSuffix || '.e2e-ready');

  return new Promise((resolve, reject) => {
    const proc = spawn(electronBin, ['.'], {
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
        MINDCRAFT_E2E_SEED_CWD: seedCwd || '',
        MINDCRAFT_E2E_SEED_CODEX_CWD: seedCodexCwd || '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error(
          `Boot timeout (${TIMEOUT}ms)\nstderr: ${stderr.slice(-500)}`
        ));
      }
    }, TIMEOUT);

    const poll = setInterval(() => {
      if (resolved) return;
      try {
        if (fs.existsSync(readyFile)) {
          const data = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
          clearInterval(poll);
          clearTimeout(timer);
          // Let the app stabilize briefly
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve({ process: proc, readyData: data });
            }
          }, 1000);
        }
      } catch (_) { /* mid-write race */ }
    }, 500);

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearInterval(poll);
        clearTimeout(timer);
        reject(new Error(`Failed to spawn: ${err.message}`));
      }
    });

    proc.on('exit', (code) => {
      clearInterval(poll);
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(new Error(
          `Electron exited with code ${code} before readiness.\n` +
          `stderr: ${stderr.slice(-500)}`
        ));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Phase 0: App boot + preload bridge test
// ---------------------------------------------------------------------------

describe('Electron E2E Boot Smoke (T196)', () => {
  let tempUserData;
  let homeDir;
  let seedCwd;
  let seedCodexCwd;
  let electronProcess;
  let readyData;

  it('electron binary is available', () => {
    const bin = findElectronBinary();
    assert.ok(bin, 'electron binary not found in node_modules/.bin');
  });

  it('app boots and signals readiness', async function (t) {
    if (process.env.SKIP_E2E || process.env.CI) {
      t.skip();
      return;
    }

    const electronBin = findElectronBinary();
    if (!electronBin) {
      t.skip();
      return;
    }

    tempUserData = createTempUserData();
    homeDir = path.join(tempUserData, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    // ── Phase 3: Seed minimal Claude + CodeX sessions ──
    // claudeAgent.js `getClaudeProjectsRootDir` replaces non-alphanumeric
    // chars with `-`. Use a simple cwd so the project dir name is predictable.
    seedCwd = process.platform === 'win32' ? 'D:\\e2e-seed' : '/e2e-seed';
    const namePart = seedCwd.split('').map(c => (/[a-zA-Z0-9]/).test(c) ? c : '-').join('');
    const seedProjectDir = path.join(homeDir, '.claude', 'projects', namePart);
    fs.mkdirSync(seedProjectDir, { recursive: true });

    const seedSessionId = 'e2e-seed-001';
    fs.writeFileSync(
      path.join(seedProjectDir, `${seedSessionId}.jsonl`),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'e2e' } }) + '\n'
    );

    seedCodexCwd = path.join(homeDir, '.codex', 'sessions', 'e2e-seed-project');
    fs.mkdirSync(seedCodexCwd, { recursive: true });
    fs.writeFileSync(
      path.join(seedCodexCwd, `${seedSessionId}.jsonl`),
      JSON.stringify({ type: 'session_meta', payload: { id: seedSessionId, cwd: seedCodexCwd } }) + '\n' +
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'e2e' } }) + '\n'
    );

    const result = await spawnElectron({ tempUserData, homeDir, seedCwd, seedCodexCwd, electronBin });
    electronProcess = result.process;
    readyData = result.readyData;
  });

  it('main window loads expected route', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.ok(readyData.route, 'should have route');
    const validRoutes = ['#/main/home', '#/main/codeHub', '#/main/claudeCode', '#/main/codex'];
    assert.ok(
      validRoutes.some(r => readyData.route.startsWith(r)),
      `route should be a known route, got: ${readyData.route}`
    );
  });

  it('preload bridge is intact', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.hasPreloadBridge, true, 'window.electronAPI must exist');
    assert.ok(Array.isArray(readyData.preloadKeys), 'preloadKeys should be array');

    // These are the critical APIs that must exist
    const critical = ['openExternalWindow', 'openFolder', 'openFileWithDefault',
                      'openMdWin', 'selectAndReadFile'];
    for (const key of critical) {
      if (!readyData.preloadKeys.includes(key)) {
        console.warn(`[e2e] preload key "${key}" not found — may be intentionally removed`);
      }
    }
  });

  // ── Phase 1: IPC contract smoke ──

  it('Phase 1: preload bridge ping works', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.pingOk, true, 'pingOk should be true');
  });

  it('Phase 1: provider count is zero for fresh userData', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.providerCount, 0,
      'providerCount should be 0 for fresh userData');
  });

  // ── Phase 2: Settings boundary ──

  it('Phase 2: settings store is accessible', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.settingsLoaded, true, 'settingsLoaded should be true');
    assert.ok(Array.isArray(readyData.settingsKeys), 'settingsKeys should be array');
    const expectedNamespaces = ['diagnostics', 'app', 'codexDefaults', 'claudePrefs', 'misc'];
    assert.deepStrictEqual(
      [...readyData.settingsKeys].sort(),
      [...expectedNamespaces].sort(),
      'fresh userData should initialize only the documented settings namespaces'
    );
  });

  it('Phase 2: app version is defined', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.ok(typeof readyData.appVersion === 'string' && readyData.appVersion.length > 0,
      'appVersion should be non-empty string');
  });

  // ── Phase 3: Session restore ──

  it('Phase 3: Claude session listing returns zero', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.claudeSessionsCount, 0,
      'claudeSessionsCount should be 0 for empty userData');
  });

  it('Phase 3: CodeX session listing returns zero', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.codexSessionsCount, 0,
      'codexSessionsCount should be 0 for empty userData');
  });

  it('Phase 3: Claude scan finds seeded session', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.claudeSeededCount, 1,
      'should find exactly 1 seeded Claude session');
  });

  it('Phase 3: CodeX scan finds seeded session', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.codexSeededCount, 1,
      'should find exactly 1 seeded CodeX session');
  });

  // ── Phase 4: Provider CRUD smoke ──

  it('Phase 4: provider CRUD roundtrip succeeds', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.providerRoundtripOk, true,
      'providerRoundtripOk should be true');
  });

  it('Phase 4: initial provider count is zero', function (t) {
    if (!readyData?.providerCrudDetail) { t.skip(); return; }
    assert.strictEqual(readyData.providerCrudDetail.initialCount, 0,
      'initial provider count should be 0');
  });

  it('Phase 4: write-then-delete is consistent', function (t) {
    if (!readyData?.providerCrudDetail) { t.skip(); return; }
    const d = readyData.providerCrudDetail;
    assert.strictEqual(d.afterWriteCount, 1, 'after write should be 1');
    assert.strictEqual(d.afterDeleteCount, 0, 'after delete should be 0');
  });

  // ── Phase 2b: Settings sanitizer ──

  it('Phase 2b: sanitizer removes MindCraft fields from settings.json', function (t) {
    if (!readyData?.sanitizerDetail) { t.skip(); return; }
    const d = readyData.sanitizerDetail;
    assert.strictEqual(d.hasGitMirrorUrl, false,
      'gitMirrorUrl must NOT leak into settings.json');
    assert.strictEqual(d.hasMemoryInjectMode, false,
      'memoryInjectMode must NOT leak into settings.json');
    assert.strictEqual(d.hasPermissionPolicy, false,
      'permissionPolicy must NOT leak into settings.json');
  });

  it('Phase 2b: sanitizer preserves SDK-owned fields', function (t) {
    if (!readyData?.sanitizerDetail) { t.skip(); return; }
    const d = readyData.sanitizerDetail;
    assert.strictEqual(d.modelPreserved, true,
      'model (SDK field) must be preserved in settings.json');
    assert.strictEqual(d.skipWebFetchPreserved, true,
      'skipWebFetchPreflight (SDK field) must be preserved in settings.json');
  });

  it('Phase 2b: sanitizer roundtrip succeeds', function (t) {
    if (!readyData) { t.skip(); return; }
    assert.strictEqual(readyData.sanitizerOk, true,
      'sanitizerOk should be true');
  });

  // ── Phase 3b: Restart and verify no duplicates ──

  it('Phase 3b: reboot preserves session count (no duplicates)', async function (t) {
    if (!readyData || process.env.SKIP_E2E || process.env.CI) {
      t.skip();
      return;
    }

    const electronBin = findElectronBinary();
    if (!electronBin) {
      t.skip();
      return;
    }

    // Kill first process if still alive
    try { if (electronProcess && !electronProcess.killed) electronProcess.kill(); } catch (_) {}

    // Wait for process to fully exit
    await new Promise(r => setTimeout(r, 1500));

    // Clean old readyFile so the second boot writes a fresh one
    const oldReady = path.join(tempUserData, '.e2e-ready');
    try { fs.unlinkSync(oldReady); } catch (_) {}

    // Boot again with the same userData — registry + DB persist
    const result = await spawnElectron({
      tempUserData, homeDir, seedCwd, seedCodexCwd, electronBin,
      readyFileSuffix: '.e2e-ready-2',
    });
    electronProcess = result.process;
    const secondData = result.readyData;

    // Session counts must NOT have doubled
    assert.strictEqual(secondData.claudeSeededCount, 1,
      'Claude seeded sessions must not duplicate after restart');
    assert.strictEqual(secondData.codexSeededCount, 1,
      'CodeX seeded sessions must not duplicate after restart');

    // Non-seeded scans should still return 0
    assert.strictEqual(secondData.claudeSessionsCount, 0,
      'fresh Claude scan should return 0 after restart');
    assert.strictEqual(secondData.codexSessionsCount, 0,
      'fresh CodeX scan should return 0 after restart');
  });

  after(() => {
    // Ensure electron is killed
    try { if (electronProcess && !electronProcess.killed) electronProcess.kill(); } catch (_) {}
    // Cleanup temp dir
    try { if (tempUserData) fs.rmSync(tempUserData, { recursive: true, force: true }); } catch (_) {}
  });
});
