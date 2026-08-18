import { buildConsentLetterHtml } from '@/features/sample-handling/report-preparation/buildConsentLetterHtml'
import { fetchConsentLetterPrintContext } from '@/features/sample-handling/report-preparation/fetchConsentLetterPrintContext'
import { openHtmlPreviewWindow } from '@/features/sample-handling/report-preparation/printHtmlPreview'
import { outputConsentLetterDocument } from '@/features/sample-handling/report-preparation/outputConsentLetterDocument'
import { printHtmlDocument } from '@/features/sample-handling/report-preparation/buildScopedTestReportPrintHtml'
import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { blobToBase64, escapeHtml, sendAppEmail } from '@/lib/sendAppEmail'
import { paginateContinuousTestReportHtml } from '@/features/sample-handling/report-preparation/buildPaginatedTestReportHtml'
import type { ConsentLetterListRow } from './types'

function consentLetterFilenameBase(row: ConsentLetterListRow): string {
  return `Consent-Letter-${row.consentLetterNo.replace(/[/\\]+/g, '-')}`
}

export async function buildConsentLetterHtmlForRow(row: ConsentLetterListRow): Promise<string> {
  const print = await fetchConsentLetterPrintContext()
  const continuous = buildConsentLetterHtml({
    lab: print.lab,
    print,
    clientName: row.clientName,
    clientAddress: row.clientAddress,
    consentLetterNo: row.consentLetterNo,
    letterDate: row.letterDate,
    isCodeLabel: row.isCodeLabel,
    isNumber: row.isNumber,
    revisionYear: row.revisionYear,
    productTitle: row.productTitle ?? '',
    testParameterNames: row.testParameterNames,
    clauseSummary: row.clauseSummary ?? 'Relevant Clause of Correspondence IS',
  })
  return paginateContinuousTestReportHtml(continuous, print.printSettings)
}

export async function previewConsentLetter(row: ConsentLetterListRow): Promise<void> {
  const html = await buildConsentLetterHtmlForRow(row)
  openHtmlPreviewWindow(html)
}

export async function printConsentLetter(row: ConsentLetterListRow): Promise<void> {
  const html = await buildConsentLetterHtmlForRow(row)
  await printHtmlDocument(html)
}

export async function downloadConsentLetterPdf(row: ConsentLetterListRow): Promise<string> {
  const html = await buildConsentLetterHtmlForRow(row)
  const filenameBase = consentLetterFilenameBase(row)
  const settings = await fetchTestReportPrintSettings()
  const { downloadHtmlAsPdf } = await import(
    '@/features/sample-handling/report-preparation/downloadHtmlAsPdf'
  )
  const filename = `${filenameBase.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'consent-letter'}.pdf`
  await downloadHtmlAsPdf(html, filename, settings.pageSize, undefined, undefined, {
    orientation: settings.pageOrientation,
    applyOuterMargins: false,
  })
  return filename
}

export async function emailConsentLetter(
  row: ConsentLetterListRow,
): Promise<{ email: string; filename: string }> {
  const email = (row.clientEmail ?? '').trim()
  if (!email) {
    throw new Error('Client email is not set in Client Master.')
  }

  const [html, settings, print] = await Promise.all([
    buildConsentLetterHtmlForRow(row),
    fetchTestReportPrintSettings(),
    fetchConsentLetterPrintContext(),
  ])
  const { htmlToPdfBlob } = await import(
    '@/features/sample-handling/report-preparation/downloadHtmlAsPdf'
  )
  const filename = `${consentLetterFilenameBase(row).replace(/[^\w.-]+/g, '_').slice(0, 120) || 'consent-letter'}.pdf`
  const blob = await htmlToPdfBlob(html, filename, settings.pageSize, undefined, undefined, {
    orientation: settings.pageOrientation,
    applyOuterMargins: false,
  })
  const labName = print.lab.labName.trim() || 'Laboratory'

  await sendAppEmail({
    to: email,
    subject: `Consent Letter — ${row.consentLetterNo}`,
    html: `<p>Dear ${escapeHtml(row.clientName.trim() || 'Client')},</p>
<p>Please find attached consent letter <strong>${escapeHtml(row.consentLetterNo)}</strong>.</p>
<p>Regards,<br/>${escapeHtml(labName)}</p>`,
    text: `Please find attached consent letter ${row.consentLetterNo}.`,
    attachments: [
      {
        filename,
        content: await blobToBase64(blob),
        contentType: 'application/pdf',
      },
    ],
  })

  return { email, filename }
}

/** @deprecated Prefer printConsentLetter — kept for callers that respect Lab PDF download mode. */
export async function reprintConsentLetter(row: ConsentLetterListRow): Promise<void> {
  const html = await buildConsentLetterHtmlForRow(row)
  await outputConsentLetterDocument(html, consentLetterFilenameBase(row))
}
