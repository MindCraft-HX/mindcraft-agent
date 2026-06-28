# 人工验收清单 — R01-R08 重构

> 2026-06-28 · 对应提交 `00c751c`
> 验收后请在每项打 ✅ 或 ❌，❌ 项注明现象。

---

## 一、快速冒烟（5 分钟）

| # | 检查项 | 预期 | 结果 |
|---|--------|------|------|
| 1 | `npm run dev` 启动正常 | Electron 窗口打开，无白屏 | |
| 2 | ClaudeCode 页面可输入消息并收到回复 | 流式输出正常，不卡死 | |
| 3 | CodeX 页面可输入消息并收到回复 | 同上 | |
| 4 | 两个 Agent 之间切 tab 不崩溃 | 切换流畅，无报错 | |
| 5 | 关闭窗口 → 系统托盘图标存在 | 托盘图标可见，右键菜单正常 | |
| 6 | 托盘"打开"可恢复窗口 | 窗口恢复 | |

---

## 二、命令行验证

```bash
# 合约测试（必须 154 pass / 0 fail）
npm run test:contract

# 全量测试
npm run test:all

# 构建（不应有 error）
npm run build
```

| # | 检查项 | 预期 | 结果 |
|---|--------|------|------|
| 7 | `npm run test:contract` | 154 pass, 0 fail | |
| 8 | `npm run build` | 无 error，三阶段均 ✓ built | |
| 9 | `npm run test:all` | 全通过 | |

---

## 三、新模块功能验收

### 3.1 Config / Environment 提取

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 10 | CodeX API Key 读取 | 打开 CodeX 页面，查看是否正常读取 `~/.codex/config.toml` 中的 key | 不报 "apiKey not found" | |
| 11 | CodeX provider 切换 | 在设置中切换 CodeX provider | 切换后下次 query 使用新 provider | |
| 12 | CodeX sandbox 模式 | 设置 → CodeX → sandbox 模式切换 | read-only / workspace-write / danger-full-access 可切换 | |
| 13 | Claude 系统路径探测 | 首次打开 ClaudeCode 页面 | 控制台无 `findSystemClaude error` | |
| 14 | Claude 安装/更新 | 设置 → 安装 Claude Code CLI | 进度正常，完成后可 query | |
| 15 | CodeX 安装/更新 | 设置 → 安装 CodeX CLI | 同上 | |

### 3.2 Theme 持久化

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 16 | 切换主题后重启 | 设置 → 换主题 → 完全退出 → 重新打开 | 主题保持切换后的值 | |
| 17 | 非法主题不回写 | 检查 `%APPDATA%/mindcraft-agent/theme.json` | theme 值在 dark/light/blue/brown 范围内 | |

### 3.3 系统托盘

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 18 | 托盘"设置" | 托盘右键 → 设置 | 窗口恢复并打开设置页 | |
| 19 | 托盘"退出" | 托盘右键 → 退出 | 应用完全退出 | |

---

## 四、回归检查（重点：改动过的文件）

### 4.1 Settings 读写

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 20 | Claude API Key 设置 | 设置 → Claude → 输入 key → 保存 | 保存成功，重启后仍存在 | |
| 21 | CodeX API Key 设置 | 设置 → CodeX → 输入 key → 保存 | 同上 | |
| 22 | Effort level 设置 | Claude 设置 → effort level 切换 | 切换后 query 使用新 effort | |
| 23 | Reasoning effort 设置 | CodeX 设置 → reasoning effort | 同上 | |

### 4.2 Session / History

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 24 | Claude 历史会话列表 | ClaudeCode → 历史 tab | 列表正常加载，可点击 | |
| 25 | Claude 历史会话恢复 | 点击某个历史会话 | 加载对话内容，不白屏 | |
| 26 | CodeX 历史会话列表 | CodeX → 历史 tab | 同上 | |
| 27 | CodeX 历史会话恢复 | 点击某个历史会话 | 同上 | |
| 28 | 删除会话 | 历史列表 → 删除某个会话 | 删除成功，列表刷新 | |
| 29 | 重命名会话 | 历史列表 → 重命名 | 新名称生效 | |

### 4.3 Skills / Plugins

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 30 | Claude Skills 列表 | ClaudeCode → Skills tab | 已安装 skills 正常显示 | |
| 31 | Claude 安装 Skill | Skills market → 安装一个 | 安装成功 | |
| 32 | CodeX Skills 列表 | CodeX → Skills tab | 同上 | |
| 33 | CodeX 安装 Skill | 同上 | 同上 | |

### 4.4 Metrics / Token 统计

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 34 | Claude 单次 query 后 token 统计 | 发一条消息，等待完成 | 状态栏显示 token 数（非 0） | |
| 35 | CodeX 单次 query 后 token 统计 | 同上 | 同上 | |
| 36 | Token Chart 页面 | 首页 → 查看图表 | 图表正常渲染 | |

---

## 五、边界情况

| # | 检查项 | 操作 | 预期 | 结果 |
|---|--------|------|------|------|
| 37 | 无网络时打开应用 | 断网 → 启动 | 不崩溃，首页正常显示 | |
| 38 | CodeX 未安装时 query | 卸载 codex CLI → CodeX 页面发消息 | 提示安装，不崩溃 | |
| 39 | Claude 未安装时 query | 同上 | 提示安装，不崩溃 | |
| 40 | 窗口拖拽不卡顿 | 拖拽窗口边缘改变大小 | 无明显卡顿/闪烁 | |
| 41 | DevTools 可打开 | `Ctrl+Shift+I` | DevTools 弹出 | |
| 42 | 外部链接跳转 | 点击 markdown 中的 http 链接 | 外部浏览器打开 | |

---

## 六、文件结构确认

| # | 检查项 | 预期 | 结果 |
|---|--------|------|------|
| 43 | `packages/agent/shared/` 目录存在 | ipcChannels.js + logger.js | |
| 44 | `packages/agent/electron/codex/configManager.js` 存在 | 278 行 | |
| 45 | `packages/agent/electron/codex/environment.js` 存在 | 102 行 | |
| 46 | `packages/agent/electron/claude/environment.js` 存在 | 196 行 | |
| 47 | `packages/agent/electron/agentProtocolBridge.js` 存在 | 22 行 | |
| 48 | `electron/themeStore.js` 存在 | 44 行 | |
| 49 | `electron/tray.js` 存在 | 47 行 | |
| 50 | `tests/run-contract-tests.cjs` 存在 | 103 行 | |

---

## 验收结论

- [ ] **通过** — 所有项目 ✅，可合并
- [ ] **有条件通过** — 少量 ❌ 但非关键路径，注明问题后合并
- [ ] **不通过** — 关键功能 ❌，需修复后重新验收

> 验收人：___________  日期：___________  备注：___________
