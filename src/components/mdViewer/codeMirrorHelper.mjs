// CodeMirror 6 集成工具：语言包映射、基础扩展集

import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { xml } from '@codemirror/lang-xml'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage } from '@codemirror/language'
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell'

// 扩展名 -> 语言扩展工厂
const LANG_FACTORY_BY_EXT = {
  md: markdown,
  markdown: markdown,
  mdx: markdown,

  js: javascript,
  cjs: javascript,
  mjs: javascript,
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),

  json: json,
  css: css,
  scss: css,
  sass: css,
  less: css,
  html: html,
  htm: html,
  xml: xml,
  svg: xml,
  vue: xml,

  py: python,
  java: java,
  c: cpp,
  cc: cpp,
  cpp: cpp,
  h: cpp,
  hpp: cpp,

  sql: sql,
  yml: yaml,
  yaml: yaml,

  sh: () => StreamLanguage.define(shellMode),
  ps1: () => StreamLanguage.define(shellMode),
  bat: () => StreamLanguage.define(shellMode),
  cmd: () => StreamLanguage.define(shellMode),
}

// 无语法高亮的纯文本扩展
const PLAIN_TEXT_EXTS = new Set([
  'txt', 'log', 'toml', 'ini', 'conf', 'env', 'cfg', 'properties',
  'csv', 'rst', 'lock',
])

/**
 * 根据文件扩展名获取 CodeMirror 语言扩展
 * @param {string} ext - 文件扩展名（不含点）
 * @returns {import('@codemirror/language').LanguageSupport | null}
 */
export function getLanguageExtension(ext) {
  const key = (ext || '').toLowerCase()
  const factory = LANG_FACTORY_BY_EXT[key]
  if (typeof factory === 'function') return factory()
  if (PLAIN_TEXT_EXTS.has(key)) return null
  return null
}
