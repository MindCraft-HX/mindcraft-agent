'use strict'

const WINDOW_ROLES = Object.freeze({
  MAIN_WORKBENCH: 'main-workbench',
  STANDALONE_AGENT: 'standalone-agent',
})

const VALID_ROLES = new Set(Object.values(WINDOW_ROLES))

/** Keeps renderer authority in main, keyed by the actual WebContents id. */
function createWindowRoleRegistry() {
  const roles = new Map()

  function registerWindow(window, role) {
    if (!window || !window.webContents || !VALID_ROLES.has(role)) {
      throw new Error('a window with a valid role is required')
    }
    const id = window.webContents.id
    roles.set(id, role)
    window.once?.('closed', () => roles.delete(id))
    return role
  }

  function getRoleForSender(sender) {
    return sender && Number.isInteger(sender.id) ? (roles.get(sender.id) || null) : null
  }

  function isSenderInRole(sender, role) {
    return getRoleForSender(sender) === role
  }

  return { registerWindow, getRoleForSender, isSenderInRole }
}

module.exports = { WINDOW_ROLES, createWindowRoleRegistry }
