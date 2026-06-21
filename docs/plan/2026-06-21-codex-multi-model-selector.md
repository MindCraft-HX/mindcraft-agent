# CodeX 多模型选择器改造计划

> 日期: 2026/06/21 | 状态: 📝 计划中

## Context

### 现状问题

1. **SelectModel.vue 硬编码 4 个 GPT 模型**（第 65-70 行），与 Provider 配置完全脱节
2. 用户配置 DeepSeek provider（model = `deepseek-chat`），模型选择器仍显示 `gpt-5.4 / gpt-5.5 / gpt-5.3-codex / gpt-5.2`
3. 在模型选择器中选择后，`codexSetModel` 写入 electron-conf，优先级覆盖 config.toml → 实际用的模型和 Provider 配置不一致
4. 用户观察到的现象：配了 DeepSeek 但实际跑的是 GPT-5.4（能识图而 deepseek 不行）

### CodeX SDK/CLI 真相

- **CodeX SDK 不内置任何模型列表、模型目录、模型校验** — `model` 就是透传 `string`
- SDK 内部拼成：`codex exec --experimental-json --model "any-string" ...`
- 模型值是否正确，完全由上游 API 决定
- **硬编码是 MindCraft 集成层的问题，不是 CodeX 的限制**

### 设计原则

- **config.toml 只写 CodeX 原生字段**（开源通用，不污染）
- **额外模型信息存 electron-conf**（MindCraft APP 层私有数据）
- **SelectModel 展示模型来自 Provider 配置 + 用户扩展**，不再硬编码
- **和 ClaudeCode 多模型体验对齐**：用户在配置阶段自定义可选模型

---

## 架构设计

```
Provider 配置数据流：

config.toml                              electron-conf
─────────────                            ─────────────
model = "deepseek-chat"                  providers[].alternativeModels:
    ↓                                      ["deepseek-reasoner",
model_provider = "my-deepseek"              "deepseek-v3-0324",
                                             ""]  ← 可选3个，允许空字符串
    └──────── 合并为 modelOptions ─────────┘
                      ↓
               SelectModel 展示 4 个槽位：
               [deepseek-chat, deepseek-reasoner, deepseek-v3-0324, (空)]
```

### 模型列表构造逻辑

```js
function buildModelOptions(provider) {
  const models = []
  
  // 槽位 1: 默认模型（config.toml model，必填）
  if (provider.model) models.push(provider.model)
  
  // 槽位 2-4: 可选模型（electron-conf，允许空）
  for (const m of (provider.alternativeModels || [])) {
    if (m && m.trim()) models.push(m.trim())
  }
  
  // 如果没有任何模型（极端情况），回退到当前运行时 model
  if (models.length === 0) {
    models.push(provider.model || '')  // fallback
  }
  
  return models
}
```

---

## 实施步骤

### Step 1：ProviderForm.vue — 新增可选模型输入

在 API 格式下方、auth.json 上方，新增 3 个可选模型输入框：

```html
<div class="setting-group">
  <label class="setting-label">可选模型</label>
  <div class="setting-tip">可额外配置 3 个备选模型，在对话中快速切换</div>
  
  <input class="setting-input alt-model" v-model="altModels[0]" 
         placeholder="备选模型 1（如 deepseek-reasoner）" />
  <input class="setting-input alt-model" v-model="altModels[1]" 
         placeholder="备选模型 2（如 deepseek-v3-0324）" />
  <input class="setting-input alt-model" v-model="altModels[2]" 
         placeholder="备选模型 3（如 kimi-latest）" />
</div>
```

脚本新增：
```js
const altModels = ref(['', '', ''])

// initFromProps 中
const alt = provider.alternativeModels || draft.alternativeModels || []
altModels.value = [
  alt[0] || '',
  alt[1] || '',
  alt[2] || '',
]

// onSave emit 中
alternativeModels: altModels.value.filter(Boolean)
```

### Step 2：APISetting.vue — 存取 alternativeModels

`normalizeProviderRecord()` 新增：
```js
alternativeModels: Array.isArray(provider.alternativeModels) 
  ? provider.alternativeModels.filter(Boolean) 
  : [],
```

`applyProvider()` 写入时：不需要改变，因为 electron-conf 中已有完整 provider 记录。

`extractTomlFields()` 不需要改动 — alternativeModels 不在 toml 中。

### Step 3：SelectModel.vue — 去硬编码，改为 props 驱动

核心改动：

```js
// ❌ 删除硬编码
// const modelOptions = [
//   { id: 'gpt-5.4', label: 'GPT-5.4', desc: '推荐' },
//   ...
// ]

// ✅ 改为动态列表
const props = defineProps({
  modelOptions: {
    type: Array,  // string[] — 模型 ID 列表
    default: () => [],
  },
})

// 增强标签显示：对模型名做后处理
// 如果传入 [{id:'deepseek-chat', label:'DeepSeek Chat', desc:'默认'}]
// label 直接展示，desc 显示为副标题（可选）
// 如果只传 string[]，label 用 id 本身
```

modelOptions 的每个元素保持接口兼容：
```js
{ id: 'deepseek-chat', label: 'DeepSeek Chat', desc: '' }
```

调用方负责把 `string[]` 转换成这个格式。

### Step 4：index.vue — 打开 SelectModel 时传入模型列表

`openModelPicker()` 中：

```js
async function openModelPicker(tab) {
  // 获取当前 provider 的模型列表
  const providers = await loadCurrentProviders()
  const activeProvider = findActiveProvider(providers)
  
  const allModels = buildModelOptions(activeProvider)
  
  const modelItems = allModels.map(id => ({
    id,
    label: id,  // 暂时用 id 做 label，后续可扩展
    desc: id === activeProvider.model ? '默认' : '',
  }))
  
  const result = await selectModelRef.value.open({
    model: tab.model,
    reasoningEffort: tab.reasoningEffort,
    modelOptions: modelItems,  // ← 新增参数
  })
  
  // ... 后续处理不变
}
```

SelectModel 的 `open()` 方法签名扩展：
```js
async function open(opts = {}) {
  // 优先使用传入的 modelOptions，否则用 props 的默认值
  if (opts.modelOptions && opts.modelOptions.length > 0) {
    modelOptions.value = opts.modelOptions
  }
  // ...
}
```

### Step 5：i18n 新增 key

```json
{
  "agent": {
    "altModels": "可选模型",
    "altModelsHint": "可额外配置 3 个备选模型，在对话中快速切换",
    "altModelPlaceholder1": "备选模型 1（如 deepseek-reasoner）",
    "altModelPlaceholder2": "备选模型 2（如 deepseek-v3-0324）",
    "altModelPlaceholder3": "备选模型 3（如 kimi-latest）"
  }
}
```

英文同理。

---

## 改动文件清单

| 文件 | 改动 | 预估行数 |
|------|------|---------|
| `ProviderForm.vue` | 新增 3 个可选模型输入框 + altModels ref + init/emit 逻辑 | +40 |
| `APISetting.vue` | normalizeProviderRecord 新增 alternativeModels | +3 |
| `SelectModel.vue` | 去掉硬编码 modelOptions，改为 props 接收 + open() 扩展 | ~15 |
| `index.vue` | openModelPicker 读取 provider 构造模型列表传入 | +20 |
| `zh-CN.json` + `en.json` | 新增 5 个 i18n key | +5 |
| **合计** | | **~85** |

---

## 不变部分

| 文件 | 说明 |
|------|------|
| `providerToml.mjs` | 不改 — 只写 config.toml 原生字段，alternativeModels 不写 toml |
| `codexAgent.js` | 不改 — model 始终从 electron-conf/config.toml 读取，透传到 CodeX SDK |
| `proxyServer.js` | 不改 — 代理只做协议转换，不感知模型选择逻辑 |
| `codex/` 其余模块 | 不改 |

---

## 边界情况处理

### 可选模型为空
- `altModels.filter(Boolean)` → 空数组 → SelectModel 只显示默认模型一项
- 模型选择器仍然可用（单选）

### 可选模型重复
- 不做去重（用户可能故意在不同 Provider 用同名模型）
- 交给用户自行管理

### Provider 切换
- 切换 Provider 时，SelectModel 重新读取新 Provider 的模型列表
- `index.vue` 在 `openModelPicker` 中实时读取当前 active provider

### 回退兼容
- 旧 provider 没有 `alternativeModels` 字段 → `normalizeProviderRecord` 默认 `[]`
- 旧 SelectModel 调用方不传 `modelOptions` → `open()` 保留原有 props 作为 fallback

---

## 验证方案

### 功能验证
- [ ] ProviderForm 显示 3 个可选模型输入框
- [ ] 填入模型名保存后，重新打开仍保留
- [ ] SelectModel 显示：默认模型 + 已填的可选模型（最多 4 个）
- [ ] 选择任一模型 → 对话使用正确模型
- [ ] 可选模型全空 → SelectModel 显示仅默认模型一项
- [ ] 切换 Provider → SelectModel 刷新为新 Provider 的模型列表
- [ ] config.toml 不含 alternativeModels 字段

### 构建验证
- `npm run build` 无报错
