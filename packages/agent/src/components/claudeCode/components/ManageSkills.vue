<template>
  <div v-if="visible" class="mp-overlay" @click.self="close">
    <div class="mp-panel">
      <!-- 标题栏 -->
      <div class="mp-header">
        <span class="mp-title">{{ $t('agent.skillsTitle') }}</span>
        <button class="mp-close" @click="close">×</button>
      </div>

      <!-- Tab 栏 -->
      <div class="mp-tabs">
        <button
          class="mp-tab"
          :class="{ active: activeTab === 'recommended' }"
          @click="activeTab = 'recommended'"
        >{{ $t('agent.recommend') }}</button>
        <button
          class="mp-tab"
          :class="{ active: activeTab === 'community' }"
          @click="switchToCommunity"
        >{{ $t('agent.communityTab') }}</button>
      </div>

      <div class="mp-body">
        <!-- ============= 推荐 Tab ============= -->
        <template v-if="activeTab === 'recommended'">
          <div class="mp-search-row">
            <input
              v-model="searchQuery"
              class="mp-search"
              :placeholder="$t('agent.searchSkills')"
              autofocus
              @keyup.enter="searchRecommended"
            />
            <button class="mp-btn mp-btn-install" :disabled="recSearchLoading" @click="searchRecommended">
              {{ recSearchLoading ? $t('agent.searching') : $t('agent.search') }}
            </button>
          </div>

          <div v-if="recSearchError" class="mp-empty market-error">
            {{ recSearchError }}
            <button class="mp-btn mp-btn-link" @click="searchRecommended">{{ $t('common.retry') }}</button>
          </div>

          <!-- 安装进度条 -->
          <div v-if="installProgress" class="mp-progress-row">
            <div class="mp-progress-bar">
              <div class="mp-progress-fill" :style="{ width: (installProgress.percent || 0) + '%' }"></div>
            </div>
            <span class="mp-progress-text">{{ installProgress.fallback ? $t('agent.mirrorFailedSpace') : '' }}{{ installProgress.percent || 0 }}%</span>
          </div>
          <div v-if="loading" class="mp-empty">{{ $t('chat.loading') }}</div>
          <template v-else>
            <!-- INSTALLED 分组 -->
            <div v-if="installedSkills.length" class="mp-group">
              <div class="mp-group-label">{{ $t('agent.installedN', { n: installedSkills.length }) }}</div>
              <div class="mp-list">
                <template v-for="skill in installedSkills" :key="skill.name">
                  <div class="mp-item installed">
                    <div class="mp-item-icon">
                      <span class="mp-item-icon-default">⚡</span>
                    </div>
                    <div class="mp-item-info">
                      <div class="mp-item-name">
                        {{ skill.displayName || skill.name }}
                        <span v-if="skill.scope" class="mp-scope-badge" :class="skill.scope">
                          {{ skill.scope === 'system' ? $t('agent.userScope') : $t('agent.projectScope') }}
                        </span>
                      </div>
                      <div class="mp-item-desc">{{ skill.description }}</div>
                      <div class="mp-item-meta">
                        <span class="mp-item-author">{{ skill.author }}</span>
                        <span v-if="skill.category !== 'unknown'" class="mp-item-tag">{{ skill.category }}</span>
                      </div>
                    </div>
                    <div class="mp-item-actions">
                      <button
                        class="mp-btn-link"
                        @click="toggleDetail(skill)"
                        :title="expandedSkill === skill.name ? $t('agent.collapseDetail') : $t('agent.expandDetail')"
                      >{{ expandedSkill === skill.name ? $t('agent.collapse') : $t('agent.detail') }}</button>
                      <button
                        class="mp-btn mp-btn-uninstall"
                        :disabled="skill._busy"
                        @click="uninstallSkill(skill)"
                        :title="$t('agent.uninstall')"
                      >{{ skill._busy ? '…' : $t('agent.uninstall') }}</button>
                    </div>
                  </div>
                  <!-- 内嵌详情面板 -->
                  <div v-if="expandedSkill === skill.name" class="mp-detail-panel">
                    <div class="mp-detail-content">
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.description') }}</div>
                        <div class="mp-detail-text">{{ skill.description || $t('agent.noDescription') }}</div>
                      </div>
                      <div class="mp-detail-row">
                        <div class="mp-detail-section">
                          <div class="mp-detail-label">{{ $t('agent.author') }}</div>
                          <div class="mp-detail-text">{{ skill.author }}</div>
                        </div>
                        <div class="mp-detail-section">
                          <div class="mp-detail-label">{{ $t('agent.category') }}</div>
                          <div class="mp-detail-text">{{ skill.category !== 'unknown' ? skill.category : $t('agent.uncategorized') }}</div>
                        </div>
                      </div>
                      <div v-if="skill.tags && skill.tags.length" class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.tags') }}</div>
                        <div class="mp-detail-tags">
                          <span v-for="tag in skill.tags" :key="tag" class="mp-detail-tag">{{ tag }}</span>
                        </div>
                      </div>
                      <div v-if="skill.sourceUrl" class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.sourceUrl') }}</div>
                        <a :href="skill.sourceUrl" target="_blank" class="mp-detail-link" @click.stop>{{ skill.sourceUrl }}</a>
                      </div>
                      <div v-if="skill.gitUrl" class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.github') }}</div>
                        <a :href="skill.gitUrl" target="_blank" class="mp-detail-link" @click.stop>{{ skill.gitUrl }}</a>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- AVAILABLE 分组 -->
            <div v-if="availableSkills.length" class="mp-group">
              <div class="mp-group-label">{{ $t('agent.marketplaceN', { n: availableSkills.length }) }}</div>
              <div class="mp-list">
                <template v-for="skill in availableSkills" :key="skill.name">
                  <div class="mp-item">
                    <div class="mp-item-icon">
                      <span class="mp-item-icon-default">⚡</span>
                    </div>
                    <div class="mp-item-info">
                      <div class="mp-item-name">{{ skill.displayName || skill.name }}</div>
                      <div class="mp-item-desc">{{ skill.description }}</div>
                      <div class="mp-item-meta">
                        <span class="mp-item-author">{{ skill.author }}</span>
                        <span v-if="skill.category !== 'unknown'" class="mp-item-tag">{{ skill.category }}</span>
                      </div>
                    </div>
                    <div class="mp-item-actions">
                      <select v-model="installScope" class="mp-scope-select" :title="$t('agent.installScope')">
                        <option value="system">{{ $t('agent.userScope') }}</option>
                        <option value="project">{{ $t('agent.projectScope') }}</option>
                      </select>
                      <button
                        class="mp-btn-link"
                        @click="toggleDetail(skill)"
                        :title="expandedSkill === skill.name ? $t('agent.collapseDetail') : $t('agent.expandDetail')"
                      >{{ expandedSkill === skill.name ? $t('agent.collapse') : $t('agent.detail') }}</button>
                      <button
                        class="mp-btn mp-btn-install"
                        :disabled="skill._busy"
                        @click="installSkill(skill)"
                      >{{ skill._busy ? '…' : $t('agent.install') }}</button>
                    </div>
                  </div>
                  <!-- 内嵌详情面板 -->
                  <div v-if="expandedSkill === skill.name" class="mp-detail-panel">
                    <div class="mp-detail-content">
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.description') }}</div>
                        <div class="mp-detail-text">{{ skill.description || $t('agent.noDescription') }}</div>
                      </div>
                      <div class="mp-detail-row">
                        <div class="mp-detail-section">
                          <div class="mp-detail-label">{{ $t('agent.author') }}</div>
                          <div class="mp-detail-text">{{ skill.author }}</div>
                        </div>
                        <div class="mp-detail-section">
                          <div class="mp-detail-label">{{ $t('agent.category') }}</div>
                          <div class="mp-detail-text">{{ skill.category !== 'unknown' ? skill.category : $t('agent.uncategorized') }}</div>
                        </div>
                      </div>
                      <div v-if="skill.tags && skill.tags.length" class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.tags') }}</div>
                        <div class="mp-detail-tags">
                          <span v-for="tag in skill.tags" :key="tag" class="mp-detail-tag">{{ tag }}</span>
                        </div>
                      </div>
                      <div v-if="skill.sourceUrl" class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.sourceUrl') }}</div>
                        <a :href="skill.sourceUrl" target="_blank" class="mp-detail-link" @click.stop>{{ skill.sourceUrl }}</a>
                      </div>
                      <div v-if="skill.gitUrl" class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.github') }}</div>
                        <a :href="skill.gitUrl" target="_blank" class="mp-detail-link" @click.stop>{{ skill.gitUrl }}</a>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div v-if="!installedSkills.length && !availableSkills.length" class="mp-empty">{{ $t('agent.noMatchSkills') }}</div>
          </template>
        </template>

        <!-- ============= 社区 Tab ============= -->
        <template v-if="activeTab === 'community'">
          <!-- 安装进度条 -->
          <div v-if="installProgress" class="mp-progress-row">
            <div class="mp-progress-bar">
              <div class="mp-progress-fill" :style="{ width: (installProgress.percent || 0) + '%' }"></div>
            </div>
            <span class="mp-progress-text">{{ installProgress.fallback ? $t('agent.mirrorFailedSpace') : '' }}{{ installProgress.percent || 0 }}%</span>
          </div>
          <div class="mp-search-row">
            <input
              v-model="marketQuery"
              class="mp-search"
              :placeholder="$t('agent.searchSkills')"
              @keyup.enter="searchMarket(true)"
            />
            <select v-model="marketSort" class="mp-sort-select" :title="$t('agent.sortMethod')">
              <option value="installs-desc">{{ $t('agent.sortInstalls') }}</option>
              <option value="name-asc">{{ $t('agent.sortName') }}</option>
              <option value="name-desc">{{ $t('agent.sortNameRev') }}</option>
            </select>
            <button class="mp-btn mp-btn-install" :disabled="marketLoading" @click="searchMarket(true)">
              {{ marketLoading ? $t('agent.searching') : $t('agent.search') }}
            </button>
          </div>

          <div v-if="marketError" class="mp-empty market-error">
            {{ marketError }}
            <button class="mp-btn mp-btn-link" @click="searchMarket(true)">{{ $t('common.retry') }}</button>
          </div>

          <div v-if="marketLoading && !sortedMarketItems.length" class="mp-empty">{{ $t('agent.searching') }}</div>

          <div v-if="sortedMarketItems.length" class="mp-group">
            <div class="mp-group-label">{{ marketQuery.trim() ? $t('agent.searchResults') : $t('agent.popularSkills') }} {{ $t('agent.hotSkills', { n: marketTotal }) }}</div>
            <div class="mp-list">
              <template v-for="skill in sortedMarketItems" :key="skill.name">
                <div
                  class="mp-item"
                  :class="{ installed: isMarketInstalled(skill) }"
                >
                  <div class="mp-item-icon">
                    <span class="mp-item-icon-default">⭐</span>
                  </div>
                  <div class="mp-item-info">
                    <div class="mp-item-name">
                      {{ skill.displayName || skill.name }}
                      <span v-if="isMarketInstalled(skill)" class="mp-scope-badge system">{{ $t('settings.installed') }}</span>
                    </div>
                    <div class="mp-item-desc">{{ skill.description || skill.author }}</div>
                    <div class="mp-item-meta">
                      <span class="mp-item-author">{{ skill.author }}</span>
                      <span v-if="skill.installs" class="mp-item-tag">📥 {{ formatInstalls(skill.installs) }}</span>
                      <span v-if="skill.category" class="mp-item-tag">{{ skill.category }}</span>
                    </div>
                  </div>
                  <div class="mp-item-actions">
                    <select v-model="marketInstallScope" class="mp-scope-select" :title="$t('agent.installScope')">
                      <option value="system">{{ $t('agent.userScope') }}</option>
                      <option value="project">{{ $t('agent.projectScope') }}</option>
                    </select>
                    <button
                      class="mp-btn-link"
                      @click="toggleDetail(skill)"
                      :title="expandedSkill === skill.name ? $t('agent.collapseDetail') : $t('agent.expandDetail')"
                    >{{ expandedSkill === skill.name ? $t('agent.collapse') : $t('agent.detail') }}</button>
                    <button
                      v-if="!isMarketInstalled(skill)"
                      class="mp-btn mp-btn-install"
                      :disabled="skill._busy"
                      @click="installMarketSkill(skill)"
                    >{{ skill._busy ? '…' : $t('agent.install') }}</button>
                    <span v-else class="mp-installed-hint">✔</span>
                  </div>
                </div>
                <!-- 内嵌详情面板 -->
                <div v-if="expandedSkill === skill.name" class="mp-detail-panel">
                  <div class="mp-detail-content">
                    <div class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.description') }}</div>
                      <div class="mp-detail-text">{{ skill.description || $t('agent.noDescription') }}</div>
                    </div>
                    <div class="mp-detail-row">
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.author') }}</div>
                        <div class="mp-detail-text">{{ skill.author }}</div>
                      </div>
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.installs') }}</div>
                        <div class="mp-detail-text">{{ skill.installs ? '📥 ' + formatInstalls(skill.installs) : $t('agent.noData') }}</div>
                      </div>
                    </div>
                    <div v-if="skill.category" class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.category') }}</div>
                      <div class="mp-detail-text">{{ skill.category }}</div>
                    </div>
                    <div v-if="skill.tags && skill.tags.length" class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.tags') }}</div>
                      <div class="mp-detail-tags">
                        <span v-for="tag in skill.tags" :key="tag" class="mp-detail-tag">{{ tag }}</span>
                      </div>
                    </div>
                    <div v-if="skill.sourceUrl" class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.sourceUrl') }}</div>
                      <a :href="skill.sourceUrl" target="_blank" class="mp-detail-link" @click.stop>{{ skill.sourceUrl }}</a>
                    </div>
                    <div v-if="skill.gitUrl" class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.github') }}</div>
                      <a :href="skill.gitUrl" target="_blank" class="mp-detail-link" @click.stop>{{ skill.gitUrl }}</a>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- 加载更多 -->
            <div v-if="hasMoreMarket" class="mp-loadmore">
              <button
                class="mp-btn mp-btn-install"
                :disabled="marketLoading"
                @click="searchMarket(false)"
              >{{ marketLoading ? $t('chat.loading') : $t('agent.loadMore') }}</button>
            </div>
          </div>

          <div v-if="!marketLoading && !marketError && marketSearched && !sortedMarketItems.length" class="mp-empty">{{ $t('agent.noResults') }}</div>
        </template>
      </div>

      <!-- 镜像设置 -->
      <div class="mp-mirror-row">
        <span class="mp-mirror-label">{{ $t('agent.gitMirror') }}</span>
        <select v-model="mirrorPreset" class="mp-mirror-select" @change="onMirrorPresetChange">
          <option value="">{{ $t('agent.notEnabled') }}</option>
          <option value="https://gh-proxy.com/">gh-proxy.com</option>
          <option value="__custom__">{{ $t('agent.custom') }}</option>
        </select>
        <input
          v-if="mirrorPreset === '__custom__'"
          v-model="mirrorUrl"
          class="mp-mirror-input"
          :placeholder="$t('agent.mirrorPlaceholder')"
          @keyup.enter="applyMirror"
          @blur="applyMirror"
        />
        <button v-if="mirrorPreset === '__custom__'" class="mp-btn mp-btn-install" @click="applyMirror">{{ $t('agent.apply') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const { t, locale } = useI18n()

const props = defineProps({
  apiPrefix: { type: String, default: 'skills' },
  cwd: { type: String, default: '' },
})
const emit = defineEmits(['skills-changed'])

const api = (name) => window.electronAPI?.[props.apiPrefix + name]
const settingsApi = () => window.electronAPI

// ── 共享：Skills API 映射（推荐 & 社区共用）──────────────
const SKILLS_API = 'https://www.agentskills.in/api/skills'

function mapAPISkill(s) {
  return {
    name: s.name,
    displayName: s.name,
    description: s.description || '',
    author: s.author || '',
    category: '',
    tags: [],
    sourceUrl: `https://skills.sh?q=${encodeURIComponent(s.name)}`,
    gitUrl: s.githubUrl || '',
    subPath: s.path ? s.path.replace(/\/SKILL\.md$/i, '') : '',
    installs: s.stars || 0,
  }
}

async function loadCatalogFallback({ query = '', page = 1, limit = 30 } = {}) {
  try {
    const catalog = await api('GetCatalog')?.()
    let skills = Array.isArray(catalog?.skills) ? catalog.skills : []
    const q = query.trim().toLowerCase()
    if (q) {
      skills = skills.filter((skill) => {
        const haystack = [
          skill.name,
          skill.displayName,
          skill.description,
          skill.author,
          skill.category,
          ...(Array.isArray(skill.tags) ? skill.tags : []),
        ].join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }
    const start = Math.max(0, page - 1) * limit
    const items = skills.slice(start, start + limit)
    return {
      items,
      total: skills.length,
      hasNext: start + items.length < skills.length,
    }
  } catch (_) {
    return { items: [], total: 0, hasNext: false }
  }
}

const visible = ref(false)
const activeTab = ref('recommended')
const searchQuery = ref('')
const loading = ref(false)
const installScope = ref('system')
const expandedSkill = ref(null)  // 当前展开详情的 skill name

// ── 镜像 URL + 安装进度 ──
const MIRROR_PRESETS = [
  { label: t('agent.notEnabled'), value: '' },
  { label: 'gh-proxy.com（已验证）', value: 'https://gh-proxy.com/' },
  { label: t('agent.custom'), value: '__custom__' },
]
const mirrorPreset = ref('')
const mirrorUrl = ref('')
const installProgress = ref(null)  // { phase, percent } or null
let _unsubProgress = null

function applyMirror() {
  const url = mirrorPreset.value === '__custom__' ? mirrorUrl.value.trim() : mirrorPreset.value
  settingsApi()?.claudePatchSettingsJson?.({ gitMirrorUrl: url })
    .then(() => ElMessage.success(url ? t('agent.mirrorApplied') : t('agent.mirrorClosed')))
    .catch(() => ElMessage.error(t('common.saveFailed')))
}

function onMirrorPresetChange() {
  if (mirrorPreset.value === '__custom__') {
    mirrorUrl.value = ''
  } else {
    mirrorUrl.value = mirrorPreset.value
    applyMirror()
  }
}

async function loadMirrorUrl() {
  try {
    const s = await settingsApi()?.claudeReadSettingsJson?.()
    const saved = s?.gitMirrorUrl || ''
    mirrorUrl.value = saved
    // 匹配预设
    const matched = MIRROR_PRESETS.find(p => p.value === saved && p.value !== '__custom__')
    mirrorPreset.value = matched ? saved : (saved ? '__custom__' : '')
    // 中文用户无已保存镜像时，默认 gh-proxy.com（静默保存）
    if (!saved && !mirrorPreset.value) {
      const isZh = (locale.value || '').toLowerCase().startsWith('zh')
      if (isZh) {
        mirrorPreset.value = 'https://gh-proxy.com/'
        mirrorUrl.value = 'https://gh-proxy.com/'
        settingsApi()?.claudePatchSettingsJson?.({ gitMirrorUrl: 'https://gh-proxy.com/' }).catch(() => {})
      }
    }
  } catch (_) { mirrorUrl.value = ''; mirrorPreset.value = '' }
}

function startInstallProgress() {
  installProgress.value = { phase: 'clone', percent: 0, fallback: false }
  const progressFn = props.apiPrefix === 'codexSkills'
    ? settingsApi()?.onCodexSkillsInstallProgress
    : settingsApi()?.onSkillsInstallProgress
  const off = progressFn?.((data) => {
    installProgress.value = { phase: data.phase, percent: data.percent, fallback: !!data.fallback }
  }) || (() => {})
  _unsubProgress = () => { off(); _unsubProgress = null }
}

function clearInstallProgress() {
  installProgress.value = null
  if (_unsubProgress) { _unsubProgress(); _unsubProgress = null }
}

onUnmounted(() => { if (_unsubProgress) _unsubProgress() })

const allSkills = ref([])
// 推荐 tab 服务端搜索结果（与社区统一 API）
const recSearchResults = ref([])
const recSearchLoading = ref(false)
const recSearchError = ref('')

async function loadState() {
  loading.value = true
  try {
    const state = await api('GetState')?.(props.cwd || '')
    const skills = Array.isArray(state?.skills) ? state.skills : []
    // 按 name 去重：同名 skill 保留安装量最高的
    const seen = new Map()
    for (const s of skills) {
      const existing = seen.get(s.name)
      if (!existing || (s.installs || 0) > (existing.installs || 0)) {
        seen.set(s.name, s)
      }
    }
    allSkills.value = [...seen.values()]
  } catch (_) {
    if (!allSkills.value.length) {
      allSkills.value = []
    }
  } finally {
    loading.value = false
  }
}

// 获取当前推荐 tab 的数据源（无搜索词用本地 top-100，有搜索词用 API 结果）
function recDataSource() {
  return searchQuery.value.trim() ? recSearchResults.value : allSkills.value
}

const installedSkills = computed(() => recDataSource().filter(s => s.installed))
const availableSkills = computed(() => recDataSource().filter(s => !s.installed))

// 推荐 tab 服务端搜索（与社区统一 API）
async function searchRecommended() {
  const q = searchQuery.value.trim()
  if (!q) {
    recSearchResults.value = []
    recSearchError.value = ''
    return
  }
  recSearchLoading.value = true
  recSearchError.value = ''
  try {
    const params = new URLSearchParams({ search: q, limit: '30', sortBy: 'stars' })
    const response = await fetch(`${SKILLS_API}?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    recSearchResults.value = (result.skills || []).map(s => ({
      ...mapAPISkill(s),
      installed: allSkills.value.some(a => a.installed && a.name === s.name),
      scope: allSkills.value.find(a => a.installed && a.name === s.name)?.scope || null,
      _busy: false,
    }))
  } catch (e) {
    const fallback = await loadCatalogFallback({ query: q, limit: 30 })
    if (fallback.items.length) {
      recSearchResults.value = fallback.items.map(s => ({
        ...s,
        installed: allSkills.value.some(a => a.installed && a.name === s.name),
        scope: allSkills.value.find(a => a.installed && a.name === s.name)?.scope || null,
        _busy: false,
      }))
      recSearchError.value = ''
    } else {
      recSearchError.value = e?.message || t('agent.netErrorFallback')
    }
  } finally {
    recSearchLoading.value = false
  }
}

async function installSkill(skill) {
  skill._busy = true
  const name = skill.displayName || skill.name
  startInstallProgress()
  const loadingMsg = ElMessage({ message: t('agent.installingSkill', { name }), type: 'info', duration: 0 })
  try {
    const res = await api('Install')?.({ skillName: skill.name, scope: installScope.value, cwd: props.cwd || '', gitUrl: skill.gitUrl, subPath: skill.subPath })
    loadingMsg.close()
    clearInstallProgress()
    if (res?.ok === false) {
      ElMessage.error(t('agent.installError', { message: res.error || t('system.unknownError') }))
    } else {
      skill.installed = true
      skill.scope = installScope.value
      skill.installPath = res?.path || ''
      ElMessage.success(t('agent.installedSkill', { name }))
      emit('skills-changed')
    }
  } catch (e) {
    loadingMsg.close()
    clearInstallProgress()
    ElMessage.error(t('agent.installError', { message: e?.message || e }))
  } finally {
    skill._busy = false
  }
}

async function uninstallSkill(skill) {
  skill._busy = true
  try {
    const res = await api('Uninstall')?.({ skillName: skill.name, scope: skill.scope, cwd: props.cwd || '' })
    if (res?.ok === false) {
      ElMessage.error(t('agent.uninstallError', { message: res.error || t('system.unknownError') }))
    } else {
      skill.installed = false
      skill.scope = null
      skill.installPath = null
      ElMessage.success(t('agent.uninstalledSkill', { name: skill.displayName || skill.name }))
      emit('skills-changed')
    }
  } catch (e) {
    ElMessage.error(t('agent.uninstallError', { message: e?.message || e }))
  } finally {
    skill._busy = false
  }
}

// ─── 社区市场 ───────────────────────────────────────────
const marketQuery = ref('')
const marketItems = ref([])
const marketPage = ref(0)       // API 0-indexed
const marketTotal = ref(0)
const marketHasMore = ref(false)
const marketLoading = ref(false)
const marketError = ref('')
const marketSearched = ref(false)
const marketInstallScope = ref('system')
const marketSort = ref('installs-desc')  // 'installs-desc' | 'name-asc' | 'name-desc'

const sortedMarketItems = computed(() => {
  const items = [...marketItems.value]
  if (marketSort.value === 'name-asc') {
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  } else if (marketSort.value === 'name-desc') {
    items.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
  } else {
    items.sort((a, b) => (b.installs || 0) - (a.installs || 0))
  }
  return items
})

const hasMoreMarket = computed(() => marketHasMore.value)

function isMarketInstalled(skill) {
  return allSkills.value.some(s => s.installed && s.name === skill.name)
}

function formatInstalls(n) {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k'
  if (n >= 1000) return (n / 1000).toFixed(2) + 'k'
  return String(n)
}

async function searchMarket(reset) {
  if (reset) {
    marketPage.value = 0
    marketItems.value = []
    marketHasMore.value = false
    marketError.value = ''
    marketSearched.value = false
  }
  marketLoading.value = true
  try {
    const params = new URLSearchParams({ limit: '30', sortBy: 'stars' })
    const q = marketQuery.value.trim()
    if (q) {
      params.set('search', q)
    } else {
      params.set('page', String(marketPage.value + 1))
    }
    const response = await fetch(`${SKILLS_API}?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    marketSearched.value = true
    const newItems = (result.skills || []).map(mapAPISkill)
    const existingNames = new Set(reset ? [] : marketItems.value.map(item => item.name))
    const uniqueNewItems = []
    for (const item of newItems) {
      if (existingNames.has(item.name)) continue
      existingNames.add(item.name)
      uniqueNewItems.push(item)
    }
    if (reset) {
      marketItems.value = uniqueNewItems
    } else if (uniqueNewItems.length) {
      marketItems.value = [...marketItems.value, ...uniqueNewItems]
    }
    marketTotal.value = result.total || 0
    marketHasMore.value = uniqueNewItems.length > 0 && (result.hasNext ?? (!marketTotal.value || marketItems.value.length < marketTotal.value))
    if (newItems.length && (reset || uniqueNewItems.length)) marketPage.value++
  } catch (e) {
    const fallback = await loadCatalogFallback({
      query: marketQuery.value.trim(),
      page: marketPage.value + 1,
      limit: 30,
    })
    if (fallback.items.length) {
      marketSearched.value = true
      const existingNames = new Set(reset ? [] : marketItems.value.map(item => item.name))
      const uniqueNewItems = []
      for (const item of fallback.items) {
        if (existingNames.has(item.name)) continue
        existingNames.add(item.name)
        uniqueNewItems.push(item)
      }
      if (reset) {
        marketItems.value = uniqueNewItems
      } else if (uniqueNewItems.length) {
        marketItems.value = [...marketItems.value, ...uniqueNewItems]
      }
      marketTotal.value = fallback.total || 0
      marketHasMore.value = uniqueNewItems.length > 0 && fallback.hasNext
      if (reset || uniqueNewItems.length) marketPage.value++
      marketError.value = ''
    } else {
      marketError.value = t('agent.searchMarketFailed', { message: e?.message || t('agent.netErrorFallback') })
    }
  } finally {
    marketLoading.value = false
  }
}

async function installMarketSkill(skill, scope) {
  skill._busy = true
  const name = skill.displayName || skill.name
  startInstallProgress()
  const loadingMsg = ElMessage({ message: t('agent.installingSkill', { name }), type: 'info', duration: 0 })
  try {
    const res = await api('MarketInstall')?.({
      skillName: skill.name,
      scope: scope || marketInstallScope.value,
      cwd: props.cwd || '',
      gitUrl: skill.gitUrl,
    })
    loadingMsg.close()
    clearInstallProgress()
    if (res?.ok === false) {
      ElMessage.error(t('agent.installError', { message: res.error || t('system.unknownError') }))
    } else {
      ElMessage.success(t('agent.installedSkill', { name }))
      emit('skills-changed')
      await loadState()
    }
  } catch (e) {
    loadingMsg.close()
    clearInstallProgress()
    ElMessage.error(t('agent.installError', { message: e?.message || e }))
  } finally {
    skill._busy = false
  }
}

function toggleDetail(skill) {
  expandedSkill.value = expandedSkill.value === skill.name ? null : skill.name
}

function switchToCommunity() {
  activeTab.value = 'community'
  if (!marketSearched.value && !marketItems.value.length && !marketLoading.value) {
    searchMarket(true)
  }
}

function open() {
  searchQuery.value = ''
  activeTab.value = 'recommended'
  visible.value = true
  loadState()
  loadMirrorUrl()
}

function close() {
  visible.value = false
}

defineExpose({ open, close })
</script>

<style scoped>
.mp-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--cc-bg-overlay);
  display: flex; align-items: center; justify-content: center;
}
.mp-panel {
  background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 10px;
  width: 640px; max-width: 92vw;
  max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 16px 48px var(--cc-shadow);
  overflow: hidden;
}
.mp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--cc-border);
}
.mp-title {
  font-size: 14px; font-weight: 600;
  color: var(--cc-text);
}
.mp-close {
  background: none; border: none; cursor: pointer;
  color: var(--cc-text-dim); font-size: 18px; line-height: 1;
  padding: 0 2px;
}
.mp-close:hover { color: var(--cc-text); }

/* Tab 栏 */
.mp-tabs {
  display: flex; gap: 0;
  padding: 0 18px;
  border-bottom: 1px solid var(--cc-border);
}
.mp-tab {
  background: none; border: none; cursor: pointer;
  padding: 8px 14px; font-size: 12px; font-weight: 500;
  color: var(--cc-text-dim);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.mp-tab:hover { color: var(--cc-text); }
.mp-tab.active {
  color: var(--cc-primary);
  border-bottom-color: var(--cc-primary);
}

.mp-body {
  flex: 1; overflow-y: auto; padding: 12px 18px 16px;
  display: flex; flex-direction: column; gap: 6px;
}
.mp-search-row { display: flex; gap: 8px; margin-bottom: 4px; }
.mp-search {
  flex: 1; background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 5px; padding: 6px 10px;
  color: var(--cc-text); font-size: 12px; outline: none;
}
.mp-search:focus { border-color: var(--cc-primary); }
.mp-search::placeholder { color: var(--cc-text-placeholder); }

/* 分组 */
.mp-group { display: flex; flex-direction: column; gap: 2px; }
.mp-group + .mp-group { margin-top: 10px; }
.mp-group-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.5px;
  color: var(--cc-text-dim); padding: 4px 2px 6px;
  user-select: none;
}

.mp-list { display: flex; flex-direction: column; gap: 2px; }
.mp-empty { color: var(--cc-text-dim); font-size: 12px; padding: 24px 0; text-align: center; }
.market-error { color: var(--cc-warning, #f59e0b); }

.mp-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 8px; border-radius: 6px;
  border: 1px solid transparent;
  transition: background 0.1s, border-color 0.1s;
  cursor: default;
}
.mp-item:hover { background: var(--cc-bg-hover); }
.mp-item.installed { border-color: var(--cc-primary-border); }

.mp-item-icon {
  width: 36px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--cc-bg-tertiary);
  border-radius: 7px; font-size: 18px;
  border: 1px solid var(--cc-border);
}
.mp-item-icon-default { font-size: 20px; color: var(--cc-text-dim); }

.mp-item-info { flex: 1; min-width: 0; }
.mp-item-name {
  font-size: 13px; font-weight: 500; color: var(--cc-text);
  margin-bottom: 2px; display: flex; align-items: center; gap: 6px;
}
.mp-item-desc { font-size: 11px; color: var(--cc-text-dim); line-height: 1.5; margin-bottom: 4px; }
.mp-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mp-item-author { font-size: 10px; color: var(--cc-text-muted); }
.mp-item-tag {
  font-size: 10px; padding: 1px 5px;
  background: var(--cc-bg-elevated); border-radius: 3px;
  color: var(--cc-text-dim);
}

/* 范围徽章 */
.mp-scope-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 3px;
  font-weight: 500;
}
.mp-scope-badge.system { background: #dbeafe; color: #1d4ed8; }
.mp-scope-badge.project { background: #dcfce7; color: #15803d; }

/* 范围选择器 */
.mp-scope-select {
  font-size: 10px; padding: 3px 6px;
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 4px; color: var(--cc-text-dim);
  cursor: pointer; max-width: 140px;
}
.mp-sort-select {
  font-size: 10px; padding: 3px 6px;
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 4px; color: var(--cc-text-dim);
  cursor: pointer; flex-shrink: 0;
}

.mp-item-actions {
  flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding-top: 2px;
}

/* 已安装提示 */
.mp-installed-hint {
  font-size: 14px; color: var(--cc-success); padding: 2px 4px;
}

/* 加载更多 */
.mp-loadmore {
  display: flex; justify-content: center; padding: 12px 0 4px;
}

/* 按钮 */
.mp-btn {
  border: 1px solid var(--cc-border-strong);
  border-radius: 4px; padding: 4px 12px;
  font-size: 11px; cursor: pointer;
  background: none;
  transition: background 0.1s, color 0.1s;
}
.mp-btn:disabled { opacity: 0.5; cursor: default; }
.mp-btn-install {
  color: var(--cc-primary);
  border-color: var(--cc-primary);
}
.mp-btn-install:hover:not(:disabled) { background: var(--cc-primary); color: var(--cc-btn-primary-text); }
.mp-btn-uninstall { color: var(--cc-text-dim); }
.mp-btn-uninstall:hover:not(:disabled) { background: var(--cc-bg-hover); color: var(--cc-text); }

.mp-btn-link {
  font-size: 10px; color: var(--cc-text-dim);
  text-decoration: none; cursor: pointer; padding: 2px 0;
  background: none; border: none;
}
.mp-btn-link:hover { color: var(--cc-text); text-decoration: underline; }

/* ── 内嵌详情面板 ── */
.mp-detail-panel {
  margin: 0 8px 4px 56px;  /* 左侧缩进对齐图标右侧 */
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  overflow: hidden;
  animation: mp-detail-in 0.2s ease-out;
}
@keyframes mp-detail-in {
  from { opacity: 0; max-height: 0; }
  to { opacity: 1; max-height: 400px; }
}
.mp-detail-content {
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.mp-detail-section { min-width: 0; }
.mp-detail-label {
  font-size: 10px; font-weight: 600;
  color: var(--cc-text-muted); text-transform: uppercase;
  margin-bottom: 2px;
}
.mp-detail-text {
  font-size: 12px; color: var(--cc-text);
  line-height: 1.5; word-break: break-word;
}
.mp-detail-row {
  display: flex; gap: 24px; flex-wrap: wrap;
}
.mp-detail-row .mp-detail-section { flex: 1; min-width: 100px; }
.mp-detail-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.mp-detail-tag {
  font-size: 10px; padding: 2px 7px;
  background: var(--cc-bg-elevated);
  border: 1px solid var(--cc-border);
  border-radius: 4px; color: var(--cc-text-dim);
}
.mp-detail-link {
  font-size: 11px; color: var(--cc-primary);
  text-decoration: none; word-break: break-all;
}
.mp-detail-link:hover { text-decoration: underline; }

/* ── 安装进度条 ── */
.mp-progress-row {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0 2px;
}
.mp-progress-bar {
  flex: 1; height: 4px;
  background: var(--cc-bg-tertiary);
  border-radius: 2px; overflow: hidden;
}
.mp-progress-fill {
  height: 100%; background: var(--cc-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}
.mp-progress-text {
  font-size: 10px; color: var(--cc-text-dim);
  min-width: 32px; text-align: right;
}

/* ── 镜像 URL 设置 ── */
.mp-mirror-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 18px 12px;
  border-top: 1px solid var(--cc-border);
}
.mp-mirror-label {
  font-size: 11px; color: var(--cc-text-dim);
  white-space: nowrap; flex-shrink: 0;
}
.mp-mirror-select {
  font-size: 11px; padding: 3px 6px;
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 4px; color: var(--cc-text-dim);
  cursor: pointer; flex-shrink: 0; max-width: 180px;
}
.mp-mirror-input {
  flex: 1; background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 4px; padding: 4px 8px;
  color: var(--cc-text); font-size: 11px; outline: none;
}
.mp-mirror-input:focus { border-color: var(--cc-primary); }
.mp-mirror-input::placeholder { color: var(--cc-text-placeholder); }
</style>
