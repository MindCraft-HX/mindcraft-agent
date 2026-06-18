# mindcraft-agent

轻量级多 Agent 集成平台（不是 mindcraft-electron 的裁剪版）。Claude Code + Codex 双引擎，文档浏览 + 轻量知识问答。

## 架构

```
packages/agent/  → 共享 Agent 核心（renderer/electron/preload，mindcraft-electron 复用）
src/             → host 应用层（壳、路由、导航、host-only 页面）
electron/        → 桌面运行时（窗口、菜单、preload、文件系统、打包）
```

**边界**：不在 `packages/agent` 塞 host 专属逻辑；Claude/Codex 共享逻辑物理上只有一份（`agentCommon/utils/helpers.js`），禁止两边复制粘贴。

## 文档路由

| 场景 | 文档 |
|------|------|
| 当前任务 / Bug 跟踪 | `docs/TODO.md` |
| 会话相关 bug（重复/中断/丢失/恢复卡死） | **先读** `docs/session-pitfalls.md`，再查对应 agent 专题 |
| 架构细节 | `docs/agent-architecture.md` |
| dev 白屏 / 僵尸进程 | `docs/bugs/dev-white-screen-zombie-process.md` |
| 打包 / 部署 / 版本发布 | `docs/build-and-deploy.md` |
| 每日代码审查 | `docs/review.md` |

## docs/ 版本管理

- `docs/` 是项目知识库，默认需要纳入 git，避免架构文档和排障记录丢失。
- 如旧会话上下文仍提示 “docs/ 不提交”，以本文件当前规则为准：`docs/` 已恢复版本管理。
- 禁止提交私密、临时、机器本地内容；这类内容放 `docs/local/`、`docs/private/`、`docs/tmp/`，这些目录由 `.gitignore` 排除。
- 更新任务状态、架构决策、排障结论时，应同步更新对应 `docs/*.md` 并随相关代码或文档提交。
- 发布给用户看的 release notes 仍放 `release/` 目录。

## 关键习惯

### dev 开发
- `npm run dev` 白屏 → 先看终端 `[main] route check:` 自检日志（`#/side` = 路由污染），不要先猜端口
- **同源多窗口共享 localStorage**：路由记忆只准写 `/main` 前缀（`src/router.js` 读写双重校验）
- **三层防僵尸**：predev 清端口 + dev 守护每 3s 探测 + dev 模式关窗即 quit（生产才隐藏到托盘）
- Electron 36 的 `console-message` 事件签名已是单对象 `event.level`（字符串），升级 Electron 时核对

### 会话 bug
- `onAgentDone` 不保证触发（crash 时没有），`scan` 和 `done` 并发不可假设顺序
- `resetAgentRuntime` 影响所有窗口
- 系统标签剥离统一走 `stripSystemContextTags()`（`agentCommon/utils/helpers.js`），禁止在其他文件硬编码标签名

### Agent 官方目录数据边界

- **MindCraft 自有数据禁止写入 `~/.claude` / `~/.codex` / 项目 `.claude` / `.codex`。** 这些目录只存官方 CLI/SDK 需要的 transcript、settings、skills、plugins、MCP 配置等。
- MindCraft 自有数据包括：panel state、chat/session title/description、session instruction、模型/effort 选择、chatKey↔cliSessionId 映射、编排元数据、诊断日志、缓存和 UI 状态。
- MindCraft 自有数据必须写入 `app.getPath('userData')` 或 app 自己的 Conf 文件；新会话级数据优先放 `userData/session-registry/`。
- 允许读取官方 transcript/config 来建立映射，但不要在官方 transcript 旁新增 sidecar；历史遗留 sidecar 只能读旧写新、分阶段迁移。
- 如确需写官方目录，必须是 SDK/CLI 官方 schema 支持的字段，并在代码注释和本地 docs 中写明依据与回滚路径。

### 编辑大文件
- `claudeAgent.js` / `codexAgent.js` 各 3000+ 行，编辑前**读完整函数**，确认变量声明在引用之前（T046 TDZ 教训）
- 禁止在 `for await` 循环体中加 `await` 不检查顶部声明
- 同一函数连续 ≥3 次回归 → 重写，不要继续补丁

### 安全
- **禁止** `console.log` 输出 API key（含前缀/长度）

## 打包速查

```powershell
# 跳过 build.js（它的 --version 不工作），手动两步：
cross-env NODE_ENV=production NODE_PLATFORM=WIN npx vite build --mode prod
npx electron-builder --config=./build/builder.prod.json
```

上传到：`https://download.mindcraft.com.cn/MindCraft-Agent/installer/win/`
上传文件：exe + zip + latest.yml + blockmap

版本号用 `npm version x.x.x --no-git-tag-version`，手动改 4 个 builder config 的 `releaseNotesFile`。
完整流程见 `docs/build-and-deploy.md`。
