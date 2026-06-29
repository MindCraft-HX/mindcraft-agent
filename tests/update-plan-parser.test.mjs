import assert from 'node:assert/strict'
import { parseUpdatePlanPayload } from '../packages/agent/src/components/codeX/components/messages/tools/updatePlan.mjs'

const validPayload = JSON.stringify({
  explanation: '按方案A直接实施，先改后台输入，再改前台分组排序，最后做构建验证',
  plan: [
    { step: '修改后台文档管理页与编辑页，允许自由新增group', status: 'in_progress' },
    { step: '修改前台文档首页分组排序，兼容新group稳定展示', status: 'pending' },
    { step: '运行前后台验证命令，确认无构建或类型回归', status: 'completed' },
  ],
})

const parsed = parseUpdatePlanPayload(validPayload)

assert.equal(parsed.isValid, true)
assert.equal(parsed.explanation, '按方案A直接实施，先改后台输入，再改前台分组排序，最后做构建验证')
assert.equal(parsed.steps.length, 3)
assert.deepEqual(parsed.steps.map(step => step.status), ['in_progress', 'pending', 'completed'])
assert.equal(parsed.summary.total, 3)
assert.equal(parsed.summary.inProgress, 1)
assert.equal(parsed.summary.completed, 1)
assert.equal(parsed.summary.pending, 1)

const invalidPayload = parseUpdatePlanPayload('not json')
assert.equal(invalidPayload.isValid, false)
assert.equal(invalidPayload.steps.length, 0)

console.log('update-plan parser test passed')
