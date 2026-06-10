/**
 * Agent 组件注册表 — 集中管理所有 Agent 的 Vue 组件引用
 *
 * 此文件包含 Vue SFC 导入，仅由 useAgentRegistry.js composable 消费。
 * 与 agentRegistry.js（纯数据）分离，使 router / test 可安全引用数据层。
 */

import ClaudeCodePanel from '../components/claudeCode/index.vue'
import CodexPanel from '../components/codeX/index.vue'
import ClaudeAPISetting from '../components/claudeCode/components/APISetting.vue'
import CodexAPISetting from '../components/codeX/components/APISetting.vue'

export const AGENT_COMPONENTS = {
  claudeCode: { panel: ClaudeCodePanel, settings: ClaudeAPISetting },
  codex: { panel: CodexPanel, settings: CodexAPISetting },
}
