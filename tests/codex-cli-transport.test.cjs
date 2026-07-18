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
  assert.equal(args.at(-1), 'thread-1')
  assert.ok(args.includes('--skip-git-repo-check'))
  assert.ok(args.includes('--image'))
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
