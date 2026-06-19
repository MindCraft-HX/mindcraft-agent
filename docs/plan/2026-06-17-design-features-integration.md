# 设计能力集成方案 v2

> 基于 Open Design 参考项目分析 + MindCraft 现有会话指令体系，用最轻量的方式为 Agent 注入设计能力与视觉反馈。
>
> v2 核心变化：放弃 iframe 分屏 + Playwright + Skill/MCP 等重方案，改用 Electron 原生截图 + 会话指令级开关。新增参照物（URL/截图/文件）作为第一等概念。

---

## 一、目标

四层增量，同一条注入管道：

| 层 | 做什么 | 核心价值 |
|----|--------|---------|
| **参照物层** | URL / 截图 / 文件作为设计目标 | Agent 不再盲写，"照着做" |
| **渲染预览层** | Agent 主动截图查看自己的 HTML 产出 | AI 获得视觉反馈，从 "盲写" 变 "边写边看" |
| **知识注入层** | Craft 工艺规则注入 system prompt | 提升 Agent 前端产出质量，消除 AI slop |
| **交互引导层** | 可选的场景化需求确认 | 新手友好，老手不受干扰 |

**四个层级共享同一套注入机制——工具栏开关/选择 → 拼接 system prompt。Claude Code 和 CodeX 通用。**

---

## 二、架构

### 2.1 总体数据流

```
┌──────────────────────────────────────────────────────────────┐
│                    会话指令面板（增强）                        │
│                                                              │
│  📝 指令: "仿照附件做一个产品落地页..."                        │
│  📎 参照物:                                                   │
│    ├── 🔗 https://stripe.com/pricing                         │
│    ├── 🖼️ design-mock.png  (拖入的截图)                      │
│    ├── 📄 brand-guide.pdf   (拖入的文件)                     │
│    └── [+ 添加参照物]                                        │
│                                                              │
│  [🔍 前端预览: 开]  [设计规范: 通用 ▾]  [启用]                │
└──────────────────────────────────────────────────────────────┘
                           ↓ 注入到 systemPrompt
┌──────────────────────────────────────────────────────────────┐
│ query({ systemPrompt: [...] })                               │
│                                                              │
│ <mindcraft_references>            ← 参照物（URL/图片/文件）   │
│ <mindcraft_preview_mode>          ← 前端预览指令              │
│ <mindcraft_craft_rules>           ← 设计规范（按需）          │
│ <mindcraft_session_instruction>   ← 用户自定义指令（已有）     │
│                                                              │
│ Agent 开发循环:                                               │
│   参照物 → 理解目标 → 写代码 → 截图 → 对比参照物 → 迭代      │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 参照物的开发全周期角色

参照物不是一次性输入，它在整个开发周期三个阶段都起作用：

```
阶段 1: 规划（提取设计 token）
  用户给 URL/截图 → Agent 提取色板/字体/布局 → 写入 .mindcraft/brand-spec.md

阶段 2: 开发（作为视觉参考）
  Agent 写代码时随时 Read 参照截图 → 确保方向对

阶段 3: 验收（截图对比）
  Agent 截图自己的产出 → Read 参照物 → 对比 → 修正
```

### 2.3 截图预览数据流

```
工具栏开关: 🔍 前端预览 [开/关]
  ↓ 开启时
systemPrompt 拼接 <mindcraft_preview_mode> 指令块
  ↓ Agent 收到指令：写完 HTML 后运行
Bash("mindcraft-preview index.html")
  ↓ PreToolUse Hook 拦截（claudeAgent.js / codexAgent.js）
新建隐藏 BrowserWindow → loadFile → capturePage() → 关闭
  ↓ 保存 PNG 到 .mindcraft-preview/latest.png
IPC 'preview-screenshot' → 渲染层 → 消息中显示截图（给人看）
  ↓ Agent 继续：
Read(".mindcraft-preview/latest.png")
  ↓ SDK 原生返回 base64 图片 → Agent "看到" 效果
Agent 判断：好了？/ 需要改？→ 修改代码 → 再截图 → 再看
```

### 2.4 为什么不需要 Playwright

Electron 主进程可以直接创建隐藏 `BrowserWindow`，用 `webContents.capturePage()` 截图——零外部依赖、零体积增长。

| | Playwright | Electron 原生 |
|---|---|---|
| 额外体积 | ~400MB (Chromium) | 0 |
| 启动速度 | 1-3s (独立浏览器) | <100ms (新建窗口) |
| 截图 API | `page.screenshot()` | `webContents.capturePage()` |
| HTML 注入 | `page.setContent()` | `loadFile()` / `loadURL(data:...)` |
| Agent 可触发性 | 需 MCP 注册 | ✅ Bash 命令即可 |

### 2.5 注入管道复用关系

```
会话指令（已有）:
  用户写文本 + 附件 → store 到 session-registry → 注入 system prompt

参照物（新增）:
  用户给 URL/截图/文件 → 注入 <mindcraft_references> + 提取协议

前端预览（新增）:
  用户开开关 → 注入固定 prompt 模板 → Agent 获得截图能力

Craft 设计规范（新增）:
  用户选下拉 → 注入对应 craft/*.md → Agent 产出更专业

所有功能共用同一个注入管道。开关控制是否注入，内容决定注入什么。
```

---

## 三、参照物体系（贯穿全 Phase）

### 3.1 参照物类型

| 类型 | 用户操作 | Agent 侧行为 |
|------|---------|-------------|
| **URL** | 粘贴链接，如 `https://stripe.com/pricing` | WebFetch → 5 步品牌提取协议 → 写入 `brand-spec.md` |
| **截图** | 拖入/粘贴图片，如设计稿截图 | SDK Read 工具读取 → 提取色板/字体/布局 |
| **文件** | 拖入 .md/.pdf/.html 等 | 已有 `<mindcraft_session_attachment>` 机制 |

### 3.2 URL 参照物：5 步品牌提取协议（源自 OD discovery.ts）

Agent 拿到 URL 后不直接写代码，先走提取流程：

```
步骤 1: 定位来源
  WebFetch 目标网站（必要时多抓几个页面：首页、/about、/pricing）

步骤 2: 下载素材
  抓取 CSS 文件、截图关键区域（Hero/卡片/导航）

步骤 3: 提取真实值
  grep -E '#[0-9a-fA-F]{3,8}' 提取色值
  分析字体族、字号层级、间距规律
  规则：Never guess colors from memory（禁止凭记忆猜颜色）

步骤 4: 编码落地
  写入 .mindcraft/brand-spec.md，包含：
  - 6 个颜色 token: --bg, --surface, --fg, --muted, --border, --accent（OKLch）
  - 字体栈: display / body / mono
  - 3-5 条布局姿态规则（如 "卡片间距 24px, 圆角 12px, 阴影 0 2px 8px rgba(0,0,0,0.08)"）

步骤 5: 一句话总结
  用一句话描述设计系统，让用户可以低成本纠偏：
  "这是 Stripe 风格：深色渐变 Hero + 紫色强调色 + 圆角卡片 + Inter 字体 + 大量留白"
```

### 3.3 截图/图片参照物

图片通过 SDK Read 工具传给 Agent（SDK 原生支持 base64 图片返回）。Agent 行为：

```
Read("design-mock.png")
  → Agent 分析：色板、字体层级、布局结构、组件模式
  → 将提取结果写入 .mindcraft/brand-spec.md
  → 开发过程中可反复 Read 作为视觉参考
```

### 3.4 验收对比

Agent 完成后自行对比：

```
Agent: mindcraft-preview index.html         # 截图自己的产出
Agent: Read(".mindcraft-preview/latest.png") # 看自己做的
Agent: Read("design-mock.png")               # 看参照物
Agent: 对比 → "标题大小 OK，但 accent 色偏蓝了，参照物是 #7c3aed，我用了 #6366f1 → 修改"
Agent: 修改 CSS → mindcraft-preview → Read → "现在对了"
```

### 3.5 system prompt 注入模板

```xml
<mindcraft_references>
你有以下设计参照物：

<!-- 如果用户给了 URL -->
<reference type="url" source="https://stripe.com/pricing">
使用 WebFetch 访问此 URL，按以下协议提取品牌设计 token：

1. 定位来源：WebFetch 获取页面内容
2. 下载素材：抓取 CSS，截图关键区域
3. 提取真实值：grep 色值、分析字体层级。规则：Never guess colors from memory.
4. 编码落地：写入 .mindcraft/brand-spec.md（6 色 OKLch 调色板 + 字体栈 + 3-5 条布局规则）
5. 一句话总结：让用户可低成本纠偏
</reference>

<!-- 如果用户给了截图 -->
<reference type="image" path="design-mock.png">
用 Read 工具打开此图片，提取色板、字体层级、布局结构和组件模式。
将提取结果追加到 .mindcraft/brand-spec.md。
开发过程中随时 Read 此图片作为视觉参考。
</reference>

在开发过程中，产出必须忠于参照物的设计语言。
完成后，用 mindcraft-preview 截图自己的产出，与参照物对比。
</mindcraft_references>
```

---

## 四、分 Phase 实施

### Phase 1：截图预览 + 参照物基础（Week 1-2）

#### 1.1 主进程：预览截图

新增 `packages/agent/electron/previewCapture.js`：

```js
const { BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

async function capturePreview(cwd, htmlPath) {
  const absPath = path.isAbsolute(htmlPath) ? htmlPath : path.resolve(cwd, htmlPath)
  if (!fs.existsSync(absPath)) throw new Error(`文件不存在: ${absPath}`)

  const previewDir = path.join(cwd, '.mindcraft-preview')
  fs.mkdirSync(previewDir, { recursive: true })

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { sandbox: true, offscreen: true },
  })

  try {
    await win.loadFile(absPath)
    await new Promise(r => setTimeout(r, 500))
    const image = await win.webContents.capturePage()
    const pngPath = path.join(previewDir, 'latest.png')
    fs.writeFileSync(pngPath, image.toPNG())
    return { ok: true, path: pngPath, size: image.getSize() }
  } finally {
    win.close()
  }
}

module.exports = { capturePreview }
```

#### 1.2 PreToolUse Hook 拦截 Bash

```js
hooks: {
  PostCompact: [...],  // 已有
  PreToolUse: [{
    hooks: [async (input) => {
      if (input.tool_name !== 'Bash') return { continue: true }
      const cmd = (input.tool_input?.command || '').trim()
      const match = cmd.match(/^mindcraft-preview\s+(.+)/)
      if (!match) return { continue: true }

      const htmlPath = match[1].trim()
      try {
        const result = await capturePreview(resolvedCwd, htmlPath)
        const sender = agentSessions.get(chatKey)?.event?.sender
        if (sender) {
          safeSend(sender, 'preview-screenshot', {
            sessionId, pngPath: result.path, size: result.size
          })
        }
        return {
          permissionDecision: 'allow',
          updatedInput: {
            ...input.tool_input,
            command: `echo "截图完成: ${result.path} (${result.size.width}x${result.size.height})"`
          }
        }
      } catch (e) {
        return {
          permissionDecision: 'allow',
          updatedInput: {
            ...input.tool_input,
            command: `echo "截图失败: ${e.message}"`
          }
        }
      }
    }]
  }]
}
```

#### 1.3 会话指令面板扩展：支持参照物

**现有的 `sessionInstructionAttachments.js`** 只允许 `.md/.txt/.json/.yaml/.yml/.toml`。扩展：

| 新增类型 | 允许扩展名 | 处理方式 |
|---------|-----------|---------|
| URL | N/A | 不读文件内容，保留 URL 文本，注入 `<reference type="url">` |
| 图片 | `.png/.jpg/.jpeg/.gif/.webp` | 不读内容（文件二进制），注入 `<reference type="image" path="...">` |
| 文件 | 已有白名单 | 已有逻辑，读文本注入 `<mindcraft_session_attachment>` |

**UI 改动**（`SessionInstructionDialog.vue`）：

```
┌────────────────────────────────────────────────┐
│ 会话指令                                        │
│                                                │
│ 📝 指令内容:                                    │
│ ┌────────────────────────────────────────────┐ │
│ │ 仿照附件中的参照图，做一个产品落地页         │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ 📎 参照物:                                      │
│ ┌────────────────────────────────────────────┐ │
│ │ 🔗 https://stripe.com/pricing         [✕]  │ │
│ │ 🖼️ design-mock.png                    [✕]  │ │
│ │ 📄 brand-notes.txt                     [✕]  │ │
│ │                                            │ │
│ │ [+ 添加链接]  [+ 添加图片]  [+ 添加文件]    │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ [🔍 前端预览: 开]  [取消]  [保存]               │
└────────────────────────────────────────────────┘
```

#### 1.4 工具栏快捷开关

在 `ClaudeToolbar.vue` / CodeX `InputToolbar.vue` 中，会话指令按钮旁边显示状态：

```
[📝 会话指令]  [🔍 前端预览: 关]
      ↓ 点击
[📝 会话指令]  [🔍 前端预览: 开]    ← 绿色高亮
```

#### 1.5 渲染层：截图消息气泡

IPC 监听 `preview-screenshot` 事件 → 在消息流中插入截图气泡 → 复用 `ImageLightbox` 点击放大。

#### 1.6 Phase 1 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `packages/agent/electron/previewCapture.js` | **新增** | BrowserWindow 截图 |
| `packages/agent/electron/claudeAgent.js` | 修改 | +PreToolUse hook + IPC |
| `packages/agent/electron/codexAgent.js` | 修改 | 同上 |
| `packages/agent/electron/sessionInstructionAttachments.js` | 修改 | 扩展 URL + 图片类型 |
| `packages/agent/electron/sessionInstructionIpc.js` | 修改 | +参照物解析 |
| `packages/agent/preload/index.js` | 修改 | +IPC 桥接 + 事件监听 |
| `packages/agent/src/components/claudeCode/components/ClaudeToolbar.vue` | 修改 | +`🔍 前端预览` toggle |
| `packages/agent/src/components/codeX/components/InputToolbar.vue` | 修改 | 同上 |
| `packages/agent/src/components/agentCommon/components/SessionInstructionDialog.vue` | 修改 | 扩展参照物 UI |
| `packages/agent/src/stores/sessionInstructionStore.js` | 修改 | +references + previewEnabled |

**总代码量：~350 行**（含 UI）

---

### Phase 2：Craft 知识注入 + 场景模板（Week 3）

#### 2.1 craft 文件

```
resources/craft/
├── anti-ai-slop.md
├── color.md
├── typography.md
├── typography-hierarchy.md
├── typography-hierarchy-editorial.md
├── state-coverage.md
├── animation-discipline.md
├── accessibility-baseline.md
├── rtl-and-bidi.md
├── form-validation.md
└── laws-of-ux.md
```

来源：OD `craft/` 目录，精简翻译为中文。

#### 2.2 工具栏下拉 → 注入

```
[设计规范: 关闭 ▾]
  │ 通用设计规范  → anti-ai-slop + color + typography
  │ 反AI套路（仅） → anti-ai-slop
  │ 排版 + 色彩    → typography + color + typography-hierarchy
  │ 前端页面       → state-coverage + animation + accessibility
  │ 全部开启       → 全部 11 个文件
```

#### 2.3 场景模板

```json
// resources/scenarios/index.json
{
  "landing-page": {
    "label": "产品落地页",
    "inject": "产出自包含 HTML 页面。Hero → 功能 → 定价 → CTA。",
    "crafts": ["anti-ai-slop", "color", "typography"]
  },
  "dashboard": {
    "label": "数据 Dashboard",
    "inject": "产出含图表的 Dashboard。信息密度高，数据可读性优先。",
    "crafts": ["anti-ai-slop", "color", "typography", "state-coverage"]
  },
  "doc-page": {
    "label": "技术文档",
    "inject": "文档排版。层级清晰、代码块可读、导航明确。",
    "crafts": ["typography", "typography-hierarchy"]
  }
}
```

---

### Phase 3：分屏预览面板（Week 4+，可选）

Phase 1 的截图气泡已满足需求。分屏是可选增强：

- 右侧独立 PreviewPanel，iframe srcdoc 渲染
- 拖拽分割条 + 全屏按钮
- 设备模拟（📱 / 💻 / 📟）

**分屏做不做、何时做，等 Phase 1-2 验证完再决定。**

---

### Phase 4：媒体生成集成（Week 5+）

接入 mindcraft-api 多模态。跟 Phase 1 同模式：Bash 命令 → Hook 拦截 → API 调用 → 结果渲染。

---

## 五、关键设计决策

### 5.1 参照物是第一等概念

URL、截图、文件三种参照物统一管理，在规划→开发→验收三个阶段持续起作用。不是一次性的"需求输入"，而是整个开发周期的"锚点"。

### 5.2 预览 = 截图，不是 iframe 分屏

截图同时解决 AI 视觉反馈（核心）和人看效果（附带）。iframe 分屏只解决后者。

### 5.3 触发机制 = 开关 + prompt 注入

复用现有会话指令体系。Claude Code 和 CodeX 共用同一套注入管道。不需要 Skill + MCP。

### 5.4 零外部依赖

不装 Playwright。Electron 原生 `capturePage()` 完全胜任。

### 5.5 所有新功能默认关闭

| 功能 | 默认 | 开启方式 |
|------|------|---------|
| 参照物 | — | 会话指令面板中主动添加 |
| 前端预览截图 | 关闭 | 工具栏 toggle |
| craft 知识注入 | 关闭 | 工具栏下拉 |
| 场景模板 | 关闭 | 工具栏下拉 |
| 分屏预览面板 | 关闭 | 工具栏按钮（Phase 3） |

---

## 六、总文件变更清单

| Phase | 文件 | 变更 |
|-------|------|------|
| 1 | `packages/agent/electron/previewCapture.js` | **新增** |
| 1 | `packages/agent/electron/claudeAgent.js` | 修改 (+PreToolUse hook + IPC) |
| 1 | `packages/agent/electron/codexAgent.js` | 修改 (同上) |
| 1 | `packages/agent/electron/sessionInstructionAttachments.js` | 修改 (扩展 URL+图片类型) |
| 1 | `packages/agent/electron/sessionInstructionIpc.js` | 修改 (+参照物解析) |
| 1 | `packages/agent/preload/index.js` | 修改 (+IPC) |
| 1 | `packages/agent/src/components/claudeCode/components/ClaudeToolbar.vue` | 修改 (+toggle) |
| 1 | `packages/agent/src/components/codeX/components/InputToolbar.vue` | 修改 (+toggle) |
| 1 | `packages/agent/src/components/agentCommon/components/SessionInstructionDialog.vue` | 修改 (扩展参照物 UI) |
| 1 | `packages/agent/src/stores/sessionInstructionStore.js` | 修改 (+references + previewEnabled) |
| 2 | `resources/craft/*.md` | **新增** (11 文件) |
| 2 | `resources/scenarios/index.json` | **新增** |
| 2 | `packages/agent/electron/craftLoader.js` | **新增** |
| 3 | `packages/agent/src/components/codeHub/PreviewPanel.vue` | **新增** (可选) |
| 3 | `packages/agent/src/components/codeHub/SplitHandle.vue` | **新增** (可选) |
| 3 | `packages/agent/src/stores/splitView.js` | **新增** (可选) |

**Phase 1 核心改动：~350 行，10 个文件。**

---

## 七、风险

1. **PreToolUse hook 在 CodeX SDK 中需验证**：若不支持，降级为 prompt 引导 Agent 用 Read 代替 Bash。
2. **BrowserWindow 截图兼容性**：三平台 `offscreen` 行为可能不同，需验证。
3. **参照物中 URL 抓取稳定性**：依赖 WebFetch 工具，反爬站点可能失败。Agent 需被告知失败后的降级方案（手动描述品牌特征）。
4. **craft 文件版权**：OD 的 craft 来自 `refero_skill`（MIT），保留授权声明。
5. **Agent 主动性**：截图 + 对比依赖 prompt 引导。若 Agent 不主动调 `mindcraft-preview`，可增加自动触发（Write HTML 后自动截图注入上下文）。
