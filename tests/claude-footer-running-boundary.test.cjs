const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const claudeIndexPath = path.join(repoRoot, 'packages/agent/src/components/claudeCode/index.vue')

test('claude active-tab watcher resyncs footer running state when thinking changes', () => {
  const source = fs.readFileSync(claudeIndexPath, 'utf8')

  assert.match(
    source,
    /watch\(\s*\(\)\s*=>\s*\(\{\s*[\s\S]*thinking:\s*Boolean\(activeTab\.value\?\.thinking\),[\s\S]*thinkingStart:\s*activeTab\.value\?\._thinkingStart\s*\|\|\s*0,[\s\S]*\}\),[\s\S]*syncMetricsTimerForClaudeTab\(tab\)[\s\S]*syncActiveMetricsFromTab\(tab,\s*\{[\s\S]*model:\s*getClaudeTabModel\(tab\),[\s\S]*compacting:\s*!!tab\?\._compacting,[\s\S]*\}\)[\s\S]*refreshMetricsForChat\(tab,\s*'active-tab-state-watch'\)/,
    'expected Claude active-tab state watcher to resync footer metrics/timer when run state changes',
  )
})
