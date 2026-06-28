# 会话指令缓存分析

## 结论

这份优化方向值得做，但原方案里有一个关键前提需要修正：

- **每轮重新构建同一段字符串，不会天然破坏 prefix cache。**
- Anthropic prefix cache 关注的是最终发送给模型的前缀字节是否稳定。
- 真正会破坏缓存的是最终 `systemPrompt` 中出现动态内容，例如附件文件内容变化、memory 文件变化、plan/system 片段变化，或者拼接顺序/空白发生变化。

因此，ClaudeCode 的优化应当按 **session snapshot** 做，而不是按“每轮重新算指纹，指纹相同就复用”的普通 memoization 做。普通 memoization 可以减少磁盘 I/O，但不能保证“像 CLAUDE.md 一样，session 内 prompt 字节稳定”。

CodeX 的“一次性首条消息注入”不建议直接做。它能减少重复 token，但会把会话指令的遵循效果交给模型记忆，遇到长上下文、压缩、恢复、分支继续时容易漂移。除非确认 CodeX SDK/CLI 有稳定的 system/instructions 注入入口，否则不要把现有“每轮显式前缀”直接替换成首轮注入。

## 背景

用户反馈：开启会话指令功能后，ClaudeCode 使用成本上升，且 prompt 缓存（prefix cache）命中不稳定。用户期望会话指令更像 `CLAUDE.md` / `AGENTS.md`：在一个 provider session 内保持稳定，而不是每轮都可能随文件变化。

## 当前实现

### ClaudeCode 路径

代码路径：`packages/agent/electron/claudeAgent.js`

```text
claudeCode/index.vue (renderer)
  -> loadSessionInstructionForTab(tab)
  -> IPC: claude-agent-query({ ..., sessionInstruction })
      -> claudeAgent.js (main)
          -> buildSessionInstructionPrompt(sessionInstruction)
              -> buildFullInstructionPrompt(instruction)
                  -> resolveAttachments(attachments)
                      -> fs.statSync / fs.readFileSync
          -> systemPrompt = [
               buildSystemPrompt(cwd),
               sessionInstructionPrompt,
               plan mode text,
               claudeMemory.buildMemoryPrompt(cwd)  // injectMode === 'system' 时
             ].join('\n')
          -> query({ systemPrompt, resume })
```

会话指令目前进入 Claude 的 `systemPrompt`。这条路径是正确方向，但风险在于：

- 附件内容每轮从磁盘重新读取，文件变化会改变 `systemPrompt`。
- `claudeMemory.buildMemoryPrompt(cwd)` 也会每轮读取 memory，memory 变化会改变 `systemPrompt`。
- 如果期望行为是“session 内稳定”，那么只靠每轮重建或 mtime 指纹不足以表达这个产品语义。

### CodeX 路径

代码路径：`packages/agent/src/components/codeX/index.vue`

```text
codeX/index.vue (renderer)
  -> prependSessionInstruction(prompt, instruction)
      -> buildSessionInstructionPrompt(instruction)
      -> return `${block}\n\n用户当前请求：\n${prompt}`
  -> IPC: codex-agent-query({ prompt: finalPrompt })
      -> codexAgent.js (main)
          -> thread.runStreamed([{ type: 'text', text: prompt }])
```

CodeX 目前把会话指令作为每条 user message 的前缀。缺点是 token 重复；优点是每轮都显式约束模型，不依赖模型自己记住第一轮指令。

## 对原方案的评估

### ClaudeCode：原 P0 草案不要原样执行

原草案建议按 `sessionId -> { fingerprint, text }` 缓存，并把附件路径和 `mtimeMs` 放进 fingerprint。

这个实现只能减少附件读取和字符串构建成本，不能保证 prefix cache 稳定：

- 如果附件变了，fingerprint 会变，下一轮仍会生成不同的 `systemPrompt`。
- 如果 memory 变了，即使会话指令缓存命中，最终 `systemPrompt` 仍会变。
- 如果产品语义是“像 CLAUDE.md 一样 session 内稳定”，就不应该让附件 mtime 在每轮自动影响 prompt。

推荐改为 **session snapshot**：

- 在 provider session 首次发送时，把会话指令内容、启用附件的文件内容、附件缺失/读取错误状态构建成一个固定 prompt block。
- 后续同一 provider session 复用这段 block，不因磁盘文件变化而自动改变。
- 用户保存/切换/禁用会话指令后，不要静默改写已在运行的 provider session；可以从下一轮新 session 生效，或明确提示“当前会话将使用更新后的快照”并重建 snapshot。
- 如果要提供“刷新当前会话指令”的能力，必须把它当作显式用户动作，因为这会改变 prefix cache 前缀。

### CodeX：原 P1 草案风险较高

原草案建议只在首条 user message 注入一次会话指令。

这不建议作为默认行为：

- CodeX 当前没有确认可用的 SDK `instructions` / system context 注入入口。
- 首轮注入依赖模型在后续 turn 中持续记住指令，和当前“每轮显式前缀”的行为不等价。
- compact summary 是上下文恢复信息，会话指令是持续约束，两者语义不同。
- 长会话、compact、resume、分支继续后，首轮指令可能被弱化或丢失。

CodeX 可以单独优化，但应先验证 SDK/CLI 是否存在官方 system/instructions 注入方式。没有稳定入口前，保持每轮显式前缀更可靠。

## 推荐实现方案

### P0：ClaudeCode 会话指令 snapshot

目标：让会话指令在同一 provider session 内字节稳定，行为接近 `CLAUDE.md`。

建议实现：

1. 在主进程维护 `chatKey` 或 provider session 维度的 `sessionInstructionSnapshot`。
2. 首次发送时构建完整 prompt block，包括指令文本和附件内容。
3. 后续同一 provider session 直接复用 snapshot 文本。
4. 新建 session、用户显式刷新、或会话指令保存后进入新 provider session 时再重建。
5. snapshot key 不建议包含附件 `mtimeMs`，否则附件变化会自动破坏稳定性。
6. 如果仍要支持“附件每轮读取最新内容”，那就要接受 prefix cache 不稳定，并在 UI/文档中明确这是 tradeoff。

需要同步更新的产品文案：

- 当前文案如果写着“发送前读取附件最新内容”，就和 snapshot 语义冲突。
- 改成“附件会在会话指令应用到会话时读取并固定；修改附件后需刷新/新建会话才生效”。

### P1：调试日志验证 systemPrompt 稳定性

在 debug flag 下记录最终 `systemPrompt` 的 SHA256，而不是常驻输出完整 prompt。

建议：

```js
const hash = crypto.createHash('sha256').update(systemPrompt, 'utf8').digest('hex').slice(0, 12)
debugLog('[claude] systemPrompt.sha256', { sessionId, chatKey, hash })
```

注意：

- 不要打印 prompt 原文，避免泄漏用户内容和密钥。
- 日志必须受 debug 开关控制。
- 用这个 hash 验证同一 provider session 多轮是否稳定。

### P1：单独处理 Claude memory

`claudeMemory.buildMemoryPrompt(cwd)` 是独立的 cache 变量源。即使会话指令 snapshot 做对了，memory 变化仍可能改变 `systemPrompt`。

可选策略：

- 保持现状，但在文档和验收中说明：memory 更新会导致 prefix cache 失效。
- 或对 memory 也做 session snapshot，让它在同一 provider session 内稳定。

如果目标是最大化 prefix cache 命中，memory 也应按 snapshot 处理。否则只能保证“会话指令本身不再引入额外不稳定”。

### P2：CodeX 后续探索

先查本地 SDK 类型和实际运行能力：

- `node_modules/@openai/codex-sdk/dist/index.d.ts`
- `CodexOptions.config`
- `thread.runStreamed` / thread options 是否支持 instructions/system prompt

如果没有官方入口，不建议改为首轮注入。可以先保留现状，并把“CodeX 每轮重复注入带来 token 开销”登记为后续优化。

## 验证方案

### ClaudeCode 自动/调试验证

1. 开启 debug hash 日志。
2. 同一 Claude provider session 连续发送 3 轮。
3. 会话指令纯文本不变时，`systemPrompt.sha256` 应保持一致。
4. 带附件时，发送前修改附件文件；如果采用 snapshot，hash 仍应保持一致。
5. 用户显式刷新或新建 provider session 后，hash 可以变化。

### 缓存指标验证

已有指标可观察：

- `cacheReadTokens > 0` 表示有缓存读取。
- `cacheReadTokens === 0` 且不是首轮，说明该轮没有命中 prefix cache。

建议对比：

1. 关闭会话指令，连续 3 轮。
2. 开启纯文本会话指令，连续 3 轮。
3. 开启带附件会话指令，连续 3 轮。
4. 开启带附件会话指令，第二轮前修改附件，再发送。

采用 snapshot 后，第 4 组不应因为附件修改导致同一 provider session 的 hash 改变。

### 人工验收重点

- 会话指令启用后，ClaudeCode 首轮行为正确读取指令和附件。
- 同一 session 后续轮次仍遵循指令。
- 修改附件后，当前 session 是否立即生效要和产品文案一致。
- 新建 session 或显式刷新后，附件修改能生效。
- 关闭会话指令后，新 session 不再携带旧 snapshot。
- Debug hash 不输出 prompt 原文。

## 已确认事实

1. `claudeMemory.buildMemoryPrompt` 每轮读取 memory 文件，memory 变化会改变 `systemPrompt`。
2. Claude usage 已映射 `cache_read_input_tokens`，可以从 `cacheReadTokens` 观察缓存命中。
3. cost 计算已区分 cache read，缓存命中后应能从成本变化上看到收益。

## 给执行方的简短建议

优先实现 ClaudeCode session snapshot 和 debug hash。不要按原草案做 mtime fingerprint 自动刷新，也不要直接把 CodeX 改成首轮注入。CodeX 等确认官方 system/instructions 注入入口后再做。
