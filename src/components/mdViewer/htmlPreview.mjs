export const HTML_PREVIEW_SANDBOX = 'allow-scripts'

export const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const PREVIEW_HEAD = [
  `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">`,
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
].join('')

/**
 * Build an isolated, offline-first preview document.
 *
 * The iframe may execute inline scripts for local UI interactions, but it has
 * an opaque origin (no allow-same-origin) and the injected CSP blocks network,
 * nested frames, workers, objects, and form submissions.
 */
export function buildHtmlPreviewDocument(source, fallbackHtml = '') {
  const html = String(source || fallbackHtml || '')

  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, match => `${match}${PREVIEW_HEAD}`)
  }

  if (/<html(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(?:\s[^>]*)?>/i, match => `${match}<head>${PREVIEW_HEAD}</head>`)
  }

  return `<!doctype html><html><head>${PREVIEW_HEAD}</head><body>${html}</body></html>`
}
