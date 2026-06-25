# Codex `turn.failed` 诊断采集

用于排查“同 provider / 同模型，只有特定 thread 失败”的问题。先做失败/成功对照，不先改逻辑。

## 日志位置

- 汇总日志：`{userData}/diagnostics/codex-turn-diagnostics.log`
- 单轮证据目录：`{userData}/diagnostics/codex-turns/<diagnosticId>/`

每轮会写结构化 JSONL 摘要；失败轮和成功轮都会记，便于做 diff。

## 已采集字段

主进程侧：

- `sessionId`
- `runId`
- `cliSessionId`
- `model`
- `baseURL`
- `apiFormat`
- `reasoningEffort`
- 是否 resume、前后 fingerprint
- 本地终止事件摘要：`turn.completed` / `turn.failed` / `thread.error`
- cleanup 时本地判定：`resultReceived` / `doneSent` / `doneReason` / `turnTimedOut`

proxy 侧：

- 原始 Responses 请求体
- 转发给上游的最终 Chat 请求体
- 原始 `input[]` 摘要
- 最终 `messages[]` 摘要
- 工具调用 / reasoning 摘要
- 上游 HTTP status / content-type
- SSE 事件数、chunk 数、是否空流
- 上游原始 SSE 全文

## 推荐排查顺序

1. 复现失败 thread，记下对应 `diagnosticId`。
2. 再跑一个同 provider / 同模型的成功空白 thread，拿另一个 `diagnosticId`。
3. 对比两个目录中的：
   - `proxy-original-request.json`
   - `proxy-final-chat-request.json`
   - `proxy-upstream-sse-attempt-*.sse.txt`
   - `main-cleanup-summary.json`
4. 优先看这些差异：
   - `messages` 数量是否明显更大
   - 是否带 `assistant.tool_calls`
   - 是否有 `tool` 消息
   - 是否有 `reasoning_content`
   - role 顺序是否异常
   - 是否有空 content / 空 arguments / 空 output
   - 是否复用了坏 thread
5. 如果上游 SSE 正常但本地仍失败，回查 `main-cleanup-summary.json` 和 `turn.terminal-event` / `turn.error-event`。

## 判断口径

- 新 thread 成功、老 thread 失败：先查历史污染 / resume 污染。
- 上游 200 + 空 SSE：先查该 thread 历史与最终转发体。
- 上游 4xx/5xx：先查最终转发请求是否合法。
- 上游 SSE 正常、本地仍失败：先查本地状态机和终止判定。
