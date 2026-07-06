MindCraft-Agent v1.1.4 更新日志

代码与工程优化
- Provider 存储架构升级：所有写入统一走 DB，旧版格式（legacy）降级为只读兼容回退
- 系统导入路径精简，移除冗余 legacy 投影代码
