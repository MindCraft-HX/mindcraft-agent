const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')

const {
  CodexCliClient,
  buildCodexCliArgs,
  serializeConfigOverrides,
  terminateOwnedChild,
} = require('../packages/agent/electron/codex/cliTransport')

function waitFor(check, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const poll = () => {
      if (check()) return resolve()
      if (Date.now() >= deadline) return reject(new Error('timed out waiting for async stream activity'))
      setImmediate(poll)
    }
    poll()
  })
}

test('CLI args use the public exec --json protocol and preserve resume options', () => {
  const args = buildCodexCliArgs({
    threadId: 'thread-1',
    model: 'gpt-5.4',
    sandboxMode: 'workspace-write',
    workingDirectory: 'C:/repo',
    skipGitRepoCheck: true,
    modelReasoningEffort: 'high',
    networkAccessEnabled: true,
    webSearchMode: 'cached',
    approvalPolicy: 'never',
    additionalDirectories: ['C:/shared'],
    imagePaths: ['C:/image.png'],
  })

  assert.deepEqual(args.slice(0, 2), ['exec', '--json'])
  assert.ok(args.includes('resume'))
  assert.ok(args.indexOf('resume') < args.indexOf('--image'))
  assert.equal(args[args.indexOf('resume') + 1], 'thread-1')
  assert.ok(args.includes('--skip-git-repo-check'))
  assert.ok(args.includes('--image'))
  assert.equal(args.at(-1), '-')
})

test('resume and thread id cannot be consumed as variadic image paths', () => {
  const args = buildCodexCliArgs({
    threadId: '019f7471-8e6b-73b1-bdd2-1705d4cdf45f',
    imagePaths: ['C:/upload.png'],
  })

  assert.deepEqual(args.slice(-5), [
    'resume',
    '019f7471-8e6b-73b1-bdd2-1705d4cdf45f',
    '--image',
    'C:/upload.png',
    '-',
  ])
})

test('nested config overrides are serialized without npm package coupling', () => {
  assert.deepEqual(serializeConfigOverrides({
    model_providers: { mindcraft: { wire_api: 'responses' } },
  }), ['model_providers.mindcraft.wire_api="responses"'])
})

test('optional CLI arguments degrade safely for an older compatible executable', () => {
  const args = buildCodexCliArgs({
    skipGitRepoCheck: true,
    additionalDirectories: ['C:/shared'],
    imagePaths: ['C:/image.png'],
    capabilities: { execJson: true, resume: true, images: false, additionalDirectories: false, skipGitRepoCheck: false },
  })

  assert.ok(!args.includes('--image'))
  assert.ok(!args.includes('--add-dir'))
  assert.ok(!args.includes('--skip-git-repo-check'))
})

test('CLI transport yields JSONL events and waits for child exit after stdout closes', async () => {
  let spawned = null
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => child.emit('exit', null, 'SIGTERM')
  const client = new CodexCliClient({
    executablePath: 'codex.exe',
    env: {},
    spawnImpl(command, args) {
      spawned = { command, args }
      return child
    },
    platform: 'win32',
  })
  const thread = client.startThread({ workingDirectory: 'C:/repo' })
  const { events } = await thread.runStreamed('hello')
  const seen = []
  const consume = (async () => {
    for await (const event of events) seen.push(event)
  })()

  child.stdout.write('{"type":"thread.started","thread_id":"thread-1"}\n')
  child.stdout.end('{"type":"turn.completed","usage":{}}\n')
  await waitFor(() => seen.length === 2)
  assert.equal(thread.id, 'thread-1')
  assert.equal(seen.length, 2)
  assert.equal(spawned.command, 'codex.exe')
  assert.deepEqual(spawned.args.slice(0, 2), ['exec', '--json'])

  let settled = false
  consume.then(() => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false)
  child.emit('exit', 0, null)
  await consume
  assert.equal(settled, true)
})

test('Windows cancellation terminates only the owned child process tree', () => {
  const calls = []
  const child = { pid: 4242, exitCode: null, killed: false }
  const terminated = terminateOwnedChild(child, {
    platform: 'win32',
    execFileImpl(command, args) { calls.push({ command, args }) },
  })

  assert.equal(terminated, true)
  assert.deepEqual(calls, [{ command: 'taskkill.exe', args: ['/pid', '4242', '/t', '/f'] }])
})

test('malformed JSON terminates the owned child before propagating the parser error', async () => {
  const calls = []
  const child = new EventEmitter()
  child.pid = 4242
  child.exitCode = null
  child.killed = false
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const client = new CodexCliClient({
    executablePath: 'codex.exe', env: {}, platform: 'win32',
    spawnImpl() { return child },
    execFileImpl(command, args) { calls.push({ command, args }) },
  })
  const { events } = await client.startThread().runStreamed('hello')
  const consume = (async () => { for await (const _event of events) {} })()
  child.stdout.end('not-json\n')
  await assert.rejects(consume, /non-JSON stdout/)
  assert.deepEqual(calls, [{ command: 'taskkill.exe', args: ['/pid', '4242', '/t', '/f'] }])
})

test('post-terminal forced close treats the owned process signal as successful transport cleanup', async () => {
  const calls = []
  const child = new EventEmitter()
  child.pid = 4242
  child.exitCode = null
  child.killed = false
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const client = new CodexCliClient({
    executablePath: 'codex.exe', env: {}, platform: 'win32',
    spawnImpl() { return child },
    execFileImpl(command, args) { calls.push({ command, args }) },
  })
  const thread = client.startThread()
  const { events } = await thread.runStreamed('hello')
  const seen = []
  const consume = (async () => { for await (const event of events) seen.push(event) })()

  child.stdout.write('{"type":"turn.completed","usage":{}}\n')
  await waitFor(() => seen.length === 1)
  assert.equal(thread.forceCloseAfterTerminal(), true)
  child.emit('exit', null, 'SIGTERM')

  await consume
  assert.deepEqual(calls, [{ command: 'taskkill.exe', args: ['/pid', '4242', '/t', '/f'] }])
})

test('post-terminal close releases inherited stdout after the root process already exited', async () => {
  const child = new EventEmitter()
  child.pid = 4242
  child.exitCode = null
  child.killed = false
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const client = new CodexCliClient({
    executablePath: 'codex.exe', env: {}, platform: 'win32',
    spawnImpl() { return child },
    execFileImpl() { throw new Error('root process already exited') },
  })
  const thread = client.startThread()
  const { events } = await thread.runStreamed('hello')
  const seen = []
  const consume = (async () => { for await (const event of events) seen.push(event) })()

  child.stdout.write('{"type":"turn.completed","usage":{}}\n')
  await waitFor(() => seen.length === 1)
  child.exitCode = 0
  child.emit('exit', 0, null)
  assert.equal(thread.forceCloseAfterTerminal(), true)

  await consume
  assert.equal(child.stdout.destroyed, true)
})
