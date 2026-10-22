/**
 * Generated print HTML (pop-ups, print iframes, blob pages) must not carry
 * inline <script> blocks: the Content-Security-Policy has no
 * script-src 'unsafe-inline' (security plan S-19), and about:blank / blob:
 * documents inherit it. Put this tag at the end of <body> instead; it loads
 * /print-helper.js from the app origin, which opens the print dialog once the
 * page has loaded.
 */
export function printHelperScriptTag(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `<script src="${origin}/print-helper.js"></script>`
}
