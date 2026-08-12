/** Browser client for the local Playwright PDF service (same Chromium print engine). */

export type PlaywrightPdfFormat = 'a4' | 'a5' | 'letter' | 'legal'

export type PlaywrightPdfRequest = {
  html: string
  filename: string
  format?: PlaywrightPdfFormat
  landscape?: boolean
  /** CSS margin strings, e.g. "12mm". Prefer 0 when HTML already has page padding. */
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
}

function pdfServiceUrl(): string {
  const fromEnv = (import.meta.env.VITE_PDF_SERVICE_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  // Vite proxies /api/pdf → pdf-service in dev
  return '/api/pdf'
}

export function mapPageSizeToPlaywrightFormat(
  pageSize: string,
): PlaywrightPdfFormat {
  const s = pageSize.trim().toLowerCase()
  if (s === 'letter') return 'letter'
  if (s === 'legal') return 'legal'
  if (s === 'a5') return 'a5'
  return 'a4'
}

/** Trigger a browser download from PDF bytes. */
export function triggerPdfDownload(blob: Blob, filename: string): void {
  const safe =
    filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document.pdf'
  const outName = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = outName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/**
 * Render HTML → PDF via Playwright service and download the file.
 * Throws a clear error if the service is not running.
 */
export async function downloadPdfViaPlaywright(
  request: PlaywrightPdfRequest,
): Promise<void> {
  const endpoint = pdfServiceUrl()
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: request.html,
        filename: request.filename,
        format: request.format ?? 'a4',
        landscape: request.landscape === true,
        margin: request.margin ?? {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm',
        },
      }),
    })
  } catch {
    throw new Error(
      'PDF service is not running. Start it with: npm run pdf:dev (Playwright on port 3847).',
    )
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string }
      detail = j.error?.trim() || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `PDF service error (${res.status})`)
  }

  const blob = await res.blob()
  if (!blob.size) throw new Error('PDF service returned an empty file')
  triggerPdfDownload(blob, request.filename)
}
