# TODO 历史归档

> 从 `docs/TODO.md` 迁移，2026-06-28。保留已完成任务的详细分析和历史记录，便于后续查阅。
> 活跃任务请查看 `docs/TODO.md`。

---

## 2026-06-14 Codex 权限模式修复

- 已修复 Codex 主进程默认权限策略回退到 `allow_all`` 的问题；现在仅接受 `read_only | ask | allow_all`，非法值统一回退到 `ask`。
- 已收口 Codex 权限文案：`ask` 明确表示"安全模式（工作区可写）"，不再暗示审批交互。
- 已修复新 chat / 恢复 chat 的 `sandboxLevel` 初始化不清晰问题：新建 chat 在创建时即继承当前全局权限；恢复 chat 保留已有会话值，缺字段时按"已启动会话补 `ask`、未启动会话跟随当前全局"处理。
- 已补充 Codex 启动诊断日志，输出 `sessionId`、`cwd`、`permissionPolicy`、`sandboxMode`，用于继续定位"某项目不能改文件"的运行时原因。

---

# SDK 能力挖掘（2026-06-16 审计）

> 背景：用户问"SDK 和 CLI 支持多窗口多分支开发吗？"→ 完整审计发现 SDK 利用率仅 ~15%，大量原生能力闲置。

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

## SDK 原生但 MindCraft 自己写了的（重复造轮子）

| MindCraft 自己写的 | SDK 等价的 | 文件位置 |
|---------|-----------|---------|
| `scanCliSessionsForProject()` 遍历目录 | `listSessions({ dir: cwd })` | `claudeAgent.js:369` |
| `extractClaudeSessionTitle()` 解析 JSONL 头 | `getSessionInfo(sessionId)` | `claudeAgent.js` |
| 自定义 `claude-read-session-file` IPC | `getSessionMessages(sessionId)` | `claudeAgent.js` |
| `fs.unlinkSync()` 删文件 | `deleteSession(sessionId)` | `claudeAgent.js` |

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

## T089-T101 优先级总结

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

---

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

---

## 历史完成记录（2026-06-08 ~ 2026-06-17）

| 日期 | 分类 | 说明 |
|------|------|------|
| 2026-06-17 | plan | **设计能力集成方案 v1 完成**：基于 Open Design 参考项目分析，输出 `docs/plan/2026-06-17-design-features-integration.md`。涵盖三层增量（craft 知识注入 / 分屏预览 / 场景化交互）、4 个 Phase（0→3）、10 个文件变更清单、6 项关键设计决策。所有新功能默认关闭。详见 T124。 |
| 2026-06-16 | bug | 表格渲染修复：表头/数据行检测切换为 splitTableRow + 列数一致性校验，支持缺首尾管道；分隔行连字符 ≥3→≥1（GFM）；段落断行同步更新。新增 14 项表格测试。 |
| 2026-06-16 | bug | 文档路径链接化修复：`linkifyStrongLocalPaths` 正则恢复白名单目录前缀分支（`docs\|src\|packages\|...`），修复 `docs/TODO` 等无扩展名路径无法渲染为可点击链接的回归。新增 12 项路径链接化回归测试。 |
| 2026-06-16 | docs | **settings.json 污染分析 v2**：基于 `sdk.d.ts` Settings interface 重新验证，纠正 `autoCompactWindow` 误判（合法 SDK 字段）、补充 `effortLevel` 三处定义不一致分析。新建 `docs/sdk-feature-gaps.md` 全量 SDK 未集成功能全景（入口函数/query options/运行时控制/hooks/MCP/插件/Codex）。TODO 新增 T118（污染清理）、T119（CLAUDE.md 红线修正）。 |
| 2026-06-16 | bug | T105: ClaudeCode effortLevel 白名单补 xhigh；T108-T111: CodeX sandbox 重构 permissionPolicy→sandboxMode；T113-T115: sandbox labels 国际化 + toast 文案 + migrateValue 去重；T107/B029: 恢复 `streamClosed=true` in triggerDone，前端 flushQueuedInput 回退；SDK 接口核对入口现为 `docs/sdk-feature-gaps.md` + 本地 `.d.ts` |
| 2026-06-13 | refactor | Chat：删除 Chat Completions 回退，统一用 Responses API；新增 `reasoning_summary_text.delta` 处理；CodeX 通路 60s 超时 + thinking 50K 上限；渲染端 timeout stop_reason 处理；gitignore `_test/` 测试目录 |
| 2026-06-13 | bug | Chat thinking/卡死修复：Anthropic 通路 thinking 50K 上限 + 60s 超时；实测 `thinking: { type: 'disabled' }` 对 deepseek-v4-flash 有效；实测 OpenAI 通路 `reasoning.effort` 影响耗时但 reasoning 文本几乎不可见 |
| 2026-06-12 | housekeeping | 死依赖清理（T069）：移除 19 个未使用 npm 包 + 5 个死代码文件 + .babelrc + vite vendor chunk，node_modules 减少约 90 MB |
| 2026-06-12 | bug | 修复表格渲染失败：①表头/数据行检测从严格正则切换为 splitTableRow + 列数一致性校验，支持缺首尾管道格式 ②分隔行连字符 ≥3 放宽为 ≥1（对齐 GFM）③段落断行同步更新防止贪婪吃掉表格行。新增 14 项表格测试覆盖 GFM 变体/防误报/路径链接共存/块元素组合 |
| 2026-06-12 | bug | 修复 T067 插件/Skill 市场不可用：①Skills "推荐" tab 为空 — 新增 `build/generate-skills-catalog.js` 构建时从 agent-skills-cli API 拉取 Top 100 生成 catalog 文件，skills-get-state handler 增加运行时 API 兜底 ②ClaudeCode 插件全部"未安装" — plugins-get-state 增加 name-based fallback 匹配解决 marketplace ID 不一致 |
| 2026-06-11 | bug | 修复 T057 ClaudeCode token 计数不对称：`getTokenMetrics` 中 input 取最后一轮（=）而 output 跨轮累加（+=），多轮对话后 in/out 比例诡异。统一为 = 赋值对齐 CodeX |
| 2026-06-12 | bug | 修复 T066 CodeX 对话卡住/中断 6 项：G1(前端返回值检查+锁定时序修复)/G2(thread.error→resultReceived)/G3(slowNotice+subtype+渲染)/G4(abortSession→await)/O1(return 0→结构化拒绝)/O2(late event _awaitingDone guard)。核心思路：闭合前后端状态同步反馈缺口，不新增状态标志 |
| 2026-06-11 | bug | 修复 T064 dev 白屏+僵尸进程：`/side` 路由污染共享 localStorage 路由记忆（白屏根因，与端口无关）；修复 Electron 36 console-message 签名导致渲染报错被吞；新增 dev 守护自动回收孤儿进程 + 路由自检日志；恢复 HMR |
| 2026-06-11 | feature | 实现 T052 mindcraft-agent 一键导入 mindcraft-electron API 配置：Settings UI 增加按钮 + IPC handler + 多候选目录探测 + 文件夹选择兜底 |
| 2026-06-11 | bug+ux | 修复 T050 任务完成通知系统：提示音共享化/持久 AudioContext/ClaudeCode 补全/始终播放；侧边栏"项目"脉冲提醒；"编程"→"项目"；flashFrame 链路确认 |
| 2026-06-11 | bug | 修复 T055 从首页/文档切回会话 tab 不自动沉底：ClaudeCode onActivated + CodeX onActivated 中调用 scrollToBottom |
| 2026-06-11 | ux | 修复 T054 状态栏流速仪表盘：移除 input 速度，只保留 output 速度（in/out 双指标语义混淆 + Claude inputPerSec 多轮重复计数虚高） |
| 2026-06-12 | bug | 修复 T065 首页项目区域两个 bug：①项目名始终显示"新项目"——从 cwd 推导文件夹名；②点击不同项目都跳最近一个——homeMetrics 暴露 projectId + Home.vue 带参数跳转 + codeHub 优先匹配 projectId |
| 2026-06-12 | doc | 创建打包/部署文档 `docs/build-and-deploy.md` |
| 2026-06-12 | bug | 修复 T060-D 竞态修复的 keep-alive 回归：afb16f5 "始终排队到 pendingPayloads" 导致 mdViewer 已打开时新文档无人消费——onMounted 只调用一次 `getPendingMdContent`，keep-alive 保留组件实例后不再触发。改为双通道：入队兜底 + mdViewerReady 时直投。 |
| 2026-06-11 | bug | 修复 T053 CodeX `filterCodexSystemMessages` 系统标签泄漏 |
| 2026-06-11 | bug | 修复 T047/T048 @ 工具栏选择文件、目录钻入、平铺模式；CodeX 额外目录缓存 |
| 2026-06-11 | bug | 修复 T049 ClaudeCode 关闭 Tab 重开后自定义命名丢失 |
| 2026-06-11 | doc | 创建跨 Agent 会话陷阱全景图 `docs/session-pitfalls.md`，新增 5 大 trap pattern 和排查决策树 |
| 2026-06-11 | bug | 修复 T046 P0 根因 E/B/A：中断恢复死锁、Provider 切换清空 cliSessionIds、多 pending 盲匹配 |
| 2026-06-11 | bug | 修复 T046 P1/P2 根因 C/D：错误路径孤儿 JSONL、hasPendingNewChat 过时 |
| 2026-06-11 | bug | 修复 T046 P0-A 回归：`for await` 循环中 `sender` TDZ 错误 |
| 2026-06-11 | bug | 定位 T046 ClaudeCode 会话重复的 5 个根因（A-E） |
| 2026-06-10 | bug | 修复 Codex 同一 `sessionId` 重复 query 造成多次 cleanup；主进程增加 run ownership |
| 2026-06-10 | bug | 补强 ClaudeCode 会话"接力"问题：清理重复 jsonl 绑定，补齐 active project/chat fallback |
| 2026-06-10 | bug | 修复 Claude 任务面板在会话内全局递增 task id 场景下无法收口的问题 |
| 2026-06-09 | refactor | 完成 Agent 抽离 Phase A，共享层收敛到 `packages/agent/**` |
| 2026-06-09 | bug | 修复 ClaudeCode 历史恢复时误切到旧会话的问题，恢复上次激活的 project/chat |
| 2026-06-09 | bug | 修复共享层 `localSearch` 的 bundled `rg` 路径与建议链路问题 |
| 2026-06-08 | bug | 修复 Codex 会话生命周期、状态栏、diff 恢复与任务卡显示等一轮问题 |

## 2026-06-12 Local Notes

- doc viewer: synced `src/components/mdViewer/viewerRegistry.mjs` code-text extensions with `electron/mainModules/documentLocator.js`
- added preview coverage for `.py`, `.java`, `.toml`, `.env`, `.sh`, `.c`, `.hpp`
- table rendering: fixed GFM pipe/hyphen detection in `render.js` (`splitTableRow` + column-count gating), 14 new tests
- mdRouting: fixed T060-D regression — `afb16f5` always-queue broke keep-alive path; restored dual-channel (queue safety net + direct `send('md-content')` when `mdViewerReady`)

## 2026-06-16 local status entries

- mdViewer follow-up fixed: multi-document open/recovery, code/markdown theming, recent doc names, plain path links, inline-code path links, and Element Plus tab theme colors
- T120 follow-up: CodeX/Codex CLI config repair entry, repair path backs up `~/.codex/config.toml`, rewrites managed provider config to `experimental_bearer_token`, does not touch `auth.json`
- app icon neutral gray: MindCraft-Agent app icon refresh from `public/logos/v3/white.svg`, final visual choice: `02-balanced-neutral`, added deterministic icon generation via `npm run build:icons`

---

## 详细设计分析（已完成任务）

### T116: Claude 会话中断后 dangling tool_use 恢复
- 识别 dangling `tool_use`，恢复时标为 `interrupted`
- 实现文件：`sessionIntegrity.mjs`, `sessionRefreshGuard.mjs`, `claudeAgent.js`
- 计划：`docs/plan/2026-06-15-claude-dangling-tool-use-recovery.md`

### T047: 工具栏 @ 选择文件时输入框有文字就选不了
- 根因：`insertTextAtCaret('@')` 不带前导空格，正则 `(?:^|\s)@` 不匹配
- 修复：`triggerMention()` 中检查光标前字符，必要时插入 ` @`

### T048: CodeX "额外目录" 默认展开/收缩 + 缓存问题
- 子问题 A：`psExpanded = ref(true)` 永远 true
- 子问题 B：`buildPanelState()` 没包含 `additionalDirectories`

### T050: 任务完成通知系统修复
- 提示音共享化/持久 AudioContext/ClaudeCode 补全
- 侧边栏脉冲提醒 + "编程"→"项目"

### T053: CodeX `filterCodexSystemMessages` 系统标签泄漏
- `stripCodexSystemContextTags` 仅用于判断，未修改消息内容

### T068: 简易对话（Chat）功能方案
- 路径 B：新增独立 Agent 类型（不复用 claudeAgent/codexAgent）
- Provider 复用，API 直调 Anthropic Messages + OpenAI Responses
- 5 轮修复：流式/用户气泡/模型选择/死循环防护/SSE 兼容/上下文压缩

### T069: 死依赖清理
- 移除 19 个未使用的 npm 包 + 对应死代码
- node_modules 减少约 90 MB

### T106: agentRegistryComponents.js 静态 import 导致代码分割失效
- SharedSettings chunk 428KB（含两个 Agent 全部组件树）
- 改为 `defineAsyncComponent(() => import(...))`，降至 8.4KB (-98%)

### T120: CodeX config.toml/auth.json 污染修复
- `env_key = "OPENAI_API_KEY"` 替代 `experimental_bearer_token`
- `applyProvider()` 覆写 `auth.json`
- 修复：参照 cc-switch 标准做法，token 直接注入 toml，不碰 auth.json

### T124: 设计能力集成方案评估
- 三层增量（craft 知识注入/分屏预览/场景化交互）
- 所有新功能默认关闭
- 当前结论：保留为产品方向评估，不直接进入开发

### T125: Sass legacy JS API warning
- Vite 4 调用 Dart Sass 旧 JS API
- 已静音，根治需升级 Vite 5.4+/6

### T144-T146: Token 使用统计优化
- 7 个 Metrics 统计 BUG（已全部修复）
- Token 实时增长：`Math.max()` + `useAnimatedNumber` 平滑计数
- Per-Turn Token/时间标注：`TokenMetaRow.vue` 共享组件
- 后续重构 Phase A-D 边界收口
