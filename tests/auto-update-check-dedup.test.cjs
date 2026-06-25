const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const updaterSource = fs.readFileSync(path.join(root, 'electron/mainModules/autoUpdate.js'), 'utf8')
const diagnosticsSource = fs.readFileSync(path.join(root, 'packages/agent/electron/diagnosticsFileUtils.js'), 'utf8')
const turnDiagnosticsSource = fs.readFileSync(path.join(root, 'packages/agent/electron/codex/turnDiagnostics.js'), 'utf8')

assert.match(
  updaterSource,
  /let\s+updateCheckInFlight\s*=\s*false/,
  'auto updater should track whether a real check is already in flight'
)

assert.match(
  updaterSource,
  /if\s*\(\s*updateCheckInFlight\s*\)\s*\{[\s\S]*return\s*\{\s*ok:\s*true,\s*checkId:\s*activeCheckId,\s*reused:\s*true\s*\}/,
  'manual checks should reuse the in-flight check instead of starting a second real updater request'
)

assert.match(
  updaterSource,
  /function\s+finishCheck\s*\([\s\S]*updateCheckInFlight\s*=\s*false[\s\S]*sendStatus\(win,\s*markChecked\(status,\s*checkId\)\)/,
  'completing a check should clear the in-flight flag and preserve the originating checkId'
)

assert.match(
  diagnosticsSource,
  /function\s+shouldWriteDiagnostics\s*\([\s\S]*respectDiagnosticsToggle\s*!==\s*true[\s\S]*return\s+true/,
  'diagnostics toggle should only apply to explicit opt-in writes'
)

assert.match(
  turnDiagnosticsSource,
  /respectDiagnosticsToggle:\s*true/,
  'codex turn diagnostics should explicitly opt in to the diagnostics toggle'
)

console.log('auto update check dedup tests passed')
