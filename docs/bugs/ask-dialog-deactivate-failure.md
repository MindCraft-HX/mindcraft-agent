# AskQuestion/PlanReview 弹窗 — keep-alive 失活导致失败

## 日期

2026-06-11

## 症状

用户在 Claude Code 中使用时，Agent 弹出"询问用户"（AskQuestion）或"方案审查"（PlanReview）弹窗。此时切换到侧边栏"文档"Tab，弹窗消失。等用户回到"项目"Tab 时，弹窗已错过，Agent 永久挂起等待回答（或自动应答了错误选项），方案选型失败。

## 根因

```
用户正在使用 Claude Code (路由 /main/codeHub)
  → Agent 弹出 AskQuestionDialog (<Teleport to="body">, z-index 9999)
  → 用户点击侧边栏切换到"文档"Tab (路由 → /main/mdViewer)
  → <keep-alive> 将 codeHub 组件失活
  → Vue 3 Teleport 在父组件失活时，将弹窗 DOM 从 <body> 撤回父组件的隐藏 DOM 树
  → 弹窗从屏幕消失，但 askDialogVisible 仍为 true
  → Agent 无超时机制，永久等待
  → 用户回到"项目"Tab，组件重新激活，但状态已混乱
```

关键细节：
- Main.vue 中 `<router-view>` 外层有 `<keep-alive :include="['codeHub', 'mdViewer']">`，两个组件在路由切换时保活但失活
- `claudeCode` (在 codeHub 内) 和 `codeX` 都没有 `onActivated`/`onDeactivated` 钩子
- AskQuestionDialog 使用 `<Teleport to="body">`，Vue 3 在 `keep-alive` 失活父组件时会回撤 Teleport 内容
- PlanReviewDialog 有完全相同的问题

## 修复方案

### 修改的文件

| 文件 | 改动 |
|---|---|
| `packages/agent/src/components/claudeCode/index.vue` | 核心修改：生命周期钩子、10min 超时、提示音、provide 注入、异常保护 |
| `packages/agent/src/components/claudeCode/components/messages/tools/ToolAskQuestion.vue` | 添加手动"回答"按钮，通过 inject 调用 reopenAskDialog |
| `packages/agent/src/components/codeX/components/messages/tools/ToolAskQuestion.vue` | 同上（保持一致性） |
| `packages/agent/src/components/agentCommon/utils/playAskSound.js` | **新建** — 审批提示音 "叮~咚~"（660Hz→880Hz 双短音） |

### 设计原则

- **回来时不自动弹窗**：防止"随便弹出"。用户通过蓝色 pending-dot + 聊天中"等待回答中… [回答]"按钮感知
- **10 分钟超时自动应答**：防止 Agent 永久挂起
- **审批提示音**：区别于完成音，一听就知道"需要你回答"
- **断开保护**：所有 IPC 调用加可选链，定时器在 onUnmounted 清理

### 关键代码逻辑

#### 1. onDeactivated（切走时）

```js
onDeactivated(() => {
  if (askDialogVisible.value) {
    _hadAskDialogOnDeactivate.value = true
    askDialogVisible.value = false  // 关闭弹窗，不自动应答
  }
  if (planReviewVisible.value) {
    _hadPlanReviewOnDeactivate.value = true
    planReviewVisible.value = false
  }
})
```

弹窗关闭但消息保持 `status: 'pending'`，Tab 上的蓝色 pending-dot 持续可见。

#### 2. onActivated（回来时）

```js
onActivated(() => {
  _hadAskDialogOnDeactivate.value = false
  _hadPlanReviewOnDeactivate.value = false
  // 不自动恢复弹窗
})
```

用户通过 pending-dot 知道有待处理项，点击消息卡上的"回答"按钮手动重新打开。

#### 3. 超时机制

```js
function showAskDialog(toolMsg, questions) {
  // ...
  _clearAskTimeout()
  _askTimeout = setTimeout(() => {
    if (askDialogVisible.value) {
      handleAskDialogClose()  // 自动选默认选项应答
    }
  }, 10 * 60 * 1000)  // 10 分钟
}
```

PlanReview 超时仅关闭弹窗，不自动决策（接受/拒绝需用户显式操作）。

#### 4. 提示音

```js
// IPC 监听器中
window.electronAPI.onClaudeAgentAskQuestion?.((data) => {
    playAskSound()  // 先响提示音
    onAgentAskQuestion(data)
    // ...
})
window.electronAPI.onClaudeAgentPlanReview?.((data) => {
    playAskSound()  // 同上
    // ...
})
```

#### 5. 手动重新打开

ToolAskQuestion 通过 `inject('reopenAskDialog')` 获取回调，点击"回答"按钮调用：

```js
function reopenAskDialog(toolMsg) {
  if (!toolMsg || toolMsg.askAnswered) return
  const questions = parseAskQuestions(toolMsg)
  if (questions.length) showAskDialog(toolMsg, questions)
}
```

## 验证清单

- [ ] 正常流程：弹窗出现 → 回答 → Agent 继续
- [ ] 切换 Tab 后回来：弹窗出现 → 切到文档 → 弹窗消失 → 回来 → 弹窗不自动弹出，蓝色 pending-dot 可见 → 点击"回答"按钮 → 弹窗重新出现 → 正常回答
- [ ] 10 分钟超时：弹窗出现 → 不回答 → 10 分钟后自动应答 → Agent 继续
- [ ] 提示音：AskQuestion/PlanReview 触发时听到"叮咚"声
- [ ] 断开保护：Agent 中途终止 → 弹窗/消息卡不卡死
- [ ] PlanReview 同样场景测试

---

# 附录：任务结束通知 — keep-alive 失活时侧边栏不亮

## 日期

2026-06-11

## 症状

用户在"文档"Tab 或"首页"时，后台项目任务完成，侧边栏"项目"图标没有高亮脉冲提醒。

## 根因

通知链路：`onAgentDone → hasDoneNotification=true → codeHub.unifiedTabs computed → codeHub.watcher → codehubHasNotification ref → 侧边栏`。

codeHub 被 keep-alive 失活后，其 `computed` 和 `watch` 全部暂停，通知链路在第三步断裂。

## 修复

在 `useClaudeAgentStream` / `useCodexAgentStream` 的 `onAgentDone` 中新增 `onBackgroundTaskDone` 回调，直接设置 `codehubHasNotification.value = true`，绕开 codeHub 的 computed+watch。

**修改的文件**：
- `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js` — 新增 `onBackgroundTaskDone` 参数和调用
- `packages/agent/src/components/codeX/composables/useCodexAgentStream.js` — 同上
- `packages/agent/src/components/claudeCode/index.vue` — 注入 `codehubHasNotification`，传入回调
- `packages/agent/src/components/codeX/index.vue` — 同上

**关键设计**：
- 回调在 IPC 事件处理函数内部直接调用，不依赖 Vue 的响应式调度，keep-alive 失活不影响其执行
- codeHub 的原有 watcher 保留，负责任务完成通知的"清除"（用户切换回项目 Tab 时自动清除高亮）

## 验证清单

- [ ] 在"文档"Tab 等待 → 后台项目任务完成 → 侧边栏"项目"图标高亮脉冲
- [ ] 在"首页"Tab 等待 → 同上
- [ ] 点击高亮的"项目"图标 → 切回项目 Tab → 通知清除
- [ ] Claude Code 和 Codex 都正常

## 相关文件

- `src/Main.vue` — keep-alive 定义位置，provide `codehubHasNotification`
- `packages/agent/src/components/codeHub/index.vue` — 原有通知 watcher（负责清除）
- `packages/agent/src/components/claudeCode/index.vue` — 弹窗状态管理
- `packages/agent/src/components/claudeCode/components/messages/AskQuestionDialog.vue` — 弹窗 UI（Teleport）
- `packages/agent/src/components/claudeCode/components/messages/PlanReviewDialog.vue` — PlanReview 弹窗 UI
