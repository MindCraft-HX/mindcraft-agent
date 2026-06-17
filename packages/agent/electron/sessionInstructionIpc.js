const { getSessionInstruction, setSessionInstruction } = require('./sessionRegistry')

function registerSessionInstructionIpc(ipcMain) {
  ipcMain.handle('agent-get-session-instruction', (_, { chatKey } = {}) => {
    return getSessionInstruction(chatKey)
  })

  ipcMain.handle('agent-set-session-instruction', (_, { chatKey, instruction } = {}) => {
    return setSessionInstruction(chatKey, instruction || {})
  })
}

module.exports = { registerSessionInstructionIpc }
