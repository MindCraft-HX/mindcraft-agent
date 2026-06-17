# 每日代码审查

> 每日工作结束后，审查当天所有提交。本文件既是审查模板，也是知识积累。

---

## 审查流程

### 第一步：概览

```bash
# 查看今天所有提交
git log --since="YYYY-MM-DD 00:00:00" --until="YYYY-MM-DD 23:59:59" --oneline --reverse

# 查看总体变更
git diff --shortstat <first-commit>^..<last-commit>
```

### 第二步：分组归类

将提交按功能/区域分组，每组 3-8 个 commit，便于并行审查。

### 第三步：逐组审查

对每组执行：

```bash
# 查看文件列表
git show <hash> --stat

# 查看详细 diff（核心文件）
git diff <hash>^..<hash> -- path/to/key/file
```

### 第四步：交叉验证

使用两个独立 agent 并行审查同一组 commit，对比发现，降低遗漏。

### 第五步：输出报告

将发现按严重程度分级：
- 🔴 **P0** — 安全问题、崩溃、数据丢失（立即修复）
- 🟡 **P1** — 功能错误、用户体验退化（当天修复）
- 🟢 **P2/P3** — 性能优化、代码清理（后续迭代）

---

## 审查检查清单

### 🔒 安全
- [ ] 有无 API Key / Token / 密码写入日志？
- [ ] 有无敏感信息通过 IPC 明文传输？
- [ ] 有无用户数据未经脱敏？
- [ ] 文件系统操作是否正确限制了路径范围？

### 💥 稳定性
- [ ] 新增的 `try/catch` 是否正确处理了错误路径？
- [ ] 异步操作有无 `.catch()` 或 `try/catch`？
- [ ] `finally` 块是否释放了资源（定时器、事件监听、文件句柄）？
- [ ] 有无内存泄漏（未清理的 Map/Set、未移除的 listener、未关闭的窗口）？
- [ ] Electron 窗口/进程生命周期是否正确管理？

### 🔀 并发与竞态
- [ ] 多个 IPC 事件的到达顺序是否有假设？（见 `docs/session-pitfalls.md`）
- [ ] `for await` 循环中的变量声明是否在使用之前？
- [ ] 共享状态（Map/Set/ref）是否考虑了多窗口/多 tab 场景？
- [ ] 扫描/轮询结果是否有时效性（stale data）？

### 🧩 架构一致性
- [ ] Claude 和 Codex 之间是否有重复逻辑需要提取？
- [ ] 硬编码的白名单/常量是否应该改为数据驱动？
- [ ] 新增的 CSS 颜色是否使用了 `--cc-*` 变量？
- [ ] 新增的 IPC channel 是否在 preload.js 中正确注册？

### 🎨 UI/UX
- [ ] 所有主题（dark/light/blue/brown）下新 UI 是否正常？
- [ ] popover/dialog 的 `teleported` 设置是否与 `overflow: hidden` 冲突？
- [ ] keep-alive 失活/激活时状态是否正确恢复？
- [ ] 强制滚动/路由切换是否会打断用户操作？

### 🧪 测试覆盖
- [ ] 关键 bug 修复有无对应测试？
- [ ] 正则表达式有无边界用例测试？
- [ ] 状态机有无非法状态转换测试？

---

## 已知陷阱速查

| 陷阱 | 文件 | 常见模式 |
|------|------|---------|
| TDZ 回归 | `claudeAgent.js` | 在 `for await` 循环中新增代码引用下方声明的变量 |
| 白名单漂移 | `helpers.js` vs 各处 | Claude/Codex 分别维护标签列表，SDK 更新后遗漏 |
| 消息未写回 | `filterCodexSystemMessages` | 仅用剥离结果做判断，不修改原始消息 |
| keep-alive 失活 | codeHub watcher | computed/watch 在组件失活时暂停 |
| `_userRenamed` 遗漏 | `selectDir` | 构建 chat 对象时漏传字段 |
| 上游根因 vs 下游补丁 | — | 先找最上游缺失点，而非在下游反复 workaround |

---

## 历史审查记录

### 2026-06-16（审核完成）

- **提交数**：17
- **变更**：62 files, +1,916 / -3,382
- **已确认问题**：16 个（P0: 2, P1: 10, P2: 4）
- **修复进展（2026-06-17）**：
  - 已修复 Skills 安装/卸载 P0：Claude/CodeX 共用 `packages/agent/electron/skillsSecurity.js`，校验 `skillName`、project `cwd`、clone `subPath` 和 GitHub 源；`git clone` 改为 `spawn` 参数化执行；卸载只允许删除解析后的 `.claude/.codex/skills/<skill>` 目录。
  - 已收紧安装源信任边界：安装时 main 侧按 skill 名称重新查询 catalog/search，找不到可信 `https://github.com/...` 源即失败，不再把 renderer 传入的 `gitUrl/subPath` 作为后备可信源。
  - 已修复 Skills project scope cwd 传递：Claude/CodeX 挂载 `ManageSkills` 时传入 `activeProject.cwd`，组件调用 `GetState/Install/Uninstall/MarketInstall` 均携带 cwd；project cwd 为空时不再回退扫描 Electron 启动目录。
  - 已修复 Claude `gitMirrorUrl` 迁移断链：设置读写优先走 `claude-internal`，保留旧 `~/.claude/settings.json` 读取兼容；Skills 安装使用同一读取逻辑。
  - 已修复 CodeX TOML P1 组合问题：`model_reasoning_effort` 已被运行时读取；provider table key 会按 TOML 规则转义；renderer 导入/修复只读取顶层 `model/model_provider/model_reasoning_effort`；主进程可解析 `[model_providers."foo.bar"]` 这类带点 provider id。
  - 已修复 Skills 社区分页重复：追加页按 skill name 去重；当 API 返回重复页或没有新增项时停止显示“加载更多”。
  - 已修复 mdViewer PDF 切换复用旧 blob：动态 viewer 增加稳定 key，`PdfViewer` 在 `binary` 变化时释放旧 object URL 并重建。
  - 已修复 Markdown 本地路径链接化破坏 raw HTML/code/script：共享 `linkifyHtmlTextNodes()` 改为状态化扫描文本节点，跳过 `script/style/a/code/pre/textarea/kbd/samp` 内部文本。
  - 已修复 mdViewer unsupported 外部打开确认弹窗的用户可见乱码，改为复用 `doc.openExternalConfirm/doc.openExternal` i18n 文案。
  - 新增/更新测试：`packages/agent/electron/skillsSecurity.test.js`、`packages/agent/electron/codexRuntimeConfig.test.js`、`tests/codex-provider-toml.test.mjs`；`npm test` 已纳入 Skills 安全和 CodeX runtime config 回归。
  - 已验证通过：`node --test tests/codex-provider-toml.test.mjs packages/agent/electron/codexRuntimeConfig.test.js packages/agent/electron/skillsSecurity.test.js`；`npm test`；`node --test tests/agent-runtime-boundary.test.cjs tests/agent-shared-imports.test.cjs tests/codex-provider-toml.test.mjs`；`node tests/agent-markdown-render.test.mjs`；`node --test tests/markdown-it-local-link.test.mjs tests/document-tabs.test.mjs tests/document-viewer-registry.test.mjs`；`node --check packages/agent/electron/claudeAgent.js packages/agent/electron/codexAgent.js packages/agent/electron/skillsSecurity.js`；`npm run build`（仅 Sass legacy JS API deprecation warnings）。
  - 待继续处理：P2 发布 notes/本地 catalog/测试覆盖，以及 Agent 输出绝对路径/UNC 路径打开策略是否需要更严格确认/限制。
- **P0 问题**：Skills 安装 IPC 信任 renderer 传入的 `gitUrl` / `subPath` / `skillName`，并通过 shell `exec("git clone ...")` 执行；推荐安装和社区市场安装都受影响。需要改为 main 侧可信 catalog 解析、参数化 `spawn`、并校验目标路径/子路径（`packages/agent/electron/claudeAgent.js:3273`, `:3324`, `:3379`; `packages/agent/electron/codexAgent.js:2568`, `:2615`, `:2669`）。
- **P0 问题**：Skills 卸载 IPC 同样未校验 renderer 传入的 `skillName`，直接 `path.join(..., skillName)` 后递归 `fs.rmSync(..., { recursive: true, force: true })`。`../../Desktop` 这类名字会逃出 `.claude/.codex/skills` 根目录；该问题是相关区域存量安全洞，今日 Skills 安装/市场改造未一起封住（`packages/agent/electron/claudeAgent.js:3360`, `:3363`, `:3367`; `packages/agent/electron/codexAgent.js:2651`, `:2654`, `:2658`）。
- **P1 问题**：Claude `gitMirrorUrl` 迁移到 `internalConf` 后，安装侧仍只读 `settings.json`，UI 也继续写 `settings.json`，会导致旧配置迁移后镜像失效（`packages/agent/electron/claudeAgent.js:701`, `:3252`; `packages/agent/src/components/claudeCode/components/ManageSkills.vue:404`）。
- **P1 问题**：Skills “项目级安装/卸载”没有把当前项目 `cwd` 传给主进程，实际会落到 Electron 进程启动目录下的 `.claude/.codex/skills`，不是当前项目目录。Claude/CodeX 挂载 `ManageSkills` 时未传 cwd，组件调用 `GetState` / `Install` / `Uninstall` / `MarketInstall` 也未带 cwd；主进程只好用 `path.resolve(cwd || process.cwd())`。实测路径会从期望的 `D:\real\project\.claude\skills\demo-skill` 变成仓库工作目录下的 `.claude\skills\demo-skill`（`packages/agent/src/components/claudeCode/index.vue:217`; `packages/agent/src/components/codeX/index.vue:42`; `packages/agent/src/components/claudeCode/components/ManageSkills.vue:360`, `:467`, `:529`, `:553`, `:649`; `packages/agent/electron/claudeAgent.js:3208`, `:3330`, `:3364`, `:3384`; `packages/agent/electron/codexAgent.js:2495`, `:2621`, `:2655`, `:2674`）。
- **P1 问题**：Skills 社区市场分页会重复追加第一页。代码用 `page` 参数和 `result.total` 判断 hasMore，但当前 API 对 `page=1/2` 返回相同首屏结果且不返回 `hasNext`；UI 会一直显示“加载更多”并堆重复项（`packages/agent/src/components/claudeCode/components/ManageSkills.vue:616`, `:621`, `:631`, `:634`）。
- **P1 问题**：文档查看器/CodeX 存在用户可见乱码字符串，不只是注释乱码：Unsupported 文件确认弹窗和 CodeX 大输出提示会显示 mojibake（`src/components/mdViewer/index.vue:299`; `packages/agent/src/components/codeX/index.vue:1078`）。
- **P1 问题**：文档查看器切换多个 PDF 时可能继续显示上一个 PDF。动态 viewer 没有按 tab/key 强制重建，`PdfViewer` 又在 `currentObjectUrl` 已存在时直接返回旧 URL，只在 unmount 时释放；打开 PDF A 后再打开/切换 PDF B，组件复用时 B 会显示 A 的 blob URL（`src/components/mdViewer/index.vue:42`; `src/components/mdViewer/viewers/PdfViewer.vue:22`, `:23`, `:31`）。
- **P1 问题**：Markdown Viewer 的本地路径链接化在 HTML 渲染后用正则切分字符串，会处理 raw HTML / `<code>` / `<script>` 内部文本并插入 `<a>`，导致文档内容被破坏，也扩大了既有 `html: true` 的安全边界。复现：`<script>docs/TODO.md</script>` 会变成 `<script><a ... data-path-candidate="docs/TODO.md">docs/TODO.md</a></script>`（`src/utils/MarkdownIt.js:11`, `:213`; `packages/agent/src/components/agentCommon/render.js:124`）。
- **P1 问题**：CodeX 修复/导入的有效 `model_reasoning_effort` 不会被主进程运行时读取。前端 `buildManagedProviderToml()` 和修复按钮都会写 `model_reasoning_effort`，但 `readRuntimeConfig()` 只读 `reasoning_effort` / `reason_effort`；且 `repairCodexCliConfig()` 只写 TOML 和 provider 列表，不调用 `codexSetReasoningEffort()`。因此在没有 electron-conf runtime 覆盖、或仅通过修复/导入 `config.toml` 恢复配置时，新建 chat 不带 tab 级 `reasoningEffort`，发送时会回落到空值，最终 SDK 不传 `modelReasoningEffort`（`packages/agent/src/components/codeX/utils/providerToml.mjs:96`; `packages/agent/src/components/codeX/components/APISetting.vue:374`, `:382`, `:389`; `packages/agent/electron/codexAgent.js:146`, `:1651`, `:1784`; `packages/agent/src/components/codeX/index.vue:1206`, `:1963`）。
- **P1 问题**：CodeX TOML 导入/修复的简易解析器会继续扫描所有 section，后面的 `[api] model = ...` 会覆盖前面顶层 `model`，导致修复按钮写入新 provider 后，下次导入/读取表单又显示旧模型。复现：`mergeManagedProviderToml()` 生成顶层 `model = "newmodel"` 后保留 `[api]\nmodel = "api-model"`，`extractProviderDraftFromToml()` 返回 `model: "api-model"`（`packages/agent/src/components/codeX/components/APISetting.vue:506`, `:514`, `:523`, `:525`; `packages/agent/src/components/codeX/utils/providerToml.mjs:44`, `:49`, `:108`, `:120`, `:127`, `:160`）。
- **P1 问题**：CodeX Provider 名称未转义/未限制，直接拼进 TOML table header。`ProviderForm` 的名称输入允许任意字符串，`buildManagedProviderToml()` 生成 `[model_providers.${name}]`；名称含空格会生成 `[model_providers.foo bar]`，`codex --strict-config doctor` 实测报 `config could not be loaded`，名称含点也会生成嵌套 table 而不是单个 provider key，导致 `model_provider = "foo.bar"` 找不到对应 provider（`packages/agent/src/components/codeX/components/ProviderForm.vue:15`; `packages/agent/src/components/codeX/utils/providerToml.mjs:89`, `:98`, `:100`; `packages/agent/electron/codexAgent.js:151`, `:152`）。
- **P1 问题**：CodeX 新增的 `model_providers.<id>` 运行时解析与 TOML table header 语义不一致。`parseSimpleToml()` 按 `.` 拆 section，所以 `[model_providers.foo.bar]` 会解析成 `toml.model_providers.foo.bar`，但运行时用 `mp[pid]` 查 `pid = "foo.bar"`，查不到后退到 `Object.values(mp).find(Boolean)`，拿到的是嵌套对象而不是 provider 字段，`base_url` / `experimental_bearer_token` 均为空。含点 provider 名即使 TOML 合法，也会导致运行时找不到 key/baseURL（`packages/agent/electron/codexAgent.js:98`, `:100`, `:150`, `:151`, `:152`, `:154`, `:155`; `packages/agent/src/components/codeX/utils/providerToml.mjs:98`, `:100`）。
- **P2 问题**：Agent 输出的绝对路径/UNC 路径链接可绕过 workspace/cwd 限制直接读取或调用系统默认打开。若产品允许打开任意本机文件，至少应对 Agent 生成的路径入口增加确认或只允许当前项目根内路径（`electron/mainModules/documentLocator.js:95`, `:98`, `:217`; `electron/mainModules/ipcHandlers.js:159`）。
- **P2 问题**：发布 notes 配置仍有旧版本引用。`build/builder.prod.ios.json` 的 `releaseNotesFile` 仍指向 `release/release-1.0.10.md`，当前版本文件是 `release/release-1.0.11.md`；`package.json` 内置 `build.releaseInfo.releaseNotesFile` 还停在 `release/release-1.0.1.md`，而 `electron:build` 会走默认 electron-builder 配置，容易产出错误 release notes（`build/builder.prod.ios.json:6`; `package.json:15`, `:84`）。
- **P2 问题**：Skills 社区/管理在 API 失败时没有任何本地 catalog 回退，只会空列表返回。`fetchSkillsFromAPI()` / `codexFetchSkillsFromAPI()` 失败直接吞错并回 `{ version: '0', skills: [] }`，`get-state` 也会把这个空 catalog 当成最终结果；这会让弱网/离线时“已安装技能仍可管理”之外的市场浏览完全不可用。由于 commit 2859c4b 已删除静态 catalog，这个回退能力现在确实消失了（`packages/agent/electron/claudeAgent.js:555`, `:565`, `:3198`; `packages/agent/electron/codexAgent.js:2485`, `:2492`, `:3250`）。
- **P2 问题**：新增 `npm test` 只执行 `packages/agent/electron/pluginState.test.js`，没有覆盖已有 `tests/` 边界测试和新放在 `test/icon-assets.test.js` 的图标测试。实测 `node --test tests/agent-public-renderer-boundary.test.cjs tests/agent-runtime-boundary.test.cjs tests/agent-shared-entrypoints.test.cjs tests/agent-shared-imports.test.cjs tests/agent-vue-import-boundary.test.cjs` 中 `agent-shared-entrypoints` 失败：`packages/agent/electron/index.js` 顶层 `new Conf({ configName: 'app-config' })` 在纯 Node 环境加载时访问不到 `electron.app.getPath`。当前 `npm test` 会给维护者“测试已通过”的误导（`package.json:7`; `test/icon-assets.test.js`; `tests/agent-shared-entrypoints.test.cjs:23`; `packages/agent/electron/index.js:9`）。
- **已验证通过**：`node --test tests/codex-provider-toml.test.mjs tests/document-locator.test.cjs tests/md-routing.test.cjs tests/document-tabs.test.mjs`；`node tests/agent-markdown-render.test.mjs`（仅 MODULE_TYPELESS warning）；`node --test test/icon-assets.test.js`；`npm test`（但仅跑 pluginState）；`npm run build`（仅 Sass legacy JS API deprecation warnings）；`npm run build:icons`。
- **已验证失败/暴露风险**：`node --test tests/agent-public-renderer-boundary.test.cjs tests/agent-runtime-boundary.test.cjs tests/agent-shared-entrypoints.test.cjs tests/agent-shared-imports.test.cjs tests/agent-vue-import-boundary.test.cjs` 中 `agent-shared-entrypoints` 失败，见上方 `npm test` 覆盖问题。
- **补充复核结论**：已补看 `a174169 fix: refresh app icon assets`、打包脚本与生产依赖、Home 最近文档交互、Markdown Viewer keep-alive listener 生命周期。图标资产脚本与 `@mindcraft/agent` 导出别名未发现新增确认缺陷；mdViewer listener 目前只有 keep-alive 的单 cached 实例，暂不定为 leak。

### 2026-06-11

- **提交数**：48
- **变更**：277 files, +4,475 / -49,127
- **发现问题**：8 个（P0: 1, P1: 2, P2: 3, P3: 2）
- **P0 问题**：API key 日志泄露（`codexAgent.js`）— 已修复
- **架构亮点**：T051 白名单→模式匹配、T046 五根因修复、mdWindow→mdRouting
- **详见**：T056-T063 in `TODO.md`

---

## 测试策略建议

当前项目测试覆盖不足，建议分阶段补充：

### Phase 1：工具函数单元测试
- `stripSystemContextTags()` — 各种 SDK 标签格式、嵌套、边界
- `safeIpcPayload()` — Vue reactive Proxy、循环引用、大对象
- `parseAskQuestions()` — 正常输入、空输入、格式错误

### Phase 2：状态管理集成测试
- 会话绑定流程：`adoptScannedClaudeSession` → `findPendingClaudeSessionForAdoption`
- Provider 切换流程：`resetAgentRuntime` → `handleProviderActivated`
- 通知传递链路：Agent Stream → `onBackgroundTaskDone` → `codehubHasNotification`

### Phase 3：端到端测试
- 崩溃恢复：模拟 SDK crash → 验证 JSONL fallback 绑定
- 超时保护：模拟弹窗 10 分钟无响应 → 验证正确清理
- Tab 切换：模拟 keep-alive 失活/激活 → 验证状态恢复

### 推荐工具
- **Vitest** — 与 Vite 集成，支持 ESM
- **Playwright** — Electron 端到端测试
- **@vue/test-utils** — Vue 组件测试

## 2026-06-17 fix follow-up

- Fixed the remaining P2 release notes drift: `package.json`, `build/builder.prod.json`, and `build/builder.prod.ios.json` now point to `release/release-1.0.11.md`.
- Fixed the local skills catalog fallback: Claude and CodeX persist the latest successful marketplace catalog under the user home cache and reuse it when `agentskills.in` is unavailable; renderer marketplace/recommended search now falls back through main-process catalog IPC instead of showing an empty network failure only.
- Fixed Agent-generated absolute/UNC path opening policy: message-rendered path links carry `data-path-context-source="agent-message"` and main process blocks absolute paths outside the current workspace/cwd for that source. The mdViewer uses `document-viewer` source so local Markdown documents can still open their own local links.
- Fixed broad test coverage wiring: `packages/agent/electron/index.js` no longer instantiates `electron-conf` at module import time, so shared entrypoint tests can run in pure Node; `npm test` now includes skills security/cache, CodeX TOML runtime, document locator, Markdown local links, and agent boundary tests.
- Verified after fixes: `npm test`; `node tests/agent-markdown-render.test.mjs`; `node --test tests/document-tabs.test.mjs tests/document-viewer-registry.test.mjs tests/document-link-click-context.test.cjs`; `node --check electron/mainModules/documentLocator.js packages/agent/electron/index.js packages/agent/electron/skillsCatalogCache.js packages/agent/electron/skillsSecurity.js packages/agent/electron/claudeAgent.js packages/agent/electron/codexAgent.js`; `git diff --check` (only CRLF conversion warnings); `npm run build` (only existing Sass legacy JS API warnings).
- Current conclusion: all confirmed P0/P1/P2 findings from the 2026-06-16 review have code fixes in the working tree. Remaining risk is manual product QA around skills install/search and document-link click behavior.

## 2026-06-17 manual QA feedback

- QA found a real skills install regression, not dev-only: marketplace catalog entries may use GitHub `tree/<branch>/<path>` URLs such as `https://github.com/clawdbot/clawdbot/tree/main/skills/obsidian`, but the tightened installer cloned that page URL as if it were a repository. Fixed by normalizing GitHub skill sources to clone the repo root (`https://github.com/clawdbot/clawdbot`) and preserve `skills/obsidian` as `subPath`; mirror and direct fallback now both clone the repo root before copying the subdirectory.
- Claude `settings.json` invalid-looking fields are not broadly auto-cleared by design. The app only removes known MindCraft-owned legacy fields (`permissionPolicy`, app UI `language`, `pathToClaudeCodeExecutable`, `gitMirrorUrl`, `theme`) and preserves unknown/custom/official Claude Code settings to avoid deleting user configuration. `skipWebFetchPreflight` remains intentionally managed unless explicitly false.
- Added a ClaudeCode settings repair action matching the CodeX repair interaction: the settings panel now has a repair button that confirms, backs up `~/.claude/settings.json`, writes the active Provider API key/Base URL/tier models/WebFetch preflight, removes known MindCraft-owned legacy fields, and preserves MCP/plugins/unknown custom settings.
- Manual QA confirmed after app restart: the ClaudeCode repair button layout is normal, i18n labels no longer expose raw `settings.*` keys, CodeX config repair/switching remains usable, skills install tree URL handling is ready for retry, and document path behavior is accepted.
- QA confirmed CodeX config repair followed by config switching works in the app and in CLI.
- QA confirmed document browsing/path behavior is normal. The previous `qa-outside` example was only an illustrative case and there is no expected real `qa-outside` file.
- Verified after the tree URL fix: `node --test packages/agent/electron/skillsSecurity.test.js`; `node --check packages\agent\electron\skillsSecurity.js packages\agent\electron\claudeAgent.js packages\agent\electron\codexAgent.js`; `npm test`.
