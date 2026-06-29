import assert from 'node:assert/strict'
import test from 'node:test'
import { useInputHistory } from '../packages/agent/src/components/agentCommon/composables/useInputHistory.js'

function makeEvent(key) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
  }
}

function makeTextarea(value = '') {
  return {
    value,
    selectionStart: value.length,
  }
}

test('input history keeps newest sent prompts first and caps at five', () => {
  const { pushToHistory } = useInputHistory()
  const history = []

  pushToHistory('first', history)
  pushToHistory('first', history)
  pushToHistory('second', history)
  pushToHistory('third', history)
  pushToHistory('fourth', history)
  pushToHistory('fifth', history)
  pushToHistory('sixth', history)

  assert.deepEqual(history, ['sixth', 'fifth', 'fourth', 'third', 'second'])
})

test('ArrowUp recalls recent history and ArrowDown restores the draft', () => {
  const { handleHistoryKeydown, pushToHistory } = useInputHistory()
  const history = []
  pushToHistory('first prompt', history)
  pushToHistory('second prompt', history)

  const el = makeTextarea('draft text')
  const onUpdate = (value) => {
    el.value = value
    el.selectionStart = value.length
  }

  const up1 = makeEvent('ArrowUp')
  assert.equal(handleHistoryKeydown(up1, el, history, onUpdate), true)
  assert.equal(up1.defaultPrevented, true)
  assert.equal(el.value, 'second prompt')

  const up2 = makeEvent('ArrowUp')
  assert.equal(handleHistoryKeydown(up2, el, history, onUpdate), true)
  assert.equal(el.value, 'first prompt')

  const down1 = makeEvent('ArrowDown')
  assert.equal(handleHistoryKeydown(down1, el, history, onUpdate), true)
  assert.equal(el.value, 'second prompt')

  const down2 = makeEvent('ArrowDown')
  assert.equal(handleHistoryKeydown(down2, el, history, onUpdate), true)
  assert.equal(el.value, 'draft text')
})

test('ArrowUp keeps native movement when cursor is not on first line', () => {
  const { handleHistoryKeydown, pushToHistory } = useInputHistory()
  const history = []
  pushToHistory('old prompt', history)

  const el = {
    value: 'line one\nline two',
    selectionStart: 'line one\nline'.length,
  }
  const e = makeEvent('ArrowUp')

  assert.equal(handleHistoryKeydown(e, el, history, () => {}), false)
  assert.equal(e.defaultPrevented, false)
})
