# TODO

> 最后更新：2026-06-18（Session Instruction 保存自动启用 + composable 去重规划）
>
> ⚠️ **会话相关 bug 排查第一入口**：`docs/session-pitfalls.md`（跨 Agent 陷阱全景图）
> ⚠️ **SDK 利用率审计**：当前 ~15%，详见下方「SDK 能力挖掘」章节

## 当前重点

| 编号 | 分类 | 说明 | 优先级 | 状态 |
|------|------|------|:------:|------|
| T134 | refactor | **Session Registry 与官方 Agent 目录边界重构**：MindCraft 自有数据禁止污染 `~/.claude` / `~/.codex`；建立 `{userData}/session-registry/` 保存 chat/session title、description、instruction、模型/effort、chatKey↔cliSessionId 映射和编排元数据。官方 JSONL transcript 不迁移；CodeX panel state 已迁到 `{userData}/codex-panel-state.json`（读旧写新，不删旧文件）；Session Registry 已建立并旁路同步 Claude/CodeX panel state 映射；Claude per-session model/effort 新写入已迁到 registry，旧 `.meta.json` 只读 fallback；Session Instruction 文本注入已接入 Claude/CodeX，附件读取暂缓；诊断日志、临时上传和 skills catalog cache 已迁到 `{userData}`。2026-06-17 review follow-up：userData 路径解析已收敛到 `userDataPath.js`，`app.getPath('userData')` 不可用时回退到稳定 home 目录而非 OS tmp；旧 inline `instruction.title` 已兼容为 description；`agent-set-session-instruction` 增加 description/content/attachments 上限；CodeX file_change git diff 预览降 timeout 并限制一次处理文件数，降低主进程同步阻塞窗口。详见 `docs/plan/2026-06-17-session-registry-and-official-dir-boundary.md`。 | P1 | ✅ Phase 5 follow-up 完成 |
| T135 | tech-debt | **Session Registry 后续增强**：`writeJsonAtomic()` 仍未做 fsync（当前已有 tmp+rename，Windows 风险较低）；Claude/CodeX session instruction 前端函数仍有重复（`openSessionInstruction` / `loadSessionInstructionForTab` / `refreshActiveSessionInstructionState` / `setActiveSessionInstructionEnabled` 共 4 函数+1 ref），目标抽到 `agentCommon/composables/useSessionInstruction.js`，同步清理两边的诊断日志前缀参数化；CodeX session instruction 注入仍走 user prompt 前缀，后续确认 SDK 是否有更合适的 system/developer instruction 通道后再收敛；`bothFailed` locale key 仍是死代码清理项；SessionInstructionDialog 保存已改为自动 `enabled: true`（2026-06-18）。 | P3 | ⏸️ 记录 |
| T136 | feature | **Session Instruction 附件引用与注入**：在会话指令弹窗支持添加本地文本文件引用，路径存入 `{userData}/session-registry/sessions/<chatKey>.json` 的 `instruction.attachments`，不复制文件、不写 Claude/CodeX 官方目录；发送前读取 `.md/.txt/.json/.yaml/.yml/.toml` 等受控文本附件的最新内容并注入当前会话，文件不存在/过大/非文本/读取失败时跳过并在 UI 标记。需要覆盖 Claude systemPrompt 注入和 CodeX prompt 前缀注入，控制单文件与总内容大小，避免阻塞主进程。详见 `docs/plan/2026-06-17-session-registry-and-official-dir-boundary.md#phase-4b-session-instruction-附件`。<br>✅ 已实现 (2026-06-18)：新建 `sessionInstructionAttachments.js`（resolve/format/build 三函数 + 扩展名白名单 + 单文件 256KB / 总 1MB 上限 + STATUS enum）；新增 3 个 IPC handler（`agent-open-session-attachment-dialog` / `agent-resolve-session-attachments` / `agent-build-session-instruction-prompt`）；Claude 走 `claudeAgent.js` async systemPrompt 注入，CodeX 走 `codeX/index.vue` IPC async user prompt 前缀注入；SessionInstructionDialog 增加附件列表（toggle 启用/禁用、remove、add 文件选择器）、i18n 4 个新 key；preload 3 个新 bridge；构建成功、11 个测试通过。 | P1 | ✅ 已实现 — 2026-06-18 |
| T133 | tech-debt | **review follow-up：重复 helper 收敛评估**：`documentLocator.js` 与 `skillsSecurity.js` 各自保留 `isRealPathInside`，当前跨 host/agent 边界且测试覆盖安全行为，暂不为去重引入新共享模块；后续若再出现第三份实现，再抽到明确的 shared electron utility。`normalizeReasoningEffort.mjs/.cjs` 双份是为避开 Vite dev 导入 CJS 白屏的有意折中，后续可用生成脚本或双入口 package export 收敛。 | P3 | ⏸️ 记录 |
| T130 | refactor | **Claude 会话身份模型收敛（T089/T090/T091 前置）**：明确 `chatKey`（当前 legacy 字段 `chat.sessionId`）、`cliSessionId`、`filePath` 三层身份边界；抽统一 identity helpers；清理 `sessionId` 命名混用；收紧磁盘 artifact 只使用 `cliSessionId/filePath`。已完成专题文档、`claudeSessionIdentity.mjs`、pending/adoption 与 history dedupe 判断集中化、核心注释、stream/main 局部 `chatKey` 命名、scan 显式返回 `cliSessionId`、delete `.jsonl` 同步删除 `.meta.json`。后续可进入 T089 per-session model 实现。 | P1 | ✅ Phase 3 完成 |
| T129 | security | **路径边界 realpath 校验**：`documentLocator.js` 的 agent-message 绝对路径打开已补 `fs.realpathSync.native()` 边界校验；`skillsSecurity.js` 的 skill subPath 也会拒绝 realpath 指向 clone 外部的路径。新增 document-locator/skillsSecurity 回归测试。 | P1 | ✅ 已修复 — 2026-06-17 |
| T128 | bug | **Skill 安装原子替换/回滚**：Claude/CodeX skill 安装已改为 `copySkillDirAtomic()`，先复制到目标同级 staging，成功后 rename 替换，并在失败时恢复旧目录；同时拒绝 skill 包内 symlink，避免复制后保留外部引用。 | P1 | ✅ 已修复 — 2026-06-17 |
| T127 | refactor | **CodeX reasoning effort 规范化去重**：已从组件/主进程多份散落逻辑收敛为 `normalizeReasoningEffort.mjs/.cjs` 双入口；`.mjs` 供 Vite renderer dev 使用，`.cjs` 供 Electron 主进程 require 使用，避免 CJS 经过 Vite `?import` 导致白屏。后续如要根治漂移，用生成脚本或 package exports 收敛。 | P3 | ✅ 已完成（双入口折中） |
| T126 | theme | **用户消息气泡高亮变量完善**：Claude/CodeX 用户消息代码块已补 `--cc-user-hljs-*` token 色 + `--cc-user-link`，四套主题 CSS 已显式定义同名变量；token 规则作用于 `.user-msg .code-block .hljs-*` 并使用 `!important` 覆盖父级全局 hljs 规则，确保 fenced code block 的 `.code-card` 路径也生效。 | P3 | ✅ 已完成 |
| T125 | tech-debt | **Sass legacy JS API warning**：已确认 `vite@4.5.14` 内部仍调用 Dart Sass legacy `render()` API，`api: 'modern'` 对 Vite 4 无效；现改为 `silenceDeprecations: ['legacy-js-api']` 消除构建噪音。真正根治需后续升级 Vite 5.4+/6 并回归 Electron 构建链路。详见 `# T125 详情`。 | P3 | ✅ 已静音 — 根治待升级 |
| T124 | eval | **设计能力集成方案评估**：基于 Open Design 参考分析，评估 craft 知识注入、HTML 分屏预览、场景化交互三层能力。保留为产品方向评估，不直接进入开发；前置是先完成方案拆分、版权确认、iframe 安全边界和 Phase 0 验收标准。详见 `docs/plan/2026-06-17-design-features-integration.md` 和 `# T124 详情`。 | P2 | ⏸️ 待评审 |
| T120 | bug | **CodeX config.toml 污染导致 CLI 不可用**：App `applyProvider()` 将 `env_key = “OPENAI_API_KEY”` 写入 `[model_providers.<id>]` 段 + 覆写 `auth.json`，导致切回 CLI 后认证失败。参照 cc-switch：改为 `experimental_bearer_token` 直接注入 token、第三方 provider 不碰 `auth.json`。详见 `# T120 详情`。 | P0 | ✅ 已修复 (2026-06-16) |
| T117 | bug | **自动更新下载完成后安装失败**：SystemSettings 下载完成文案误导为”重启后生效”；点击安装时 `quitAndInstall()` 先关闭窗口，但生产环境主窗口 `close` 会隐藏到托盘，旧进程仍占用文件，NSIS 报 `Failed to uninstall old application files`。已改为安装前进入真实退出状态、销毁托盘/清理 Codex runtime，并收敛按钮文案为”退出并安装更新”。 | P0 | ✅ 已修复 (2026-06-15) |
| T118 | housekeeping | **settings.json 污染清理**：将 `permissionPolicy`/`pathToClaudeCodeExecutable`/`gitMirrorUrl` 从 `~/.claude/settings.json` 迁移到 `claude-internal.json`；分离 App UI `language` 与 SDK `language`（语义冲突）；删除 `writeSettingsJson()` 死代码和 `claude-write-settings-json` handler；`effortLevel` 中 `max`→`xhigh`（SDK Settings interface 不含 `max`）；统一用 `confSet`/`confGet` 读写；启动时一次性清理 settings.json 中历史脏数据。详见 `docs/settings-json-pollution.md`。 | P0 | ✅ 已修复 (2026-06-16) |
| T119 | housekeeping | **CLAUDE.md 红线修正**：从 settings.json 禁令中移除 `autoCompactWindow`（经 SDK 源码验证是合法字段，`sdk.d.ts:4632`）；补充 `effortLevel` 值域规范（仅 `low/medium/high/xhigh`，`Settings` interface 不含 `max`）。 | P1 | ✅ 已修复 (2026-06-16) |
| T116 | bug | **Claude 会话中断后 dangling tool_use 恢复**：JSONL 末尾只有 assistant `tool_use`，没有 `tool_result/result`，恢复后 UI 卡在 pending/running，且 `done` 仍可能被标成 completed。已识别孤儿工具轮次、在历史恢复时收口为 interrupted，原会话可继续输入。 | P0 | ✅ 已修复 (`71a0693`) |
| T089 | feature | **Per-session 模型选择**：Claude 侧已将模型/effort 下沉到 session/tab 级别；历史版本写同名 `.meta.json`，T134 Phase 3 后新写入已迁到 `{userData}/session-registry/`，旧 `.meta.json` 只读 fallback；CodeX 已确认 SDK 支持 per-thread `model/modelReasoningEffort` 并收敛为 tab 级模型状态。人工回归已通过：Claude 以识图/非识图模型验证，CodeX 因模型均可识图，按状态持久化与 per-thread 参数链路验证。 | P1 | ✅ 已完成 |
| T090 | feature | ~~**forkSession() 分支探索**：从当前会话一键分叉到新 UUID。~~ **决定不做了**：多 tab 架构下重描述一句即可，fork 价值不大；且会重新引入会话身份/历史恢复边界复杂度。 | — | ❌ 暂不处理 |
| T091 | feature | ~~**setModel() 运行时切模型**：不用 abort→重建，运行中直接切换模型。~~ **决定不做了**：① T089 per-session 模型已覆盖”非运行中切换，下轮 query 用新模型”的场景；② 运行时原生 setModel 改动有风险（之前 300 行改坏项目的教训）；③ 使用概率低。 | — | ❌ 暂不处理 |
| T092 | feature | ~~**Worktree 多分支隔离**：每个 session 绑定独立 git worktree。~~ **决定不做了**：SDK 只有 worktree hook，不等于完整产品能力；App 层实现接近“给 session 开新目录”，跟新建项目区别不大，成本远超收益。 | — | ❌ 暂不处理 |
| T093 | refactor | ~~**SDK 会话管理替换**：用 SDK 原生 listSessions/getSessionInfo/deleteSession 替换手动 JSONL 扫描。~~ **暂缓**：SDK API 存在，但当前会话列表/历史恢复依赖 `filePath`、`.meta.json`、pending adoption、dangling tool recovery、删除 sidecar 等 App 逻辑；全量替换会回到刚稳定过的高风险区域。后续仅考虑只读 adapter/对比验证，不替换主路径。 | P3 | ⏸️ 暂缓 |
| T094 | feature | ~~**setPermissionMode() 运行时切换**：对话中切换权限模式。~~ **决定不做了**：同 T091，低频+风险；当前 runMode/配置在新 query 生效足够。 | — | ❌ 暂不处理 |
| T095 | feature | **getContextUsage() 实时上下文**：SDK `query.getContextUsage()` 可增强运行中上下文读数，但当前已有 JSONL/事件侧 context 指标；不替代现有链路。仅后续做只读运行中增强。 | P3 | ⏸️ 暂缓 |
| T096 | feature | ~~**PreToolUse hook**：拦截工具调用，可修改输入/拒绝。~~ **决定不做了**：高级功能，普通用户用不到；会明显增加权限/安全状态复杂度。 | — | ❌ 暂不处理 |
| T097 | feature | ~~**rewindFiles() 代码回滚**：配合 enableFileCheckpointing，回滚到指定消息时的文件状态。~~ **决定不做了**：太高级，场景极少；文件检查点能力风险大于收益。 | — | ❌ 暂不处理 |
| T098 | feature | ~~**SessionStart/Stop hooks**：会话启停生命周期注入上下文/清理。~~ **决定不做了**：框架级能力，当前应用层价值低。 | — | ❌ 暂不处理 |
| T099 | perf | **startup() 预热**：SDK WarmQuery 可降低首轮延迟，但需要 idle 进程回收、provider/model/cwd 变更失效、资源占用控制；必须先量化启动耗时再决定。 | P3 | ⏸️ 性能实验 |
| T100 | feature | ~~**MCP 动态管理**：setMcpServers/mcpServerStatus/toggleMcpServer。~~ **决定不做了**：MindCraft MCP 用得少，动态管理 UI 成本高。 | — | ❌ 暂不处理 |
| T101 | feature | ~~**tagSession() 会话标签**：给会话打标签分类，配合 listSessions 过滤。~~ **决定不做了**：没标签 UI，过早；且 T093 不切 SDK session list 主路径。 | — | ❌ 暂不处理 |
| T103 | bug | **v1.0.7+ ClaudeCode 工具栏消失**：**根因已确认** — `agent.refFile` 翻译含末尾 `@` 字符（"引用文件 @"），vue-i18n v9 消息编译器将其解释为 Linked Message 语法 `@:key`，因无后续 `:` → `UNEXPECTED_LEXICAL_ANALYSIS` error → `onErrorCaptured` 捕获 → `return false` → Vue 卸载 InputToolbar 子树。关联 T106（chunk 拆分）。修复：移除 `agent.refFile` 中的 `@`。 | P0 | ✅ 已修复 (2026-06-16) |
| T106a | refactor | **agentRegistryComponents.js 静态 import → defineAsyncComponent**：4 个 static import 把全部 Agent 组件树拖进 SharedSettings chunk（428KB）。已改为 `defineAsyncComponent(() => import(...))`，SharedSettings 降至 8.4KB (-98%)，代码分割恢复。 | P0 | ✅ 已修复 (`9a280d6`) |
| T104 | bug | **SelectModel.vue 调用不存在的 IPC**：`claudeSetModel` / `claudeSetSelectedTier` 在 preload 和主进程均未注册，模型切换静默失败 | P0 | ✅ 已修复 (`a49f4ea`) |
| T106 | refactor | ~~agentRegistryComponents.js 静态 import → 动态 import~~ → 已合并到 T106a | P0 | ✅ 已修复 |
| T105 | bug | **effortLevel 缺 xhigh**：ClaudeCode 4 处白名单仅有 `['low','medium','high','max']`，漏了 SDK 原生支持的 `'xhigh'`；CodeX 的 `['minimal','low','medium','high','xhigh']` 与 SDK 一致无需改动。已补 xhigh + i18n (`b53be01`) | P1 | ✅ 已修复 (2026-06-16) |
| T108 | refactor | **CodeX sandbox 权限重构** | P0 | ✅ 已完成 2026-06-16 |
| T109 | refactor | **CodeX InputToolbar 加 sandbox 选择器** | P0 | ✅ 已完成 2026-06-16 |
| T110 | refactor | **CodeX APISetting 权限 UI 重命名** | P0 | ✅ 已完成 2026-06-16 |
| T111 | housekeeping | **CodeX 旧值兼容迁移** | P0 | ✅ 已完成 2026-06-16 |
| T112 | ux | **ClaudeCode runMode 默认值**：`ask_before_edits` → `edit_automatically`，与新创工具对齐，减少确认打断。 | P2 | ✅ 已完成 |
| T113 | i18n | **CodeX sandbox labels 国际化**：Store `sandboxLevels` 的 `label`/`desc` 硬编码中文 → 改为 i18n key (`labelKey`/`descKey`)，模板用 `$t()` 读取。 | P2 | ✅ 已修复 2026-06-16 |
| T114 | ux | **CodeX Settings sandbox toast 文案**：旧 toast 含"仅对新创建的会话生效"省略 → 补充"默认"限定 + 改 i18n | P3 | ✅ 已修复 2026-06-16 |
| T115 | housekeeping | **CodeX migrateValue 去重**：`codexConfig.js` 和 `codeX/index.vue` 的 migrateValue 逻辑相同 → 提取到 `sandboxHelpers.js` | P3 | ✅ 已修复 2026-06-16 |
| T107 | bug | **CodeX queued input / busy 竞态 (B029)**：B029 修复（`56f9488`）在版本升级（`5f7416d`）中意外丢失 — `markCodexSessionDoneSent()` 只保留 `doneSent=true`，遗漏 `streamClosed=true` + `resolveCompletion()`。恢复后：`triggerDone()` 在发送 `codex-agent-done` 前标记 stream 已关闭，消除前端 flush 时的 2.5s `session_close_timeout` 窗口。前端 T107 flushQueuedInput 方案已回退（后端修复为根因）。后续修复：① `resolve({accepted:true})` 防 toast 误报 (`716eecf`) ② abort 即时反馈 (`9432b44`) ③ 保留用户气泡 (`daa1bde`) ④ **thinking 卡住**：乐观 `thinking=true` 前移到 await 之前 (`f57545e`)，根因是 finally 中 resolve 晚于 codex-agent-done 导致 thinking 被覆盖。关联 `docs/plan/2026-06-15-codex-queue-race-plan.md`。 | P0 | ✅ 已修复 (`551ca6b`, `716eecf`, `9432b44`, `daa1bde`, `f57545e`) |
| T068 | feature | **简易对话（Chat）**：不绑定文件夹的轻量对话，支持知识问答 + 网页搜索 + 图片输入，复用已有 Provider 配置。含上下文清空 + LLM 压缩按钮。 | P1 | ✅ 已完成 (2026-06-13)，commit `d1eb6d2`；详见 `docs/agent-architecture.md` §10 简易对话 |
| T069 | housekeeping | **死依赖清理**：移除 19 个未使用的 npm 包 + 对应死代码，node_modules 减 ~90 MB | P1 | ✅ 已完成 (2026-06-12) |
| T039 | feature | **语音输入能力**：支持把语音转文字输入到编程智能体对话。当前不是核心路径，已有输入框/图片/文件引用更高频；实现前需先确定本地录音权限、STT provider、隐私提示和跨平台权限。 | P3 | ⏸️ 暂缓研究 |
| T040 | eval | **Remote 远程接入方案研究**：远程项目/远程 Agent 接入。涉及认证、隧道/SSH、文件系统映射、权限隔离、会话持久化，产品边界未定；不作为近期实现项。 | P3 | ⏸️ 暂缓研究 |
| T041 | refactor | mindcraft-agent 重构：在共享 Agent 层基础上裁剪宿主能力与导航 | P1 | ✅ 已完成 |
| T045 | refactor | Agent 抽离：提取 Claude / Codex / codeHub / agentCommon 为共享 `packages/agent` 层 | P1 | ✅ 已完成 — 后续仅维护 |
| T066 | bug | CodeX 对话卡住/中断：①多轮后卡住（前端忽略 IPC 返回值 + `thread.error` 不设 resultReceived）②早期无反应（slowNotice 无 subtype） | P0 | ✅ 6 项修复 (2026-06-12)：G1(返回值检查+锁定时序)/G2(thread.error→resultReceived)/G3(slowNotice+subtype)/G4(abortSession→await)/O1(结构化拒绝)/O2(late event guard) (`docs/bugs/codex-stuck-interruption.md`) |
| T060 | bug | 文档链接跳转：①部分点击无反应（路径正则漏 Linux/WSL/空格/目录前缀）②跳转到文档但不打开（md-content 竞态丢失） | P1 | ✅ 4/5 根因修复 (2026-06-12)：D(竞态)/A(Unix路径)/C(目录前缀)/E(错误提示)，B(空格截断)暂缓。竞态修复又引入 keep-alive 回归：afb16f5 改为"始终排队"导致 mdViewer 已打开时新文档无人消费，已双通道修复（入队兜底 + 就绪直投）(`docs/bugs/doc-link-navigation.md`) |
| T046 | bug | ClaudeCode 会话重复 / 接力问题：重复 jsonl 绑定、active 丢失、renderer session 身份污染 | P0 | ✅ 5 个根因全部修复 (2026-06-11) (`docs/bugs/claude-session-duplicate-split.md`) |
| T047 | bug | 工具栏 @ 选择文件时输入框有文字就选不了（ClaudeCode + CodeX 共性问题） | P1 | ✅ 已修复 (2026-06-11) |
| T048 | bug | CodeX "额外目录"：默认展开/收缩逻辑缺失 + 缓存/数据流可能断裂 | P2 | ✅ 已修复 (2026-06-11) |
| T050 | bug+ux | 任务完成通知系统修复：提示音稳定性 + ClaudeCode 缺失 + 导航栏提醒 + "编程"→"项目" | P1 | ✅ 已修复 (2026-06-11) |
| T049 | bug | 关闭项目 Tab 重开后自定义会话命名全部丢失（ClaudeCode + CodeX） | P1 | ✅ 已关闭 — ClaudeCode 已修复；CodeX 现已持久化 `_userRenamed` 且刷新保留缓存名，如复现另开新 bug |
| T051 | bug | 系统标签剥离白名单不同步：用户 bubble 显示 SDK 注入的系统上下文（AGENTS.md / INSTRUCTIONS / 环境变量） | P0 | ✅ 统一为 helpers.js 模式匹配，覆盖 6 处调用点 (2026-06-11) |
| T052 | feature | mindcraft-agent 导入 mindcraft-electron API 配置：手动按钮触发 + 自动探测 userData + shared settings.json 兜底创建 Provider + 防重复 | P1 | ✅ 已实现 (2026-06-12) |
| T053 | bug | CodeX 系统标签泄漏：`filterCodexSystemMessages` 的 `hasRealText` 仅用剥离结果做过滤判断，未实际修改消息内容 | P0 | ✅ 已修复 (2026-06-11) |
| T054 | ux | 状态栏流速仪表盘简化：移除 input 速度（Claude 多轮上下文重复计数致数值误导），只保留 output 速度 | P2 | ✅ 已修复 (2026-06-11) |
| T055 | bug | 从首页/文档切回会话 tab 时不会自动沉底：keep-alive 恢复后 ResizeObserver 不触发 | P1 | ✅ ClaudeCode onActivated + CodeX onActivated 已修复 (2026-06-11) |
| T056 | security | API key 日志泄露：`claudeAgent.js` 和 `codexAgent.js` 的 console.log 输出 apiKeyPrefix/apiKeyLen | P0 | ✅ 已修复 — 移除 codexAgent.js 中敏感字段 (2026-06-11) |
| T057 | bug | ClaudeCode token 计数不对称：`getTokenMetrics` 中 input 取最后一轮（=），output 跨轮累加（+=），多轮后 output 虚高 → in/out 比例诡异 | P1 | ✅ 统一为 = 赋值 (2026-06-11) |
| T057 | bug | AskQuestion 10 分钟超时后发送空答案（`answers: {}`），Agent 行为未定义 | P1 | ✅ 审查确认：handleAskDialogClose 会自动选首选项，行为正确 (2026-06-11) |
| T058 | bug | PlanReview 10 分钟超时后仅关闭弹窗不发送决策，导致 Agent 永久挂起 | P1 | ✅ 已修复 — 超时改为 finishPlanReview({ type: 'reject', reason: 'timeout' }) (2026-06-11) |
| T059 | bug | CodeX 通知清除路径不完整：`onBackgroundTaskDone` 设置但无对称清除逻辑 | P2 | ✅ 已修复 — 添加 projects.flatMap watch 自动清除 (2026-06-11) |
| T060 | ux | 主题选择器 popover（`teleported=false`）可能被 sidebar `overflow:hidden` 裁剪 | P2 | ✅ 已修复 — 添加 `:popper-options="{ strategy: 'fixed' }"` 绕开 overflow 裁剪 (2026-06-11) |
| T061 | ux | Token 图表（ECharts）颜色硬编码暗色主题，在 Light/Brown 主题下不协调 | P3 | ✅ 已修复 — 引入 useClaudeThemeStore，4 套主题配色 + 切换监听 (2026-06-11) |
| T062 | perf | `speedInputPerSec` 后端仍在计算但 UI 不再展示，浪费 CPU + IPC 带宽 | P3 | ✅ 已修复 — 从 claudeAgent.js/claudeMetrics.js/codexAgent.js 移除 IPC 传输 (2026-06-11) |
| T063 | refactor | `mdRouting.js` `pendingPayloads` 无上限 + `allFilesCache` 无 TTL | P3 | ✅ 已修复 — pendingPayloads 上限 20 + 窗口关闭清空；allFilesCache 30s TTL (2026-06-11) |
| T064 | bug | npm run dev 白屏 + 僵尸进程：悬浮球 `/side` 路由经同源共享 localStorage 污染主窗口路由记忆；Electron 36 `console-message` 签名变更吞掉渲染报错 | P0 | ✅ 已修复 — 路由记忆 `/main` 白名单 + dev 守护自动退出 + predev 清端口 + 恢复 HMR (2026-06-11) (`docs/bugs/dev-white-screen-zombie-process.md`) |
| T065 | bug | 首页项目区域：①项目名始终显示"新项目"而非实际文件夹名（`project.name` 创建后永不更新）；②点击不同项目条目都跳转到最近一次项目（条目无独立点击处理，CodeHub 恢复最后活跃 Tab） | P1 | ✅ 已修复 — 从 cwd 推导项目名 + homeMetrics 暴露 projectId + Home.vue 带参数跳转 + codeHub 匹配 projectId (2026-06-12) |
| T067 | bug | 插件/Skill 市场不可用：①Skills "推荐" tab 为空（`skills-catalog.json` 文件不存在）②ClaudeCode 插件全部显示"未安装"（marketplace ID 不匹配） | P1 | ✅ 已修复 — 构建时生成 catalog + 运行时 API 兜底 + 插件 name-based fallback 匹配 (2026-06-12) |
| T070 | bug | 待审批提示音不响：`playAskSound.js` / `playDoneSound.js` 中 `ctx.resume()` 返回 Promise 但未被 await，导致 AudioContext 处于 suspended 时声音静默 | P1 | ✅ 已修复 — 函数改为 `async`，`await ctx.resume()` (2026-06-13) |
| T071 | ux | 棕色主题 `--cc-warning: #b85c0e` 在 `--cc-bg: #efe8dd` 暖米色背景上对比度不足，待审批通知高亮不明显 | P1 | ✅ 已修复 — 改为 `#d97706` 琥珀色 + 配套 bg/border/text (2026-06-13) |
| T072 | bug | ClaudeCode 默认权限策略为 `'ask'`，每次 Bash/Write/Edit 都弹权限确认，CodeX 已改为 `'allow_all'` 但 ClaudeCode 漏改 | P1 | ✅ 已关闭 — 当前默认 runMode 为 `edit_automatically`，写入/执行类工具在该模式下自动 allow；如再出现 denied，应按具体工具/路径/权限策略另开 bug |
| T073 | bug | ClaudeCode 插件市场安装后出现两个重复条目 | P1 | ✅ 已修复 — `readPluginsState()` 按插件目录名去重，同插件不同 marketplace 镜像只保留安装量最高的一条 (2026-06-13) |
| T074 | bug | Skill 社区提示 `Cannot find package 'agent-skills-cli'`：ESM 动态 import 在打包后 asar 中无法解析到外部 node_modules | P1 | ✅ 已修复 — 4 处 `import('agent-skills-cli')` 全部加 `__filename.includes('.asar')` 保护，asar 内跳过动态导入 (2026-06-13) |
| T072 | bug | **i18n: ConfirmDialog.vue `t` 未定义** — `<script setup>` 中直接调用 `t('common.confirm')` 但从未 `import { useI18n }`，运行时报 ReferenceError 导致所有确认弹窗崩溃 | P0 | ✅ 已修复 — `494dc85`：添加 `import { useI18n }` + `const { t } = useI18n()` |
| T073 | feature | **i18n: codeHub/index.vue 未迁移** — locale JSON 中有完整的 `codehub` 段（20+ key），但 codeHub 组件 10+ 处用户可见文本仍硬编码中文 | P1 | ✅ 已修复 — `494dc85`：11 处全部迁移至 `$t('codehub.*')` |
| T074 | feature | **i18n: main 进程未集成** — `localeHelper.t()` 已在 `electron/index.js` 中 IPC 接线（load/saveLocale），但 `claudeAgent.js` 和 `codexAgent.js` 所有用户可见错误仍硬编码中文（~15 处），localeHelper 从未被调用 | P1 | ✅ 已修复 — `494dc85`：claudeAgent 12 处 + codexAgent 17 处接入 `lt()`，localeHelper 新增 ~25 个 key |
| T075 | bug | **i18n: Agent 描述未翻译** — `agentRegistry.js` 新增 `descriptionKey` 字段但 `AgentPicker.vue` 和 `codeHub/index.vue` 仍使用 `agent.description`（硬编码中文） | P2 | ✅ 已修复 — `494dc85`：AgentPicker + codeHub 均改为 `$t(agent.descriptionKey)` |
| T076 | feature | **i18n: APISetting.vue 残留未翻译** — 5 处硬编码中文遗留：`检查中…`/`检查更新`/`已安装`/`未安装`（三元表达式内）、`okText: '立即更新'`、`ElMessage.warning('未找到可导入的配置')` | P2 | ✅ 已修复 — `494dc85`：claudeCode + codeX 双 APISetting 三元表达式全部迁移 |
| T077 | feature | **i18n: ChatView.vue 残留未翻译** — 3 处遗漏：`'新对话'` fallback、`title="清空上下文"`、`title="压缩上下文（AI 摘要）"`（文本已转但 title 属性未转） | P2 | ✅ 已修复 — `494dc85`：3 处 title + 2 处文本全部迁移 |
| T078 | feature | **i18n: 系统提示词未随 locale 切换** — `claudeAgent.js:1488` 硬编码 `'你是一个中文助手...'` 不随语言设置变化 | P2 | ⚠️ 保留 — 当前设计为中文助手产品定位，暂不需要国际化 |
| T079 | housekeeping | **i18n: 迁移脚本清理** — 根目录 `_i18n_migrate.py`、`_i18n_migrate2.py`、`_i18n_migrate3.py`、`_check_keys.py` 为一次性工具，不应提交到仓库 | P3 | ✅ 已清理 — `494dc85`：4 个脚本已删除，`.gitignore` 添加 `__pycache__/` |
| T080 | feature | **i18n Round 2: 全面脚本层迁移** — 25 commits / 80 files / +1349 -526，覆盖 claudeCode/index.vue (~50 处)、codeX/index.vue (~45 处)、APISetting script 层、ManagePlugins/ManageSkills、MentionPopup、ClaudeTaskBar、ToolTodo/ToolGeneric/ToolWrite/PlanReviewDialog/AskQuestionDialog 等 31 个组件工具 Vue 文件 | P1 | ✅ 已完成 (2026-06-13)，commit `e5a38d4` |
| T081 | bug | ~~i18n: 4 个 key 在 en.json 中缺失~~ → 已合并到 T085，`d0629f3` 已修复 | P1 | ✅ 已修复 |
| T082 | cleanup | ~~i18n: 重复 key `noTodo`~~ → 已合并到 T085，`d0629f3` 已修复 | P3 | ✅ 已修复 |
| T083 | feature | **pluginManager.js 未接线** — `electron/mainModules/pluginManager.js`（399 行）是新的插件管理器模块，但未在 `electron/index.js` 或 `electron/main.js` 中 require/注册，目前为死代码 | P2 | ✅ 已修复 — `ed099fb`：main.js 中 `loadRegistry/scanAndValidate/scanDevPlugins/registerPluginHandlers` 全部接线 |
| T084 | feature | **Plugin Marketplace 全新功能** — 5 commits / 12 files / +973 -11：插件市场页面（PluginMarket.vue 461 行）、动态插件加载器（PluginView.vue 152 行）、pluginStore（127 行）、pluginManager 更新（+28 行）、侧边栏集成 + 动态路由、preload IPC 桥接（11 channels） | P1 | ✅ 已完成 (2026-06-13)，commit `1ee19c0` |
| T085 | bug | **i18n: 4 key 缺失 + noTodo 重复** — en.json 缺少 `agent.installedN/marketplaceN/todoTitle/executingSection`，两个 locale 的 `agent.noTodo` 重复定义 | P1 | ✅ 已修复 — `d0629f3`：补充 4 en key + 删除重复 noTodo |
| T086 | bug | **PluginView.goMarket() 跳转错误** — 未安装插件页面的"前往市场"按钮跳转到 `/main/home`（首页），而非 `/main/pluginMarket`（插件市场） | P3 | ✅ 已修复 — 改为 `router.push('/main/pluginMarket')` |
| T087 | feature | **v1.0.5 收尾** — 版本号升级 + 应用更新状态系统（autoUpdate 状态机 + SystemSettings.vue + Home footer）+ 9 个 locale 新 key（814:814 对等） | P1 | ✅ 已完成 (2026-06-13)，待提交 |
| T088 | bug | **Home.vue checkForUpdate() 缺少 guard** — 若 `window.electronAPI.checkForUpdates` 为 undefined（web 模式/加载失败），`updateChecking` 永久为 true，按钮永久 disabled | P3 | ✅ 已修复 — 添加 `if (!window.electronAPI?.checkForUpdates) return` |
| T121 | bug | **mdViewer 代码高亮颜色不跟随主题**：删除 `src/main.js` 中两个冲突的 hljs 主题 CSS 全局导入；`MarkdownViewer.vue` 新增 16 个 hljs token `:deep()` 样式映射 `--cc-hljs-*`；`CodeTextViewer.vue` 拆分为 9 组独立 token 规则引用 `--cc-hljs-*` 变量 | P1 | ✅ 已修复 |
| T122 | bug | **mdViewer 文字不可见（代码块/表格/标题/引用块）**：`MarkdownViewer.vue` 中 12 处硬编码颜色全部替换为 `var(--doc-*)` 变量（`--doc-text`/`--doc-paper`/`--doc-bg`/`--doc-line`），代码块 header/button/hljs 文字从 `#e5e7eb`→`var(--doc-text)`，标题从 `#111827`→`var(--doc-text)`，表格背景从 `#fff`→`var(--doc-paper)` | P1 | ✅ 已修复 |
| T123 | bug | **mdViewer 多个文档只有第一个能打开**：①`mdRouting.js`: `mdViewerReady` 时直发不入队，消除 keep-alive 下 pendingPayloads 泄漏；②`index.vue`: 监听器 dispose 改在 `onDeactivated` + `onActivated` 重注册；③`addPayload` 串行化（`payloadQueue` 替代 `void` fire-and-forget）；④catch 块设置 `content` 而非空 tab | P1 | ✅ 已修复 |

## T116 详情：Claude 会话中断后 dangling tool_use 恢复

### 现象

某些 Claude 会话在工具调用阶段中断后，JSONL 文件仍然可读，但最后只剩一个未闭合的 `tool_use`：

- 没有对应 `tool_result`
- 没有最终 `result`
- 重新打开会话后，UI 里工具卡片停在 pending/running
- 原会话无法自然继续，用户往往只能重开新 session

### 已确认线索

- 该问题不是 JSONL 文件损坏。
- 现有恢复逻辑把这类 turn 当作正常完成边界处理，导致 `done` 语义偏乐观。
- `shouldReloadClaudeChatFromDisk()` 只保护运行中 pending 工具，不足以区分重启后的僵尸 pending。
- 本地会话需要在恢复时把 dangling tool 收口为 interrupted/failed，再允许继续输入。

### 修复目标

1. 识别 dangling `tool_use`。
2. 恢复时把未完成工具标为 `interrupted`。
3. `done` 不再把这类 turn 记成 `completed`。
4. 会话恢复后继续可输入，不要求新建 session。

### 计划文档

详见 `[docs/plan/2026-06-15-claude-dangling-tool-use-recovery.md](./plan/2026-06-15-claude-dangling-tool-use-recovery.md)`。

### 实现记录

- `packages/agent/src/components/claudeCode/utils/sessionIntegrity.mjs`
- `packages/agent/src/components/claudeCode/index.vue`
- `packages/agent/src/components/claudeCode/utils/sessionRefreshGuard.mjs`
- `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js`
- `packages/agent/electron/claudeAgent.js`
- `tests/claude-session-integrity.test.mjs`
- `tests/claude-agent-done-payload.test.cjs`
- `tests/claude-session-refresh-guard.test.mjs`

## T047 详情：工具栏 @ 选择文件时输入框有文字就选不了

### 现象

工具栏 @ 按钮点击后，若输入框里已有文字，则：
- 文件选择弹窗可能不出现；
- 或者弹窗出现了但点击某个文件后没有任何反应（文字没有插入）。

### 根因分析

**关键正则**：`(?:^|\s)@([^\s@]*)$` —— 要求 `@` 前面必须是空白字符或行首。

**问题链路**：

1. `triggerMention()`（`claudeCode/index.vue:1387` / `codeX/index.vue:580`）调用 `insertTextAtCaret('@')`
2. `insertTextAtCaret` 把 `@` 直接插到已有文字末尾，例如 `"hello"` → `"hello@"`（**没有前导空格**）
3. 值变更触发 `@input` → `onInputChange(e)` 同步执行
4. `onInputChange` → `extractMentionQuery(inputText, selectionStart)` 查 `"hello@"`，正则 `(?:^|\s)@` 不匹配（`o` 在 `@` 前面但不是空白）→ 返回 `null` → `clearMentionSuggestions()`
5. 虽然 `triggerMention` 的 `nextTick` 里显式调了 `refreshMentionSuggestions('')` 试图补刀，但这一步已经产生竞争
6. 即使弹窗出现了，用户点击某一项 → `applyMention(item)`（`claudeCode/index.vue:1364` / `codeX/index.vue:539`）**同样用同一个正则去定位 `@`** → 正则不匹配 → **`if (!match) return` 静默返回，什么都不发生**

### 影响范围

- `packages/agent/src/components/claudeCode/index.vue` — `triggerMention()` (L1387)、`applyMention()` (L1364)
- `packages/agent/src/components/codeX/index.vue` — `triggerMention()` (L580)、`applyMention()` (L539)

### 修复方向

`triggerMention()` 中，读取光标前字符，若为有效文字（非空/非空白），则插入 ` @`（带前导空格）而非 `@`：

```js
function triggerMention() {
  const text = inputText.value || ''
  const el = inputEl.value
  const caretPos = Number.isInteger(el?.selectionStart) ? el.selectionStart : text.length
  const charBefore = caretPos > 0 ? text[caretPos - 1] : ''
  const needsSpace = charBefore && charBefore !== ' ' && charBefore !== '\n'
  insertTextAtCaret(needsSpace ? ' @' : '@')
  nextTick(() => {
    refreshMentionSuggestions('')
    inputEl.value?.focus()
  })
}
```

### 备注

- 手动敲 `@` 触发 mention 的路径不受影响（用户自然会敲空格或从行首开始）
- 两个 Agent 的实现几乎一样，应该统一修复

## T048 详情：CodeX "额外目录" 默认展开/收缩 + 缓存问题

### 现象

1. **默认展开**：不管有没有设置额外目录，"项目设置"区域始终默认展开
2. **缓存丢失**：选择过的额外目录文件夹在关闭侧栏/刷新/切换项目后可能消失

### 根因分析

#### 子问题 A：默认展开/收缩

`HistorySidebar.vue:224`：

```js
const psExpanded = ref(true)   // 永远 true
```

没有根据 `projectAdditionalDirs` 是否有值来初始化。

#### 子问题 B：缓存/数据流断裂

数据流有两条路径，存在不一致：

**路径 1（IPC 持久化）—— 主进程正常**：
- `setProjectAdditionalDirs()` → `codexSetProjectSettings(cwd, {additionalDirectories})` → 主进程 `Conf` 写入磁盘 ✅
- `loadProjectSettings()` → `codexGetProjectSettings(cwd)` → 主进程 `Conf` 读取 ✅

**路径 2（面板状态序列化）—— 缺失 `additionalDirectories`**：
- `useCodexHistory.js` `buildPanelState()` (L76-89)：序列化 `projects` 时 **没有包含 `additionalDirectories`**
- `applyProjects()` (L131-148)：恢复 project 对象时 **没有恢复 `additionalDirectories`**
- `loadProjectSettings()` 只在 `switchProject` 首次（`_settingsLoaded === false` 时）调用一次

**问题场景**：
1. 用户添加额外目录 → `additionalDirectories` 写入内存（project 对象）和 IPC 持久层
2. 面板状态序列化时丢失该字段 → 若发生面板状态重建（如 `applyProjects`），project 的 `additionalDirectories` 变为 `undefined`
3. 此后需等待 `switchProject` → `loadProjectSettings` 异步补回 → 但若 `_settingsLoaded` 已是 `true`，**不会再加载**
4. 用户看到：文件夹没了

### 影响范围

- `packages/agent/src/components/codeX/components/HistorySidebar.vue` — `psExpanded` (L224)
- `packages/agent/src/components/codeX/composables/useCodexHistory.js` — `buildPanelState` (L76)、`applyProjects` (L131)
- `packages/agent/src/components/codeX/index.vue` — `loadProjectSettings` (L363)、`setProjectAdditionalDirs` (L332)

### 修复方向

**子问题 A**：
```js
// 根据是否有目录来决定默认展开/收缩
const psExpanded = ref(props.projectAdditionalDirs?.length > 0)
// 或者 watch projectAdditionalDirs 变化来联动
```

**子问题 B**：
1. `buildPanelState()` 中序列化 `additionalDirectories: p.additionalDirectories || []`
2. `applyProjects()` 中恢复 `additionalDirectories: p.additionalDirectories || []`
3. 或者：保持 IPC 持久化为主路径，但确保 `loadProjectSettings` 在每次 project 激活时都可靠执行（去掉 `_settingsLoaded` 的一次性限制，改用更稳健的策略）

## T050 详情：任务完成通知系统修复

### 问题

1. **提示音不稳定**：codeX 每次创建/销毁 AudioContext 可能被 autoplay 策略挂起；ClaudeCode 完全没有提示音
2. **导航栏缺少提醒**：后台项目结束后，侧边栏"项目"图标不会亮，用户不知道有任务完成
3. **"编程"命名不直观**：侧边栏导航项叫"编程"，用户觉得"项目"更准确
4. **任务栏闪烁确认**：验证 flashFrame 链路完整

### 修复

1. **提示音**：提取 `playDoneSound` 到 `agentCommon/utils/playDoneSound.js`，使用持久 AudioContext + 播放前 `resume()`；ClaudeCode 补上 `onTaskDone` 回调；提示音移到 `shouldNotifyOnTaskDone` 之外 — **任何任务完成都响，不受窗口焦点/活跃 Tab 影响**
2. **侧边栏提醒**：Main.vue 提供 `codehubHasNotification` ref，codeHub 监听 `unifiedTabs` 中 `hasDoneNotification` 并更新；侧边栏"项目"图标增加脉冲动画 + 右上角橙色圆点
3. **重命名**：`src/Main.vue` 侧边栏标签和 title `"编程"` → `"项目"`
4. **任务栏闪烁**：`flash-taskbar` IPC → `win.flashFrame(true)` 链路完整，仅在后台/非活跃项目时触发

### 影响文件

- `packages/agent/src/components/agentCommon/utils/playDoneSound.js` (新增)
- `packages/agent/src/components/codeX/index.vue` — 改用共享 playDoneSound
- `packages/agent/src/components/codeX/composables/useCodexAgentStream.js` — onTaskDone 移到 shouldNotifyOnTaskDone 之外
- `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js` — 新增 onTaskDone 参数 + reason 判断
- `packages/agent/src/components/claudeCode/index.vue` — 引入 playDoneSound，传入 useClaudeAgentStream
- `packages/agent/src/components/codeHub/index.vue` — inject codehubHasNotification，watch unifiedTabs
- `src/Main.vue` — provide codehubHasNotification，侧边栏通知 CSS，标签重命名

## T053 详情：CodeX `filterCodexSystemMessages` 系统标签泄漏

### 现象

CodeX 刷新后，用户气泡显示 SDK 注入的完整系统上下文：`<INSTRUCTIONS>`（含 AGENTS.md 全文）、`<environment_context>`（cwd/shell/date）等 XML 块，以及 "AGENTS.md instructions for ..."、bash 命令等非 XML 前缀文本。

### 根因

`filterCodexSystemMessages`（CodeX 的 JSONL 消息过滤管线）在处理 `role === 'user'` 消息时：

1. `stripCodexSystemContextTags` 被调用**仅用于 `hasRealText` 判断**（决定是否过滤整条消息）
2. **从不修改消息的 `m.text` / `m.content`**——系统标签原封不动保留
3. 消息通过过滤后直接展示，含全部系统上下文

对比 ClaudeCode 的 `normalizeFlatSessionMessagesToUiMessages` / `normalizeSessionEventsToUiMessages`——它们在构建 `out.push({text: ..., content: ...})` 时使用剥离后的文本。

### 修复

在 `filterCodexSystemMessages` 的 `role === 'user'` 处理末尾，`hasRealText` 检查通过后、返回前，显式对 `m.text` 和 `m.content` 的每个文本块调用 `stripCodexSystemContextTags` 进行剥离。

改动量：CodeX `index.vue` 中 `filterCodexSystemMessages` 函数内加 10 行（两个仓库同步）。

### 影响文件

- `packages/agent/src/components/codeX/index.vue` — `filterCodexSystemMessages`（L2241 后）
- `packages/agent/src/components/codeX/index.vue` — mindcraft-electron 同步

### 备注

- 非 XML 前缀文本（如 "AGENTS.md instructions for ..." 行）不属于 XML 标签剥离范围，需要后续考虑是否用模式匹配处理
- ClaudeCode 不受影响——它的 normalize 函数一直在正确剥离

## T045 当前状态

- `packages/agent` 已落地，包含 renderer / electron / preload 三个入口
- Full 版宿主已经切到共享层接线
- 旧的宿主侧 Agent 主体实现已移除，不再保留双份源码
- 关键回归与构建已通过
- 当前阶段不再继续大规模拆分，后续以正常修 Bug 和支撑 `mindcraft-agent` 复用为主

## mindcraft-agent 下一步建议

1. 明确 `mindcraft-agent` 保留的 Agent 能力边界。
2. 先做宿主层裁剪设计，不急着继续拆共享层。
3. 只有出现 Full / Agent 明确分叉点时，再追加共享配置抽象。

## 最近完成

| 日期 | 分类 | 说明 |
|------|------|------|
| 2026-06-17 | plan | **设计能力集成方案 v1 完成**：基于 Open Design 参考项目分析，输出 `docs/plan/2026-06-17-design-features-integration.md`。涵盖三层增量（craft 知识注入 / 分屏预览 / 场景化交互）、4 个 Phase（0→3）、10 个文件变更清单、6 项关键设计决策。所有新功能默认关闭。详见 T124。 |
| 2026-06-16 | bug | 表格渲染修复：表头/数据行检测切换为 splitTableRow + 列数一致性校验，支持缺首尾管道；分隔行连字符 ≥3→≥1（GFM）；段落断行同步更新。新增 14 项表格测试。 |
| 2026-06-16 | bug | 文档路径链接化修复：`linkifyStrongLocalPaths` 正则恢复白名单目录前缀分支（`docs\|src\|packages\|...`），修复 `docs/TODO` 等无扩展名路径无法渲染为可点击链接的回归。新增 12 项路径链接化回归测试。 |
| 2026-06-16 | docs | **settings.json 污染分析 v2**：基于 `sdk.d.ts` Settings interface 重新验证，纠正 `autoCompactWindow` 误判（合法 SDK 字段）、补充 `effortLevel` 三处定义不一致分析。新建 `docs/sdk-feature-gaps.md` 全量 SDK 未集成功能全景（入口函数/query options/运行时控制/hooks/MCP/插件/Codex）。TODO 新增 T118（污染清理）、T119（CLAUDE.md 红线修正）。 |
| 2026-06-16 | bug | T105: ClaudeCode effortLevel 白名单补 xhigh（`b53be01`）；T108-T111: CodeX sandbox 重构 permissionPolicy→sandboxMode（`171c936`）；T113-T115: sandbox labels 国际化 + toast 文案 + migrateValue 去重；T107/B029: 恢复 `streamClosed=true` in triggerDone，前端 flushQueuedInput 回退（`551ca6b`）；**架构文档 SDK 接口核对**（`docs/agent-architecture.md` §11-14 新增） |
| 2026-06-13 | refactor | Chat：删除 Chat Completions 回退，统一用 Responses API；新增 `reasoning_summary_text.delta` 处理；CodeX 通路 60s 超时 + thinking 50K 上限；渲染端 timeout stop_reason 处理；gitignore `_test/` 测试目录（commit `d1eb6d2`） |
| 2026-06-13 | bug | Chat thinking/卡死修复（commit `b19846b`）：Anthropic 通路 thinking 50K 上限 + 60s 超时；实测 `thinking: { type: 'disabled' }` 对 deepseek-v4-flash 有效；实测 OpenAI 通路 `reasoning.effort` 影响耗时但 reasoning 文本几乎不可见 |
| 2026-06-12 | housekeeping | 死依赖清理（T069）：移除 19 个未使用 npm 包 + 5 个死代码文件 + .babelrc + vite vendor chunk，node_modules 减少约 90 MB |
| 2026-06-12 | bug | 修复表格渲染失败：①表头/数据行检测从严格正则切换为 splitTableRow + 列数一致性校验，支持缺首尾管道格式（`A \| B` / `\| A \| B`）②分隔行连字符 ≥3 放宽为 ≥1（对齐 GFM）③段落断行同步更新防止贪婪吃掉表格行。新增 14 项表格测试覆盖 GFM 变体/防误报/路径链接共存/块元素组合 |
| 2026-06-12 | bug | 修复 T067 插件/Skill 市场不可用：①Skills "推荐" tab 为空 — 新增 `build/generate-skills-catalog.js` 构建时从 agent-skills-cli API 拉取 Top 100 生成 catalog 文件，skills-get-state handler 增加运行时 API 兜底 ②ClaudeCode 插件全部"未安装" — plugins-get-state 增加 name-based fallback 匹配解决 marketplace ID 不一致 |
| 2026-06-11 | bug | 修复 T057 ClaudeCode token 计数不对称：`getTokenMetrics` 中 input 取最后一轮（=）而 output 跨轮累加（+=），多轮对话后 in/out 比例诡异。统一为 = 赋值对齐 CodeX |
| 2026-06-12 | bug | 修复 T066 CodeX 对话卡住/中断 6 项：G1(前端返回值检查+锁定时序修复，~28行)/G2(thread.error→resultReceived，+3行)/G3(slowNotice+subtype+渲染，+8行)/G4(abortSession→await，~6行)/O1(return 0→结构化拒绝，改2行)/O2(late event _awaitingDone guard，1行)。核心思路：闭合前后端状态同步反馈缺口，不新增状态标志 |
| 2026-06-11 | bug | 修复 T064 dev 白屏+僵尸进程：`/side` 路由污染共享 localStorage 路由记忆（白屏根因，与端口无关）；修复 Electron 36 console-message 签名导致渲染报错被吞；新增 dev 守护自动回收孤儿进程 + 路由自检日志；恢复 HMR |
| 2026-06-11 | feature | 实现 T052 mindcraft-agent 一键导入 mindcraft-electron API 配置：Settings UI 增加按钮 + IPC handler + 多候选目录探测 + 文件夹选择兜底 |
| 2026-06-11 | bug+ux | 修复 T050 任务完成通知系统：提示音共享化/持久 AudioContext/ClaudeCode 补全/始终播放；侧边栏"项目"脉冲提醒；"编程"→"项目"；flashFrame 链路确认 |
| 2026-06-11 | bug | 修复 T055 从首页/文档切回会话 tab 不自动沉底：ClaudeCode onActivated + CodeX onActivated 中调用 scrollToBottom |
| 2026-06-11 | ux | 修复 T054 状态栏流速仪表盘：移除 input 速度，只保留 output 速度（in/out 双指标语义混淆 + Claude inputPerSec 多轮重复计数虚高） |
| 2026-06-12 | bug | 修复 T065 首页项目区域两个 bug：①项目名始终显示"新项目"——从 cwd 推导文件夹名（homeMetrics.js Claude `/[/\\]/` + CodeX `.replace(/\\/g,'/').split('/')`）；②点击不同项目都跳最近一个——homeMetrics 暴露 projectId + Home.vue `@click.stop` 带 `?agent=&projectId=` 跳转 + codeHub `restoreActiveTab()` 优先匹配 projectId |
| 2026-06-12 | doc | 创建打包/部署文档 `docs/build-and-deploy.md`：build.js 已知坑、正确打包命令、版本发布 step-by-step、图标缓存、latest.yml 上传清单、常见问题；更新 CLAUDE.md Build & Deploy Rules 章节 |
| 2026-06-12 | bug | 修复 T060-D 竞态修复的 keep-alive 回归：afb16f5 "始终排队到 pendingPayloads" 导致 mdViewer 已打开时新文档无人消费——onMounted 只调用一次 `getPendingMdContent`，keep-alive 保留组件实例后不再触发。改为双通道：入队兜底 + mdViewerReady 时直投 `send('md-content')`。`did-start-loading` 重置标志保证刷新场景不误投 |
| 2026-06-11 | bug | 修复 T053 CodeX `filterCodexSystemMessages` 系统标签泄漏：`hasRealText` 仅用剥离结果做过滤，未实际修改消息 `m.text`/`m.content` → `<INSTRUCTIONS>`/`<environment_context>` 原封不动展示 |
| 2026-06-11 | bug | 修复 T047/T048 @ 工具栏选择文件、目录钻入、平铺模式；CodeX 额外目录缓存 |
| 2026-06-11 | bug | 修复 T049 ClaudeCode 关闭 Tab 重开后自定义命名丢失：`selectDir` 漏传 `_userRenamed`（mindcraft-electron 同步修复） |
| 2026-06-11 | doc | 创建跨 Agent 会话陷阱全景图 `docs/session-pitfalls.md`，新增 5 大 trap pattern 和排查决策树；补充 agent-architecture.md 会话管理章节；更新 CLAUDE.md 排查路由 |
| 2026-06-11 | bug | 修复 T046 P0 根因 E/B/A：中断恢复死锁、Provider 切换清空 cliSessionIds、多 pending 盲匹配 |
| 2026-06-11 | bug | 修复 T046 P1/P2 根因 C/D：错误路径孤儿 JSONL（finally 块 fallback 扫描）、hasPendingNewChat 过时（循环内重新计算） |
| 2026-06-11 | bug | 修复 T046 P0-A 回归：`for await` 循环中 `sender` TDZ 错误，首次对话抛出 "Cannot access 'sender' before initialization"（`claude-agent-early-cli-session` 调用在 `const sender` 声明之前） |
| 2026-06-11 | bug | 定位 T046 ClaudeCode 会话重复的 5 个根因（A-E），更新专题文档 `docs/bugs/claude-session-duplicate-split.md` |
| 2026-06-10 | bug | 修复 Codex 同一 `sessionId` 重复 query 造成多次 cleanup / 旧 turn 收尾误清新 turn 状态的问题；主进程增加 run ownership，重复运行中请求直接忽略，cleanup/done/metrics 仅作用于当前 run |
| 2026-06-10 | bug | 补强 ClaudeCode 会话”接力”问题：加载/保存/刷新时清理重复 jsonl 绑定，补齐 active project/chat fallback，并同步 codeHub 顶部 tab；同日继续复现后确认还存在 renderer session 身份污染链路 |
| 2026-06-10 | bug | 修复 Claude 任务面板在会话内全局递增 task id 场景下无法收口的问题，改为 `TaskCreate -> 真实 task.id -> TaskUpdate` 显式绑定链路 |
| 2026-06-09 | refactor | 完成 Agent 抽离 Phase A，共享层收敛到 `packages/agent/**` |
| 2026-06-09 | bug | 修复 ClaudeCode 历史恢复时误切到旧会话的问题，恢复上次激活的 project/chat |
| 2026-06-09 | bug | 修复共享层 `localSearch` 的 bundled `rg` 路径与建议链路问题 |
| 2026-06-08 | bug | 修复 Codex 会话生命周期、状态栏、diff 恢复与任务卡显示等一轮问题 |

## 2026-06-12 Local Notes

- doc viewer: synced `src/components/mdViewer/viewerRegistry.mjs` code-text extensions with `electron/mainModules/documentLocator.js`
- added preview coverage for `.py`, `.java`, `.toml`, `.env`, `.sh`, `.c`, `.hpp`
- verified with:
  - `node --test tests/document-viewer-registry.test.mjs`
  - `node --test tests/document-tabs.test.mjs`
  - `node --test tests/document-locator.test.cjs`
- table rendering: fixed GFM pipe/hyphen detection in `render.js` (`splitTableRow` + column-count gating), 14 new tests in `agent-markdown-render.test.mjs`
- mdRouting: fixed T060-D regression — `afb16f5` always-queue broke keep-alive path; restored dual-channel (queue safety net + direct `send('md-content')` when `mdViewerReady`). Cross-commit analysis confirmed no other conflicts among 13 commits (2026-06-12)

## T068 详情：简易对话（Chat）功能方案

### 第二轮修复（2026-06-12，commit `deace67`）

用户实测反馈 9 项问题，全部修复：

1. **流式不生效/挂起**：根因是 `stream.finalMessage` 被当属性用（实为方法）；另移除 done 事件竞态，invoke 返回值为权威结果；所有流事件带 `chatId` 防串流
2. **看不到用户气泡**：用户消息现在先入会话再发请求（会话消息 = 单一数据源，API 消息按 provider 重建）
3. **模型选择**：接口分类（Anthropic/OpenAI）+ 从已配置 Provider 读取 tier 模型（Haiku/Sonnet/Opus/Reasoning）
4. **思考档位**：关/低/中/高 segmented 控件；Claude→budget_tokens(2048/8192/16384)，OpenAI→reasoning_effort；旧字段 thinkingEnabled/thinkingBudget 自动迁移为 thinkingLevel
5. **图片输入**：复用 useImageAttachments + ImageAttachmentBar，粘贴/拖拽即显示，多图上限 10
6. **死循环防护**：主进程 abort handler（claude/codex-chat-abort + AbortController Map）、SDK maxRetries:0、90s 无活动看门狗、工具循环上限 5
7. **等待提示 + 停止**：等待响应/深度思考中（N 字）指示、流式中红色停止按钮
8. **会话重命名**：双击标题或悬停编辑按钮内联改名；默认标题取首条用户消息前 30 字
9. **位置调整**：对话入口移至文档之后（侧边栏 + 首页卡片）

### 第三轮修复（2026-06-13，commits `b19846b` + `d1eb6d2`）

**问题**：deepseek-v4-flash 卡死（thinking 内容无上限 + 无总体超时）

**修复**：
- Anthropic + CodeX 两条通路均加安全上限：`MAX_THINKING_CHARS = 50_000`、60s `AbortSignal.timeout`
- Anthropic thinking 关闭：发送 `thinking: { type: 'disabled' }`（实测有效）
- CodeX 统一用 Responses API（删除 Chat Completions 回退）+ 新增 `reasoning_summary_text.delta` 事件处理
- 渲染端新增 `stop_reason: 'timeout'` 处理，显示错误并清理空气泡

**API 测试结论**（`_test/` 目录，已 gitignore）：

| 模型 | `reasoning_text.delta` | `reasoning_summary_text.delta` | effort 影响耗时 |
|------|:---:|:---:|:---:|
| deepseek-v4-flash (Anthropic) | N/A | N/A | `type: 'disabled'` 有效（0 chars thinking） |
| gpt-5.4 (Responses) | ❌ 0/3 | ⚠️ 1/3（非确定性） | ✅（none ~9s → medium ~15s → high ~42s） |
| gpt-5.5 (Responses) | ❌ 0/6 | ❌ 0/6 | ✅（none ~19s → medium ~35s） |

### 第四轮修复（2026-06-13）：qwen3.7-plus SSE 解析兼容

**问题**：qwen3.7-plus 模型返回空响应（含图片和无图片均空）。

**根因**：`claudeAgent.js` SSE 解析器检查 `startsWith('data: ')`（带空格），但 qwen3.7-plus 返回的 SSE 格式是 `data:{"type":...}`（无空格），所有事件被静默丢弃。

**跨模型 SSE 格式差异**（api.mindcraft.com.cn）：

| 模型 | SSE data 行格式 |
|------|------|
| deepseek-v4-pro | `data: {...}` (有空格) |
| deepseek-v4-flash | `data: {...}` (有空格) |
| **qwen3.7-plus** | **`data:{...}` (无空格)** ← Bug |
| claude-sonnet-4 | `data: {...}` (有空格) |

**修复**：`claudeAgent.js:1964` + `codexAgent.js:3420` 改为 `startsWith('data:')` + `trimmed.slice(5).trim()`，兼容两种格式。

### 第五轮修复（2026-06-13）：上下文自动压缩 + UI 清理

**新增**：`useChatStream.js`
- 粗糙 token 估算（中文 ~1.5 chars/token），模型对应上下文窗口（claude 180K / qwen/deepseek 100K / gpt-5 200K）
- 发送消息前自动检查：估算 token 超 70% 窗口时静默调用 `compressContext()` 压缩历史
- API 返回 `context_length_exceeded` 类错误时，提示用户手动压缩

**删除**：`ChatView.vue` 顶部右侧的 Claude/CodeX provider 标签（用户认为无意义）

### 定位

不绑定文件夹的轻量对话。豆包风格界面，解决「选文件夹太重」的痛点。

### 方案决策（2026-06-12 讨论结论）

- **路径 B**：新增独立 Agent 类型和组件，不复用现有 claudeAgent/codexAgent 引擎（太重，3000+ 行，深度绑定项目）
- **Provider 复用**：读取用户已在 ClaudeCode/CodeX 中配好的 API Key/URL/Model，零新配置
- **API 直调**：Anthropic Messages API（Claude 通路）+ OpenAI Responses API（CodeX 通路），绕过现有 Agent 引擎
- **第一期能力**：知识问答 + 网页搜索 + 图片输入
- **第一期不做**：文件解析（解析库 mammoth/xlsx/pdfjs-dist 是宿主 App 独占依赖，对 Agent 流程无用）
- **网页搜索**：自建通用 `web_search` tool schema，Electron 主进程执行 HTTP 搜索，结果回传 LLM
- **Agent 工具路由**：自建轻量 tool loop（~150 行），处理 tool_use → 执行 → tool_result 循环

### 组件树

```
ChatView.vue                    ← 新增，路由 /main/chat
├── ChatSidebar.vue             ← 对话列表（Step 6）
├── ChatMessageList.vue         ← 复用 agentCommon 渲染层
├── ChatInput.vue               ← 底部输入区
│   ├── ImageAttachmentBar      ← 复用
│   ├── 模型选择器 + 思考开关
│   ├── 搜索开关
│   └── 发送按钮
└── ImageLightbox               ← 复用
```

### 实现步骤

| Step | 内容 | 预估 |
|------|------|:---:|
| 1 | ChatView.vue + 路由 + 侧边栏入口 | ~200 行 |
| 2 | chatApi.js：读 Provider + Anthropic Messages API streaming | ~150 行 |
| 3 | Agent tool loop：web_search 工具 + 执行 + 回传 | ~100 行 |
| 4 | OpenAI Responses API adapter | ~100 行 |
| 5 | 图片输入（复用 useImageAttachments） | ~80 行 |
| 6 | 会话持久化 + 对话列表 | ~150 行 |
| 7 | 思考模式 + 深度选择 | ~50 行 |

**总预估：~800 行新增代码**。详见 `docs/chat-feature-plan.md`。

## T069 详情：死依赖清理

### 清理内容

移除 19 个未使用的 npm 包 + 对应死代码文件：

**删除的 dependencies（运行时）：**
- `browser-image-compression` — 未使用（useImageAttachments 直接 FileReader）
- `fabric-with-erasing` — 未使用（截图标注遗留）
- `js-audio-recorder` — 未使用（T039 语音功能未实现，包已放置）
- `marching-squares` — 已删（base64.js 的边缘工具函数）

**删除的 devDependencies（构建/工具）：**
- `babel-core`, `babel-loader`, `babel-preset-env`, `babel-preset-es2015`, `babel-preset-stage-0`, `babel-register` — Webpack 时代遗留，项目已用 Vite
- `@vue-office/docx`, `@vue-office/excel` — 从未被 import
- `exceljs`, `docx` — 从未被 import
- `jspdf`, `html2canvas`, `html2pdf.js`, `dom-to-image` — 从未被 import
- `file-saver`, `qrcode` — 从未被 import
- `mammoth`, `xlsx`, `pdfjs-dist`, `mockjs` — 仅被已删除的 UploadFile/fileHandler/mock 引用

**删除的死代码文件：**
- `.babelrc` — Babel 配置（Vite 不需要）
- `src/utils/fileHandler.js` — mammoth/xlsx/pdfjs-dist 的文件解析逻辑（仅 UploadFile 使用）
- `src/components/UploadFile/index.vue` — 文件上传/解析组件（依赖 fileHandler.js）
- `src/mock/index.js` — Mock 数据（依赖 mockjs）
- `src/utils/base64.js` — 边缘工具（依赖 marching-squares）

**构建配置更新：**
- `vite.config.js` — 移除 `vendor-doc-preview` 手动分块（mammoth/pdfjs-dist 已删除）

### 影响评估

- 构建通过，无引用断裂
- node_modules 减少约 90 MB
- 不影响 ClaudeCode/CodeX Agent 流程（仅删除宿主 App 独占功能）
- 文档预览（mdViewer）不受影响（UploadFile 和 mdViewer 是不同的功能）
# 2026-06-14 Codex 权限模式修复

- 已修复 Codex 主进程默认权限策略回退到 `allow_all`` 的问题；现在仅接受 `read_only | ask | allow_all`，非法值统一回退到 `ask`。
- 已收口 Codex 权限文案：`ask` 明确表示“安全模式（工作区可写）”，不再暗示审批交互。
- 已修复新 chat / 恢复 chat 的 `sandboxLevel` 初始化不清晰问题：新建 chat 在创建时即继承当前全局权限；恢复 chat 保留已有会话值，缺字段时按“已启动会话补 `ask`、未启动会话跟随当前全局”处理。
- 已补充 Codex 启动诊断日志，输出 `sessionId`、`cwd`、`permissionPolicy`、`sandboxMode`，用于继续定位”某项目不能改文件”的运行时原因。

---

# SDK 能力挖掘（2026-06-16 审计）

> 背景：用户问”SDK 和 CLI 支持多窗口多分支开发吗？”→ 完整审计发现 SDK 利用率仅 ~15%，大量原生能力闲置。

## 总体利用率

| 维度 | SDK 总量 | 已用 | 使用率 | 评价 |
|------|:--:|:--:|:--:|------|
| 导出函数 | 17 | 2 (`query`, `renameSession`) | 12% | 大量重复造轮子 |
| Options 字段 | 50+ | 15 | ~30% | 核心对话配置够用 |
| Query 控制方法 | 23 | 3 (`streamInput`, `supportedCommands`, `close`) | 13% | 很多即插即用闲置 |
| Hook 事件 | 26 | 1 (`PostCompact`) | 4% | **最大金矿** |
| 消息类型 | 30 | ~4 | 13% | 够用 |
| MCP 配置 | 全套 | 0 | 0% | 全靠 .mcp.json |
| 会话管理 | 8 函数 | 1 | 13% | 手动 JSONL 扫描 |
| SessionStore | 全套 | 0 | 0% | 无外部持久化 |

## 已用好 👍（核心链路扎实）

```
query() → streamInput() → for await (msg) → IPC → 渲染层
                │
        renameSession()
        supportedCommands()
        canUseTool (深度定制)
        PostCompact hook
```

## SDK 原生但 MindCraft 自己写了的（重复造轮子）

| MindCraft 自己写的 | SDK 等价的 | 文件位置 |
|---------|-----------|---------|
| `scanCliSessionsForProject()` 遍历目录 | `listSessions({ dir: cwd })` | `claudeAgent.js:369` |
| `extractClaudeSessionTitle()` 解析 JSONL 头 | `getSessionInfo(sessionId)` | `claudeAgent.js` |
| 自定义 `claude-read-session-file` IPC | `getSessionMessages(sessionId)` | `claudeAgent.js` |
| `fs.unlinkSync()` 删文件 | `deleteSession(sessionId)` | `claudeAgent.js` |
| （没做）| `tagSession()` 打标签 | — |
| （没做）| `forkSession()` 分叉 | — |

**用 SDK 的好处**：SDK 内部处理了 worktree、子代理记录、分页、边界情况。手动扫描容易漏。

## T089 详情：Per-session 模型选择

### 现状

SelectModel.vue 写入全局 `~/.claude/settings.json`，所有 session 共享同一模型。`tab.model` 字段仅记录上次用过的模型，不做决策。

### 目标

每个 session/tab 可以独立选择模型（Haiku/Sonnet/Opus/Reasoning）。不同分支用不同模型互不干扰。

### 方案思路

1. SelectModel 不再写全局 settings.json，改为更新当前 session/tab 的本地模型状态
2. 新建 session 时，从全局设置读取初始模型，创建后独立
3. `options.model` 已经是 per-query 的，只需改 UI 层数据流
4. 已有 session 切换模型时，当前采用下轮 query 生效；SDK 原生 `setModel()` 运行时切换已列入 T091，但暂缓实现。

### 改动点

- `SelectModel.vue` — 读/写目标从全局改为当前 session
- `claudeCode/index.vue` — tab.model 从记录型改为驱动型
- `claudeAgent.js` — options.model 改用 session 级别值（已支持，确认数据流）

## T090 详情：forkSession() 分支探索

### 现状

无分支功能。用户想从某条消息分叉探索不同方向，只能手动复制 JSONL（没人会做）。

### 当前结论（2026-06-17）

决定不做。多 tab 架构下，用户重描述一句目标即可得到新的探索分支；真正从中间消息 fork 会重新引入 `cliSessionId/filePath/chatKey` 绑定、历史恢复、标题/模型 sidecar 复制等复杂度。当前收益不足以覆盖会话身份链路回归风险。

### 目标

原目标是一键从当前会话分叉，生成新 sessionId，保留分叉前的完整历史，分叉后各自独立发展。该目标当前不实施。

### SDK 原生能力

```js
// SDK 已有，一行调用
const { newSessionId } = await forkSession(sessionId, {
  dir: cwd,
  title: `${原标题} (分支)`
})
// 然后用 newSessionId 创建新 query(options: { resume: newSessionId })
```

### 原方案思路（不执行）

1. 在消息气泡上加 “↗ 分叉” 按钮（hover 显示）
2. 点击 → IPC call → `sdk.forkSession(cliSessionId, { dir: cwd })`
3. 返回 newSessionId → 创建新 tab，`resume: newSessionId`
4. 新 tab 拥有分叉前的完整历史，从此独立发展

### 原改动点（不执行）

- `electron/claudeAgent.js` — 新增 `claude-fork-session` IPC handler
- `electron/preload.js` — 暴露 `forkSession` API
- `claudeCode/index.vue` — 消息气泡加分叉按钮 + createChat 支持 resume

## T091 详情：setModel() 运行时切模型

### 现状

切换模型已经由 T089 收敛为 session/tab 级状态；非运行中切换后，下轮 query 会使用新模型。

运行中切换模型目前不走 SDK 原生 `query.setModel()`。如果运行中真的发生模型变更，现有兜底仍可能关闭旧 query 并按新模型 resume/recreate；从产品角度这不是高频路径，优先保持稳定。

### 目标

暂缓。当前目标改为：运行中不鼓励切换模型，后续如需要再接入 SDK 原生 `query.setModel()`。

### SDK 原生能力

```js
// Query 对象上的方法，运行时直接切
await q.setModel('claude-sonnet-4-20250514')
// SDK 内部：发送 control request → claude.exe 进程内切换 → 下轮生效
```

### 方案思路

当前不实施。可选低风险 UX：

1. 输出中禁用模型选择入口。
2. 或允许选择但提示“当前回复完成后生效”。
3. 保留 T089 的 per-session/per-query 模型参数作为主路径。

如未来恢复 T091，再按以下方案：

1. `agentSessions` Map 中存活的 `Query` 对象直接调 `setModel()`
2. SelectModel 切换时，先检查当前 session 是否活跃，是则 `setModel()`，否则走重建
3. 对用户透明——无感知

### 改动点

- `claudeAgent.js` — 新增 `claude-set-model-runtime` IPC handler
- `SelectModel.vue` / `index.vue` — 区分活跃/非活跃 session，走不同路径

## T092 详情：Worktree 多分支隔离

### 现状

所有 session 共享同一个 `cwd`。切换分支后所有 session 跟着变。`getGitInfo()` 只读 branch name 做展示，不影响隔离。

### 目标

每个 session 可绑定到独立的 `git worktree` 路径，不同分支完全隔离。

### SDK 原生钩子

```js
// SDK 已有 worktree 生命周期钩子
hooks: {
  WorktreeCreate: [{ hooks: [async (input) => {
    // input.name → worktree 名称
    // 返回 worktreePath
    const wtPath = path.join(os.tmpdir(), 'mindcraft-worktrees', input.name)
    execSync(`git worktree add ${wtPath} ${branchName}`)
    return { worktreePath: wtPath }
  }] }],
  WorktreeRemove: [{ hooks: [async (input) => {
    execSync(`git worktree remove ${input.worktree_path}`)
  }] }]
}
```

SDK 还原生支持 `listSessions({ includeWorktrees: true })` 跨 worktree 列会话。

### 方案思路

**第一阶段（轻量）**：手动 worktree
- 用户手动 `git worktree add` 创建 worktree 目录
- MindCraft “打开项目”指向 worktree 目录 → 自动绑定到该分支
- 不同 session 指向不同 worktree 目录，天然隔离

**第二阶段（深度）**：SDK hook 驱动
- Claude session 内部可请求创建 worktree → 触发 `WorktreeCreate` hook
- MindCraft 在 hook 中执行 `git worktree add/remove`
- worktree 生命周期与 session 绑定

### 改动点（第一阶段）

- `claudeCode/index.vue` — createChat 时支持指定 cwd（已有，确认路径可用）
- `codeHub/index.vue` — 项目列表支持多个 cwd（同一个 git 仓库不同 worktree）
- 文档：用户指引

### 改动点（第二阶段）

- `claudeAgent.js` — options.hooks 增加 WorktreeCreate/Remove
- `electron/preload.js` — 暴露 worktree 管理 API
- 新增 UI：worktree 创建/切换/清理

## T093 详情：SDK 会话管理替换（暂缓）

### 现状

MindCraft 自己扫描 `~/.claude/projects/<cwd-hash>/` 目录、手动读 JSONL 文件头提取标题、`fs.unlinkSync` 删除文件。

### 当前结论（2026-06-17）

不建议按原方案全量替换。`@anthropic-ai/claude-agent-sdk@0.2.117` 的 `sdk.d.ts` 确实导出了 `listSessions/getSessionInfo/getSessionMessages/deleteSession/getSubagentMessages`，但这些 API 返回的是 SDK 通用会话视图，不能直接覆盖 MindCraft 当前依赖的 App 侧状态。

风险点：

- T089 的 per-session 模型历史上依赖同名 `.meta.json` sidecar；T134 Phase 3 后新写入迁到 registry，但 SDK list/delete 仍不知道 MindCraft registry 状态，替换主路径仍需要 join 和删除联动。
- 当前前端刷新包含 pending/draft chat adoption 防重复逻辑，直接换 listSessions 仍要维护 `cliSessionId/filePath/chatKey` 匹配。
- 历史恢复不仅是读消息，还包含分页、UI message normalize、dangling tool_use recovery、工具结果拼接等 App 兼容逻辑。
- 刚完成 T130/T089 会话身份收敛，此时替换扫描/删除/历史读取属于高回归风险，收益主要是“减少维护”，不值得现在冒险。
- SDK `includeWorktrees` 默认能力反而可能改变现有项目列表边界，需单独产品决策。

### 后续可做方案

先不替换主路径。后续如果要继续探索，只做低风险研究：

- 新增只读 adapter，对比 `scanCliSessionsForProject(cwd)` 与 `listSessions({ dir: cwd, includeWorktrees: false })` 的结果差异。
- adapter 输出必须补齐现有字段：`cliSessionId/filePath/createdAt/updatedAt/fileSize/title/isCustomTitle/model/effort`。
- 删除仍必须保证 `.jsonl`、registry record、历史 `.meta.json` fallback 同步处理；除非 SDK delete 后额外清理 registry/legacy sidecar 并有测试覆盖。
- 在测试覆盖 pending adoption、重复会话、历史分页、dangling recovery、registry meta/legacy sidecar 后，再考虑局部替换。

### 原方案（不再直接执行）

用 SDK 原生函数替换：

| 场景 | 当前 | 替换为 |
|------|------|--------|
| 历史列表 | `scanCliSessionsForProject(cwd)` 遍历目录 | `sdk.listSessions({ dir: cwd })` |
| 会话标题 | `extractClaudeSessionTitle()` 解析 JSONL 头 | `sdk.getSessionInfo(sessionId)` → `.title` |
| 读消息 | 自定义 IPC `claude-read-session-file` | `sdk.getSessionMessages(sessionId)` |
| 删会话 | `fs.unlinkSync(filePath)` | `sdk.deleteSession(sessionId)` |
| 读子代理 | 未实现 | `sdk.getSubagentMessages(sessionId, agentId)` |

### 理论好处

- SDK 处理了 worktree、子代理记录、分页、边界
- 减少维护成本
- `listSessions` 返回丰富元数据（title, lastActivity, messageCount, tags）

### 原改动点（暂不执行）

- `claudeAgent.js` — 新增 5 个 IPC handler，替换手动实现
- `claudeCode/index.vue` / composables — 调用新 IPC

## T094 详情：setPermissionMode() 运行时切换

### 现状

权限模式在创建 query 时固定为 `'default'`，对话中无法切换。

### 当前结论（2026-06-17）

决定不做运行时切换。权限模式属于低频设置，且和“当前 turn 已经在执行哪些工具/审批状态”强相关；运行中切换会增加 UI 语义和状态同步风险。当前保留“配置/新 query 生效”的模型更稳。

### SDK 原生

```js
await q.setPermissionMode('acceptEdits')  // 接受编辑，不再确认
await q.setPermissionMode('plan')         // 只读规划模式
await q.setPermissionMode('default')      // 恢复默认
```

### 原方案（不执行）

在对话工具栏加权限模式切换按钮（default / acceptEdits / plan），调用 SDK 运行时切换。

## T095 详情：getContextUsage() 实时上下文

### 现状

状态栏已经通过 JSONL 解析和流式事件展示 `contextUsage/contextWindow`，Claude/CodeX 都有现成 UI。SDK `getContextUsage()` 是运行中 Query 的控制方法，只适合增强活跃会话读数，不适合替代离线历史扫描。

### 当前结论（2026-06-17）

降级为 P3 暂缓。后续如果做，只做“运行中的只读增强”：活跃 Query 可定时/按需调用 `getContextUsage()` 校准状态栏；无活跃 Query 或历史会话仍走现有 JSONL/事件指标。不能作为一次大重构。

### SDK 原生

```js
const usage = await q.getContextUsage()
// { used_tokens, total_tokens, percent_used }
```

### 可选方案（暂不执行）

状态栏或上下文压缩区域显示实时用量（如 “120K / 180K (67%)”），超阈值变色预警。

## T099 详情：startup() 预热（性能实验）

### 现状

首轮 query 可能受 Claude CLI 子进程启动和初始化握手影响。SDK 提供 `startup()` 返回一次性的 `WarmQuery`，可提前完成初始化。

### 当前结论（2026-06-17）

降级为 P3 性能实验。预热不是免费优化：需要处理 provider/model/cwd/permission/settings 变化导致的 warm handle 失效，空闲进程回收，窗口关闭清理，以及多项目并发资源占用。未量化首轮启动耗时前不进入实现。

### 实验前置

- 先记录 cold start 从发送首条消息到 SDK init/first token 的耗时。
- 只允许 dev/feature flag 下开启单项目单 WarmQuery。
- 必须有 idle timeout 和配置变更失效策略。
- 若收益低于约 500ms 或资源占用明显，不做产品化。

---

## SDK 未使用功能全景图

### Options 字段（50+，已用 15）

| 字段 | 用途 | 优先级 |
|------|------|:--:|
| `agent` / `agents` | 自定义子代理定义 | P3 |
| `allowedTools` / `disallowedTools` | 工具白名单/黑名单 | P3 |
| `maxBudgetUsd` | 美元预算上限 | P3 |
| `fallbackModel` | 模型降级回退 | P3 |
| `outputFormat` | 结构化输出（json_schema） | P3 |
| `debug` / `debugFile` / `stderr` | 调试输出 | P3 |
| `mcpServers` | SDK 侧 MCP 服务器配置 | P3 |
| `onElicitation` | MCP 弹窗回调 | P3 |
| `includeHookEvents` / `includePartialMessages` | 流中包含钩子增量 | P3 |
| `plugins` | SDK 插件加载 | P3 |
| `promptSuggestions` | 预测下一 prompt | P3 |
| `agentProgressSummaries` | 子代理进度摘要 | P3 |
| `settings` | 自定义 settings 对象/路径 | P3 |
| `sandbox` | 沙箱配置 | P3 |
| `forkSession` | 分叉时用新 UUID | 不做(T090) |
| `resumeSessionAt` | 恢复到特定消息 | P2 |
| `continue` | 继续最近会话 | P3 |
| `sessionId` | 指定 UUID | P3 |
| `title` | 自定义初始标题 | P3 |

### Query 控制方法（23，已用 3）

| 方法 | 用途 | 优先级 |
|------|------|:--:|
| `setModel()` | 运行时切模型 | 不做(T091) |
| `setPermissionMode()` | 运行时改权限 | 不做(T094) |
| `interrupt()` | 中断当前执行 | P2 |
| `getContextUsage()` | 上下文用量 | P3 研究(T095) |
| `supportedModels()` | 可用模型列表 | P3(T102) |
| `supportedAgents()` | 子代理列表 | P3 |
| `mcpServerStatus()` | MCP 状态 | 不做(T100) |
| `accountInfo()` | 账户信息 | P3(T102) |
| `setMcpServers()` | 动态 MCP 配置 | 不做(T100) |
| `toggleMcpServer()` | 开关 MCP 服务器 | 不做(T100) |
| `reconnectMcpServer()` | 重连 MCP | P3 |
| `rewindFiles()` | 文件回滚 | 不做(T097) |
| `readFile()` | 远程文件读取 | P3 |
| `initializationResult()` | 初始化结果 | P3 |
| `applyFlagSettings()` | 运行时设 preference | P3 |
| `reloadPlugins()` | 重载插件 | P3 |
| `stopTask()` | 停止子任务 | P3 |
| `seedReadState()` | 预置读取状态 | P3 |

### Hook 事件（26，已用 1）

| Hook | 用途 | 优先级 |
|------|------|:--:|
| `PreToolUse` | 拦截工具调用 | 不做(T096) |
| `PostToolUse` | 工具执行后注入上下文 | P2 |
| `PostToolUseFailure` | 工具失败处理 | P3 |
| `Notification` | 系统通知 | P3 |
| `UserPromptSubmit` | 拦截用户提交 | P3 |
| `UserPromptExpansion` | 扩展用户 prompt | P3 |
| `SessionStart` | 会话启动注入 | 不做(T098) |
| `SessionEnd` | 会话结束清理 | 不做(T098) |
| `Stop` | 停止时回调 | 不做(T098) |
| `StopFailure` | 停止失败处理 | P3 |
| `SubagentStart/Stop` | 子代理生命周期 | P3 |
| `PreCompact` | 压缩前保留关键上下文 | P3 |
| `PermissionRequest` | 精细权限控制 | P3 |
| `PermissionDenied` | 权限拒绝处理 | P3 |
| `Setup` | 初始化/维护 | P3 |
| `TeammateIdle` | 队友空闲 | P3 |
| `TaskCreated/Completed` | 任务生命周期 | P3 |
| `Elicitation/ElicitationResult` | MCP 弹窗 | P3 |
| `ConfigChange` | 配置变更 | P3 |
| `WorktreeCreate/Remove` | Git worktree | 不做(T092) |
| `InstructionsLoaded` | 指令加载 | P3 |
| `CwdChanged` | 工作目录变更 | P3 |
| `FileChanged` | 文件变更 | P3 |

---

## 优先级总结

```
已完成:
  T089  Per-session 模型选择

不做:
  T090  forkSession() 分支探索
  T091  setModel() 运行时切模型
  T092  Worktree 多分支隔离
  T094  setPermissionMode() 运行时切换
  T096  PreToolUse hook
  T097  rewindFiles() 代码回滚
  T098  SessionStart/Stop hooks
  T100  MCP 动态管理
  T101  tagSession() 标签

P3 研究/实验:
  T093  SDK 会话管理替换（只读 adapter 对比，不替换主路径）
  T095  getContextUsage() 实时上下文（仅运行中只读增强）
  T099  startup() 预热（先量化 cold start）
  T102  supportedModels/accountInfo（低优先级，需另行注册详情）
```

## T106 详情：agentRegistryComponents.js 静态 import 导致代码分割失效

### 现状

`packages/agent/src/registry/agentRegistryComponents.js` 用 4 个 `import` 静态导入了：

```js
import ClaudeCodePanel  from '../components/claudeCode/index.vue'     // → 整个 ClaudeCode 组件树
import CodexPanel       from '../components/codeX/index.vue'          // → 整个 CodeX 组件树
import ClaudeAPISetting from '../components/claudeCode/components/APISetting.vue'
import CodexAPISetting  from '../components/codeX/components/APISetting.vue'
```

### 导入链

```
Settings 面板 & CodeHub 面板
  └─ import { useAgentRegistry } from '@mindcraft/agent'
       └─ packages/agent/src/index.js → useAgentRegistry.js
            └─ agentRegistryComponents.js
                 ├─ ClaudeCodePanel   → index.vue → InputToolbar/SelectModel/ProjectTabs/...
                 ├─ CodexPanel        → index.vue → CodeX 全部组件
                 ├─ ClaudeAPISetting  → APISetting.vue → 全部依赖
                 └─ CodexAPISetting   → APISetting.vue → 全部依赖
```

### 后果

Vite 把 `useAgentRegistry` 提取到 `SharedSettings-4805cc66.js` 共享 chunk，但 **4 个静态 import 的整个组件树也被拖了进去**。生产构建：

| Chunk | 大小 | 实际内容 |
|-------|------|---------|
| `SharedSettings-4805cc66.js` | **428 KB** | Settings 面板 + ClaudeCode 全部 + CodeX 全部 |
| `index-71188622.js` (CodeHub 路由) | 36 KB | 仅剩 Tab 切换壳代码 |

**代码分割完全失效**：用户打开 Settings 页面时已把两个 Agent 的全部代码加载完毕。

### 修复方案

改为动态 import（`() => import(...)`），Vue `<component :is>` 原生支持 async 组件：

```js
// 改前 — 静态 import，全加载
import ClaudeCodePanel from '../components/claudeCode/index.vue'
export const AGENT_COMPONENTS = {
  claudeCode: { panel: ClaudeCodePanel, settings: ClaudeAPISetting },
}

// 改后 — 动态 import，按需加载
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
```

### 风险评估：低

- 唯一消费者：`useAgentRegistry.js` → `agents` computed
- 两个下游：`codeHub/index.vue` (`:is="agent.component"`) 和 `Settings.vue` (`:is="t.settingsComponent"`)
- Vue `<component :is>` 原生支持 `() => import(...)` 返回的 async 组件，无需改模板
- 无代码同步访问 `agent.component.props` 等属性
- 全局只有 `useAgentRegistry.js` 一个文件 import `agentRegistryComponents`

### 与 Toolbar Bug 的可能关联

`onErrorCaptured` 在 `claudeCode/index.vue:262` 返回 `false` → Vue 静默卸载出错组件。如果 SharedSettings chunk 中大量组件在模块求值阶段触发异常（而非 mount 时），错误传播路径可能与正常加载不同。动态 import 恢复正常的 chunk 分割后，这种异常可能自然消失。

### 改动文件

只需改 1 个文件：`packages/agent/src/registry/agentRegistryComponents.js`（~10 行）

## T120 详情：CodeX config.toml/auth.json 污染修复

> 创建：2026-06-16 | 参照：cc-switch `codex_config.rs`
> 关联：`docs/settings-json-pollution.md`（同类问题，~/.claude/settings.json 侧）

### 问题

用户先用 cc-switch 格式配好 `~/.codex/config.toml` → CLI 正常工作 → 打开 App 启用 provider → App 覆写了 config.toml 和 auth.json → 切回 CLI 后不可用。

### 根因（3 个）

| # | 根因 | 严重度 |
|---|------|--------|
| 1 | `env_key = "OPENAI_API_KEY"` 替代了 `experimental_bearer_token`。前者让 CLI 去查环境变量（通常没设），后者直接把 token 给 CLI。 | 🔴 致命 |
| 2 | `applyProvider()` 覆写 `auth.json` 为 `{OPENAI_API_KEY: "sk-xxx"}`，丢失原有登录状态。cc-switch 第三方 provider 从不碰此文件。 | 🟡 严重 |
| 3 | `mergeManagedProviderToml()` 用字符串正则操作，不保留 TOML 注释/格式/未知 section。 | 🟡 不稳定 |

### cc-switch 的标准做法

```
第三方 provider 的 config.toml:
  model_provider = "vendor_x"
  model = "gpt-5"
  [model_providers.vendor_x]
  name = "Vendor X"
  base_url = "https://api.example.com/v1"
  experimental_bearer_token = "sk-xxx"    ← 认证直接写进 toml

auth.json: 不碰！
```

关键函数：`prepare_codex_provider_live_config()` — 从 `auth.OPENAI_API_KEY` 取 key，用 `set_codex_experimental_bearer_token()` 注入 `[model_providers.<id>].experimental_bearer_token`，仅写 config.toml。

### 修复方案

#### Step 1: `providerToml.mjs` — 改 TOML 生成

**文件**: `packages/agent/src/components/codeX/utils/providerToml.mjs`

`buildManagedProviderToml()`:
- 移除 `env_key = "..."` 行
- 新增 `experimental_bearer_token = "sk-xxx"` 行
- `apiKey` 参数从调用方传入

改前：
```js
out.push(`env_key = ${quoteTomlString(envKey)}`)
```

改后：
```js
const apiKey = String(provider.apiKey || '').trim()
if (apiKey) out.push(`experimental_bearer_token = ${quoteTomlString(apiKey)}`)
```

#### Step 2: `APISetting.vue` — 不再写 auth.json

**文件**: `packages/agent/src/components/codeX/components/APISetting.vue`

`applyProvider()` (L342-363):
- 删除 `codexWriteAuthJson()` 调用（L348）
- `buildDefaultToml()` 调用传入 apiKey

改前 L348-353:
```js
await window.electronAPI?.codexWriteAuthJson?.(JSON.parse(JSON.stringify(p.authJson || {})))
if (p.tomlText) {
    const mergedToml = await mergeTomlModelConfig(p.tomlText)
    await window.electronAPI?.codexWriteConfigToml?.(mergedToml)
}
```

改后:
```js
if (p.tomlText) {
    const mergedToml = await mergeTomlModelConfig(p.tomlText)
    await window.electronAPI?.codexWriteConfigToml?.(mergedToml)
}
```

`buildDefaultToml()` 调用点也同步传入 apiKey。

#### Step 3: `ProviderForm.vue` — 表单生成 TOML 时传入 key

**文件**: `packages/agent/src/components/codeX/components/ProviderForm.vue`

`buildDefaultToml()` (L153-163): 传入 `form.key` 作为 apiKey。

`syncManagedTomlFromForm()` (L165-174): 同上。

#### Step 4: `codexAgent.js` — 后端 handler 适配

**文件**: `packages/agent/electron/codexAgent.js`

`codex-write-auth-json` handler (L3059-3065): 保留但加日志，防止官方 provider 路径仍需使用。当前第三方 provider 路径不再调用此 handler。

`codex-write-config-toml` handler (L3074-3100): 当前已正确保留 `[plugins.*]`/`[marketplaces.*]` 段，`experimental_bearer_token` 在 `[model_providers.<id>]` 内不需要额外保护。无需改动。

#### Step 5: 清理 `env_key` 残留

在代码中搜索 `env_key` / `envKey`，确认只有 providerToml.mjs 使用并已修改。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/agent/src/components/codeX/utils/providerToml.mjs` | `buildManagedProviderToml()`: `env_key`→`experimental_bearer_token` + apiKey 参数 |
| `packages/agent/src/components/codeX/components/APISetting.vue` | `applyProvider()`: 删 `codexWriteAuthJson`; `buildDefaultToml`: 传 apiKey |
| `packages/agent/src/components/codeX/components/ProviderForm.vue` | `buildDefaultToml`/`syncManagedTomlFromForm`: 传 `form.key` |

### 不涉及的改动

- ~~引入 `@iarna/toml`~~：当前逻辑只替换 model 相关段，其余内容（含 `[trust]`/`[mcp_servers]` 等 CLI 原生段）在 `mergeManagedProviderToml()` 中已保留。改 `experimental_bearer_token` 后不再需要 TOML 语法保留库。
- ~~删除 `codex-write-auth-json` handler~~：保留，未来官方 provider/登录路径可能用到。

### 验证

1. 用 cc-switch 格式配好 `~/.codex/config.toml` → CLI 正常
2. 打开 App，配置并启用 mindcraft provider
3. 检查 `~/.codex/config.toml`：`[model_providers.mindcraft]` 段应有 `experimental_bearer_token`，无 `env_key`
4. 检查 `~/.codex/auth.json`：未被覆盖
5. 切回 CLI → `codex` 正常工作 ✅
# 2026-06-16 local status

- mdViewer follow-up fixed: multi-document open/recovery, code/markdown theming, recent doc names, plain path links, inline-code path links, and Element Plus tab theme colors.
- Verified with build, npm test, and targeted mdViewer/render/document tests. Full wildcard test run still has unrelated existing failures.

## 2026-06-16 local status - T120 follow-up

- Completed manual CodeX/Codex CLI config repair entry: settings now exposes `Repair Codex CLI Config`.
- Repair path backs up `~/.codex/config.toml` as `config.toml.mindcraft-bak-YYYYMMDD-HHMMSS`, rewrites managed provider config to `experimental_bearer_token`, and does not touch `auth.json`.
- Provider activation now regenerates TOML from provider fields instead of reusing stale `tomlText`, so old `env_key` content is not re-applied.
- CodeX effort values are normalized to Codex CLI values: `minimal`, `low`, `medium`, `high`, `xhigh`; legacy `extra_high` and `max` migrate to `xhigh`.
- Verified with `codex --strict-config doctor` against temporary `CODEX_HOME` on codex-cli 0.139.0: `model_provider`, `model_reasoning_effort = "xhigh"`, and provider `experimental_bearer_token` are accepted; auth.json is not required for active third-party provider.

## 2026-06-16 local status - app icon neutral gray

- Completed MindCraft-Agent app icon refresh from `public/logos/v3/white.svg` without modifying the source SVG.
- Final visual choice: `02-balanced-neutral`; official assets now use neutral gray layers `#F4F4F1`, `#E9E9E4`, `#DCDCD5`, `#CECEC6` and cut line `#ACACA4` on the dark tile.
- Added deterministic icon generation via `npm run build:icons`; output files are `public/logos/v3/white-app-icon.svg`, `public/logo-white.png`, and `public/logo-white-64.png`.
- Manual visual check completed on 256px and 64px PNG outputs; white-background visibility and icon sizing issue are addressed.
- Verified with `npm run build:icons`, `node --test test/icon-assets.test.js`, `npm test`, and `npm run build`.

## T125 详情：Sass legacy JS API warning

> 创建：2026-06-17 | 类型：tech-debt | 优先级：P3

### 现象

`npm run build` 可正常成功，但会重复输出：

```text
DEPRECATION WARNING [legacy-js-api]: The legacy JS API is deprecated and will be removed in Dart Sass 2.0.0.
```

### 当前判断

- 当前依赖：`vite@4.5.14`、`sass@1.89.1`、`@vitejs/plugin-vue@4.6.2`。
- 这是 Vite 4 调用 Dart Sass 的旧 JS API 触发的 warning，不是业务 `.scss` 写法错误。
- warning 当前不影响构建产物；已通过 `silenceDeprecations: ['legacy-js-api']` 静音，减少构建噪音。
- 风险在于未来 Sass 2.0 移除 legacy API 后可能变成构建失败，根治需要升级 Vite 构建链路。

### 后续处理方向

1. 单独开升级任务，不夹在业务修复里处理。
2. 升级 Vite 到 `5.4+` 或 `6+`，并按当时 Vite/Sass 文档切换 Sass modern API。
3. 完整回归 Electron 主窗口、preload、打包、主题 SCSS、Agent 共享包构建。
4. 当前允许静音 warning 作为短期降噪；不要通过降级 Sass 规避。

## T124 详情：设计能力集成方案评估

> 创建：2026-06-17 | 关联方案：`docs/plan/2026-06-17-design-features-integration.md`
> 参考项目：`reference_project/open-design`（nexu-io/open-design, Apache-2.0, 66k stars）

### 背景

基于对 Open Design 项目的深入分析（架构、提示词系统、预览布局、多模态触发），结合 MindCraft 现有架构，评估将设计领域结构化能力集成进来的可行性与实现路径。

### 方案概览

三层增量，全部默认关闭，不影响现有用户：

| 层 | Phase | 核心改动 | 预估工期 |
|----|-------|---------|:--:|
| **知识注入层** | Phase 0 | `buildSystemPrompt` 注入 craft 规则 + 工具栏下拉选择 | Week 1 |
| **渲染预览层** | Phase 1 | CodeHub 分屏架构（ChatPanel + SplitHandle + PreviewPanel） | Week 2-3 |
| **交互引导层** | Phase 2 | 三层场景化（Layer 1 关 / Layer 2 手动 / Layer 3 AI 问卷） | Week 4-5 |
| **媒体生成** | Phase 3 | 接入 mindcraft-api 多模态（SDK tool callback 模式） | Week 6+ |

### 关键设计决策

1. **预览不内嵌消息**（用户明确要求）：右侧独立 PreviewPanel，不在 MessageBubble 里嵌入 iframe
2. **框架无关，CDN 优先**：Phase 1 产出自包含 HTML，不依赖 npm/build
3. **不强绑定终端与项目**：通过信息标识体现关联，不做强锁定
4. **所有新功能默认关闭**：craft 关闭 / 分屏关闭 / 场景关闭 / 问卷关闭 / 多模态关闭
5. **每个项目独立状态**：项目 A 和项目 B 各有自己的 `splitOpen`、`panelWidth`、`previewHtml`
6. **不引入新 IPC 通道**：尽量复用现有 `claudeAgentQuery`/`codexAgentQuery` 参数传递

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `resources/craft/*.md` | **新增** | 11 个 craft 工艺规则文件（来自 OD craft/，精简翻译） |
| `resources/scenarios/index.json` | **新增** | 场景模板定义 |
| `packages/agent/electron/craftLoader.js` | **新增** | craft 文件加载与模式映射 |
| `packages/agent/electron/claudeAgent.js` | **修改** | `buildSystemPrompt` 增加 craftMode 参数 |
| `packages/agent/electron/codexAgent.js` | **修改** | 同上 |
| `packages/agent/src/components/claudeCode/components/ClaudeToolbar.vue` | **修改** | 增加"设计规范"和"场景"下拉 |
| `packages/agent/src/components/codeHub/index.vue` | **修改** | 增加 SplitView 容器和状态管理 |
| `packages/agent/src/components/codeHub/PreviewPanel.vue` | **新增** | 右侧 iframe 预览面板 |
| `packages/agent/src/components/codeHub/SplitHandle.vue` | **新增** | 拖拽分割条 |
| `packages/agent/src/stores/splitView.js` | **新增** | 分屏状态持久化（项目级） |

### 风险

1. **craft 文件版权**：OD 的 craft 文件来自 `refero_skill`（MIT），需保留原始授权声明
2. **iframe 安全**：PreviewPanel 必须 `sandbox="allow-scripts"`，不设 `allow-same-origin`
3. **CodeX 兼容**：CodeX SDK 的 `instructions`/`systemPrompt` 注入方式与 Claude Code 不同，需分别适配
4. **分屏性能**：ChatPanel 和 PreviewPanel 各自独立渲染，iframe 刷新不影响聊天区

### 当前结论（2026-06-17）

保留为产品方向评估，不直接进入开发。前置条件：

1. 明确 Phase 0 的最小验收标准：是否真的提升设计输出质量，而不是只增加提示词复杂度。
2. 确认 craft 文件授权链路和需要保留的版权声明。
3. 单独评审 PreviewPanel iframe sandbox、HTML 持久化和项目级状态隔离。
4. 每个 Phase 必须独立 feature flag，默认关闭，可单独回滚。

### 讨论记录

- 用户确认：不内嵌 HTML 预览（消息列表性能敏感）
- 用户确认：框架无关，CDN 优先
- 用户确认：不强绑定终端与项目（避免 Claude Code + CodeX 同时操作的冲突）
- 用户确认：所有新功能默认关闭
- 分屏方案：水平分割（ChatPanel 左 + PreviewPanel 右），支持独立预览 Tab
- 多模态触发：SDK tool callback 模式（非 OD 的 CLI shell 命令模式），已有 mindcraft-api 完整生态
