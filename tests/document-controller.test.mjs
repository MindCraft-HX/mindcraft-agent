import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocumentController } from '../src/documents/documentController.mjs'

const identity = (signature = { mtimeMs: 1, size: 3, ino: 7 }) => ({
  filePath: 'D:/repo/readme.md',
  lexicalDocumentKey: 'lexical:d:/repo/readme.md',
  canonicalDocumentKey: 'file:d:/repo/readme.md',
  signature,
})

test('document controller deduplicates aliases and exposes only a lightweight snapshot', async () => {
  let reads = 0
  const controller = createDocumentController({
    async readDocument() { reads += 1; return { text: 'one', signature: identity().signature } },
    async writeDocument() { return { ok: true, signature: identity({ mtimeMs: 2, size: 3, ino: 7 }).signature } },
  })

  const result = await controller.open(identity(), { title: 'README.md' })
  assert.equal(result.ok, true)
  assert.equal(reads, 1)
  assert.deepEqual(controller.getSnapshot(), [{
    itemId: 'document:file%3Ad%3A%2Frepo%2Freadme.md',
    canonicalDocumentKey: 'file:d:/repo/readme.md',
    filePath: 'D:/repo/readme.md',
    title: 'README.md',
    status: 'ready',
    dirty: false,
    conflict: false,
  }])
  assert.equal(controller.updateDraft('lexical:d:/repo/readme.md', 'two'), true)
  assert.equal(controller.getSnapshot()[0].dirty, true)
})

test('external changes never overwrite a dirty draft and save performs compare-and-save', async () => {
  const writes = []
  const controller = createDocumentController({
    async readDocument() { return { text: 'base', signature: identity().signature } },
    async writeDocument(current, text) {
      writes.push({ current, text })
      return { ok: true, signature: { mtimeMs: 2, size: text.length, ino: 7 } }
    },
  })
  await controller.open(identity())
  controller.updateDraft('file:d:/repo/readme.md', 'draft')
  const conflict = await controller.refreshForExternalChange(identity({ mtimeMs: 3, size: 4, ino: 7 }))
  assert.deepEqual(conflict, { ok: false, reason: 'dirty-conflict' })
  assert.equal(controller.getDocument('file:d:/repo/readme.md').draftText, 'draft')
  assert.deepEqual(await controller.save('file:d:/repo/readme.md'), { ok: false, reason: 'conflict' })
  assert.equal(writes.length, 0)
})

test('close asks the document domain rather than the Workbench and can save first', async () => {
  let saved = 0
  const controller = createDocumentController({
    async readDocument() { return { text: 'base', signature: identity().signature } },
    async writeDocument(_current, text) { saved += 1; return { ok: true, signature: { mtimeMs: 2, size: text.length, ino: 7 } } },
  })
  await controller.open(identity())
  controller.updateDraft('file:d:/repo/readme.md', 'updated')
  assert.deepEqual(await controller.requestClose('file:d:/repo/readme.md', { decideDirty: () => 'cancel' }), { status: 'cancel' })
  assert.equal(controller.getSnapshot().length, 1)
  assert.deepEqual(await controller.requestClose('file:d:/repo/readme.md', { decideDirty: () => 'save' }), { status: 'ready' })
  assert.equal(saved, 1)
  assert.equal(controller.getSnapshot().length, 0)
})

test('failed document reads leave a visible error state instead of a permanent loading item', async () => {
  const controller = createDocumentController({
    async readDocument() { return { ok: false, reason: 'file-too-large' } },
    async writeDocument() { return { ok: true, signature: identity().signature } },
  })

  assert.deepEqual(await controller.open(identity()), {
    ok: false,
    reason: 'file-too-large',
    itemId: 'document:file%3Ad%3A%2Frepo%2Freadme.md',
  })
  assert.equal(controller.getSnapshot()[0].status, 'error')
})

test('discard resets a draft without closing its document item', async () => {
  const controller = createDocumentController({
    async readDocument() { return { text: 'base', signature: identity().signature } },
    async writeDocument() { return { ok: true, signature: identity().signature } },
  })
  await controller.open(identity())
  controller.updateDraft('file:d:/repo/readme.md', 'draft')
  assert.equal(controller.discardDraft('file:d:/repo/readme.md'), true)
  assert.equal(controller.getDocument('file:d:/repo/readme.md').draftText, 'base')
  assert.equal(controller.getSnapshot().length, 1)
})
