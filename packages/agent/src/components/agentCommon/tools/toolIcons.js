/**
 * Shared SVG icon path map — stroke-based line-art icons.
 *
 * All icons normalized to ~10×10 within 16×16 viewBox (centered).
 * Spec:
 *   viewBox="0 0 16 16"
 *   fill="none"
 *   stroke="currentColor"
 *   stroke-width="1.2" (set in ToolIcon.vue)
 *   stroke-linecap="round"
 *   stroke-linejoin="round"
 *
 * Each icon is a function returning an array of { tag, attrs } nodes
 * so ToolIcon.vue can render them without a template compiler.
 */

/** @returns {{ tag: string, attrs?: Record<string,string>, children?: Array<{tag:string,attrs?:Record<string,string>}> }[]} */
const icons = {
  // ── File operations ──

  write: () => [
    // Document outline
    { tag: 'path', attrs: { d: 'M3 14V4h6l3 3v7z' } },
    // Folded corner
    { tag: 'path', attrs: { d: 'M9 4v3h3' } },
    // Down arrow inside
    { tag: 'path', attrs: { d: 'M8 7v4M6 9.5l2 2 2-2' } },
  ],

  edit: () => [
    // Pencil — diagonal
    { tag: 'path', attrs: { d: 'M11 3l2 2-7 7H4v-2z' } },
    // Pencil inner line
    { tag: 'path', attrs: { d: 'M9 5l2 2' } },
  ],

  read: () => [
    // Document outline
    { tag: 'path', attrs: { d: 'M4 2h6l3 3v9H4z' } },
    // Folded corner
    { tag: 'path', attrs: { d: 'M10 2v3h3' } },
    // Text lines
    { tag: 'path', attrs: { d: 'M6.5 8h4.5M6.5 10.5h3.5' } },
  ],

  // ── Command & search ──

  terminal: () => [
    // Prompt arrow + line
    { tag: 'path', attrs: { d: 'M3.5 5l3 3-3 3' } },
    { tag: 'path', attrs: { d: 'M8.5 10h4' } },
  ],

  search: () => [
    // Magnifying glass
    { tag: 'circle', attrs: { cx: '7', cy: '7', r: '4' } },
    { tag: 'path', attrs: { d: 'M10 10l4 4' } },
  ],

  // ── Cognitive ──

  think: () => [
    // Lightbulb
    { tag: 'path', attrs: { d: 'M8 3a3.5 3.5 0 013.5 3.5c0 1.8-1.5 3-2 4.5h-3c-.5-1.5-2-2.7-2-4.5A3.5 3.5 0 018 3z' } },
    // Base
    { tag: 'path', attrs: { d: 'M7 12.5h2M7.5 14h1' } },
  ],

  plan: () => [
    // Two list items with lines
    { tag: 'rect', attrs: { x: '3', y: '3', width: '3.5', height: '3.5', rx: '0.5' } },
    { tag: 'rect', attrs: { x: '3', y: '9.5', width: '3.5', height: '3.5', rx: '0.5' } },
    { tag: 'path', attrs: { d: 'M8.5 4.75h4.5M8.5 11.25h4.5' } },
  ],

  todo: () => [
    // Checkbox with checkmark
    { tag: 'rect', attrs: { x: '3', y: '5', width: '4', height: '4', rx: '0.75' } },
    { tag: 'path', attrs: { d: 'M4.5 7l1 1 2-2.5' } },
    // List lines
    { tag: 'path', attrs: { d: 'M9 6.5h4M9 9h3' } },
  ],

  question: () => [
    // Circle with question mark
    { tag: 'circle', attrs: { cx: '8', cy: '8', r: '5' } },
    { tag: 'path', attrs: { d: 'M7 7a1.5 1.5 0 012.5 1.1c0 .8-1.5 1.2-1.5 2.4' } },
    { tag: 'circle', attrs: { cx: '8', cy: '12.5', r: '0.4', fill: 'currentColor' } },
  ],

  // ── Plugin & change ──

  plugin: () => [
    // Two plugs + connector
    { tag: 'rect', attrs: { x: '4.5', y: '3', width: '2', height: '3.5', rx: '0.5' } },
    { tag: 'rect', attrs: { x: '9.5', y: '3', width: '2', height: '3.5', rx: '0.5' } },
    { tag: 'path', attrs: { d: 'M4 7h8l-1.5 5h-5z' } },
  ],

  change: () => [
    // Left arrows (remove)
    { tag: 'path', attrs: { d: 'M3 5.5h4.5M4.5 4l-1.5 1.5L4.5 7' } },
    // Right arrows (add)
    { tag: 'path', attrs: { d: 'M13 10.5H8.5M11.5 9l1.5 1.5-1.5 1.5' } },
  ],

  // ── Agent & misc ──

  agent: () => [
    // Network: 3 nodes + connections
    { tag: 'circle', attrs: { cx: '8', cy: '4', r: '1.5' } },
    { tag: 'circle', attrs: { cx: '3.5', cy: '12', r: '1.5' } },
    { tag: 'circle', attrs: { cx: '12.5', cy: '12', r: '1.5' } },
    { tag: 'path', attrs: { d: 'M7 5.5L4.5 10.5M9 5.5l2.5 5' } },
  ],

  error: () => [
    // Warning triangle
    { tag: 'path', attrs: { d: 'M8 3l5 9H3z' } },
    { tag: 'path', attrs: { d: 'M8 7.5v2' } },
    { tag: 'circle', attrs: { cx: '8', cy: '11', r: '0.4', fill: 'currentColor' } },
  ],

  tool: () => [
    // Gear/settings fallback
    { tag: 'circle', attrs: { cx: '8', cy: '8', r: '2.5' } },
    { tag: 'path', attrs: { d: 'M8 2.5v1.5M8 12v1.5M2.5 8H4M12 8h1.5M4 4l1 1M11 11l1 1M12 4l-1 1M5 11l-1 1' } },
  ],
}

/**
 * Get SVG node descriptors for an icon key.
 * @param {string} key
 * @returns {Array<{tag:string, attrs?:Record<string,string>, children?:Array}>}
 */
export function getIconNodes(key) {
  const fn = icons[key]
  if (!fn) return icons.tool()
  return fn()
}

export default icons
