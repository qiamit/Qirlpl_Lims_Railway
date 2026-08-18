import { supabase } from '@/lib/supabaseClient'
import {
  buildScopedTestReportPrintHtml,
  printHtmlDocument,
} from '@/features/sample-handling/report-preparation/buildScopedTestReportPrintHtml'
import { paginateContinuousTestReportHtml } from '@/features/sample-handling/report-preparation/buildPaginatedTestReportHtml'
import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { toCanonicalReportNumber } from '@/features/sample-handling/report-preparation/formattedTestReportNumber'
import {
  fetchTestReportCoverDetails,
  formatSectionReportLine,
} from '@/features/sample-handling/report-preparation/fetchTestReportCoverDetails'
import { fetchReportPrepLetterheads } from '@/features/sample-handling/report-preparation/reportPrepLetterhead'
import {
  fetchReportResultRowsForSample,
  filterReportRowsByScope,
} from '@/features/sample-handling/report-preparation/reportResultRows'
import {
  appendReportScopeSuffix,
  type ReportScopeKind,
} from '@/features/sample-handling/report-preparation/reportScope'
import { resolveReportScopeTemplate } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import { formatDate } from '@/lib/utils'
import { blobToBase64, escapeHtml, sendAppEmail } from '@/lib/sendAppEmail'
import type { IssuedTestReportListRow } from './types'

const SCOPE_FILE_LABEL: Record<ReportScopeKind, string> = {
  nabl: 'Accredited',
  non_nabl: 'Non-Accredited',
}

export function issuedReportScopes(row: IssuedTestReportListRow): ReportScopeKind[] {
  const scopes: ReportScopeKind[] = []
  if (row.nablIssuedAt && row.reportNumberBase) scopes.push('nabl')
  if (row.nonNablIssuedAt && row.reportNumberBase) scopes.push('non_nabl')
  return scopes
}

function reportPdfFilename(row: IssuedTestReportListRow, scope: ReportScopeKind): string {
  const base = toCanonicalReportNumber(row.reportNumberBase ?? '')
  const number = base ? appendReportScopeSuffix(base, scope) : row.srfNumber ?? 'report'
  const safe = number.replace(/[^\w.-]+/g, '_').slice(0, 100) || 'report'
  return `${safe}_${SCOPE_FILE_LABEL[scope]}.pdf`
}

async function buildIssuedTestReportHtml(
  row: IssuedTestReportListRow,
  scope: ReportScopeKind,
  labName: string,
): Promise<{ html: string; filename: string }> {
  const base = toCanonicalReportNumber(row.reportNumberBase ?? '')
  if (!base) {
    throw new Error('Report number is missing for this SRF.')
  }

  const resultRows = await fetchReportResultRowsForSample(row.id)
  const scopedRows = filterReportRowsByScope(resultRows, scope)
  if (scopedRows.length === 0) {
    throw new Error(
      scope === 'nabl'
        ? 'No NABL-scoped results found for this report.'
        : 'No Non-NABL-scoped results found for this report.',
    )
  }

  const [{ data: sampleRow }, coverDetails, letterheadData, printSettings] = await Promise.all([
    supabase.from('samples').select('test_report_draft_notes').eq('id', row.id).maybeSingle(),
    fetchTestReportCoverDetails(row.id, {
      fallbacks: { clientName: row.clientName, isCodeLabel: row.isCodeLabel },
    }),
    fetchReportPrepLetterheads(row.id, [scope]),
    fetchTestReportPrintSettings(),
  ])

  const draftNotes =
    (sampleRow as { test_report_draft_notes?: string | null } | null)?.test_report_draft_notes ?? ''
  const lh = letterheadData.letterheads[scope]
  const template = await resolveReportScopeTemplate(scope, undefined, {
    headerName: lh.headerName,
    footerName: lh.footerName,
    watermarkName: lh.watermarkName,
  })

  const printCover = {
    ...coverDetails,
    sectionReportLine: formatSectionReportLine(
      coverDetails.sectionCodes,
      coverDetails.sectionReportNo,
      coverDetails.reportType,
    ),
  }

  const html = buildScopedTestReportPrintHtml({
    scope,
    labName,
    srf: row.srfNumber ?? row.id,
    client: row.clientName ?? '—',
    isStandard: row.isCodeLabel ?? '—',
    dateReceiving: formatDate(row.dateReceiving ?? ''),
    reportNumber: appendReportScopeSuffix(base, scope),
    ulrNumber: scope === 'nabl' ? (row.nablUlrNumber ?? undefined) : undefined,
    notes: draftNotes,
    rows: scopedRows,
    template,
    coverDetails: printCover,
    printSettings,
    signatureIssuedAt:
      (scope === 'nabl' ? row.nablIssuedAt : row.nonNablIssuedAt) || row.issuedAt,
  })

  const outHtml = html.includes('preview-sheets')
    ? html
    : await paginateContinuousTestReportHtml(html, printSettings)

  return { html: outHtml, filename: reportPdfFilename(row, scope) }
}

async function pdfBlobForScope(
  row: IssuedTestReportListRow,
  scope: ReportScopeKind,
  labName: string,
): Promise<{ blob: Blob; filename: string }> {
  const { html, filename } = await buildIssuedTestReportHtml(row, scope, labName)
  const settings = await fetchTestReportPrintSettings()
  const { htmlToPdfBlob } = await import(
    '@/features/sample-handling/report-preparation/downloadHtmlAsPdf'
  )
  const blob = await htmlToPdfBlob(html, filename, settings.pageSize, undefined, undefined, {
    orientation: settings.pageOrientation,
    applyOuterMargins: false,
  })
  return { blob, filename }
}

/** Opens browser print dialog for an issued NABL / Non-NABL test report. */
export async function printIssuedTestReport(
  row: IssuedTestReportListRow,
  scope: ReportScopeKind,
  labName: string,
): Promise<void> {
  const { html } = await buildIssuedTestReportHtml(row, scope, labName)
  await printHtmlDocument(html)
}

/** Downloads Accredited and Non Accredited PDFs together (whichever are issued). */
export async function downloadIssuedTestReports(
  row: IssuedTestReportListRow,
  labName: string,
): Promise<string[]> {
  const scopes = issuedReportScopes(row)
  if (scopes.length === 0) {
    throw new Error('No issued Accredited or Non Accredited report is available to download.')
  }

  const { downloadHtmlAsPdf } = await import(
    '@/features/sample-handling/report-preparation/downloadHtmlAsPdf'
  )
  const settings = await fetchTestReportPrintSettings()
  const downloaded: string[] = []

  for (const [index, scope] of scopes.entries()) {
    const { html, filename } = await buildIssuedTestReportHtml(row, scope, labName)
    await downloadHtmlAsPdf(html, filename, settings.pageSize, undefined, undefined, {
      orientation: settings.pageOrientation,
      applyOuterMargins: false,
    })
    downloaded.push(SCOPE_FILE_LABEL[scope])
    if (index < scopes.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 400))
    }
  }

  return downloaded
}

/** Emails Accredited and Non Accredited PDFs to the client (whichever are issued). */
export async function emailIssuedTestReports(
  row: IssuedTestReportListRow,
  labName: string,
): Promise<{ email: string; labels: string[] }> {
  const scopes = issuedReportScopes(row)
  if (scopes.length === 0) {
    throw new Error('No issued Accredited or Non Accredited report is available to email.')
  }

  const email = (row.clientEmail ?? '').trim()
  if (!email) {
    throw new Error('Client email is not set in Client Master.')
  }

  const attachments: Array<{ filename: string; content: string; contentType: string }> = []
  const labels: string[] = []
  for (const scope of scopes) {
    const { blob, filename } = await pdfBlobForScope(row, scope, labName)
    attachments.push({
      filename,
      content: await blobToBase64(blob),
      contentType: 'application/pdf',
    })
    labels.push(SCOPE_FILE_LABEL[scope])
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

  return { email, labels }
}

/** @deprecated Use printIssuedTestReport */
export const printIssuedTestReportPdf = printIssuedTestReport
