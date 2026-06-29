import assert from 'node:assert/strict'
import { parseTodoListPayload } from '../packages/agent/src/components/codeX/components/messages/tools/todoList.mjs'

const parsed = parseTodoListPayload(JSON.stringify({
  todos: [
    { id: 'a', content: '补充失败测试', status: 'pending' },
    { id: 'b', content: '统一消息内卡片视图', status: 'in_progress' },
    { id: 'c', content: '验证构建结果', status: 'completed' },
  ],
}))

assert.equal(parsed.isValid, true)
assert.equal(parsed.items.length, 3)
assert.equal(parsed.summary.total, 3)
assert.equal(parsed.summary.pending, 1)
assert.equal(parsed.summary.inProgress, 1)
assert.equal(parsed.summary.completed, 1)
assert.equal(parsed.currentItem?.content, '统一消息内卡片视图')

const fallbackFields = parseTodoListPayload(JSON.stringify({
  todos: [
    { text: '兼容 text 字段', completed: true },
  ],
}))

assert.equal(fallbackFields.isValid, true)
assert.equal(fallbackFields.items[0].content, '兼容 text 字段')
assert.equal(fallbackFields.items[0].status, 'completed')

const invalid = parseTodoListPayload('not-json')
assert.equal(invalid.isValid, false)
assert.equal(invalid.items.length, 0)

console.log('todo-list parser test passed')
