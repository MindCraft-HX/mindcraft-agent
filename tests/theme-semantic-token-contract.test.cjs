'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const themes = ['light', 'brown', 'dark', 'blue']
const requiredTokens = [
  'bg-surface', 'bg-selected', 'input-bg', 'text-primary', 'border-lightest',
  'accent', 'accent-bg', 'warning-text', 'danger-text',
  'diff-add-prefix', 'diff-del-prefix', 'diff-line-num',
]

function readTheme(name) {
  return fs.readFileSync(path.join(root, 'src', 'styles', `cc-theme-${name}.css`), 'utf8')
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
}

function luminance(hex) {
  const channels = hexToRgb(hex).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('all themes define shared semantic tokens used by drawers and diff views', () => {
  for (const theme of themes) {
    const source = readTheme(theme)
    for (const token of requiredTokens) {
      assert.match(source, new RegExp(`--cc-${token}\\s*:`), `${theme} is missing --cc-${token}`)
    }
  }
})

test('light theme primary and diff metadata text remain readable on their surfaces', () => {
  assert.ok(contrast('#111111', '#f7f6f4') >= 7)
  assert.ok(contrast('#626262', '#ffffff') >= 4.5)
  assert.ok(contrast('#087a32', '#c8f5d0') >= 4.5)
  assert.ok(contrast('#b91c1c', '#fdd0d0') >= 4.5)
})
