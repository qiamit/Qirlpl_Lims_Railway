import { supabase } from '@/lib/supabaseClient'
import { buildScopedTestReportPrintHtml } from '@/features/sample-handling/report-preparation/buildScopedTestReportPrintHtml'
import { outputTestReportDocument } from '@/features/sample-handling/report-preparation/outputTestReportDocument'
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
  REPORT_SCOPE_TITLE,
  type ReportScopeKind,
} from '@/features/sample-handling/report-preparation/reportScope'
import { resolveReportScopeTemplate } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import { formatDate } from '@/lib/utils'
import type { IssuedTestReportListRow } from './types'

/** Opens browser print dialog (user can save as PDF) for an issued scoped test report. */
export async function printIssuedTestReportPdf(
  row: IssuedTestReportListRow,
  scope: ReportScopeKind,
  labName: string,
): Promise<void> {
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
  })

  const srf = row.srfNumber ?? row.id
  await outputTestReportDocument(html, `${REPORT_SCOPE_TITLE[scope]}-${srf}`)
}
