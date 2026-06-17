# mindcraft-agent 重构方案

> 日期：2026-06-10
> 状态：评审稿 v0.1
> 范围：`packages/agent` 共享层、`mindcraft-agent` 独立宿主、`mindcraft-electron` 回灌策略、文档浏览与轻量对话能力

## 1. 背景

当前仓库来自 `mindcraft-electron` 的 Agent 能力抽离结果。`packages/agent` 已经落地，包含 renderer、electron、preload 三个入口，并承载 Claude Code、Codex、CodeHub、agentCommon 等核心能力。

此前的 `mindcraft-lite` 说法容易让项目被理解为 Full 版的简化裁剪。现在项目正式命名为 `mindcraft-agent`，定位也应随之调整：它不是简易版，而是面向开发者的独立编程智能体产品。

进一步看，`mindcraft-agent` 不应只被定义为“编程智能体客户端”。更准确的定位是：轻量级多 Agent 集成平台。编程智能体是第一阶段最重要的核心场景，但平台边界应允许未来接入更多 Agent，并方便嵌入到其他客户端中。

## 2. 核心目标

`mindcraft-agent` 的核心目标是把 `mindcraft-electron` 中已经验证过的 Agent 能力，沉淀为一个独立、稳定、可持续演进的轻量级多 Agent 集成平台。

第一阶段目标：

- 启动后第一主路径就是编程智能体工作台。
- 保留 Claude Code 与 Codex 双 Agent。
- 多 Agent 选择能力作为基础架构，而不是后续附加功能。
- 保留文档浏览能力，作为 Agent 使用过程中的基础辅助能力。
- 提供基本智能对话能力，用于百科知识问答和轻量咨询，但不复刻 Full 版复杂聊天业务。
- `packages/agent` 作为共享内核，可被 `mindcraft-agent` 与 `mindcraft-electron` 共同消费。
- 架构上支持未来嵌入到其他客户端中。
- 宿主层只承担产品壳、窗口、路由、品牌、打包和必要的全局设置。

## 3. 产品定位

`mindcraft-agent` 面向开发者、研发团队和需要轻量级 Agent 工作台的客户端产品。核心使用场景是围绕本地项目持续进行代码理解、修改、审查、验证和多轮任务协作，同时提供基础文档浏览和轻量知识问答。

它不再承载 Full 版中的泛 AI 办公能力，例如应用广场、语音实验室、积分体系、小程序入口、画布、营销页和会员相关入口。上述能力属于 `mindcraft-electron` 的综合业务宿主，不应进入 `mindcraft-agent` 的第一阶段主路径。

智能对话需要保留，但产品形态要收敛为轻量知识问答，不继续沿用 Full 版复杂房间、模型菜单、会员积分、业务 API 和应用链路。

## 4. 架构原则

推荐路线是：**产品独立，内核共享，先稳定后裁剪**。

### 4.1 分层

- `packages/agent/**`：共享 Agent 内核，包含 Agent UI、消息渲染、会话状态、历史恢复、工具卡片、Agent IPC、preload bridge、本地搜索等能力。
- `src/**`：`mindcraft-agent` 独立产品宿主，负责应用壳、导航、基础路由、全局设置、文档浏览入口和产品级页面。
- `electron/**`：桌面运行宿主，负责窗口、菜单、协议、preload 接线、文件系统能力、打包相关 Electron 行为。
- `mindcraft-electron`：Full 版业务宿主，后续作为 `packages/agent` 的消费者，不再反向牵引 Agent 内核的产品体验。

### 4.2 边界

- 共享层只放可跨宿主复用的 Agent 能力。
- 独立产品体验放在 `mindcraft-agent` 宿主层。
- Full 版业务能力不进入 `packages/agent`。
- 不为了短期裁剪在 `packages/agent` 内写宿主特判。
- 只有 Full 版和 Agent 版出现明确分叉时，才引入共享配置抽象。
- 文档浏览属于 `mindcraft-agent` 的基础宿主能力，应保留，但不进入 Agent 内核协议。
- 轻量智能对话应寄生在 Agent 工作台体验中，复用 Agent 的消息 UI、模型配置和会话外壳，不新增一套独立业务 API 链路。

## 5. 多 Agent 基础模型

第一阶段必须保留 Claude Code 与 Codex 双 Agent，并为未来更多 Agent 留出入口。多 Agent 不是附加页面，而是 `mindcraft-agent` 的基础产品模型。

当前 `CodeHub` 不应长期停留在 Claude/Codex 固定双入口模型，应逐步演进为 Agent Registry：

```js
{
  id: 'codex',
  name: 'GPT Codex',
  icon: '...',
  component: CodexPanel,
  settingsComponent: CodexSettings,
  statusProvider: codexStatusProvider,
  capabilities: ['chat', 'tools', 'project-history', 'image-input']
}
```

Registry 的目标：

- 统一 Agent 选择入口。
- 统一顶部 tab 的 agent 标识、运行中状态、等待用户响应状态和关闭行为。
- 统一 Agent 的基础能力声明，例如是否支持图片、工具审批、项目历史、slash、skills、plugins。
- 让新增 Agent 成为注册行为，而不是改写 CodeHub 主结构。
- 支持非编程型 Agent 或场景型 Agent，例如轻量知识问答 Agent。

第一阶段不要求把 Registry 做成完整插件系统，但设计上要避免继续把 Claude/Codex 写死到所有交互路径中。

## 6. 轻量智能对话

`mindcraft-agent` 需要保留基本智能对话能力，但它不应复刻 `mindcraft-electron` 中原有的复杂聊天系统。

建议产品形态：

- 在 Agent 工作台中提供一个内置的“知识问答”或“通用对话”入口。
- 该入口作为 Agent Registry 的一种内置 Agent 或场景型 Agent 存在。
- 复用 Agent 消息列表、输入框、会话历史、模型/Provider 设置和状态展示。
- 默认不绑定项目目录，不启用文件写入、命令执行等开发工具权限。
- 可支持文档上下文引用，但第一阶段不做复杂知识库。

实现原则：

- 不单独接入 Full 版 `/llm/chat` 等业务 API。
- 不引入积分、会员、房间、应用广场、角色广场等 Full 业务依赖。
- 不新增一套和 Agent UI 平行的聊天 UI。
- 如果底层需要调用模型，应优先复用已有 Agent Provider / SDK / 配置能力，并通过 Agent Registry 暴露为轻量对话 Agent。

验收标准：

- 用户可以进行基础百科知识问答。
- 对话入口不要求先选择本地项目目录。
- 对话能力不会获得默认文件写入或 shell 执行权限。
- 代码层没有重新引入 Full 版复杂聊天业务链路。

## 7. 文档浏览能力

文档浏览是 `mindcraft-agent` 的保留能力。它服务于开发者阅读本地文档、代码说明、Markdown、PDF、HTML、文本和 Agent 生成结果。

保留范围：

- 文档浏览入口。
- 本地文件打开。
- Markdown / HTML / PDF / 代码文本等已有 viewer 能力。
- 从 Agent 消息中的本地路径跳转到文档浏览或代码查看。
- Electron 文件读取、默认应用打开、路径解析等基础能力。

边界：

- 文档浏览属于宿主基础能力，不应成为 `packages/agent` 协议层的一部分。
- `packages/agent` 可以暴露“打开本地文档”的触发点，但具体窗口、路由和 viewer 由宿主实现。
- 第一阶段不做复杂文档管理系统、知识库同步、云端文档空间。

验收标准：

- `mindcraft-agent` 裁剪后仍可打开常见本地文档。
- Agent 消息中的本地路径仍可被打开或预览。
- 文档浏览不依赖 Full 版应用广场、登录、积分和业务接口。

## 8. 可嵌入能力

`mindcraft-agent` 未来要方便嵌入其他客户端，因此共享内核需要保持低耦合。

可嵌入目标：

- 其他宿主可以通过 renderer 入口挂载 CodeHub 或单个 Agent 面板。
- 其他宿主可以通过 electron/preload 入口注册必要 IPC。
- 共享层不直接依赖 `mindcraft-agent` 的导航、登录、路由和品牌。
- 宿主可以决定是否启用文档浏览、轻量对话、Claude、Codex 或其他 Agent。

第一阶段不要求发布 npm 包，但代码边界应按未来可嵌入方向整理。

## 9. 阶段规划

### Phase 0：共享层稳定基线

目标：确认 `packages/agent` 已经具备被多个宿主消费的基本条件。

范围：

- 检查 `packages/agent/src/index.js` 的 renderer 出口。
- 检查 `packages/agent/electron/index.js` 的 IPC 注册出口。
- 检查 `packages/agent/preload/index.js` 的 bridge 出口。
- 扫描 `packages/agent` 对 `src/**`、Full 业务组件、Full 路由、Full store 的隐性依赖。
- 确认主题、图标、字体、样式资源引用在独立宿主中可用。
- 明确文档浏览由宿主承载，Agent 内核只保留触发能力。
- 确认轻量对话不会重新依赖 Full 版聊天业务 API。
- 保持 Claude Code 与 Codex 关键回归测试通过。
- 不新增大功能，不做大规模目录重排。

验收标准：

- `packages/agent` 的入口职责清晰。
- Full 版宿主和 `mindcraft-agent` 宿主可以通过同一套入口接入。
- 共享层没有明显依赖 Full 业务页面、积分、应用广场、语音、登录等模块。
- 文档浏览和轻量对话的边界已明确。
- 当前已知 P0/P1 风险被列入后续修复清单，不被裁剪工作掩盖。

### Phase 1：回灌 mindcraft-electron

目标：把共享层稳定基线同步给 `mindcraft-electron`，避免两个项目在 Agent 内核上继续分叉。

范围：

- 同步 `packages/agent` 共享层。
- 同步 Electron IPC/preload 接线方式。
- 保证 Full 版仍可通过原 `codeHub` 路由进入编程智能体。
- 不在 Full 版中引入 `mindcraft-agent` 的独立产品导航。
- 不在该阶段新增 Claude/Codex 大功能。

验收标准：

- `mindcraft-electron` 能使用同一套 Agent 内核。
- Full 版原有 Agent 入口不退化。
- Full 版业务功能不因共享层回灌被大范围影响。

### Phase 2：mindcraft-agent 宿主裁剪

目标：把当前仓库整理成正式的 `mindcraft-agent` 独立产品宿主。

保留：

- CodeHub / 多 Agent 工作台。
- Claude Code 与 Codex 面板。
- 轻量知识问答入口。
- 文档浏览入口。
- 项目目录选择。
- 会话历史。
- Agent 设置。
- 文档或代码查看所需的最小文件能力。
- Electron 窗口、菜单、preload、打包能力。

裁剪或隔离：

- Full 版复杂智能对话主页面。
- 应用广场。
- 语音实验室。
- 视频、音乐、图片等泛 AI 应用。
- 积分、会员、充值、小程序、分享有礼。
- 与 Agent 主路径无关的营销入口。
- Full 业务接口请求和 store。

验收标准：

- 应用启动后进入 `mindcraft-agent` 工作台。
- 主导航只暴露 Agent 产品需要的入口。
- 文档浏览入口可用。
- 基础知识问答入口可用，并寄生在 Agent 工作台体验中。
- 非 Agent 业务代码不再参与首屏路由和主流程。
- 打包产物命名、图标、窗口标题和版本信息体现 `mindcraft-agent`。

### Phase 3：Agent Registry 演进

目标：把多 Agent 能力从 UI 选择项提升为基础架构。

范围：

- 定义内置 Agent 注册表。
- 让 CodeHub 从注册表生成 Agent 选择项。
- 统一 Agent 元信息、设置入口、能力声明和状态映射。
- 将轻量知识问答作为内置 Agent 或场景型 Agent 纳入 Registry。
- 减少 CodeHub 中直接判断 `claudeCode` / `codex` 的分支。

验收标准：

- 新增第三个 Agent 时，不需要重写 CodeHub 顶层结构。
- 顶部 tab、设置、状态、运行中提示可以按注册信息工作。
- Claude/Codex 现有体验不退化。
- 轻量知识问答可作为非编程 Agent 证明 Registry 模型不是只服务 Claude/Codex。

### Phase 4：发布基线

目标：形成可内测的 `mindcraft-agent` 发布版本。

范围：

- 更新 `package.json` 项目名、产品名和描述。
- 更新 Electron Builder 配置。
- 更新图标、窗口标题、安装包名称。
- 梳理版本号和更新地址策略。
- 准备基础 smoke test。

验收标准：

- 可生成 `mindcraft-agent` 安装包。
- 安装后产品名称、图标、窗口标题一致。
- 首次启动、选择目录、启动 Claude/Codex、发送消息、停止会话、恢复历史等主路径可用。
- 文档浏览与轻量知识问答主路径可用。

## 10. 当前风险

### 10.1 Claude 会话重复 / 接力问题

`docs/TODO.md` 中的 T046 仍是 P0 风险。它涉及 Claude UI 本地会话与 Claude CLI jsonl 会话之间的身份绑定，如果不处理，独立产品中会更明显。

建议：Phase 0 或 Phase 2 前必须明确处理策略。可以先修复，也可以在第一版内测中标注为已知风险，但不能让裁剪工作掩盖该问题。

### 10.2 共享层仍可能携带 Full 宿主假设

虽然 `packages/agent` 已经抽离，但仍需要检查资源、主题、路由、store、window.electronAPI、preload 名称和样式依赖。

### 10.3 Codex 与 Claude 能力模型不一致

Codex 与 Claude 的事件模型、历史模型、权限模型不同。Agent Registry 只能统一外层元信息，不能强行把内部协议抹平。

### 10.4 回灌成本

如果 `mindcraft-electron` 与当前仓库已经出现文件结构差异，回灌需要明确采用 patch、分支同步还是子目录同步策略。该工作不应和宿主裁剪混在同一个提交里完成。

### 10.5 轻量对话边界漂移

如果轻量知识问答继续沿用 Full 版聊天系统，很容易重新引入登录、积分、房间、模型菜单、业务 API 和复杂状态。该能力必须保持为 Agent 工作台中的轻量入口。

## 11. 非目标

第一阶段不做：

- npm 包发布。
- 完整插件市场。
- 完整第三方 Agent 插件系统。
- 重写 Claude/Codex 内部协议。
- 大规模 UI 重设计。
- Full 版业务功能迁移到 `mindcraft-agent`。
- Full 版复杂智能对话系统迁移。
- 复杂知识库或文档管理系统。
- 为了理论复用提前抽象所有宿主配置。

## 12. 评审关注点

请评审重点关注：

- `mindcraft-agent` 是否应被视为独立产品，而不是 Full 版裁剪产物。
- `mindcraft-agent` 是否应被视为轻量级多 Agent 集成平台，而不是单一编程 Agent 客户端。
- `packages/agent` 作为共享内核的边界是否合理。
- 是否需要在宿主裁剪前先完成 `mindcraft-electron` 回灌。
- Phase 0 是否足够保证后续裁剪不会破坏共享层。
- 多 Agent Registry 是否应在第一阶段完成基础化。
- 文档浏览作为保留能力放在宿主层是否合理。
- 基础知识问答是否应作为内置 Agent / 场景型 Agent 寄生在 Agent 工作台中。
- T046 是否必须在裁剪前解决。
- 哪些 Full 版能力应该保留为 `mindcraft-agent` 的可选辅助能力。

## 13. 建议执行顺序

1. 对本方案评审并确认产品定位。
2. 执行 Phase 0，共享层稳定基线。
3. 将稳定基线回灌到 `mindcraft-electron`。
4. 执行 Phase 2，裁剪 `mindcraft-agent` 宿主。
5. 执行 Phase 3，演进 Agent Registry。
6. 执行 Phase 4，整理发布基线。
