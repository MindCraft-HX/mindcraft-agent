'use strict';

/**
 * Architecture boundary guard tests for git workspace feature.
 *
 * Verifies:
 *   1. New gitWorkspace module doesn't import ClaudeCode/CodeX provider modules
 *   2. Shared renderer components don't import codexRunGitDiff
 *   3. gitWorkspaceParser has no provider dependency
 *   4. gitWorkspaceService has no provider dependency
 *   5. No sidecar writes to ~/.claude, ~/.codex, or project directories
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// ── Helpers ──

function readModule(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function assertNoImport(modPath, forbiddenPatterns) {
  const src = readModule(modPath);
  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !src.includes(pattern),
      `${modPath} must not import/reference "${pattern}"`
    );
  }
}

// ── Tests ──

describe('Git workspace architecture boundaries', () => {
  // ── Electron main: gitWorkspaceParser ──

  it('gitWorkspaceParser has no provider dependency', () => {
    const src = readModule('packages/agent/electron/gitWorkspace/gitWorkspaceParser.js');
    assert.ok(!src.match(/require\(['"].*claudeAgent|codexAgent|gitDiffIpc/),
      'parser must not require claudeAgent/codexAgent/gitDiffIpc');
  });

  // ── Electron main: gitWorkspaceService ──

  it('gitWorkspaceService has no provider dependency', () => {
    const src = readModule('packages/agent/electron/gitWorkspace/gitWorkspaceService.js');
    assert.ok(!src.includes("require('") || !src.match(/require\(['"].*claudeAgent|codexAgent|gitDiffIpc/),
      'service must not require claudeAgent/codexAgent/gitDiffIpc');
    assert.ok(!src.includes('ClaudeCodeProvider'), 'service must not import ClaudeCodeProvider');
    assert.ok(!src.includes('CodeXProvider'), 'service must not import CodeXProvider');
  });

  it('gitWorkspaceService only reads filesystem (no writes)', () => {
    const src = readModule('packages/agent/electron/gitWorkspace/gitWorkspaceService.js');
    assert.ok(!src.includes('writeFile'), 'service must not write files');
    assert.ok(!src.includes('fs.write'), 'service must not use fs.write');
    assert.ok(!src.includes('~/.claude'), 'service must not touch ~/.claude');
    assert.ok(!src.includes('~/.codex'), 'service must not touch ~/.codex');
    assert.ok(!src.includes('MindCraft'), 'service must not write sidecar');
  });

  // ── Electron main: gitWorkspace IPC ──

  it('gitWorkspace IPC handler has no provider dependency', () => {
    const src = readModule('packages/agent/electron/gitWorkspace/index.js');
    assert.ok(!src.match(/require\(['"].*claudeAgent|codexAgent|gitDiffIpc/),
      'IPC must not require claudeAgent/codexAgent/gitDiffIpc');
  });

  // ── Renderer: unifiedDiff.js ──

  it('unifiedDiff.js has no provider dependency', () => {
    const src = readModule('packages/agent/src/components/agentCommon/utils/unifiedDiff.js');
    assert.ok(!src.includes('codexRunGitDiff'), 'unifiedDiff must not reference codexRunGitDiff');
    assert.ok(!src.match(/import.*from.*['"]\.\.\/claudeCode|\.\.\/codeX/),
      'unifiedDiff must not import from claudeCode/codeX');
    assert.ok(!src.includes('window.electronAPI'), 'unifiedDiff must not access electronAPI directly');
  });

  // ── Renderer: useGitWorkspaceChanges ──

  it('useGitWorkspaceChanges has no provider dependency', () => {
    const src = readModule('packages/agent/src/components/agentCommon/composables/useGitWorkspaceChanges.js');
    assert.ok(!src.includes('codexRunGitDiff'), 'composable must not reference codexRunGitDiff');
    assert.ok(!src.match(/import.*from.*['"]\.\.\/claudeCode|\.\.\/codeX/),
      'composable must not import from claudeCode/codeX dirs');
  });

  it('useGitWorkspaceChanges accesses electronAPI safely', () => {
    const src = readModule('packages/agent/src/components/agentCommon/composables/useGitWorkspaceChanges.js');
    // Must check window.electronAPI exists before calling
    assert.ok(src.includes('window.electronAPI'), 'composable must access window.electronAPI');
    assert.ok(src.includes('!api ||') || src.includes('if (!api'), 'must guard against missing API');
  });

  // ── Renderer: GitChangesDrawer.vue ──

  it('GitChangesDrawer has no provider dependency', () => {
    const src = readModule('packages/agent/src/components/agentCommon/components/GitChangesDrawer.vue');
    assert.ok(!src.includes('codexRunGitDiff'), 'drawer must not reference codexRunGitDiff');
    assert.ok(!src.match(/import.*from.*['"]\.\.\/\.\.\/claudeCode|\.\.\/\.\.\/codeX/),
      'drawer must not import from claudeCode/codeX');
  });

  it('GitChangesDrawer uses openMdWin for file opening', () => {
    const src = readModule('packages/agent/src/components/agentCommon/components/GitChangesDrawer.vue');
    assert.ok(src.includes('openMdWin'), 'drawer must use openMdWin bridge');
    assert.ok(!src.includes('sessionStorage'), 'drawer must not use sessionStorage stash');
  });

  // ── Renderer: GitUnifiedDiffView ──

  it('GitUnifiedDiffView has no provider dependency', () => {
    const src = readModule('packages/agent/src/components/agentCommon/components/GitUnifiedDiffView.vue');
    assert.ok(!src.includes('codexRunGitDiff'), 'diff view must not reference codexRunGitDiff');
    assert.ok(!src.match(/import.*from.*['"]\.\.\/claudeCode|\.\.\/codex/),
      'diff view must not import from claudeCode/codex');
  });

  it('GitUnifiedDiffView uses shared unifiedDiff parser', () => {
    const src = readModule('packages/agent/src/components/agentCommon/components/GitUnifiedDiffView.vue');
    assert.ok(
      src.includes('unifiedDiff.js'),
      'diff view must use shared unifiedDiff parser'
    );
  });

  // ── Channels: correct registry ──

  it('git workspace channels are registered as CORE_CHANNELS', () => {
    const src = readModule('packages/agent/shared/ipcChannels.js');
    assert.ok(
      src.includes("GIT_WORKSPACE_CHANGES: 'core-git-workspace-changes'"),
      'GIT_WORKSPACE_CHANGES must be a CORE_CHANNEL'
    );
    assert.ok(
      src.includes("GIT_FILE_DIFF: 'core-git-file-diff'"),
      'GIT_FILE_DIFF must be a CORE_CHANNEL'
    );
    assert.ok(!src.includes("claude-git-workspace"), 'channels must not be claude-prefixed');
    assert.ok(!src.includes("codex-git-workspace"), 'channels must not be codex-prefixed');
  });

  // ── Preload: correct method names ──

  it('preload bridge exposes gitGetWorkspaceChanges and gitGetFileDiff', () => {
    const src = readModule('packages/agent/preload/index.js');
    assert.ok(src.includes('gitGetWorkspaceChanges'), 'preload must expose gitGetWorkspaceChanges');
    assert.ok(src.includes('gitGetFileDiff'), 'preload must expose gitGetFileDiff');
    assert.ok(
      src.includes('CORE_CHANNELS.GIT_WORKSPACE_CHANGES'),
      'must use CORE_CHANNELS for workspace changes'
    );
    assert.ok(
      src.includes('CORE_CHANNELS.GIT_FILE_DIFF'),
      'must use CORE_CHANNELS for file diff'
    );
  });

  // ── Existing codexRunGitDiff still exists (compatibility) ──

  it('codexRunGitDiff is preserved for backward compatibility', () => {
    const src = readModule('packages/agent/preload/index.js');
    assert.ok(
      src.includes('codexRunGitDiff'),
      'codexRunGitDiff must remain for CodeX /diff compatibility'
    );
  });

  // ── Electron/index.js registration ──

  it('electron/index.js registers git workspace IPC', () => {
    const src = readModule('packages/agent/electron/index.js');
    assert.ok(
      src.includes('registerGitWorkspaceIpc'),
      'electron/index.js must register git workspace IPC'
    );
  });

  // ── claudeCode and codeX integration ──

  it('claudeCode/index.vue integrates GitChangesDrawer', () => {
    const src = readModule('packages/agent/src/components/claudeCode/index.vue');
    assert.ok(src.includes('GitChangesDrawer'), 'claudeCode must use GitChangesDrawer');
    assert.ok(src.includes('useGitWorkspaceChanges'), 'claudeCode must use composable');
    assert.ok(src.includes(':gitInteractive="true"'), 'claudeCode must enable git interactive');
  });

  it('codeX/index.vue integrates GitChangesDrawer', () => {
    const src = readModule('packages/agent/src/components/codeX/index.vue');
    assert.ok(src.includes('GitChangesDrawer'), 'codeX must use GitChangesDrawer');
    assert.ok(src.includes('useGitWorkspaceChanges'), 'codeX must use composable');
    assert.ok(src.includes(':gitInteractive="true"'), 'codeX must enable git interactive');
  });
});
