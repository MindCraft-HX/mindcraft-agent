function toTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? time : 0
  }
  return 0
}

export function compareChatsByRecency(a = {}, b = {}) {
  const timeA = toTime(a.updatedAt || a.createdAt)
  const timeB = toTime(b.updatedAt || b.createdAt)
  return timeB - timeA
}

export function sortChatsByRecencyInPlace(chats = []) {
  return chats.sort(compareChatsByRecency)
}
