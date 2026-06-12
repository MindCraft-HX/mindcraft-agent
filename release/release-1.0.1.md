# MindCraft-Agent v1.0.1

## Bug 修复

- **T064**: 修复 npm run dev 白屏——悬浮球 /side 路由通过同源 localStorage 污染主窗口路由记忆
- 修复 Electron 36 console-message 事件签名变更导致渲染进程错误被静默吞掉
- 修复 dev 模式关窗不退出导致僵尸进程占用 16288 端口
- 修复 build.js configJson.version 缺少 fallback → {} 的问题
- 修复 mindcraft-agent 自动更新误拉 mindcraft-electron 的 latest.yml

## 清理

- 删除 3 个无用依赖：@ricky0123/vad-web (72MB)、sharp (19MB)、node-pty (64MB)，包体 152→115MB (-24%)
- 删除 5 个死代码文件：openDrawWin、codeWindow、ptyManager、explain.js
- 图标统一为白色 logo，与 mindcraft-electron 区分
- 恢复 Vite HMR 热更新
- 新增 dev 守护自动回收孤儿进程 + 路由自检日志
