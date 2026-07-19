/**
 * openDocTabs 持久化契约：序列化 + 版本化迁移。
 *
 * 背景：mdViewer 的 tab 列表经 settings KV（key 'openDocTabs'）持久化，
 * 历史上 payload 无版本字段、恢复时不校验——结构漂移（字段改名/类型
 * 变化）会在 restore 时静默产生坏 tab。本模块是读写两侧的唯一入口：
 *
 * - serializeDocTabs：写入前归一化（字段白名单 + 长度界定 + 数量上限），
 *   打上 version；
 * - migrateDocTabsPayload：读取后迁移。v0（无 version 的 legacy）与 v1
 *   同构，校验+丢弃非法项即完成迁移；version 高于当前版本时拒绝恢复
 *   （不猜测未来结构，宁可不恢复也不产生坏状态）。
 *
 * 纯函数零依赖，index.vue 只调用这两个入口。
 */
export const DOC_TABS_PERSIST_VERSION = 1

const MAX_TABS = 50
const MAX_SCROLL_ENTRIES = 50

function boundedString(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : ''
}

function sanitizeTabEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = boundedString(raw.id, 128)
  const filePath = boundedString(raw.filePath, 1024)
  // 无 filePath 的 tab（聊天内联文档）本就不持久化；无 id 无法恢复
  if (!id || !filePath) return null
  return {
    id,
    filePath,
    name: boundedString(raw.name, 256),
    ext: boundedString(raw.ext, 32),
    viewerType: boundedString(raw.viewerType, 32),
  }
}

function sanitizeScrollTops(raw, validIds) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, top] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_SCROLL_ENTRIES) break
    // 只保留仍在持久化 tab 集合中的条目，数值必须非负有限
    if (!validIds.has(id)) continue
    if (typeof top === 'number' && Number.isFinite(top) && top >= 0) out[id] = top
  }
  return out
}

/**
 * @param {{tabs?: Array, activeTabId?: string, scrollTops?: Object}} input
 * @returns {{version: number, tabs: Array, activeTabId: string, scrollTops: Object}}
 */
export function serializeDocTabs({ tabs, activeTabId, scrollTops } = {}) {
  const list = (Array.isArray(tabs) ? tabs : [])
    .map(sanitizeTabEntry)
    .filter(Boolean)
    .slice(0, MAX_TABS)
  const validIds = new Set(list.map(tab => tab.id))
  return {
    version: DOC_TABS_PERSIST_VERSION,
    tabs: list,
    // active tab 指向未持久化的 tab（如内联文档）时归一为空，恢复端回退首个 tab
    activeTabId: validIds.has(activeTabId) ? activeTabId : '',
    scrollTops: sanitizeScrollTops(scrollTops, validIds),
  }
}

/**
 * 读取侧迁移：legacy v0（无 version）→ v1；未来版本拒绝恢复。
 * @returns 归一化 payload；结构不可用（或全为非法项）时返回 null
 */
export function migrateDocTabsPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const version = Number.isInteger(raw.version) ? raw.version : 0
  if (version > DOC_TABS_PERSIST_VERSION) return null
  const migrated = serializeDocTabs(raw)
  return migrated.tabs.length ? migrated : null
}
