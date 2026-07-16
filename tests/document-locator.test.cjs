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
    normalize('D:\\repo\\docs\\index.md'),
    normalize('D:\\repo\\src\\docs\\index.md'),
  ])

  const result = await __test__.resolveCandidatePath({
    rawText: 'docs/index.md',
    workspaceRoot,
    cwd,
    pathExists: (value) => existingPaths.has(normalize(value)),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
  })

  assert.equal(result.ok, true)
  assert.equal(normalize(result.filePath), normalize('D:\\repo\\docs\\index.md'))
  assert.equal(result.matchType, 'workspace-relative')
})

test('resolveCandidatePath accepts absolute file paths', async () => {
  const absolutePath = 'D:\\repo\\docs\\index.md'
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

test('resolveCandidatePath accepts file:// absolute file paths', async () => {
  const absolutePath = 'D:\\repo\\docs\\index.md'
  const result = await __test__.resolveCandidatePath({
    rawText: 'file:///D:/repo/docs/index.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize(absolutePath),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'absolute')
  assert.equal(result.rawText, 'D:/repo/docs/index.md')
  assert.equal(normalize(result.filePath), normalize(absolutePath))
})

test('resolveCandidatePath accepts slash-prefixed windows absolute file paths', async () => {
  const absolutePath = 'D:\\repo\\docs\\index.md'
  const result = await __test__.resolveCandidatePath({
    rawText: '/D:/repo/docs/index.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize(absolutePath),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'absolute')
  assert.equal(result.rawText, '/D:/repo/docs/index.md')
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
    rawText: 'index.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: () => false,
    searchFiles: async () => ({
      ok: true,
      files: ['docs/index.md', 'archive/index.md'],
      suggestions: ['docs/index.md', 'archive/index.md'],
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'multiple-matches')
  assert.deepEqual(result.matches, ['docs/index.md', 'archive/index.md'])
})

test('resolveCandidatePath uses fallback when exactly one file matches', async () => {
  const result = await __test__.resolveCandidatePath({
    rawText: 'index.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: () => false,
    searchFiles: async () => ({
      ok: true,
      files: ['docs/index.md'],
      suggestions: ['docs/index.md'],
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'rg-fallback')
  assert.equal(normalize(result.filePath), normalize('D:\\repo\\docs\\index.md'))
})

test('resolveCandidatePath filters fallback file lists by candidate suffix', async () => {
  const result = await __test__.resolveCandidatePath({
    rawText: 'docs/index.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: () => false,
    searchFiles: async () => ({
      ok: true,
      files: ['README.md', 'docs/index.md', 'src/main.js'],
      suggestions: [],
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'rg-fallback')
  assert.equal(normalize(result.filePath), normalize('D:\\repo\\docs\\index.md'))
})

test('resolveCandidatePath trims Chinese punctuation from rendered path candidates', async () => {
  const target = 'D:\\repo\\docs\\agent-architecture.md'
  const result = await __test__.resolveCandidatePath({
    rawText: 'docs/agent-architecture.md。',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize(target),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchType, 'workspace-relative')
  assert.equal(result.rawText, 'docs/agent-architecture.md')
  assert.equal(normalize(result.filePath), normalize(target))
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
    rawText: 'docs/index.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    pathExists: (value) => normalize(value) === normalize('D:\\repo\\docs\\index.md'),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
    openMdPayload: async (payload) => payloads.push(payload),
    openWithDefault: async () => '',
  })

  assert.equal(result.ok, true)
  assert.equal(result.openMode, 'mdViewer')
  assert.equal(payloads.length, 1)
  assert.equal(payloads[0].name, 'index.md')
  assert.equal(payloads[0].size, 0)
  assert.equal(normalize(payloads[0].filePath), normalize('D:\\repo\\docs\\index.md'))
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

test('openDocumentCandidate blocks agent-message absolute paths outside workspace', async () => {
  const payloads = []
  const opened = []
  const result = await openDocumentCandidate({
    rawText: 'C:\\Users\\alice\\.ssh\\id_rsa',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    source: 'agent-message',
    pathExists: (value) => normalize(value) === normalize('C:\\Users\\alice\\.ssh\\id_rsa'),
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
    openMdPayload: async (payload) => payloads.push(payload),
    openWithDefault: async (filePath) => {
      opened.push(filePath)
      return ''
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'outside-workspace-absolute-path')
  assert.equal(payloads.length, 0)
  assert.equal(opened.length, 0)
})

test('openDocumentCandidate allows agent-message absolute paths inside workspace', async () => {
  const payloads = []
  const result = await openDocumentCandidate({
    rawText: 'D:\\repo\\docs\\index.md',
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo\\src',
    source: 'agent-message',
    pathExists: (value) => normalize(value) === normalize('D:\\repo\\docs\\index.md'),
    realpath: (value) => {
      if (normalize(value) === normalize('D:\\repo')) return normalize('D:\\repo')
      if (normalize(value) === normalize('D:\\repo\\src')) return normalize('D:\\repo\\src')
      if (normalize(value) === normalize('D:\\repo\\docs\\index.md')) return normalize('D:\\repo\\docs\\index.md')
      throw new Error('missing path')
    },
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
    openMdPayload: async (payload) => payloads.push(payload),
    openWithDefault: async () => '',
  })

  assert.equal(result.ok, true)
  assert.equal(result.openMode, 'mdViewer')
  assert.equal(payloads.length, 1)
  assert.equal(normalize(payloads[0].filePath), normalize('D:\\repo\\docs\\index.md'))
})

test('openDocumentCandidate blocks agent-message symlink targets outside workspace', async () => {
  const payloads = []
  const linkPath = 'D:\\repo\\linked\\.ssh\\id_rsa'
  const outsidePath = 'C:\\Users\\alice\\.ssh\\id_rsa'
  const result = await openDocumentCandidate({
    rawText: linkPath,
    workspaceRoot: 'D:\\repo',
    cwd: 'D:\\repo',
    source: 'agent-message',
    pathExists: (value) => normalize(value) === normalize(linkPath),
    realpath: (value) => {
      if (normalize(value) === normalize('D:\\repo')) return normalize('D:\\repo')
      if (normalize(value) === normalize(linkPath)) return normalize(outsidePath)
      throw new Error('missing path')
    },
    searchFiles: async () => ({ ok: true, files: [], suggestions: [] }),
    openMdPayload: async (payload) => payloads.push(payload),
    openWithDefault: async () => '',
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'outside-workspace-absolute-path')
  assert.equal(payloads.length, 0)
})
