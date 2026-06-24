/**
 * Agent Client — UI 层访问 Agent Runtime 的统一入口
 *
 * 封装 transport 差异（IPC / WebSocket / Mock），
 * UI 组件不应直接调用 window.electronAPI.* 或 websocket。
 *
 * 第一阶段：只提供接口定义和 Mock transport，不接真实 IPC。
 * PR 4 将实现 IpcAgentTransport 包装现有 API。
 */

import { AgentCommand, buildAgentCommand } from './agentProtocol.mjs'

/**
 * Transport 接口（鸭子类型，不需要 class inherit）
 *
 * Transport 必须实现：
 *   send(commandEnvelope) → Promise<response>
 *   onEvent(callback) → unsubscribe function
 *
 * @typedef {object} AgentTransport
 */

/**
 * @typedef {object} AgentClient
 * @property {(command: object) => Promise<any>} sendCommand
 * @property {(callback: (event: object) => void) => () => void} onEvent
 * @property {(opts: {agent: string, chatKey: string, runId?: string}) => Promise<any>} abortRun
 */

/**
 * @param {AgentTransport} transport
 * @returns {AgentClient}
 */
export function createAgentClient(transport) {
  if (!transport || typeof transport.send !== 'function' || typeof transport.onEvent !== 'function') {
    throw new Error('AgentClient requires a transport with send() and onEvent() methods')
  }

  return {
    sendCommand(command) {
      return transport.send(command)
    },

    onEvent(callback) {
      return transport.onEvent(callback)
    },

    async abortRun({ agent, chatKey, runId }) {
      return transport.send(buildAgentCommand({
        agent,
        command: AgentCommand.RUN_ABORT,
        chatKey,
        runId,
        payload: {},
      }))
    },
  }
}

// ── Mock Transport（用于测试和开发） ──

/**
 * 创建 Mock transport，可手动注入事件和记录已发送 command
 *
 * @returns {{ transport: AgentTransport, emit: (event: object) => void, sentCommands: object[] }}
 */
export function createMockAgentTransport() {
  const listeners = new Set()
  const sentCommands = []

  const transport = {
    send(command) {
      sentCommands.push(command)
      return Promise.resolve({ accepted: true })
    },
    onEvent(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }

  return {
    transport,
    emit(event) {
      for (const cb of listeners) {
        try { cb(event) } catch (_) { /* fire-and-forget */ }
      }
    },
    sentCommands,
  }
}
