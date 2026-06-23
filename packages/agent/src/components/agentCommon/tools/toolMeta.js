/**
 * Shared tool metadata resolver.
 *
 * Consumed by both ClaudeCode and Codex for:
 *   - tool icon key
 *   - display label
 *   - semantic group (for CSS color stripe)
 *   - CSS class suffix
 *   - detailKind (for local detail-component routing)
 *
 * Accepts either a string or an object:
 *   resolveToolMeta('bash')
 *   resolveToolMeta({ toolName: msg.toolName, rawType: msg.rawType })
 */

// ── Normalize ────────────────────────────────────────────────

/**
 * @param {string} name
 * @returns {string}
 */
export function normalizeToolName(name) {
  if (!name) return ''
  return String(name).toLowerCase().trim()
}

// ── Semantic group definitions ───────────────────────────────

const GROUP = {
  write: 'write',
  edit: 'edit',
  read: 'read',
  terminal: 'terminal',
  search: 'search',
  think: 'think',
  plan: 'plan',
  todo: 'todo',
  question: 'question',
  plugin: 'plugin',
  change: 'change',
  agent: 'agent',
  error: 'other',
  other: 'other',
}

const DETAIL_KIND = {
  write: 'write',
  read: 'read',
  terminal: 'terminal',
  think: 'think',
  plan: 'plan',
  todo: 'todo',
  question: 'question',
  agent: 'agent',
  webSearch: 'webSearch',
  generic: 'generic',
}

// ── Tool name → { group, icon, label, detailKind } ───────────

/**
 * Master mapping table. Keys are normalized tool names.
 * Each entry defines the canonical semantic classification.
 */
const TOOL_MAP = {
  // Write
  write_file:      { group: GROUP.write, icon: 'write', label: '写入文件', detailKind: DETAIL_KIND.write },
  write:           { group: GROUP.write, icon: 'write', label: '写入文件', detailKind: DETAIL_KIND.write },
  create_file:     { group: GROUP.write, icon: 'write', label: '创建文件', detailKind: DETAIL_KIND.write },
  writefile:       { group: GROUP.write, icon: 'write', label: '写入文件', detailKind: DETAIL_KIND.write },

  // Edit
  edit_file:       { group: GROUP.edit, icon: 'edit', label: '编辑文件', detailKind: DETAIL_KIND.write },
  edit:            { group: GROUP.edit, icon: 'edit', label: '编辑文件', detailKind: DETAIL_KIND.write },
  str_replace:     { group: GROUP.edit, icon: 'edit', label: '编辑文件', detailKind: DETAIL_KIND.write },
  str_replace_editor:       { group: GROUP.edit, icon: 'edit', label: '编辑文件', detailKind: DETAIL_KIND.write },
  str_replace_based_edit:   { group: GROUP.edit, icon: 'edit', label: '编辑文件', detailKind: DETAIL_KIND.write },

  // Read
  read_file:       { group: GROUP.read, icon: 'read', label: '读取文件', detailKind: DETAIL_KIND.read },
  read:            { group: GROUP.read, icon: 'read', label: '读取文件', detailKind: DETAIL_KIND.read },

  // Terminal
  bash:            { group: GROUP.terminal, icon: 'terminal', label: '执行命令', detailKind: DETAIL_KIND.terminal },
  shell:           { group: GROUP.terminal, icon: 'terminal', label: '执行命令', detailKind: DETAIL_KIND.terminal },
  execute:         { group: GROUP.terminal, icon: 'terminal', label: '执行命令', detailKind: DETAIL_KIND.terminal },
  run_command:     { group: GROUP.terminal, icon: 'terminal', label: '执行命令', detailKind: DETAIL_KIND.terminal },
  powershell:      { group: GROUP.terminal, icon: 'terminal', label: 'PowerShell', detailKind: DETAIL_KIND.terminal },

  // Search
  grep:            { group: GROUP.search, icon: 'search', label: '搜索内容', detailKind: DETAIL_KIND.generic },
  glob:            { group: GROUP.search, icon: 'search', label: '搜索文件', detailKind: DETAIL_KIND.generic },
  list_files:      { group: GROUP.search, icon: 'search', label: '列出文件', detailKind: DETAIL_KIND.generic },
  web_search:      { group: GROUP.search, icon: 'search', label: '网页搜索', detailKind: DETAIL_KIND.webSearch },

  // Thinking
  thinking:        { group: GROUP.think, icon: 'think', label: '思考过程', detailKind: DETAIL_KIND.think },
  reasoning:       { group: GROUP.think, icon: 'think', label: 'Thinking', detailKind: DETAIL_KIND.think },

  // Plan
  enterplanmode:   { group: GROUP.plan, icon: 'plan', label: '进入计划模式', detailKind: DETAIL_KIND.plan },
  enter_plan_mode: { group: GROUP.plan, icon: 'plan', label: '进入计划模式', detailKind: DETAIL_KIND.plan },
  exitplanmode:    { group: GROUP.plan, icon: 'plan', label: '退出计划模式', detailKind: DETAIL_KIND.plan },
  exit_plan_mode:  { group: GROUP.plan, icon: 'plan', label: '退出计划模式', detailKind: DETAIL_KIND.plan },
  update_plan:     { group: GROUP.plan, icon: 'plan', label: '执行计划', detailKind: DETAIL_KIND.plan },

  // Todo / Task
  todowrite:       { group: GROUP.todo, icon: 'todo', label: '更新待办', detailKind: DETAIL_KIND.todo },
  todo_write:      { group: GROUP.todo, icon: 'todo', label: '更新待办', detailKind: DETAIL_KIND.todo },
  taskcreate:      { group: GROUP.todo, icon: 'todo', label: '创建任务', detailKind: DETAIL_KIND.todo },
  task_create:     { group: GROUP.todo, icon: 'todo', label: '创建任务', detailKind: DETAIL_KIND.todo },
  taskupdate:      { group: GROUP.todo, icon: 'todo', label: '更新任务', detailKind: DETAIL_KIND.todo },
  task_update:     { group: GROUP.todo, icon: 'todo', label: '更新任务', detailKind: DETAIL_KIND.todo },
  taskdelete:      { group: GROUP.todo, icon: 'todo', label: '删除任务', detailKind: DETAIL_KIND.todo },
  task_delete:     { group: GROUP.todo, icon: 'todo', label: '删除任务', detailKind: DETAIL_KIND.todo },
  todo_list:       { group: GROUP.todo, icon: 'todo', label: '任务列表', detailKind: DETAIL_KIND.todo },

  // Question
  askquestion:     { group: GROUP.question, icon: 'question', label: '询问用户', detailKind: DETAIL_KIND.question },
  ask_user_question: { group: GROUP.question, icon: 'question', label: '询问用户', detailKind: DETAIL_KIND.question },
  askuserquestion: { group: GROUP.question, icon: 'question', label: '询问用户', detailKind: DETAIL_KIND.question },

  // Plugin / Skill / MCP
  skill:           { group: GROUP.plugin, icon: 'plugin', label: '技能', detailKind: DETAIL_KIND.generic },
  mcp_tool:        { group: GROUP.plugin, icon: 'plugin', label: '插件', detailKind: DETAIL_KIND.generic },
  mcp_tool_call:   { group: GROUP.plugin, icon: 'plugin', label: '插件', detailKind: DETAIL_KIND.generic },

  // Change (Codex-specific: file_change, apply_patch)
  file_change:     { group: GROUP.change, icon: 'change', label: '文件变更', detailKind: DETAIL_KIND.write },
  apply_patch:     { group: GROUP.change, icon: 'change', label: '代码变更', detailKind: DETAIL_KIND.write },

  // Agent (ClaudeCode-specific)
  agent:           { group: GROUP.agent, icon: 'agent', label: '子代理', detailKind: DETAIL_KIND.agent },
  multi_agent_v1:  { group: GROUP.agent, icon: 'agent', label: '子代理', detailKind: DETAIL_KIND.agent },

  // Error
  error:           { group: GROUP.other, icon: 'error', label: '错误', detailKind: DETAIL_KIND.generic },
}

// ── Resolvers ─────────────────────────────────────────────────

/**
 * Resolve full tool metadata from a string or object.
 *
 * @param {string|{toolName?:string, rawType?:string, activityLabel?:string}} input
 * @returns {{ name: string, label: string, icon: string, group: string, className: string, detailKind: string }}
 */
export function resolveToolMeta(input) {
  let toolName = ''
  let rawType = ''

  if (typeof input === 'string') {
    toolName = input
  } else if (input && typeof input === 'object') {
    toolName = input.toolName || ''
    rawType = input.rawType || ''
  }

  const name = normalizeToolName(toolName)
  const type = normalizeToolName(rawType)

  // Codex: try rawType first (e.g. rawType='file_change' when toolName might differ)
  // CC: rawType may be empty — fall back to toolName
  const entry = TOOL_MAP[type] || TOOL_MAP[name]

  if (entry) {
    return {
      name: type || name,
      label: entry.label,
      icon: entry.icon,
      group: entry.group,
      className: `tool-group-${entry.group}`,
      detailKind: entry.detailKind,
    }
  }

  // Unknown — classify as 'other'
  // Check for ide_* prefix
  if (name.startsWith('ide_')) {
    return {
      name,
      label: name,
      icon: 'tool',
      group: GROUP.other,
      className: 'tool-group-other',
      detailKind: DETAIL_KIND.generic,
    }
  }

  return {
    name,
    label: name, // caller may override with raw name
    icon: 'tool',
    group: GROUP.other,
    className: 'tool-group-other',
    detailKind: DETAIL_KIND.generic,
  }
}

/**
 * Get semantic group only.
 * @param {string|object} input
 * @returns {string}
 */
export function resolveToolGroup(input) {
  return resolveToolMeta(input).group
}

/**
 * Get display label only.
 * @param {string|object} input
 * @returns {string}
 */
export function resolveToolLabel(input) {
  const meta = resolveToolMeta(input)
  return meta.label
}

/**
 * Get icon key only.
 * @param {string|object} input
 * @returns {string}
 */
export function resolveToolIconKey(input) {
  return resolveToolMeta(input).icon
}

export { GROUP, DETAIL_KIND }
