// Electron 主进程轻量级 i18n —— 仅 ~30 条系统消息
let _locale = 'zh'

const MSG = {
  zh: {
    'claude.slow': 'Claude 响应较慢（可能在加载上下文或等待网络），请稍候…',
    'codex.slow': 'Codex 响应较慢，请稍候…',
    'codex.timeout': 'Codex 执行超时（10 分钟无响应），已自动中断。请重试。',
    'plan.rejected': '用户拒绝了计划',
    'perm.denied': '用户拒绝了本次工具权限请求',
    'perm.readonly': '当前权限策略为只读模式，已拒绝写入或执行类工具。',
    'maxSteps': '本轮对话已达到最大执行步数，已自动结束。请发送新消息继续对话（上下文将自动延续）。',
    'noCodex': '未检测到 Codex，请执行: npm install -g @openai/codex',
    'noApiKey': '未配置 API Key 或 Base URL',
    'codex.ended': 'Codex 会话异常结束：未收到完成事件，请重试。',
    'codex.error': 'Codex 异常：{error}',
    'compacting': '正在进行上下文压缩...',
    'aborted': '已中断',
    'dialog.selectExe': '选择 Claude Code 可执行文件',
    'dialog.selectFolder': '选择文件夹',
    'install.perm': '权限不足，请以管理员身份运行终端或使用 cmd 右键以管理员身份运行"',
    'install.noNpm': '未检测到 npm，请先安装 Node.js（https://nodejs.org）',
    'install.netErr': '网络连接失败，请检查网络或设置 npm 代理（npm config set proxy）',
    'install.disk': '磁盘空间不足，请清理后重试',
    'install.locked': '文件被占用，请关闭其他使用 Claude 的程序后重试',
    'install.inProgress': '正在安装中，请稍后重试',
    'skill.notFound': '未找到 skill: {name}',
    'skill.noSource': '该 skill 无安装源',
    'skill.noGit': '未检测到 git，请先安装 git 后再安装 Skill',
    'skill.noSourceDir': '源目录不存在: {path}',
    'skill.noSourceUrl': '该 skill 无安装源（GitHub URL）',
    'skill.mirrorFail': '镜像和直连均失败。\n镜像 ({mirror})…\n直连: {direct}',
    'skill.cloneFail': '镜像 clone 失败，回退直连',

    'api.invalidKey': 'API Key 无效，请检查是否填写正确',
    'api.quotaExceeded': '额度不足或请求过于频繁，请检查账号额度/限流配置',
    'api.unsupportedModel': '当前 Base URL 不支持所选模型，请更换模型或渠道',
    'api.serverUnavailable': '服务端暂时不可用，请稍后重试',
    'api.verifyFailed': '验证失败，请检查 Base URL、网络代理与模型配置',
    'api.noKey': '未配置 API Key（请在设置中配置 {provider} Provider）',

    'search.failed': '搜索失败',
    'send.failed': '发送失败：{error}',
    'claude.notInstalled': '未检测到系统安装的 Claude Code，请先执行安装',
    'claude.notInstalledHint': '请使用顶部"设置"按钮打开设置面板，点击"一键安装 Claude Code"',
    'claude.parseFailed': '解析失败',
    'claude.networkError': '网络错误',
    'claude.queryFailed': '查询失败',
    'claude.sessionTitle': '新对话',
  },
  en: {
    'claude.slow': 'Claude is responding slowly (loading context or waiting for network), please wait…',
    'codex.slow': 'Codex is responding slowly, please wait…',
    'codex.timeout': 'Codex execution timed out (10 min no response), automatically aborted. Please retry.',
    'plan.rejected': 'User rejected the plan',
    'perm.denied': 'User denied this tool permission request',
    'perm.readonly': 'Current permission policy is read-only. Write or execute tools are denied.',
    'maxSteps': 'This turn reached max execution steps and was ended. Send a new message to continue (context preserved).',
    'noCodex': 'Codex not detected. Run: npm install -g @openai/codex',
    'noApiKey': 'API Key or Base URL not configured',
    'codex.ended': 'Codex session ended abnormally: no completion event received. Please retry.',
    'codex.error': 'Codex error: {error}',
    'compacting': 'Compacting context…',
    'aborted': 'Aborted',
    'dialog.selectExe': 'Select Claude Code Executable',
    'dialog.selectFolder': 'Select Folder',
    'install.perm': 'Permission denied. Run terminal as administrator or use cmd right-click "Run as administrator"',
    'install.noNpm': 'npm not detected. Please install Node.js first (https://nodejs.org)',
    'install.netErr': 'Network connection failed. Check network or set npm proxy (npm config set proxy)',
    'install.disk': 'Insufficient disk space, clean up and retry',
    'install.locked': 'File is locked. Close other programs using Claude and retry',
    'install.inProgress': 'Installation already in progress, please wait',
    'skill.notFound': 'Skill not found: {name}',
    'skill.noSource': 'This skill has no installation source',
    'skill.noGit': 'git not detected. Please install git before installing skills',
    'skill.noSourceDir': 'Source directory does not exist: {path}',
    'skill.noSourceUrl': 'This skill has no installation source (GitHub URL)',
    'skill.mirrorFail': 'Both mirror and direct connection failed.\nMirror ({mirror})…\nDirect: {direct}',
    'skill.cloneFail': 'Mirror clone failed, falling back to direct connection',

    'api.invalidKey': 'Invalid API Key. Please check and try again',
    'api.quotaExceeded': 'Quota exceeded or rate limited. Check your account balance/rate limits',
    'api.unsupportedModel': 'Current Base URL does not support this model. Switch model or provider',
    'api.serverUnavailable': 'Server temporarily unavailable. Please try again later',
    'api.verifyFailed': 'Verification failed. Check Base URL, network proxy, and model config',
    'api.noKey': 'API Key not configured (please set up {provider} Provider in settings)',

    'search.failed': 'Search failed',
    'send.failed': 'Send failed: {error}',
    'claude.notInstalled': 'Claude Code not detected. Please install it first',
    'claude.notInstalledHint': 'Open Settings panel via the top "Settings" button and click "One-Click Install Claude Code"',
    'claude.parseFailed': 'Parse failed',
    'claude.networkError': 'Network error',
    'claude.queryFailed': 'Query failed',
    'claude.sessionTitle': 'New Chat',
  },
}

function setLocale(loc) {
  if (loc === 'zh' || loc === 'en') _locale = loc
}
function getLocale() { return _locale }

function t(key, params) {
  let msg = MSG[_locale]?.[key] || MSG.zh[key] || key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, v)
    }
  }
  return msg
}

module.exports = { setLocale, getLocale, t }
