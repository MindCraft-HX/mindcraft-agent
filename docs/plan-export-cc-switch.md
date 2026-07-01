# MindCraft Provider SQL 导出方案

## 目标

将 MindCraft 中已配置的 ClaudeCode 和 CodeX provider 导出为通用的 SQL 配置文件，便于备份、迁移和在兼容工具中导入。

用户侧命名保持中性：

- 按钮：`导出配置`
- 文件：`mindcraft-providers-YYYYMMDD-HHmm.sql`
- 弹窗标题：`导出配置`
- 说明：`导出的 SQL 文件包含当前 provider 配置，可用于迁移或备份。`

实现格式可以兼容现有 provider SQL 生态，但 UI 文案不要强调某个第三方工具。

---

## 当前阶段边界

当前 T163/Phase 1 仍是过渡状态：

- SQLite 已经记录 provider/import 数据。
- 运行时 provider 权威仍然是 legacy storage。
- CodeX 当前读取 `~/.codex/providers.json`。
- ClaudeCode 当前读取 `claudeProviders` electron-conf/internal JSON。

因此本阶段导出应从**当前运行时实际读取的 provider 状态**导出，而不是直接假设 SQLite 是唯一权威。

推荐边界：

```text
导出 IPC
  -> 通过现有 provider storage adapter/deps 读取当前 CodeX + Claude provider
  -> 归一化为导出模型
  -> 生成 provider SQL
  -> 保存到用户选择的位置
```

不要让 `db/export/ccSwitch.js` 自己硬编码读取 `electron-conf` 或 `~/.codex/providers.json`。这样 Phase 2 切换到 SQLite 权威时，导出模块只需要换读取 adapter，不需要改 SQL 生成器。

---

## 数据来源

### ClaudeCode

来源：当前 `claude-get-providers` 背后的 provider 状态。

常见 provider 形态并不保证包含完整 `config`：

```json
{
  "name": "MindCraft-CC",
  "key": "sk-xxx",
  "url": "https://api.example.com",
  "tierModels": {
    "haiku": "",
    "sonnet": "claude-sonnet-...",
    "opus": "claude-opus-...",
    "reasoning": ""
  },
  "config": null
}
```

导出规则：

1. 优先使用 `provider.config` 作为基础配置。
2. 如果 `provider.config` 不存在或不完整，用 `key/url/tierModels/selectedTier/language/permissionPolicy/effortLevel` 重建 `settings_config`。
3. 不假设 `provider.config` 是完整 `~/.claude/settings.json` 镜像。
4. 不导出 MindCraft 私有 UI 状态。

Claude `settings_config` 建议结构：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_BASE_URL": "https://api.example.com",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-...",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-..."
  },
  "model": "sonnet",
  "language": "zh-CN",
  "permissionPolicy": "ask",
  "effortLevel": "medium"
}
```

`meta` 建议：

```json
{
  "apiFormat": "anthropic",
  "apiKeyField": "ANTHROPIC_AUTH_TOKEN",
  "source": "mindcraft"
}
```

`apiKeyField` 规则：

- 如果原始 config/env 明确使用 `ANTHROPIC_API_KEY`，保留该字段。
- 否则默认使用 `ANTHROPIC_AUTH_TOKEN`。

风险：中等。主要风险在于不同 Claude provider 的模型 tier 和 env 字段不完全一致，必须通过 roundtrip 测试兜住。

### CodeX

来源：当前 `codex-get-providers` 背后的 provider 状态。

典型 provider：

```json
{
  "name": "DeepSeek",
  "key": "sk-xxx",
  "url": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "reasoningEffort": "medium",
  "apiFormat": "chat",
  "alternativeModels": ["", "", ""],
  "tomlText": "..."
}
```

导出规则：

1. 不直接导出 `tomlText`。
2. 从 provider 字段重建干净 TOML。
3. `alternativeModels` 是 MindCraft 私有能力，本阶段不导出。
4. 只导出运行所需的 key/url/model/reasoning/apiFormat。

CodeX `settings_config` 建议结构：

```json
{
  "auth": {
    "OPENAI_API_KEY": "sk-xxx"
  },
  "config": "model_provider = \"custom\"\nmodel = \"deepseek-chat\"\n..."
}
```

CodeX TOML 生成建议：

```toml
model_provider = "custom"
model = "{provider.model}"
model_reasoning_effort = "{provider.reasoningEffort}"
wire_api = "{chat|responses}"

[model_providers.custom]
name = "{provider.name}"
base_url = "{provider.url}"
requires_openai_auth = true
```

注意：`requires_openai_auth = true` + `auth.OPENAI_API_KEY` 是否为目标兼容格式，需要用真实导入/运行样本验证。不要在实现说明里承诺“完全等价”，以测试结果为准。

`meta` 建议：

```json
{
  "apiFormat": "openai_chat",
  "codexChatReasoning": {
    "effort": "medium",
    "summary": "medium"
  },
  "source": "mindcraft"
}
```

`apiFormat` 映射：

| MindCraft | meta.apiFormat | TOML wire_api |
|---|---|---|
| `responses` | `openai_responses` | `responses` |
| `chat` | `openai_chat` | `chat` |

风险：中低。关键风险是 TOML/auth 的目标格式兼容性，需要用样本导入验证。

---

## SQL 格式

导出文件使用显式列名，避免依赖字段顺序：

```sql
-- MindCraft Provider SQL Export
-- Generated at: 2026-07-01T12:00:00.000Z
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "providers" (
  "id" TEXT PRIMARY KEY,
  "app_type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "settings_config" TEXT NOT NULL,
  "website_url" TEXT,
  "category" TEXT,
  "created_at" INTEGER NOT NULL,
  "sort_index" INTEGER NOT NULL,
  "notes" TEXT,
  "icon" TEXT,
  "icon_color" TEXT,
  "meta" TEXT,
  "is_current" INTEGER NOT NULL DEFAULT 0,
  "in_failover_queue" INTEGER NOT NULL DEFAULT 0,
  "cost_multiplier" TEXT DEFAULT '1.0',
  "limit_daily_usd" TEXT,
  "limit_monthly_usd" TEXT,
  "provider_type" TEXT
);

INSERT INTO "providers" (...) VALUES (...);

COMMIT;
PRAGMA foreign_keys=ON;
```

字段映射：

| SQL 列 | ClaudeCode | CodeX |
|---|---|---|
| `id` | 新 UUID | 新 UUID |
| `app_type` | `claude` | `codex` |
| `name` | provider.name | provider.name |
| `settings_config` | Claude settings JSON | `{ auth, config }` JSON |
| `website_url` | provider.website 或 NULL | NULL |
| `notes` | provider.note 或 NULL | NULL |
| `category/icon/icon_color` | NULL | NULL |
| `created_at` | Unix 秒 | Unix 秒 |
| `sort_index` | 导出顺序 | 导出顺序 |
| `meta` | JSON | JSON |
| `is_current` | 默认 0，可选导出 active | 默认 0，可选导出 active |
| `in_failover_queue` | 0 | 0 |
| `cost_multiplier` | `1.0` | `1.0` |
| `provider_type` | NULL | NULL |

---

## 密钥处理

导出文件可能包含 API key，必须作为高风险操作处理。

UI 要求：

- 点击导出后弹确认框。
- 明确提示：`导出的配置文件可能包含 API Key，请只保存到可信位置。`
- 提供选项：
  - `导出完整配置`：包含 key，适合迁移。
  - `隐藏密钥后导出`：key 写为空字符串或脱敏占位，适合分享结构。

实现要求：

- 禁止 `console.log` 输出 key、key 前缀、key 长度。
- 导出失败时不把 SQL 文本写入错误日志。
- 默认文件名不要包含 provider 名称或 key。

脱敏导出规则：

| 字段 | 完整导出 | 隐藏密钥导出 |
|---|---|---|
| Claude `ANTHROPIC_AUTH_TOKEN` | 原值 | `""` |
| Claude `ANTHROPIC_API_KEY` | 原值 | `""` |
| CodeX `auth.OPENAI_API_KEY` | 原值 | `""` |

---

## IPC 与 UI

### 新增模块

```text
packages/agent/electron/db/export/ccSwitch.js
packages/agent/electron/db/export/index.js       可选
```

虽然文件名可以沿用 `ccSwitch.js` 表示兼容格式来源，但对外 API 使用中性命名：

```js
buildProviderSqlExport({ claudeProviders, codexProviders, includeSecrets, includeActive })
buildClaudeProviderInsert(provider, sortIndex, opts)
buildCodexProviderInsert(provider, sortIndex, opts)
buildCodexToml(provider)
escapeSqlLiteral(value)
```

### IPC

建议新增系统级 IPC：

```text
config-export-preview
config-export-save
```

`config-export-preview`：

- 返回 provider 数量。
- 返回包含密钥风险标记。
- 返回会被跳过的不完整 provider。
- 不返回完整 SQL 文本。

`config-export-save`：

- 打开保存对话框。
- 生成 SQL。
- 写入用户选择路径。
- 返回 `{ ok, filePath, exported, skipped, warnings }`。

不要把导出挂到单个 Agent 设置页；这是跨 CodeX/ClaudeCode 的系统级配置能力。

### UI 位置

建议在系统设置的配置迁移区域中放两个按钮：

```text
导入配置    导出配置
```

导出弹窗：

- 显示 CodeX / ClaudeCode provider 数量。
- 显示是否包含密钥。
- 允许勾选 `隐藏密钥`。
- 可选勾选 `保留当前启用状态`，默认不勾选。

---

## 校验与测试

必须补以下测试：

1. Claude provider 没有 `config` 时，可以从 `key/url/tierModels` 重建并导出。
2. Claude provider 有完整 `config` 时，保留已知 env 字段，不丢 `ANTHROPIC_API_KEY` 形态。
3. CodeX `chat` 与 `responses` 两种 `apiFormat` 都能导出。
4. provider 名称、URL、notes 包含单引号、换行、中文时，SQL 能被 `parseCcSwitchExport()` 重新解析。
5. 导出的混合 SQL 再走现有导入 preview，可正确分成 CodeX / ClaudeCode / skipped。
6. `隐藏密钥后导出` 不包含原 key。
7. `includeActive=false` 时所有 `is_current=0`。
8. `includeActive=true` 时每个 agent 至多一个 active。

建议增加 roundtrip 测试：

```text
MindCraft providers
  -> buildProviderSqlExport()
  -> parseCcSwitchExport()
  -> normalize
  -> assert provider name/key/url/model/apiFormat/tierModels
```

---

## 实施顺序

1. 先实现纯函数导出器和测试，不接 UI。
2. 用现有 `parseCcSwitchExport()` 做 roundtrip。
3. 接系统级 IPC。
4. 接系统设置 UI。
5. 人工验收完整导出、隐藏密钥导出、再次导入。

---

## 工作量评估

| 模块 | 估计 |
|---|---:|
| 纯导出器 | 150-220 行 |
| 单元测试 / roundtrip | 120-180 行 |
| IPC + preload | 40-70 行 |
| UI + i18n | 80-130 行 |
| 合计 | 390-600 行 |

复杂度：中等。  
主要复杂度不在 SQL 拼接，而在 Claude provider 缺少完整 config 时的重建、CodeX auth/TOML 格式验证，以及密钥导出的安全边界。
