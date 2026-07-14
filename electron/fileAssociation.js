const path = require('path')

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

function findAssociatedMarkdownPath(commandLine, { existsSync } = {}) {
  if (!Array.isArray(commandLine)) return null

  for (const argument of commandLine) {
    if (typeof argument !== 'string' || argument.startsWith('-')) continue

    const filePath = path.resolve(argument)
    if (!MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue
    if (existsSync && !existsSync(filePath)) continue
    return filePath
  }

  return null
}

module.exports = { findAssociatedMarkdownPath }
