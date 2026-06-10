更新内容:
1. 修复 ClaudeCode 切换部分历史 session 时可能直接卡死的问题，处理有序列表渲染中的死循环与连续段落归属错误
2. 新增 ClaudeCode 会话卡死诊断能力，可按需开启主进程分段落盘日志，定位 session 读取与 metrics 计算卡在哪一步
3. 诊断日志归属 MindCraft 自身配置与 userData 目录，不再写入 Claude 的 settings.json，默认关闭并限制日志文件大小
