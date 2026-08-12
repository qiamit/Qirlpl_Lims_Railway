import { waitForPrintDocumentReady } from '@/features/sample-handling/report-preparation/waitForPrintDocumentReady'
import { downloadPdfViaPlaywright } from '@/lib/playwrightPdfClient'

/**
 * Replace form controls with static text (same as on-screen values) for PDF HTML.
 */
function flattenFormControls(root: HTMLElement): void {
  root.querySelectorAll('input, textarea, select').forEach((el) => {
    const control = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    const computed = window.getComputedStyle(control)
    const span = document.createElement('span')
    const value =
      control instanceof HTMLSelectElement
        ? control.options[control.selectedIndex]?.text ?? control.value
        : control.value
    span.textContent = value
    span.className = control.className
    span.style.display = 'flex'
    span.style.alignItems = 'center'
    span.style.justifyContent =
      computed.textAlign === 'right' || computed.textAlign === 'end' ? 'flex-end' : 'flex-start'
    span.style.boxSizing = 'border-box'
    span.style.width = '100%'
    span.style.maxWidth = '100%'
    span.style.margin = '0'
    span.style.padding = '0'
    span.style.border = '0'
    span.style.background = 'transparent'
    span.style.font = computed.font
    span.style.fontSize = computed.fontSize
    span.style.fontWeight = computed.fontWeight
    span.style.lineHeight = '1'
    span.style.color = computed.color
    span.style.textAlign = computed.textAlign
    span.style.whiteSpace =
      control instanceof HTMLTextAreaElement ? 'pre-wrap' : 'nowrap'
    span.style.overflow = 'hidden'
    span.style.textOverflow = 'ellipsis'
    const rect = control.getBoundingClientRect()
    const h = Math.max(rect.height, 16)
    span.style.height = `${h}px`
    span.style.minHeight = `${h}px`
    span.style.maxHeight = `${h}px`
    control.replaceWith(span)
  })
}

function absolutizeUrl(url: string): string {
  const t = url.trim()
  if (!t || t.startsWith('data:') || t.startsWith('blob:')) return t
  try {
    return new URL(t, window.location.href).href
  } catch {
    return t
  }
}

/** Collect app stylesheets so Playwright can render Tailwind / page CSS. */
function collectDocumentStyles(): string {
  const parts: string[] = []
  document.querySelectorAll('style').forEach((el) => {
    parts.push(`<style>${el.textContent ?? ''}</style>`)
  })
  document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
    const href = el.getAttribute('href')
    if (!href) return
    parts.push(`<link rel="stylesheet" href="${absolutizeUrl(href)}" />`)
  })
  return parts.join('\n')
}

function absolutizeMediaInTree(root: HTMLElement): void {
  root.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) img.setAttribute('src', absolutizeUrl(src))
  })
  root.querySelectorAll('[style*="url("]').forEach((el) => {
    const style = el.getAttribute('style')
    if (!style) return
    el.setAttribute(
      'style',
      style.replace(/url\((['"]?)([^)'"]+)\1\)/gi, (_m, q: string, u: string) => {
        return `url(${q}${absolutizeUrl(u)}${q})`
      }),
    )
  })
}

/**
 * Build a print-ready multi-page Letter HTML document from live certificate sheets.
 * Uses the same DOM the user sees (View Cert), so Playwright PDF matches design.
 *
 * Important: CertificateDraftDialog injects `@media print { body * { visibility:hidden } }`
 * and only reveals `[data-certificate-draft-pages] *` (+ letterhead images). Playwright
 * `page.pdf()` uses print media, so the cloned sheets MUST sit under that attribute (or
 * visibility must be forced visible) — otherwise PDF shows only header/footer images.
 */
export function buildCertificatePrintHtmlFromHost(host: HTMLElement): string {
  const sheets = Array.from(
    host.querySelectorAll<HTMLElement>('.certificate-letter-sheet'),
  )
  if (sheets.length === 0) {
    throw new Error('No certificate pages found to download')
  }

  const clones = sheets.map((sheet) => {
    const clone = sheet.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.certificate-draft-no-print').forEach((n) => n.remove())
    flattenFormControls(clone)
    absolutizeMediaInTree(clone)
    clone.style.boxShadow = 'none'
    clone.style.outline = 'none'
    clone.style.margin = '0'
    clone.classList.remove('certificate-letter-sheet--grow')
    return clone.outerHTML
  })

  const styles = collectDocumentStyles()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Calibration Certificate</title>
${styles}
<style>
  @page { size: letter; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Override dialog print CSS that hides all body descendants except letterhead. */
  html, body,
  body *,
  [data-certificate-draft-pages],
  [data-certificate-draft-pages] * {
    visibility: visible !important;
  }
  [data-certificate-draft-pages] {
    display: flex !important;
    flex-direction: column !important;
    margin: 0 !important;
    padding: 0 !important;
    gap: 0 !important;
    background: #fff !important;
  }
  .certificate-letter-sheet,
  .certificate-letter-sheet.certificate-letter-sheet--grow {
    display: flex !important;
    flex-direction: column !important;
    box-sizing: border-box !important;
    width: 8.5in !important;
    max-width: 8.5in !important;
    height: 11in !important;
    min-height: 11in !important;
    max-height: 11in !important;
    margin: 0 !important;
    padding: 2mm 5mm 2mm 10mm !important;
    overflow: hidden !important;
    box-shadow: none !important;
    outline: none !important;
    border: 2px solid #1e293b !important;
    background: #fff !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .certificate-letter-sheet:last-of-type {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  .certificate-letter-sheet > [aria-hidden="true"] {
    display: none !important;
    flex: 0 0 0 !important;
    min-height: 0 !important;
    height: 0 !important;
  }
  .certificate-draft-no-print { display: none !important; }
  .certificate-page-header img,
  .certificate-page-footer img {
    max-width: none !important;
    height: auto !important;
    object-fit: contain !important;
  }
</style>
</head>
<body>
<div data-certificate-draft-pages="">
${clones.join('\n')}
</div>
</body>
</html>`
}

/** Capture each rendered Letter sheet via Playwright and download PDF (matches View Cert). */
export async function downloadCertificatePagesAsPdf(
  host: HTMLElement,
  filename: string,
): Promise<void> {
  await waitForPrintDocumentReady(document)
  const html = buildCertificatePrintHtmlFromHost(host)
  const safeName =
    filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Calibration_Certificate'
  const outName = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`

  await downloadPdfViaPlaywright({
    html,
    filename: outName,
    format: 'letter',
    landscape: false,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  })
}
