'use strict'

/**
 * main 侧 authorized workspace registry。
 *
 * 设计约束（docs/workbench-split-and-terminal.md）：
 * - workspaceKey → 真实 cwd 的授权表只存在于 main；renderer 自报的
 *   workspaceKey 只有在本表中注册过才被视为已授权（终端/文档共享的
 *   安全前提，Phase 4 终端 broker 也依赖它解析 workspaceKey → cwd）。
 * - workspaceKey 由 workspaceKey.cjs 的同一契约构造，renderer/main 一致。
 * - realpath 与注册时间可注入，便于确定性测试。
 *
 * 本模块是纯注册表：不持有 watcher、不做 IPC。接线（openProject 时注册、
 * 终端/文档通道校验授权）属于后续边界。
 */

const fs = require('fs')
const { workspaceKeyFromCwd } = require('./workspaceKey.cjs')

const MAX_WORKSPACES = 100
const MAX_LABEL_LENGTH = 256
const MAX_SOURCE_LENGTH = 128

function boundedString(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : ''
}

function createWorkspaceRegistry({
  realpath = p => fs.realpathSync.native(p),
  now = () => Date.now(),
} = {}) {
  // Map 保持插入序：最近注册的排在最后，超限时驱逐最旧。
  const entries = new Map()

  function registerWorkspace(input = {}) {
    const { cwd, label = '', source = 'unknown' } = input || {}
    const workspaceKey = workspaceKeyFromCwd(cwd)
    if (!workspaceKey) return null
    let resolvedRealpath = ''
    try {
      resolvedRealpath = String(realpath(String(cwd)) || '')
    } catch {
      resolvedRealpath = ''
    }
    // upsert：先删再插以刷新插入序（LRU 语义）
    if (entries.has(workspaceKey)) entries.delete(workspaceKey)
    const entry = {
      workspaceKey,
      cwd: String(cwd),
      realpath: resolvedRealpath,
      label: boundedString(label, MAX_LABEL_LENGTH),
      source: boundedString(source, MAX_SOURCE_LENGTH) || 'unknown',
      registeredAt: now(),
    }
    entries.set(workspaceKey, entry)
    while (entries.size > MAX_WORKSPACES) {
      entries.delete(entries.keys().next().value)
    }
    return { ...entry }
  }

  function resolveWorkspace(workspaceKey) {
    const entry = entries.get(String(workspaceKey || ''))
    return entry ? { ...entry } : null
  }

  function isAuthorized(workspaceKey) {
    return entries.has(String(workspaceKey || ''))
  }

  function revokeWorkspace(workspaceKey) {
    return entries.delete(String(workspaceKey || ''))
  }

  function listWorkspaces() {
    return [...entries.values()].map(entry => ({ ...entry }))
  }

  function clear() {
    entries.clear()
  }

  return {
    registerWorkspace,
    resolveWorkspace,
    isAuthorized,
    revokeWorkspace,
    listWorkspaces,
    clear,
  }
}

module.exports = { createWorkspaceRegistry, MAX_WORKSPACES }
