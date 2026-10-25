/**
 * A <div> owned by a fresh, script-less document. Setting innerHTML on it does
 * not load images or run inline handlers (e.g. <img onerror>), unlike a div
 * from `document.createElement`, which executes them even while detached.
 * Use it to parse untrusted or stored HTML before cleaning/serialising it.
 */
export function createInertHtmlContainer(): HTMLDivElement {
  const doc = document.implementation.createHTMLDocument('')
  return doc.createElement('div')
}
