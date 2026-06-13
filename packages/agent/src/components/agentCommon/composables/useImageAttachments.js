import { ref } from 'vue'

export function useImageAttachments({ getActiveTab }) {
  const pendingImages = ref([])
  const imageLightboxSrc = ref(null)
  let imageLightboxEscHandler = null
  const dragging = ref(false)
  const fileInputRef = ref(null)

  function readFileAsDataUrl(file) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e => resolve({ dataUrl: e.target.result, mediaType: file.type, isImage: true })
      reader.readAsDataURL(file)
    })
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  async function addImages(files) {
    for (const f of files) {
      if (pendingImages.value.length >= 10) break
      if (f.type.startsWith('image/')) {
        pendingImages.value.push({
          ...(await readFileAsDataUrl(f)),
          path: f.path || '',
          name: f.name || '',
          size: f.size || 0,
        })
      } else {
        pendingImages.value.push({ name: f.name, size: f.size, type: f.type, path: f.path || '', _file: f })
      }
    }
  }

  function onFileSelect(e) { addImages(e.target.files); e.target.value = '' }

  function onDrop(e) {
    dragging.value = false
    if (getActiveTab?.()?.thinking) return
    addImages(e.dataTransfer.files)
  }

  function onPaste(e) {
    if (getActiveTab?.()?.thinking) return
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    let hasHtmlImage = false
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      } else if (item.kind === 'string' && (item.type === 'text/html' || item.type === 'application/x-moz-nativehtml')) {
        // 某些来源的截图不在 File 中，而是 HTML 内嵌 <img>（如 Claude.ai 的图片引用）
        // 此时纯文本为空，但浏览器默认行为会将 HTML/alt 文本插入 textarea
        if (!hasHtmlImage) {
          try {
            hasHtmlImage = /<img\b/i.test(e.clipboardData.getData(item.type))
          } catch (_) {}
        }
      }
    }
    if (files.length) { e.preventDefault(); addImages(files) }
    else if (hasHtmlImage) { e.preventDefault() }
  }

  async function getFilesText() {
    const parts = []
    for (const item of pendingImages.value) {
      if (item.isImage || !item._file) continue
      try { parts.push(`--- ${item.name} ---\n${await readFileAsText(item._file)}`) } catch (_) {}
    }
    return parts.join('\n\n')
  }

  function removeAt(idx) { pendingImages.value.splice(idx, 1) }

  function openImageLightbox(src) {
    if (!src || typeof src !== 'string') return
    imageLightboxSrc.value = src
    if (imageLightboxEscHandler) window.removeEventListener('keydown', imageLightboxEscHandler)
    imageLightboxEscHandler = (e) => { if (e.key === 'Escape') closeImageLightbox() }
    window.addEventListener('keydown', imageLightboxEscHandler)
  }

  function closeImageLightbox() {
    if (imageLightboxEscHandler) { window.removeEventListener('keydown', imageLightboxEscHandler); imageLightboxEscHandler = null }
    imageLightboxSrc.value = null
  }

  return {
    pendingImages, imageLightboxSrc, dragging, fileInputRef,
    addImageClick: () => fileInputRef.value?.click(),
    onFileSelect, onDrop, onPaste, addImages, getFilesText,
    removeAt, openImageLightbox, closeImageLightbox,
    dispose: closeImageLightbox,
  }
}
