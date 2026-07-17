# Build & Deploy Guide

> 最后更新：2026-07-17
>
> 目标：让打包和部署流程可靠、可重复、不出错。Windows + macOS 双平台构建。

---

## 1. 项目打包架构

```
mindcraft-agent/
├── build/                  # electron-builder 配置
│   ├── builder.prod.json       # 生产 Windows 构建
│   ├── builder.prod.ios.json   # 生产 macOS 构建
│   ├── builder.test.json       # 测试 Windows 构建
│   ├── builder.test.ios.json   # 测试 macOS 构建
│   ├── build.js                # 版本注入脚本（有坑，见 §2，已弃用）
│   └── notarize.js             # macOS 公证
├── dist/                      # Vite 构建输出
├── electron/                  # Electron 主进程 + preload
├── packages/agent/            # 共享 Agent 核心
├── release/                   # Release Notes 存放（保留最近 5 个版本）
├── package.json               # 含 version 字段
└── vite.config.js             # Vite + vite-plugin-electron
```

### 构建链路

```
npm version → 手动更新 config.json & builder config → vite build → electron-builder → dist_electron/
  Windows 产物:
    ├── MindCraft-Agent Setup x.x.x.exe         (NSIS 安装包)
    ├── MindCraft-Agent Setup x.x.x.exe.blockmap (增量更新 map)
    └── latest.yml                               (auto-update 清单)
  macOS 产物:
    ├── MindCraft-Agent-x.x.x-arm64.dmg          (DMG 安装包)
    └── latest-mac.yml                            (auto-update 清单)
```

> **注意**：Windows 不再构建 zip 绿色免安装版（已移除，节约构建时间和存储空间）。

---

## 2. build.js 的坑（必读）

`build/build.js` 负责版本注入，但 **版本读取方式是坏的**，且整个注入机制过度工程化。

**结论：跳过 build.js，手动管理版本**。流程见 §4。

不要执行 `npm run electron:build-prod`，直接执行 vite build + electron-builder。

---

## 3. 构建命令速查

### 开发环境

```powershell
npm run dev           # 启动 Vite dev server + Electron（端口 16288）
npm run electron      # 用已构建的 dist/ 启动 Electron（调试用）
```

### 生产包（Windows）

```powershell
# 1. 升版本
npm version x.x.x --no-git-tag-version
# 手动更新 src/utils/config.json 中 version
# 手动更新 build/builder.prod.json 中 releaseNotesFile

# 2. 构建
npx cross-env NODE_ENV=production NODE_PLATFORM=WIN npx vite build --mode prod
npx electron-builder --config=./build/builder.prod.json
```

### 生产包（macOS）

```powershell
# 在 macOS 上执行：
# 1. 升版本（同 Windows 步骤 1，已通过 git 同步）
#    build/builder.prod.ios.json 的 releaseNotesFile 也需更新

# 2. 构建
npx cross-env NODE_ENV=production NODE_PLATFORM=IOS npx vite build --mode prod
npx electron-builder --config=./build/builder.prod.ios.json --mac
```

> macOS 构建需要 Xcode + Apple Developer 签名证书 + `build/notarize.js` 中的 Apple ID。

---

## 4. 版本发布流程（双平台）

### Step-by-step

```
1. 检查待发布 commit
   git log --oneline <上次打包的 commit>..HEAD
   按 §8 规则筛选用户可感知的变更

2. 写 release notes
   → 创建 release/release-x.x.x.md
   → 纯文本中文，格式见 §8

3. 升版本号
   npm version x.x.x --no-git-tag-version
   手动更新 src/utils/config.json → "version": "x.x.x"
   手动更新 build/builder.prod.json → releaseNotesFile
   手动更新 build/builder.prod.ios.json → releaseNotesFile

4. Windows 构建
   npx cross-env NODE_ENV=production NODE_PLATFORM=WIN npx vite build --mode prod
   npx electron-builder --config=./build/builder.prod.json

5. macOS 构建（在 Mac 上执行）
   npx cross-env NODE_ENV=production NODE_PLATFORM=IOS npx vite build --mode prod
   npx electron-builder --config=./build/builder.prod.ios.json --mac

6. 发布到 COS
   # Windows（3 个文件）
   coscmd upload "dist_electron/MindCraft-Agent Setup x.x.x.exe" "MindCraft-Agent/installer/win/"
   coscmd upload "dist_electron/MindCraft-Agent Setup x.x.x.exe.blockmap" "MindCraft-Agent/installer/win/"
   coscmd upload "dist_electron/latest.yml" "MindCraft-Agent/installer/win/"

   # macOS（2 个文件，在 Mac 上执行）
   coscmd upload "dist_electron/MindCraft-Agent-x.x.x-arm64.dmg" "MindCraft-Agent/installer/mac/"
   coscmd upload "dist_electron/latest-mac.yml" "MindCraft-Agent/installer/mac/"

7. 清理旧版本（保留最新 5 个）
   # 查看当前 COS 版本列表
   coscmd list "MindCraft-Agent/installer/win/"
   coscmd list "MindCraft-Agent/installer/mac/"

   # 删除最旧的版本文件（每个平台保留 5 个版本）
   coscmd delete -y "MindCraft-Agent/installer/win/<最旧版本文件>"
   coscmd delete -y "MindCraft-Agent/installer/mac/<最旧版本文件>"

   # 删除本地最旧 release notes（保留 5 个）
   rm release/release-x.x.x.md

8. 提交代码
   git add build/builder.prod.json build/builder.prod.ios.json package.json src/utils/config.json release/release-x.x.x.md release/<删除的旧版本>.md
   git commit -m "chore: bump version to x.x.x + release notes + clean old releases"

9. 清理工作区
   git restore package-lock.json
   git status  # 确认 clean

10. 推送到远程
    git push origin develop
```

### COS 目录结构（各平台保留 5 个版本）

```
MindCraft-Agent/installer/
├── win/
│   ├── MindCraft-Agent Setup 1.2.7.exe
│   ├── MindCraft-Agent Setup 1.2.7.exe.blockmap
│   ├── MindCraft-Agent Setup 1.2.8.exe
│   ├── MindCraft-Agent Setup 1.2.8.exe.blockmap
│   ├── MindCraft-Agent Setup 1.2.9.exe
│   ├── MindCraft-Agent Setup 1.2.9.exe.blockmap
│   ├── MindCraft-Agent Setup 1.2.10.exe
│   ├── MindCraft-Agent Setup 1.2.10.exe.blockmap
│   ├── MindCraft-Agent Setup 1.2.11.exe
│   ├── MindCraft-Agent Setup 1.2.11.exe.blockmap
│   └── latest.yml
└── mac/
    ├── MindCraft-Agent-1.2.10-arm64.dmg
    ├── MindCraft-Agent-1.2.11-arm64.dmg
    ├── MindCraft-Agent-1.2.12-arm64.dmg
    ├── MindCraft-Agent-1.2.13-arm64.dmg
    ├── MindCraft-Agent-1.2.14-arm64.dmg
    └── latest-mac.yml
```

> **规则**：每个平台只保留最新 5 个版本的安装文件。每次发布新版本后，删除最旧的文件和 blockmap。本地 `release/` 目录也只保留最近 5 个版本的 release notes。

### latest.yml / latest-mac.yml 结构

```yaml
version: 1.2.11
files:
  - url: MindCraft-Agent Setup 1.2.11.exe
    sha512: qXsH8ktvhs+8PCPXSpwTIQkaYmxo...
    size: 208329408
path: MindCraft-Agent Setup 1.2.11.exe
sha512: qXsH8ktvhs+8PCPXSpwTIQkaYmxo...
releaseNotes: |
  修复会话标题持久化问题...
releaseDate: '2026-07-17T12:00:00.000Z'
```

---

## 5. 输出文件清单

构建完成后 `dist_electron/` 目录应包含：

**Windows：**
```
dist_electron/
├── MindCraft-Agent Setup x.x.x.exe             # NSIS 安装包
├── MindCraft-Agent Setup x.x.x.exe.blockmap     # 增量更新 map
├── latest.yml                                   # auto-update 清单
├── builder-debug.yml                            # electron-builder 调试日志
└── win-unpacked/                                # 解包目录（调试用，可删除）
```

**macOS：**
```
dist_electron/
├── MindCraft-Agent-x.x.x-arm64.dmg              # DMG 安装包
├── latest-mac.yml                                # auto-update 清单
├── builder-debug.yml                            # electron-builder 调试日志
└── mac-arm64/                                   # 解包目录（调试用）
```

### 文件大小参考

| 文件 | 大小 | 说明 |
|------|------|------|
| Win Setup exe | ~208MB | NSIS 压缩安装包 |
| Win blockmap | ~240KB | 增量更新数据 |
| Win latest.yml | ~1-2KB | 文本文件 |
| Mac DMG | ~155MB | DMG 安装包 |
| Mac latest-mac.yml | ~1-2KB | 文本文件 |

---

## 6. 图标要求

| 文件 | 用途 | 尺寸 |
|------|------|------|
| `dist/logo-white.png` | Windows 应用图标 + 安装包图标 | 256×256 或更高 |
| `dist/logo-white-64.png` | 系统托盘图标 | 64×64 |
| `public/logo-app-ios-white.icns` | macOS 应用图标 | 1024×1024 |

### Windows 图标缓存

Windows 对安装包图标有激进缓存。清除方法：

```powershell
ie4uinit.exe -show  # 推荐
# 或重启资源管理器
taskkill /f /im explorer.exe && start explorer.exe
```

---

## 7. 自测清单

每次打包后执行以下检查：

- [ ] `npm run dev` 正常启动
- [ ] 安装包图标是白色 logo
- [ ] 安装后 exe 图标是白色
- [ ] `latest.yml` / `latest-mac.yml` 版本号 = package.json 版本号
- [ ] `latest.yml` / `latest-mac.yml` releaseNotes 内容正确
- [ ] auto-update URL 指向正确地址
- [ ] 安装包文件名格式正确
- [ ] COS 各平台只保留最新 5 个版本
- [ ] 本地 `release/` 目录只保留 5 个 release notes
- [ ] 下载更新后"退出并安装更新"正常（非隐藏到托盘）

---

## 8. Release Notes 模板

> ⚠️ **写 release notes 之前必读这些规则：**
>
> **格式要求：**
> 1. 纯文本格式，不要用 Markdown（系统信息提示渲染不了 MD）。
> 2. 不要写内部任务编号，用用户能理解的语言描述变化。
>
> **内容过滤规则（以下内容一律不写入）：**
> 3. **不要写内部实现机制** — 重构、架构调整等。
> 4. **不要写测试/日志/诊断** — 单元测试、诊断日志等。
> 5. **不要写文档更新** — README、TODO、设计文档等。
> 6. **不要写构建/工程改动** — chore、build script 修改等。
>
> **筛选方法：逐条问自己——"用户用了新版本后，能感知到这个变化吗？" 不能感知的，删掉。**

```text
MindCraft-Agent v{版本号} 更新日志

功能新增
- {用户能感知的新功能}

功能改进
- {用户能感知的体验优化}

问题修复
- {用户能感知的 bug 修复}
```

### 示例（v1.2.11）

```text
MindCraft-Agent v1.2.11 更新日志

问题修复
- 修复会话标题持久化问题：用户重命名会话标题后，应用重启不再丢失自定义标题
- 优化应用退出流程：退出时确保数据库完整持久化，避免数据丢失
- 修复 CodeHub 标签页溢出布局问题，改进标签栏在大量标签时的显示和滚动体验
- 修复切换会话标签页时 Git 状态未及时刷新的问题，支持强制刷新 Git 分支和变更信息
```

---

## 9. 常见问题

### Q: 构建报 `releaseNotesFile 'release/release-undefined.md' not found`

**原因**：执行了 `npm run electron:build-prod`，build.js 把 releaseNotesFile 写成了 `release-undefined`。

**修复**：跳过 build.js 直接构建（见 §3 命令），手动管理版本号。

### Q: 安装包图标是彩色的

**原因**：Windows 图标缓存。

**修复**：见 §6 图标缓存清除。

### Q: 下载完成后"退出并安装更新"失败

**原因**：旧版本主窗口 close 事件被拦截隐藏到托盘，安装器启动时旧应用仍占用安装目录。

**修复**：`install-update` IPC 调用前设置退出状态，确保 close handler 放行，销毁 tray 和快捷键。

### Q: 包体太大怎么办

**已知体积分析**：
- Electron 运行时 ~80MB（不可减少）
- Native addon 已打入包体
- 已移除 zip 目标，不再构建绿色免安装版

如需进一步优化，考虑 vendors 文件夹外挂按需下载。

### Q: macOS 构建失败

macOS 构建需要：
1. macOS 系统 + Xcode Command Line Tools
2. 有效的 Apple Developer 签名证书
3. `build/notarize.js` 中的 Apple ID + App-Specific Password

如果缺少签名证书，可以临时移除 `afterSign` 配置进行测试构建。
