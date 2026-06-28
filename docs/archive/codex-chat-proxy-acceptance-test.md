# CodeX Chat Completions 协议转换代理 — 人工验收方案

> 日期: 2026/06/18 | 基于 `docs/codex-chat-proxy-plan.md` 实施计划

## 验收概述

本方案覆盖 6 大类测试场景，共 24 项检查点。验收人按顺序执行，每项标记 ✅/❌。

前置条件：
- 已构建并启动 MindCraft Electron 应用
- 拥有至少一个 Chat Completions 协议 API 的 Key（如 DeepSeek）
- 拥有至少一个 Responses 协议 API 的 Key（如 OpenAI）——用于回归测试
- 可查看 Electron 主进程控制台日志（用于验证代理生命周期）

---

## 一、UI 验收（ProviderForm）

### 1.1 API 格式下拉框可见性
- [ ] 打开 CodeX → 选择或新建 Provider → 进入 ProviderForm
- [ ] 确认在 "Reasoning Effort" 下方出现 "API 格式" 下拉框
- [ ] 确认下拉框有两个选项：
  - "OpenAI Responses（官方/兼容接口）"
  - "OpenAI Chat Completions（需要协议转换）"
- [ ] 确认默认值为 "Responses"

### 1.2 下拉框切换与持久化
- [ ] 切换到 "Chat Completions"，点击保存
- [ ] 关闭 ProviderForm，重新打开同一 Provider
- [ ] 确认 "API 格式" 仍显示 "Chat Completions"（持久化成功）
- [ ] 切回 "Responses"，保存，再次打开确认

### 1.3 国际化
- [ ] 切换到英文界面 → 确认下拉标签显示 "API Format"
- [ ] 确认选项显示 "OpenAI Responses (official/compatible)" / "OpenAI Chat Completions (protocol translation required)"
- [ ] 切回中文界面 → 确认恢复中文显示

---

## 二、config.toml 验收

### 2.1 Chat 格式 — TOML 生成
- [ ] 将一个 Provider 的 API 格式设为 "Chat Completions"
- [ ] 保存后，通过 APISetting 界面查看该 Provider 的 TOML 文本
- [ ] 确认包含 `wire_api = "responses"`（固定值，始终为 responses）
- [ ] 确认包含 `api_format = "chat"`（标记上游协议为 Chat）

### 2.2 Responses 格式 — TOML 生成
- [ ] 将 Provider 的 API 格式设为 "Responses"
- [ ] 确认包含 `wire_api = "responses"`（与 Chat 格式相同）
- [ ] 确认包含 `api_format = "responses"` 或没有 `api_format` 字段

### 2.3 TOML 字段不会被 mergeManagedProviderToml 覆盖
- [ ] 手动在 TOML 中添加非托管字段（如 `# custom comment`）
- [ ] 通过界面修改并保存该 Provider
- [ ] 确认自定义注释仍保留
- [ ] 确认 `wire_api` 和 `api_format` 更新为最新值

---

## 三、代理生命周期验收

### 3.1 Chat 格式 — 代理启动
- [ ] 配置一个 Chat 格式 Provider，保存
- [ ] 在 CodeX 中发起一次对话（发送任意 prompt）
- [ ] **查看 Electron 主进程日志**，确认出现：
  - `[codex-proxy] listening on 127.0.0.1:<端口号>, upstream: <原始 API 地址>`
- [ ] 确认端口号为随机分配（每次启动可能不同）

### 3.2 Chat 格式 — 代理端口释放
- [ ] 完成对话（等待 CodeX 回复完毕）
- [ ] **查看 Electron 主进程日志**，确认出现：
  - `[codex-proxy] closing...`
  - `[codex-proxy] closed`
- [ ] 连续发起两次对话，确认每次代理端口释放后重新分配（日志无 "address in use" 错误）

### 3.3 Chat 格式 — 中止对话时代理清理
- [ ] 发起一次 CodeX 对话
- [ ] 在回复过程中点击中止/停止按钮
- [ ] 确认日志中出现 `[codex-proxy] closing...` 和 `[codex-proxy] closed`
- [ ] 随后再发起新对话，确认代理正常重启

### 3.4 Responses 格式 — 代理不启动
- [ ] 配置一个 Responses 格式 Provider，保存
- [ ] 在 CodeX 中发起一次对话
- [ ] **确认日志中没有** `[codex-proxy] listening` 字样（不走代理）
- [ ] 确认对话正常工作（直连 API）

---

## 四、协议转换验收（核心功能）

### 4.1 Chat 格式 — 基础对话（非流式）
> 需要修改代码临时关闭流式输出 或 使用支持非流式的 provider

- [ ] 发送简单 prompt："你好，请用中文回答：1+1等于几？"
- [ ] 确认 CodeX 收到正确回复内容
- [ ] 确认没有报错或异常

### 4.2 Chat 格式 — 流式对话
- [ ] 发送 prompt："请用 Python 写一个快速排序算法，并逐步解释"
- [ ] 确认流式输出正常（逐字/逐词出现）
- [ ] 确认代码块格式正确
- [ ] 确认回复完整，没有截断

### 4.3 Chat 格式 — 推理内容（reasoning/CoT）
> 需要支持 reasoning 的模型（如 DeepSeek-R1, deepseek-reasoner）

- [ ] 发送 prompt："分析哥德巴赫猜想的数学意义"
- [ ] 确认推理过程可见（在 CodeX 界面中显示为思考/推理块）
- [ ] 确认推理结束后正常输出正文
- [ ] 确认推理内容和正文内容有明确分界

### 4.4 Chat 格式 — 工具调用（function calling）
> 需要 CodeX 有可用工具的场景

- [ ] 发送 prompt："读取当前目录下的 package.json 文件内容"
- [ ] 确认 CodeX 触发工具调用（如 read_file）
- [ ] 确认工具调用参数正确
- [ ] 确认工具返回后 CodeX 继续回复

### 4.5 Chat 格式 — 模型列表透传
- [ ] 在 ProviderForm 中填写 Chat API 地址和 Key
- [ ] 确认可用模型列表功能正常（如果界面支持获取模型列表）
- [ ] 确认透传的模型列表与上游 API 一致

---

## 五、错误路径验收

### 5.1 无效 API Key
- [ ] 配置 Chat 格式 Provider，填入错误的 API Key
- [ ] 发起对话
- [ ] 确认 CodeX 收到明确的错误提示（非客户端崩溃）
- [ ] 确认错误消息可读（不是原始 JSON 或乱码）

### 5.2 无法连接的 API 地址
- [ ] 配置 Chat 格式 Provider，填入不存在的 API 地址（如 `http://localhost:19999/v1`）
- [ ] 发起对话
- [ ] 确认 CodeX 收到连接错误提示
- [ ] 确认错误提示包含 `upstream_connection_error`

### 5.3 上游返回的 API 错误
- [ ] 使用一个会返回错误的模型名（如 `gpt-99999`）
- [ ] 发起对话
- [ ] 确认 CodeX 收到归一化的错误格式

---

## 六、多 Provider 兼容性验收

### 6.1 DeepSeek
- [ ] 配置 DeepSeek Chat API（`api.deepseek.com`）
- [ ] 选择 `deepseek-chat` 或 `deepseek-reasoner` 模型
- [ ] 设置 API 格式为 "Chat Completions"
- [ ] 发送 prompt，确认正常回复
- [ ] 如使用 reasoner 模型，确认推理内容正常

### 6.2 Kimi（月之暗面）
- [ ] 配置 Kimi API（`api.moonshot.cn` 或 Kimi 兼容地址）
- [ ] 选择 `kimi-latest` 或 `moonshot-v1-*` 模型
- [ ] 设置 API 格式为 "Chat Completions"
- [ ] 发送 prompt，确认正常回复

### 6.3 Qwen（通义千问）
- [ ] 配置 Qwen API（阿里云 DashScope 或兼容地址）
- [ ] 选择 `qwen-plus` 或 `qwen-max` 模型
- [ ] 设置 API 格式为 "Chat Completions"
- [ ] 发送 prompt，确认正常回复

### 6.4 GLM（智谱）
- [ ] 配置 GLM API（`open.bigmodel.cn`）
- [ ] 选择 `glm-4-plus` 或 `glm-4-flash` 模型
- [ ] 设置 API 格式为 "Chat Completions"
- [ ] 发送 prompt，确认正常回复

### 6.5 MiniMax
- [ ] 配置 MiniMax API（`api.minimax.chat`）
- [ ] 选择 `abab6.5s-chat` 或 `MiniMax-M1` 模型
- [ ] 设置 API 格式为 "Chat Completions"
- [ ] 发送 prompt，确认正常回复

---

## 七、边界条件验收

### 7.1 极长 prompt
- [ ] 发送一个较长的 prompt（如要求分析 500 行代码）
- [ ] 确认代理不超时（默认 5 分钟超时）
- [ ] 确认完整回复

### 7.2 特殊字符
- [ ] 发送包含特殊字符的 prompt：emoji、Unicode、Markdown 代码块
- [ ] 确认这些字符正确传递并返回

### 7.3 连续对话
- [ ] 使用同一 Chat 格式 Provider 连续发送 5 条消息
- [ ] 确认每条都能正常回复
- [ ] 确认代理端口没有泄漏（每次对话后端口正确释放）

---

## 验收结果汇总

| 类别 | 测试项数 | 通过 | 失败 | 备注 |
|------|---------|------|------|------|
| 一、UI 验收 | 3 | | | |
| 二、config.toml | 3 | | | |
| 三、代理生命周期 | 4 | | | |
| 四、协议转换 | 5 | | | |
| 五、错误路径 | 3 | | | |
| 六、多 Provider 兼容 | 5 | | | |
| 七、边界条件 | 3 | | | |
| **总计** | **26** | | | |

---

## 快速验收路径（最小化测试）

如果时间有限，至少完成以下 **7 项**：

1. ✅ 一.1.2 — Chat 格式选择 + 持久化
2. ✅ 二.2.1 — config.toml 生成 `wire_api` + `api_format`
3. ✅ 三.3.1 — Chat 格式代理启动日志
4. ✅ 三.3.2 — 代理端口释放日志
5. ✅ 四.4.2 — Chat 格式流式对话
6. ✅ 五.5.1 — 无效 API Key 错误处理
7. ✅ 六.6.1 — DeepSeek 真实 API 测试

---

## 调试指南

若验收失败，收集以下信息辅助排查：

### 查看代理日志
Electron 主进程控制台，搜索 `[codex-proxy]` 关键词。

### 查看请求/响应
在 `packages/agent/electron/codex/proxyServer.js` 的 `handleResponses` 函数中临时添加：
```js
console.log('[codex-proxy] chatBody:', JSON.stringify(chatBody, null, 2))
```

### 查看 CodeX CLI 错误
在 CodeX 会话中，查看终端输出的原始错误信息。

### 查看 config.toml
检查 `~/.codex/config.toml`（或项目级 `.codex/config.toml`）中的 `[model_providers.<name>]` section：
```toml
[model_providers."your-provider-name"]
name = "your-provider-name"
wire_api = "responses"
api_format = "chat"
base_url = "http://127.0.0.1:<port>/v1"
# ... 其他字段
```

### 手动测试代理
在代理运行期间，可用 curl 测试：
```bash
curl -X POST http://127.0.0.1:<port>/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","input":[{"role":"user","content":"hello"}],"stream":false}'
```
