# Streaming 期间全链路卡顿 — 诊断与方案

> 日期：2026-07-09
> 状态：✅ P0+P1 已完成，P2/P3 暂缓
> 触发：用户反馈"有其他 session 在运行中整个应用都卡，特别有 diff 块的时候"

## 0. 执行状态

| 任务 | 状态 | 说明 |
|------|------|------|
| P0 主进程 git 异步化 | ✅ 已完成 | file_change 先发后补 preview |
| P1 ToolWrite computed 瘦身 | ✅ 已完成 | computed 只读，parse 只走 idle |
| P2 JSON.stringify / 数组拷贝 | ⏸️ 暂缓 | 真问题但当前不混改 |
| P3 saveHistory 双 clone | ⏸️ 暂缓 | 已由 debounce 限制频率 |

## 1. CodeX 审核结论

> "P0 是确认问题，不是猜测。P1 也成立。P2/P3 降级为后续微优化。"

### 修法要点

```
P0 — 主进程：
  file_change 先原样 safeSend 给 renderer，不等 git preview
  后台异步生成 preview，execFileSync → execFile
  preview 完成后用同一 call_id 发 item.updated/completed
  并发 ≤2，单文件 500ms timeout，超时 → _noDiffReason: 'preview_timeout'
  前端 mergeFileChangePreview() 吃延迟到达的 preview

P1 — 渲染进程：
  ToolWrite computed 只读 fc.diffLines / _diffHunks，不同步 parse unified_diff
  parseUnifiedDiff() 只在 mounted/expanded/preview 到达时通过 idle 写入 fc.diffLines
  去掉或收窄 watch(() => props.msg.text)
  openModal() 可保留同步兜底（用户主动点击）
```

---

## 2. P0 实施方案：主进程 file_change preview 异步化

### 现状

```js
// codexAgent.js — streaming 路径
normalizeFileChangeItemPreviews(forwardItem, resolvedCwd)
// → codexFileChangePreview.js — 每个 change 同步 git
//   → execFileSync('git', ['diff', '--', rel])     100-500ms
//   → execFileSync('git', ['diff', '--cached', '--', rel])
//   → execFileSync('git', ['check-ignore', rel])
//   → execFileSync('git', ['ls-files', '--error-unmatch', rel])
```

### 目标

```
file_change 事件先推送给 renderer（changes 有 path/operation 但无 diff preview）
后台并发（≤2）异步生成 git diff preview
preview 就绪后追加更新同一 tool item
超时/失败 → _noDiffReason
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `codexFileChangePreview.js` | 新增 `generateFileChangePreviewsAsync(changes, cwd, callId)` — 异步版，并发限制、超时、错误降级 |
| `codexAgent.js` | streaming 路径：先发原样 item → 异步调 preview → 补发 item.updated |

### 验收

- streaming 期间主进程无 >100ms 阻塞
- 有 file_change 时输入框仍能打字
- file_change 卡片先出现，diff preview 可延迟补上
- preview 超时/失败显示"无 diff 预览"
- 新文件/修改文件/ignored 文件/二进制文件都不崩

---

## 3. P1 实施方案：ToolWrite 不再同步 parse diff

### 现状

```js
// effectiveDiffLines computed — 同步 parse
if (fc.unified_diff) return parseUnifiedDiff(fc.unified_diff)

// renderFileChanges computed — 同步 parse
_renderDiffLines: computeFileChangeDiffsSync(fc)

// watch — 每 streaming chunk 触发
watch(() => props.msg.text, () => { computeDiff(); computeFileChangeDiffs() })
```

### 目标

```
computed 只读 fc.diffLines / _diffHunks，不 parse
parseUnifiedDiff() 只在 idle/mounted/expanded 时通过 requestIdleCallback 写入
删掉 watch(() => props.msg.text)
openModal() 保留同步兜底
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `codeX/.../tools/ToolWrite.vue` | effectiveDiffLines/ renderFileChanges 只读；删 msg.text watcher；收窄通知触发 |

### 验收

- streaming 期间 file_change 卡片不触发同步 diff parse
- diff 通过 idle callback 异步填充
- 点击 expand/弹窗仍能正常显示 diff
- 历史 session 恢复后 diff 正常

---

## 4. 历史上下文：已经做过什么

| 时间 | 任务 | 做了什么 | 和本次问题的关系 |
|------|------|----------|------------------|
| 6/18 | P0-1 | git diff `execSync` → async `execFile`（`/diff` 命令路径） | 只改了 `/diff` 命令，**漏了 `codexFileChangePreview.js` streaming 路径** |
| 6/18 | P3-3 | `_fileChanges` deep watcher → 签名监听 | 改了 watcher，没管 computed |
| 6/30 | 行内 diff | `buildDiffLines` → `buildDiffLinesEnhanced` | 新算法更重，sync computed 里更贵 |
| 7/4 | T176 | history tool 折叠 + bash 懒挂载 | 首屏优化，不涉及 streaming |
| 7/5 | T179 P3 | v-memo + renderContent 缓存 + useStreamingText | 覆盖 assistant 文本，不覆盖 ToolWrite |
| 7/5 | T181 | activation chain governance | 切 tab 优化，不涉及 streaming |

**T176 结论回顾**："renderContent / computed 缓存方向已被探针证伪" — 探针只测了 `renderContent()`，**没测 ToolWrite diff 解析，没测主进程 streaming 路径**。

---

## 5. 为什么之前没发现

- **P0**: 6/18 P0-1 修了 `/diff` 命令，但 `codexFileChangePreview.js` 是不同的代码路径，被遗漏
- **P1**: T176 探针只测 `renderContent()`，ToolWrite 在盲区；6/18 P3-3 改 watcher 没管 computed
- **P2/P3**: T179 的 v-memo + throttle 覆盖了 assistant 文本，tool message 走不同的渲染路径
