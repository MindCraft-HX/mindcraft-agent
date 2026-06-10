const path = require('path')
const fs = require('fs')
const os = require('os')

const MEMORY_DIR = '.claude/memory'
const MEMORY_INDEX = 'MEMORY.md'
const VALID_TYPES = ['user', 'feedback', 'project', 'reference']

/** 获取项目级 memory 目录路径 */
function getMemoryDir(cwd) {
  return path.join(path.resolve(cwd), MEMORY_DIR)
}

/** 获取系统级 memory 目录路径 (~/.claude/memory/) */
function getSystemMemoryDir() {
  return path.join(os.homedir(), '.claude', 'memory')
}

/** 确保 memory 目录存在 */
function ensureMemoryDir(cwd) {
  const dir = getMemoryDir(cwd)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 确保系统级 memory 目录存在 */
function ensureSystemMemoryDir() {
  const dir = getSystemMemoryDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 解析 memory 文件的 frontmatter */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      meta[key] = val
    }
  }
  return { meta, body: match[2] }
}

/** 构建 frontmatter 字符串 */
function buildFrontmatter(meta) {
  const lines = ['---']
  if (meta.name) lines.push(`name: ${meta.name}`)
  if (meta.description) lines.push(`description: ${meta.description}`)
  if (meta.type) lines.push(`type: ${meta.type}`)
  lines.push('---')
  return lines.join('\n')
}

/** 读取指定目录下的所有 memory 文件 */
function readMemoriesFromDir(dir) {
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith('.md') && f !== MEMORY_INDEX
  )
  const memories = []
  for (const filename of files) {
    try {
      const content = fs.readFileSync(path.join(dir, filename), 'utf8')
      const { meta, body } = parseFrontmatter(content)
      memories.push({
        filename,
        name: meta.name || filename.replace('.md', ''),
        description: meta.description || '',
        type: meta.type || 'project',
        body: body.trim(),
      })
    } catch (_) {}
  }
  return memories
}

/** 读取项目级所有 memory 文件 */
function readAllMemories(cwd) {
  return readMemoriesFromDir(getMemoryDir(cwd))
}

/** 读取系统级所有 memory 文件 */
function readSystemMemories() {
  return readMemoriesFromDir(getSystemMemoryDir())
}

/** 读取 MEMORY.md 索引 */
function readMemoryIndex(cwd) {
  const indexPath = path.join(getMemoryDir(cwd), MEMORY_INDEX)
  if (!fs.existsSync(indexPath)) return ''
  return fs.readFileSync(indexPath, 'utf8')
}

/** 读取单个 memory 文件 */
function readMemoryFile(cwd, filename) {
  const filePath = path.join(getMemoryDir(cwd), filename)
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf8')
  const { meta, body } = parseFrontmatter(content)
  return {
    filename,
    name: meta.name || filename.replace('.md', ''),
    description: meta.description || '',
    type: meta.type || 'project',
    body: body.trim(),
  }
}

/** 写入/更新 memory 文件 */
function writeMemoryFile(cwd, filename, { name, description, type, body }) {
  const dir = ensureMemoryDir(cwd)
  if (!VALID_TYPES.includes(type)) type = 'project'
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`
  const meta = { name: name || safeName.replace('.md', ''), description, type }
  const content = buildFrontmatter(meta) + '\n\n' + (body || '')
  fs.writeFileSync(path.join(dir, safeName), content, 'utf8')
  updateMemoryIndex(cwd)
  return safeName
}

/** 写入/更新系统级 memory 文件 */
function writeSystemMemoryFile(filename, { name, description, type, body }) {
  const dir = ensureSystemMemoryDir()
  if (!VALID_TYPES.includes(type)) type = 'user'
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`
  const meta = { name: name || safeName.replace('.md', ''), description, type }
  const content = buildFrontmatter(meta) + '\n\n' + (body || '')
  fs.writeFileSync(path.join(dir, safeName), content, 'utf8')
  return safeName
}

/** 删除项目级 memory 文件 */
function deleteMemoryFile(cwd, filename) {
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`
  const filePath = path.join(getMemoryDir(cwd), safeName)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  updateMemoryIndex(cwd)
  return true
}

/** 删除系统级 memory 文件 */
function deleteSystemMemoryFile(filename) {
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`
  const filePath = path.join(getSystemMemoryDir(), safeName)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  return true
}

/** 重建 MEMORY.md 索引文件 */
function updateMemoryIndex(cwd) {
  const dir = getMemoryDir(cwd)
  if (!fs.existsSync(dir)) return
  const memories = readAllMemories(cwd)
  const lines = ['# Memory Index', '']
  const grouped = {}
  for (const m of memories) {
    if (!grouped[m.type]) grouped[m.type] = []
    grouped[m.type].push(m)
  }
  for (const type of VALID_TYPES) {
    const items = grouped[type]
    if (!items || !items.length) continue
    lines.push(`## ${type}`, '')
    for (const item of items) {
      lines.push(`- [${item.name}](${item.filename}): ${item.description}`)
    }
    lines.push('')
  }
  const indexPath = path.join(dir, MEMORY_INDEX)
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf8')
}

/** 构建注入到对话中的 memory 文本（系统级 + 项目级） */
function buildMemoryPrompt(cwd) {
  const systemMemories = readSystemMemories()
  const projectMemories = readAllMemories(cwd)
  const all = [...systemMemories, ...projectMemories]
  if (!all.length) return ''
  const parts = ['<project-memory>']
  if (systemMemories.length) {
    parts.push('## System Memory')
    for (const m of systemMemories) {
      parts.push(`[${m.type}] ${m.name}: ${m.body}`)
    }
  }
  if (projectMemories.length) {
    parts.push('## Project Memory')
    for (const m of projectMemories) {
      parts.push(`[${m.type}] ${m.name}: ${m.body}`)
    }
  }
  parts.push('</project-memory>')
  return parts.join('\n')
}

module.exports = {
  readAllMemories,
  readSystemMemories,
  readMemoryIndex,
  readMemoryFile,
  writeMemoryFile,
  writeSystemMemoryFile,
  deleteMemoryFile,
  deleteSystemMemoryFile,
  updateMemoryIndex,
  buildMemoryPrompt,
  getSystemMemoryDir,
  VALID_TYPES,
}
