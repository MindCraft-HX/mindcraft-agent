import { normalizeDocumentIdentity } from './documentIdentity.mjs'

/** Maps only the named document bridge to controller ports. */
export function createDocumentElectronAdapter(api = window.electronAPI) {
  if (!api?.describeDocument || !api?.readDocument || !api?.writeDocument) {
    throw new Error('document bridge is unavailable')
  }
  return {
    async describe(filePath) {
      return normalizeDocumentIdentity(await api.describeDocument(filePath))
    },
    async readDocument(identity) {
      return api.readDocument(identity)
    },
    async writeDocument(identity, text) {
      return api.writeDocument({ identity, text })
    },
  }
}
