const { dialog } = require('electron')
const { CORE_CHANNELS } = require('../shared/ipcChannels')
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
  ipcMain.handle(CORE_CHANNELS.AGENT_GET_SESSION_INSTRUCTION, (_, { chatKey } = {}) => {
    const stop = perfStartIpc(CORE_CHANNELS.AGENT_GET_SESSION_INSTRUCTION)
    try {
      const result = getSessionInstruction(chatKey); stop(); return result
    } catch (err) {
      stop(); return { enabled: false, instructionId: '', description: '', content: '', attachments: [], error: err?.message || 'read failed' }
    }
  })

  ipcMain.handle(CORE_CHANNELS.AGENT_SET_SESSION_INSTRUCTION, (_, { chatKey, instruction } = {}) => {
    const stop = perfStartIpc(CORE_CHANNELS.AGENT_SET_SESSION_INSTRUCTION)
    try {
      const result = setSessionInstruction(chatKey, instruction || {}); stop(); return result
    } catch (err) {
      stop(); return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle(CORE_CHANNELS.AGENT_SET_SESSION_TITLE, (_, payload = {}) => {
    const stop = perfStartIpc(CORE_CHANNELS.AGENT_SET_SESSION_TITLE)
    try {
      const result = setSessionTitle(payload.chatKey, payload.title, payload); stop(); return result
    } catch (err) {
      stop(); return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle(CORE_CHANNELS.GET_SESSION_DRAFT, (_, { chatKey } = {}) => {
    const stop = perfStartIpc('agent-get-session-draft')
    try {
      const result = getSessionDraft(chatKey); stop(); return result
    } catch (err) {
      stop(); return { text: '', updatedAt: 0, error: err?.message || 'read failed' }
    }
  })

  ipcMain.handle(CORE_CHANNELS.SET_SESSION_DRAFT, (_, { chatKey, draft } = {}) => {
    const stop = perfStartIpc('agent-set-session-draft')
    try {
      const result = setSessionDraft(chatKey, draft || {}); stop(); return result
    } catch (err) {
      stop(); return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.on(CORE_CHANNELS.SET_SESSION_DRAFT_SYNC, (event, { chatKey, draft } = {}) => {
    try {
      event.returnValue = setSessionDraft(chatKey, draft || {})
    } catch (err) {
      event.returnValue = { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle(CORE_CHANNELS.CLEAR_SESSION_DRAFT, (_, { chatKey } = {}) => {
    const stop = perfStartIpc('agent-clear-session-draft')
    try {
      const result = clearSessionDraft(chatKey); stop(); return result
    } catch (err) {
      stop(); return { ok: false, error: err?.message || 'write failed' }
    }
  })

  ipcMain.handle(CORE_CHANNELS.AGENT_OPEN_SESSION_ATTACHMENT_DIALOG, async () => {
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

  ipcMain.handle(CORE_CHANNELS.AGENT_RESOLVE_SESSION_ATTACHMENTS, (_, { attachments } = {}) => {
    try {
      return resolveAttachments(attachments || [])
    } catch (err) {
      return []
    }
  })

  ipcMain.handle(CORE_CHANNELS.AGENT_BUILD_SESSION_INSTRUCTION_PROMPT, async (_, { instruction } = {}) => {
    try {
      return await buildFullInstructionPrompt(instruction || {})
    } catch (err) {
      return ''
    }
  })
}

module.exports = { registerSessionInstructionIpc }
