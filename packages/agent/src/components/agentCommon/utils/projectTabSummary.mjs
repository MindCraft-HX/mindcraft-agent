/**
 * Shared lightweight project tab summary helper — Phase 1
 *
 * 职责：为 ProjectTabs / CodeHub unifiedTabs 提供只包含必要字段的 summary，
 * 禁止 ...project spread，禁止把 chats/messages 传给 UI 层。
 *
 * ClaudeCode 和 CodeX 共享 getRunningCount / hasPendingToolInChats，
 * buildProjectTabSummary 通过 isPendingTool 参数适配两者的差异判断。
 */

/**
 * 统计正在 thinking 的 chat 数量。
 * ClaudeCode: chat.thinking === true
 * CodeX:      chat.thinking === true
 */
export function getRunningCount(chats) {
  let count = 0
  for (const chat of chats || []) {
    if (chat?.thinking) count += 1
  }
  return count
}

/**
 * 扫描 chats/messages 中是否有待处理工具调用。
 *
 * @param {Array} chats
 * @param {Function} [isPendingTool] 自定义判断函数。
 *   ClaudeCode 通过此参数传入 msg.requestId / AskUserQuestion 校验；
 *   CodeX 不传，默认使用 status === 'pending'。
 */
export function hasPendingToolInChats(chats, isPendingTool) {
  if (typeof isPendingTool === 'function') {
    for (const chat of chats || []) {
      const messages = chat?.messages || []
      for (let i = messages.length - 1; i >= 0; i--) {
        if (isPendingTool(messages[i])) return true
      }
    }
  } else {
    // CodeX 默认：任意 pending 消息
    for (const chat of chats || []) {
      const messages = chat?.messages || []
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.status === 'pending') return true
      }
    }
  }
  return false
}

/**
 * 构建 lightweight project tab summary。
 *
 * 输出只包含 UI 层需要的字段，严禁 spread 完整 project。
 *
 * @param {Object} project 原始 project 对象
 * @param {Object} opts
 * @param {Function} [opts.isPendingTool] ClaudeCode 自定义 pending 判断
 * @param {Function} [opts.getName] 自定义 name 字段。ClaudeCode/CodeX 从 cwd 提取
 * @returns {Object} { id, name, cwd, cwdLocked, runningCount, hasPendingTool, hasDoneNotification, createdAt }
 */
export function buildProjectTabSummary(project, { isPendingTool, getName } = {}) {
  const chats = project.chats || []
  const name = typeof getName === 'function' ? getName(project) : (project.name || '')
  return {
    id: project.id,
    name,
    cwd: project.cwd,
    cwdLocked: project.cwdLocked,
    runningCount: getRunningCount(chats),
    hasPendingTool: hasPendingToolInChats(chats, isPendingTool),
    hasDoneNotification: Boolean(project.hasDoneNotification),
    createdAt: project.createdAt || 0,
  }
}
