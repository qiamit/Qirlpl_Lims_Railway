import { buildConsentLetterHtml } from '@/features/sample-handling/report-preparation/buildConsentLetterHtml'
import { fetchConsentLetterPrintContext } from '@/features/sample-handling/report-preparation/fetchConsentLetterPrintContext'
import { openHtmlPreviewWindow } from '@/features/sample-handling/report-preparation/printHtmlPreview'
import { outputConsentLetterDocument } from '@/features/sample-handling/report-preparation/outputConsentLetterDocument'
import { printHtmlDocument } from '@/features/sample-handling/report-preparation/buildScopedTestReportPrintHtml'
import type { ConsentLetterListRow } from './types'

export async function buildConsentLetterHtmlForRow(row: ConsentLetterListRow): Promise<string> {
  const print = await fetchConsentLetterPrintContext()
  return buildConsentLetterHtml({
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
}

export async function previewConsentLetter(row: ConsentLetterListRow): Promise<void> {
  const html = await buildConsentLetterHtmlForRow(row)
  openHtmlPreviewWindow(html)
}

export async function printConsentLetter(row: ConsentLetterListRow): Promise<void> {
  const html = await buildConsentLetterHtmlForRow(row)
  await printHtmlDocument(html)
}

/** @deprecated Prefer printConsentLetter — kept for callers that respect Lab PDF download mode. */
export async function reprintConsentLetter(row: ConsentLetterListRow): Promise<void> {
  const html = await buildConsentLetterHtmlForRow(row)
  const filenameBase = `Consent-Letter-${row.consentLetterNo.replace(/[/\\]+/g, '-')}`
  await outputConsentLetterDocument(html, filenameBase)
}
