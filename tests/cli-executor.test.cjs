'use strict';

/**
 * Characterization tests for shared/cliExecutor.js (Batch 5a).
 *
 * Captures the behavior of execClaudeCli / execCodexCli before extraction:
 *   1. Factory returns an async function
 *   2. Throws when findBinary resolves to null/empty
 *   3. Supports both sync and async findBinary resolvers
 *   4. Passes default execFile options (timeout=60000, windowsHide, stdio)
 *   5. Allows caller opts to override defaults
 *   6. Windows .cmd/.bat shim: wraps in cmd.exe with /c prefix
 *   7. Non-shim (exe or non-Windows): passes binary directly as cmd
 *   8. Agent name appears in error message
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createCliExecutor } = require('../packages/agent/electron/shared/cliExecutor');

const originalPlatform = process.platform;

function makeMockExecFile() {
  const calls = [];
  function execFile(cmd, args, opts, cb) {
    // Normalize: execFile(cmd, args, opts, cb) or execFile(cmd, args, cb)
    let options = opts;
    let callback = cb;
    if (typeof opts === 'function') { callback = opts; options = {}; }
    if (typeof options !== 'object' || !options) options = {};

    calls.push({ cmd, args, opts: options });

    if (typeof callback === 'function') {
      callback(null, { stdout: 'mocked-stdout' });
      return;
    }
  }
  return { execFile, calls };
}

function setPlatform(v) {
  try { Object.defineProperty(process, 'platform', { value: v, configurable: true }); } catch (_) {}
}

function restorePlatform() {
  try { Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true }); } catch (_) {}
}

describe('createCliExecutor (characterization)', () => {
  it('returns an async function', () => {
    const { execFile } = makeMockExecFile();
    const exec = createCliExecutor({ findBinary: () => '/bin/cli', agentName: 'test', execFile });
    assert.strictEqual(typeof exec, 'function');
  });

  it('throws when findBinary returns null', async () => {
    const { execFile } = makeMockExecFile();
    const exec = createCliExecutor({ findBinary: () => null, agentName: 'test', execFile });
    await assert.rejects(() => exec(['version']), { message: 'test not found' });
  });

  it('throws when findBinary returns empty string', async () => {
    const { execFile } = makeMockExecFile();
    const exec = createCliExecutor({ findBinary: () => '', agentName: 'test', execFile });
    await assert.rejects(() => exec(['version']), { message: 'test not found' });
  });

  it('agent name appears in error when not found', async () => {
    const { execFile } = makeMockExecFile();
    const c = createCliExecutor({ findBinary: () => null, agentName: 'codex', execFile });
    await assert.rejects(() => c(['v']), { message: 'codex not found' });
    const l = createCliExecutor({ findBinary: () => null, agentName: 'claude', execFile });
    await assert.rejects(() => l(['v']), { message: 'claude not found' });
  });

  it('supports async findBinary (like claude)', async () => {
    const { execFile, calls } = makeMockExecFile();
    const exec = createCliExecutor({ findBinary: async () => '/bin/claude', agentName: 'claude', execFile });
    const out = await exec(['plugin', 'list', '--json']);
    assert.strictEqual(out, 'mocked-stdout');
    assert.strictEqual(calls.length, 1);
  });

  it('supports sync findBinary (like codex)', async () => {
    const { execFile, calls } = makeMockExecFile();
    const exec = createCliExecutor({ findBinary: () => '/bin/codex', agentName: 'codex', execFile });
    const out = await exec(['plugin', 'list']);
    assert.strictEqual(out, 'mocked-stdout');
    assert.strictEqual(calls.length, 1);
  });

  it('passes default execFile options', async () => {
    const { execFile, calls } = makeMockExecFile();
    const exec = createCliExecutor({ findBinary: () => '/bin/cli', agentName: 'test', execFile });
    await exec(['version']);
    const call = calls[0];
    assert.strictEqual(call.opts.timeout, 60000);
    assert.strictEqual(call.opts.windowsHide, true);
    assert.deepStrictEqual(call.opts.stdio, ['ignore', 'pipe', 'pipe']);
    assert.strictEqual(call.opts.encoding, 'utf8');
  });

  it('allows caller opts to override defaults', async () => {
    const { execFile, calls } = makeMockExecFile();
    const exec = createCliExecutor({ findBinary: () => '/bin/cli', agentName: 'test', execFile });
    await exec(['version'], { timeout: 30000, cwd: '/tmp' });
    const call = calls[0];
    assert.strictEqual(call.opts.timeout, 30000);
    assert.strictEqual(call.opts.cwd, '/tmp');
    assert.strictEqual(call.opts.windowsHide, true);
  });

  it('passes binary directly as cmd when not on Windows shim', async () => {
    const { execFile, calls } = makeMockExecFile();
    setPlatform('linux');
    try {
      const exec = createCliExecutor({ findBinary: () => '/bin/cli', agentName: 'test', execFile });
      await exec(['plugin', 'install', 'pkg@1']);
      const call = calls[0];
      assert.strictEqual(call.cmd, '/bin/cli');
      assert.deepStrictEqual(call.args, ['plugin', 'install', 'pkg@1']);
    } finally { restorePlatform(); }
  });

  it('wraps in cmd.exe when binary is .cmd on Windows', async () => {
    const { execFile, calls } = makeMockExecFile();
    setPlatform('win32');
    try {
      const exec = createCliExecutor({ findBinary: () => 'C:\\tools\\cli.cmd', agentName: 'test', execFile });
      await exec(['plugin', 'install', 'pkg@1']);
      const call = calls[0];
      assert.strictEqual(call.cmd, 'cmd.exe');
      assert.deepStrictEqual(call.args, ['/c', 'C:\\tools\\cli.cmd', 'plugin', 'install', 'pkg@1']);
    } finally { restorePlatform(); }
  });

  it('wraps in cmd.exe when binary is .bat on Windows', async () => {
    const { execFile, calls } = makeMockExecFile();
    setPlatform('win32');
    try {
      const exec = createCliExecutor({ findBinary: () => 'C:\\tools\\cli.bat', agentName: 'test', execFile });
      await exec(['version']);
      const call = calls[0];
      assert.strictEqual(call.cmd, 'cmd.exe');
      assert.deepStrictEqual(call.args, ['/c', 'C:\\tools\\cli.bat', 'version']);
    } finally { restorePlatform(); }
  });

  it('does NOT wrap in cmd.exe when binary is .exe on Windows', async () => {
    const { execFile, calls } = makeMockExecFile();
    setPlatform('win32');
    try {
      const exec = createCliExecutor({ findBinary: () => 'C:\\tools\\cli.exe', agentName: 'test', execFile });
      await exec(['version']);
      const call = calls[0];
      assert.strictEqual(call.cmd, 'C:\\tools\\cli.exe');
      assert.deepStrictEqual(call.args, ['version']);
    } finally { restorePlatform(); }
  });

  it('cmd.exe wrapper places /c flag BEFORE binary path in args', async () => {
    const { execFile, calls } = makeMockExecFile();
    setPlatform('win32');
    try {
      const exec = createCliExecutor({ findBinary: () => 'D:\\app\\bin.cmd', agentName: 'test', execFile });
      await exec(['status']);
      const call = calls[0];
      assert.strictEqual(call.cmd, 'cmd.exe');
      // The order is: /c <binary> <user-args...>
      assert.deepStrictEqual(call.args, ['/c', 'D:\\app\\bin.cmd', 'status']);
    } finally { restorePlatform(); }
  });
});
