# Git 工作区变更抽屉面板 — 方案设计

> 状态：评审修订完成，待实施 | 日期：2026-07-15

## 1. 结论

该功能适合作为 ClaudeCode 与 CodeX 共用的只读工作区入口，V1 提供：

- 从状态栏分支信息打开右侧抽屉。
- 查看 staged、unstaged、untracked 工作区变更。
- 按文件、按变更层级懒加载 unified diff。
- 使用现有文档打开链路打开可编辑文本文件。
- 手动刷新，不做自动轮询，不提供 Git 写操作。

架构决策：

- renderer 共享组件放在 `packages/agent/src/components/agentCommon/**`。
- Git 查询能力是跨 provider 的 Agent 通用能力，放在 `packages/agent/electron/gitWorkspace/**`，不得继续以 CodeX IPC 作为共享组件依赖。
- 列表与 diff 使用两阶段 IPC。打开抽屉只拉轻量状态；展开文件时才请求该文件 diff。
- 打开文件复用 `window.electronAPI.openMdWin({ filePath })`，不新增 `sessionStorage` stash，不修改 `src/components/mdViewer/**`。
- V1 只读。stage、unstage、discard、commit 不在本期范围。

---

## 2. 背景与问题

### 2.1 当前入口

`StatusBarMetrics.vue` 已展示：

```text
🔀 main (3)
```

其中：

- `gitBranch` 来自当前项目 Git 分支。
- `gitChanges` 来自 `git status --short` 的文件数，包含 staged、unstaged、untracked。
- 当前区域只展示，不可交互。

### 2.2 用户目标

点击分支信息后打开右侧抽屉，快速回答三个问题：

1. 当前仓库有哪些文件发生变化？
2. 每个文件具体改了什么？
3. 能否直接打开该文件继续查看或编辑？

### 2.3 当前可复用 IPC 的限制

现有 `packages/agent/electron/codex/gitDiffIpc.js` 服务于 CodeX `/diff`、`/review` 等兼容路径，存在以下限制：

- IPC 和 preload 名称属于 CodeX，ClaudeCode 共享组件不应依赖 `codexRunGitDiff()`。
- 返回完整 diff 字符串，打开抽屉就可能跨 IPC 传输数十 MB 内容。
- 只包含 unstaged tracked diff 与 untracked diff，不包含 staged diff。
- 文件状态靠 diff header 推断，不能可靠覆盖 rename、copy、binary、conflict 和特殊文件名。

因此，新抽屉不直接消费该 IPC。旧 CodeX channel 作为兼容 adapter 暂时保留，底层 Git 执行逻辑可逐步收敛到通用 Git workspace domain。

---

## 3. 产品范围

### 3.1 V1 包含

- 状态栏分支区域可点击、可键盘操作。
- 右侧 `el-drawer`。
- staged、unstaged、untracked 分组。
- 状态类型：M、A、D、R、C、U、??。
- 单文件 diff 懒加载、加载态、错误态、截断提示。
- 文本 diff 行级着色。
- deleted、binary、超大文件等明确降级。
- 手动刷新。
- 中文、英文 i18n。
- 共享 parser、主进程 service 和契约测试。

### 3.2 V1 不包含

- stage / unstage。
- discard / restore。
- commit、push、pull、checkout、branch 管理。
- 文件系统 watcher 或定时轮询。
- Monaco diff、行内字符级 diff、语法树 diff。
- Git submodule 内部变更展开。
- 跨仓库聚合视图。

Git 写操作会引入权限、失败恢复、冲突处理与不可逆操作确认，后续必须单独立项。

---

## 4. 架构归属

```text
packages/agent/
├── electron/
│   └── gitWorkspace/
│       ├── index.js                    # 注册通用 Git workspace IPC
│       ├── gitWorkspaceService.js      # status、numstat、单文件 diff
│       └── gitWorkspaceParser.js       # porcelain -z / numstat -z 解析
├── preload/
│   └── index.js                        # gitGetWorkspaceChanges / gitGetFileDiff
├── shared/
│   └── ipcChannels.js                  # CORE_CHANNELS 通用 channel
└── src/components/agentCommon/
    ├── components/
    │   ├── GitChangesDrawer.vue
    │   └── GitUnifiedDiffView.vue
    ├── composables/
    │   └── useGitWorkspaceChanges.js
    └── utils/
        └── unifiedDiff.js              # 唯一共享 unified diff parser
```

接线位置：

- `packages/agent/electron/index.js`：注册通用 Git workspace IPC。
- `packages/agent/src/components/claudeCode/index.vue`：挂载共享抽屉。
- `packages/agent/src/components/codeX/index.vue`：挂载共享抽屉。
- `StatusBarMetrics.vue`：仅负责发出 `git-click`，不负责 Git 查询。

硬边界：

- `GitChangesDrawer.vue` 不导入 ClaudeCode 或 CodeX 私有模块。
- 共享 renderer 不调用 `codexRunGitDiff()`。
- `packages/agent/electron/gitWorkspace/**` 不依赖 provider runtime。
- 不修改 `src/components/mdViewer/**`；通过既有 `openMdWin` bridge 交接。
- 不向 `~/.claude`、`~/.codex` 或项目目录写入 MindCraft sidecar。

---

## 5. Work Graph

### P0：用户点击后的同步段

只允许：

1. `showGitDrawer = true`。
2. 展示 drawer shell、已有内存状态或 loading skeleton。
3. 发起当前 CWD 的轻量 status 请求。

不得同步解析完整 diff、读取所有未跟踪文件或渲染全部 hunk。

### P1：当前抽屉首屏

主进程获取并返回：

- repository root。
- branch。
- staged / unstaged / untracked 轻量文件列表。
- tracked 文件的可选 numstat。
- summary 文件数。

renderer 只渲染文件行，不创建 diff DOM。

### P2：用户主动展开文件

- 以 `repoRoot + changeKind + relativePath` 请求单文件 diff。
- 主进程限制输出字节数与行数。
- renderer 解析并渲染当前展开文件。
- 同时展开多个文件时限制并发，默认最多 2 个 diff 请求。

### P3：本期不做

- 全仓库后台预生成 diff。
- 自动 refresh。
- 非当前项目 scan。
- Git 写操作。

---

## 6. 主进程数据协议

### 6.1 获取变更列表

Preload：

```js
window.electronAPI.gitGetWorkspaceChanges(cwd)
```

IPC payload：

```js
{ cwd: string }
```

返回：

```js
{
  isGitRepo: true,
  repoRoot: 'D:/repo',
  branch: 'main',
  entries: [
    {
      id: 'staged\0src/a.js',
      changeKind: 'staged',       // staged | unstaged | untracked
      status: 'M',                // M | A | D | R | C | U | ??
      relativePath: 'src/a.js',
      oldRelativePath: '',        // rename/copy 时存在
      absolutePath: 'D:/repo/src/a.js',
      additions: 3,               // 未知或 binary 时为 null
      deletions: 1,
      binary: false,
      canOpen: true,
    },
  ],
  summary: {
    staged: 1,
    unstaged: 2,
    untracked: 1,
    totalFiles: 3,                // 同一路径跨层级去重后的文件数
  },
}
```

同一文件可能同时有 staged 和 unstaged 变化，因此可以生成两个 entry，但 `summary.totalFiles` 按路径去重，用于与状态栏文件数语义对齐。

### 6.2 Git 命令策略

仓库确认：

```text
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

列表事实源：

```text
git status --porcelain=v1 -z --untracked-files=all
```

统计信息：

```text
git diff --numstat -z --no-ext-diff
git diff --cached --numstat -z --no-ext-diff
```

要求：

- 使用 `-z`，不得通过换行拆分文件名。
- rename/copy 必须由经过测试的 porcelain/numstat parser 解析。
- 不从 unified diff header 推断列表状态。
- untracked 文件首屏不读取全文；行数可显示为未知，展开后再补齐。
- CWD 位于仓库子目录时，仍展示整个 repository 的变化，与当前 `git status` 指标语义保持一致。

### 6.3 获取单文件 diff

Preload：

```js
window.electronAPI.gitGetFileDiff({ cwd, relativePath, changeKind })
```

返回：

```js
{
  relativePath: 'src/a.js',
  changeKind: 'unstaged',
  diff: 'diff --git ...',
  additions: 3,
  deletions: 1,
  binary: false,
  truncated: false,
  truncatedAtLines: null,
  errorCode: '',
}
```

命令映射：

| changeKind | 命令 |
|---|---|
| staged | `git diff --cached --no-color --no-ext-diff --unified=3 -- <path>` |
| unstaged | `git diff --no-color --no-ext-diff --unified=3 -- <path>` |
| untracked | `git diff --no-index --no-color --unified=3 -- <null-device> <path>` |

约束：

- `git diff --no-index` exit code 1 表示存在差异，不作为错误。
- 每次只允许读取一个 entry 的 diff。
- 单文件默认最多返回 5000 行，同时设置总字节上限，例如 2 MB；截断必须发生在主进程、IPC 返回之前。
- binary diff 返回 `binary=true` 与空 `diff`，renderer 显示“二进制文件无文本预览”。
- deleted entry 返回 diff，但 `canOpen=false`。
- 路径必须以 repo root 安全解析，校验结果仍在 repo root 内；拒绝绝对 path payload、`..` 越界和 NUL 字符。

### 6.4 错误语义

不要把所有错误都伪装成 `isGitRepo=false`。返回稳定错误码：

| errorCode | 含义 |
|---|---|
| `NO_CWD` | 未传入项目目录 |
| `NOT_GIT_REPO` | 不在 Git 仓库中 |
| `GIT_NOT_FOUND` | 系统找不到 git executable |
| `INVALID_PATH` | 文件路径不属于当前仓库 |
| `TIMEOUT` | Git 命令超时 |
| `OUTPUT_TOO_LARGE` | 输出达到保护上限 |
| `GIT_COMMAND_FAILED` | 其他 Git 执行失败 |

UI 可展示本地化友好文案，诊断信息只在显式 diagnostics flag 下记录，不默认刷 dev console。

---

## 7. Renderer 组件设计

### 7.1 `StatusBarMetrics.vue`

新增：

```js
gitInteractive: { type: Boolean, default: false }
defineEmits(['send-message', 'git-click'])
```

分支入口需要满足：

- 使用语义化 `<button type="button">`，或补全 `role="button"`、`tabindex="0"`。
- 支持 Enter / Space。
- aria-label 包含分支名和变更数。
- `gitInteractive=false` 时保持原有纯展示行为。

StatusBar 的 `gitChanges` 可能受现有 30 秒短 TTL 影响；抽屉打开后以新 IPC 返回的 fresh summary 为准，不复用 metrics 数字作为列表事实源。

### 7.2 `useGitWorkspaceChanges.js`

职责：

```js
export function useGitWorkspaceChanges() {
  // list state
  const loading = ref(false)
  const errorCode = ref('')
  const isGitRepo = ref(true)
  const repoRoot = ref('')
  const branch = ref('')
  const entries = ref([])
  const summary = ref(null)

  // actions
  async function refresh(cwd)
  async function loadFileDiff(entry)
  function clear()
}
```

并发与失效规则：

- owner：当前 `GitChangesDrawer` 实例。
- list identity：规范化后的 `cwd`。
- diff identity：`repoRoot + changeKind + relativePath`。
- source of truth：当前 Git working tree/index。
- invalidation：CWD 变化、手动 refresh、drawer 重新打开。
- mutation policy：仅更新 renderer 内存，不写 registry、panel state、官方目录或项目文件。
- 不新增持久缓存。
- refresh 使用递增 request id；旧请求返回时必须丢弃。
- 同一 diff identity 的 in-flight 请求去重，并有超时 cleanup。
- refresh 后清空旧 diff snapshot，避免展示来自旧 index/worktree 的内容。

### 7.3 `GitChangesDrawer.vue`

Props / Emits：

```text
Props:  modelValue, cwd
Emits:  update:modelValue
```

状态：

```text
CLOSED
  -> LIST_LOADING
  -> NOT_REPO | EMPTY | LIST_READY | ERROR

LIST_READY
  -> FILE_DIFF_LOADING
  -> FILE_DIFF_READY | FILE_DIFF_ERROR
```

布局：

```text
┌──────────────────────────────────────────────┐
│ 工作区变更                         刷新  关闭 │
│ main · 3 files                              │
├──────────────────────────────────────────────┤
│ 已暂存 1                                    │
│   M  src/a.js                       +3 -1    │
│ 未暂存 2                                    │
│   M  src/a.js                       +1 -0    │
│   D  src/old.js                     +0 -8    │
│ 未跟踪 1                                    │
│   ?? notes.md                         打开    │
├──────────────────────────────────────────────┤
│ 点击文件后在此区域显示单文件 unified diff    │
└──────────────────────────────────────────────┘
```

交互规则：

- 打开抽屉时请求 fresh list。
- 点击 entry 时加载或切换单文件 diff。
- 点击刷新保留 drawer，但清空选择和旧 diff 后重新查询。
- CWD 变化时立即清空旧列表，不能短暂展示上一项目路径。
- deleted 文件隐藏或禁用“打开文件”。
- binary 文件不渲染文本 diff。
- 长路径保留完整 title/tooltip。
- drawer overlay 应继续被全局快捷键 modal guard 识别。

### 7.4 `GitUnifiedDiffView.vue`

新增 unified 单栏视图是合理的，因为现有 `DiffSplitView.vue` 是左右分栏语义。但 parser 只能保留一份：

```text
agentCommon/utils/unifiedDiff.js
  parseUnifiedDiff(raw)
    -> files / hunks / lines
```

后续 CodeX `ToolMessageCard.vue`、`ToolWrite.vue` 中的本地 parser 可分阶段迁移到该 helper；本任务至少禁止再复制第四份 parser。

渲染要求：

- 使用文本插值，不使用未净化的 `v-html` 渲染 diff 原文。
- 保留 `@@` hunk header。
- 支持 `add`、`del`、`ctx` 和 `no-newline` 类型。
- 使用现有 `--cc-diff-add-bg`、`--cc-diff-del-bg`、`--cc-diff-ctx` 等主题变量。
- 默认只挂载当前选中文件的 diff DOM。
- 大量行可采用简单分段渲染；V1 不要求完整虚拟列表，但不能一次挂载所有文件 hunk。

### 7.5 打开文件

不使用 router + sessionStorage stash。

```js
function openFile(entry) {
  if (!entry.canOpen || !entry.absolutePath) return
  window.electronAPI?.openMdWin?.({
    filePath: entry.absolutePath,
    name: entry.relativePath,
    source: 'git-changes-drawer',
  })
}
```

现有 `openMdWin` 已负责：

- 将 payload 放入主窗口文档队列。
- 激活 `/main/mdViewer`。
- mdViewer ready 后按 request id 消费 payload。
- 避免路由切换与 payload 到达顺序竞争。

因此本任务不修改 `src/components/mdViewer/index.vue`。

---

## 8. 旧 CodeX Git Diff 兼容路径

当前 CodeX `/diff`、`/review` 依赖：

```text
CODEX_CHANNELS.RUN_GIT_DIFF
window.electronAPI.codexRunGitDiff(cwd)
```

本任务处理原则：

1. 不让新共享抽屉调用该接口。
2. 不在本任务中直接删除旧 channel，避免破坏 slash command。
3. 抽取通用 Git command helper 后，旧 `codex/gitDiffIpc.js` 可作为 compatibility adapter 调用共享 helper。
4. 后续另立任务决定 `/diff`、`/review` 是否改为包含 staged 变更；不要借本任务静默改变既有命令语义。

---

## 9. i18n

至少补充：

```text
git.changes
git.filesChanged
git.staged
git.unstaged
git.untracked
git.noRepo
git.noChanges
git.noCwd
git.gitNotFound
git.loadError
git.diffLoadError
git.retry
git.refresh
git.openFile
git.cannotOpenDeleted
git.binaryNoPreview
git.diffTruncated
git.pathOutsideRepo
```

状态字母 M/A/D/R/C/U/?? 不翻译，使用 tooltip 解释完整含义。

---

## 10. 边界情况

| 情况 | 处理 |
|---|---|
| CWD 为空 | `NO_CWD`，提示先打开项目文件夹 |
| 非 Git 仓库 | `NOT_GIT_REPO` |
| 系统无 git | `GIT_NOT_FOUND`，与非仓库区分 |
| 无变更 | 展示“工作区无变更” |
| 仅 staged | 在“已暂存”分组正常展示和预览 |
| 同一文件 staged + unstaged | 分别显示两个 entry；总文件数按路径去重 |
| 未跟踪文件 | 首屏不读取全文；展开时生成 no-index diff |
| renamed/copied | 展示 old path -> new path，打开新 path |
| deleted | 可预览删除 diff，不可打开编辑 |
| binary | 显示二进制提示，不渲染文本行 |
| conflict | 标记 U，diff best effort；不提供冲突解决 UI |
| 文件名含空格、中文、引号 | `-z` parser 正常处理 |
| 文件名含换行 | `-z` parser 正常处理，UI 可将控制字符转义展示 |
| 超大 diff | 主进程截断后返回明确标记 |
| 加载时文件被修改 | 当前 snapshot 可短暂过期；用户刷新获取新状态 |
| 加载时切换项目 | request id guard 丢弃旧结果 |
| drawer 关闭后请求返回 | 不更新已关闭或已失效实例的可见状态 |
| 4 套主题切换 | 仅依赖 `--cc-*` 主题变量 |

---

## 11. 测试与验收

### 11.1 主进程单元/契约测试

建议新增：

```text
tests/git-workspace-parser.test.cjs
tests/git-workspace-service.test.cjs
tests/guard-git-workspace-boundary.test.cjs
```

覆盖：

- porcelain `-z` 普通修改、新增、删除、rename、copy、conflict。
- staged-only、unstaged-only、untracked-only、混合状态。
- 同一路径 staged + unstaged 的 entry 和 summary 去重。
- 空格、中文、引号、换行文件名。
- numstat binary `-\t-`。
- `git diff --no-index` exit code 1。
- timeout、git not found、非仓库、非法 path。
- 主进程行数/字节截断发生在 IPC 返回前。
- 新通用模块不依赖 ClaudeCode/CodeX provider runtime。
- shared renderer 不引用 `codexRunGitDiff`。

可增加临时 Git 仓库集成测试，但应在 git 不可用时明确 skip，不得产生不稳定失败。

### 11.2 Renderer helper 测试

建议新增：

```text
tests/unified-diff-parser.test.mjs
tests/git-changes-request-guard.test.mjs
```

覆盖：

- 多文件 diff、hunk header、no-newline marker。
- new/delete/rename/binary header 的安全降级。
- refresh 后旧 request 不覆盖新结果。
- 同一 identity in-flight 去重与 timeout cleanup。

### 11.3 手工验收

- [ ] ClaudeCode 与 CodeX 均可从状态栏打开同一套 drawer。
- [ ] staged、unstaged、untracked 分组与 `git status` 一致。
- [ ] 仅 staged 时抽屉不为空。
- [ ] 点击文件才请求该文件 diff。
- [ ] 大仓库打开抽屉时不传输完整 diff，输入框和 tab 切换无明显卡顿。
- [ ] 超大单文件 diff 被截断且提示正确。
- [ ] deleted、binary、rename、中文/空格路径行为正确。
- [ ] 打开文件走现有 `openMdWin` 链路并进入 mdViewer。
- [ ] 快速刷新、关闭 drawer、切换项目不会出现旧结果覆盖。
- [ ] 键盘 Enter/Space、Tab 和 ESC 可用。
- [ ] 4 套主题显示正常。
- [ ] drawer 打开时全局快捷键 modal guard 正常阻止误切换。

---

## 12. 实施顺序

| 阶段 | 产出 | 依赖 |
|---|---|---|
| 1 | Git porcelain/numstat parser + 单元测试 | 无 |
| 2 | `gitWorkspaceService.js`：列表与单文件 diff | 1 |
| 3 | 通用 IPC、channel、preload 接线 | 2 |
| 4 | `unifiedDiff.js` parser + 测试 | 无 |
| 5 | `GitUnifiedDiffView.vue` | 4 |
| 6 | `useGitWorkspaceChanges.js`：request guard、diff dedup | 3 |
| 7 | `GitChangesDrawer.vue` | 5、6 |
| 8 | `StatusBarMetrics.vue` 可访问触发器 | 无 |
| 9 | ClaudeCode / CodeX 集成 | 7、8 |
| 10 | `openMdWin` 打开文件接线 | 7 |
| 11 | i18n、架构 guard、手工验收 | all |
| 12 | 可选：旧 CodeX IPC 改为共享 helper adapter | 2，且不得改变命令语义 |

---

## 13. 完成定义

满足以下条件才可标记完成：

- 新抽屉没有 provider 私有依赖。
- 状态栏计数与抽屉 totalFiles 在 fresh snapshot 下语义一致。
- staged-only、untracked、rename、delete、binary、特殊路径均有测试。
- 打开抽屉不加载全仓库完整 diff。
- 截断发生在主进程 IPC 返回前。
- 没有新增持久缓存、sidecar 或 panel state 写入。
- 没有修改 mdViewer 接收协议或增加 sessionStorage stash。
- ClaudeCode 与 CodeX 使用同一套组件、composable、parser 和主进程 service。
- `npm test`、相关定向测试、`git diff --check` 通过。
