export function buildDiffLines(oldStr, newStr) {
  if (!oldStr && !newStr) return []
  const oldLines = (oldStr || '').split('\n')
  const newLines = (newStr || '').split('\n')
  const lines = []
  let oi = 0, ni = 0
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi >= oldLines.length) { lines.push({ type: 'add', text: newLines[ni++] }); continue }
    if (ni >= newLines.length) { lines.push({ type: 'del', text: oldLines[oi++] }); continue }
    if (oldLines[oi] === newLines[ni]) {
      lines.push({ type: 'ctx', text: oldLines[oi++] }); ni++
    } else {
      let matched = false
      for (let look = 1; look <= 4; look++) {
        if (ni + look < newLines.length && oldLines[oi] === newLines[ni + look]) {
          for (let k = 0; k < look; k++) lines.push({ type: 'add', text: newLines[ni++] })
          matched = true; break
        }
        if (oi + look < oldLines.length && newLines[ni] === oldLines[oi + look]) {
          for (let k = 0; k < look; k++) lines.push({ type: 'del', text: oldLines[oi++] })
          matched = true; break
        }
      }
      if (!matched) {
        lines.push({ type: 'del', text: oldLines[oi++] })
        lines.push({ type: 'add', text: newLines[ni++] })
      }
    }
  }
  const hunks = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.type === 'ctx') { hunks.push({ type: 'ctx', text: l.text }); i++; continue }
    const hunk = { type: 'hunk', del: [], add: [] }
    while (i < lines.length && lines[i].type !== 'ctx') {
      if (lines[i].type === 'del') hunk.del.push(lines[i].text)
      else hunk.add.push(lines[i].text)
      i++
    }
    hunks.push(hunk)
  }
  return hunks
}

export function applyToolResult(messages, toolUseId, content, isErrorFlag, {
  inferToolFailureFromText, isBashTool, isReadTool, isWriteTool, isEditTool,
}) {
  if (!Array.isArray(messages) || !messages.length) return
  const t = toolUseId
    ? messages.find(m => m.role === 'tool' && m.toolUseId === toolUseId)
    : [...messages].reverse().find(m => m.role === 'tool' && m.status === 'running')
  if (!t) return

  const toolNameLower = String(t.toolName || '').toLowerCase()
  const isTaskTool = [
    'taskcreate', 'task_create',
    'taskupdate', 'task_update',
    'taskdelete', 'task_delete',
    'tasklist', 'task_list',
    'taskget', 'task_get',
    'todowrite', 'todo_write',
  ].includes(toolNameLower)

  let resultContent = ''
  if (isTaskTool && typeof content === 'object' && !Array.isArray(content)) {
    const tasksObj = content?.tool_use_result || content
    if (Array.isArray(tasksObj?.tasks)) resultContent = JSON.stringify({ tasks: tasksObj.tasks })
    else if (Array.isArray(content?.tasks)) resultContent = JSON.stringify({ tasks: content.tasks })
  } else if (Array.isArray(content)) {
    resultContent = content.filter(b => b.type === 'text').map(b => b.text).join('\n')
  } else if (typeof content === 'string') {
    resultContent = content
  }

  const failed = isErrorFlag === true || inferToolFailureFromText(resultContent)
  t.status = failed ? 'error' : 'done'
  t.toolError = failed ? resultContent : ''
  if (isBashTool(t.toolName)) { t.bashOutput = resultContent; t.expanded = true }
  else if (isReadTool(t.toolName)) { t.readContent = resultContent; t.expanded = false }
  else if (isWriteTool(t.toolName) || isEditTool(t.toolName)) { t.expanded = true }
  if (isTaskTool && resultContent) t.toolResultContent = resultContent
}

/**
 * 防御 Vue reactive Proxy 导致 Electron contextBridge 结构化克隆失败。
 *
 * 背景：Vue 3 reactive/ref 包裹的原始值（字符串、数组元素等）在某些 Electron
 * 版本（36.x）的 contextBridge 结构化克隆中可能失败，即使值的类型是标准 JSON。
 * 手动 JSON 序列化 + 反序列化可以剥离所有 Proxy，确保传给 IPC 的是纯对象。
 *
 * 用法：
 *   const clean = safeIpcPayload(raw, 'codexAgentQuery')
 *   await window.electronAPI.codexAgentQuery?.(clean)
 *
 * @param {object} obj  - 原始 payload（可能含 Vue reactive Proxy）
 * @param {string} label - 调用方标识，仅用于诊断日志
 * @returns {object} 纯 JSON 对象
 */
export function safeIpcPayload(obj, label = 'ipc') {
  const DIAG = true // 设为 true 开启逐字段诊断日志
  try {
    if (DIAG) {
      for (const [key, value] of Object.entries(obj)) {
        try {
          JSON.stringify(value)
        } catch (fieldErr) {
          console.error(`[safeIpcPayload] ${label} — 字段 "${key}" 序列化失败:`, {
            type: typeof value,
            constructor: value?.constructor?.name,
            isProxy: typeof value === 'object' && value !== null && !!value?.__v_isRef,
            message: fieldErr?.message,
          })
        }
      }
    }
    return JSON.parse(JSON.stringify(obj))
  } catch (err) {
    console.error(`[safeIpcPayload] ${label} — 整体序列化失败，回退原始对象（可能导致 IPC 克隆错误）:`, {
      message: err?.message,
      keys: Object.keys(obj),
      types: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v])),
    })
    return obj
  }
}
