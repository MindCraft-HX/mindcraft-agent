# MindCraft Design Studio PRD v2

> 日期：2026-06-17
> 关联方案：`docs/plan/2026-06-17-design-features-integration.md`
> 参考项目：`D:\公司资料\智匠MindCraft\RD开发资料\reference_project\open-design`
> 定位：集成在 `mindcraft-agent` 内的设计创作与本地运行态观察能力，不是独立产品，也不是 Open Design 的裁剪版。

---

## 1. 背景

MindCraft Agent 当前的核心价值是 Claude Code + Codex 双引擎、文件系统操作、代码生成、文档浏览和轻量知识问答。用户已经可以让 Agent 写页面、改前端、生成 HTML，但在“设计产物交付”场景里仍有明显断点：

1. **产出质量不稳定**：页面、海报、Dashboard、PPT 等视觉产物容易出现 AI slop，如泛紫蓝渐变、无意义大圆角卡片、层级混乱、状态缺失、排版随意。
2. **看代码和看效果割裂**：Agent 写出 HTML 后，用户需要离开对话区自行打开文件或启动服务，无法在同一工作台里快速对照效果。
3. **设计任务缺少结构化上下文**：普通对话很难稳定表达产物类型、视觉方向、品牌约束、尺寸、输出格式等信息，导致多轮返工。
4. **多模态和编程 Agent 割裂**：图片、视频、音频生成通常作为单独工具存在，不能自然进入项目目录、页面原型、PPT、营销素材工作流。
5. **资源包体积与主应用冲突**：设计系统、模板库、prompt gallery、示例素材可能快速膨胀，不适合全部随主程序内置。

Open Design 的价值不在某个单点功能，而在 `artifact-first` 的产品心智：对话只是入口，最终交付物是可预览、可下载、可持续迭代的项目文件。MindCraft 应吸收这个心智，但不照搬其 daemon/web/desktop/skill market 架构，而是结合现有双 Agent、原生插件市场、mindcraft-api 多模态网关重新整合。

同时，MindCraft 自身就是客户端应用。未来大量 AI 应用会需要主机权限：读写本地文件、启动服务、访问端口、运行测试、控制浏览器、查看日志、生成截图、操作本地工具链。因此 Design Studio 不应只被理解为“HTML 设计预览”，而应成为 MindCraft 迈向 **Host-native Agent Workbench** 的第一块能力：让 Agent 的产物和本机运行态在同一个工作台中被看见、验证和迭代。

---

## 2. 产品定位

**MindCraft Design Studio** 是内置在 `mindcraft-agent` 的“设计创作模式 + 本地运行态观察能力”。它让用户在同一个 Agent 工作台里完成：

- 页面原型、Landing Page、Dashboard、文档页、PPT/Deck 等 HTML 设计产物生成。
- 图片、视频、音频等多模态素材生成。
- 产物实时预览、下载、继续修改。
- 设计规则、场景模板、Prompt 模板、品牌/设计系统的渐进式增强。
- 本地端口、运行日志、截图验证、客户端窗口预览等运行态观察。

它不是一个独立路由产品，也不是新建一套 Open Design 式 daemon。它应成为 CodeHub/Agent 会话的一种增强能力：

- 默认不打扰普通编程用户。
- 用户开启“设计创作”后，当前 Agent 会话获得设计产物上下文、预览面板和多模态工具。
- 大体积内容通过 MindCraft 原生插件市场下载，类似 DLC 补丁。

长期看，Design Studio 是更大形态的起点：**Local AI App Workbench**。Design 是第一个高价值场景，后续可以扩展到 Electron、Flutter、React Native、小程序、Unity、浏览器自动化、打包发布等本地应用开发工作流。

---

## 3. 核心目标

### 3.1 产品目标

1. **让设计产物可见**：Agent 生成页面/HTML 后，用户能在同一窗口右侧立即看到效果。
2. **让设计质量可控**：通过 craft 规则、场景模板、设计系统和自检约束，降低 AI slop。
3. **让多模态成为工作流的一部分**：图片/视频/音频生成进入项目目录、消息流和预览/下载体系，而不是一次性聊天附件。
4. **让能力可扩展但主包克制**：基础能力内置，大模板/设计系统/素材/prompt gallery 通过插件下载。
5. **让 Claude 与 Codex 共享同一套产品能力**：设计模式的规则、预览、产物文件、媒体工具不应只服务某一个 Agent。
6. **让客户端开发获得全局视野**：Agent 改代码、服务端口、应用窗口、终端日志、截图验证应能在同一工作台对照。

### 3.2 非目标

1. 不复制 Open Design 的完整 daemon、SQLite、skill registry、Web 应用和桌面壳。
2. 第一版不做完整 Skill 市场，也不承诺兼容所有 OD `SKILL.md` 扩展字段。
3. 第一版不做复杂评论模式、框选元素局部修补、可视化 DOM patch。
4. 第一版不强绑定终端与项目，不改变现有终端/Agent 的自由度。
5. 第一版不把所有设计系统、模板、媒体 prompt gallery 全量打进主安装包。
6. 第一版不做完整远程桌面或全功能 IDE，不替代用户现有浏览器、终端、模拟器。

---

## 4. 用户与场景

### 4.1 目标用户

| 用户 | 需求 |
|------|------|
| 独立开发者 | 快速生成产品落地页、Dashboard、Demo 页面、项目封面图 |
| 产品/运营 | 生成活动页、海报、社媒图、汇报 PPT、短视频脚本/素材 |
| 前端工程师 | 在写代码时快速预览 HTML/CSS 效果，并让 Agent 迭代 UI |
| 教育/销售/咨询 | 生成报告、课程页、方案 deck、信息图 |
| 老用户 | 保持原有 Claude/Codex 编程体验，不被设计功能干扰 |

### 4.2 核心场景

1. **页面原型**
   - 用户选择“页面原型”，输入“帮我做一个 AI 客服 SaaS 落地页”。
   - Agent 写入 `.design_studio/preview/index.html`。
   - 右侧 PreviewPanel 自动刷新，用户直接看页面效果。
   - 用户继续说“更像 Linear，弱化紫色，补 pricing”，Agent 迭代同一个 HTML。

2. **Dashboard**
   - 用户选择“Dashboard”，输入业务背景和指标。
   - Agent 注入状态覆盖、信息密度、图表可读性等 craft 规则。
   - 右侧预览显示完整后台页面，支持桌面宽度查看。

3. **图片素材**
   - 用户选择“图片”，选 16:9、默认模型，输入“生成一个用于首页 hero 的金融科技插画”。
   - Agent 组织 prompt 并调用 `mindcraft-api` 图片生成。
   - 图片文件保存到项目工作区，在消息中显示缩略图，并可被后续 HTML 引用。

4. **视频素材**
   - 用户选择“视频”，输入“把这个 landing page 做成 15 秒产品宣传短片”。
   - Agent 读取当前预览页面/核心文案，生成视频 prompt 或 HyperFrames HTML 动效方案。
   - 输出 `.mp4` 保存到项目工作区，消息中可播放或下载。

5. **运行态对照**
   - 对于需要打开本地端口的项目，右侧除预览外可显示 dev server 端口、运行状态和关键终端日志。
   - 用户可以一边看页面，一边看构建错误/服务日志，获得全局感。

6. **客户端应用开发**
   - 用户正在开发 `mindcraft-agent` 这类 Electron/Vue 客户端项目。
   - Agent 修改 UI 或 Electron 主进程代码后，工作台显示 dev server URL、Electron 窗口状态、main/renderer 日志和截图。
   - 用户无需在聊天、终端、浏览器、客户端窗口之间频繁切换，就能判断“代码改了以后真实应用是否正常”。

---

## 5. 产品模型

### 5.1 Surface 类型

Design Studio 以 `surface` 表示用户当前要交付的产物类型：

| Surface | 第一版状态 | 产物 |
|---------|------------|------|
| `chat` | 内置默认 | 普通对话，不注入设计规则 |
| `html` | MVP | `index.html`，PreviewPanel 实时预览 |
| `image` | MVP | `.png/.jpg/.webp`，消息缩略图 + 项目文件 |
| `video` | v1.1 | `.mp4`，消息内播放 + 项目文件 |
| `audio` | v1.2 | `.mp3/.wav`，消息内播放 + 项目文件 |
| `runtime` | v1.1+ | 端口、进程、日志、截图、客户端窗口 |

### 5.2 三轴设计能力

借鉴 Open Design，但做 MindCraft 化简：

| 轴 | MindCraft 名称 | 作用 | 交付方式 |
|----|----------------|------|----------|
| 产物类型 | 创作类型 / Surface | 告诉 Agent 产物是什么 | 内置 |
| 通用工艺 | Craft Rules | 抑制 AI slop，规范排版、色彩、状态 | 基础内置，高级包插件 |
| 视觉语言 | Design System | 品牌色彩、字体、组件风格 | 默认少量内置，大包插件 |
| 场景模板 | Scenario / Prompt Template | 降低输入门槛，提高成功率 | 基础内置，模板库插件 |

---

## 6. 功能需求

### 6.1 设计创作入口

**需求**

- 在 Agent 工具栏或输入区附近增加“创作类型”入口。
- 默认值为“普通对话”。
- 用户可切换：普通对话、页面原型、图片、视频。
- 切换后只影响当前项目/会话，不污染全局默认行为。

**交互建议**

- 使用紧凑下拉或 segmented control。
- 文案避免过度设计化，推荐：
  - 普通
  - 页面
  - 图片
  - 视频
- 对于未安装 DLC 的高级模板，显示“安装模板包”入口，但不阻塞基础使用。

**验收标准**

- 老用户不主动点击时体验完全不变。
- 同一项目切换 Tab 后能恢复对应创作类型。
- Claude 与 Codex 都能收到对应 surface metadata。

### 6.2 HTML 预览面板

**需求**

- CodeHub 支持右侧 PreviewPanel。
- Agent 在 `html` surface 下默认产出到 `.design_studio/preview/index.html`。
- 监听该文件变化，自动刷新 iframe。
- 支持桌面、手机、自适应三种视口。
- 支持打开外部浏览器、下载 HTML、复制文件路径。

**设计约束**

- 不在 MessageBubble 内嵌 iframe。
- iframe 使用 sandbox，默认不设 `allow-same-origin`。
- 第一版要求 HTML 自包含：CSS 内联，JS 走 CDN 或内联，不依赖 npm build。
- 允许后续扩展为 localhost/dev server 预览。

**验收标准**

- Agent 写入 HTML 后 1 秒内预览刷新。
- 预览刷新不影响消息列表滚动和输入。
- 切换项目后恢复各自 preview 状态。
- HTML 空白、读取失败、脚本报错时有明确状态提示。

### 6.3 Craft Rules 注入

**需求**

- 内置基础 craft 规则，来源于 Open Design `craft/`，保留 Refero MIT attribution。
- 第一版只暴露少量模式：
  - 关闭
  - 页面设计
  - 完整设计
- 系统根据 surface 自动推荐模式：
  - 普通对话：关闭
  - 页面：页面设计
  - 图片/视频：完整设计或媒体专用规则

**实现原则**

- Craft 是提高质量的底层能力，不应让用户理解十几个规则文件。
- 注入内容要按 surface 精简，避免 system prompt 过长。
- Brand/design system 的具体 token 优先，craft 只规定通用使用方式。

**验收标准**

- 页面设计模式下，Agent 明确避免常见 AI slop。
- 普通编程任务不自动注入 craft。
- Claude/Codex 的注入路径分别适配，不复制大段逻辑。

### 6.4 场景模板

**需求**

- 第一版内置少量高频场景：
  - SaaS 落地页
  - Dashboard
  - 文档页
  - PPT/Deck
  - 社媒图
  - 产品海报
  - 短视频分镜
- 场景模板只提供轻量 prompt 片段和默认参数，不做完整 skill 系统。

**交互**

- 用户可不选场景，直接输入。
- 选择场景后，输入框 placeholder 和参数项跟随变化。
- 对新手显示简短参数：尺寸、风格、用途。

**验收标准**

- 用户选择“Dashboard”后，Agent 产出明显倾向 Dashboard，而不是普通 landing。
- 场景模板可从插件包扩展。

### 6.5 图片生成

**需求**

- 图片生成进入 MVP。
- 通过 `mindcraft-api` 统一调用，不让 Agent 直接散落执行 curl。
- 支持自然语言触发，也支持用户手动选择参数。
- 输出保存到项目工作区，并在消息中显示。

**首批参数**

| 参数 | 说明 |
|------|------|
| 模型 | 默认模型 + 可选 2-3 个 |
| 比例 | 1:1、16:9、9:16、4:3、3:4 |
| 用途 | hero、海报、头像、社媒、信息图 |
| 参考图 | 后续支持 |

**验收标准**

- 用户输入“生成一张首页 hero 插画”即可产出图片。
- 图片文件落到项目目录，如 `.design_studio/media/images/`。
- 后续 HTML 生成可以引用同一项目里的图片。
- API key 或额度错误时展示明确错误，不伪装成功。

### 6.6 视频生成

**需求**

- 视频进入 v1.1，但 PRD 与数据模型从一开始保留 `video` surface。
- 支持文本到视频、图生视频、HTML 到 MP4 三种方向。
- 首先集成 mindcraft-api 已支持或最容易支持的 provider。

**重点场景**

- 产品宣传短片。
- 社媒短视频。
- 页面/原型转演示视频。
- Dashboard 数据动画。

**验收标准**

- 视频任务可异步运行并显示进度。
- 输出 `.mp4` 保存到项目目录并可播放。
- 失败/超时/排队状态可见。

### 6.7 插件 / DLC 能力包

**需求**

Design Studio 核心能力内置在主应用，但大体积或可选内容通过插件市场下载。

**内置内容**

- 创作类型入口。
- PreviewPanel 基础能力。
- `.design_studio/preview` 文件约定。
- 基础 craft 规则。
- 少量默认场景模板。
- 图片生成基础调用链。

**插件/DLC 内容**

| 插件包 | 内容 |
|--------|------|
| Design Template Pack | 大量 HTML 模板、Deck 模板、Dashboard 模板 |
| Design System Pack | Linear、Apple、Notion、小红书等 DESIGN.md |
| Media Prompt Pack | 图片/视频 prompt gallery、预览缩略图 |
| HyperFrames Pack | HTML→MP4 模板、渲染脚手架 |
| Brand Asset Pack | 图标、设备壳、样机框、示例素材 |

**现有基础**

MindCraft 原生插件市场已经支持：

- 市场清单：`public/plugins/marketplace.json` / CDN marketplace。
- ZIP 下载与安装。
- SHA256 校验。
- 安装到 `app.getPath('userData')/plugins`。
- 启用/禁用、卸载、插件数据存储。

因此 DLC 方案可落地，但需要扩展插件 manifest，让插件不仅提供 Vue 页面，也能声明：

- `designStudio.crafts`
- `designStudio.templates`
- `designStudio.designSystems`
- `designStudio.promptTemplates`
- `designStudio.assets`

**验收标准**

- 未安装 DLC 时基础设计创作可用。
- 安装模板包后，场景模板列表自动增加。
- 卸载插件后，不影响已有项目产物文件。
- 插件资源读取有路径穿越防护和 hash 校验。

### 6.8 运行态观察与终端日志

**需求**

这是后续增强，不抢 MVP，但应进入产品设计。

当 Agent 启动 dev server 或用户项目需要打开端口时，PreviewPanel 附近可显示：

- 当前预览来源：文件 / localhost。
- 端口与 URL。
- server 状态：启动中、运行、退出、错误。
- 最近终端日志片段。
- 构建错误摘要。

**产品价值**

- 用户可同时看到代码产出、页面效果、服务日志。
- 对前端开发非常有全局感，减少在终端、浏览器、聊天之间切换。
- 也能服务普通编程任务，不只服务设计。

**边界**

- 第一版不强绑定终端与项目。
- 只显示由当前 Agent 会话显式启动或识别出的运行态信息。
- 不做复杂 terminal multiplexing。

### 6.9 客户端原生预览与截图验证

**需求**

面向 Electron、桌面客户端、移动端、小程序等非纯 HTML 项目，Design Studio 需要从 iframe 预览扩展为更通用的 runtime preview。

可支持的预览/验证方式：

| 类型 | 说明 | 适用 |
|------|------|------|
| iframe preview | 直接渲染自包含 HTML | 页面、Deck、Dashboard |
| localhost preview | 指向 dev server URL | Vite、Next、Web App |
| BrowserWindow preview | 打开/嵌入 Electron 应用窗口或窗口截图 | Electron 客户端 |
| screenshot preview | 展示 Playwright/浏览器/模拟器截图 | UI 验证、客户端回归 |
| simulator preview | 移动端模拟器或小程序 devtools 状态 | React Native、Flutter、小程序 |

**Playwright 截图验证**

Playwright 是浏览器自动化工具。MindCraft 可以让 Agent 或系统用它启动浏览器、打开本地页面、等待渲染完成、截图，并检查页面是否空白、是否有报错、文字是否重叠、按钮是否超出容器。

这类截图不要求用户手动打开浏览器。它适合作为 Agent 每次修改 UI 后的自动验收：

1. Agent 修改代码。
2. MindCraft 识别或启动 dev server。
3. Playwright 打开 URL。
4. 自动截图桌面/移动视口。
5. 截图显示在右侧面板。
6. Agent 根据截图和控制台错误继续修复。

**产品价值**

- 客户端项目也能获得“看见真实运行结果”的闭环。
- 不局限于 HTML artifact；任何能运行、能截图、能显示日志的本地应用都能纳入工作台。
- 对 MindCraft 自身开发很有价值：可以同时看 renderer 页面、Electron main 日志、路由状态、端口状态和截图。

**验收标准**

- 能为一个本地 Web/Electron 项目显示端口、运行状态和最近日志。
- 能触发一次浏览器截图，并把截图作为预览产物展示。
- 截图失败、端口未启动、页面报错时有明确错误状态。
- 不强制接管用户终端，不阻塞普通 Agent 会话。

---

## 7. 文件与产物约定

推荐在用户项目下使用 `.design_studio/`，不要沿用 Open Design 的 `.od/` 命名。`.design_studio/` 语义更直观，专门承载设计产物、媒体素材、预览文件和运行记录；未来如需保存 MindCraft 的非设计类全局辅助状态，可另设 `.mindcraft/`。

```
<project>/
  .design_studio/
    preview/
      index.html
      assets/
    media/
      images/
      videos/
      audio/
    design/
      DESIGN.md
      brand-spec.md
    runs/
      <run-id>/
        manifest.json
        logs.txt
```

### 7.1 manifest

每次设计创作任务可生成轻量 manifest：

```json
{
  "surface": "html",
  "entry": ".design_studio/preview/index.html",
  "createdAt": "2026-06-17T00:00:00.000Z",
  "agent": "claudeCode",
  "scenario": "saas-landing",
  "outputs": [
    { "type": "html", "path": ".design_studio/preview/index.html" }
  ]
}
```

### 7.2 设计原则

- `.design_studio/` 是项目内设计与运行态辅助产物目录，可以被用户选择提交或忽略。
- 不把所有预览都塞进聊天消息。
- 消息里展示摘要和产物 chip，真实文件落盘。
- 后续支持“打开产物历史”时读取 manifest。

---

## 8. 分期计划

### MVP：设计创作闭环

目标：让用户在 MindCraft 内完成页面预览和图片生成。

范围：

- 创作类型入口：普通 / 页面 / 图片。
- HTML PreviewPanel。
- `.design_studio/preview/index.html` 输出约定。
- 基础 craft 注入。
- 3-5 个场景模板。
- 图片生成 tool callback / mindcraft-api 调用。
- 图片文件落盘与消息预览。

不做：

- 视频生成。
- 完整设计系统库。
- 评论模式。
- 复杂问卷。
- dev server 日志面板。

### v1.1：多模态增强

范围：

- 视频 surface。
- 视频任务异步状态。
- Media Prompt Pack 插件。
- 页面/图片到视频的工作流。
- 初版运行态观察：端口、URL、最近日志。
- Playwright 截图预览。
- Electron/Web 本地运行窗口状态展示。

### v1.2：设计系统与模板 DLC

范围：

- Design Template Pack。
- Design System Pack。
- 插件 manifest 扩展。
- 用户选择品牌/设计系统。
- 更丰富的 HTML/Deck/Dashboard 模板。

### v1.3：高级编辑

范围：

- 预览元素选择/评论。
- Agent 局部修改目标元素。
- 产物历史版本。
- HTML → PDF/ZIP/PPTX 导出增强。

---

## 9. 技术原则

1. **内置核心，插件扩展**
   - 工作流骨架属于主应用。
   - 大内容、大模板、素材、设计系统通过插件下载。

2. **共享 Agent 能力**
   - Claude/Codex 不复制两套设计逻辑。
   - 公共 prompt 组装、craft 加载、surface metadata 尽量放共享模块。

3. **产物落盘优先**
   - 所有设计产物都应成为项目文件，而不是只存在聊天记录。

4. **工具调用优先于 Shell 拼命令**
   - 多模态走 mindcraft-api callback。
   - 避免让 Agent 自己拼散落的 curl 或 provider SDK。

5. **默认关闭**
   - 普通编程用户不应被设计功能影响。

6. **安全边界明确**
   - iframe sandbox。
   - 插件资源路径校验。
   - API key 不写日志。
   - 下载包 hash 校验。

---

## 10. 风险

| 风险 | 说明 | 缓解 |
|------|------|------|
| 包体积膨胀 | 设计系统、模板、示例图视频很大 | DLC 插件化 |
| Prompt 过长 | craft + scenario + design system 可能污染上下文 | 按 surface 精简注入 |
| Claude/Codex 差异 | systemPrompt/instructions 注入路径不同 | 公共组装，分别适配 |
| iframe 安全 | 预览 HTML 可执行脚本 | sandbox，不开放 same-origin |
| 多模态失败成本高 | 视频耗时、计费、排队 | 明确进度和失败状态 |
| 插件信任问题 | DLC 可包含大量资源和入口代码 | hash、manifest schema、路径防护、权限声明 |
| 任务范围失控 | OD 能力很多，容易照搬 | MVP 只做页面预览 + 图片 |

---

## 11. 成功指标

### MVP 指标

- 用户能在 1 分钟内从一句话生成可预览 HTML 页面。
- 用户不离开 MindCraft 即可看到页面效果并继续迭代。
- 图片生成产物能落盘并被后续页面引用。
- 普通编程会话没有新增干扰。
- 设计模式下常见 AI slop 明显减少。

### 体验指标

- 预览刷新延迟 < 1 秒。
- 图片生成失败有明确错误原因。
- 插件未安装时基础功能仍可用。
- 安装模板包后无需重启即可看到新增模板，若技术上需要重启则 UI 明确提示。

---

## 12. PRD 结论

MindCraft 不需要复制 Open Design。更合适的方向是把 Open Design 拆成可被 MindCraft 吸收的几种产品能力：

1. artifact-first 的产物工作流。
2. craft 规则带来的质量控制。
3. HTML 预览带来的即时反馈。
4. 多模态产物进入项目目录。
5. 大内容通过插件/DLC 下载。
6. 客户端运行态观察和截图验证。

第一版最应该交付的是“页面 + 图片”的完整闭环。视频、模板库、设计系统、运行态日志、Playwright 截图、客户端窗口预览都很有价值，但应作为后续增强，沿着同一个 surface/产物模型自然扩展。

更长期的产品方向不是纯 Design 工具，而是 **Host-native Agent Workbench**：Agent 不只写代码，还能在受控权限下观察和操作本机开发环境。设计能力是第一个切入点，客户端应用开发会成为更大的主战场。
