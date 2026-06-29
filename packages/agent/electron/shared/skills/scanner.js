'use strict';

/**
 * Skills directory scanner (shared between ClaudeCode & CodeX).
 *
 * Extracted from duplicated code in claudeAgent.js / codexAgent.js (Batch 4).
 * Both agents scanned installed skills directories with the same structure;
 * only the first-markdown-file fallback strategy differed slightly.
 *
 * Responsibilities:
 *   - scanSkillsDirs — walk system + project skill directories, build a
 *     Map of name → { scope, path, description }
 */

const fs = require('fs')
const path = require('path')

/**
 * Read the first meaningful line of the first markdown file found in a
 * skill directory.
 *
 * Lookup order: skill.md → readme.md → any *.md (ClaudeCode fallback).
 * CodeX only checked skill.md; this superset is safe because if skill.md
 * exists both agents find it, and the wider fallback only helps edge cases.
 */
function readFirstMdLine(dirPath) {
  try {
    const files = fs.readdirSync(dirPath)
    const md = files.find(n => n.toLowerCase() === 'skill.md')
      || files.find(n => n.toLowerCase() === 'readme.md')
      || files.find(n => n.toLowerCase().endsWith('.md'))
    if (!md) return ''
    const content = fs.readFileSync(path.join(dirPath, md), 'utf8')
    const lines = content.split(/\r?\n/)
    for (const ln of lines) {
      const t = ln.trim()
      if (!t || t.startsWith('#')) continue
      return t.slice(0, 80)
    }
  } catch (_) { /* dir missing or unreadable */ }
  return ''
}

/**
 * Scan system and project skill directories.
 *
 * @param {string} systemDir  — e.g. ~/.claude/skills or ~/.codex/skills
 * @param {string} projectDir — e.g. <cwd>/.claude/skills or <cwd>/.codex/skills
 * @returns {Map<string, {scope:string, path:string, description:string}>}
 */
function scanSkillsDirs(systemDir, projectDir) {
  const installed = new Map()

  const scan = (baseDir, scope) => {
    try {
      if (!baseDir || !fs.existsSync(baseDir)) return
      const entries = fs.readdirSync(baseDir, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory()) {
          installed.set(e.name, {
            scope,
            path: path.join(baseDir, e.name),
            description: readFirstMdLine(path.join(baseDir, e.name)),
          })
        }
      }
    } catch (_) { /* permissions or concurrent deletion */ }
  }

  scan(systemDir, 'system')
  scan(projectDir, 'project')
  return installed
}

module.exports = { scanSkillsDirs, readFirstMdLine }
