'use strict';

/**
 * CLI executor factory — shared between ClaudeCode & CodeX.
 *
 * Extracted from duplicated execClaudeCli / execCodexCli (Batch 5a).
 * Both agents used the same Windows .cmd/.bat shim detection, the same
 * promisify(execFile) wrapper, and the same stdout-logging pattern.
 * Only the binary-path resolution and log prefix differed.
 *
 * Testing: pass a mock `execFile` via opts for characterization tests;
 * omit it to use the real child_process.execFile.
 */

const { promisify } = require('util');

/**
 * Create a CLI executor for an agent.
 *
 * @param {object} opts
 * @param {() => (string|null) | Promise<string|null>} opts.findBinary — resolve the CLI binary path (sync or async)
 * @param {string} opts.agentName — used for error messages and log prefix
 * @param {Function} [opts.execFile] — optional, for testing; defaults to child_process.execFile
 * @returns {(args: string[], execOpts?: object) => Promise<string>}
 */
function createCliExecutor({ findBinary, agentName, execFile: _execFile }) {
  const execFileAsync = promisify(_execFile || require('child_process').execFile);

  return async function execCli(args, execOpts = {}) {
    const binPath = await findBinary();
    if (!binPath) throw new Error(`${agentName} not found`);

    const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binPath);
    const cmd = isCmdShim ? 'cmd.exe' : binPath;
    const cmdArgs = isCmdShim ? ['/c', binPath, ...args] : args;

    const { stdout: out } = await execFileAsync(cmd, cmdArgs, {
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...execOpts,
    });

    console.log(`[${agentName}] CLI:`, args.join(' '), '→', (out || '').trim().slice(0, 200) || '(empty)');
    return out;
  };
}

module.exports = { createCliExecutor };
