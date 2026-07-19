'use strict';

/**
 * Contract: mdViewer 保存路径的唯一 owner 是 document domain。
 *
 * 设计依据 docs/workbench-split-and-terminal.md 9.2：
 * renderer 不能绕过 typed compare-and-save 直接 writeFileSync。
 * file-backed 可编辑文档（markdown/code）必定经 documentController
 * 获得 canonical identity，保存走 DOCUMENT_WRITE（expected signature
 * 校验 + 同目录原子替换）。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mdViewerPath = path.join(root, 'src/components/mdViewer/index.vue');

test('mdViewer must not bypass the document domain with direct file writes', () => {
  const source = fs.readFileSync(mdViewerPath, 'utf8');

  assert.ok(
    !source.includes('writeFileSync'),
    'mdViewer must not call writeFileSync; saves go through documentController.save (typed DOCUMENT_WRITE compare-and-save)',
  );
});

test('mdViewer save path routes through documentController.save', () => {
  const source = fs.readFileSync(mdViewerPath, 'utf8');
  const saveStart = source.indexOf('async function saveCurrentTab()');
  assert.ok(saveStart >= 0, 'saveCurrentTab must exist');
  const saveEnd = source.indexOf('\n}', source.indexOf('ElMessage.success', saveStart));
  const saveBody = source.slice(saveStart, saveEnd);

  assert.ok(
    saveBody.includes('documentController.save(tab.canonicalDocumentKey)'),
    'saveCurrentTab must save via documentController.save with the canonical document key',
  );
  assert.ok(
    !saveBody.includes('electronAPI'),
    'saveCurrentTab must not call electronAPI directly; the document domain owns file persistence',
  );
});
