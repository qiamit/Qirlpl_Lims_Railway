/**
 * Equipment status labels (ISO/IEC 17025 6.4.8): asset code, name, calibration
 * date, due date, status, seal no. and a QR code that opens the equipment in
 * the app (<origin><path>?asset=<code>). A4 sheets of 3 x 8 labels
 * (63.5 x 33.9 mm, e.g. L7159 / J8159) or one large label per page.
 *
 * Printing uses a hidden iframe and printHelperScriptTag(): the CSP forbids
 * inline scripts in generated print pages.
 */
import QRCode from 'qrcode'
import { escapeHtml } from '@/lib/htmlText'
import { printHelperScriptTag } from '@/lib/printHelper'
import { formatDate } from '@/lib/utils'

export type EquipmentLabelStatus =
  | 'Calibrated'
  | 'Due soon'
  | 'Overdue'
  | 'Out of Service'
  | 'Not accepted'
  | 'No calibration record'

export type EquipmentLabelItem = {
  assetCode: string
  name: string
  calibratedOn?: string | null
  dueOn?: string | null
  status: EquipmentLabelStatus
  sealNo?: string | null
  /** Absolute URL the QR code encodes. */
  url: string
}

export type EquipmentLabelLayout = 'sheet' | 'large'

/** Same list as equipment_usable_on() in the database (plus the calibration register's "In Repair"). */
const OUT_OF_SERVICE = new Set([
  'out of service',
  'out-of-service',
  'out of order',
  'under repair',
  'in repair',
  'breakdown',
  'under breakdown',
  'scrapped',
  'retired',
  'condemned',
  'discarded',
])

export const LABEL_DUE_SOON_DAYS = 30

function isoDay(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ''
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function equipmentLabelStatus(params: {
  equipmentStatus?: string | null
  lastCalibrationDate?: string | null
  nextCalibrationDue?: string | null
  /** true when acceptance is still pending or was rejected (6.4.1). */
  notAccepted?: boolean
  today?: string
  dueSoonDays?: number
}): EquipmentLabelStatus {
  const status = (params.equipmentStatus ?? '').trim().toLowerCase()
  if (OUT_OF_SERVICE.has(status)) return 'Out of Service'
  if (params.notAccepted) return 'Not accepted'
  const due = isoDay(params.nextCalibrationDue)
  const today = params.today ?? todayIso()
  if (due) {
    if (due < today) return 'Overdue'
    if (due <= addDaysIso(today, params.dueSoonDays ?? LABEL_DUE_SOON_DAYS)) return 'Due soon'
    return 'Calibrated'
  }
  return isoDay(params.lastCalibrationDate) ? 'Calibrated' : 'No calibration record'
}

/** Link the QR code encodes: the register page, opened on that asset. */
export function equipmentLabelUrl(path: string, assetCode: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${path}?asset=${encodeURIComponent(assetCode.trim())}`
}

const STATUS_STYLE: Record<EquipmentLabelStatus, { bg: string; fg: string; border: string }> = {
  Calibrated: { bg: '#dcfce7', fg: '#14532d', border: '#16a34a' },
  'Due soon': { bg: '#fef3c7', fg: '#78350f', border: '#d97706' },
  Overdue: { bg: '#fee2e2', fg: '#7f1d1d', border: '#dc2626' },
  'Out of Service': { bg: '#fee2e2', fg: '#7f1d1d', border: '#dc2626' },
  'Not accepted': { bg: '#ede9fe', fg: '#3b0764', border: '#7c3aed' },
  'No calibration record': { bg: '#f5f5f4', fg: '#292524', border: '#78716c' },
}

function dateText(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  return v ? formatDate(v) : '-'
}

function labelInner(item: EquipmentLabelItem, qr: string): string {
  const s = STATUS_STYLE[item.status]
  return `
    <div class="txt">
      <div class="code">${escapeHtml(item.assetCode || '-')}</div>
      <div class="name">${escapeHtml(item.name || '-')}</div>
      <div class="row"><span class="k">Calibrated</span><span class="v">${escapeHtml(dateText(item.calibratedOn))}</span></div>
      <div class="row"><span class="k">Due</span><span class="v">${escapeHtml(dateText(item.dueOn))}</span></div>
      <div class="row"><span class="k">Seal no.</span><span class="v">${escapeHtml(item.sealNo?.trim() || '-')}</span></div>
      <div class="status" style="background:${s.bg};color:${s.fg};border-color:${s.border}">${escapeHtml(item.status.toUpperCase())}</div>
    </div>
    <div class="qr"><img src="${qr}" alt="QR ${escapeHtml(item.assetCode)}" /></div>`
}

export function buildEquipmentLabelsHtml(
  items: EquipmentLabelItem[],
  qrDataUrls: string[],
  layout: EquipmentLabelLayout,
  title = 'Equipment status labels',
): string {
  const common = `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
    .label{overflow:hidden;display:flex;align-items:stretch;background:#fff}
    .txt{flex:1;min-width:0;display:flex;flex-direction:column}
    .code{font-weight:700;font-family:'Courier New',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .name{font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.15}
    .row{display:flex;gap:1.2mm;white-space:nowrap;overflow:hidden}
    .k{color:#444;min-width:0}
    .v{font-weight:600}
    .status{margin-top:auto;border:0.35mm solid;border-radius:0.8mm;text-align:center;font-weight:700;letter-spacing:.03em;white-space:nowrap;overflow:hidden}
    .qr{display:flex;align-items:center;justify-content:center}
    .qr img{display:block;width:100%;height:auto;image-rendering:pixelated}`

  let css: string
  let body: string
  if (layout === 'sheet') {
    // 3 x 8 labels of 63.5 x 33.9 mm on A4; column gap 2.54 mm, centred.
    css = `${common}
      @page{size:A4;margin:0}
      .sheet{width:210mm;height:297mm;padding:12.9mm 0 0 7.21mm;display:grid;
        grid-template-columns:repeat(3,63.5mm);grid-auto-rows:33.9mm;column-gap:2.54mm;align-content:start;
        break-after:page;page-break-after:always}
      .sheet:last-child{break-after:auto;page-break-after:auto}
      .label{width:63.5mm;height:33.9mm;padding:1.6mm 1.8mm;gap:1.4mm;border:0.2mm dashed #d6d3d1}
      .code{font-size:8.5pt}.name{font-size:6.6pt;margin:0.3mm 0 0.5mm}
      .row{font-size:6.2pt;line-height:1.25}
      .status{font-size:6.4pt;padding:0.3mm 0.5mm}
      .qr{width:22mm;flex:0 0 22mm}
      @media print{.label{border-color:transparent}}`
    const pages: string[] = []
    for (let i = 0; i < items.length; i += 24) {
      const cells = items
        .slice(i, i + 24)
        .map((item, j) => `<div class="label">${labelInner(item, qrDataUrls[i + j])}</div>`)
        .join('')
      pages.push(`<div class="sheet">${cells}</div>`)
    }
    body = pages.join('')
  } else {
    // One large label per page (e.g. for the instrument itself or a label printer).
    css = `${common}
      @page{size:A4;margin:15mm}
      .page{break-after:page;page-break-after:always}
      .page:last-child{break-after:auto;page-break-after:auto}
      .label{width:110mm;height:70mm;padding:4mm 4.5mm;gap:4mm;border:0.5mm solid #111;border-radius:2mm}
      .code{font-size:18pt}.name{font-size:11pt;margin:1mm 0 2mm}
      .row{font-size:10pt;line-height:1.45}
      .status{font-size:12pt;padding:1mm 1.5mm;border-width:0.6mm}
      .qr{width:44mm;flex:0 0 44mm}`
    body = items
      .map((item, i) => `<div class="page"><div class="label">${labelInner(item, qrDataUrls[i])}</div></div>`)
      .join('')
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
${body}
${printHelperScriptTag()}
</body>
</html>`
}

/** QR codes for the labels (data URLs, allowed by the CSP img-src). */
export async function equipmentLabelQrCodes(items: EquipmentLabelItem[]): Promise<string[]> {
  return Promise.all(
    items.map((item) =>
      QRCode.toDataURL(item.url, { errorCorrectionLevel: 'M', margin: 0, width: 300 }),
    ),
  )
}

/**
 * Builds the labels and opens the print dialog from a hidden iframe (no pop-up
 * blocker). /print-helper.js inside the page calls print() once the QR images
 * have loaded.
 */
export async function printEquipmentLabels(
  items: EquipmentLabelItem[],
  layout: EquipmentLabelLayout,
): Promise<void> {
  if (items.length === 0) return
  const qr = await equipmentLabelQrCodes(items)
  const html = buildEquipmentLabelsHtml(items, qr, layout)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  const cleanup = () => {
    try {
      document.body.removeChild(iframe)
    } catch {
      // already removed
    }
  }
  if (!doc || !win) {
    cleanup()
    throw new Error('Unable to open the label print preview.')
  }
  doc.open()
  doc.write(html)
  doc.close()
  // After document.open(): it clears listeners registered on the window before.
  win.addEventListener('afterprint', () => window.setTimeout(cleanup, 500))
  // Fallback when afterprint never fires (some browsers / cancelled dialogs).
  window.setTimeout(cleanup, 5 * 60 * 1000)
}
