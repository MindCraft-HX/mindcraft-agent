function shouldStopTurnTimeoutOnEvent(eventType) {
  return eventType === 'turn.completed'
    || eventType === 'turn.failed'
    || eventType === 'task_complete'
}

module.exports = {
  shouldStopTurnTimeoutOnEvent,
}
