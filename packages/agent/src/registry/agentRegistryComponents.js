/**
 * Agent 组件注册表 — 集中管理所有 Agent 的 Vue 组件引用
 *
 * Panel 组件使用 defineAsyncComponent 按需加载（体积大，避免拖入 SharedSettings chunk）。
 * Settings 组件使用静态 import（体积小，SharedSettings 打开时需立即可用，async 会导致 openSettings() 竞态）。
 *
 * 仅由 useAgentRegistry.js composable 消费。
 * 与 agentRegistry.js（纯数据）分离，使 router / test 可安全引用数据层。
 */

import { defineAsyncComponent } from 'vue'
import ClaudeAPISetting from '../components/claudeCode/components/APISetting.vue'
import CodexAPISetting from '../components/codeX/components/APISetting.vue'

export const AGENT_COMPONENTS = {
  claudeCode: {
    panel: defineAsyncComponent(() => import('../components/claudeCode/index.vue')),
    settings: ClaudeAPISetting,
  },
  codex: {
    panel: defineAsyncComponent(() => import('../components/codeX/index.vue')),
    settings: CodexAPISetting,
  },
}
