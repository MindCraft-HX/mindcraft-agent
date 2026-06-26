import {
  isAbsoluteFilePath,
  isStrongLocalPathCandidate,
  normalizeLocalPathHref,
  splitLocalPathText,
} from './localPathTokenizer.js'

function createTextToken(Token, content) {
  const token = new Token('text', '', 0)
  token.content = content
  return token
}

function createPathTokens(Token, label, candidate) {
  const open = new Token('link_open', 'a', 1)
  open.attrs = [
    ['class', 'md-link md-file-link'],
    ['href', '#'],
    ['title', `打开 ${candidate}`],
    ['data-path-candidate', candidate],
  ]

  const text = createTextToken(Token, label)
  const close = new Token('link_close', 'a', -1)
  return [open, text, close]
}

function splitTextToken(Token, token) {
  const segments = splitLocalPathText(token.content)
  if (segments.length === 1 && segments[0]?.type === 'text') return [token]

  const tokens = []
  for (const segment of segments) {
    if (!segment.content) continue
    if (segment.type === 'path') {
      tokens.push(...createPathTokens(Token, segment.content, segment.candidate))
    } else {
      tokens.push(createTextToken(Token, segment.content))
    }
  }
  return tokens
}

function splitTextRun(Token, run) {
  if (!run.length) return []
  if (run.length === 1 && run[0].type === 'text') return splitTextToken(Token, run[0])

  const content = run.map((token) => token.content || '').join('')
  const segments = splitLocalPathText(content)
  if (segments.length === 1 && segments[0]?.type === 'text') return run

  const tokens = []
  for (const segment of segments) {
    if (!segment.content) continue
    if (segment.type === 'path') {
      tokens.push(...createPathTokens(Token, segment.content, segment.candidate))
    } else {
      tokens.push(createTextToken(Token, segment.content))
    }
  }
  return tokens
}

function getHtmlInlineTag(content = '') {
  const match = String(content || '').match(/^<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*)?>$/)
  if (!match) return null
  return {
    name: match[1].toLowerCase(),
    closing: /^<\//.test(content),
    selfClosing: /\/>$/.test(content),
  }
}

function normalizeLocalLinkHref(href = '') {
  const value = String(href || '').trim()
  if (!value || /^https?:\/\//i.test(value) || /^mailto:/i.test(value) || /^#/i.test(value)) return ''
  const localHref = normalizeLocalPathHref(value)
  if (isAbsoluteFilePath(value) || isStrongLocalPathCandidate(localHref)) return localHref || value
  if (isStrongLocalPathCandidate(value)) return value
  return ''
}

export function markdownItLocalPathPlugin(md) {
  md.core.ruler.after('inline', 'mindcraft-local-path-linkify', (state) => {
    const Token = state.Token
    const htmlSkipTags = new Set(['a', 'code', 'pre', 'textarea', 'kbd', 'samp', 'script', 'style'])

    for (const token of state.tokens) {
      if (token.type !== 'inline' || !Array.isArray(token.children) || !token.children.length) continue

      const children = []
      const textRun = []
      let linkDepth = 0
      const htmlSkipStack = []

      const flushTextRun = () => {
        if (!textRun.length) return
        children.push(...splitTextRun(Token, textRun.splice(0)))
      }

      for (const child of token.children) {
        if (child.type === 'link_open') {
          flushTextRun()
          linkDepth += 1
          children.push(child)
          continue
        }
        if (child.type === 'link_close') {
          flushTextRun()
          linkDepth = Math.max(0, linkDepth - 1)
          children.push(child)
          continue
        }
        if (child.type === 'html_inline') {
          flushTextRun()
          const tag = getHtmlInlineTag(child.content)
          if (tag && htmlSkipTags.has(tag.name)) {
            if (tag.closing) {
              const idx = htmlSkipStack.lastIndexOf(tag.name)
              if (idx >= 0) htmlSkipStack.splice(idx, 1)
            } else if (!tag.selfClosing) {
              htmlSkipStack.push(tag.name)
            }
          }
          children.push(child)
          continue
        }
        if ((child.type === 'text' || child.type === 'text_special') && linkDepth === 0 && htmlSkipStack.length === 0) {
          textRun.push(child)
          continue
        }
        flushTextRun()
        children.push(child)
      }

      flushTextRun()
      token.children = children
    }
  })

  const defaultLinkOpen = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const href = tokens[idx].attrGet('href') || ''
    const localHref = normalizeLocalLinkHref(href)
    if (localHref) {
      tokens[idx].attrSet('class', 'md-link md-file-link')
      tokens[idx].attrSet('href', '#')
      tokens[idx].attrSet('title', `打开 ${localHref}`)
      tokens[idx].attrSet('data-path-candidate', localHref)
    } else if (/^https?:\/\//i.test(href)) {
      tokens[idx].attrSet('class', 'md-link')
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }
}
