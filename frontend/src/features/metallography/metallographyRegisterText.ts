/**
 * S1 Analyses register: cell texts shared by the table, the CSV export and
 * the print view.
 */
import { csvCell } from '@/lib/csv'
import { escapeHtml } from '@/lib/htmlText'
import { printHelperScriptTag } from '@/lib/printHelper'
import { formatDate, formatDateTime } from '@/lib/utils'
import { localIsoDate } from './metallographyApi'
import {
  ANALYSIS_KIND_LABEL,
  ANALYSIS_PURPOSE_LABEL,
  ANALYSIS_STATUS_LABEL,
  type AnalysisListItem,
} from './types'

/** Calibration code and µm/px, or the in-image reference (ring / macro photos). */
export function analysisScaleText(a: AnalysisListItem): string {
  if (a.scaleSnapshot) {
    const s = a.scaleSnapshot
    const xy = s.um_per_px_x === s.um_per_px_y ? `${s.um_per_px_x}` : `${s.um_per_px_x} × ${s.um_per_px_y}`
    return `${s.cal_code} · ${xy} µm/px`
  }
  if (a.inImageScale) {
    const mm = a.inImageScale.mm_per_px
    return mm ? `In-image · ${mm} mm/px` : 'In-image reference'
  }
  return '—'
}

/** What the analysis was run for: the result row's parameter, or the purpose (validation / IQC / training). */
export function analysisParameterText(a: AnalysisListItem): string {
  if (a.purpose === 'sample') return a.testLabel ?? '—'
  return `${ANALYSIS_PURPOSE_LABEL[a.purpose]}${a.testLabel ? ` · ${a.testLabel}` : ''}`
}

export function recheckText(a: AnalysisListItem): string {
  if (!a.lastRecheck) return 'Not run'
  return `${a.lastRecheck.match ? 'Match' : 'Mismatch'} · ${formatDate(a.lastRecheck.runAt)}`
}

function reportedText(a: AnalysisListItem): string {
  if (!a.reportedValue) return ''
  return a.reportedUnit && !a.reportedValue.includes(a.reportedUnit) ? `${a.reportedValue} ${a.reportedUnit}` : a.reportedValue
}

function linkedText(a: AnalysisListItem): string {
  if (a.purpose !== 'sample') return ''
  return a.linkedToResult ? 'Yes' : 'No'
}

const CSV_HEADER = [
  'Analysis No',
  'Purpose',
  'Kind',
  'SRF',
  'Parameter',
  'Standard',
  'Scale',
  'Status',
  'Indicative',
  'Reported value',
  'Linked to result',
  'Re-check',
  'Performed by',
  'Test date',
  'Completed at',
  'Void reason',
]

/** Downloads the rows as CSV (formula injection guarded by csvCell). */
export function downloadAnalysesCsv(rows: AnalysisListItem[]): void {
  const lines = [
    CSV_HEADER.map(csvCell).join(','),
    ...rows.map((a) =>
      [
        a.analysisNo ?? '',
        ANALYSIS_PURPOSE_LABEL[a.purpose],
        ANALYSIS_KIND_LABEL[a.kind],
        a.srfNumber ?? '',
        a.purpose === 'sample' ? (a.testLabel ?? '') : analysisParameterText(a),
        a.methodSnapshot?.standard_ref ?? '',
        analysisScaleText(a) === '—' ? '' : analysisScaleText(a),
        ANALYSIS_STATUS_LABEL[a.status],
        a.indicative ? 'Yes' : 'No',
        reportedText(a),
        linkedText(a),
        recheckText(a),
        a.performedByName ?? '',
        a.testDate,
        a.completedAt ? formatDateTime(a.completedAt) : '',
        a.voidReason ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ]
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `metallography_analyses_${localIsoDate()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/** Print view of the register as filtered on screen. */
export function buildAnalysesPrintHtml(rows: AnalysisListItem[], filterText: string): string {
  const body = rows
    .map(
      (a) => `
      <tr>
        <td class="mono">${escapeHtml(a.analysisNo ?? '—')}<br/><small>${escapeHtml(ANALYSIS_KIND_LABEL[a.kind])}</small></td>
        <td>${escapeHtml(a.srfNumber ?? '—')}</td>
        <td>${escapeHtml(analysisParameterText(a))}</td>
        <td>${escapeHtml(a.methodSnapshot?.standard_ref ?? '—')}</td>
        <td>${escapeHtml(analysisScaleText(a))}</td>
        <td>${escapeHtml(ANALYSIS_STATUS_LABEL[a.status])}${a.indicative ? '<br/><small>Indicative</small>' : ''}</td>
        <td>${escapeHtml(reportedText(a) || '—')}</td>
        <td>${escapeHtml(linkedText(a) || '—')}</td>
        <td>${escapeHtml(recheckText(a))}</td>
        <td>${escapeHtml(a.performedByName ?? '—')}<br/><small>${escapeHtml(formatDate(a.testDate))}</small></td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Metallography Analyses</title>
    <style>
      *{box-sizing:border-box}
      body{margin:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#1c1917;background:#fff}
      h1{font-size:18px;margin:0 0 4px;font-weight:700}
      .meta{font-size:12px;color:#78716c;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #44403c;padding:5px 7px;text-align:left;vertical-align:top}
      th{background:#1c1917;color:#fde68a;font-size:10px;text-transform:uppercase;letter-spacing:.08em}
      tr:nth-child(even) td{background:#f7f3eb}
      small{color:#57534e}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
      @page{size:A4 landscape;margin:10mm}
      @media print{body{margin:0} th,td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style>
  </head>
  <body>
    <h1>Metallography Analyses</h1>
    <p class="meta">${rows.length} analyses${filterText ? ` · ${escapeHtml(filterText)}` : ''} · printed ${escapeHtml(new Date().toLocaleString())}</p>
    <table>
      <thead>
        <tr>
          <th>Analysis No</th>
          <th>SRF</th>
          <th>Parameter</th>
          <th>Standard</th>
          <th>Scale</th>
          <th>Status</th>
          <th>Reported value</th>
          <th>Linked</th>
          <th>Re-check</th>
          <th>Performed</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    ${printHelperScriptTag()}
  </body>
</html>`
}

/** Prints through a hidden iframe (print-helper.js opens the dialog once loaded). */
export function printViaIframe(html: string): boolean {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)
  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    cleanup()
    return false
  }
  doc.open()
  doc.write(html)
  doc.close()
  win.addEventListener('afterprint', cleanup)
  window.setTimeout(cleanup, 60_000)
  return true
}
