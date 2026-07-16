# T184 CodeHub SessionIndex Phase 1/2 交接文档

> 日期：2026-07-05
> 状态：Phase 1-3 已完成；本文保留实现边界和验收记录。
> 范围：CodeHub 顶部统一 tab 的轻量索引层。第一版只做被动 `SessionIndex`，保留 eager mount，不启用 lazy mount。

## 1. 背景

当前 CodeHub 顶部统一 tab 仍然依赖已挂载 provider panel 暴露的 `projectTabData`：

```text
CodeHub unifiedTabs
  -> mounted ClaudeCode panel projectTabData
  -> mounted CodeX panel projectTabData
```

`packages/agent/src/components/codeHub/index.vue` 里仍保留这条边界说明：

```js
// 统一 Tab 目前依赖各 Agent panel 暴露的 projectTabData；未挂载的 panel 不会执行 loadHistory。
// 在 CodeHub 级 session index 独立出来前，启动时必须挂载所有已注册 Agent，避免冷启动丢失历史 Tab。
const mountedMap = reactive(createMountedMap(agentKeys.value))
```

这条耦合已经造成两个可见问题：

- CodeHub 冷启动必须挂载 ClaudeCode + CodeX 两套 panel，顶部 tab/icon 出现时间受最慢 provider 初始化影响。
- 后续如果再次尝试 lazy mount，会重新触发“未挂载 provider 的历史 tab 消失”问题。

最近 T169-T183 已经完成多个前置收口：

- `projectTabData` 已瘦身为 lightweight summary，禁止把完整 `project/chats/messages` 传给 CodeHub。
- CodeHub 切 tab 不再同步触发 full session scan。
- session scan cache、registry read cache、activation chain、draft cache 和 metrics 后台化已收口。
- cache hit 路径禁止写 registry 的规则已写入缓存治理文档。

本轮以 **被动索引 + eager mount** 为边界，不启用 lazy mount。

## 2. 本轮目标

新增 CodeHub 级别的轻量 `SessionIndex`，让顶部 tab 的初始存在性不再依赖 provider panel ready。

第一版预期行为：

- CodeHub 进入后可以先从 MindCraft 自有状态恢复 ClaudeCode / CodeX 项目 tab 摘要。
- Codex tab/icon 可以在 Codex panel 完整初始化前出现。
- provider panel ready 后，用 `projectTabData` patch index，刷新 running/pending/notification 等运行时摘要。
- 当前 eager mount 继续保留，作为安全回滚点。

## 3. 明确不做

- 不启用 lazy mount。
- 不改 provider panel 的完整历史恢复、stream、scan、done、abort 语义。
- 不改 session registry schema。
- 不扫官方 JSONL，不解析完整 messages。
- 不写 `~/.claude` / `~/.codex` / 官方 transcript sidecar。
- 不把 scroll、metrics current turn、draft 热路径状态塞进 `SessionIndex`。
- 不把 ClaudeCode 和 CodeX 同 cwd 项目合并；继续用 `agentType + projectId` 做 tab key。

## 4. 数据来源

`SessionIndex` 只能读取 MindCraft 自有数据：

```text
{userData}/claude-panel-state.json
{userData}/codex-panel-state.json
{userData}/session-registry/
```

允许读取 session registry 的 index/records 做标题、cwd、provider binding 补充，但第一版 loader 必须是只读：

- 不 repair registry。
- 不 backfill registry。
- 不触发 provider scan。
- 不基于 cache hit 写 panel-state 或 registry。

如果现有 helper 默认会写，需要新增只读 helper 或在 loader 内直接读文件摘要。

## 5. 建议数据模型

Renderer 侧统一 tab item：

```js
{
  id: 'codex:project-1',
  projectId: 'project-1',
  agentType: 'codex',
  name: 'mindcraft-agent',
  cwd: 'D:/...',
  cwdLocked: true,
  runningCount: 0,
  hasPendingTool: false,
  hasDoneNotification: false,
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  source: 'panel-state' | 'session-registry' | 'runtime',
}
```

规则：

- `id = agentType + ':' + projectId`，继续作为 `codehub_tab_order` 的稳定 key。
- `projectId` 沿用 provider panel 内部项目 ID。
- `source='runtime'` 的字段可以覆盖旧摘要，但不能因为一次空 runtime update 删除旧 tab。
- 删除必须走显式 delete 事件，不能用空列表推断删除。

## 6. 实施步骤

### Phase 1：主进程只读 loader

新增 IPC，例如：

```text
agent-load-codehub-session-index
```

建议接线位置：

- channel 常量：`packages/agent/shared/ipcChannels.js` 的 `CORE_CHANNELS`
- main handler：新增 `packages/agent/electron/codehubSessionIndex.js`，由 `packages/agent/electron/index.js` 注册
- preload bridge：`packages/agent/preload/index.js`

返回结构建议：

```js
{
  ok: true,
  tabs: [],
  warnings: [],
}
```

loader 只做：

- 读取 ClaudeCode / CodeX panel-state 的 projects 摘要。
- 读取 session-registry 做缺失字段补充。
- 对输出字段做白名单过滤。
- 跳过损坏记录并写 `warnings`，不要 throw 到 renderer 导致 CodeHub 空白。

### Phase 2：renderer `useSessionIndex`

新增：

```text
packages/agent/src/components/codeHub/useSessionIndex.mjs
```

职责：

- 加载初始 index tabs。
- 暴露排序后的 `unifiedTabs`。
- 复用 `codehub_tab_order` / `codehub_active_tab` 现有语义。
- 接收 provider runtime patch。
- 显式 delete 才删除 tab。

建议 API：

```js
const {
  indexReady,
  tabs,
  orderedTabs,
  patchRuntimeProjects,
  deleteProjectTab,
  reloadIndex,
} = useSessionIndex({ agentKeys, getAgentMeta, tabOrder })
```

### Phase 3：CodeHub 接入但保留 eager mount

`codeHub/index.vue` 第一版只改 tab 来源：

```text
before:
  unifiedTabs = collect mounted panel projectTabData

after:
  unifiedTabs = sessionIndex orderedTabs
  mounted panel projectTabData -> patchRuntimeProjects(agentType, projects)
```

保留：

```js
const mountedMap = reactive(createMountedMap(agentKeys.value))
```

也就是说 provider panel 仍然全部挂载。这个阶段不是为了少 mount，而是为了证明：

- index tab 和旧 `projectTabData` 行为一致。
- tab 可以在 provider ready 前出现。
- runtime patch 不会误删其他 provider 的 tab。

## 7. 合并优先级

必须按以下优先级处理同一个 tab：

```text
显式 delete > runtime project present > persisted index
```

具体规则：

- `deleteProjectTab(agentType, projectId)`：立即从 index 删除，并调用 provider 原有 `deleteProject` 路径。
- runtime patch 中出现某 project：更新该 tab 的 name/cwd/running/pending/notification/updatedAt。
- runtime patch 为空：只代表 provider 当前尚未恢复或没有发布摘要，不能删除已有 index tabs。
- runtime patch 只包含 CodeX：不能替换掉 ClaudeCode tabs。
- persisted index 缺少 running/pending：默认 0/false，后续由 runtime patch 刷新。

## 8. Active Tab 恢复规则

保留现有 `restoreActiveTab()` 的产品语义：

- `projectId + agent` query 是强指令，优先。
- 单独 `projectId` query 次优先。
- `codehub_active_tab` 是普通进入 CodeHub 时的恢复来源。
- 只有 `?agent=codex` / `?agent=claudeCode` 时，按当前产品语义处理，不在本任务顺手改。

如果实现时发现现有 `pickInitialCodeHubTab()` 与 index 接入冲突，单独补测试，不要混进 lazy mount。

## 9. 测试清单

第一版必须补自动化测试，优先纯函数 / composable / main loader 单元测试：

- loader 不解析 JSONL，只从 panel-state / session-registry 返回 lightweight tabs。
- provider panel 未 ready 时，index 仍能返回 ClaudeCode 和 CodeX tabs。
- `codehub_active_tab=codex:project-x` 能从 index tabs 中恢复。
- runtime patch 为空时，不删除 persisted tabs。
- CodeX runtime patch 更新 `runningCount` 时，不替换 ClaudeCode tabs。
- 显式 delete 后，tab 从 index 删除。
- `tabOrder` reconcile 不剪掉未 ready provider 的 tabs。
- 损坏 panel-state 不导致整个 index load 失败，只返回 warnings。

建议新增文件：

```text
tests/codehub-session-index-loader.test.cjs
tests/codehub-session-index-merge.test.mjs
```

如项目已有更合适的 `packages/agent/...*.test.js` 位置，可按现有习惯放置。

## 10. 人工验收

dev 环境至少验证：

- 同时存在 ClaudeCode 和 CodeX 历史时，冷启动 CodeHub，顶部两个 provider 的 tab/icon 都能尽早出现。
- 保存 active CodeX tab 后重启，仍恢复到 CodeX tab。
- CodeX panel 慢加载时，CodeX tab 不消失、不闪成空状态。
- 删除 CodeX 项目 tab 后重启，不复活。
- CodeX 任务运行中切到 ClaudeCode，running / done notification 后续仍能通过 runtime patch 更新。
- 没有任何历史项目时，仍正常出现 agent picker / empty overlay。

## 11. 回滚点

第一版必须保留两个回滚点：

1. 如果 index 行为异常，可以让 `unifiedTabs` 临时回退到旧的 `collectTabs(panel.projectTabData)`。
2. 如果后续 Phase 4 lazy mount 异常，只回滚 lazy mount，不回滚被动 `SessionIndex`。

本任务交付时不允许删除旧 `collectTabs()` 路径，可以保留为 dev fallback 或短期注释明确的回滚实现。

## 12. 开发禁区

- 不要在 loader 里调用 `claudeScanProjectsSessions` / `codexScanProjectsSessions` / provider full scan。
- 不要在 loader 里调用会 mutate registry 的 helper。
- 不要因为 runtime patch 为空清空 index。
- 不要把完整 project 对象 spread 到 unified tabs。
- 不要让 index 读取或持久化 messages、metrics current turn、draft。
- 不要顺手清理 CodeHub 的 route/active tab 旧逻辑，除非测试证明必须改。
- 不要和 streaming render、metrics、provider storage、cache governance 混成一个提交。

## 13. 交付建议

建议拆成 3 个提交：

1. `feat: add readonly codehub session index loader`
2. `feat: add codehub session index renderer merge layer`
3. `test: cover codehub session index merge semantics`

每个提交后至少跑相关测试；最终跑：

```text
npm run test:contract
npm test -- tests/codehub-session-index-loader.test.cjs tests/codehub-session-index-merge.test.mjs
```

如果新增测试路径不同，以实际路径为准。
