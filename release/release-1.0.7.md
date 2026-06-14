MindCraft-Agent v1.0.7

新功能：
- 创建插件自定义图标支持

优化：
- 替换 electron-conf 为原生 JSON 存储，优化启动性能

Bug 修复：
- 修复插件重复安装问题
- 修复 agent-skills-cli asar 导入报错
- 修复 Codex 对话恢复时 sandbox/network/webSearch 配置丢失
- 修复 Codex triggerDone → flush 竞态误报
- 修复 storeToRefs 插件列表响应式
