# T148: Codex / Claude Session Lineage Refactor

> 创建：2026-06-25
> 状态：设计中，待开发
> 关联：T138 / T141 / T143

## 0. 2026-06-25 复核结论

- 本地 `@openai/codex-sdk` 的 `resumeThread(id, options)` 支持 `model`
- 同一个 `options` 也支持 `modelReasoningEffort`
- SDK 实现会在 `thread.run()` 时把这些参数继续传给 CLI
- 当前“切模型/切渠道就新开 thread”首先是 MindCraft 接入层的 fingerprint gate 导致的，不是已证实的 SDK 硬限制

因此当前优先级应改为：

1. 先做 P0 最小修复，放宽 Codex resume 策略
2. 先验证切 `model / reasoningEffort / baseURL / apiFormat` 是否其实都能继续 resume
3. 只有最小修复后仍真实出现多 thread 分叉，再进入 lineage schema 重构

## 0.1 P0 最小修复目标

P0 目标只有一个：

- 不因为 `model / reasoningEffort / baseURL / apiFormat` 变化而主动放弃旧 thread

P0 预期行为：

1. 只要存在旧 `threadId`，先尝试 `resumeThread(oldId, threadOptions)`
2. 新的 `model / reasoningEffort / baseURL` 继续传入 `threadOptions`
3. `apiFormat` 只影响当前 turn 的代理通道，不决定是否放弃 thread
4. 只有 `resumeThread()` 真实失败时，才 fallback 到 `startThread()`

## 1. 背景

T138 已完成三层身份剥离：

- MindCraft UI 会话：`chatKey`
- Provider 会话：`cliSessionId` / `threadId`
- 官方 transcript：`filePath`

这解决了“身份污染”问题，但没有解决“lineage”问题。

## 1.1 范围收口

本方案不是“多配置中心”重构，也不是“记录一个 session 所有可能支持的配置”。

本方案只解决两件事：

1. P0：修正 Codex 过度保守的 resume 策略
2. P1：如果底层仍真实产生多 thread，避免旧 transcript 裂成第二条 UI chat

只持久化两类信息：

1. 当前 session 的 runtime 选择
2. 实际发生过的 provider binding 快照

明确不做：

- 不维护某个 session 的“可选模型列表”
- 不记录“理论上支持哪些配置”
- 不改变现有 per-session model 的 UI 语义

## 1.2 P0 与 P1 的边界

### P0 要做的

- 调整 Codex resume 策略
- 删除或放宽 runtime fingerprint 对 resume 的主动阻断
- 补切模型/切渠道的回归测试

### P0 不做的

- 不迁移 registry schema
- 不修改 `session-registry` 持久化结构
- 不引入 `providerBindings[]`
- 不调整 delete 语义

### 进入 P1 的条件

只有当下面任一条在 P0 之后仍成立，才进入 P1：

1. 切模型后底层仍真实新开 thread
2. 切 `baseURL` 后底层仍真实新开 thread
3. 切 `apiFormat` 后底层仍真实新开 thread
4. 上述真实新 thread 会再次通过 scan/import 裂成第二条 UI chat

## 2. T138 已经解决了什么

T138 已解决的关键问题：

1. `chatKey` 不再等于官方 `cliSessionId/threadId`
2. 扫描官方 transcript 时，不再直接把 provider id 写进 UI `sessionId`
3. MindCraft 自有数据已迁到 `userData/session-registry/` 为主
4. 同一 provider identity 原则上只对应一个 canonical `chatKey`
5. title / instruction / runtime 已有统一的 registry 权威层

这意味着本次不是推翻 T138，而是在其上补缺口。

## 2.1 这次重构不应该重新打开的历史问题

以下历史问题不应被本次重构重新引入：

| 历史问题 | 当前防线 | 本次要求 |
|------|------|------|
| Claude provider 切换清空 resume 映射 | `resetAgentRuntime()` 不再清 `cliSessionIds` | 不允许回退 |
| Claude 多 pending 盲匹配 | pending 领养已有更精确匹配链路 | 不允许改回启发式匹配 |
| Claude 中断恢复后 pending 工具阻止磁盘重载 | `_messagesLoaded` / reload guard 已收口 | 不允许顺手改动 |
| Codex run ownership / done 窗口问题 | 现有 lifecycle 测试覆盖主路径 | 不允许绕开 run ownership |
| 官方 transcript 与 MindCraft 数据边界 | 自有数据以 `userData` 为准 | 不允许新增官方目录 sidecar |

## 3. Codex 与 ClaudeCode 的当前差异

ClaudeCode 当前更接近合理语义：

- 尽量保留原 `cliSessionId`
- 模型变化后优先继续 `resume`
- 只有 continuity break 明确发生时才新建底层会话

Codex 当前更保守：

- 先比较 fingerprint
- 只要 `model/baseURL/apiFormat/reasoningEffort` 变化，就先拒绝 resume

因此如果 Codex SDK 无硬限制，业务逻辑应优先向 ClaudeCode 对齐。

## 4. 当前问题点

### 4.1 Codex runtime fingerprint gate

当前 `codexAgent.js` 的关键逻辑：

- `buildCodexSessionFingerprint({ model, baseURL, apiFormat, reasoningEffort })`
- `shouldResumeCodexSession({ previousFingerprint, nextFingerprint, previousCliId })`

现状是：

- fingerprint 变更时直接不 resume
- 并清掉当前 `cliSessionId`

这会导致：

- 切模型断上下文
- 切渠道断上下文
- 后续 scan 可能把旧 transcript 再捞成第二条会话

### 4.1.1 P0 代码级修改建议

建议最小改法：

#### 方案 A：直接移除 fingerprint gate

将：

```js
function shouldResumeCodexSession({ previousFingerprint, nextFingerprint, previousCliId } = {}) {
  const cliId = String(previousCliId || '').trim()
  if (!cliId) return false
  const prev = String(previousFingerprint || '').trim()
  const next = String(nextFingerprint || '').trim()
  if (!prev || !next) return true
  return prev === next
}
```

改成：

```js
function shouldResumeCodexSession({ previousCliId } = {}) {
  return Boolean(String(previousCliId || '').trim())
}
```

#### 方案 B：保留 fingerprint helper，但只用于诊断

- 继续记录 `previousFingerprint` / `nextFingerprint`
- 但不再用它阻断 resume

#### P0 中必须去掉的行为

1. 仅因 fingerprint 变化而 `cliSessionIds.delete(sessionId)`
2. 仅因 fingerprint 变化而 `sessionFingerprints.delete(sessionId)`
3. 仅因 fingerprint 变化而跳过 `resumeThread()`

## 5. P1 才需要的 lineage 方案

只有当 P0 后仍真实出现多 thread continuity break，才进入这里。

目标语义：

- 一个 `chatKey` 可以先后绑定多个 provider thread
- 其中一个 active
- 其他 archived
- archived transcript 不得重新生成第二条 UI chat

建议 schema：

- `activeProviderBindingId`
- `providerBindings[]`
- 每个 binding 仅记录实际发生时的 `runtimeSnapshot`

这不是“配置列表”，只是“实际绑定历史快照”。

## 6. 测试矩阵

### 6.1 P0 必测

1. 同 chat 从 `gpt-5.4` 切到 `gpt-5.5`，仍 resume 原 thread
2. 同 chat 切 `reasoningEffort`，仍 resume 原 thread
3. 同 chat 切 `baseURL`，仍先 resume 原 thread
4. 同 chat 切 `responses -> chat`，仍先 resume 原 thread
5. 重启 App 后继续该 chat，历史上下文不丢

### 6.2 P1 才需要继续测

1. 若上述任一场景仍真实新开 thread，重启 App 后再次扫描历史
2. 切换 2 次以上，验证多个 archived bindings 不回流

### 6.3 历史严重问题回归哨兵

1. Claude provider 切换后历史 chat 仍可 resume
2. Claude 多 pending chat 不会互相错领
3. Claude crash/interrupted 后不会因 `_messagesLoaded` 失效而卡死
4. Codex queued input 在 done 后仍能正确 flush
5. Codex 旧 run 不得向新 run 发送 abort/error 污染 UI

## 7. 验收标准

1. Codex 在同 chat 切 `model / reasoningEffort / baseURL / apiFormat` 后，优先 resume 原 thread
2. 只有在底层仍真实切换 thread 时，才进入 lineage schema 改造
3. T138 已解决的身份边界问题没有回归
4. Claude pending / interrupted 与 Codex run ownership 哨兵测试全部通过

## 8. 开发顺序

建议 ClaudeCode 按以下顺序开发：

1. 先做 P0：放宽 Codex fingerprint gate
2. 同一轮补 `model / reasoningEffort / baseURL / apiFormat` 的 resume 回归测试
3. 先观察，确认是否还会真实产生多 thread
4. 只有仍存在多 thread continuity break，才进入 P1 lineage / migration

强约束：

- P0 阶段不得触碰 schema migration
- 不要在现有 `detachedProviderBinding` 周围继续堆条件
- 新逻辑优先抽成 helper，不要在 Claude / Codex 两边重复散写
