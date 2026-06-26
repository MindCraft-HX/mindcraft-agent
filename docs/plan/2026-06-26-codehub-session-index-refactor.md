# CodeHub SessionIndex 正式重构方案

> 日期：2026-06-26
> 状态：方案评估
> 关联短期修复：`6731bb5 fix: restore codehub cold-start agent tabs`

## 1. 当前问题

CodeHub 顶部统一 Tab 当前不是自己恢复历史，而是从已经挂载的 provider 面板里读取项目摘要：

```text
CodeHub unifiedTabs
  -> 已挂载 ClaudeCode panel 的 projectTabData
  -> 已挂载 CodeX panel 的 projectTabData
```

这里混在了一起的其实是两类职责：

- 会话 / 项目 Tab 的索引恢复
- provider 面板的完整渲染、历史加载、运行时初始化

2026-06-25 的启动性能优化把 CodeHub 改成只挂载路由请求的 Agent。这个改动本意是减少首屏工作量，但破坏了上面的隐含契约：CodeX panel 没有挂载，就不会执行 `loadHistory()`，CodeX 项目也就不会进入 `unifiedTabs`。用户手动选择 CodeX 后历史立即出现，说明数据没有丢，丢的是冷启动索引恢复。

短期修复已经恢复为启动时挂载全部已注册 Agent。这个修复稳定，但仍然保留了架构耦合。

## 2. 目标架构

引入 CodeHub 级别的轻量 `SessionIndex`，让统一 Tab 的存在不再依赖 provider panel 是否已经 mount。

```text
主进程 / preload
  -> 读取 panel-state / session-registry 摘要
  -> 返回轻量项目 Tab 列表

CodeHub SessionIndex
  -> 持有统一项目 Tab 列表
  -> 持有 active unified tab id
  -> 持有 tab order reconcile 逻辑
  -> 持有通知 / running / pending 的摘要状态

Provider panels
  -> 按需 mount
  -> 自己恢复完整 project/chat/runtime 状态
  -> 把运行时摘要 patch 回 SessionIndex
```

核心边界：CodeHub 负责导航索引，provider panel 负责完整会话 UI 和流式运行时。

## 3. 架构原则

- `SessionIndex` 只能是轻量索引，冷启动不能解析完整 JSONL 消息。
- provider panel 是否 mount，不能决定项目 Tab 是否存在。
- 会话身份仍沿用 `chatKey -> providerSessionId -> filePath`，这次重构不改 registry schema。
- MindCraft 自有数据仍只放 `userData` / `session-registry`，不得向 `~/.claude` / `~/.codex` 新写 sidecar。
- provider panel 仍是流式消息、pending tool、queued input、具体 chat UI 状态的权威来源。
- CodeHub 启动时可以展示“安全的旧摘要”，等 provider panel mount 后再用 runtime patch 刷新。

## 4. 建议数据模型

```js
{
  agentType: 'claudeCode' | 'codex',
  projectId: 'proj-1',
  tabId: 'codex:proj-1',
  name: 'mindcraft-agent',
  cwd: 'D:/...',
  cwdLocked: true,
  hasDoneNotification: false,
  runningCount: 0,
  hasPendingTool: false,
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  source: 'panel-state' | 'session-registry' | 'runtime',
}
```

规则：

- `tabId = agentType + ':' + projectId` 保持不变，继续作为 CodeHub tab order 的稳定 key。
- `projectId` 暂时仍是 provider panel 内部项目 ID。本轮不要按 cwd 合并 ClaudeCode 和 CodeX 项目。
- `source='runtime'` 可以覆盖摘要字段，但不能因为一次空 runtime 更新就删除 panel-state / registry 里仍存在的项目。
- 删除必须走显式 delete 事件，不能用“当前列表为空”推断删除。

## 5. 分阶段实施

### Phase 0：保留当前稳定修复

保留 `6731bb5` 的 eager mounting 行为，直到 `SessionIndex` 有实现、有测试、有人工验证。不要在索引完成前再次启用懒挂载。

### Phase 1：新增主进程轻量摘要 loader

新增一个轻量 IPC，例如：

```text
agent-load-codehub-session-index
```

它读取已有 MindCraft 自有状态，返回所有已注册 Agent 的项目摘要：

- `{userData}/claude-panel-state.json`
- `{userData}/codex-panel-state.json`
- `{userData}/session-registry/`

允许复用现有 registry restore/backfill helper，但不能触发 provider 官方 transcript 的全量扫描，不能解析完整 JSONL 消息。

### Phase 2：新增 CodeHub `useSessionIndex`

新增 renderer composable：

```text
packages/agent/src/components/codeHub/useSessionIndex.mjs
```

职责：

- 加载初始摘要
- 暴露排序后的 `unifiedTabs`
- 保留 `codehub_tab_order`
- 保留 `codehub_active_tab`
- reconcile 显式删除
- 接收 mounted panel 发来的 runtime summary patch

这一阶段 provider panel 仍然可以 eager mount。目标不是马上提速，而是证明新的索引层和当前 UI 行为一致。

### Phase 3：provider panel 发布运行时摘要

ClaudeCode / CodeX panel 对 CodeHub 发布摘要更新：

```js
{
  agentType,
  projects: projectTabData,
}
```

CodeHub 把这些更新作为 runtime patch 合并进 `SessionIndex`。

删除语义必须显式：

- 关闭项目 Tab 时发布 `project.deleted`。
- 启动早期的空 `projectTabData` 不能被解释为“删除全部项目”。

### Phase 4：重新启用懒挂载

只有 Phase 1-3 的测试通过后，才把 CodeHub 启动改成：

```text
只 mount requested / active provider panel
SessionIndex 负责加载所有 provider tabs
激活另一个 provider 的 tab 时再 mount 对应 panel
```

预期行为：

- 冷启动立即看到 ClaudeCode 和 CodeX 的历史 Tab。
- 点 CodeX tab 时才 mount CodeX panel，并恢复完整 chat 状态。
- 如果 CodeX hydrate 发现更新的摘要，只 patch index，不丢其它 provider 的 tab。

### Phase 5：清理旧耦合

稳定一个发布周期后：

- 移除 CodeHub 对 `panel.projectTabData` 的“初始 Tab 存在性”依赖。
- 保留 provider `projectTabData`，但只作为 runtime patch 输入。
- 更新 `docs/agent-architecture.md` 和 `docs/session-pitfalls.md`。

## 6. 风险矩阵

| 风险 | 严重度 | 概率 | 根因 | 防护措施 |
|---|---:|---:|---|---|
| 冷启动 Tab 再次消失 | P0 | 中 | 空 runtime 更新覆盖 index | 启动期空更新默认非破坏性，只有显式 delete 才删除 |
| 已删除项目重启后复活 | P1 | 中 | index 读到了旧 panel-state / registry | 删除必须同时更新 panel-state 和 registry 删除路径，必要时加 tombstone |
| active tab 指向未 mount provider，无法 switchProject | P1 | 中 | CodeHub 先激活 index tab，但 panel ref 不存在 | 先 mount provider，等待 `ready`，再调用 `switchProject`，期间显示 loading |
| running / pending 指示不准 | P2 | 高 | 冷启动摘要不知道实时运行态 | 启动可接受 0 值，后续由 `agent:event` 和 mounted panel patch |
| 通知红点丢失 | P1 | 中 | `hasDoneNotification` 在 panel-state 和 runtime 间分裂 | 项目级通知必须持久化到 panel-state，index 启动读取，runtime 再 patch |
| Tab 顺序错乱 | P2 | 中 | 旧逻辑只按 mounted tabs reconcile，剪掉未挂载 provider | tab order 必须按 index-visible tabs reconcile |
| ClaudeCode / CodeX 同 cwd 被错误合并 | P2 | 低 | 过早按 cwd 合并跨 provider 项目 | 本轮不按 cwd 合并，继续使用 `agentType:projectId` |
| 新增启动 IPC 拖慢首屏 | P2 | 中 | loader 做了 registry repair 或 transcript scan | loader 只读 panel-state / registry 摘要，禁止全量 JSONL 扫描 |
| registry 迁移旧问题复发 | P0 | 低-中 | loader 在读取时顺手 mutate registry | Phase 1 默认只读，除现有安全 backfill 外不写；补 dry-run 测试 |
| 独立窗口和 CodeHub 状态分叉 | P1 | 中 | 独立窗口和 CodeHub 同时改 panel-state / registry | 继续通过现有 IPC 持久化，CodeHub 在 focus / 明确事件后 reload index |

## 7. 必须补的测试

Phase 4 前至少要有这些自动化测试：

- 不 mount provider panel 时，CodeHub index 能加载 ClaudeCode 和 CodeX 项目。
- `codehub_active_tab=codex:proj-x` 能从 index 恢复到 CodeX tab。
- provider 初始空 runtime update 不会删除 index tabs。
- 显式删除项目后，reload 不会复活。
- tab order reconcile 保留未 mount provider 的 tabs。
- panel-state 里的通知状态能在 provider mount 前进入 index。
- CodeX runtime patch 更新 `runningCount` 时不会替换掉 ClaudeCode tabs。

人工 dev 验收：

- 同时有 ClaudeCode 和 CodeX 历史时冷启动。
- 保存 active CodeX tab 后冷启动。
- 没有 CodeX 历史时冷启动。
- 关闭 CodeX 项目，重启确认不复活。
- CodeX 任务运行中切到 ClaudeCode，确认 running 指示和完成通知还能更新。

## 8. 回滚方案

在 Phase 4 稳定前，`6731bb5` 的 eager mounting 是安全回滚点。

回滚开关：

```js
const mountedMap = reactive(createMountedMap(agentKeys.value))
```

如果 Phase 4 出现任何 Tab 丢失回归，只回滚懒挂载，不回滚 `SessionIndex`。让 `SessionIndex` 先作为被动诊断 / 索引层保留，修好后再重新启用按需 mount。

## 9. 结论

不要直接再次做懒挂载。正确顺序是：

1. 保留当前 eager mounting，先恢复稳定。
2. 增加 CodeHub 级 `SessionIndex`，让统一 Tab 的存在从 panel mount 生命周期里剥离。
3. 用测试证明 index 和当前行为一致。
4. 最后再启用 provider panel 按需 mount。

这样做的关键价值是：性能优化不再改变历史恢复语义，后续新增 provider 也不会再把“是否挂载组件”和“是否显示历史 Tab”绑在一起。
