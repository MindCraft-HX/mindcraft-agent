import assert from 'node:assert/strict'
import { shouldNotifyOnTaskDone } from '../packages/agent/src/components/agentCommon/utils/taskDoneNotification.mjs'

assert.equal(shouldNotifyOnTaskDone({
  ownerProjectId: 'proj-a',
  activeProjectId: 'proj-a',
  isPanelActive: true,
}), false)

assert.equal(shouldNotifyOnTaskDone({
  ownerProjectId: 'proj-a',
  activeProjectId: 'proj-b',
  isPanelActive: true,
}), true)

assert.equal(shouldNotifyOnTaskDone({
  ownerProjectId: 'proj-a',
  activeProjectId: 'proj-a',
  isPanelActive: false,
}), true)

assert.equal(shouldNotifyOnTaskDone({
  ownerProjectId: 'proj-a',
  activeProjectId: 'proj-b',
  isPanelActive: false,
}), true)

console.log('task done notification test passed')
