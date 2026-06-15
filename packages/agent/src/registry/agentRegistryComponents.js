/**
 * Agent 组件注册表 — 集中管理所有 Agent 的 Vue 组件引用
 *
 * 使用 defineAsyncComponent + 动态 import() 按需加载，
 * 避免 Vite 把所有 Agent 组件树拖入 SharedSettings 共享 chunk。
 *
 * defineAsyncComponent 返回组件定义对象（非裸函数），
 * 经过 computed/reactive 代理后 Vue :is 仍能正确识别。
 *
 * 仅由 useAgentRegistry.js composable 消费。
 * 与 agentRegistry.js（纯数据）分离，使 router / test 可安全引用数据层。
 */

import { defineAsyncComponent } from 'vue'

export const AGENT_COMPONENTS = {
  claudeCode: {
    panel: defineAsyncComponent(() => import('../components/claudeCode/index.vue')),
    settings: defineAsyncComponent(() => import('../components/claudeCode/components/APISetting.vue')),
  },
  codex: {
    panel: defineAsyncComponent(() => import('../components/codeX/index.vue')),
    settings: defineAsyncComponent(() => import('../components/codeX/components/APISetting.vue')),
  },
}
