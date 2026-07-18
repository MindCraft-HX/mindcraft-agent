import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocumentController } from '../src/documents/documentController.mjs'
import { createDocumentWorkbenchAdapter } from '../src/documents/documentWorkbenchAdapter.mjs'

const identity = {
  filePath: 'D:/repo/readme.md',
  lexicalDocumentKey: 'lexical:d:/repo/readme.md',
  canonicalDocumentKey: 'file:d:/repo/readme.md',
  signature: { mtimeMs: 1, size: 3, ino: 7 },
}

test('document workbench adapter projects metadata and delegates dirty close to the document domain', async () => {
  const controller = createDocumentController({
    async readDocument() { return { ok: true, text: 'one', signature: identity.signature } },
    async writeDocument() { return { ok: true, signature: identity.signature } },
  })
  await controller.open(identity)
  controller.updateDraft(identity.canonicalDocumentKey, 'two')
  const adapter = createDocumentWorkbenchAdapter({ controller, decideDirty: () => 'discard' })

  const snapshot = adapter.getSnapshot()
  assert.deepEqual(snapshot[0], {
    itemId: 'document:file%3Ad%3A%2Frepo%2Freadme.md',
    canonicalDocumentKey: identity.canonicalDocumentKey,
    filePath: identity.filePath,
    title: 'readme.md',
    status: 'ready',
    dirty: true,
    conflict: false,
  })
  assert.equal(Object.hasOwn(snapshot[0], 'draftText'), false)
  assert.deepEqual(await adapter.requestClose(snapshot[0].itemId), { status: 'ready' })
})
