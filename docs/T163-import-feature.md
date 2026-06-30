# T163 系统设置全局 CC Switch 导入

> 版本：1.1  
> 日期：2026-06-30  
> 状态：核心已完成，待人工验收  
> 计划文档：`docs/plan/2026-06-30-storage-sqlite-cc-switch-import.md`

---

## 1. 功能概述

在系统设置（SystemSettings.vue）增加 **"导入配置"** 入口，支持从 CC Switch 导出的 `.sql` 文件中解析 CodeX 和 ClaudeCode provider 配置，分流预览后写入 SQLite provider/import 存储层，并向后兼容投影到各 Agent 的 legacy runtime 存储层。

同时，各 Agent 配置页（CodeX / ClaudeCode APISetting.vue）的 **"导入"** 按钮简化为**仅导入本地 CLI 配置**（`config.toml` / `settings.json`），CC Switch 导入入口已上移到系统设置。

---

## 2. 架构全景

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           入口 A：系统设置（CC Switch .sql）               │
│                                                                          │
│  SystemSettings.vue                                                       │
│    └─ 导入配置 按钮 → 文件选择器                                           │
│       └─ 预览弹窗（CodeX 组 / ClaudeCode 组 / Skipped 组）                  │
│          └─ 用户决策（新增 / 覆盖 / 重命名 / 跳过）+ active 开关             │
│             └─ 确认导入                                                   │
│                                                                          │
│              三个系统级 IPC (主进程 systemImportIpc.js)                     │
│              config-import-pick-file                                      │
│              config-import-preview                                        │
│              config-import-commit                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      入口 B：Agent 配置页（仅本地 CLI）                     │
│                                                                          │
│  CodeX APISetting.vue  ──→  codex-config-import-preview                  │
│                       ──→  codex-config-import-commit                    │
│                       来源: ~/.codex/config.toml                          │
│                       ⛔ source='cc-switch' 被拒绝                         │
│                                                                          │
│  ClaudeCode APISetting.vue ──→  claude-config-import-preview              │
│                            ──→  claude-config-import-commit               │
│                            来源: ~/.claude/settings.json                  │
│                            ⛔ source='cc-switch' 被拒绝                    │
└─────────────────────────────────────────────────────────────────────────┘

                     ┌─────────────────────────────┐
                     │     共享裁决层               │
                     │  db/import/index.js          │
                     │  ├─ previewCcSwitchFile()    │  CC Switch .sql 解析
                     │  ├─ previewLocalCliConfig()  │  config.toml / settings.json
                     │  ├─ annotateConflicts()      │  冲突标注
                     │  └─ commitImport()           │  写入 + 校验
                     │      ├─ rename 非空/唯一校验  │
                     │      └─ providerDao.upsert   │
                     └──────────────┬──────────────┘
                                    │
                   ┌────────────────┴────────────────┐
                   ▼                                 ▼
           SQLite (sql.js)                   Legacy Storage
       ┌──────────────────┐          ┌──────────────────────┐
       │ providers 表     │          │ CodeX: providers.json │
       │ import_runs 表   │          │ Claude: electron-conf │
       │ backups/         │          └──────────────────────┘
       └──────────────────┘
```

---

## 3. 数据流

### 3.1 CC Switch 导入（主流程）

```
用户选择 .sql 文件
  │
  ▼
previewCcSwitchFile(filePath)
  │  parseCcSwitchExport() → INSERT 语句提取
  │  mapCcSwitchRow() → 按 app_type 映射到 agentType
  │  丢弃 unsupported rows → 归入 Skipped 组
  │  未知字段不进入 runtime config → 仅保留在 metadata 审计信息中
  │
  ▼
annotateConflicts(previewProviders, existingProviders)
  │  按 agentType 分别与 CodeX / ClaudeCode 现有 provider name 比对
  │  大小写不敏感 → 标记 conflict: 'name' 或 null
  │
  ▼
用户决策（UI 层）
  │  action: add / overwrite / rename / skip
  │  rename → 校验非空 + 唯一
  │
  ▼
commitImport(db, { decisions, previewProviders, existingProviders, ... })
  │  构建 toUpsert[] → providerDao.upsertProviders()
  │  写入前自动备份 DB
  │  importRunsDao.recordImportRun() 审计记录
  │  setActiveProvider() 收口（同一 agent 至多一个 active）
  │
  ▼
Legacy 投影（调用方负责）
  │  CodeX: writeCodexProviders() → providers.json
  │  ClaudeCode: confSet('claudeProviders', ...) → electron-conf
  │  active 按 applyActiveFromCcSwitch 决定是否切换
  │
  ▼
persistDb()
  sql.js 内存 → 落盘 .sqlite 文件
```

### 3.2 本地 CLI 导入

```
CodeX: readCodexConfigTomlRaw() → parseSimpleTomlContent()
       → previewLocalCliConfig({ agentType: 'codex', cliConfig })
       → commitImport(db, { source: 'local-cli', ... })
       → writeCodexProviders() → providers.json

Claude: readRuntimeConfigFromUserSettingsFile()
        → previewLocalCliConfig({ agentType: 'claude', cliConfig })
        → commitImport(db, { source: 'local-cli', ... })
        → confSet('claudeProviders', ...)
```

---

## 4. IPC 通道清单

### 4.1 系统级（core）

| 通道名 | 方向 | 用途 |
|--------|------|------|
| `config-import-pick-file` | renderer → main | 打开 .sql 文件选择器 |
| `config-import-preview` | renderer → main | 解析 .sql 并返回分组预览 |
| `config-import-commit` | renderer → main | 提交导入决策到 DB + legacy |

### 4.2 CodeX Agent 级

| 通道名 | 来源限制 | 用途 |
|--------|:--------:|------|
| `codex-config-import-preview` | 仅 `local-cli` | 读取 config.toml 预览 |
| `codex-config-import-commit` | 仅 `local-cli` | 写入 SQLite + providers.json |

### 4.3 ClaudeCode Agent 级

| 通道名 | 来源限制 | 用途 |
|--------|:--------:|------|
| `claude-config-import-preview` | 仅 `local-cli` | 读取 settings.json 预览 |
| `claude-config-import-commit` | 仅 `local-cli` | 写入 SQLite + electron-conf |

### 4.4 CC Switch 阻断

Agent 级 IPC 收到 `source === 'cc-switch'` 时统一返回：

```js
{ ok: false, ... warnings: ['CC Switch import has moved to System Settings > Import Config.'] }
```

---

## 5. 用户操作说明

### 5.1 从 CC Switch 导入

1. 打开 **系统设置** → 找到 **导入配置** 区域 → 点击按钮
2. 在文件选择器中选择 CC Switch 导出的 `.sql` 文件
3. 预览弹窗展示三组：
   - **CodeX 组** — 可分别选择 新增 / 覆盖 / 重命名 / 跳过
   - **ClaudeCode 组** — 同上
   - **Skipped 组** — 不支持的 app_type 行，不参与导入
4. 底部 checkbox：**"使用 CC Switch active 状态"**（默认不勾选）
5. 点击 **确认导入**

### 5.2 Action 行为表

| Action | 冲突时显示 | 行为 |
|--------|:----------:|------|
| 新增 | 总是 | 以原名导入为新 provider |
| 覆盖 | 仅冲突时 | 按 name 匹配替换现有 provider |
| 重命名 | 仅冲突时 | 输入新名称（placeholder=原名），校验后导入 |
| 跳过 | 总是 | 不导入该项 |

### 5.3 重命名校验规则

| 场景 | 校验结果 |
|------|----------|
| 输入框留空 | ❌ 拒绝 → warning "Rename: empty name for … skipped." |
| 新名与已有 provider 重复 | ❌ 拒绝 → warning "Rename: … already exists, … skipped." |
| 新名与本批其他导入重复 | ❌ 拒绝 → warning "Rename: … conflicts with another … skipped." |
| 三者都不命中 | ✅ 通过，以新名导入 |

### 5.4 Active 开关逻辑

| 勾选 | SQLite 写入 | Legacy activeIdx |
|:----:|------------|-------------------|
| 不勾 | `isActive: false`（全部清除） | 保持现有不变 |
| 勾选 | 保留 CC Switch active 标记 | 切换到 CC Switch 的 active provider |

如果 active provider 被重命名，按 `tempId → finalName` 解析，不会因原名找不到而丢失 active 切换。

---

## 6. 关键模块文件

### 6.1 共享裁决层

| 文件 | 职责 |
|------|------|
| `packages/agent/electron/db/import/index.js` | `previewCcSwitchFile`, `previewLocalCliConfig`, `annotateConflicts`, `commitImport` |
| `packages/agent/electron/db/import/ccSwitch.js` | CC Switch SQL 解析器（INSERT 提取 + 行映射） |
| `packages/agent/electron/db/dao/providers.js` | `upsertProviders`, `setActiveProvider` |
| `packages/agent/electron/db/dao/importRuns.js` | `recordImportRun` 审计日志 |
| `packages/agent/electron/db/backup.js` | `backupDb` 导入前备份 |
| `packages/agent/electron/db/index.js` | `getDb`, `persistDb` |

### 6.2 入口层

| 文件 | 职责 |
|------|------|
| `packages/agent/electron/db/import/systemImportIpc.js` | 系统级 3 个 IPC handler + active 定位 |
| `packages/agent/electron/codex/configIpc.js` | CodeX 单 Agent 导入 IPC（仅 local-cli） |
| `packages/agent/electron/claudeAgent.js` | ClaudeCode 单 Agent 导入 IPC（仅 local-cli） |
| `packages/agent/electron/index.js` | `registerAgentIPCs()` 注册所有 handler |

### 6.3 UI 层

| 文件 | 职责 |
|------|------|
| `packages/agent/src/components/agentCommon/components/SystemSettings.vue` | 系统设置 → 导入弹窗 + 预览表格 + action 选择 |
| `packages/agent/src/components/codeX/components/APISetting.vue` | CodeX 配置页 → 本地 CLI 导入确认弹窗 |
| `packages/agent/src/components/claudeCode/components/APISetting.vue` | ClaudeCode 配置页 → 本地 CLI 导入确认弹窗 |

### 6.4 IPC 注册

| 文件 | 职责 |
|------|------|
| `packages/agent/shared/ipcChannels.js` | 9 个新通道常量（3 组 × 3 通道） |
| `packages/agent/preload/index.js` | preload bridge 暴露导入相关 API 方法 |

---

## 7. 验收清单

### 7.1 基础功能

- [ ] 系统设置 → 导入配置 → 选择 .sql → 弹窗展示三组（CodeX/ClaudeCode/Skipped）
- [ ] 无冲突 provider → action=新增 → 导入后出现在对应 Agent 配置页
- [ ] 冲突 provider → action=覆盖 → key/url/model 更新，id 不变
- [ ] 冲突 provider → action=重命名 → 新名称导入，原 provider 保留
- [ ] 冲突 provider → action=重命名 → 留空/重复名 → 拒绝 + warning
- [ ] 跳过 action → 该项不导入
- [ ] Skipped 组展示 unsupported rows 原因
- [ ] 确认导入后 ElMessage: "导入完成：CodeX N 项，Claude Code M 项，跳过 K 项"
- [ ] 关闭重开应用 → 导入的 provider 仍存在

### 7.2 Active 开关

- [ ] 不勾选 → 导入后 active provider 不变
- [ ] 勾选 → 导入后 active 切换到 CC Switch 标记的 provider
- [ ] 勾选 + active provider 被重命名 → active 正确切换到新名称

### 7.3 本地 CLI 导入

- [ ] CodeX 配置页 → 导入 → 从 config.toml 读取 key/url/model
- [ ] ClaudeCode 配置页 → 导入 → 从 settings.json 读取 key/url

### 7.4 CC Switch 阻断

- [ ] codex Agent IPC 收到 `source='cc-switch'` → 返回 error
- [ ] claude Agent IPC 收到 `source='cc-switch'` → 返回 error

### 7.5 测试

- [ ] `npm test`：158 pass / 0 fail / 1 skipped
- [ ] `npm run test:contract`：当前仍有 2 个非 T163 失败，需单独处理
- [ ] `npm run build`：Vite 构建成功

---

## 8. 测试说明

### 8.1 DB 层测试

| 测试文件 | 覆盖 |
|----------|------|
| `packages/agent/electron/db/db.test.js` | DB migration / DAO / CC Switch parser / T163 专项（mixed SQL / overwrite / active 分组 / 防污染） |

### 8.2 Contract 测试

| 测试 | 状态 |
|------|:----:|
| `ipc-channel-registry.test.cjs` | ✅ 5/5 pass |
| `home-metrics.test.cjs:30` | ❌ 当前失败（1300 ≠ 400），非 T163 导入链路 |
| 另 1 个 contract 失败 | ❌ 当前失败，需在对应专项里处理 |

> `npm test` 已覆盖 T163 关键导入链路；contract 非全绿不应阻塞 CC Switch 导入功能验收，但需要单独登记修复。

---

## 9. 已知局限与后续

| 项 | 说明 |
|----|------|
| **T164 Provider 排序** | APISetting.vue provider 列表暂不支持拖拽排序，已从 T163 拆为独立任务 |
| **Claude provider model 字段** | CC Switch 导入的 Claude provider 暂不设置 model，需人工配置 |
| **导入后不即时刷新** | 导入后需手动切到对应 Agent 配置页查看新 provider |
| **大型 .sql 文件** | sql.js WASM 解析大文件性能未做专项优化 |
| **contract 非全绿** | 2 个 pre-existing 失败待后续修复 |
