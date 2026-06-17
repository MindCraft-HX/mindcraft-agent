const VALID_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh'])

export function normalizeCodexReasoningEffort(value) {
  const effort = String(value || '').trim().toLowerCase()
  if (!effort) return ''
  if (effort === 'extra_high' || effort === 'max') return 'xhigh'
  return VALID_REASONING_EFFORTS.has(effort) ? effort : ''
}
