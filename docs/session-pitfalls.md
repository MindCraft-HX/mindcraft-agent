# 会话管理陷阱全景图

> 日期：2026-06-11
> 范围：ClaudeCode + Codex 会话管理（`packages/agent/`）
> 用途：**任何会话相关 bug 排查的第一入口。先看本文，再走专题文档。**

---

## 0. 为什么需要这份文档

Claude 和 Codex 的会话 bug 排查历史上是各自独立的——两篇专题文档互不引用，修复策略各自演进。但实际上它们共享同一套架构，同样的陷阱在两边以不同形态反复出现。

本文提炼**跨 Agent 共通的陷阱 pattern**，让你在排查新 bug 时先识别属于哪个 pattern，再走对应专题文档。

---

## 1. 核心架构速览

### 1.1 双身份模型（Claude / Codex 通用）

每个会话有两层身份：

| 层 | Claude | Codex | 所在 |
|----|--------|-------|------|
| UI 本地 | `chat.sessionId` (`session-chat-N-ts`) | 同 | 渲染进程内存 + `*-panel-state.json` |
| 磁盘持久 | `cliSessionId` (UUID) → `.jsonl` 文件 | 同 | `~/.claude/projects/<cwd-hash>/` 或 Codex equivalents |

这两层身份**不是事务性绑定**的——绑定发生在多个异步事件中（`onAgentDone`、扫描领养、Provider 切换等），这就构成了所有陷阱的基础。

### 1.2 主进程全局 Map（所有窗口共享）

```
claudeAgent.js               codexAgent.js
─────────────────            ─────────────────
agentSessions (Map)          codexSessions (Map)    ← 活跃查询
cliSessionIds (Map)          cliSessionIds (Map)    ← resume 映射
sessionModels (Map)          —                       ← 上次使用的模型
metricsPollers (Map)         metricsPollers (Map)    ← 轮询器
compactSummaries (Map)       —                       ← 压缩上下文
```

**关键事实**：独立窗口和 codeHub 嵌入面板共享同一个主进程 → 共享这些 Map → `resetAgentRuntime()` 清空全局状态时影响所有窗口。

### 1.3 消息的双重来源

每条 chat 的 `messages` 数组有两个可能的来源：

| 来源 | 何时 | 可靠性 |
|------|------|--------|
| 内存 | `sendMessage()` → 流式 IPC 事件追加 | 运行时实时，但中断会丢失 |
| 磁盘 | `ensureChatMessagesLoaded()` → 读 JSONL | 持久化，但可能滞后 |

同步策略：有 `filePath` 时**优先信任磁盘**，无 `filePath` 时**保留内存**。

**这就是陷阱的基础——当"优先信任磁盘"和"保留内存"发生冲突时，bug 就产生了。**

### 1.4 会话生命周期状态机

```
                    ┌──────────┐
         createChat │ PENDING  │ _pendingSessionBinding=true
                    │          │ cliSessionId=null, filePath=''
                    └────┬─────┘
                         │ sendMessage()
                         ▼
                    ┌──────────┐
                    │ RUNNING  │ thinking=true
                    │          │ (messages 流式追加)
                    └────┬─────┘
                         │ 正常完成 / 错误 / 中断
                         ▼
                    ┌──────────┐
                    │  BOUND   │ cliSessionId 已设置
                    │          │ filePath 已设置
                    └──────────┘

    崩溃重启后：thinking 总是 false（不保存）
              _messagesLoaded 总是 undefined（不保存）
              消息可能来自内存（filePath=''）或为空（filePath 已设置）
```

---

## 2. 五大陷阱 Pattern

### Trap 1：主进程全局状态无窗口隔离

**症状**：Provider 切换后所有对话断连；一个窗口的操作影响另一个窗口。

**根源**：`resetAgentRuntime()` 清空全局 Map → 渲染侧只恢复当前活跃 tab。

**影响**：
- Claude：根因 B（`cliSessionIds.clear()` → 无法 resume → 重复 JSONL）
- Codex：未直接对应，但 `codexSessions` 同样全局共享

**涉及文件**：
- 主进程：`claudeAgent.js:1809-1821`, `codexAgent.js` 对应位置
- 渲染：`index.vue:2258-2266` (handleProviderActivated)

**排查入口**：检查 `resetAgentRuntime` 的所有调用点 → 检查每次调用后哪些 Map 被清空 → 检查渲染侧恢复逻辑的覆盖范围。

➡️ 按本节的 runtime reset 检查入口排查。

---

### Trap 2：异步绑定无匹配依据

**症状**：多个新对话同时创建后，会话内容互串。

**根源**：`findPendingClaudeSessionForAdoption` 用"最近创建的 pending chat"做启发式匹配——没有文件级匹配依据。当 pending chat 的创建顺序与 JSONL 文件的更新顺序不一致时，领养到错误的 chat。

**为什么难修**：渲染进程在 `onAgentDone` 之前不知道 `cliSessionId`。主进程在流式首条消息就拿到了，但从不主动推送。

**影响**：
- Claude：根因 A（多 pending 盲匹配）
- Codex：同一 `sessionId` 多 run 竞态（第二轮根因）——不同形态但同一本质：多个执行上下文竞争同一个身份

**涉及文件**：
- Claude：`pendingSessionBinding.mjs:24-36`, `index.vue:1597-1619`
- Codex：`codexAgent.js` 的 `canStartCodexSessionRun` / `runId` 机制

**排查入口**：检查 `findPendingClaudeSessionForAdoption` 的调用上下文 → 检查 "领养" 和 "onAgentDone" 之间的时序。

➡️ 检查 pending adoption、provider identity map 与 transcript binding。

---

### Trap 3：运行时保护机制阻止崩溃恢复

**症状**：应用崩溃/关闭后重启，会话无法渲染，甚至整个进程卡死。

**根源**：五个正确的设计组合成死锁：

```
shouldReloadClaudeChatFromDisk  → 保护 pending 工具不被覆盖（运行正常 ✓）
                                → 阻止崩溃恢复后的消息清理（崩溃后 ✗）

adoptScannedClaudeSession       → 领养 pending chat（运行正常 ✓）
    + continue                  → 跳过消息清理（崩溃后 ✗）

switchChat                      → 仅 messages.length===0 时从磁盘加载（运行正常 ✓）
                                → 阻止崩溃后替换部分消息（崩溃后 ✗）

扫描 else 分支（fileSize 未变）  → 无消息清理（崩溃后 ✗）
```

**本质**：这是一类 **"正确于正常，致命于崩溃"** 的 pattern。每个机制单独看都是正确的优化/保护——但组合在一起，崩溃后形成了无法逃脱的 trap。

**Codex 中的同类问题**：`doneSent` 早于二进制真正退出（`codex-conversation-interruption.md` R1 路径 A）。`doneSent=true` 允许新 run 启动，但旧 run 的 catch 块（无 run ownership 守卫）仍能发 abort 消息杀死新 run 的 UI 状态。

**排查入口**：
1. 确认崩溃前的 chat 状态（pending? bound? 有 pending 工具?）
2. 追踪崩溃后的完整恢复路径：`loadHistory` → 扫描领养 → `switchChat`
3. 检查 `_messagesLoaded` 和 `messages.length` 在每一步的值

➡️ 检查 provider map 的清理与恢复顺序。

---

### Trap 4：磁盘 JSONL 与内存消息的同步缺口

**症状**：切换到历史对话后看到旧内容；新消息不显示；消息丢失。

**根源**：消息的"权威来源"在 `filePath` 有无之间切换——有 `filePath` 时信任磁盘，无 `filePath` 时信任内存。但这个切换不是原子的。

**当前共享规则**：运行中 chat（Claude `thinking=true`；Codex `thinking=true` 或 `_awaitingDone=true`）如果已经有可渲染的内存消息，则**以内存为准**，禁止 refresh / switch / hydrate 用磁盘整段覆盖；只有会话回到稳定态后，才重新允许磁盘成为权威来源。统一实现在 `packages/agent/src/components/agentCommon/utils/historyHydrationAuthority.mjs`。

**Claude 表现**：
- 已修复：`shouldReloadClaudeChatFromDisk` 保护 pending 工具不被磁盘覆盖（正常运行时）
- 仍存在：中断恢复后，`_messagesLoaded` 未重置 + `messages.length > 0` → 跳过磁盘加载（根因 E）
- 仍存在：`hasPendingNewChat` 预计算过时 → 未匹配 JSONL 被延迟发现（根因 D）

**Codex 表现**：
- 已修复：`isCodexTurnLocked` / `shouldHydrateHistoryFromDisk` 保护运行中会话不被磁盘覆盖
- 仍存在：`doneSent` 早于二进制退出 → 新 run 启动时旧 run 仍在写 JSONL → 文件争抢

**排查入口**：
1. 检查 `filePath` 何时被设置、何时被清空
2. 检查 `_messagesLoaded` 标记的生命周期
3. 对比"内存中的消息"和"磁盘 JSONL 中的消息"是否一致

➡️ 检查 run ownership、done 边界和 provider identity map。

---

### Trap 5：done 信号与实际终止之间的时间窗口

The stable CodeX contract and the external CLI migration plan now live in
`docs/codex-runtime-lifecycle.md`. Treat a logical terminal event, transport
closure, transcript reconciliation, and `agent_done` as separate milestones.

**症状**：收尾阶段（token_count、rollout 写入）与下一轮启动重叠，导致状态污染。

**根源**：`doneSent` 在结果到达时立即发送 → 渲染进程立刻可以发下一轮 → 但主进程的旧流仍在收尾（可能持续几百毫秒到数秒）。

**影响**：
- Codex：catch 块无 run ownership 守卫（`codex-conversation-interruption.md` R1 路径 A）
- Codex：rollout 文件可能被两个二进制争抢（R1 路径 B）
- Claude：暂无直接对应（Claude SDK 的 query.close() 可能不同），但 `onAgentDone` 覆盖逻辑有类似的时序问题

**排查入口**：
1. 检查 `doneSent` 和 `resultReceived` 的设置时机 vs 流的真正退出时机
2. 检查 done 后是否有 `_queuedInput` flush
3. 检查旧 run 的 catch/finally 是否有 run ownership 守卫

➡️ 检查 thread/run ownership 与流关闭边界。

---

### Trap 6：UI 标记在项目重建时丢失

**症状**：关闭项目 Tab 再重新打开后，自定义会话命名全部消失；反复修复无效。

**根源**：项目 Tab 关闭时，`deleteProject` 将项目从 `panel-state.json` 中移除。重新打开时，`selectDir` 从 JSONL 扫描重建全部 chat 对象——这是**完全的重新构建**，不是增量更新。如果构建时遗漏了某个 UI 标记字段（如 `_userRenamed`），该标记就永久丢失。

**机制详解**：

```
关闭 Tab:
  deleteProject → 项目从 projects[] 移除 → saveHistory()
  → panel-state.json 中不再有这个项目

重新打开:
  onAgentSelected → createProject → newProject (空项目，chats=[])
  → 用户选目录 → selectDir(dir)
  → loadProjectSessions(dir) 扫描 JSONL ✅
      → 返回 sessions 含 _userRenamed: Boolean(s.isCustomTitle) ✅
  → 构建 chat 对象 → ❌ 漏传 _userRenamed
  → saveHistory() → panel-state.json 写入 _userRenamed=false
  → 后台扫描 → !cached._userRenamed → true → 覆盖自定义名
```

**为什么以前修了七八次都没成功**：之前的修复全在"扫描防覆盖"上——每次在 `refreshProjectSessionsInBackground` 的各个分支里加 `if (!cached._userRenamed)` 检查。但这些检查依赖 `_userRenamed` 标记本身存在于 chat 对象上。而 `selectDir` 重建 chat 时从未设置这个标记——chat 对象从一开始就丢失了它，所有下游保护自然失效。

**本质**：这是一类 **"上游丢失，下游白补"** 的 pattern。当数据流中有重新构建步骤（不仅是增量更新），必须确保构建产物包含所有必要的 UI 状态字段。

**修复**：在 `selectDir` 的 chat 对象构建中加上 `_userRenamed: Boolean(s._userRenamed)`（一行改动）。

**排查入口**：
1. 追踪项目 Tab 的完整生命周期：关闭 → 删除 → 重建 → selectDir
2. 比对 "扫描返回的数据结构" 和 "chat 对象构建出的数据结构"
3. 找到缺失的字段 → 补上

➡️ 检查 session registry 的单一写入 owner。

---

### Trap 7：系统标签剥离白名单不同步

**症状**：用户 bubble 显示 SDK 注入的系统上下文（完整 AGENTS.md 内容、环境变量、`<INSTRUCTIONS>` 块等），而非仅显示用户实际输入。

**根源**：Claude 和 Codex 各有独立的 `stripSystemContextTags` / `stripCodexSystemContextTags`，使用**硬编码标签白名单**。SDK 新增标签类型（如 `<INSTRUCTIONS>`, `<task-notification>`）时，两边需要手动同步。`useClaudeHistory.js` 和 `useCodexHistory.js` 里还有额外 4 处硬编码标签检查——总共 6 处各自维护标签列表，必然遗漏。

**为什么会复现**：这不是新引入的 bug，而是结构性的维护缺陷。之前会话绑定有 bug（T046），历史加载经常失败，消息走的是本地内存（不含 SDK 注入内容），把 UI 问题"遮住"了。T046 修好后，`ensureChatMessagesLoaded()` 更可靠地加载历史，暴露了白名单不完整的问题。

**白名单漂移案例**：

| 标签 | Claude | Codex | useClaudeHistory | useCodexHistory |
|------|--------|-------|-----------------|-----------------|
| `<system-reminder>` | ✅ | ✅ | ✅ startsWith | ❌ |
| `<environment_context>` | ✅ | ✅ | ✅ startsWith | ✅ includes |
| `<ide_*>` | ✅ | ✅ | ✅ startsWith | ❌ |
| `<task-notification>` | ✅ 临时补 | ❌ | ❌ includes | ❌ |
| `<INSTRUCTIONS>` | ❌ | ❌ | ❌ | ❌ |

**修复**：将 6 处硬编码标签检查统一替换为共享的 `stripSystemContextTags()`（`helpers.js`），用标签**命名模式匹配**替代白名单：
- Pass 1：含 `_` 或 `-` 的标签名（snake_case / kebab-case）
- Pass 2：≥5 字符全大写标签名（ALLCAPS）

两份 regex，互补覆盖所有已知和未来的 SDK 系统标签，同时排除标准 HTML 标签（`div`, `span`, `code` 等不含分隔符的短单词）。

**陷阱变体：调用语义不一致**（T053）

即使剥离函数本身正确（helpers.js 模式匹配可处理所有已知标签），CodeX 的 `filterCodexSystemMessages` 存在一个更隐蔽的问题：

- `stripCodexSystemContextTags` 被调用**仅用于 `hasRealText` 过滤判断**（决定是否丢弃整条消息）
- **从不修改消息的 `m.text` / `m.content`**——系统标签原封不动保留
- 消息通过过滤后直接展示，含全部系统上下文 ❌

对比 ClaudeCode 的 normalize 函数，它们在构建输出消息时使用剥离后的文本（`out.push({text: cleaned, ...})`）✅。

**教训**：统一剥离函数只是第一步。需要审查每个调用点**如何使用**剥离结果——是仅用于判断，还是实际用于修改消息内容。

**陷阱变体：内部 meta prompt 被误当成用户消息**（T148）

即使系统标签剥离本身是对的，Claude transcript 仍可能把 skill 展开的内部提示写成：

- `type: 'user'`
- `message.role: 'user'`
- `isMeta: true`

典型内容包括 `Review target: --effort high`、`## Phase 0 — Gather the diff`、`/simplify → 4 cleanup agents...`。这类记录不是用户真实输入，但如果历史归一化只按 `role==='user'` 恢复、不检查 `isMeta`，就会直接进入用户 bubble。

这和 `<INSTRUCTIONS>` / `AGENTS.md` 标签泄漏不是同一个根因：前者是**系统标签剥离缺口**，后者是**消息语义分类缺口**。

**修复**：在 Claude 历史归一化和 panel-state restore 层统一过滤 `isMeta:true` 的内部 user prompt；不要在主进程 transcript 读取层直接粗暴删除，避免影响标题扫描和诊断。

**排查入口**：
1. 到 transcript 搜 `isMeta":true`、`Review target:`、`Phase 0 — Gather the diff`
2. 确认该条记录是否同时满足 `type:'user'` / `message.role:'user'`
3. 检查历史恢复函数是否只按 role 恢复，而没有额外的 meta 过滤

**排查入口**：
1. 打开任意旧 Codex/Claude 会话 → 观察用户 bubble 是否含 `<INSTRUCTIONS>` 或 AGENTS.md 内容
2. grep `stripSystemContextTags` / `stripCodexSystemContextTags` → 检查标签列表是否与 helpers.js 同步
3. 如果 SDK 新增了不符合 snake_case/kebab-case/ALLCAPS 规则的标签 → 更新 helpers.js 的模式

➡️ 如需保留本机排查记录，请放入忽略的 `docs/local/` 或 `docs/tmp/`，不要在公开文档中引用个人路径。

---

### Trap 8：Session Registry ownership 中间态

**症状**：同一 provider transcript 对应多个 MindCraft session record；侧栏重复出现同一会话；修复合并后旧 record 文件仍残留；重启或重新扫描后重复会话又出现。

**根源**：T201 之前，provider scan、done、panel sync、restore 和 repair 都可能写 JSON registry，形成多个 provider binding owner。T201 初次收口又遗漏了 title 与 binding 的同事务写入，以及 sql.js 退出落盘，导致重启后仍可能失去身份关联。

**为什么是重构后更容易暴露**：

重构把 `chatKey / cliSessionId / filePath` 的语义拆清楚了，也把 registry 作为 MindCraft 自有数据的落点建立起来了。但 Phase 2 的早期策略曾明确“panel state 仍是 UI 恢复来源，registry 旁路同步，不改变恢复主路径”。这在迁移期是低风险做法，后续如果不继续收口，就会留下多个事实来源。

当前身份与 runtime 写入已经收口到 SQLite DAO/repository：`sessions`、`session_bindings`、`session_runtime` 是权威；title 与 provider binding 同事务写入；同一 provider key 不允许属于两个 `chatKey`；正常退出统一持久化 sql.js。旧 JSON registry 不再执行 panel sync 或启动 repair，仅保留 draft/instruction 以及兼容窗口内的读取/删除 fallback。

**排查入口**：

1. 对同一个 `agent + cliSessionId/filePath`，检查 SQLite `session_bindings` 是否只指向一个 `chat_key`。
2. 检查 `sessions.title_source` 是否为 `user`，以及 title 写入时是否同时存在两种 provider key。
3. 旧 `session-registry/sessions/*.json` 只能用于兼容读取，不能反向覆盖 SQLite 或 panel state。
4. 如果发现同一函数第三次补丁仍在修重复会话，停止点状修复，重画 repository/DAO 边界并补契约测试。

➡️ 身份边界和恢复规则以本文及 `docs/agent-architecture.md` 为准。

---

### Trap 9：本地会话时间被旧 provider summary 回滚

**症状**：发送消息或 agent 完成后，侧栏时间会更新；但切换项目 / session tab 再回来，部分会话时间又回到旧值。不是所有 session 都复现，通常集中在已经绑定 `cliSessionId/filePath`、会被官方 transcript scan summary 匹配上的会话。

**根源**：MindCraft 本地 `panel-state.json` 已经在发送 / done 边界写入新的 `updatedAt`，但后续 `loadProjectChatsFromCodexSessions()` 或 `refreshProjectSessionsInBackground()` 合并扫描结果时，如果直接执行 `cached.updatedAt = summary.updatedAt`，就可能用旧 scan cache / 旧 JSONL mtime summary 覆盖本地新时间。

这类问题不能用“每次切 tab 重新扫描官方 transcript”修正。正确主链路是：

- 发送消息时更新内存 `updatedAt`，并强制写 MindCraft 本地 panel state。
- done 后只补写最终 `fileSize/mtime` 等终态元数据。
- provider summary 合并到已有 chat 时，只允许更晚的 provider `updatedAt` 覆盖本地值，禁止时间回退。
- 官方 JSONL scan 只能作为显式刷新 / 冷启动 / 历史修复兜底，不应成为 tab activation 热路径的正确性依赖。

**已知修复点（2026-07-06）**：

- `useAgentHistory.saveHistory({ force: true })`：允许发送 / done 这类事实边界绕过 500ms cooldown。
- CodeX 发送路径使用 `saveHistory({ immediate: true, force: true })`，保证本地 panel state 立即落盘。
- CodeX `onAgentDone` 获取 `codexGetFileStat(filePath)` 后强制保存 `fileSize` 和更新的 `mtime`。
- `mergeCodexUpdatedAt(local, provider)` 统一约束：provider 时间只有更新时才能覆盖本地时间。

**排查入口**：

1. 对比内存 chat、`codex-panel-state.json`、session-registry、官方 JSONL summary 的 `updatedAt/fileSize`。
2. 如果发送后 UI 变新、切 tab 后变旧，优先查合并路径是否把 `cached.updatedAt` 直接赋成 `summary.updatedAt`。
3. 如果只有部分 session 复现，检查它们是否已有 `filePath/cliSessionId`，从而会进入 provider summary merge。
4. 不要把 full scan 放回 tab activation 同步段；先确认本地 save 是否被 cooldown 跳过，以及 scan merge 是否允许时间回退。

---

## 3. 排查决策树

遇到会话相关 bug 时，按以下顺序排查：

```
1. 是 Claude 还是 Codex？
   ├─ Claude → 检查 pending adoption、provider map 和 transcript binding
   └─ Codex  → 检查 thread/run ownership、done 边界和 transcript binding

2. 症状分类：
   ├─ 侧栏出现重复/分支的对话
   │   → Trap 2 (异步绑定无匹配) + Trap 8 (registry ownership 中间态)
   │   → 检查 pending chat 数量、扫描时序、provider index 与 sessions/*.json 是否一致
   │
   ├─ 对话内容互串/发到错误的对话
   │   → Trap 2 (多 pending 盲匹配)
   │   → 检查 findPendingClaudeSessionForAdoption 返回值
   │
   ├─ 崩溃/关闭后重启，会话无法渲染或进程卡死
   │   → Trap 3 (运行时保护阻止恢复)
   │   → 检查 _messagesLoaded、messages.length、pending 工具状态
   │
   ├─ 切换 Provider 后对话无法继续
   │   → Trap 1 (全局状态无隔离)
   │   → 检查 cliSessionIds Map 是否被清空
   │
   ├─ 回答中途被"已中断"覆盖
   │   → Trap 5 (done 与终止之间的窗口) + Codex R1 路径 A
   │   → 检查 runId ownership、catch 块守卫
   │
   ├─ 对话无声停止（无错误提示但停了）
   │   → Trap 5 (done 与终止之间的窗口) + Codex R1 路径 B
   │   → 检查 cleanup 日志的 resultReceived/doneSent 状态
   │
   ├─ 关闭 Tab 重开后自定义命名/设置丢失
       │   → Trap 6 (UI 标记在项目重建时丢失)
       │   → 检查 selectDir / loadProjectChats 的 chat 构建是否完整
       │
       ├─ 发送后侧栏时间变新，切 tab 后又回到旧时间
       │   → Trap 9 (本地会话时间被旧 provider summary 回滚)
       │   → 检查 saveHistory cooldown、panel-state 是否落盘、scan merge 是否允许 updatedAt 回退
       │
       ├─ 发送消息后无响应（不是网络问题）
       │   → Trap 4 (磁盘/内存同步) 或 Trap 5
       │   → 检查 agentSessions/codexSessions 中的 session 状态
       │
       └─ 用户消息气泡包含系统指令/项目文档/环境变量
           → Trap 7 (系统标签剥离白名单不同步)
           → 检查 helpers.js 的 stripSystemContextTags 模式是否覆盖当前 SDK 标签

3. 确认后：对照对应 Trap 的"排查入口"做细致验证 → 写针对性测试 → 修复
```

---

## 4. 跨 Agent 共用的修复原则

这些原则是从 Claude 和 Codex 的修复历史中提炼的，适用于两个 Agent 的会话管理：

1. **主进程全局状态操作前，必须先确认影响范围。** 如果操作会影响所有窗口，必须在所有窗口中恢复，不能只恢复当前窗口。

2. **异步绑定时必须有确定性的匹配依据。** 不能靠"最近创建"、"最新更新"等启发式排序。

3. **"运行时保护"和"崩溃恢复"是两种不同的场景。** 一个机制不能同时服务两者而不引入矛盾。

4. **磁盘是权威来源，但加载时机必须精确。** `_messagesLoaded` 标记比 `messages.length` 更可靠。

5. **done 信号不应该在流真正终止前发出。** 如果做不到，必须在 done 之后到流终止之前的窗口内做好隔离。

6. **任何跨窗口共享的状态变更，必须有对应的恢复路径。** 不能假设"只有当前窗口需要这个状态"。

7. **Claude 和 Codex 之间的共享逻辑必须物理上只有一份代码。** 分布式白名单（同一逻辑在多个文件各自维护标签列表）必然漂移。一旦发现两边有重复的函数体，立即提取到 helpers.js 等共享模块。

---

## 5. 文档索引

| 文档 | 覆盖 |
|------|------|
| `docs/session-pitfalls.md`（本文） | **跨 Agent 陷阱全景，排查第一入口** |
| `docs/agent-architecture.md` | 目录边界、IPC 接线、状态持久化（含会话管理章节） |

---

## 6. 未覆盖的已知风险

以下已识别但尚未在专题文档中充分展开：

1. **多窗口同时扫描同一目录** → 两个窗口各自扫描 `~/.claude/projects/<hash>/`，可能同时创建/修改 chat 条目。当前无跨窗口协调。
2. **/clear 旧结论已废弃** -> MindCraft 不提供 /clear；CLI clear 语义由新建会话/删除会话承接。禁止为 /clear 清空 messages、重置 cliSessionId/filePath、隐藏官方 JSONL 或写 registry tombstone。
3. **Codex slash 命令对活跃会话的干扰** -> `codex-list-slash-commands` 可能对活跃会话 `resumeThread`，触发竞态。
4. **排队消息 flush 覆盖用户草稿** → flush `_queuedInput` 时借道 `inputText.value` 和全局 active 状态切换，可能与用户并发操作冲突。
5. **Session Registry ownership 未完全收口** → 已登记 T165；不要再把重复 session 只当作 orphan cleanup 或 panel state 小补丁处理。

---
## 7. 补丁叠加的回归风险（开发实践警告）

> ⚠️ 本节不是关于代码本身的 bug，而是关于**开发过程中反复打补丁引入新 bug 的模式**。

### 7.1 为什么补丁容易引入回归

T046 的修复历史暴露了一个危险模式：

```
原始代码（一行 set）
    ↓
补丁 1：展开为多行 block + 新增 safeSend 调用
    ↓
    忘了把被引用变量的声明一起提上来 → TDZ 回归
```

这不是孤例。以下 pattern 在大型补丁中反复出现：

| Pattern | 案例 | 后果 |
|---------|------|------|
| 展开单行为 block，新增变量引用 | T046 P0-A → TDZ 回归 | 首次对话崩溃 |
| 添加 `continue` / `return` 但不检查后续代码 | T046 根因 E：adopt + continue 跳过清理 | 崩溃恢复死锁 |
| 全局状态操作不检查影响范围 | T046 根因 B：`resetAgentRuntime` 清空全局 Map | Provider 切换丢失 resume |
| 异步通知添加了新 IPC 通道但不检查接收端 | 暂未出现 | 潜在风险 |
| 对象重建时遗漏字段，只在下游加防护 | T049 `selectDir` 漏传 `_userRenamed`，7+ 轮修复全补在扫描侧 | 关闭 Tab 后自定义名丢失 |

### 7.2 补丁前自检清单

在已有复杂函数中打补丁时，执行以下检查：

1. **变量声明扫描**：新增的任何变量引用，确认其在**当前作用域内的声明位置**在引用之前（`const`/`let` TDZ 检查）
2. **控制流中断检查**：新增的 `continue` / `break` / `return` / `throw`，确认它跳过的代码中**没有本次补丁依赖的逻辑**（如消息清理、状态重置）
3. **全局状态影响分析**：对全局 Map / Set 的写操作，确认**所有窗口/所有 tab** 的恢复路径
4. **异步通知闭环**：新增的 IPC `safeSend`，确认渲染侧有对应的**监听和错误处理**
5. **分支覆盖测试**：补丁涉及的每个 `if` 分支是否都有机会在开发环境被触发（此处 TDZ 仅首次消息触发，常规测试可能漏掉）

### 7.3 已知的补丁回归记录

| 日期 | 原补丁 | 回归类型 | 症状 | 修复 |
|------|--------|---------|------|------|
| 2026-06-11 | T046 P0-A `claude-agent-early-cli-session` | TDZ：`sender` before init | 首次对话 ReferenceError | `const sender` 声明前移 1 行 |
| 2026-06-11 | T049 `_userRenamed` 反复修复 | 上游遗漏：`selectDir` 漏传字段，下游白补 | 关闭 Tab 后自定义名持续丢失（7+ 轮修复无效） | `selectDir` 加 1 行 `_userRenamed: Boolean(s._userRenamed)` |
| 2026-06-11 | T046 会话绑定修复后暴露白名单漂移 | Trap 7：Codex/Claude 6 处标签剥离各自维护，SDK 新增 `<INSTRUCTIONS>`/`<task-notification>` 遗漏 | 用户 bubble 显示完整 AGENTS.md + 环境上下文 | 统一为 helpers.js 的模式匹配（snake_case/kebab-case/ALLCAPS） |
| 2026-06-11 | T051 统一剥离函数后 CodeX 仍泄漏（T053） | Trap 7 变体：`filterCodexSystemMessages` 调用剥离函数仅做 `hasRealText` 判断，未修改消息 `m.text`/`m.content` | 统一后 ClaudeCode 正常、CodeX 仍显示完整系统上下文 | `filterCodexSystemMessages` 在 hasRealText 通过后显式剥离 `m.text` 和 `m.content` 各文本块 |
| 2026-07-17 | T201 SQLite title path | 重命名只保存标题，未同时保存 provider binding | 重启扫描无法关联原 thread，用户标题被扫描标题替换 | 将 title 与 `chatKey -> cliSessionId/filePath` binding 放入同一事务；启动时仅回填历史面板中显式用户重命名 |

> **维护原则**：每次打补丁后，在此表中追加一条。如果同一文件/同一函数连续出现 ≥3 次回归，考虑重写而非继续补丁。
