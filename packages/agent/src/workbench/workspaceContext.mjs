/**
 * ActiveWorkspaceContext 的 workspaceKey 构造与 cwd 规范化。
 *
 * 设计约束（docs/workbench-split-and-terminal.md 4.1）：
 * - workspaceKey 格式 `cwd:<normalized-cwd>`，只表达工作区身份，
 *   不是 chatKey，也不是 provider project id。
 * - Claude 与 CodeX 指向同一规范化 cwd 时必须得到同一 workspaceKey，
 *   以便共享终端/文档上下文。
 *
 * 规范化规则（纯函数，不依赖 process/platform，renderer/main 均可复用）：
 * - 反斜杠统一为正斜杠，去掉尾部斜杠；
 * - Windows 形态路径（盘符或 UNC）大小写不敏感 → key 内小写化；
 * - 不做 realpath（renderer 无 fs；符号链接归一由 main locator 负责）。
 */

export function normalizeCwdForWorkspaceKey(cwd) {
  const raw = String(cwd || '').trim()
  if (!raw) return ''
  let normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized) return ''
  const isWindowsPath = /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//')
  if (isWindowsPath) normalized = normalized.toLowerCase()
  return normalized
}

export function workspaceKeyFromCwd(cwd) {
  const normalized = normalizeCwdForWorkspaceKey(cwd)
  return normalized ? `cwd:${normalized}` : ''
}
