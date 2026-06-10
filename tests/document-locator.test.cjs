const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const {
  __test__,
  openDocumentCandidate,
} = require('../electron/mainModules/documentLocator')

function normalize(value) {
  return path.win32.normalize(value)
}

test('resolveCandidatePath prefers workspaceRoot before cwd and fallback', async () => {
  const workspaceRoot = 'D:\\repo'
  const cwd = 'D:\\repo\\src'
  const existingPaths = new Set([
    normalize('D:\\repo\\docs\\TODO.md'),
    normalize('D:\\repo\\src\\docs\\TODO.md'),
  ])

  const result = await __test__.resolveCandidatePath({
    rawText: 'docs/TODO.md',
    workspaceRoot,
    cwd,
    pathExists: (value) => existingPaths.has(normalize(value)),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
  })

  assert.equal(result.ok, true)
  assert.equal(normalize(result.filePath), normalize('D:\\repo\\docs\\TODO.md'))
  assert.equal(result.matchType, 'workspace-relative')
})

test('resolveCandidatePath accepts absolute file paths', async () => {
  const absolutePath = 'D:\\repo\\docs\\TODO.md'
  const result = await __test__.resolveCandidatePath({
    rawText: absolutePath,
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize(absolutePath),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'absolute')
  assert.equal(normalize(result.filePath), normalize(absolutePath))
})

test('resolveCandidatePath falls back to cwd when workspaceRoot misses', async () => {
  const cwdTarget = 'D:\\repo\\src\\notes\\readme.md'
  const result = await __test__.resolveCandidatePath({
    rawText: 'notes/readme.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize(cwdTarget),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'cwd-relative')
  assert.equal(normalize(result.filePath), normalize(cwdTarget))
})

test('resolveCandidatePath returns multiple matches when fallback is ambiguous', async () => {
  const result = await __test__.resolveCandidatePath({
    rawText: 'TODO.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: () => false,
    searchFiles: async () => ({
      ok: true,
      files: ['docs/TODO.md', 'archive/TODO.md'],
      suggestions: ['docs/TODO.md', 'archive/TODO.md'],
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'multiple-matches')
  assert.deepEqual(result.matches, ['docs/TODO.md', 'archive/TODO.md'])
})

test('resolveCandidatePath uses fallback when exactly one file matches', async () => {
  const result = await __test__.resolveCandidatePath({
    rawText: 'TODO.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: () => false,
    searchFiles: async () => ({
      ok: true,
      files: ['docs/TODO.md'],
      suggestions: ['docs/TODO.md'],
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'rg-fallback')
  assert.equal(normalize(result.filePath), normalize('D:\\repo\\docs\\TODO.md'))
})

test('resolveCandidatePath filters fallback file lists by candidate suffix', async () => {
  const result = await __test__.resolveCandidatePath({
    rawText: 'docs/TODO.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: () => false,
    searchFiles: async () => ({
      ok: true,
      files: ['README.md', 'docs/TODO.md', 'src/main.js'],
      suggestions: [],
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'rg-fallback')
  assert.equal(normalize(result.filePath), normalize('D:\\repo\\docs\\TODO.md'))
})

test('inferOpenMode routes markdown and code files into in-app viewers', () => {
  assert.equal(__test__.inferOpenMode('D:\\repo\\docs\\note.md'), 'mdViewer')
  assert.equal(__test__.inferOpenMode('D:\\repo\\src\\main.js'), 'textViewer')
  assert.equal(__test__.inferOpenMode('D:\\repo\\tests\\local-search.test.cjs'), 'textViewer')
  assert.equal(__test__.inferOpenMode('D:\\repo\\tests\\agent-markdown-render.test.mjs'), 'textViewer')
  assert.equal(__test__.inferOpenMode('D:\\repo\\assets\\logo.png'), 'system-default')
})

test('openDocumentCandidate opens supported files in md viewer payload', async () => {
  const payloads = []
  const result = await openDocumentCandidate({
    rawText: 'docs/TODO.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize('D:\\repo\\docs\\TODO.md'),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
    openMdPayload: async (payload) => payloads.push(payload),
    openWithDefault: async () => '',
  })

  assert.equal(result.ok, true)
  assert.equal(result.openMode, 'mdViewer')
  assert.equal(payloads.length, 1)
  assert.equal(normalize(payloads[0].filePath), normalize('D:\\repo\\docs\\TODO.md'))
})

test('openDocumentCandidate falls back to system default for unsupported files', async () => {
  const opened = []
  const result = await openDocumentCandidate({
    rawText: 'assets/logo.png',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize('D:\\repo\\assets\\logo.png'),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
    openMdPayload: async () => {
      throw new Error('should not open in md viewer')
    },
    openWithDefault: async (filePath) => {
      opened.push(filePath)
      return ''
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.openMode, 'system-default')
  assert.equal(opened.length, 1)
  assert.equal(normalize(opened[0]), normalize('D:\\repo\\assets\\logo.png'))
})
