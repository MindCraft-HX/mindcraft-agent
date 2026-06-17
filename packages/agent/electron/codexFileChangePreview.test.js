const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  DEFAULT_GIT_TIMEOUT_MS,
  buildNewFileUnifiedDiff,
  normalizeFileChangeItemPreviews,
  readNewTextFileDiff,
  resolveProjectRelativePath,
} = require('./codexFileChangePreview')

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-file-change-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('resolveProjectRelativePath rejects paths outside cwd', () => {
  const cwd = path.resolve('D:\\repo')
  assert.equal(resolveProjectRelativePath(cwd, path.join(cwd, 'src', 'a.js')), 'src/a.js')
  assert.equal(resolveProjectRelativePath(cwd, path.resolve('D:\\outside\\a.js')), '')
})

test('buildNewFileUnifiedDiff renders an added file diff', () => {
  const diff = buildNewFileUnifiedDiff('src/a.js', 'one\ntwo\n')
  assert.match(diff, /new file mode 100644/)
  assert.match(diff, /\+\+\+ b\/src\/a\.js/)
  assert.match(diff, /\+one/)
  assert.match(diff, /\+two/)
})

test('normalizeFileChangeItemPreviews preserves SDK unified_diff', () => {
  const item = {
    type: 'file_change',
    changes: [{ path: 'src/a.js', unified_diff: 'diff --git a/src/a.js b/src/a.js\n' }],
  }
  const out = normalizeFileChangeItemPreviews(item, process.cwd())
  assert.equal(out.changes[0].unified_diff, item.changes[0].unified_diff)
})

test('normalizeFileChangeItemPreviews uses git diff before file fallback', (t) => {
  const calls = []
  const execFileSyncImpl = (_cmd, args) => {
    calls.push(args)
    if (args[0] === 'diff') return 'diff --git a/src/a.js b/src/a.js\n+tracked\n'
    return ''
  }
  const item = { type: 'file_change', changes: [{ path: 'src/a.js' }] }
  const out = normalizeFileChangeItemPreviews(item, process.cwd(), { execFileSyncImpl })
  assert.equal(out.changes[0]._diffSource, 'git')
  assert.match(out.changes[0].unified_diff, /\+tracked/)
  assert.equal(calls[0][0], 'diff')
})

test('normalizeFileChangeItemPreviews limits expensive preview generation', () => {
  let calls = 0
  const execFileSyncImpl = (_cmd, args) => {
    calls += 1
    if (args[0] === 'check-ignore') throw Object.assign(new Error('not ignored'), { status: 1 })
    if (args[0] === 'ls-files') throw Object.assign(new Error('not tracked'), { status: 1 })
    return ''
  }
  const item = {
    type: 'file_change',
    changes: [
      { path: 'a.js' },
      { path: 'b.js' },
      { path: 'c.js', unified_diff: 'diff --git a/c.js b/c.js\n+c\n' },
    ],
  }

  const out = normalizeFileChangeItemPreviews(item, process.cwd(), { execFileSyncImpl, maxPreviewChanges: 1 })

  assert.equal(out.changes[0]._noDiffReason, 'file_missing')
  assert.equal(out.changes[1]._noDiffReason, 'preview_limit')
  assert.equal(out.changes[2].unified_diff, item.changes[2].unified_diff)
  assert.equal(calls, 4)
})

test('normalizeFileChangeItemPreviews uses short git timeout by default', () => {
  const timeouts = []
  const execFileSyncImpl = (_cmd, _args, options) => {
    timeouts.push(options.timeout)
    return ''
  }
  normalizeFileChangeItemPreviews({ type: 'file_change', changes: [{ path: 'src/a.js' }] }, process.cwd(), { execFileSyncImpl })
  assert.ok(timeouts.length >= 1)
  assert.ok(timeouts.every(timeout => timeout === DEFAULT_GIT_TIMEOUT_MS))
})

test('readNewTextFileDiff renders untracked non-ignored text files', (t) => {
  const cwd = makeTempDir(t)
  fs.mkdirSync(path.join(cwd, 'src'))
  fs.writeFileSync(path.join(cwd, 'src', 'new.js'), 'const x = 1\n')
  const execFileSyncImpl = (_cmd, args) => {
    if (args[0] === 'check-ignore') throw Object.assign(new Error('not ignored'), { status: 1 })
    if (args[0] === 'ls-files') throw Object.assign(new Error('not tracked'), { status: 1 })
    return ''
  }
  const result = readNewTextFileDiff(cwd, 'src/new.js', { execFileSyncImpl })
  assert.equal(result.reason, '')
  assert.match(result.diff, /new file mode 100644/)
  assert.match(result.diff, /\+const x = 1/)
})

test('readNewTextFileDiff does not preview ignored files', (t) => {
  const cwd = makeTempDir(t)
  fs.writeFileSync(path.join(cwd, 'local.md'), 'ignored\n')
  const execFileSyncImpl = (_cmd, args) => {
    if (args[0] === 'check-ignore') return ''
    return ''
  }
  const result = readNewTextFileDiff(cwd, 'local.md', { execFileSyncImpl })
  assert.equal(result.diff, '')
  assert.equal(result.reason, 'ignored_file')
})

test('readNewTextFileDiff rejects large and binary files', (t) => {
  const cwd = makeTempDir(t)
  fs.writeFileSync(path.join(cwd, 'large.txt'), 'abcdef')
  fs.writeFileSync(path.join(cwd, 'binary.bin'), Buffer.from([0, 1, 2, 3]))
  const execFileSyncImpl = (_cmd, args) => {
    if (args[0] === 'check-ignore') throw Object.assign(new Error('not ignored'), { status: 1 })
    if (args[0] === 'ls-files') throw Object.assign(new Error('not tracked'), { status: 1 })
    return ''
  }

  assert.equal(readNewTextFileDiff(cwd, 'large.txt', { execFileSyncImpl, maxNewFileBytes: 3 }).reason, 'file_too_large')
  assert.equal(readNewTextFileDiff(cwd, 'binary.bin', { execFileSyncImpl }).reason, 'binary_file')
})
