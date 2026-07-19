'use strict'

/**
 * workspaceKey 构造与 cwd 规范化（main 侧 CJS 镜像）。
 *
 * 与 packages/agent/src/workbench/workspaceContext.mjs 必须保持逐字节一致
 * 的输出——两侧的身份规则是同一个契约，parity 由
 * tests/workbench-workspace-key-parity.test.mjs 锁定。
 *
 * 规则（纯函数，不依赖 process/platform）：
 * - 反斜杠统一为正斜杠，去掉尾部斜杠；
 * - Windows 形态路径（盘符或 UNC）大小写不敏感 → key 内小写化；
 * - 不做 realpath（符号链接归一由 registry 的 realpath 字段表达）。
 */

function normalizeCwdForWorkspaceKey(cwd) {
  const raw = String(cwd || '').trim()
  if (!raw) return ''
  let normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized) return ''
  const isWindowsPath = /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//')
  if (isWindowsPath) normalized = normalized.toLowerCase()
  return normalized
}

function workspaceKeyFromCwd(cwd) {
  const normalized = normalizeCwdForWorkspaceKey(cwd)
  return normalized ? `cwd:${normalized}` : ''
}

module.exports = { normalizeCwdForWorkspaceKey, workspaceKeyFromCwd }
