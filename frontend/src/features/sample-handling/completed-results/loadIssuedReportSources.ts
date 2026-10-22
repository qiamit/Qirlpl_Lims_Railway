import { supabase } from '@/lib/supabaseClient'
import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { fetchTestReportCoverDetails } from '@/features/sample-handling/report-preparation/fetchTestReportCoverDetails'
import { fetchReportPrepLetterheads } from '@/features/sample-handling/report-preparation/reportPrepLetterhead'
import { fetchReportResultRowsForSample } from '@/features/sample-handling/report-preparation/reportResultRows'
import type { ReportScopeKind } from '@/features/sample-handling/report-preparation/reportScope'
import {
  resolveReportScopeTemplateUnsigned,
  type ResolvedScopeTemplate,
} from '@/features/sample-handling/report-preparation/reportScopeConfig'
import type { IssuedReportSources } from './issuedReportPrintData'
import type { IssuedTestReportListRow } from './types'

/**
 * Loads what an issued-report print needs from current records. Used by the
 * live print and by the archive snapshot taken at issue.
 */
export async function loadIssuedReportSources(
  row: IssuedTestReportListRow,
  scopes: ReportScopeKind[],
  labName: string,
  opts: { notes?: string } = {},
): Promise<IssuedReportSources> {
  const notesPromise: Promise<string> =
    opts.notes !== undefined
      ? Promise.resolve(opts.notes)
      : Promise.resolve(
          supabase.from('samples').select('test_report_draft_notes').eq('id', row.id).maybeSingle(),
        ).then(
          ({ data }) =>
            (data as { test_report_draft_notes?: string | null } | null)?.test_report_draft_notes ?? '',
        )

  const [resultRows, coverDetails, letterheadData, printSettings, notes] = await Promise.all([
    fetchReportResultRowsForSample(row.id),
    fetchTestReportCoverDetails(row.id, {
      fallbacks: { clientName: row.clientName, isCodeLabel: row.isCodeLabel },
    }),
    fetchReportPrepLetterheads(row.id, scopes),
    fetchTestReportPrintSettings(),
    notesPromise,
  ])

  const templates: Partial<Record<ReportScopeKind, ResolvedScopeTemplate>> = {}
  const letterheads: IssuedReportSources['letterheads'] = {}
  await Promise.all(
    scopes.map(async (scope) => {
      const lh = letterheadData.letterheads[scope]
      letterheads[scope] = lh
      templates[scope] = await resolveReportScopeTemplateUnsigned(scope, undefined, {
        headerName: lh.headerName,
        footerName: lh.footerName,
        watermarkName: lh.watermarkName,
      })
    }),
  )

  return { row, labName, notes, resultRows, coverDetails, printSettings, letterheads, templates }
}
