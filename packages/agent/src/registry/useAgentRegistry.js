/**
 * useAgentRegistry — Vue Composable
 *
 * 合并 agentRegistry（纯数据）和 agentRegistryComponents（Vue 组件），
 * 提供响应式 Agent 列表及辅助函数，供 CodeHub、SharedSettings、AgentPicker 使用。
 */

import { computed } from 'vue'
import { AGENT_DEFINITIONS, getAgent, getAgentKeys } from './agentRegistry.js'
import { AGENT_COMPONENTS } from './agentRegistryComponents.js'

export function useAgentRegistry() {
  /**
   * 合并后的完整 Agent 列表（响应式）
   * 每个条目包含数据定义 + Vue 组件引用
   */
  const agents = computed(() =>
    AGENT_DEFINITIONS.map((def) => ({
      ...def,
      component: AGENT_COMPONENTS[def.key]?.panel ?? null,
      settingsComponent: AGENT_COMPONENTS[def.key]?.settings ?? null,
    }))
  )

  /** 所有已注册 Agent 的 key 列表 */
  const agentKeys = computed(() => agents.value.map((a) => a.key))

  /**
   * 获取 Agent 的 UI 元信息（用于 Tab 图标、颜色、名称）
   * @param {string} key
   * @returns {{ iconClass: string, iconStyle: object, name: string, description: string }}
   */
  function getAgentMeta(key) {
    const def = getAgent(key)
    if (!def) {
      return { iconClass: '', iconStyle: {}, name: key, description: '' }
    }
    return {
      iconClass: def.iconClass,
      iconStyle: { ...def.iconStyle },
      name: def.name,
      description: def.description,
    }
  }

  /**
   * 检查 key 是否已注册
   * @param {string} key
   * @returns {boolean}
   */
  function isRegistered(key) {
    return !!getAgent(key)
  }

  /**
   * 创建 mountedMap 初始值 — 所有已注册 Agent 默认 false
   * @param {string[]} initialKeys - 需要初始挂载的 Agent key 列表
   * @returns {object}
   */
  function createMountedMap(initialKeys = []) {
    const map = {}
    for (const k of getAgentKeys()) {
      map[k] = initialKeys.includes(k)
    }
    return map
  }

  return {
    agents,
    agentKeys,
    getAgent,
    getAgentMeta,
    isRegistered,
    createMountedMap,
  }
}
