# Build & Deploy Guide

> 最后更新：2026-06-12
>
> 目标：让打包和部署流程可靠、可重复、不出错。

---

## 1. 项目打包架构

```
mindcraft-agent/
├── build/                  # electron-builder 配置
│   ├── builder.prod.json       # 生产 Windows 构建
│   ├── builder.prod.ios.json   # 生产 macOS 构建
│   ├── builder.test.json       # 测试 Windows 构建
│   ├── builder.test.ios.json   # 测试 macOS 构建
│   ├── build.js                # 版本注入脚本（有坑，见 §2）
│   └── notarize.js             # macOS 公证
├── dist/                      # Vite 构建输出
├── electron/                  # Electron 主进程 + preload
├── packages/agent/            # 共享 Agent 核心
├── release/                   # Release Notes 存放
├── package.json               # 含 build 配置（nsis/extraResources/files）
└── vite.config.js             # Vite + vite-plugin-electron
```

### 构建链路

```
npm script → build.js（版本注入）→ vite build → electron-builder → dist_electron/
                                                                  ├── xxx Setup x.x.x.exe  (NSIS 安装包)
                                                                  ├── xxx-x.x.x-win.zip    (绿色版)
                                                                  ├── latest.yml           (auto-update 清单)
                                                                  └── xxx Setup x.x.x.exe.blockmap
```

### 关键配置项 (package.json `build` 字段)

| 字段 | 值 | 说明 |
|------|-----|------|
| `appId` | `com.mindcraft.agent` | 应用唯一标识 |
| `productName` | `MindCraft-Agent` | 安装包名称前缀 |
| `win.icon` | `dist/logo-white.png` | 256x256 白色 logo |
| `nsis.oneClick` | `false` | 允许选择安装目录 |
| `publish.url` | `...MindCraft-Agent/installer/win` | auto-update 拉取地址 |
| `directories.output` | `dist_electron` | 构建产物输出目录 |

---

## 2. build.js 的坑（必读）

### 问题

`build/build.js` 负责版本注入，但 **版本读取方式是坏的**：

```js
// build.js 第 6 行
const VERSION = process.env.npm_config_setv   // ← 只认 npm --setv=xxx
```

而所有 npm script 传的是 `--version`：

```json
"electron:build-prod": "cross-env NODE_ENV=production ... node ./build/build.js --version && vite build ..."
```

`--version` 在 npm 里打印版本并退出，并不设置 `npm_config_setv`。所以 `VERSION` **始终是 `undefined`**。

### 后果

当 `VERSION === undefined` 时 build.js 做这些事：

| 操作 | 文件 | 效果 |
|------|------|------|
| `packageJson.version = VERSION \|\| packageJson.version` | package.json | 保留旧值（OK） |
| `buildProdJson.releaseInfo.releaseNotesFile = "release/release-${VERSION}.md"` | builder.prod.json | **写成 `release/release-undefined.md`**（炸） |
| `packageLockJson.version = VERSION \|\| ...` | package-lock.json | 保留旧值（OK） |
| `configJson.version = VERSION \|\| configJson.version` | src/utils/config.json | 保留旧值（OK） |

**实际操作中已观察到的错误**：electron-builder 报 `releaseNotesFile 'release/release-undefined.md' not found`，构建失败。

### 正确做法

**跳过 build.js，手动管理版本**：

```powershell
# 1. 用 npm version 统一升版本（自动改 package.json + package-lock.json）
npm version 1.0.2 --no-git-tag-version

# 2. 手动改 builder config 的 releaseNotesFile（4 个文件）
#    - build/builder.prod.json     → "release/release-1.0.2.md"
#    - build/builder.prod.ios.json → "release/release-1.0.2.md"
#    - build/builder.test.json     → （测试包通常不需要 release notes）
#    - build/builder.test.ios.json → （同上）
# 3. 手动改 src/utils/config.json 版本（可选，仅影响运行时展示）
# 4. 创建 release/release-1.0.2.md
```

然后直接执行 vite build + electron-builder（**跳过 build.js**）：

```powershell
cross-env NODE_ENV=production NODE_PLATFORM=WIN npx vite build --mode prod
npx electron-builder --config=./build/builder.prod.json
```

**不要执行 `npm run electron:build-prod`**，因为那会跑 build.js 并把 releaseNotesFile 污染成 `release-undefined`。

### 如果要修复 build.js

正确的读取方式（供未来修复参考）：

```js
// 从 npm script 参数中提取版本号
const args = process.argv.slice(2)
const versionArg = args.find(a => a.startsWith('--setv='))
const VERSION = versionArg ? versionArg.split('=')[1] : process.env.npm_config_setv
```

然后在 npm script 中传 `--setv=1.0.2` 而非 `--version`。但整个注入机制本身就是过度工程化——手动管理版本更简单可控。

---

## 3. 构建命令速查

### 开发环境

```powershell
npm run dev           # 启动 Vite dev server + Electron（端口 16288）
npm run electron      # 用已构建的 dist/ 启动 Electron（调试用）
```

### 测试包（Windows）

```powershell
# 跳过 build.js，手动指定版本后执行
cross-env NODE_ENV=testing NODE_PLATFORM=WIN npx vite build --mode test
npx electron-builder --config=./build/builder.test.json
```

产物：
- `dist_electron/MindCraft-Agent-Test Setup x.x.x.exe`
- 无 latest.yml（测试配置未开启 publish）

### 生产包（Windows）

```powershell
cross-env NODE_ENV=production NODE_PLATFORM=WIN npx vite build --mode prod
npx electron-builder --config=./build/builder.prod.json
```

产物：
- `dist_electron/MindCraft-Agent Setup x.x.x.exe` (~115MB NSIS 安装包)
- `dist_electron/MindCraft-Agent-x.x.x-win.zip` (~152MB 绿色版)
- `dist_electron/latest.yml`（auto-update 清单）
- `dist_electron/MindCraft-Agent Setup x.x.x.exe.blockmap`

### 生产包（macOS）

```powershell
cross-env NODE_ENV=production NODE_PLATFORM=IOS node ./build/build.js --version
NODE_OPTIONS=--max-old-space-size=4096 npx vite build --mode prodIos
npx electron-builder --config=./build/builder.prod.ios.json --mac
```

> macOS 构建需要 Xcode + 签名证书，且 `afterSign: build/notarize.js` 会调用 Apple 公证。若签名未配好，构建会失败。

---

## 4. 版本发布流程

> **已验证版本**: v1.0.2（2026-06-12 构建成功，产物约 115MB）

### Step-by-step

```
1. 确保 dev 环境正常
   npm run dev → 确认启动无白屏，自检日志显示 #/main/home

2. 升版本号
   npm version 1.0.2 --no-git-tag-version

3. 更新 release notes 引用（build.js 有 bug，必须手动改）
   → build/builder.prod.json: releaseInfo.releaseNotesFile = "release/release-1.0.2.md"
   → build/builder.prod.ios.json: 同上
   → src/utils/config.json: version = "1.0.2"（可选）

4. 写 release notes
   → 创建 release/release-1.0.2.md
   → 模板见 §8

5. 构建（跳过 build.js，直接两步走）
   npx cross-env NODE_ENV=production NODE_PLATFORM=WIN npx vite build --mode prod
   npx electron-builder --config=./build/builder.prod.json

6. 验证产物
   → dist_electron/MindCraft-Agent Setup 1.0.2.exe 存在
   → dist_electron/latest.yml 版本号 = 1.0.2
   → dist_electron/latest.yml releaseNotes 内容正确

7. 发布构建产物
   → 通过受控的私有发布流程上传 exe、zip、latest.yml 和 blockmap
   → 不要在公开仓库记录存储服务、Bucket、区域、控制台链接或上传凭证
```

### 服务器目录结构

```
https://download.mindcraft.com.cn/MindCraft-Agent/installer/win/
├── MindCraft-Agent Setup 1.0.1.exe
├── MindCraft-Agent-1.0.1-win.zip
├── MindCraft-Agent Setup 1.0.1.exe.blockmap
├── MindCraft-Agent Setup 1.0.2.exe              ← 当前最新
├── MindCraft-Agent-1.0.2-win.zip
├── MindCraft-Agent Setup 1.0.2.exe.blockmap
└── latest.yml                                    ← 必须指向最新版本
```

> **关键**：`latest.yml` 指向最新版本的 exe。electron-updater 启动时拉取此文件，对比本地版本号决定是否更新。

### latest.yml 结构

```yaml
version: 1.0.1
files:
  - url: MindCraft-Agent Setup 1.0.1.exe
    sha512: qXsH8ktvhs+8PCPXSpwTIQkaYmxo...
    size: 120020067
path: MindCraft-Agent Setup 1.0.1.exe
sha512: qXsH8ktvhs+8PCPXSpwTIQkaYmxo...
releaseNotes: |
  # MindCraft-Agent v1.0.1
  ...
releaseDate: '2026-06-12T04:11:49.346Z'
```

---

## 5. 图标要求

### 文件名与尺寸

| 文件 | 用途 | 尺寸 |
|------|------|------|
| `dist/logo-white.png` | Windows 应用图标 + 安装包图标 | 256×256 或更高 |
| `dist/logo-white-64.png` | 系统托盘图标 | 64×64 |
| `dist/logo-app-ios.icns` | macOS 应用图标（仅 macOS 构建用） | 1024×1024 |

### Windows 图标缓存

Windows 对安装包图标有激进缓存。即使 PNG 文件已更新为白色，安装包在资源管理器中仍可能显示旧图标（彩色）。

**清除方法**：

```powershell
# 方法 1：重建图标缓存（推荐）
ie4uinit.exe -show

# 方法 2：重启资源管理器
taskkill /f /im explorer.exe && start explorer.exe

# 方法 3：重启电脑
```

验证图标内容（确认 PNG 确实是白色）：

```powershell
# Node.js 脚本：统计 PNG 像素颜色
node -e "
const fs = require('fs');
const buf = fs.readFileSync('dist/logo-white.png');
// PNG signature check
console.log('PNG:', buf.slice(1,4).toString());
"
```

---

## 6. 输出文件清单

构建完成后 `dist_electron/` 目录应包含（以 v1.0.2 为例）：

```
dist_electron/
├── MindCraft-Agent Setup 1.0.2.exe             # NSIS 安装包（用户分发用，~115MB）
├── MindCraft-Agent-1.0.2-win.zip               # 绿色免安装版（~152MB）
├── latest.yml                                   # auto-update 清单
├── builder-debug.yml                            # electron-builder 调试日志
├── MindCraft-Agent Setup 1.0.2.exe.blockmap     # 增量更新用（~400KB）
└── win-unpacked/                                # 解包目录（调试用，可删除）
```

### 文件大小参考（v1.0.2）

| 文件 | 大小 | 说明 |
|------|------|------|
| Setup exe | ~115MB | NSIS 压缩安装包 |
| zip | ~152MB | 绿色版（未压缩） |
| latest.yml | ~1.3KB | 文本文件 |
| blockmap | ~400KB | 二进制增量 |

---

## 7. 自测清单

每次打包后执行以下检查：

- [ ] `npm run dev` 正常启动，白色窗口 → `#/main/home`（看终端自检日志）
- [ ] 安装包图标是**白色 logo**（如显示彩色则清 Windows 图标缓存）
- [ ] 安装后 exe 图标是白色（系统托盘也是白色）
- [ ] `latest.yml` 版本号 = package.json 版本号
- [ ] `latest.yml` releaseNotes 内容正确
- [ ] auto-update URL 指向 `MindCraft-Agent`（不是 `MindCraft`）
- [ ] 安装包文件名 = `MindCraft-Agent Setup x.x.x.exe`（不是 `MindCraft Setup`）
- [ ] 安装后应用名 = `MindCraft-Agent`（不是 `MindCraft`）
- [ ] `electron-updater` 日志指向正确的 `latest.yml` URL
- [ ] 下载更新后点击“退出并安装更新”时，应用必须真实退出，不能只是隐藏到托盘；安装过程中不应出现 `Failed to uninstall old application files`

---

## 8. Release Notes 模板

> ⚠️ **写 release notes 之前必读这些规则：**
>
> **格式要求：**
> 1. **不要用 Markdown 格式**（`#`/`##`/`**粗体**`），系统信息提示渲染不了 MD，用纯文本。
> 2. **不要写内部任务编号**（T060-D、T065 这类），这是给外部用户看的。用用户能理解的语言描述变化。
>
> **内容过滤规则（以下内容一律不写入）：**
> 3. **不要写内部实现机制** — 例如"重构 session registry"、"迁移到 userData"、"切换到 Sass Modern API"等架构调整，用户不关心你怎么实现的，只关心体验变化。
> 4. **不要写测试/日志/诊断** — 例如"添加单元测试"、"添加诊断日志"、"回归测试覆盖"等，这些是内部质量保障，对用户无意义。
> 5. **不要写文档更新** — 例如"更新设计文档"、"更新 TODO"、"停止追踪本地文档"等，用户看不到也不关心。
> 6. **不要写构建/工程改动** — 例如"修复 build.js"、"silence Sass warning"、"chore 类提交"，这些不影响用户使用体验。
>
> **筛选方法：拿到 commit log 后，逐条问自己——"用户用了新版本后，能感知到这个变化吗？" 不能感知的，删掉。**

```text
MindCraft-Agent v{版本号}

Bug 修复：
- {用户能感知的 bug 修复}

新功能：
- {用户能感知的新功能}

功能改进：
- {用户能感知的体验优化}
```

### 示例（v1.0.2）

```text
MindCraft-Agent v1.0.2

Bug 修复：
- 修复页面切换时 Markdown 渲染状态丢失的问题
- 修复从文档页返回时项目列表不刷新的问题
- 修复 Codex 对话卡住/中断的问题
- 修复表格渲染——兼容更多 Markdown 表格格式
- 修复 plugin & skill marketplace 开箱即用问题

新功能：
- 支持在文档预览器中预览代码文件
```

---

## 9. 常见问题

### Q: 构建报 `releaseNotesFile 'release/release-undefined.md' not found`

**原因**：build.js 的 `--version` 参数没有正确传递版本号，`VERSION === undefined`，导致 `releaseNotesFile` 被写成 `release/release-undefined.md`。

**修复**：
1. `git checkout build/builder.prod.json` 恢复被写坏的文件
2. 跳过 build.js 直接构建（见 §3 命令）

### Q: 安装包图标是彩色的

**原因**：Windows 图标缓存。`dist/logo-white.png` 已经是白色，但资源管理器缓存了旧的彩色图标。

**修复**：见 §5 图标缓存清除。

### Q: 安装后自动更新拉到了 mindcraft-electron 的 latest.yml

**原因**：publish URL 没有改成 MindCraft-Agent。检查以下位置：
- `package.json` → `build.publish[0].url`
- `build/builder.prod.json` → `publish[0].url`
- `electron/mainModules/autoUpdate.js` → `updateUrl`

三者必须一致指向 `...MindCraft-Agent/installer/win`。

### Q: 下载完成后点击“退出并安装更新”，NSIS 报 `Failed to uninstall old application files`

**原因**：旧版本主窗口生产环境 `close` 事件会 `preventDefault()` 并隐藏到托盘。`electron-updater` 的 `quitAndInstall()` 会先关闭窗口再退出应用，如果 close 被拦截，安装器启动时旧应用仍占用安装目录，NSIS 无法卸载旧文件。

**修复要求**：
- `install-update` IPC 调 `quitAndInstall()` 前必须先进入 update-install quit state
- 主窗口 `close` handler 在 update-install 或真实退出时必须放行，不得隐藏到托盘
- 安装前销毁 tray、注销快捷键，并清理 Codex runtime
- UI 文案用“更新包已下载” + “退出并安装更新”，不要再写“重启后生效”

**回归测试**：
```powershell
node tests/auto-update-install-exit.test.cjs
```

### Q: 包体太大怎么办

**已知体积分析（v1.0.1）**：
- Electron 运行时 ~80MB（不可减少）
- node_modules 中有平台特定的 native addon（@anthropic-ai/claude-agent-sdk-win32-x64、@openai/codex-win32-x64）
- 已删除 vad-web(72MB)、sharp(19MB)、node-pty(64MB)，合计节省 155MB

如需进一步优化，考虑：
- 把 vendors 文件夹外挂按需下载
- 分析 `files` 配置中是否还有不必要的文件被打入

### Q: macOS 构建失败

macOS 构建需要：
1. macOS 系统 + Xcode Command Line Tools
2. 有效的 Apple Developer 签名证书
3. `build/notarize.js` 中的 Apple ID + App-Specific Password

如果缺少签名证书，可以临时移除 `afterSign` 配置进行测试构建，但产物将无法在 macOS Gatekeeper 下正常启动。

---

## 10. Private Release Infrastructure

Release storage, upload credentials, signing secrets, provider consoles, and
deployment scripts are internal operational material. Keep them in a private
runbook or CI secret store, never in this repository.

For every release, the authorized maintainer should:

1. Upload the signed installer, portable archive, update manifest, and blockmap
   through the private release workflow.
2. Verify that the public download links resolve to the intended version.
3. Publish user-facing release notes without credentials, internal hostnames,
   storage identifiers, or operational commands.

External contributors only need the build commands and release notes in this
document; they do not need access to the publication infrastructure.
