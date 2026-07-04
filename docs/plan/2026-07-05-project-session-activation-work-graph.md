# T179 Project / Session Activation Work Graph 收口

> 日期：2026-07-05
> 状态：Phase 0 数据已采集 → 确认进入 Phase 1
> 相关：T177 / T177-P2 / T178、CodeHub、ClaudeCode、CodeX、session registry、scan cache

## 1. 背景

这一轮性能修复已经证明几个点：

- Electron 不会自动缓存本地 `fs.readFileSync`、JSONL parse、session registry 读写、IPC handler 排队，也不会替 Vue 降低 DOM/Layout/Paint 成本。
- T177 修掉的是主进程 metrics 同步读大 JSONL 导致的 event loop 阻塞。
- T177-P2 修掉的是一次性挂载 60 条大消息导致的 renderer long task。
- T178 开始修 project tab 切换后的 session scan 风暴，但也暴露出新的架构债：缓存命中路径仍可能继续做 registry attach / upsert 这类同步副作用。

用户当前的体感问题不是“某个函数一定慢”，而是切换 project/session 时联动任务太多：

```text
activateTab
  -> panel.switchProject
    -> switchChat
      -> ensureChatMessagesLoaded
      -> sessionDraft.loadDraftForChat
      -> refreshActiveSessionInstructionState
      -> refreshMetricsForChat
    -> refreshProjectSessionsInBackground / scheduled refresh
      -> provider scan
      -> registry attach / upsert
      -> renderer merge/apply
```

因此 T179 不再以“继续加缓存”为目标，而是收口 activation work graph：

**切换路径只做首屏必须工作；后台工作必须可延迟、可取消、可去重；缓存命中路径不能再有重同步副作用。**

## 2. 当前判断

目前可以保留的修复：

- metrics aggregate cache：必要。它避免重复读取和 parse 官方 JSONL，属于官方 transcript 的只读派生缓存。
- draft / instruction read cache：必要但要保持 session-registry 为事实来源，写入口必须失效。
- message chunked mount：必要。它降低 renderer 一次性 DOM/Layout/Paint 压力。
- scan in-flight dedup / scan cache：方向可保留，但需要治理。它不能变成“命中缓存仍写一堆 registry 文件”的热路径。

当前最大技术债：

1. `attachRegistrySessionToScanSummary()` 名义是 attach，实际会 `upsertSessionRecord()`，不是纯函数。
2. provider scan cache 为了避免 registry 派生字段过期，在 cache hit 时重新调用 attach；这修正了 stale bug，但让 cache hit 仍可能触发同步 registry 读写。
3. `switchProject()` 与 `switchChat()` 没有统一 work graph 契约，只靠各处局部 `void` / `await` / TTL / cooldown 维持。
4. renderer perf 只有散点计时，没有一条 activation id 串起同一次切换里的 scan、metrics、draft、instruction、history、apply。

这些问题不一定每个都会造成当前卡顿，但它们会让性能修复越来越像补丁堆。T179 的目标是把这些边界拆清。

## 3. 非目标

本专项不做：

- 不回滚 T177 / T177-P2 / T178 已验证有效的修复。
- 不新增全局缓存框架。
- 不把 session registry 迁移到 SQLite。
- 不改官方 JSONL，不写 sidecar。
- 不改 token metrics 语义。
- 不重写 ClaudeCode / CodeX 全生命周期。
- 不直接上虚拟列表。

## 4. Activation Contract

### 4.1 同步段允许做什么

project tab / session 激活的同步段只允许：

- 更新 active project/chat id。
- 选择已有 chat 对象。
- 显示已有内存状态。
- 启动当前 chat 的首屏历史加载或恢复分片挂载。
- focus 输入框和恢复 scroll。

同步段禁止：

- 等待完整 metrics。
- 等待 full project scan。
- 等待所有 draft/instruction 后台读取。
- 做 registry 批量写入。
- 做跨项目 session 全量 merge。

### 4.2 当前 session 必须优先

切 session 后的优先级：

| 优先级 | 工作 | 规则 |
|---|---|---|
| P0 | active id / visible chat / input focus | 同步完成，目标 < 16ms |
| P1 | 当前 session 首屏消息 | 可异步，但不能被 scan / metrics 阻塞 |
| P1 | 当前 session draft | cache hit 立即；miss 后台回填，不能阻塞输入 |
| P1 | 当前 session instruction enabled state | 后台回填，UI 允许短时 stale |
| P2 | 当前 session metrics | cache-first，后台 refresh，不能阻塞切换 |
| P3 | project session scan | 延迟、去重、可取消；切换期间不得抢 P1 |
| P3 | 非当前 session metrics / title refresh | idle 或手动刷新 |

### 4.3 后台任务必须可取消

每次 activation 应生成一个轻量 `activationId`。后台任务返回时必须检查：

- active project 是否仍匹配。
- active chat 是否仍匹配，除非该任务明确只更新背景 tab 数据。
- 当前任务是否已被后续 activation supersede。

已有的 active guard 可以保留，但后续新增任务必须按这个契约写清。

## 5. Cache Governance 收口

缓存可以用，但必须区分三类。

### 5.1 可保留缓存

| 缓存 | 归属 | Key | Value | 失效 |
|---|---|---|---|---|
| metrics aggregate | main/provider | `filePath + size + mtimeMs` | token/context 聚合快照 | transcript 变更 |
| draft read cache | sessionRegistry | `registryRoot + chatKey` | draft 文本 | set/clear/delete record |
| instruction read cache | sessionRegistry | `registryRoot + chatKey` | instruction enabled/content/attachments | set/upsert/delete record |
| history tail/page cache | provider adapter | `filePath + page + size + mtimeMs` 如已有 | 当前页消息 | transcript 变更 |
| in-flight dedup | caller/service | task key | Promise | finally 清理 + timeout |

### 5.2 需要治理的缓存

| 缓存 | 当前风险 | 处理方向 |
|---|---|---|
| Claude scan cache | raw summary cache hit 后重新 attach registry | cache hit 不应无条件写 registry |
| CodeX scan cache | 同上 | 同上 |
| provider summary cache | 可能混入 registry 派生字段 | 只缓存 provider raw summary |
| directory tree signature | 每次计算可能仍要递归 stat | 量化 signature 成本，必要时 TTL + fs watcher 后续评估 |

### 5.3 禁止的缓存

- 缓存完整 `project/chats/messages` 给 tab summary。
- 缓存当前回合 live metrics 来伪装新回合。
- 把 MindCraft 自有缓存写到官方 transcript 旁边。
- 不登记 owner/key/invalidation 的临时 Map。

## 6. Phase 0：画清一次切换的 work graph

先补诊断，不改业务语义。

### 6.1 增加 activation id

在 renderer 层生成调试用 activation id，用于 perf meta，不改变业务状态：

```text
agentType + projectId + chatId + seq
```

覆盖计时点：

- `codehub.activateTab`
- `codehub.doSwitchProject`
- `claude/codex.switchProject`
- `claude/codex.switchChat`
- `ensureChatMessagesLoaded.ipc/proc`
- `sessionDraft.loadDraftForChat`
- `refreshActiveSessionInstructionState`
- `refreshMetricsForChat`
- `refreshProjectSessionsInBackground`
- `scan.wall`
- `scan.apply`

### 6.2 主进程补 scan/registry 分段

在 main 侧区分：

- provider directory signature
- provider raw scan
- registry attach read
- registry upsert write
- cache hit / miss
- returned session count

目标是回答：

```text
cache hit 时到底还做了多少 registry read/write？
project tab 切换卡顿是否来自 scan.wall、scan.apply、registry write，还是 renderer DOM？
```

### 6.3 实测数据（2026-07-05 采集）

**测试环境**：CodeX 项目内有 14 个 session（含 11MB JSONL）、Claude 项目内有 10 个 session（含 30MB JSONL）。冷启动后采集。

#### 6.3.1 渲染进程 — 同步切换路径

| 探针 | avg | min | max | 评估 |
|------|-----|-----|-----|------|
| `codehub.activateTab` | 1.85ms | 1.70 | 2.00 | ✅ 远低于 16ms |
| `codehub.doSwitchProject` | 1.55ms | 1.50 | 1.60 | ✅ |
| `codex.switchProject` | 1.30ms | 1.20 | 1.40 | ✅ |
| `codex.switchChat` | 8.13ms | 1.00 | 22.20 | ⚠️ max 略超 16ms，avg 合格 |
| `codex.ensureChatMessagesLoaded.ipc` | 884ms | 83.80 | 1361 | ⚠️ hot 84ms 可接受，cold 1.3s 但不阻塞输入 |
| `codex.sessionDraft.loadDraftForChat` | **464ms** | 0 | 1237 | 🔴 cold 1.2s，cache hit 时 0ms（有效） |
| `codex.refreshActiveSessionInstructionState` | **460ms** | 0 | 1237 | 🔴 同上 |
| `codex.refreshMetricsForChat` | 334ms | 0 | 3335 | 🔴 波动极大，但已是 fire-and-forget |
| `codex.scan.wall` | **3267ms** | 2305 | 3848 | 🔴 scan 绝对大头 |
| `codex.scan.apply` | 0.40ms | 0.40 | 0.40 | ✅ renderer 合并无成本 |
| `claude.scan.wall` | 2877ms | — | — | 🔴 |
| `claude.scan.apply` | 0.40ms | — | — | ✅ |

**结论**：同步切换路径基本达标（<16ms）。draft + instruction 是切换同步段的最大异步阻塞（cold 各 ~1.2s），但 T178 缓存生效后 hot 路径为 0ms。scan 全部在后台 deferred（150ms），不阻塞首屏。

#### 6.3.2 主进程 — scan 分段耗时（核心数据）

**cache miss vs cache hit 对比**：

| 阶段 | CodeX miss | CodeX hit | Claude miss | Claude hit |
|------|------------|-----------|-------------|------------|
| `-scan-signature` | 15ms | 15ms | 3ms | 3ms |
| `-scan-raw` | 24ms | **0** (跳过) | 1ms | **0** (跳过) |
| `-scan-attach` | 1042ms | **2449ms** | 1648ms | **1587ms** |
| **总计** | 1082ms | 2465ms | 1656ms | 1592ms |
| cache 节省 | — | **仅 ~40ms (3%)** | — | **仅 ~64ms (4%)** |

**`registry-scan-upsert` 逐条耗时**：

```
avg ≈ 160ms/条（14 sessions × 160ms = 2240ms）
min = 75ms, max = 183ms
```

每条 upsert 内部做了：
1. `buildProviderScanRecord()` — 构造 record 对象
2. `upsertSessionRecord()` — **写文件 + 写 index**（即使 content 无变化）
3. `readJson()` — **读回文件**验证

**scan 时间分布（cache hit 场景）**：

```
scan total 2465ms (cacheHit=1)
├── signature     15ms  ▏ 0.6%
├── raw scan       0ms  (cache 命中跳过)
└── attach      2449ms  ████████████████████████████████ 99.4%
    └── upsert x14 x ~160ms = ~2240ms
```

#### 6.3.3 各子系统 cache 效果

| 缓存 | hit 延迟 | 效果 |
|------|---------|------|
| `sessionRegistry.getDraft` | **0ms** | ✅ 完美 |
| `sessionRegistry.getInstruction` | **0-1ms** | ✅ 完美 |
| `agent-set-session-draft` | 4-27ms | 可接受（写文件） |
| Claude metrics aggregate | cacheHit=1 时 **1ms** | ✅ 完美 |
| CodeX metrics aggregate | cacheHit=1 时 **6ms** | ✅ 完美 |
| scan signature + raw | **~40ms** | ✅ 快，但只占 scan 总量的 3% |
| scan attach (registry) | cacheHit=1 时仍有 **~160ms/条** | 🔴 完全没跳过 |

### 6.4 核心结论

**Phase 0 数据明确回答了设计阶段的问题：**

> cache hit 时到底还做了多少 registry read/write？

**答：做了全部。** `registry-scan-upsert` 在 cache hit 和 cache miss 场景下耗时完全相同（~160ms/条）。14 个 session 就是 2.2s 的阻塞性写入。

**根因**：T178 的 scan cache 设计上只缓存了 `rawSummaries`（provider 原始数据），cache hit 时仍调用 `attachRegistrySessionToScanSummary` → `upsertSessionFromProviderScan` → `upsertSessionRecord` 全链路。这个 tradeoff 当时是为了避免 registry 字段过期，但代价是 cache 只省了 ~3%（signature + raw scan），最大的写入成本完全没省。

**这证实了文档最初的判断**：

> "缓存命中路径仍可能继续做 registry attach / upsert 这类同步副作用"
> "cache hit 不应无条件写 registry"

**→ 进入 Phase 1 条件已满足。**

### 6.5 已知局限

- **activationId 跨 panel 污染**：`startActivation` 在 `activateTab` 中调用，全局变量在后台 deferred scan 触发时可能已被后续切换覆盖。Phase 0 诊断可接受，Phase 1 如需精确归属需改为 per-panel 的 activationId。
- **chatId 始终为 "none"**：`preferredChat` 参数在多数场景为 null。
- **主进程 `[perf:ipc]` 与渲染进程 `[perf]` 需分别采集**，不在同一个 console。

## 7. Phase 1：拆纯 attach 与 ensure registry（T179-P1）✅ 已确认进入

Phase 0 数据已证明（见 6.3.2）：cache hit 时 registry 写入成本与 cache miss 完全相同（~160ms/条），cache 仅省掉 ~3% 的 signature + raw scan。进入 Phase 1。

### 7.1 问题根因

当前链路把两件事混在一起：

```
scan -> attachRegistrySessionToScanSummary
  -> upsertSessionFromProviderScan
    -> buildProviderScanRecord()   -- 构造 record
    -> upsertSessionRecord()       -- 写 session json + 写 index
    -> readJson()                  -- 读回验证
```

T178 缓存了 rawSummaries（第 1 步），但 cache hit 后仍然完整跑第 2 步。"cache hit"名义上命中，registry upsert 完全没跳过。attach/upsert 占 scan 总量的 99%，raw scan 只占 3%-4%。

### 7.2 方案：拆职责，不是加缓存

不新增缓存。把 `attachRegistrySessionToScanSummary` 的读写拆成两个独立函数：

```js
// 允许写 registry。只在 cache miss、新 transcript、repair 时调用。
function ensureRegistryFromProviderScan(agent, rawSummary, project, options)
// 返回 record（含 chatKey/title/model/runtime 等 registry 字段）

// 纯读/纯合并。cache hit 热路径专用，不写文件。
function mergeRegistryFieldsIntoScanSummary(agent, rawSummary, record, options)
// 返回合并后的 scanSummary（用于 renderer 展示）
```

**调用规则**：

| 场景 | 调用 | 行为 |
|------|------|------|
| scan cache miss | `ensureRegistryFromProviderScan` + merge | 写一次 registry |
| scan cache hit + registry record 存在 | 仅 `mergeRegistryFieldsIntoScanSummary` | **零写入** |
| scan cache hit + registry record 缺失 | `ensureRegistryFromProviderScan` + merge | 允许一次 repair 写（合法异常） |
| panel sync / 手动 repair | `ensureRegistryFromProviderScan` | 保持现有行为 |
| 其他非 scan 路径 | `upsertSessionRecord`（不变） | 保持现有行为 |

### 7.3 upsertSessionRecord no-op 快速返回（互补改动）

拆 API 只修了 scan hot path。panel sync、手动 repair 等路径仍会走到 `upsertSessionRecord`。对 record 内容无变化的调用增加 no-op 快速返回：

**跳过写入的条件**（全部满足才跳过）：

1. `contentChanged === false` — 没有内容变化
2. 没有 orphan records（`orphanChatKeys` 为空或无需处理）
3. index 中 provider keys 已正确
4. instruction/draft cache 无需失效

**两个改动的互补关系**：

| 改动 | 修的路径 | 预期收益 |
|------|---------|---------|
| split attach/merge | scan cache hit | 2449ms → <50ms |
| upserRecord no-op | scan cache miss、panel sync、repair | ~160ms/条 → ~1ms/条（无变化时） |

### 7.4 验收标准

| 指标 | Phase 0 基线 | Phase 1 目标 |
|------|-------------|-------------|
| `codex-scan-attach` cacheHit=1 | 2449ms | **< 50ms** |
| `claude-scan-attach` cacheHit=1 | 1587ms | **< 30ms** |
| `registry-scan-upsert` cacheHit=1 | 14 次 | **0 次（正常场景）** |
| `registry-scan-upsert` cacheHit=1 + record 缺失 | — | ≤ 1 次/条（合法异常） |
| `upsertSessionRecord` 无变化时 | ~160ms | **< 2ms** |
| 会话重复 / 标题回退 / 删除复活 | — | 必须 0 回归 |

### 7.5 风险 & 缓解

| 风险 | 缓解 |
|------|------|
| registry repair 场景可能依赖 scan 时顺手 upsert | cache miss 路径不变，仍走 ensure + upsert |
| deleted/detached provider binding 不能被 cache hit 误恢复 | merge 是纯读，不修改 registry 任何字段 |
| user title/runtime/instruction 权威不能被 provider raw summary 覆盖 | merge 以 registry record 为准，raw summary 仅作 fallback |
| cache hit + registry record 缺失是合法异常 | 允许一次 ensure 写，不算回归，但需 perf probe 标记 |

### 7.6 必须跑的测试

```text
node --test packages/agent/electron/sessionRegistry.test.js
node --test packages/agent/electron/sessionRegistry.codexIntegration.test.js
node --test packages/agent/electron/sessionRegistry.claudeIntegration.test.js
node --test packages/agent/electron/sessionRegistry.panelLifecycle.test.js
npm run test:undef
npm test
npm run build
```

## 8. Phase 2：统一 activation scheduler

如果 Phase 0 证明任务风暴仍来自 renderer 触发顺序，再做这一阶段。

目标不是大重构，而是把切换时的后台任务集中排队：

```text
P0 sync: active id / focus / scroll
P1 current chat: history, draft, instruction
P2 current chat: metrics
P3 project: scan
```

可选实现：

- 在 `agentCommon/composables` 新增 `useActivationWorkQueue`。
- ClaudeCode / CodeX 只提交任务，不直接到处 `void refreshXxx()`。
- 同一 `projectId/chatId/reason` 任务 in-flight dedup。
- 新 activation 到来时取消旧 P2/P3；P1 只允许当前 chat 继续。

这阶段必须非常小步，先只接 CodeX 或只接 scan 调度，不要一次吞所有 draft/instruction/metrics。

## 9. Phase 3：Renderer DOM 后续

如果最新 trace 仍显示 Layout/Paint/GC 是最大项，则回到 T177-P2：

- 继续优化 message detail lazy mount。
- 评估 MessageList 响应式边界。
- 虚拟列表仍是最后选项。

T179 不直接处理虚拟列表。

## 10. 给 ClaudeCode 的执行口径

```text
任务：T179 Project / Session Activation Work Graph 收口。

先做 Phase 0，不要先改缓存策略：
1. 为一次 codeHub/project/session activation 串上 activationId，仅用于 perf meta。
2. 补 main 侧 scan/registry 分段探针：signature/raw scan/registry read/upsert/cache hit/apply。
3. 用同一场景采集冷启动、同 project 切 session、跨 project 切 session 三组数据。
4. 更新 docs/plan/2026-07-05-project-session-activation-work-graph.md 的 Phase 0 数据和结论。

禁止：
- 不新增未登记缓存。
- 不改 token metrics 语义。
- 不写官方 JSONL sidecar。
- 不直接上虚拟列表。
- 不把 attach/upsert 拆 API 放进 Phase 0。

如果 Phase 0 证明 cache hit 仍有明显 registry 写入成本，再进入 Phase 1：拆 `attachRegistrySessionToScanSummary` 的写副作用，并评估 `upsertSessionRecord` no-op 快速返回。
```
