import { waitForPrintDocumentReady } from '@/features/sample-handling/report-preparation/waitForPrintDocumentReady'

/**
 * Replace form controls with static text that keeps the same box size as on screen
 * (View Cert), so downloaded PDF row gaps match the preview.
 */
function flattenFormControls(root: HTMLElement): void {
  root.querySelectorAll('input, textarea, select').forEach((el) => {
    const control = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    const rect = control.getBoundingClientRect()
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
    span.style.letterSpacing = 'normal'
    span.style.color = computed.color
    span.style.textAlign = computed.textAlign
    span.style.whiteSpace =
      control instanceof HTMLTextAreaElement ? 'pre-wrap' : 'nowrap'
    span.style.overflow = 'hidden'
    span.style.textOverflow = 'ellipsis'
    // Keep preview row height (e.g. h-4 inputs)
    const h = Math.max(rect.height, 16)
    span.style.height = `${h}px`
    span.style.minHeight = `${h}px`
    span.style.maxHeight = `${h}px`
    control.replaceWith(span)
  })
}

/**
 * Minimal capture CSS — keep View Cert layout; only fix html2canvas quirks.
 * Do NOT override line-height/gaps to values different from the on-screen certificate.
 */
function injectPdfCaptureStyles(doc: Document): void {
  const style = doc.createElement('style')
  style.setAttribute('data-certificate-pdf-capture', '1')
  style.textContent = `
    .certificate-letter-sheet,
    .certificate-letter-sheet * {
      /* html2canvas merges words when letter-spacing is non-zero */
      letter-spacing: normal !important;
      word-spacing: normal !important;
      text-rendering: geometricPrecision !important;
      -webkit-font-smoothing: antialiased !important;
      box-sizing: border-box !important;
    }
    .certificate-letter-sheet {
      box-shadow: none !important;
      outline: none !important;
      background: #ffffff !important;
    }
    .certificate-letter-sheet table th,
    .certificate-letter-sheet table td {
      vertical-align: middle !important;
    }
    .certificate-draft-no-print {
      display: none !important;
    }
    .certificate-page-header img,
    .certificate-page-footer img {
      max-width: none !important;
      height: auto !important;
      object-fit: contain !important;
    }
  `
  doc.head.appendChild(style)
}

function prepareLiveSheetForCapture(el: HTMLElement): () => void {
  const prev = {
    boxShadow: el.style.boxShadow,
    outline: el.style.outline,
  }
  // Keep on-screen size/layout (View Cert). Only remove chrome that shouldn't be in PDF.
  el.style.boxShadow = 'none'
  el.style.outline = 'none'
  return () => {
    el.style.boxShadow = prev.boxShadow
    el.style.outline = prev.outline
  }
}

function fitImageOnLetterPage(
  canvasW: number,
  canvasH: number,
  pageW: number,
  pageH: number,
): { x: number; y: number; w: number; h: number } {
  if (canvasW <= 0 || canvasH <= 0) {
    return { x: 0, y: 0, w: pageW, h: pageH }
  }
  const canvasAspect = canvasW / canvasH
  let w = pageW
  let h = pageW / canvasAspect
  if (h > pageH) {
    h = pageH
    w = pageH * canvasAspect
  }
  return { x: (pageW - w) / 2, y: 0, w, h }
}

/** Capture each rendered Letter sheet and save a multi-page PDF (matches View Cert layout). */
export async function downloadCertificatePagesAsPdf(
  host: HTMLElement,
  filename: string,
): Promise<void> {
  const sheets = Array.from(
    host.querySelectorAll<HTMLElement>('.certificate-letter-sheet'),
  )
  if (sheets.length === 0) {
    throw new Error('No certificate pages found to download')
  }

  await waitForPrintDocumentReady(document)

  const html2canvasMod = await import('html2canvas')
  const html2canvas = html2canvasMod.default
  const jspdfMod = await import('jspdf')
  const JsPDF = jspdfMod.jsPDF

  const pdf = new JsPDF({
    unit: 'in',
    format: 'letter',
    orientation: 'portrait',
    compress: true,
  })
  const pageW = 8.5
  const pageH = 11

  const safeName =
    filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Calibration_Certificate'
  const outName = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i]!
    sheet.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const restore = prepareLiveSheetForCapture(sheet)
    try {
      await waitForPrintDocumentReady(document)
      await new Promise<void>((r) => window.setTimeout(r, 250))

      const canvas = await html2canvas(sheet, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 25000,
        foreignObjectRendering: false,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: Math.max(document.documentElement.clientWidth, sheet.scrollWidth),
        onclone: (clonedDoc, clonedEl) => {
          injectPdfCaptureStyles(clonedDoc)
          flattenFormControls(clonedEl)
          clonedEl.querySelectorAll('.certificate-draft-no-print').forEach((n) => n.remove())
          clonedEl.style.boxShadow = 'none'
          clonedEl.style.outline = 'none'
          clonedEl.style.background = '#ffffff'
        },
      })

      if (canvas.width < 8 || canvas.height < 8) {
        throw new Error('Certificate page capture failed (blank canvas)')
      }

      const imgData = canvas.toDataURL('image/png')
      if (i > 0) pdf.addPage('letter', 'portrait')
      const { x, y, w, h } = fitImageOnLetterPage(
        canvas.width,
        canvas.height,
        pageW,
        pageH,
      )
      pdf.addImage(imgData, 'PNG', x, y, w, h, undefined, 'FAST')
    } finally {
      restore()
    }
  }

  pdf.save(outName)
}
