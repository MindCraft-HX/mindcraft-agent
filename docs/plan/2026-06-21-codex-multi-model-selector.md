# CodeX 多模型选择器改造计划

> 日期: 2026/06/21 | 状态: ✅ 已实现

## Context

### 现状问题

1. **SelectModel.vue 硬编码 4 个 GPT 模型**（第 65-70 行），与 Provider 配置完全脱节
2. 用户配置 DeepSeek provider（model = `deepseek-chat`），模型选择器仍显示 `gpt-5.4 / gpt-5.5 / gpt-5.3-codex / gpt-5.2`
3. 在模型选择器中选择后，`codexSetModel` 写入 electron-conf，优先级覆盖 config.toml → 实际用的模型和 Provider 配置不一致

### CodeX SDK/CLI 真相

- **CodeX SDK 不内置任何模型列表、模型目录、模型校验** — `model` 就是透传 `string`
- SDK 内部拼成：`codex exec --experimental-json --model "any-string" ...`
- 模型值是否正确，完全由上游 API 决定
- **硬编码是 MindCraft 集成层的问题，不是 CodeX 的限制**

### 设计原则

- **config.toml 只写 CodeX 原生字段**（开源通用，不污染）
- **备选模型信息存 electron-conf**（MindCraft APP 层私有数据）
- **SelectModel 展示：默认模型 + 3 个备选模型**，不再硬编码
- **和 ClaudeCode 多模型体验对齐**：用户在配置阶段自定义备选模型

---

## 最终设计

### SelectModel 展示

```
┌─────────────────────────────────────────────┐
│  默认模型      deepseek-chat          ✓     │
│  备选模型 1    deepseek-reasoner            │
│  备选模型 2    deepseek-v3-0324             │
│  备选模型 3    kimi-latest                  │
│                                             │
│  推理强度  ●●●○○  Medium                    │
└─────────────────────────────────────────────┘
```

规则：
- 槽位 1 始终显示（默认模型，来自 config.toml `model`）
- 槽位 2-4 有填才显示（备选模型，来自 electron-conf）
- 标签 "默认模型" / "备选模型 1" / "备选模型 2" / "备选模型 3" 来自 i18n
- 模型 ID 显示在右侧（等宽字体）

### ProviderForm UI

```
模型名称
  [deepseek-chat                       ]  ← 默认模型，写入 config.toml

备选模型 1
  [deepseek-reasoner                   ]  ← 仅存 electron-conf

备选模型 2
  [deepseek-v3-0324                    ]

备选模型 3
  [kimi-latest                         ]
```

每个备选模型输入框带有 label 标注 "备选模型 1/2/3"，placeholder 示例提示。

### 数据存储

config.toml（不变）:
```toml
model = "deepseek-chat"
```

electron-conf (`alternativeModels` 数组):
```js
['deepseek-reasoner', 'deepseek-v3-0324', 'kimi-latest']
```

### 模型列表构造逻辑

```js
function buildModelOptions(provider) {
  const items = []
  
  // 槽位 1: 默认模型
  items.push({ 
    id: provider.model || '', 
    label: '默认模型', 
    slot: 'default' 
  })
  
  // 槽位 2-4: 备选模型
  const alts = provider.alternativeModels || []
  for (let i = 0; i < 3; i++) {
    const mid = alts[i]
    if (mid && mid.trim()) {
      items.push({ 
        id: mid.trim(), 
        label: `备选模型 ${i + 1}`, 
        slot: `alt${i + 1}` 
      })
    }
  }
  
  return items
}
```

---

## 实施步骤

### Step 1：ProviderForm.vue — 新增备选模型输入

在模型名称输入框下方、Reasoning Effort 上方，新增 3 个备选模型输入框：

```html
<!-- 模型名称（已有，不动） -->
<div class="setting-group">
  <label class="setting-label">{{ $t('settings.modelName') }}</label>
  <input class="setting-input" v-model="form.model" />
</div>

<!-- 备选模型（新增） -->
<div class="setting-group">
  <label class="setting-label">{{ $t('agent.altModel1') }}</label>
  <input class="setting-input" v-model="altModels[0]" 
         :placeholder="$t('agent.altModelPlaceholder')" />
</div>
<div class="setting-group">
  <label class="setting-label">{{ $t('agent.altModel2') }}</label>
  <input class="setting-input" v-model="altModels[1]" 
         :placeholder="$t('agent.altModelPlaceholder')" />
</div>
<div class="setting-group">
  <label class="setting-label">{{ $t('agent.altModel3') }}</label>
  <input class="setting-input" v-model="altModels[2]" 
         :placeholder="$t('agent.altModelPlaceholder')" />
</div>
```

脚本新增：
```js
const altModels = ref(['', '', ''])

// initFromProps 中
const alt = provider.alternativeModels || []
altModels.value = [
  alt[0] || '',
  alt[1] || '',
  alt[2] || '',
]

// onSave emit 中
alternativeModels: altModels.value.filter(s => s && s.trim()),
```

### Step 2：APISetting.vue — 存取 alternativeModels

`normalizeProviderRecord()` 新增：
```js
alternativeModels: Array.isArray(provider.alternativeModels) 
  ? provider.alternativeModels.filter(Boolean) 
  : [],
```

`extractTomlFields()` 不改 — alternativeModels 不在 toml 中。

### Step 3：SelectModel.vue — 去硬编码，改为动态列表

核心改动：

```js
// ❌ 删除硬编码
// const modelOptions = [
//   { id: 'gpt-5.4', label: 'GPT-5.4', desc: '推荐' },
//   ...
// ]

// ✅ 改为动态
const modelOptions = ref([])

async function open(opts = {}) {
  // ...
  
  // 构造模型列表
  const list = buildModelOptionsFromProvider(opts)
  modelOptions.value = list
  
  // 高亮当前模型
  const model = (opts.model || '').trim()
  const matched = list.find(m => m.id === model)
  hoveredId.value = matched ? model : (list[0]?.id || '')
  initialModel.value = model || ''
  
  // ...
}
```

`buildModelOptionsFromProvider` 可以用在 index.vue 中预构造传入，或在 SelectModel 内部从 IPC 读取。**选择方案：在 index.vue 中构造，通过 `open()` 的 opts 传入**，避免 SelectModel 依赖 IPC。

模板改动：每行用 `item.label`（默认模型/备选模型 N）+ `item.id`（模型名）：

```html
<div v-for="(item, idx) in modelOptions" :key="item.id || idx"
     class="model-cmd-row" :class="{ active: item.id === hoveredId }"
     @click="confirmSelection(item)" @mouseenter="hoveredId = item.id">
  <span class="model-cmd-name">{{ item.label }}</span>
  <span class="model-cmd-model">{{ item.id }}</span>
  <svg v-if="item.id === initialModel" class="model-cmd-check" ...>
    ...
  </svg>
</div>
```

### Step 4：index.vue — 打开 SelectModel 时传入模型列表

`openModelPicker()` 中构造模型列表后传入：

```js
async function openModelPicker(tab) {
  const allModels = await buildCurrentModelOptions()
  
  const result = await selectModelRef.value.open({
    model: tab.model,
    reasoningEffort: tab.reasoningEffort,
    modelOptions: allModels,      // ← 新增
  })
  
  if (result) {
    tab.model = result.model
    // ...
  }
}

async function buildCurrentModelOptions() {
  const model = await window.electronAPI?.codexGetModel?.() || ''
  // 从当前 active provider 的 electron-conf 中读取 alternativeModels
  const providers = await loadCurrentProviders()  // 已有方法
  const active = providers.find(p => p.active)
  const alts = active?.alternativeModels || []
  
  const items = [{ id: model, label: '默认模型' }]
  for (let i = 0; i < alts.length && i < 3; i++) {
    if (alts[i]?.trim()) {
      items.push({ id: alts[i].trim(), label: `备选模型 ${i + 1}` })
    }
  }
  return items
}
```

### Step 5：i18n 新增 key

zh-CN.json:
```json
{
  "agent": {
    "altModel1": "备选模型 1",
    "altModel2": "备选模型 2",
    "altModel3": "备选模型 3",
    "altModelPlaceholder": "输入备选模型名称",
    "defaultModel": "默认模型"
  }
}
```

en.json:
```json
{
  "agent": {
    "altModel1": "Alternative Model 1",
    "altModel2": "Alternative Model 2",
    "altModel3": "Alternative Model 3",
    "altModelPlaceholder": "Enter alternative model name",
    "defaultModel": "Default Model"
  }
}
```

---

## 改动文件清单

| 文件 | 改动 | 预估行数 |
|------|------|---------|
| `ProviderForm.vue` | 新增 3 个备选模型输入框 + altModels ref + init/emit | +35 |
| `APISetting.vue` | normalizeProviderRecord 新增 alternativeModels | +3 |
| `SelectModel.vue` | 删硬编码 modelOptions → 改动态 ref + open() 接收 opts.modelOptions | -10/+20 |
| `index.vue` | openModelPicker 新增 buildCurrentModelOptions + 传入 SelectModel | +25 |
| `zh-CN.json` + `en.json` | 新增 5 个 key | +10 |
| **合计** | | **~83** |

---

## 不变部分

| 文件 | 说明 |
|------|------|
| `providerToml.mjs` | 不改 — 只写 config.toml 原生字段 |
| `codexAgent.js` | 不改 — model 始终透传 |
| `proxyServer.js` | 不改 |
| `codex/` 其余模块 | 不改 |

---

## 边界情况

- 备选模型全空 → SelectModel 只显示默认模型一项
- 旧 provider 无 `alternativeModels` → normalize 默认 `[]`
- 切换 Provider → openModelPicker 实时读取新 Provider 的 alternativeModels
- 备选模型填了和默认相同的值 → 不去重，用户自行管理

---

## 验证

- [ ] ProviderForm 显示 "备选模型 1/2/3" 三个输入框
- [ ] 填入模型名保存后，重新打开仍保留
- [ ] SelectModel 显示 1-4 行：默认模型 + 有填的备选模型
- [ ] 选择备选模型后，对话使用正确模型
- [ ] 备选模型全空 → 只显示默认模型一项
- [ ] 切换 Provider → 模型列表刷新
- [ ] config.toml 不含 alternativeModels 字段
- [ ] `npm run build` 无报错
---

## 2026-06-23 收口说明

本专题后续已按实际产品行为收口，当前以代码实现为准：

- 模型选择器的分组依据是当前激活配置 `providers.json.activeIdx`
- 模型选择器的当前选中项仍然是当前会话模型 `tab.model`；若当前会话未显式覆盖，则回落到 runtime model
- 备选模型空槽位不再从 `providers[0]` 兜底，而是按固定顺序回退到稳定内置槽位：
  1. `gpt-5.5`
  2. `gpt-5.3-codex`
  3. `gpt-5.2`
- 若回退值与默认模型或已有槽位重复，则跳过重复项
- 已删除未再使用的 `codex-get-alternative-models` IPC，避免主进程与前端维护两套不同的模型槽位规则
- 当前规则已提取为纯函数：`packages/agent/src/components/codeX/utils/modelSlots.mjs`
- 已补测试覆盖：
  - active provider 分组
  - 空槽位 fallback
  - 重复模型去重
