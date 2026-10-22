/**
 * Re-print, download and email of issued test reports (ISO/IEC 17025 7.8.2).
 *
 * Source of every copy, decided by checkIssuedReportArchive():
 *  - archive row for the current issue whose SHA-256 matches → printed from the
 *    archived snapshot (the issued copy), no marking;
 *  - archive row whose hash does not match → refused with
 *    IssuedReportIntegrityError; print / download from current records only when
 *    the caller passes allowRegenerated, and then every page carries
 *    "NOT THE ISSUED COPY – regenerated <date>". Email is always refused;
 *  - no archive row (issued before the archive or migration not applied) →
 *    printed from current records with a small "Regenerated from current
 *    records" note on each page.
 * All three render through issuedReportPrintData.ts (one renderer).
 */
import { printHtmlDocument } from '@/features/sample-handling/report-preparation/buildScopedTestReportPrintHtml'
import { paginateContinuousTestReportHtml } from '@/features/sample-handling/report-preparation/buildPaginatedTestReportHtml'
import { toCanonicalReportNumber } from '@/features/sample-handling/report-preparation/formattedTestReportNumber'
import {
  appendReportScopeSuffix,
  type ReportScopeKind,
} from '@/features/sample-handling/report-preparation/reportScope'
import {
  resolveReportScopeTemplateUnsigned,
  signLetterheadFileUrl,
  type ResolvedScopeTemplate,
} from '@/features/sample-handling/report-preparation/reportScopeConfig'
import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import { formatDateTime } from '@/lib/utils'
import { blobToBase64, escapeHtml, sendAppEmail } from '@/lib/sendAppEmail'
import {
  checkIssuedReportArchive,
  type IssuedReportArchiveCheck,
} from './issuedReportArchive'
import {
  issuedReportScopes,
  printDataFromSnapshot,
  printDataFromSources,
  renderIssuedReportContinuousHtml,
  snapshotLiveGaps,
  snapshotReportForScope,
  type IssuedReportPrintData,
  type IssuedReportSnapshot,
  type SnapshotLiveFallback,
  type TemplateImageUrls,
} from './issuedReportPrintData'
import { loadIssuedReportSources } from './loadIssuedReportSources'
import type { IssuedTestReportListRow } from './types'

export { issuedReportScopes } from './issuedReportPrintData'

const SCOPE_FILE_LABEL: Record<ReportScopeKind, string> = {
  nabl: 'Accredited',
  non_nabl: 'Non-Accredited',
}

/** Where a re-printed copy came from. */
export type IssuedReportCopySource = 'archive' | 'live_no_archive' | 'live_integrity_failed'

export const ARCHIVE_INTEGRITY_FAILED_MESSAGE = 'Archived copy failed its integrity check'

/** Thrown when the archived copy exists but fails its SHA-256 check. */
export class IssuedReportIntegrityError extends Error {
  readonly check: Extract<IssuedReportArchiveCheck, { status: 'integrity_failed' }>
  constructor(check: Extract<IssuedReportArchiveCheck, { status: 'integrity_failed' }>) {
    super(`${ARCHIVE_INTEGRITY_FAILED_MESSAGE}: ${check.reason}`)
    this.name = 'IssuedReportIntegrityError'
    this.check = check
  }
}

export type ReprintOptions = {
  /** After an integrity failure: print from current records, marked NOT THE ISSUED COPY. */
  allowRegenerated?: boolean
}

type ReprintMarking =
  | { kind: 'none' }
  | { kind: 'regenerated_note' }
  | { kind: 'not_issued_copy'; regeneratedAt: string }

const REPRINT_MARKING_CSS = `
.reprint-banner{position:absolute;top:2mm;left:50%;transform:translateX(-50%);z-index:60;border:1.5px solid #b91c1c;background:rgba(255,255,255,.94);color:#b91c1c;font:700 10pt/1.25 Arial,Helvetica,sans-serif;letter-spacing:.03em;padding:1mm 4mm;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.reprint-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);z-index:55;color:rgba(185,28,28,.16);font:700 34pt/1 Arial,Helvetica,sans-serif;white-space:nowrap;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.reprint-note{position:absolute;left:4mm;bottom:1.2mm;z-index:60;color:#78716c;font:6.5pt/1 Arial,Helvetica,sans-serif}
.reprint-fixed .reprint-banner,.reprint-fixed .reprint-watermark,.reprint-fixed .reprint-note{position:fixed}
`

/** Adds the re-print marking to every page of paginated report HTML. */
function applyReprintMarking(html: string, marking: ReprintMarking): string {
  if (marking.kind === 'none') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const style = doc.createElement('style')
  style.setAttribute('data-reprint-marking', marking.kind)
  style.textContent = REPRINT_MARKING_CSS
  doc.head.appendChild(style)

  const sheets = Array.from(doc.querySelectorAll<HTMLElement>('.preview-sheet'))
  if (sheets.length === 0) doc.body.classList.add('reprint-fixed')
  const targets: HTMLElement[] = sheets.length > 0 ? sheets : [doc.body]

  const label =
    marking.kind === 'not_issued_copy'
      ? `NOT THE ISSUED COPY – regenerated ${formatDateTime(marking.regeneratedAt)}`
      : 'Regenerated from current records'
  for (const target of targets) {
    if (marking.kind === 'not_issued_copy') {
      const banner = doc.createElement('div')
      banner.className = 'reprint-banner'
      banner.textContent = label
      const wm = doc.createElement('div')
      wm.className = 'reprint-watermark'
      wm.setAttribute('aria-hidden', 'true')
      wm.textContent = 'NOT THE ISSUED COPY'
      target.appendChild(wm)
      target.appendChild(banner)
    } else {
      const note = doc.createElement('div')
      note.className = 'reprint-note'
      note.textContent = label
      target.appendChild(note)
    }
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}

async function signTemplateImages(template: ResolvedScopeTemplate): Promise<TemplateImageUrls> {
  // The archived template holds file paths; the image files themselves are read
  // from storage at print time.
  const [headerUrl, footerUrl, watermarkUrl] = await Promise.all([
    signLetterheadFileUrl(template.headerUrl),
    signLetterheadFileUrl(template.footerUrl),
    signLetterheadFileUrl(template.watermarkUrl),
  ])
  return { headerUrl, footerUrl, watermarkUrl }
}

async function renderPrintableHtml(data: IssuedReportPrintData, marking: ReprintMarking): Promise<string> {
  const html = renderIssuedReportContinuousHtml(data, await signTemplateImages(data.template))
  const paginated = html.includes('preview-sheets')
    ? html
    : await paginateContinuousTestReportHtml(html, data.printSettings)
  return applyReprintMarking(paginated, marking)
}

/** LIVE FALLBACK for snapshots older than v2: only the parts the snapshot lacks. */
async function liveFallbackForSnapshot(
  snapshot: IssuedReportSnapshot,
  scopes: ReportScopeKind[],
): Promise<SnapshotLiveFallback> {
  const gaps = snapshotLiveGaps(snapshot)
  const fallback: SnapshotLiveFallback = {}
  if (gaps.includes('printSettings')) {
    fallback.printSettings = await fetchTestReportPrintSettings()
  }
  if (gaps.includes('template')) {
    fallback.templates = {}
    for (const scope of scopes) {
      const report = snapshotReportForScope(snapshot, scope)
      if (!report || report.template) continue
      // Letterhead names come from the snapshot; their files / terms text are current.
      fallback.templates[scope] = await resolveReportScopeTemplateUnsigned(
        scope,
        undefined,
        report.letterhead ?? undefined,
      )
    }
  }
  return fallback
}

function reportPdfFilename(row: IssuedTestReportListRow, scope: ReportScopeKind): string {
  const base = toCanonicalReportNumber(row.reportNumberBase ?? '')
  const number = base ? appendReportScopeSuffix(base, scope) : row.srfNumber ?? 'report'
  const safe = number.replace(/[^\w.-]+/g, '_').slice(0, 100) || 'report'
  return `${safe}_${SCOPE_FILE_LABEL[scope]}.pdf`
}

type PreparedCopies = {
  source: IssuedReportCopySource
  /** Print settings of the copies (archived ones for an archive copy). */
  printSettings: TestReportPrintSettings
  copies: Array<{ scope: ReportScopeKind; html: string; filename: string }>
}

async function prepareIssuedReportCopies(
  row: IssuedTestReportListRow,
  scopes: ReportScopeKind[],
  labName: string,
  opts: ReprintOptions,
): Promise<PreparedCopies> {
  const check = await checkIssuedReportArchive(row.id, row.issuedAt)
  if (check.status === 'integrity_failed' && !opts.allowRegenerated) {
    throw new IssuedReportIntegrityError(check)
  }

  let source: IssuedReportCopySource
  let marking: ReprintMarking
  let datas: IssuedReportPrintData[]
  if (check.status === 'verified') {
    const fallback = await liveFallbackForSnapshot(check.snapshot, scopes)
    datas = scopes.map((scope) => printDataFromSnapshot(check.snapshot, scope, fallback))
    source = 'archive'
    marking = { kind: 'none' }
  } else {
    const sources = await loadIssuedReportSources(row, scopes, labName)
    datas = scopes.map((scope) => printDataFromSources(sources, scope))
    if (check.status === 'integrity_failed') {
      source = 'live_integrity_failed'
      marking = { kind: 'not_issued_copy', regeneratedAt: new Date().toISOString() }
    } else {
      source = 'live_no_archive'
      marking = { kind: 'regenerated_note' }
    }
  }

  const copies: PreparedCopies['copies'] = []
  for (const data of datas) {
    copies.push({
      scope: data.scope,
      html: await renderPrintableHtml(data, marking),
      filename: reportPdfFilename(row, data.scope),
    })
  }
  return { source, printSettings: datas[0]?.printSettings ?? (await fetchTestReportPrintSettings()), copies }
}

/** Opens browser print dialog for an issued NABL / Non-NABL test report. */
export async function printIssuedTestReport(
  row: IssuedTestReportListRow,
  scope: ReportScopeKind,
  labName: string,
  opts: ReprintOptions = {},
): Promise<{ source: IssuedReportCopySource }> {
  const prepared = await prepareIssuedReportCopies(row, [scope], labName, opts)
  await printHtmlDocument(prepared.copies[0].html)
  return { source: prepared.source }
}

/** Downloads Accredited and Non Accredited PDFs together (whichever are issued). */
export async function downloadIssuedTestReports(
  row: IssuedTestReportListRow,
  labName: string,
  opts: ReprintOptions = {},
): Promise<{ labels: string[]; source: IssuedReportCopySource }> {
  const scopes = issuedReportScopes(row)
  if (scopes.length === 0) {
    throw new Error('No issued Accredited or Non Accredited report is available to download.')
  }

  const prepared = await prepareIssuedReportCopies(row, scopes, labName, opts)
  const { downloadHtmlAsPdf } = await import(
    '@/features/sample-handling/report-preparation/downloadHtmlAsPdf'
  )
  const settings = prepared.printSettings
  const labels: string[] = []

  for (const [index, copy] of prepared.copies.entries()) {
    await downloadHtmlAsPdf(copy.html, copy.filename, settings.pageSize, undefined, undefined, {
      orientation: settings.pageOrientation,
      applyOuterMargins: false,
    })
    labels.push(SCOPE_FILE_LABEL[copy.scope])
    if (index < prepared.copies.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 400))
    }
  }

  return { labels, source: prepared.source }
}

/**
 * Emails Accredited and Non Accredited PDFs to the client (whichever are issued).
 * Refuses (IssuedReportIntegrityError) when the archived copy fails its check:
 * a regenerated copy is never sent to the customer.
 */
export async function emailIssuedTestReports(
  row: IssuedTestReportListRow,
  labName: string,
): Promise<{ email: string; labels: string[]; source: IssuedReportCopySource }> {
  const scopes = issuedReportScopes(row)
  if (scopes.length === 0) {
    throw new Error('No issued Accredited or Non Accredited report is available to email.')
  }

  const email = (row.clientEmail ?? '').trim()
  if (!email) {
    throw new Error('Client email is not set in Client Master.')
  }

  const prepared = await prepareIssuedReportCopies(row, scopes, labName, {})
  const settings = prepared.printSettings
  const { htmlToPdfBlob } = await import(
    '@/features/sample-handling/report-preparation/downloadHtmlAsPdf'
  )

  const attachments: Array<{ filename: string; content: string; contentType: string }> = []
  const labels: string[] = []
  for (const copy of prepared.copies) {
    const blob = await htmlToPdfBlob(copy.html, copy.filename, settings.pageSize, undefined, undefined, {
      orientation: settings.pageOrientation,
      applyOuterMargins: false,
    })
    attachments.push({
      filename: copy.filename,
      content: await blobToBase64(blob),
      contentType: 'application/pdf',
    })
    labels.push(SCOPE_FILE_LABEL[copy.scope])
  }

  const srf = row.srfNumber?.trim() || 'SRF'
  const reportNo = toCanonicalReportNumber(row.reportNumberBase ?? '') || srf
  const attachedList = labels.join(' and ')
  const subject = `Test Report — ${srf}`
  const html = `<p>Dear ${escapeHtml(row.clientName?.trim() || 'Client')},</p>
<p>Please find attached the ${escapeHtml(attachedList)} test report(s) for SRF <strong>${escapeHtml(srf)}</strong> (Report No. ${escapeHtml(reportNo)}).</p>
<p>Regards,<br/>${escapeHtml(labName)}</p>`

  await sendAppEmail({
    to: email,
    subject,
    html,
    text: `Please find attached the ${attachedList} test report(s) for ${srf}.`,
    attachments,
  })

  return { email, labels, source: prepared.source }
}

/** @deprecated Use printIssuedTestReport */
export const printIssuedTestReportPdf = printIssuedTestReport
