# 首页（Home Page）

## 概述

Home 页是 MindCraft-Agent 的启动面板，路径为 `/main/home`。首次启动时自动进入，后续启动根据路由记忆跳转到上次访问的页面。点击左上角 Logo 可随时返回首页。

## 页面结构

```
┌───────────────────────────────────────────────────────┐
│  欢迎使用 MindCraft                                     │
├────────────────────────┬──────────────────────────────┤
│  </>  开始项目对话      │  📄  浏览文档                 │
│                        │                              │
│  [Claude Code]         │  有历史: 最近3个文档列表       │
│  mindcraft-agent       │  .md  修复缓存计算  2小时前    │
│  ~/work/mindcraft-a..  │  .pdf 架构设计      昨天      │
│  修复缓存 · 2小时前     │  .md  CLAUDE.md    3天前      │
│                        │                              │
│  [进入项目]     →      │  无历史: 格式图标 + 功能说明   │
│                        │  [MD][PDF][DOCX][XLSX]        │
│                        │  打开本地文件夹，浏览文档       │
│                        │                              │
│                        │  [浏览文档]     →             │
├────────────────────────┴──────────────────────────────┤
│  用量统计                               [7天|30天]     │
│  输入 125K    输出 8.9K    缓存 45K                     │
│  📊 堆叠柱状图（输入/输出/缓存三色分段）                 │
└───────────────────────────────────────────────────────┘
```

- 卡片区域约占 40vh，分为 head（图标+标题）/ body（预览内容）/ foot（操作入口）三区
- 项目卡片：显示 agent 标签、项目名、工作路径、最近对话+时间；无项目时显示图形化空状态
- 文档卡片：有打开历史时显示最近 3 个文档（扩展名+文件名+相对时间）；无历史时显示支持的格式图标+功能说明

## 路由逻辑

| 场景 | 行为 |
|------|------|
| 首次启动（无路由记忆） | `/` → `/main/home` |
| 再次启动（有路由记忆） | `/` → 上次访问的路径 |
| 点击 Logo | → `/main/home` |
| 点击"项目"导航 | → `/main/codeHub` |
| keep-alive | 不缓存（每次进入刷新数据） |

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/views/Home.vue` | 主页面组件：双卡片（~40vh）+ 用量统计布局 |
| `src/components/Home/TokenChart.vue` | ECharts 堆叠柱状图（单柱内输入/输出/缓存三色分段） |
| `src/components/Home/useHomeData.js` | 数据层 composable：IPC 调用、localStorage 文档历史、格式化工具 |
| `packages/agent/electron/homeMetrics.js` | 主进程 IPC：JSONL 扫描、Token 聚合、最近项目检测 |
| `src/components/mdViewer/index.vue` | 打开文档时写 localStorage `mindcraft_agent_recent_docs` |

## IPC 接口

| Channel | 方向 | 用途 |
|---------|------|------|
| `home-get-recent-project` | renderer → main | 读取 panel-state JSON，返回最近会话摘要 |
| `home-get-today-stats` | renderer → main | 扫描当日 JSONL 文件，返回 Token 用量 |
| `home-get-token-trend` | renderer → main | 扫描 N 天 JSONL，返回每日聚合数组 |

## 数据来源

### 今日用量 & 趋势

扫描 `~/.claude/projects/` (Claude) 和 `~/.codex/sessions/` (Codex) 中的 JSONL 文件：

- **Claude**: 解析 `type: "assistant"` + `stop_reason` → `message.usage`
- **Codex**: 解析 `type: "event_msg"` + `payload.type: "token_count"` → `info.total_token_usage`

缓存策略：按文件 mtime 缓存 JSONL 行，仅重解析变更文件。

### 趋势图数据计算（方案A）

`cache_read_input_tokens` 是 `input_tokens` 的子集，两者不能叠加，否则缓存占比虚高掩盖其他数据。

```
新处理输入 = input_tokens - cache_read_input_tokens  （含 cache_creation，价格相当于输入）
缓存命中   = cache_read_input_tokens                  （纯缓存读取）
输出       = output_tokens                            （不变）
```

- Codex 的 `cached_input_tokens` 语义等价于 Claude 的 `cache_read_input_tokens`，统一处理。
- 今日统计中"缓存"数字仅显示缓存命中数（cacheReadTokens），不含 cache_creation。
- 已去掉"费用"统计（按 API 标准费率估算不准确，意义有限）。

### 最近项目

读取 `<userData>/claude-panel-state.json` 和 `~/.codex/codex-panel-state.json`，取 `updatedAt` 最新的会话。

### 最近文档

mdViewer 打开文件时自动写 `localStorage` key `mindcraft_agent_recent_docs`：
```json
[{ "name": "README.md", "filePath": "/path/README.md", "ext": "md", "openedAt": 1234567890 }, ...]
```
最多保存 5 条，按 filePath 去重。Home 页直接读取显示最近 3 条。

## 主题适配

所有样式使用 `--cc-*` CSS 变量，天然支持 dark/light/blue/brown 四种主题：

| 变量 | 用途 |
|------|------|
| `--cc-bg-secondary` | 页面背景 |
| `--cc-bg-elevated` | 卡片/面板背景 |
| `--cc-text` | 主文字 |
| `--cc-text-muted` | 次级文字 |
| `--cc-primary` | 主题色（按钮、图标、hover边框） |
| `--cc-border` | 边框 |
| `--cc-primary-bg` | 主题色浅底（图标背景） |
