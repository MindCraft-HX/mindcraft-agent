const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const claudeAgentPath = path.join(repoRoot, 'packages/agent/electron/claudeAgent.js')
const codexAgentPath = path.join(repoRoot, 'packages/agent/electron/codexAgent.js')

// ===========================================================================
// 1. Abort ordering
// ===========================================================================

test('Claude abort: abortController.abort() fires before query.close()', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  // Abort handler at claude-agent-abort
  assert.match(
    source,
    /ipcMain\.handle\(CLAUDE_CHANNELS\.AGENT_ABORT[\s\S]*abortController\?\.abort[\s\S]*query\?\.close/,
    'expected abort controller to be aborted before query.close() in claude-agent-abort',
  )
})

test('Claude abort: sends agent-done with reason "aborted" after cleanup', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(
    source,
    /ipcMain\.handle\(CLAUDE_CHANNELS\.AGENT_ABORT[\s\S]*agentSessions\.delete\(chatKey\)[\s\S]*CLAUDE_CHANNELS\.AGENT_DONE[\s\S]*reason:\s*'aborted'/,
    'expected agent-done with aborted reason after session cleanup',
  )
})

test('CodeX abort: abortController.abort() fires before thread cancel', () => {
  const source = fs.readFileSync(codexAgentPath, 'utf8')

  assert.match(
    source,
    /ipcMain\.handle\(CODEX_CHANNELS\.AGENT_ABORT[\s\S]*abortController\?\.abort[\s\S]*thread\.cancel/,
    'expected abort controller to be aborted before thread.cancel() in codex-agent-abort',
  )
})

test('CodeX abort: sends abort message then agent-done', () => {
  const source = fs.readFileSync(codexAgentPath, 'utf8')

  assert.match(
    source,
    /ipcMain\.handle\(CODEX_CHANNELS\.AGENT_ABORT[\s\S]*CODEX_CHANNELS\.AGENT_MESSAGE[\s\S]*subtype:\s*'abort'[\s\S]*CODEX_CHANNELS\.AGENT_DONE/,
    'expected abort system message before agent-done in codex-agent-abort',
  )
})

// ===========================================================================
// 2. Runtime change → old query cleanup
// ===========================================================================

test('Claude runtime change: aborts old query before creating new one', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  // Pattern: detect runtimeChanged → abort + close → delete → continue (not return)
  assert.match(
    source,
    /runtimeChanged[\s\S]*abortController\?\.abort[\s\S]*query\?\.close[\s\S]*agentSessions\.delete\(chatKey\)/,
    'expected old query to be aborted, closed, and removed on runtime change',
  )
})

test('Claude runtime change: retains cliSessionIds for resume across runs', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  // Comment says "保留 cliSessionIds 以便 resume 对话历史" before the runtime change detection block
  assert.match(
    source,
    /保留 cliSessionIds 以便 resume 对话历史/,
    'expected comment documenting cliSessionIds preservation across runtime change',
  )
  assert.match(
    source,
    /检测到运行时配置变更[\s\S]*已中止旧查询/,
    'expected log message confirming old query aborted on runtime change',
  )
})

test('CodeX query collision: aborts old session and clears timers before restart', () => {
  const source = fs.readFileSync(codexAgentPath, 'utf8')

  // Pattern: settledExisting → abortController.abort → clear timers → stopPoller → delete
  assert.match(
    source,
    /query collision[\s\S]*settledExisting\.abortController\?\.abort[\s\S]*stopCodexMetricsPoller[\s\S]*clearTimeout[\s\S]*codexSessions\.delete/,
    'expected old session timers to be cleared before codexSessions.delete on collision',
  )
})

test('CodeX duplicate query guard: rejects if session still running', () => {
  const source = fs.readFileSync(codexAgentPath, 'utf8')

  assert.match(
    source,
    /duplicate query ignored: session already running/,
    'expected guard against duplicate queries on running sessions',
  )
  assert.match(
    source,
    /isCodexSessionRunTerminal/,
    'expected isCodexSessionRunTerminal check before accepting new query',
  )
})

// ===========================================================================
// 3. Queued input delivery
// ===========================================================================

test('Claude queued input: uses streamInput() for existing running query', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(
    source,
    /existing\.query\.streamInput/,
    'expected streamInput() to feed queued input to running Claude query',
  )
})

test('CodeX queued input: codex-chat-continue handler exists', () => {
  const source = fs.readFileSync(codexAgentPath, 'utf8')

  assert.match(
    source,
    /ipcMain\.handle\(CODEX_CHANNELS\.CHAT_CONTINUE/,
    'expected codex-chat-continue IPC handler for queued input',
  )
})

// ===========================================================================
// 4. Done & cleanup ordering
// ===========================================================================

test('Claude done: finally block cleans up turn store and metrics poller', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(
    source,
    /finally[\s\S]*clearTimeout\(bootWatch\)[\s\S]*metricsPollers\.delete[\s\S]*clearCurrentTurn\(chatKey\)/,
    'expected metrics poller cleanup and turn store clear in finally block',
  )
})

test('Claude done: agentSessions.delete happens after done event emission', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  // The "finally 统一发送" comment and agentSessions.delete should appear near each other
  assert.match(
    source,
    /finally 统一发送[\s\S]*agentSessions\.delete\(chatKey\)/,
    'expected agent-done to be emitted in finally block, followed by session cleanup',
  )
})

test('CodeX done: finally block clears active session and timers', () => {
  const source = fs.readFileSync(codexAgentPath, 'utf8')

  assert.match(
    source,
    /codexSessions\.delete\(sessionId\)/,
    'expected codexSessions.delete in completion path',
  )
})
