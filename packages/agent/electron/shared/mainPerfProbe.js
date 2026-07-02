/**
 * 主进程 IPC perf 探针 — T171
 *
 * 启用：process.env.MCPF_PERF === '1'
 * 零开销：未启用时返回 NOOP，不做任何计算
 *
 * 用法：
 *   const stop = perfStartIpc('channel-name', { field: val })
 *   // ... handler 逻辑 ...
 *   stop({ moreFields: val })  // 所有出口都要调
 */

const NOOP = () => {}

function isEnabled() {
  return process.env.MCPF_PERF === '1'
}

/**
 * 启动 IPC handler 计时。
 * @param {string} channel - IPC channel 名称
 * @param {object} [meta] - 入口附加字段（只取 number 值）
 * @returns {function} stop(extraMeta?) — 在所有出口调用
 */
function perfStartIpc(channel, meta = {}) {
  if (!isEnabled()) return NOOP
  const t0 = Date.now()
  return (extraMeta = {}) => {
    const elapsed = Date.now() - t0
    const parts = [`[perf:ipc] ${channel} total=${elapsed}ms`]
    for (const [k, v] of Object.entries({ ...meta, ...extraMeta })) {
      if (typeof v === 'number') parts.push(`${k}=${v}`)
    }
    console.info(parts.join(' '))
  }
}

module.exports = { perfStartIpc }
