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
