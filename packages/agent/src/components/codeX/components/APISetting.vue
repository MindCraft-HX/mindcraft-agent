<template>
  <div>
    <ConfirmDialog ref="confirmDialogRef" />
    <ProviderForm
      :visible="showProviderForm"
      :provider="currentProvider"
      :is-new="editingNewProvider"
      @save="handleProviderFormSave"
      @close="handleProviderFormClose"
    />
    <div v-if="embedded || showSettings" class="settings-overlay" :class="{ 'settings-overlay--embedded': embedded }">
      <div class="settings-panel">
        <div v-if="!embedded" class="settings-header">
          <span>设置</span>
          <button class="settings-close" @click="closeSettings">×</button>
        </div>

        <!-- 权限策略 -->
        <div class="theme-row">
          <span class="theme-label">权限</span>
          <div class="theme-options">
            <button
              v-for="p in codexConfigStore.policies"
              :key="p.value"
              class="theme-option permission-option"
              :class="{ active: codexConfigStore.permissionPolicy === p.value }"
              :title="p.desc"
              @click="codexConfigStore.setPermissionPolicy(p.value); showPermissionToast(p)"
            >
              <span class="theme-text">{{ p.label }}</span>
            </button>
          </div>
        </div>

        <!-- 默认网络访问 -->
        <div class="theme-row">
          <span class="theme-label">默认网络</span>
          <div class="theme-options">
            <button
              type="button"
              class="mini-toggle"
              :class="{ active: codexConfigStore.defaultNetworkAccess }"
              @click="codexConfigStore.setDefaultNetworkAccess(!codexConfigStore.defaultNetworkAccess)"
              title="新会话是否默认允许网络访问"
            >
              <span class="mini-toggle-knob"></span>
            </button>
            <span class="toggle-hint">{{ codexConfigStore.defaultNetworkAccess ? '允许联网' : '禁止联网' }}</span>
          </div>
        </div>

        <!-- 默认网页搜索 -->
        <div class="theme-row">
          <span class="theme-label">默认搜索</span>
          <div class="theme-options">
            <select
              :value="codexConfigStore.defaultWebSearch"
              class="mode-select"
              @change="codexConfigStore.setDefaultWebSearch($event.target.value)"
            >
              <option v-for="o in codexConfigStore.webSearchOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>

        <!-- 环境状态栏 -->
        <div class="env-status-bar">
          <template v-if="envChecking">
            <div class="env-row env-row-loading">
              <span class="env-item checking"><span class="env-spinner"></span>Node 检测中…</span>
              <span class="env-item checking"><span class="env-spinner"></span>npm 检测中…</span>
              <span class="env-item checking"><span class="env-spinner"></span>Codex 检测中…</span>
            </div>
          </template>
          <template v-else-if="envStatus">
            <div class="env-row">
              <span class="env-item" :class="envStatus.node?.installed ? 'ok' : 'warn'">
                <span class="env-dot"></span>
                Node {{ envStatus.node?.installed ? envStatus.node.version : '未安装' }}
              </span>
              <span class="env-item" :class="envStatus.npm?.installed ? 'ok' : 'warn'">
                <span class="env-dot"></span>
                npm {{ envStatus.npm?.installed ? envStatus.npm.version : '未安装' }}
              </span>
              <span class="env-item" :class="envStatus.codex?.installed ? 'ok' : 'err'">
                <span class="env-dot"></span>
                Codex {{ envStatus.codex?.installed ? (envStatus.codex.version ? `v${envStatus.codex.version.split(/\s/)[0].replace(/^v/, '')}` : '已安装') : '未安装' }}
              </span>
              <button v-if="envStatus.codex?.installed"
                class="env-update-btn" :class="{ updating: envCheckingUpdate }"
                @click="checkForUpdate"
                title="检查更新">{{ envCheckingUpdate ? '检查中…' : envUpdateAvailable ? `更新至 v${envLatestVersion}` : '检查更新' }}</button>
              <span v-if="envUpdateAvailable" class="env-update-badge">有新版本</span>
              <button v-if="!envStatus.codex?.installed"
                class="env-install-btn"
                :disabled="envInstalling || !envStatus.npm?.installed || !envStatus.node?.installed"
                @click="installCodex"
              >{{ envInstalling ? '安装中…' : '一键安装' }}</button>
              <button class="env-refresh-btn" @click="checkEnvironment" title="重新检测">↻</button>
            </div>
            <div v-if="envStatus.codex?.installed && envStatus.codex.path" class="env-path-hint">
              路径: {{ envStatus.codex.path }}
            </div>
          </template>
          <template v-else>
            <span class="env-item err">检测失败,点击重试</span>
            <button class="env-refresh-btn" @click="checkEnvironment" title="重新检测">↻</button>
          </template>
        </div>

        <!-- 主题 -->
        <!-- 配置列表 -->
        <div class="settings-main">
          <div class="sp-left">
            <div class="sp-list-header">配置列表</div>
            <div class="sp-list">
              <div v-for="(p, i) in settingsForm.providers" :key="i"
                class="sp-item" :class="{ active: settingsForm.selectedIdx === i, inuse: settingsForm.activeIdx === i }"
                @click="selectProvider(i)">
                <div class="sp-item-avatar">{{ providerAvatar(p) }}</div>
                <div class="sp-item-info">
                  <div class="sp-item-name">{{ p.name || 'default' }}</div>
                  <div class="sp-item-url">{{ p.model || '' }}</div>
                </div>
                <div class="sp-item-actions">
                  <span v-if="settingsForm.activeIdx === i" class="sp-inuse-badge">使用中</span>
                  <button v-else class="sp-item-btn use" @click.stop="activateProviderByIdx(i)" title="使用此配置">
                    <svg width="10" height="10" viewBox="0 0 12 12"><polygon points="3,2 10,6 3,10" fill="currentColor"/></svg>
                    启用
                  </button>
                  <button class="sp-item-btn edit" @click.stop="editProviderByIdx(i)" title="编辑">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 10 L2 8 L8 2 L10 4 L4 10 Z" stroke="currentColor" stroke-width="1" fill="none"/></svg>
                    编辑
                  </button>
                  <button class="sp-item-btn copy" @click.stop="copyProvider(i)" title="复制">
                    <svg width="10" height="10" viewBox="0 0 12 12"><rect x="4" y="4" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none" rx="1"/><path d="M2 8 L2 2 L8 2" stroke="currentColor" stroke-width="1" fill="none"/></svg>
                    复制
                  </button>
                  <button class="sp-item-btn import" @click.stop="importFromFile(i)" title="用配置文件覆盖此条配置">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1 L6 9 M3 6 L6 9 L9 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 9 L1 11 L11 11 L11 9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
                    导入
                  </button>
                  <button class="sp-item-btn validate" @click.stop="validateProviderByIdx(i)" :disabled="validatingIdx === i" title="验证 Key">
                    <svg v-if="validatingIdx !== i" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <span v-else class="sp-validating-dot"></span>
                    {{ validatingIdx === i ? '验证中' : '验证' }}
                  </button>
                  <button class="sp-item-btn del" @click.stop="removeProvider(i)" title="删除">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.5"/></svg>
                    删除
                  </button>
                </div>
              </div>
            </div>
            <button class="sp-add-btn" @click="addProvider">+ 添加</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useCodexConfigStore } from '../../../stores/codexConfig.js'
import ProviderForm from './ProviderForm.vue'
import ConfirmDialog from '../../agentCommon/components/ConfirmDialog.vue'

const confirmDialogRef = ref(null)
const codexConfigStore = useCodexConfigStore()

const showSettings = ref(false)
const showProviderForm = ref(false)
const editingNewProvider = ref(false)
const envStatus = ref(null)
const envChecking = ref(false)
const envInstalling = ref(false)
const envCheckingUpdate = ref(false)
const envUpdateAvailable = ref(false)
const envLatestVersion = ref('')
const validatingIdx = ref(-1)
const settingsForm = ref({ providers: [], selectedIdx: -1, activeIdx: -1 })
const currentProvider = ref(null)

defineProps({ embedded: { type: Boolean, default: false } })
const emit = defineEmits(['providerActivated'])

async function checkEnvironment() {
  envChecking.value = true
  try {
    const res = await window.electronAPI?.codexCheckEnvironment?.()
    envStatus.value = res || null
  } catch (e) {
    envStatus.value = { node: { installed: false, version: null }, npm: { installed: false, version: null }, codex: { installed: false, path: null } }
  } finally { envChecking.value = false }
}

async function installCodex() {
  envInstalling.value = true
  try {
    const result = await window.electronAPI?.codexInstallCodex?.()
    if (result?.success) {
      await checkEnvironment()
      const ver = envStatus.value?.codex?.version
      if (ver) {
        ElMessage.success(`Codex 安装成功 v${ver.replace(/^v/, '').split(/\s/)[0]}`)
      } else {
        ElMessage.success('Codex 安装成功，点击 ↻ 刷新版本')
      }
    } else {
      ElMessage.error(result?.message || '安装失败')
    }
  } catch (e) {
    ElMessage.error('安装失败: ' + (e?.message || e))
  } finally { envInstalling.value = false }
}

async function checkForUpdate() {
  envCheckingUpdate.value = true
  try {
    const env = await window.electronAPI?.codexCheckEnvironment?.()
    if (!env?.codex?.installed || !env?.codex?.version) {
      ElMessage.warning('请先安装 Codex')
      return
    }
    const res = await window.electronAPI?.codexCheckLatestVersion?.()
    if (!res?.ok || !res.version) {
      ElMessage.error('查询最新版本失败: ' + (res?.error || ''))
      return
    }
    const localVer = env.codex.version.replace(/^v/, '').split(/\s/)[0].trim()
    const latestVer = res.version
    if (localVer === latestVer) {
      ElMessage.success(`已是最新版本 (v${latestVer})`)
      envUpdateAvailable.value = false
    } else {
      envUpdateAvailable.value = true
      envLatestVersion.value = latestVer
      const ok = await confirmDialogRef.value?.open({
        message: `发现 Codex 新版本 v${latestVer}，当前版本 v${localVer}\n\n是否立即更新？`,
        okText: '立即更新',
        cancelText: '稍后',
      })
      if (ok) {
        ElMessage.info('正在更新 Codex…')
        const result = await window.electronAPI?.codexInstallCodex?.()
        if (result?.success) {
          await checkEnvironment()
          envUpdateAvailable.value = false
          envLatestVersion.value = ''
          const newVer = envStatus.value?.codex?.version
          if (newVer) {
            const shortVer = newVer.replace(/^v/, '').split(/\s/)[0]
            ElMessage.success(`Codex 已更新至 v${shortVer}`)
          } else {
            ElMessage.success('Codex 更新完成，点击 ↻ 刷新版本')
          }
        } else {
          ElMessage.error('更新失败: ' + (result?.message || '未知错误'))
        }
      }
    }
  } catch (e) {
    ElMessage.error('检查更新失败: ' + (e?.message || e))
  } finally {
    envCheckingUpdate.value = false
  }
}

function openSettings() {
  editingNewProvider.value = false
  showSettings.value = true
  loadProviders()
  codexConfigStore.loadPermissionPolicy()
  codexConfigStore.loadDefaultNetworkAccess()
  codexConfigStore.loadDefaultWebSearch()
  // 环境检测不阻塞面板打开（execSync 可能很慢）
  checkEnvironment()
}

function showPermissionToast(p) {
  ElMessage.success(`权限策略已设为「${p.label}」，仅对新创建的会话生效`)
}

defineExpose({ openSettings })

async function loadProviders() {
  try {
    const stored = await window.electronAPI?.codexGetProviders?.()
    if (stored && stored.providers?.length) {
      settingsForm.value.providers = stored.providers
      settingsForm.value.activeIdx = stored.activeIdx >= 0 ? stored.activeIdx : 0
      settingsForm.value.selectedIdx = settingsForm.value.activeIdx
    } else {
      // 默认从 runtime config 读取
      const key = await window.electronAPI?.codexGetKey?.() || ''
      const url = await window.electronAPI?.codexGetBaseURL?.() || ''
      const model = await window.electronAPI?.codexGetModel?.() || ''
      const reasoningEffort = await window.electronAPI?.codexGetReasoningEffort?.() || ''
      settingsForm.value.providers = [{
        name: 'default',
        key, url, model, reasoningEffort,
        authJson: key ? { OPENAI_API_KEY: key } : {},
        tomlText: buildDefaultToml(model, url, reasoningEffort),
      }]
      settingsForm.value.activeIdx = 0
      settingsForm.value.selectedIdx = 0
    }
  } catch (e) {
    settingsForm.value.providers = []
    settingsForm.value.activeIdx = -1
    settingsForm.value.selectedIdx = -1
  }
}

function buildDefaultToml(model, url, reasoningEffort = '') {
  const effortLine = reasoningEffort ? `model_reasoning_effort = "${reasoningEffort}"\n` : ''
  return `${effortLine}model = "${model}"
model_provider = "mindcraft"

[model_providers.mindcraft]
name = "mindcraft"
base_url = "${url}"
env_key = "OPENAI_API_KEY"`
}

function selectProvider(i) {
  if (settingsForm.value.selectedIdx === i) return
  settingsForm.value.selectedIdx = i
  editingNewProvider.value = false
}

function providerAvatar(p) {
  return (p?.name || 'D')[0].toUpperCase()
}

async function applyProvider(idx) {
  const p = settingsForm.value.providers[idx]
  if (!p) return
  try {
    // 写入 auth.json 和 config.toml 到 ~/.codex/
    // 用 JSON 序列化剥离 Vue 响应式代理
    await window.electronAPI?.codexWriteAuthJson?.(JSON.parse(JSON.stringify(p.authJson || {})))
    if (p.tomlText) {
      // 合并写入：只替换模型配置部分，保留磁盘上其余内容（trust/mcp_servers 等）
      const mergedToml = await mergeTomlModelConfig(p.tomlText)
      await window.electronAPI?.codexWriteConfigToml?.(mergedToml)
    }
    // 更新 runtime config
    await window.electronAPI?.codexSetKey?.(p.key || '')
    await window.electronAPI?.codexSetBaseURL?.(p.url || '')
    await window.electronAPI?.codexSetModel?.(p.model || '')
    await window.electronAPI?.codexSetReasoningEffort?.(p.reasoningEffort || '')
    return true
  } catch (e) {
    ElMessage.error('保存配置失败: ' + (e?.message || '未知错误'))
    return false
  }
}

/** 将 provider 的模型配置合并到当前磁盘 config.toml，保留其余内容 */
async function mergeTomlModelConfig(providerToml) {
  try {
    const current = await window.electronAPI?.codexReadConfigToml?.() || ''
    if (!current) return providerToml  // 文件不存在，直接用 provider 的

    // 从 provider toml 提取模型相关字段（model / model_provider / model_reasoning_effort / [model_providers.*] 段）
    const modelBlock = extractTomlModelBlock(providerToml)

    // 从当前文件移除旧的模型相关段，得到「其余内容」
    const rest = removeTomlModelBlock(current)

    // 合并：新模型配置 + 其余内容
    return modelBlock.trimEnd() + '\n\n' + rest.trimStart()
  } catch (_) {
    return providerToml  // 出错降级：直接用 provider 的
  }
}

/** 从 TOML 文本中提取模型相关区块（顶层 model 字段 + [model_providers.*] 段） */
function extractTomlModelBlock(toml) {
  const lines = toml.split('\n')
  const out = []
  let inModelProviders = false
  for (const line of lines) {
    const t = line.trim()
    if (/^\[model_providers\./.test(t)) { inModelProviders = true; out.push(line); continue }
    if (inModelProviders && /^\[/.test(t) && !/^\[model_providers\./.test(t)) { inModelProviders = false }
    if (inModelProviders) { out.push(line); continue }
    // 顶层模型字段
    if (/^(model|model_provider|model_reasoning_effort)\s*=/.test(t)) { out.push(line) }
  }
  return out.join('\n')
}

/** 从 TOML 文本中移除模型相关区块，返回其余内容 */
function removeTomlModelBlock(toml) {
  const lines = toml.split('\n')
  const out = []
  let skip = false
  for (const line of lines) {
    const t = line.trim()
    if (/^\[model_providers\./.test(t)) { skip = true; continue }
    if (skip && /^\[/.test(t) && !/^\[model_providers\./.test(t)) { skip = false }
    if (skip) continue
    if (/^(model|model_provider|model_reasoning_effort)\s*=/.test(t)) continue
    out.push(line)
  }
  return out.join('\n')
}

async function activateProviderByIdx(i) {
  selectProvider(i)
  settingsForm.value.activeIdx = i
  const ok = await applyProvider(i)
  if (ok) {
    await persistProviders()
    emit('providerActivated')
    ElMessage.success('已切换配置')
  }
}

async function validateProviderByIdx(i) {
  selectProvider(i)
  const p = settingsForm.value.providers[i]
  if (!p) return
  validatingIdx.value = i
  const start = Date.now()
  try {
    const res = await window.electronAPI?.codexValidateKey?.(p.key || '', p.url || '', p.model || '')
    const elapsed = Date.now() - start
    if (res?.valid) {
      ElMessage.success(`${p.name || '未命名'} 验证通过 (${elapsed}ms)`)
    } else {
      ElMessage.error(res?.error || '验证失败')
    }
  } catch (e) {
    ElMessage.error(`验证失败: ${e?.message || '未知错误'}`)
  } finally {
    validatingIdx.value = -1
  }
}

async function persistProviders() {
  try {
    await window.electronAPI?.codexSetProviders?.({
      providers: JSON.parse(JSON.stringify(settingsForm.value.providers)),
      activeIdx: settingsForm.value.activeIdx,
    })
  } catch (e) { console.warn('[codexSetProviders]', e) }
}

async function editProviderByIdx(i) {
  selectProvider(i)
  editingNewProvider.value = false
  const p = settingsForm.value.providers[i]
  // 从磁盘读取最新 config.toml，避免覆盖 CLI/SDK 写入的 trust 等条目
  if (p) {
    try {
      const latest = await window.electronAPI?.codexReadConfigToml?.()
      if (latest) p.tomlText = latest
    } catch (_) {}
  }
  currentProvider.value = p ?? null
  showProviderForm.value = true
}

async function addProvider() {
  // 从磁盘读取当前 config.toml 作为初始模板，保留已有配置（trust 等）
  let latestToml = ''
  try { latestToml = await window.electronAPI?.codexReadConfigToml?.() || '' } catch (_) {}
  const p = { name: '', key: '', url: '', model: '', reasoningEffort: '', authJson: {}, tomlText: latestToml || buildDefaultToml('', '', '') }
  settingsForm.value.providers.push(p)
  settingsForm.value.selectedIdx = settingsForm.value.providers.length - 1
  editingNewProvider.value = true
  currentProvider.value = p
  showProviderForm.value = true
}

async function copyProvider(i) {
  const src = settingsForm.value.providers[i]
  const copy = JSON.parse(JSON.stringify(src))
  copy.name = (copy.name || '未命名') + ' (副本)'
  settingsForm.value.providers.splice(i + 1, 0, copy)
  await persistProviders()
}

/** 简易 TOML key=value 提取（仅解析 CodeX config.toml 所需字段） */
function extractTomlFields(tomlText) {
  const result = { auth_token: '', base_url: '', model: '', reasoning_effort: '' }
  if (!tomlText) return result
  let inSection = false
  for (const rawLine of tomlText.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim()
    if (!line || line.startsWith('#')) continue
    if (/^\[.*\]$/.test(line)) { inSection = true; continue }
    const m = line.match(/^([a-z_]+)\s*=\s*"([^"]*)"\s*$/i)
    if (!m) continue
    const key = m[1].toLowerCase()
    const val = m[2]
    if (!inSection) {
      if (key === 'auth_token') result.auth_token = val
      else if (key === 'model') result.model = val
      else if (key === 'model_reasoning_effort' || key === 'reasoning_effort') result.reasoning_effort = val
    }
    if (key === 'base_url') result.base_url = val
  }
  return result
}

async function importFromFile(i) {
  const name = settingsForm.value.providers[i]?.name || '未命名'
  const ok = await confirmDialogRef.value?.open({
    message: `用配置文件覆盖「${name}」？

将读取 ~/.codex/config.toml 中的当前运行配置，
覆盖此条记录的名称、Key、URL、模型等字段。

此操作不可撤销，是否继续？`,
  })
  if (!ok) return
  try {
    const tomlText = await window.electronAPI?.codexReadConfigToml?.()
    if (!tomlText) { ElMessage.warning('未找到 config.toml 或文件为空'); return }
    const fields = extractTomlFields(tomlText)
    if (!fields.auth_token && !fields.base_url) { ElMessage.warning('配置文件中未找到 auth_token 或 base_url'); return }
    const p = settingsForm.value.providers[i]
    p.key = fields.auth_token
    p.url = fields.base_url
    p.model = fields.model
    p.reasoningEffort = fields.reasoning_effort
    p.authJson = fields.auth_token ? { OPENAI_API_KEY: fields.auth_token } : {}
    p.tomlText = tomlText
    await persistProviders()
    ElMessage.success(`已用配置文件覆盖「${p.name || '未命名'}」`)
  } catch (e) {
    ElMessage.error('导入失败：' + (e?.message || e))
  }
}

async function removeProvider(i) {
  if (i < 0 || i >= settingsForm.value.providers.length) return
  settingsForm.value.providers.splice(i, 1)
  const last = settingsForm.value.providers.length - 1
  if (!settingsForm.value.providers.length) {
    settingsForm.value.activeIdx = -1
    settingsForm.value.selectedIdx = -1
  } else {
    settingsForm.value.selectedIdx = Math.min(i, last)
    if (settingsForm.value.activeIdx === i) {
      settingsForm.value.activeIdx = Math.min(i, last)
      await applyProvider(settingsForm.value.activeIdx)
    } else if (settingsForm.value.activeIdx > i) {
      settingsForm.value.activeIdx -= 1
    }
  }
  await persistProviders()
}

async function handleProviderFormSave(payload) {
  const p = payload.provider
  const idx = settingsForm.value.selectedIdx
  if (editingNewProvider.value) {
    if (idx >= 0 && idx < settingsForm.value.providers.length) {
      settingsForm.value.providers.splice(idx, 1, p)
    } else {
      settingsForm.value.providers.push(p)
      settingsForm.value.selectedIdx = settingsForm.value.providers.length - 1
    }
    if (settingsForm.value.activeIdx < 0) settingsForm.value.activeIdx = settingsForm.value.selectedIdx
    editingNewProvider.value = false
  } else if (idx >= 0 && idx < settingsForm.value.providers.length) {
    settingsForm.value.providers.splice(idx, 1, p)
  }
  if (settingsForm.value.selectedIdx === settingsForm.value.activeIdx) {
    const ok = await applyProvider(settingsForm.value.activeIdx)
    if (ok) emit('providerActivated')
  }
  await persistProviders()
  showProviderForm.value = false
  currentProvider.value = null
  ElMessage.success('已保存')
}

function handleProviderFormClose() {
  if (editingNewProvider.value) {
    const idx = settingsForm.value.selectedIdx
    if (idx >= 0 && idx < settingsForm.value.providers.length) {
      const target = settingsForm.value.providers[idx]
      if (!target?.key && !target?.url && !target?.name) {
        settingsForm.value.providers.splice(idx, 1)
        const last = settingsForm.value.providers.length - 1
        settingsForm.value.selectedIdx = Math.min(idx, last)
        if (settingsForm.value.activeIdx > last) settingsForm.value.activeIdx = last
      }
    }
    editingNewProvider.value = false
  }
  showProviderForm.value = false
  currentProvider.value = null
}

function closeSettings() {
  editingNewProvider.value = false
  currentProvider.value = null
  showProviderForm.value = false
  showSettings.value = false
}
</script>

<style lang="scss" scoped>
.settings-overlay {
  position: fixed; inset: 0; background: var(--cc-overlay-bg);
  z-index: 200; display: flex; align-items: center; justify-content: center;
}
.settings-overlay--embedded {
  position: relative; background: transparent; z-index: auto;
}
.settings-panel {
  width: 650px; background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border);
  border-radius: 12px; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px var(--cc-shadow); overflow: hidden; max-height: 80vh;
}
.settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--cc-border);
  font-size: 13px; font-weight: 600; color: var(--cc-text); flex-shrink: 0;
}
.env-status-bar {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 16px; background: var(--cc-bg-tertiary); border-bottom: 1px solid var(--cc-border);
  font-size: 12px; flex-shrink: 0;
}
.env-row-loading .env-item.checking {
  opacity: 0.7; color: var(--cc-text-dim);
  animation: env-pulse 1.2s ease-in-out infinite;
}
.env-row-loading .env-item.checking:nth-child(2) { animation-delay: 0.15s; }
.env-row-loading .env-item.checking:nth-child(3) { animation-delay: 0.3s; }
@keyframes env-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.85; }
}
.env-spinner {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: env-spin 0.7s linear infinite;
  flex-shrink: 0; margin-right: 2px;
}
@keyframes env-spin { to { transform: rotate(360deg); } }
.env-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.env-path-hint { font-size: 11px; color: var(--cc-text-dim); }
.env-item {
  display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px;
  &.ok { color: var(--cc-success); background: var(--cc-success-bg); }
  &.warn { color: var(--cc-warning); background: var(--cc-warning-bg); }
  &.err { color: var(--cc-error); background: var(--cc-error-bg); }
}
.env-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.env-install-btn {
  padding: 2px 8px; border-radius: 4px; border: 1px solid var(--cc-info);
  background: transparent; color: var(--cc-info); font-size: 11px; cursor: pointer;
  &:disabled { opacity: .45; cursor: not-allowed; }
  &:not(:disabled):hover { background: var(--cc-info-bg); }
}
.env-update-btn {
  padding: 2px 8px; border-radius: 4px; border: 1px solid var(--cc-success-border);
  background: transparent; color: var(--cc-success); font-size: 11px; cursor: pointer;
  &:hover { background: var(--cc-success-bg); }
  &.updating { opacity: .5; cursor: not-allowed; }
}
.env-update-badge {
  padding: 1px 6px; border-radius: 3px; background: var(--cc-warning-bg);
  color: var(--cc-warning); font-size: 10px; font-weight: 600;
}
.env-refresh-btn {
  margin-left: auto; background: none; border: none; color: var(--cc-text-dim);
  font-size: 14px; cursor: pointer; padding: 0 4px;
  &:hover { color: var(--cc-text-muted); }
}
.settings-close {
  width: 24px; height: 24px; border-radius: 50%; background: none;
  border: none; color: var(--cc-text-dim); font-size: 18px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.settings-close:hover { background: var(--cc-bg-hover); color: var(--cc-text); }
.theme-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid var(--cc-border); flex-shrink: 0;
}
.theme-label { font-size: 12px; color: var(--cc-text-dim); font-weight: 500; white-space: nowrap; }
.theme-options { display: flex; gap: 6px; }
.theme-option {
  display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 6px;
  border: 1px solid var(--cc-border-strong); background: var(--cc-bg-elevated);
  color: var(--cc-text-muted); font-size: 12px; cursor: pointer; transition: all 0.15s;
  &:hover {
    border-color: var(--cc-border-hover); color: var(--cc-text-secondary);
    background: var(--cc-bg-hover);
  }
  &.active {
    border-color: var(--cc-primary); color: var(--cc-text);
    background: var(--cc-primary-bg); box-shadow: 0 0 0 1px var(--cc-primary-border);
  }
}
.theme-icon { flex-shrink: 0; opacity: 0.7; }
.theme-option.active .theme-icon { opacity: 1; }
.theme-text { line-height: 1; }
.settings-main {
  display: flex; flex: 1; overflow: hidden; min-height: 0;
}
.sp-left {
  width: 100%; display: flex; flex-direction: column; overflow: hidden;
}
.sp-list-header {
  padding: 12px 12px 6px; font-size: 12px; color: var(--cc-text-dim); font-weight: 600;
  flex-shrink: 0; border-top: 1px solid var(--cc-border-light);
}
.sp-list {
  flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 3px;
}
.sp-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px;
  border-radius: 6px; cursor: pointer; border: 1px solid transparent;
  transition: background 0.12s;
}
.sp-item:hover { background: var(--cc-bg-elevated); }
.sp-item.active { background: var(--cc-bg-elevated); border-color: var(--cc-primary); }
.sp-item-avatar {
  width: 26px; height: 26px; border-radius: 6px; background: var(--cc-bg-hover);
  color: var(--cc-text-muted); font-size: 12px; font-weight: 600; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.sp-item.inuse .sp-item-avatar { background: var(--cc-primary-bg); color: var(--cc-primary); }
.sp-item-info { flex: 1; min-width: 0; }
.sp-item-name { font-size: 12px; color: var(--cc-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-item-url { font-size: 10px; color: var(--cc-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.sp-inuse-badge {
  font-size: 10px; color: var(--cc-primary); flex-shrink: 0; height: 20px; padding: 0 6px;
  border-radius: 3px; background: var(--cc-primary-bg); border: 1px solid var(--cc-primary-border);
  display: flex; align-items: center;
}
.sp-item-actions { display: flex; gap: 2px; flex-shrink: 0; }
.sp-item-btn {
  height: 20px; border-radius: 3px; border: none; background: transparent;
  color: var(--cc-text-dim); cursor: pointer; display: flex; align-items: center; gap: 2px;
  padding: 0 4px; font-size: 10px;
}
.sp-item-btn:hover:not(:disabled) { background: var(--cc-bg-hover); color: var(--cc-text-secondary); }
.sp-item-btn.edit:hover:not(:disabled) { color: var(--cc-primary); }
.sp-item-btn.use:hover:not(:disabled) { color: var(--cc-info); }
.sp-item-btn.del:hover:not(:disabled) { color: var(--cc-error); }
.sp-item-btn.validate:hover:not(:disabled) { color: var(--cc-success); }
.sp-item-btn.validate:disabled { opacity: .5; cursor: not-allowed; }
.sp-validating-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.sp-add-btn {
  margin: 6px; padding: 6px; border-radius: 6px; background: none;
  border: 1px dashed var(--cc-border); color: var(--cc-text-dim); cursor: pointer; font-size: 11px;
  transition: border-color 0.12s, color 0.12s;
}
.sp-add-btn:hover { border-color: var(--cc-primary); color: var(--cc-primary); }
.permission-option.active {
  border-color: var(--cc-primary); background: var(--cc-primary-bg);
  box-shadow: 0 0 0 1px var(--cc-primary-border);
}

/* 默认网络/搜索行 */
.mini-toggle {
  width: 32px; height: 18px; border-radius: 9px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-tertiary);
  cursor: pointer; padding: 0; position: relative;
  transition: background 0.15s, border-color 0.15s; flex-shrink: 0;
}
.mini-toggle.active {
  background: var(--cc-primary); border-color: var(--cc-primary);
}
.mini-toggle-knob {
  position: absolute; top: 1px; left: 1px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; transition: transform 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.mini-toggle.active .mini-toggle-knob { transform: translateX(14px); }
.toggle-hint {
  font-size: 11px; color: var(--cc-text-dim); line-height: 1;
}
.mode-select {
  height: 24px; min-width: 80px; border-radius: 5px;
  border: 1px solid var(--cc-border-strong); background: var(--cc-bg-secondary);
  color: var(--cc-text-secondary); font-size: 11px;
  padding: 0 18px 0 6px; outline: none; cursor: pointer;
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--cc-text-dim) 50%), linear-gradient(135deg, var(--cc-text-dim) 50%, transparent 50%);
  background-position: calc(100% - 8px) calc(50% - 1px), calc(100% - 4px) calc(50% - 1px);
  background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; flex-shrink: 0;
}
.mode-select:hover { border-color: var(--cc-border-hover); }
.mode-select:focus { border-color: var(--cc-border-focus); }

/* 自动压缩窗口 */
.compact-window-input {
  width: 120px; padding: 4px 8px; background: var(--cc-input-bg); color: var(--cc-text-primary);
  border: 1px solid var(--cc-border-light); border-radius: 4px; font-size: 12px; margin-right: 6px;
}
.compact-window-input:focus { border-color: var(--cc-primary); }
.compact-window-input::placeholder { color: var(--cc-text-dim); font-size: 11px; }
.compact-save-btn {
  padding: 4px 10px; background: var(--cc-primary); color: #fff; border: none;
  border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;
}
.compact-save-btn:hover { background: var(--cc-primary-hover); }
.compact-reset-btn {
  padding: 4px 10px; background: transparent; color: var(--cc-text-dim);
  border: 1px solid var(--cc-border-light); border-radius: 4px; cursor: pointer; font-size: 11px;
}
.compact-reset-btn:hover { border-color: var(--cc-border-focus); color: var(--cc-text); }
</style>
