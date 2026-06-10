# codeX 执行文档

日期：2026-05-26

目标：
- 先移除从 `claudeCode` 复制过来、但官方 Codex 当前不适合保留或项目中未真正打通的功能
- 再补齐官方 Codex 能稳定支持的基础能力
- 最后增加更有 Codex 特征的工作流能力

参考依据：
- 本项目当前实现
- OpenAI 官方 Codex / GPT-5.3-Codex 文档（截至 2026-05-26）

---

## 一、总原则

执行顺序：

1. 先做减法
2. 再做可用性补齐
3. 最后做差异化增强

架构原则：

- 公共能力收敛到 `src/components/agentCommon`
- `src/components/claudeCode` 只保留 Claude 特有实现
- `src/components/codeX` 只保留 Codex 特有实现
- `codeX` 不再直接把 `claudeCode` 当运行时公共层使用

项目同源原则：

- 整个 Codex 项目都应以原生 Codex CLI 为同源基准
- 只要原生 Codex CLI 已经在 `.codex` 中维护的数据、状态、配置、会话、线程、历史、运行产物，本项目都必须优先直接读取 `.codex`，并优先写回 `.codex`

---

## 二、阶段 1：清理 Claude 复制残留

目标：
- 去掉假功能
- 去掉误导性 UI
- 去掉未接线的交互入口
- 为后续重构降低噪音

### 任务包 1：下线未真正支持的交互

具体改动点：

- 下线 `AskQuestionDialog` 在 `codeX` 主链路中的入口
- 移除或隐藏 `respondAskQuestion()` 相关交互
- 关闭 slash 入口
- 关闭 mention 入口
- 降级或隐藏当前 `runMode` 入口，直到它能真实影响运行时
- 把 `PlanModePanel` 从“模式能力”降级为普通消息/工具展示，或暂时隐藏

涉及文件：

- `src/components/codeX/index.vue`
- `src/components/codeX/components/messages/AskQuestionDialog.vue`
- `src/components/codeX/components/InputToolbar.vue`
- `src/components/codeX/components/messages/MessageList.vue`
- `src/components/codeX/components/messages/ToolMessageCard.vue`

完成标准：

- 用户在 Codex 页看不到点开无效的问答/命令/提及入口
- 所有保留的交互都有真实后端能力支撑

### 任务包 2：清理 Claude 命名和文案残留

具体改动点：

- 清理空状态中的 `Claude Code`
- 清理弹窗中的 `Claude 需要你的回答`
- 清理组件名、提示文案、状态文案中的 Claude 残留
- 修复明显乱码文案

涉及文件：

- `src/components/codeX/index.vue`
- `src/components/codeX/components/messages/*.vue`
- `src/components/codeX/components/*.vue`

完成标准：

- Codex 页面中不再出现 Claude 名称
- 核心提示文案可读，无乱码

### 任务包 3：清理未接管的复制文件与双轨实现

具体改动点：

- 盘点 `src/components/codeX` 中已复制但主入口未使用的组件
- 明确每个文件是：
  - 接管运行时
  - 合并到 `agentCommon`
  - 删除
- 消除“codeX 目录里有一份，运行时却仍引用 claudeCode 的另一份”的状态

涉及文件：

- `src/components/codeX/index.vue`
- `src/components/codeX/components/**/*`
- `src/components/claudeCode/components/**/*`

完成标准：

- `codeX` 主入口引用关系清晰
- 不再存在运行时和本地副本两套并存的主链路组件

### 任务包 4：统一命名与路径

具体改动点：

- 统一 `codeX` / `codex` 命名
- 统一 import 路径大小写
- 修复路由路径与实际目录不一致问题

涉及文件：

- `src/router.js`
- `src/Main.vue`
- `src/components/codeX/**/*`
- 相关 import 入口文件

完成标准：

- 不依赖 Windows 大小写不敏感特性
- 路径和目录命名统一

---

## 三、阶段 2：收口公共层

目标：
- 让 `agentCommon` 成为真正公共层
- 切断 `codeX` 对 `claudeCode` 运行时公共组件的依赖

### 任务包 5：定义组件分层

分层规则：

- `agentCommon`
  - 通用消息气泡
  - 通用工具卡片
  - diff 展示
  - 通用滚动/附件 composable
- `claudeCode`
  - Claude 独有配置
  - Claude 独有历史/skills/memory 逻辑
  - Claude 独有事件模型适配
- `codeX`
  - Codex 独有配置
  - Codex 独有消息归一化
  - Codex 独有工作流能力

涉及文件：

- `src/components/agentCommon/**/*`
- `src/components/claudeCode/**/*`
- `src/components/codeX/**/*`

完成标准：

- 每个组件只属于一个明确层级
- `claudeCode` 不再承担半公共层职责

### 任务包 6：把共享消息组件迁到 agentCommon

具体改动点：

- 统一 `MessageItem`
- 统一 `AssistantMessageBubble`
- 统一 `UserMessageBubble`
- 统一 `SystemMessageCard`
- 统一 `ToolMessageCard`
- 统一 `DiffModal / DiffSplitView`
- 统一 `tools/*`

涉及文件：

- `src/components/agentCommon/messages/**/*`
- `src/components/codeX/components/messages/**/*`
- `src/components/claudeCode/components/messages/**/*`

完成标准：

- `codeX` 和 `claudeCode` 在消息展示层只依赖 `agentCommon`
- 各自只保留必要的 agent-specific 包装

---

## 四、阶段 3：补齐 Codex 基础可用能力

目标：
- 把 Codex 面板从“演示版”提升到“可稳定使用”

### 任务包 7：重写 Codex 消息归一化层

具体改动点：

- 重新设计 `useCodexAgentStream`
- 统一前端消息模型
- 处理以下事件：
  - `agent_message`
  - `reasoning`
  - `command_execution`
  - `file_change`
  - `mcp_tool_call`
  - `web_search`
  - `todo_list`
  - `error`
- 建立稳定状态：
  - `pending`
  - `running`
  - `done`
  - `error`
  - `denied`

涉及文件：

- `src/components/codeX/composables/useCodexAgentStream.js`
- `src/components/agentCommon/messages/**/*`
- `src/components/agentCommon/utils/helpers.js`

完成标准：

- 流式文本不会丢段或重复
- 工具消息能正确体现执行中与执行完成状态
- 多种 item 类型能稳定渲染

### 任务包 8：补齐权限询问闭环

具体改动点：

- 主进程监听 Codex SDK 权限请求事件
- 建立 `requestId -> resolver`
- 发出 `codex-agent-permission`
- 前端支持允许与拒绝
- 工具卡片更新为：
  - pending
  - approved
  - denied
  - error

涉及文件：

- `electron/mainModules/codexAgentSdk.js`
- `electron/preload.js`
- `src/components/codeX/index.vue`
- `src/components/agentCommon/messages/ToolMessageCard.vue`

完成标准：

- 权限请求能真正阻塞等待用户操作
- 用户的允许/拒绝能真实影响执行流程

### 任务包 9：补齐历史能力 V1

目标：
- 先实现“轻量但真实可用”的历史系统

具体改动点：

- 为 chat 建立 `_fullMessages`
- 修复 `loadMoreHistory()` 的真实可用性
- 流式保存节流
- 恢复后滚动状态修正
- 恢复 chat/message/metrics 的基本状态

暂不做：

- 类似 Claude 的真实 session 文件扫描
- 范围分页读取本地 session 文件
- compact summary 恢复

涉及文件：

- `src/components/codeX/composables/useCodexHistory.js`
- `src/components/codeX/index.vue`
- `src/components/codeX/composables/useCodexAgentStream.js`

完成标准：

- 重启应用后最近会话内容可恢复
- 支持本地“加载更多”
- 不再出现 `_fullMessages` 逻辑空转

### 任务包 10：补齐 metrics 与状态栏

具体改动点：

- 整理 session 级 metrics
- 正确处理 duration
- 正确处理 thinking 状态
- 修复切换 chat 时 metrics 串会话问题
- 补齐 model / token / cache token 等状态同步

涉及文件：

- `src/components/codeX/index.vue`
- `src/components/codeX/components/StatusBarMetrics.vue`
- `electron/mainModules/codexAgentSdk.js`

完成标准：

- 状态栏显示与当前 chat 对应
- 流式中与结束后状态一致

### 任务包 11：补齐设置页运行时配置

具体改动点：

- 接入 `permission policy`
- 接入 `reasoning effort`
- 整理 model/provider 配置持久化
- 校验配置是否真正影响下一次会话

涉及文件：

- `src/components/codeX/components/APISetting.vue`
- `src/components/codeX/components/ProviderForm.vue`
- `electron/mainModules/codexAgentSdk.js`
- `electron/preload.js`

完成标准：

- 设置项不是只改本地 UI
- 修改后能真实作用到 Codex 会话

### 任务包 12：稳定图像输入与工具结果展示

具体改动点：

- 图片粘贴/拖拽/选择完整闭环
- 工具结果卡片统一展示 bash / read / write / diff
- 多文件 change 的展示优化

涉及文件：

- `src/components/agentCommon/composables/useImageAttachments.js`
- `src/components/codeX/index.vue`
- `src/components/agentCommon/messages/tools/*`

完成标准：

- 图像输入可稳定使用
- 常见工具输出可读、可展开、可追溯

---

## 五、阶段 4：增加 Codex 特征能力

目标：
- 不照搬 Claude，而是建立 Codex 的产品辨识度

### 任务包 13：Goal 模式

来源：
- 官方 Codex 用例 `Follow a goal`

具体改动点：

- 增加 Goal 面板
- 一个 goal 绑定多个 turn
- goal 状态：
  - active
  - complete
  - blocked
- 支持长任务持续推进

涉及文件：

- `src/components/codeX/index.vue`
- `src/components/codeX/components/*`
- `electron/mainModules/codexAgentSdk.js`

完成标准：

- 用户可以围绕一个持续目标而不是单轮问答工作

### 任务包 14：Skills 系统

来源：
- 官方 Codex 用例 `Save workflows as skills`

具体改动点：

- 本地 skills 列表
- skills 配置与启用
- 会话中注入 skill 工作流
- skill 管理 UI

涉及文件：

- `src/components/codeX/components/*`
- `electron/mainModules/codexAgentSdk.js`
- 本地 skills 存储模块

完成标准：

- 常用工作流可复用
- 不依赖 Claude 的 slash/skills 机制

### 任务包 15：Code Review / PR Review

来源：
- 官方 Codex 用例 `Review pull requests faster`

具体改动点：

- 增加 review 任务入口
- 支持输入 diff / branch / PR 描述
- 输出 findings-first 结构
- 复用 diff 组件展示上下文

涉及文件：

- `src/components/codeX/components/*`
- `src/components/agentCommon/messages/tools/Diff*`

完成标准：

- 用户可以把 Codex 当成代码审查助手而不是普通聊天窗口

### 任务包 16：CLI Tools / Workflow Commands

来源：
- 官方 Codex 用例 `Create a CLI Codex can use`

具体改动点：

- 配置项目常用 CLI
- 提供白名单与参数模板
- 在任务流中显式调用

涉及文件：

- `src/components/codeX/components/*`
- `electron/mainModules/codexAgentSdk.js`

完成标准：

- 常用工程操作可以通过结构化方式复用，而不是每次自然语言重复描述

### 任务包 17：大代码库理解 / 项目地图

来源：
- 官方 Codex 用例 `Understand a large codebase`

具体改动点：

- 扫描入口点
- 生成模块关系摘要
- 输出项目地图视图

涉及文件：

- `src/components/codeX/components/*`
- `electron/mainModules/codexAgentSdk.js`

完成标准：

- 用户能快速从 Codex 获取代码库结构理解

### 任务包 18：Evals / 验证工作流

来源：
- 官方 Codex 用例 `Add evals to your AI application`

具体改动点：

- 生成评测任务
- 运行验证
- 输出评测摘要

完成标准：

- Codex 能参与“写完再验证”的开发闭环

---

## 六、阶段 5：高级能力预研

目标：
- 先预研，不直接进入主开发链

### 任务包 19：Deploy / Preview

来源：
- 官方 Codex 用例 `Deploy an app or website`

说明：

- 适合作为后续工作流扩展
- 依赖项目构建与部署链路规范化

### 任务包 20：Front-end design iteration

来源：
- 官方 Codex 用例 `Make granular UI changes`
- 官方 Codex 用例 `Turn Figma designs into code`

说明：

- 适合在基础消息流、图像输入、diff 展示稳定后再做

### 任务包 21：Computer Use

来源：
- 官方 Codex 用例 `Use your computer with Codex`
- 官方 Codex 用例 `QA your app with Computer Use`

说明：

- 官方当前文档强调的是 Mac
- 你当前项目运行环境是 Windows + Electron
- 需要单独预研可行性，不建议现在纳入主线

---

## 七、建议执行顺序

建议按下面顺序推进：

1. 阶段 1：清理 Claude 复制残留
2. 阶段 2：收口公共层
3. 阶段 3：补齐 Codex 基础可用能力
4. 阶段 4：增加 Codex 特征能力
5. 阶段 5：高级能力预研

更细的任务顺序建议：

1. 任务包 1-4
2. 任务包 5-6
3. 任务包 7
4. 任务包 8
5. 任务包 9
6. 任务包 10-12
7. 任务包 13-18
8. 任务包 19-21

---

## 八、每阶段完成标志

阶段 1 完成标志：

- 假功能全部下线
- 文案不再混杂 Claude
- 路径与命名统一

阶段 2 完成标志：

- `agentCommon` 成为真正公共层
- `codeX` 不再运行时依赖 `claudeCode` 组件

阶段 3 完成标志：

- Codex 页具备稳定流式、权限、历史、配置、状态栏能力
- 可以作为日常可用工具使用

阶段 4 完成标志：

- Codex 不只是 Claude 的替代页，而是具备目标型工作流和代码工作流能力

阶段 5 完成标志：

- 明确哪些高级能力值得产品化，哪些只适合实验性接入
