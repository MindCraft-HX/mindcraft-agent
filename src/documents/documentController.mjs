import { createDocumentItemId, normalizeDocumentIdentity, sameDocumentSignature } from './documentIdentity.mjs'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeContent(result) {
  if (!result || typeof result !== 'object') return null
  if (result.ok === false || typeof result.text !== 'string' || !result.signature) return null
  return { text: result.text, signature: result.signature }
}

/**
 * Owns document text and save/conflict state. Workbench sees only snapshots;
 * it cannot read drafts or make file-system calls through this controller.
 */
export function createDocumentController({ readDocument, writeDocument } = {}) {
  if (typeof readDocument !== 'function' || typeof writeDocument !== 'function') {
    throw new Error('document controller requires readDocument and writeDocument')
  }

  const documents = new Map()
  const aliases = new Map()
  const listeners = new Set()

  function emit() {
    const snapshot = getSnapshot()
    for (const listener of listeners) listener(snapshot)
  }

  function getSnapshot() {
    return [...documents.values()].map(document => ({
      itemId: document.itemId,
      canonicalDocumentKey: document.identity.canonicalDocumentKey,
      filePath: document.identity.filePath,
      title: document.title,
      status: document.status,
      dirty: document.draftText !== document.baseText,
      conflict: document.status === 'conflict',
    }))
  }

  function getDocument(canonicalDocumentKey) {
    const document = documents.get(canonicalDocumentKey)
    return document ? clone({
      itemId: document.itemId,
      identity: document.identity,
      title: document.title,
      status: document.status,
      baseText: document.baseText,
      draftText: document.draftText,
      error: document.error || '',
    }) : null
  }

  function resolveAlias(key) {
    return aliases.get(key) || key
  }

  function upsertIdentity(rawIdentity, { title = '' } = {}) {
    const identity = normalizeDocumentIdentity(rawIdentity)
    if (!identity) return null
    aliases.set(identity.lexicalDocumentKey, identity.canonicalDocumentKey)
    let document = documents.get(identity.canonicalDocumentKey)
    if (!document) {
      document = {
        itemId: createDocumentItemId(identity.canonicalDocumentKey),
        identity,
        title: title || identity.filePath.split(/[\\/]/).pop() || identity.filePath,
        baseText: '',
        draftText: '',
        status: 'loading',
        error: '',
        requestEpoch: 0,
      }
      documents.set(identity.canonicalDocumentKey, document)
    } else {
      document.identity = identity
      if (title) document.title = title
    }
    return document
  }

  async function open(rawIdentity, options = {}) {
    const document = upsertIdentity(rawIdentity, options)
    if (!document) return { ok: false, reason: 'invalid-identity' }
    const epoch = ++document.requestEpoch
    document.status = document.baseText || document.draftText ? 'ready' : 'loading'
    document.error = ''
    emit()
    try {
      const result = await readDocument(clone(document.identity))
      const content = normalizeContent(result)
      if (document.requestEpoch !== epoch) return { ok: false, reason: 'superseded' }
      if (!content) {
        document.status = 'error'
        document.error = result?.reason || 'invalid-content'
        emit()
        return { ok: false, reason: document.error, itemId: document.itemId }
      }
      if (document.draftText !== document.baseText) {
        document.status = 'conflict'
        emit()
        return { ok: false, reason: 'dirty-reload-conflict', itemId: document.itemId }
      }
      document.baseText = content.text
      document.draftText = content.text
      document.identity = { ...document.identity, signature: content.signature }
      document.status = 'ready'
      emit()
      return { ok: true, itemId: document.itemId, canonicalDocumentKey: document.identity.canonicalDocumentKey }
    } catch (error) {
      if (document.requestEpoch !== epoch) return { ok: false, reason: 'superseded' }
      document.status = 'error'
      document.error = String(error?.message || error)
      emit()
      return { ok: false, reason: 'read-failed', itemId: document.itemId }
    }
  }

  function updateDraft(key, text) {
    const document = documents.get(resolveAlias(key))
    if (!document || typeof text !== 'string') return false
    document.draftText = text
    if (document.status === 'conflict' && text === document.baseText) document.status = 'ready'
    emit()
    return true
  }

  function discardDraft(key) {
    const document = documents.get(resolveAlias(key))
    if (!document) return false
    document.draftText = document.baseText
    if (document.status === 'conflict') document.status = 'ready'
    emit()
    return true
  }

  async function save(key) {
    const document = documents.get(resolveAlias(key))
    if (!document) return { ok: false, reason: 'not-found' }
    if (document.status === 'conflict') return { ok: false, reason: 'conflict' }
    if (document.draftText === document.baseText) return { ok: true, unchanged: true }
    const epoch = ++document.requestEpoch
    document.status = 'saving'
    emit()
    try {
      const result = await writeDocument(clone(document.identity), document.draftText)
      if (document.requestEpoch !== epoch) return { ok: false, reason: 'superseded' }
      if (!result?.ok || !result.signature) {
        document.status = result?.reason === 'conflict' ? 'conflict' : 'ready'
        emit()
        return { ok: false, reason: result?.reason || 'write-failed' }
      }
      document.baseText = document.draftText
      document.identity = { ...document.identity, signature: result.signature }
      document.status = 'ready'
      emit()
      return { ok: true, itemId: document.itemId }
    } catch (_) {
      if (document.requestEpoch === epoch) {
        document.status = 'ready'
        emit()
      }
      return { ok: false, reason: 'write-failed' }
    }
  }

  async function refreshForExternalChange(rawIdentity) {
    const identity = normalizeDocumentIdentity(rawIdentity)
    if (!identity) return { ok: false, reason: 'invalid-identity' }
    const document = documents.get(identity.canonicalDocumentKey)
    if (!document) return { ok: false, reason: 'not-open' }
    document.identity = identity
    if (document.draftText !== document.baseText) {
      document.status = 'conflict'
      emit()
      return { ok: false, reason: 'dirty-conflict' }
    }
    return open(identity, { title: document.title })
  }

  async function requestClose(key, { decideDirty } = {}) {
    const canonicalKey = resolveAlias(key)
    const document = documents.get(canonicalKey)
    if (!document) return { status: 'ready' }
    if (document.draftText !== document.baseText) {
      const decision = typeof decideDirty === 'function' ? await decideDirty(getDocument(canonicalKey)) : 'cancel'
      if (decision === 'save') {
        const saved = await save(canonicalKey)
        if (!saved.ok) return { status: 'cancel', reason: saved.reason }
      } else if (decision !== 'discard') {
        return { status: 'cancel' }
      }
    }
    documents.delete(canonicalKey)
    for (const [alias, target] of aliases) if (target === canonicalKey) aliases.delete(alias)
    emit()
    return { status: 'ready' }
  }

  return {
    open,
    updateDraft,
    discardDraft,
    save,
    refreshForExternalChange,
    requestClose,
    getSnapshot,
    getDocument,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('listener must be a function')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
