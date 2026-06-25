# Token 使用统计优化 — 归档说明

> 状态：已归档，停止作为执行方案使用。
> 原生成时间：2026-06-24
> 当前主文档：`docs/token-metrics.md`

这份文件最初用于记录 T144-T146 的早期调研：实时 token 增长、per-turn token 标注、首页 metrics 统计 BUG。

后续排查已经证明，问题不是单个字段或单个 UI 组件可以彻底修好的点状 bug，而是 token metrics 领域模型没有收口：

- ClaudeCode 同时存在 SDK live usage、result usage、JSONL poll 三条来源。
- CodeX 同时存在 token_count、turn.completed usage、JSONL history 三条来源。
- StatusBar、message footer、history restore、homeMetrics 曾经各自解释 `input/cache/output`。
- ClaudeCode 的 JSONL poll 缺少稳定 turn identity，继续直接写 current-turn `in/out/cache` 会引发 cache 漂移。

因此本文件中的任务编号、方案 A/B、字段口径和旧优先级已经过时。后续开发以 `docs/token-metrics.md` 为唯一主线：

- `docs/token-metrics.md` §0：统一 UI 语义。
- `docs/token-metrics.md` §7：架构收口方向。
- `docs/token-metrics.md` §8：ClaudeCode cache 漂移定位与可执行重构方案。

历史引用保留此文件路径，仅用于说明早期背景；不要继续在这里追加实现方案。
