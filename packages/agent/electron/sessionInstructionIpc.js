const { getSessionInstruction, setSessionInstruction } = require('./sessionRegistry')

function registerSessionInstructionIpc(ipcMain) {
  ipcMain.handle('agent-get-session-instruction', (_, { chatKey } = {}) => {
    try {
      return getSessionInstruction(chatKey)
    } catch (err) {
      return { enabled: false, instructionId: '', description: '', content: '', attachments: [], error: err?.message || 'read failed' }
    }
  })

  ipcMain.handle('agent-set-session-instruction', (_, { chatKey, instruction } = {}) => {
    try {
      return setSessionInstruction(chatKey, instruction || {})
    } catch (err) {
      return { ok: false, error: err?.message || 'write failed' }
    }
  })
}

module.exports = { registerSessionInstructionIpc }
