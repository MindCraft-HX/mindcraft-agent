function shouldStopTurnTimeoutOnEvent(eventType) {
  // A logical terminal event can precede external CLI process closure.
  // The owner clears the watchdog only after the transport has actually ended.
  void eventType
  return false
}

module.exports = {
  shouldStopTurnTimeoutOnEvent,
}
