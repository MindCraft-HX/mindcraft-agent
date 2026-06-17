# 设计能力集成方案 v1

> 基于 Open Design 参考项目分析，将设计领域的结构化知识、预览渲染、场景化交互集成到 MindCraft，同时保持现有通用编程能力不受影响。

---

## 一、目标

在不改变 MindCraft 核心 Agent 能力的前提下，增加三层增量：

| 层 | 做什么 | 核心价值 |
|----|--------|---------|
| **知识注入层** | Craft 工艺规则注入 system prompt | 提升 Agent 前端产出质量，消除 AI slop |
| **渲染预览层** | 项目内分屏实时预览 HTML 产出 | 从 "看代码" 变成 "看效果" |
| **交互引导层** | 可选的场景化需求确认 | 新手友好，老手不受干扰 |

---

## 二、架构变更

### 2.1 现有架构

```
Electron Main Process
  ├── claudeAgent.js → Claude Code SDK (query)
  ├── codexAgent.js  → CodeX SDK (startThread)
  └── pluginManager.js

Renderer (Vue 3)
  └── CodeHub
       ├── [Tab: 项目A·ClaudeCode] → messages → MessageList
       ├── [Tab: 项目A·CodeX]      → messages → MessageList
       └── [Tab: 项目B·ClaudeCode] → messages → MessageList
```

### 2.2 目标架构

```
Electron Main Process
  ├── claudeAgent.js
  │     └── buildSystemPrompt() + craftMode 注入    ← 新增
  ├── codexAgent.js
  │     └── 同上
  ├── craftLoader.js                                ← 新增
  │     └── 加载 resources/craft/*.md
  └── pluginManager.js (不变)

Renderer (Vue 3)
  └── CodeHub
       ├── splitView: true/false                    ← 新增状态
       ├── [Tab: 项目A·ClaudeCode]  ← 可分屏
       │     ├── ChatPanel (左)
       │     ├── SplitHandle (中，可拖拽)
       │     └── PreviewPanel (右)  ← 新增
       ├── [Tab: 项目A·预览]        ← 新增独立预览 Tab
       ├── [Tab: 项目A·CodeX]       ← 可分屏
       │     └── ...
       └── [Tab: 项目B·ClaudeCode]  ← 可分屏
             └── ...
```

---

## 三、分 Phase 实施

### Phase 0：基础设施（Week 1）

#### 0.1 craft 知识库落地

**文件放置**：

```
resources/craft/
├── anti-ai-slop.md          # 7 条 AI 套路死罪
├── color.md                 # 色彩使用规则
├── typography.md            # 排版规则
├── typography-hierarchy.md  # 层级规则
├── typography-hierarchy-editorial.md  # 长文层级
├── state-coverage.md        # 状态覆盖
├── animation-discipline.md  # 动效纪律
├── accessibility-baseline.md # 无障碍基线
├── rtl-and-bidi.md          # 国际化
├── form-validation.md       # 表单校验
└── laws-of-ux.md            # UX 法则
```

来源：OD `craft/` 目录，精简翻译为中文。

#### 0.2 buildSystemPrompt 注入点改造

**claudeAgent.js** 的 `buildSystemPrompt(resolvedCwd)` 增加参数：

```js
// claudeAgent.js
function buildSystemPrompt(resolvedCwd, craftMode = 'off') {
  return [
    langLine, effortLine, cwdLine, osLine,
    craftMode !== 'off' ? loadCraftRules(craftMode) : '',
  ].filter(Boolean).join('\n')
}

// 新增模块 craftLoader.js
function loadCraftRules(mode) {
  const mapping = {
    general: ['anti-ai-slop', 'color', 'typography'],
    'anti-slop': ['anti-ai-slop'],
    'typography': ['typography', 'color', 'typography-hierarchy'],
    'frontend-page': ['state-coverage', 'animation-discipline', 'accessibility-baseline'],
    full: ['anti-ai-slop', 'color', 'typography', 'typography-hierarchy',
           'typography-hierarchy-editorial', 'state-coverage',
           'animation-discipline', 'accessibility-baseline', 'rtl-and-bidi',
           'form-validation', 'laws-of-ux'],
  }
  const files = mapping[mode] || []
  return files.map(f => fs.readFileSync(`resources/craft/${f}.md`, 'utf-8')).join('\n\n')
}
```

**codexAgent.js** 同样改造。

#### 0.3 ClaudeToolbar 增加 "设计规范" 下拉

```
┌──────────────────────────────────────────────────────────────┐
│ 📁 ~/my-project   [设计规范: 关闭 ▾]  [模型: Sonnet ▾]  ...  │
│                     │ 关闭                                   │
│                     │ 通用设计规范                            │
│                     │ 反AI套路（仅）                          │
│                     │ 排版 + 色彩                             │
│                     │ 前端页面（含状态/动效/无障碍）            │
│                     │ 全部开启                                │
└──────────────────────────────────────────────────────────────┘
```

- 选区持久化到项目级配置（`claude-internal.json`，跟 cwd 绑定）
- 默认关闭，新用户不受影响

---

### Phase 1：分屏预览（Week 2-3）

#### 1.1 CodeHub Split View 改造

CodeHub 的根容器从单栏变为可选双栏：

```
SplitView 关闭（默认，跟现在一样）：
┌──────────────────────────────────────────┐
│  [项目A·Claude] [项目A·CodeX] [项目B] [+]│
├──────────────────────────────────────────┤
│  消息对话（全宽）                          │
└──────────────────────────────────────────┘

SplitView 打开：
┌──────────────────────────────────────────────────────────┐
│  [项目A·Claude] [项目A·CodeX] [项目B] [+]                │
├───────────────────────┬──┬───────────────────────────────┤
│  ChatPanel (左侧)     │拖│  PreviewPanel (右侧)           │
│                       │拽│                               │
│  消息对话              │条│  iframe sandbox 预览           │
│                       │  │  [📱] [💻]    设备切换          │
│  输入框...             │  │  [下载 HTML] [PDF] [全屏 ▤]   │
└───────────────────────┴──┴───────────────────────────────┘
```

#### 1.2 关键交互

| 操作 | 行为 |
|------|------|
| 打开分屏 | 工具栏按钮或快捷键 `Ctrl+Shift+P` |
| 关闭分屏 | 同样按钮，恢复全宽对话 |
| 拖拽调整 | 中间 divider 可拖拽，宽度持久化到项目配置 |
| 全屏预览 | 点击 `▤` → 右侧全屏（暂隐藏聊天），再点恢复 |
| Agent 写 HTML | 监听文件写入 → debounced 300ms → iframe srcdoc 刷新 |
| 设备切换 | 右侧顶部 [📱 375px] [💻 1280px] [📟 自适应] |

#### 1.3 PreviewPanel 组件

```vue
<!-- PreviewPanel.vue -->
<template>
  <div class="preview-panel" :style="{ width: panelWidth + 'px' }">
    <div class="preview-toolbar">
      <button @click="setViewport('mobile')" :class="{ active: viewport === 'mobile' }">📱</button>
      <button @click="setViewport('desktop')" :class="{ active: viewport === 'desktop' }">💻</button>
      <button @click="setViewport('responsive')" :class="{ active: viewport === 'responsive' }">📟</button>
      <span class="preview-file">{{ currentFileName }}</span>
      <button @click="exportHtml">下载</button>
      <button @click="exportPdf">PDF</button>
      <button @click="$emit('fullscreen')">▤</button>
    </div>
    <div class="preview-frame-wrap" :style="frameStyle">
      <iframe
        ref="previewFrame"
        sandbox="allow-scripts"
        :srcdoc="previewHtml"
        title="preview"
      />
    </div>
  </div>
</template>
```

#### 1.4 文件监听与自动刷新

```
Agent 的 Write 工具写入 .od/projects/<id>/index.html
       ↓ (Electron fs.watch)
Main Process 检测写入
       ↓ (IPC: 'project-file-changed')
Renderer CodeHub 收到事件
       ↓ (debounced 300ms)
读取文件内容 → 更新 previewHtml → iframe srcdoc 替换
```

- 只监听当前活跃项目的产出目录
- 只对 `.html` 文件触发刷新
- 如果 Agent 在写多个 HTML 文件，以最近修改的为准

#### 1.5 独立预览 Tab

每个项目支持一个独立的 "预览" Tab：

```
┌──────────────────────────────────────────────────────────────┐
│  [项目A·Claude] [项目A·预览] [项目A·CodeX] [项目B] [+]      │
├──────────────────────────────────────────────────────────────┤
│  全窗口 iframe 预览（无对话）                                   │
│  [📱] [💻] [📟] [下载] [PDF] [返回对话 ←]                    │
└──────────────────────────────────────────────────────────────┘
```

- "预览" Tab 主打大屏查看，去掉对话面板
- 从 Agent Tab 的 "全屏预览 ▤" 一键跳转到此 Tab
- "← 返回对话" 切回 Agent Tab

**每个项目独立状态**：项目 A 和项目 B 各有自己的 `splitOpen`、`panelWidth`、`previewHtml`，切换 Tab 时独立恢复。

---

### Phase 2：场景化交互（Week 4-5）

#### 2.1 三层层级

```
Layer 1（默认）：纯对话，零干扰
    → 跟现在一模一样，所有新功能不可见

Layer 2（手动选择）：工具栏场景下拉
    → 用户主动选 "生成产品落地页 / Dashboard / 技术文档"
    → System prompt 自动注入对应 craft + 工作流提示
    → Agent 直接开始，不弹问卷

Layer 3（AI 自动）：可选的自动问答
    → 项目设置里勾选 "生成前确认需求"
    → Agent 第一轮 emit 简化 <question-form>（2-3 个问题）
    → 用户回复或点 "跳过 → Agent 开始
```

#### 2.2 Layer 2 场景模板

场景模板不同于 OD 的 SKILL.md，只是轻量级的 prompt 片段：

```js
// resources/scenarios/
{
  'landing-page': {
    label: '产品落地页',
    inject: '你是前端设计专家。产出自包含的 HTML 页面。重点：Hero 区、功能展示、定价、CTA。',
    crafts: ['anti-ai-slop', 'color', 'typography'],
  },
  'dashboard': {
    label: '数据 Dashboard',
    inject: '你是数据面板设计专家。产出含图表的 Dashboard HTML。重点：信息密度、可读性、状态覆盖。',
    crafts: ['anti-ai-slop', 'color', 'typography', 'state-coverage'],
  },
  'doc-page': {
    label: '技术文档',
    inject: '你是技术文档排版专家。产出结构清晰的文档页面。重点：层级、可读性、代码块。',
    crafts: ['typography', 'typography-hierarchy'],
  },
}
```

#### 2.3 Layer 3 简化问卷

```html
<question-form id="quick-brief" title="快速确认">
{
  "questions": [
    { "id": "surface", "label": "产出类型", "type": "radio",
      "options": ["Web 页面", "Dashboard", "移动端", "文档/报告"] },
    { "id": "style", "label": "视觉风格", "type": "radio",
      "options": ["现代简约", "深色科技", "明亮清爽", "不限"] },
    { "id": "scope", "label": "大致规模", "type": "text",
      "placeholder": "如：1页落地页、3屏Dashboard" }
  ]
}
</question-form>
[跳过，直接开始 ▸]
```

---

### Phase 3：媒体生成集成（Week 6+）

#### 3.1 接入 mindcraft-api

MindCraft 已有完整的多模态 API 网关（`mindcraft-api`），Provider 覆盖 OpenAI、字节豆包、阿里通义、百度文心、DeepSeek、Gemini、FLUX 等。

**触发方式**：OD 的纯自然语言模式（Agent 通过 Bash 调 Shell 命令），但 MindCraft 可以用更干净的 SDK tool callback：

```
用户: "帮我生成一张赛博朋克海报"
       ↓
Agent 识别意图 → tool call: generate_image
       ↓
Main Process 拦截 tool call
       ↓
POST mindcraft-api/v1/images/generations
       ↓
返回图片 → 在消息中渲染（复用现有图片预览弹窗）
```

**工具定义**（注入到 Agent 的可用工具列表）：

```json
{
  "name": "generate_image",
  "description": "通过 mindcraft-api 生成图片",
  "parameters": {
    "model": { "type": "string", "enum": ["gpt-image-2", "doubao-seedream-3.0", "flux-1.1-pro"] },
    "prompt": { "type": "string" },
    "aspect": { "type": "string", "enum": ["1:1", "16:9", "9:16"] }
  }
}
```

#### 3.2 可选手动面板

在输入框旁边"多模态"按钮（跟 craft 下拉并列），点击展开面板后可手动选模型/参数：

```
多模态面板（可选，不展开则 Agent 自己决定）：
┌──────────────────────────┐
│ 类型: [图片 ▾] [视频]     │
│ 模型: [gpt-image-2 ▾]    │
│ 比例: [16:9 ▾]           │
│                          │
│ [让 Agent 决定] [按此生成] │
└──────────────────────────┘
```

选择 "让 Agent 决定" → 用户只需自然语言描述，Agent 自己选模型和参数。选择 "按此生成" → 固定参数，Agent 负责写 prompt。

---

## 四、关键设计决策

### 4.1 预览不内嵌消息

**决策**：不在 MessageBubble 里嵌入 iframe 预览。

**原因**：
- 消息列表性能敏感，内嵌 iframe 加重渲染负担
- 消息滚动/虚拟列表与 iframe 生命周期冲突
- 增加 MessageBubble 渲染复杂度，潜在 bug 多

**替代方案**：右侧独立 PreviewPanel，Agent 写完 HTML → PreviewPanel 自动刷新。

### 4.2 框架无关，CDN 优先

**Phase 1 约束**：Agent 产出的 HTML 必须自包含（CDN 依赖或内联），不能依赖 npm install 和构建。

在 craft 规则中明确告知 Agent：
```
产出规则：
- CSS 内联在 <style> 标签中
- JS 依赖通过 CDN 引入（unpkg/esm.sh）
- 不依赖 npm install、构建工具、dev server
```

**Phase 2（后续）**：支持 Agent 启动 dev server → Electron webview 指向 localhost。

### 4.3 不强绑定终端与项目

终端渲染暂不纳入本方案。

终端与项目的关联通过**信息标识**体现，不做强绑定：
- Tab 标题已显示项目文件夹路径（现有功能）
- 如果未来增加终端 Tab，通过标题/角标显示关联项目名
- 用户可自由新建终端、切换项目，互不锁定
- 避免 Claude Code + CodeX 同时操作同一项目时的冲突

### 4.4 所有新功能默认关闭

| 功能 | 默认状态 | 开启方式 |
|------|---------|---------|
| craft 知识注入 | 关闭 | 工具栏下拉手动选择 |
| 分屏预览 | 关闭 | 工具栏按钮或快捷键 |
| 场景模板 | 关闭 | 工具栏下拉手动选择 |
| AI 自动问卷 | 关闭 | 项目设置 "生成前确认需求" |
| 多模态生成 | 关闭 | "多模态" 按钮展开面板 |

老用户体验 = 完全不变。新功能渐进式发现。

---

## 五、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `resources/craft/*.md` | **新增** | 11 个 craft 工艺规则文件 |
| `resources/scenarios/index.json` | **新增** | 场景模板定义 |
| `packages/agent/electron/craftLoader.js` | **新增** | craft 文件加载与模式映射 |
| `packages/agent/electron/claudeAgent.js` | **修改** | `buildSystemPrompt` 增加 craftMode 参数 |
| `packages/agent/electron/codexAgent.js` | **修改** | 同上 |
| `packages/agent/src/components/claudeCode/components/ClaudeToolbar.vue` | **修改** | 增加 "设计规范" 和 "场景" 下拉 |
| `packages/agent/src/components/codeHub/index.vue` | **修改** | 增加 SplitView 容器和状态管理 |
| `packages/agent/src/components/codeHub/PreviewPanel.vue` | **新增** | 右侧 iframe 预览面板 |
| `packages/agent/src/components/codeHub/SplitHandle.vue` | **新增** | 拖拽分割条 |
| `packages/agent/src/stores/splitView.js` | **新增** | 分屏状态持久化（项目级） |

---

## 六、风险与注意事项

1. **craft 文件版权**：OD 的 craft 文件来自 `refero_skill`（MIT），需保留原始授权声明。
2. **iframe 安全**：PreviewPanel 的 iframe 必须 `sandbox="allow-scripts"`，不设 `allow-same-origin`。
3. **分屏性能**：ChatPanel 和 PreviewPanel 各自独立渲染，iframe 刷新不影响聊天区性能。
4. **CodeX 兼容**：CodeX SDK 的 `instructions`/`systemPrompt` 注入方式与 Claude Code 不同，需分别适配。
5. **不引入新的 IPC 通道**：尽量复用现有的 `claudeAgentQuery`/`codexAgentQuery` 参数传递。
