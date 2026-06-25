/**
 * 默认快捷键配置
 *
 * 键位格式：'Modifier+Modifier+Key'
 * 修饰键：Ctrl / Alt / Shift / Meta（Meta = Mac Cmd / Win ⊞）
 * 比较时内部 sort 后匹配：'Ctrl+Shift+Tab' ≡ 'Shift+Ctrl+Tab'
 *
 * 一期默认全部使用 Ctrl 修饰键（Windows/Linux/Mac 通用）
 * Meta+Tab 不可用（Mac 系统应用切换器）
 */

export const SHORTCUT_GROUPS = {
  codehub: 'CodeHub Tab',
  history: '历史会话',
}

export const DEFAULT_SHORTCUTS = {
  // ─── CodeHub Tab 切换 ───
  'codehub.nextTab': {
    group: 'codehub',
    label: '下一个 Tab',
    keys: 'Ctrl+Tab',
  },
  'codehub.prevTab': {
    group: 'codehub',
    label: '上一个 Tab',
    keys: 'Ctrl+Shift+Tab',
  },
  'codehub.tab1': { group: 'codehub', label: '跳转到 Tab 1', keys: 'Ctrl+1' },
  'codehub.tab2': { group: 'codehub', label: '跳转到 Tab 2', keys: 'Ctrl+2' },
  'codehub.tab3': { group: 'codehub', label: '跳转到 Tab 3', keys: 'Ctrl+3' },
  'codehub.tab4': { group: 'codehub', label: '跳转到 Tab 4', keys: 'Ctrl+4' },
  'codehub.tab5': { group: 'codehub', label: '跳转到 Tab 5', keys: 'Ctrl+5' },
  'codehub.tab6': { group: 'codehub', label: '跳转到 Tab 6', keys: 'Ctrl+6' },
  'codehub.tab7': { group: 'codehub', label: '跳转到 Tab 7', keys: 'Ctrl+7' },
  'codehub.tab8': { group: 'codehub', label: '跳转到 Tab 8', keys: 'Ctrl+8' },
  'codehub.tab9': { group: 'codehub', label: '跳转到 Tab 9', keys: 'Ctrl+9' },

  // ─── 历史会话导航 ───
  'history.prevSession': {
    group: 'history',
    label: '上一个会话',
    keys: 'Ctrl+ArrowUp',
  },
  'history.nextSession': {
    group: 'history',
    label: '下一个会话',
    keys: 'Ctrl+ArrowDown',
  },
  'history.openSession': {
    group: 'history',
    label: '打开选中会话',
    keys: 'Ctrl+Enter',
  },
}
