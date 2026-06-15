const assert = require('assert')
const fs = require('fs')
const path = require('path')

const sourcePath = path.join(__dirname, '..', 'packages', 'agent', 'src', 'components', 'claudeCode', 'index.vue')
const source = fs.readFileSync(sourcePath, 'utf8')

assert.match(
  source,
  /function normalizeSessionEventsToUiMessages\(rawData,\s*\{\s*recoverDanglingTools\s*=\s*false\s*\}\s*=\s*\{\s*\}\)/,
  'session event normalization should default dangling recovery off'
)

assert.match(
  source,
  /function normalizeFlatSessionMessagesToUiMessages\(rawData,\s*\{\s*recoverDanglingTools\s*=\s*false\s*\}\s*=\s*\{\s*\}\)/,
  'flat message normalization should default dangling recovery off'
)

assert.match(
  source,
  /normalizeFlatSessionMessagesToUiMessages\(rawData\.messages,\s*\{\s*recoverDanglingTools:\s*true\s*\}\)/,
  'initial disk restore should explicitly enable dangling tool recovery for flat messages'
)

assert.match(
  source,
  /normalizeSessionEventsToUiMessages\(rawData\.messages,\s*\{\s*recoverDanglingTools:\s*true\s*\}\)/,
  'initial disk restore should explicitly enable dangling tool recovery for session events'
)

assert.match(
  source,
  /normalizeFlatSessionMessagesToUiMessages\(rawData\.messages,\s*\{\s*recoverDanglingTools:\s*false\s*\}\)/,
  'history pagination should explicitly disable dangling tool recovery for flat messages'
)

assert.match(
  source,
  /normalizeSessionEventsToUiMessages\(rawData\.messages,\s*\{\s*recoverDanglingTools:\s*false\s*\}\)/,
  'history pagination should explicitly disable dangling tool recovery for session events'
)

console.log('claude dangling recovery scope test passed')
