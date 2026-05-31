import type { PrintPageSize } from '@/features/settings/lab-settings/printSettingsTypes'
import type { PrintPageMarginsMm } from './buildPrintStylesCss'
import { waitForPrintDocumentReady } from './waitForPrintDocumentReady'

type Html2PdfWorker = {
  set: (opts: Record<string, unknown>) => Html2PdfWorker
  from: (element: HTMLElement) => Html2PdfWorker
  save: () => Promise<void>
}

type Html2PdfFactory = () => Html2PdfWorker

function loadHtmlInIframe(html: string): Promise<{ iframe: HTMLIFrameElement; body: HTMLElement }> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.left = '-10000px'
    iframe.style.top = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      document.body.removeChild(iframe)
      reject(new Error('Unable to prepare PDF preview frame'))
      return
    }

    iframe.onload = () => {
      const body = doc.body
      if (!body) {
        document.body.removeChild(iframe)
        reject(new Error('PDF document body is empty'))
        return
      }
      resolve({ iframe, body })
    }

    doc.open()
    doc.write(html)
    doc.close()
  })
}

/** Client-side PDF via html2pdf.js (dynamic import). */
export async function downloadHtmlAsPdf(
  html: string,
  filename: string,
  pageSize: PrintPageSize,
  marginsMm?: PrintPageMarginsMm,
): Promise<void> {
  const mod = await import('html2pdf.js')
  const html2pdf = (mod.default ?? mod) as Html2PdfFactory

  const { iframe, body } = await loadHtmlInIframe(html)
  const doc = iframe.contentDocument
  const m = marginsMm ?? { top: 12, right: 12, bottom: 12, left: 12 }

  try {
    if (doc) await waitForPrintDocumentReady(doc)
    await html2pdf()
      .set({
        margin: [m.top, m.left, m.bottom, m.right],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: {
          unit: 'mm',
          format: pageSize === 'Letter' ? 'letter' : 'a4',
          orientation: 'portrait',
        },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(body)
      .save()
  } finally {
    document.body.removeChild(iframe)
  }
}
