/**
 * Agent 组件注册表 — 集中管理所有 Agent 的 Vue 组件引用
 *
 * 使用动态 import() 按需加载，避免 Vite 把所有 Agent 组件树
 * 拖入 SharedSettings 共享 chunk（曾导致 428KB chunk 膨胀）。
 *
 * Vue <component :is> 原生支持 () => import(...) 返回的异步组件，
 * 无需修改任何调用方代码。
 *
 * 仅由 useAgentRegistry.js composable 消费。
 * 与 agentRegistry.js（纯数据）分离，使 router / test 可安全引用数据层。
 */

export const AGENT_COMPONENTS = {
  claudeCode: {
    panel: () => import('../components/claudeCode/index.vue'),
    settings: () => import('../components/claudeCode/components/APISetting.vue'),
  },
  codex: {
    panel: () => import('../components/codeX/index.vue'),
    settings: () => import('../components/codeX/components/APISetting.vue'),
  },
}
