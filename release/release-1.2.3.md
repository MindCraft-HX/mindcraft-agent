MindCraft-Agent v1.2.3 更新日志

问题修复
- 修复 Claude Code settings.json 中 model 字段写入 tier 名（如 sonnet）而非实际模型 ID 的严重 BUG，导致用户自定义 tier 模型（ANTHROPIC_DEFAULT_SONNET_MODEL 等）被 SDK 内部映射覆盖失效
- 修复 5 处从 settings.json model 字段反向推导 tier 的遗留路径，统一改用 confGet 或 env 反向匹配
- 修复 APISetting 中 4 处将 tier 名当作模型 ID 写入的假设

功能改进
- selectedTier 存储改为持久化到 settingsFacade 而非依赖 settings.json model 字段推导，消除 tier 名与实际模型 ID 的语义混淆
