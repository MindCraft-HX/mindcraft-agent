# Skill/Plugin 缓存失效参考

> T200 产出文档。修改 skill/plugin handler 时必读，避免同类回归。

## 两套独立系统

| | Claude Code | CodeX |
|---|-------------|-------|
| 主进程 handler 文件 | `packages/agent/electron/claudeAgent.js` | `packages/agent/electron/codexAgent.js` |
| 斜杠命令缓存变量 | `slashCommandsCache` (Map, line 2580) | `codexSlashCommandsCache` (Map, line 539) |
| 缓存 TTL | 10 min | 10 min |
| 渲染层组件 | `ManagePlugins.vue` / `ManageSkills.vue` | 复用同一组件（api-prefix 切换） |
| 渲染层事件 | `@plugin-toggled` / `@skills-changed` | 必须同时绑定 |

## 缓存失效矩阵

**规则：任何操作成功完成后，必须立即清除对应缓存。**

### Claude (`claudeAgent.js`)

| Handler | 通道常量 | 缓存清除 |
|---------|---------|----------|
| Plugin install | `CORE_CHANNELS.PLUGINS_INSTALL` | `_installedPluginsCache = null` + `slashCommandsCache.clear()` |
| Plugin uninstall | `CORE_CHANNELS.PLUGINS_UNINSTALL` | 同上 |
| Plugin enable | `CORE_CHANNELS.PLUGINS_ENABLE` | 同上 |
| Plugin disable | `CORE_CHANNELS.PLUGINS_DISABLE` | 同上 |
| Skill install | `CORE_CHANNELS.SKILLS_INSTALL` | `_skillsStateCache = null` + `resetSkillsMarketplaceCache()` + `slashCommandsCache.clear()` |
| Skill uninstall | `CORE_CHANNELS.SKILLS_UNINSTALL` | `_skillsStateCache = null` + `slashCommandsCache.clear()` |
| Skill market install | `CORE_CHANNELS.SKILLS_MARKET_INSTALL` | `_skillsStateCache = null` + `slashCommandsCache.clear()` |

### CodeX (`codexAgent.js`)

| Handler | 通道常量 | 缓存清除 |
|---------|---------|----------|
| Plugin install | `CODEX_CHANNELS.INSTALL_PLUGIN` | `_codexInstalledPluginsCache = null` + `codexSlashCommandsCache.clear()` |
| Plugin uninstall | `CODEX_CHANNELS.UNINSTALL_PLUGIN` | 同上 |
| Plugin enable | `CODEX_CHANNELS.ENABLE_PLUGIN` | 同上（注：CodeX enable/disable 是 add/remove 的别名） |
| Plugin disable | `CODEX_CHANNELS.DISABLE_PLUGIN` | 同上 |
| Skill install | `CODEX_CHANNELS.INSTALL_SKILL` | `_codexSkillsStateCache = null` + `resetCodexSkillsMarketplaceCache()` + `codexSlashCommandsCache.clear()` |
| Skill uninstall | `CODEX_CHANNELS.UNINSTALL_SKILL` | `_codexSkillsStateCache = null` + `codexSlashCommandsCache.clear()` |
| Skill market install | `CODEX_CHANNELS.MARKET_INSTALL_SKILL` | `_codexSkillsStateCache = null` + `codexSlashCommandsCache.clear()` |

## 渲染层事件绑定（必须）

`ManagePlugins` 和 `ManageSkills` 组件在 mutation 成功后 emit 事件，父组件必须监听以触发 `refreshSlashCommands()`：

```html
<!-- ClaudeCode (claudeCode/index.vue) -->
<ManagePlugins ref="managePluginsRef" api-prefix="plugins" @plugin-toggled="refreshSlashCommands(true)" />
<ManageSkills  ref="manageSkillsRef"  api-prefix="skills"  @skills-changed="refreshSlashCommands(true)" />

<!-- CodeX (codeX/index.vue) -->
<ManagePlugins ref="codexPluginsRef" api-prefix="codexPlugins" @plugin-toggled="refreshSlashCommands" />
<ManageSkills  ref="codexSkillsRef"  api-prefix="codexSkills"  @skills-changed="refreshSlashCommands" />
```

## 新增 handler 的 checklist

只要在 `claudeAgent.js` 或 `codexAgent.js` 中新增任何修改 skill/plugin 状态的 handler：

1. [ ] 确定操作类型（plugin / skill）
2. [ ] 清除对应的平台缓存（`_installedPluginsCache` / `_codexInstalledPluginsCache` / `_skillsStateCache` / `_codexSkillsStateCache`）
3. [ ] **清除斜杠命令缓存**（`slashCommandsCache.clear()` / `codexSlashCommandsCache.clear()`）
4. [ ] 如果 handler 通过 UI 触发，确保渲染层绑定了对应的 `@plugin-toggled` / `@skills-changed` 事件
5. [ ] `npm test` 全量通过
