import type { PrintPageSize } from '@/features/settings/lab-settings/printSettingsTypes'
import type { PrintPageMarginsMm } from './buildPrintStylesCss'
import {
  downloadPdfViaPlaywright,
  mapPageSizeToPlaywrightFormat,
} from '@/lib/playwrightPdfClient'

/**
 * Download HTML as PDF via Playwright (Chromium) — same visual engine as Chrome Print.
 * Replaces html2pdf.js / html2canvas.
 */
export async function downloadHtmlAsPdf(
  html: string,
  filename: string,
  pageSize: PrintPageSize | 'A5' | 'Legal',
  marginsMm?: PrintPageMarginsMm,
  _pagebreakMode?: Array<'css' | 'legacy' | 'avoid-all'>,
  options?: {
    orientation?: 'portrait' | 'landscape'
    qualityScale?: number
    applyOuterMargins?: boolean
    pageWidthMm?: number
    pageHeightMm?: number
    captureSelector?: string
  },
): Promise<void> {
  const applyOuter = options?.applyOuterMargins !== false
  const m = applyOuter
    ? (marginsMm ?? { top: 12, right: 12, bottom: 12, left: 12 })
    : { top: 0, right: 0, bottom: 0, left: 0 }

  await downloadPdfViaPlaywright({
    html,
    filename,
    format: mapPageSizeToPlaywrightFormat(pageSize),
    landscape: options?.orientation === 'landscape',
    margin: {
      top: `${m.top}mm`,
      right: `${m.right}mm`,
      bottom: `${m.bottom}mm`,
      left: `${m.left}mm`,
    },
  })
}
