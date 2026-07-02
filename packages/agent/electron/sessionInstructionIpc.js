const { dialog } = require('electron')
const {
  clearSessionDraft,
  getSessionDraft,
  getSessionInstruction,
  setSessionDraft,
  setSessionInstruction,
  setSessionTitle,
} = require('./sessionRegistry')
const { resolveAttachments, buildFullInstructionPrompt, ALLOWED_EXTENSIONS } = require('./sessionInstructionAttachments')
const { perfStartIpc } = require('./shared/mainPerfProbe')

function registerSessionInstructionIpc(ipcMain) {
  ipcMain.handle('agent-get-session-instruction', (_, { chatKey } = {}) => {
    const stop = perfStartIpc('agent-get-session-instruction')
    try {
      const result = getSessionInstruction(chatKey); stop(); return result
    } catch (err) {
      stop(); return { enabled: false, instructionId: '', description: '', content: '', attachments: [], error: err?.message || 'read failed' }
    }
  })

  ipcMain.handle('agent-set-session-instruction', (_, { chatKey, instruction } = {}) => {
    const stop = perfStartIpc('agent-set-session-instruction')
    try {
      const result = setSessionInstruction(chatKey, instruction || {}); stop(); return result
    } catch (err) {
      stop(); return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle('agent-set-session-title', (_, payload = {}) => {
    try {
      return setSessionTitle(payload.chatKey, payload.title, payload)
    } catch (err) {
      return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle('agent-get-session-draft', (_, { chatKey } = {}) => {
    const stop = perfStartIpc('agent-get-session-draft')
    try {
      const result = getSessionDraft(chatKey); stop(); return result
    } catch (err) {
      stop(); return { text: '', updatedAt: 0, error: err?.message || 'read failed' }
    }
  })

  ipcMain.handle('agent-set-session-draft', (_, { chatKey, draft } = {}) => {
    const stop = perfStartIpc('agent-set-session-draft')
    try {
      const result = setSessionDraft(chatKey, draft || {}); stop(); return result
    } catch (err) {
      stop(); return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.on('agent-set-session-draft-sync', (event, { chatKey, draft } = {}) => {
    try {
      event.returnValue = setSessionDraft(chatKey, draft || {})
    } catch (err) {
      event.returnValue = { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle('agent-clear-session-draft', (_, { chatKey } = {}) => {
    const stop = perfStartIpc('agent-clear-session-draft')
    try {
      const result = clearSessionDraft(chatKey); stop(); return result
    } catch (err) {
      stop(); return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle('agent-open-session-attachment-dialog', async () => {
    const exts = [...ALLOWED_EXTENSIONS].map(ext => ext.replace('.', '')).join(' ')
    const result = await dialog.showOpenDialog({
      title: '选择会话指令附件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文本文件', extensions: [...ALLOWED_EXTENSIONS].map(ext => ext.replace('.', '')) },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths?.length) return []
    return result.filePaths.map(fp => {
      const parsed = require('path').parse(fp)
      return { path: fp, name: parsed.base, enabled: true, addedAt: Date.now() }
    })
  })

  ipcMain.handle('agent-resolve-session-attachments', (_, { attachments } = {}) => {
    try {
      return resolveAttachments(attachments || [])
    } catch (err) {
      return []
    }
  })

  ipcMain.handle('agent-build-session-instruction-prompt', async (_, { instruction } = {}) => {
    try {
      return await buildFullInstructionPrompt(instruction || {})
    } catch (err) {
      return ''
    }
  })
}

module.exports = { registerSessionInstructionIpc }
