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
import type { IssuedReportDecisionRule, IssuedReportSources } from './issuedReportPrintData'
import { fetchSampleDecisionRule } from '@/features/masters/decision-rules/decisionRules'
import { fetchResultEnvironmentSnapshots } from '@/features/environment/resultEnvironment'
import { fetchSampleOpinionsForPrint } from '@/features/sample-handling/report-preparation/reportOpinions'
import { fetchSamplingForReport } from '@/features/sampling/samplingForSample'
import type { IssuedTestReportListRow } from './types'
import { isoDate } from '@/features/masters/test-parameter/muBands'

function issueDateForMu(row: IssuedTestReportListRow): string | undefined {
  const at = row.issuedAt ?? row.nablIssuedAt ?? row.nonNablIssuedAt
  if (!at) return undefined
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? undefined : isoDate(d)
}

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

  // MU bands (ISO 17025 7.6) are chosen as on the issue date, so a later band
  // change does not alter a reprint; today when the issue time is unknown.
  const resultRowsPromise = fetchReportResultRowsForSample(row.id, { muOnDate: issueDateForMu(row) })
  const [resultRows, coverDetails, letterheadData, printSettings, notes, rule, environmentByParameterId, opinions, sampling] = await Promise.all([
    resultRowsPromise,
    fetchTestReportCoverDetails(row.id, {
      fallbacks: { clientName: row.clientName, isCodeLabel: row.isCodeLabel },
    }),
    fetchReportPrepLetterheads(row.id, scopes),
    fetchTestReportPrintSettings(),
    notesPromise,
    fetchSampleDecisionRule(row.id),
    // ISO 17025 7.8.3.1 a): conditions saved with each result ({} before migration 20261026100300).
    resultRowsPromise.then((rows) => fetchResultEnvironmentSnapshots(rows.map((r) => r.parameterId))),
    // ISO 17025 7.8.7: opinions and interpretations (null before migration 20261029100300).
    fetchSampleOpinionsForPrint(row.id),
    // ISO 17025 7.8.5: sampling information (null while sampling is off in Lab Settings).
    fetchSamplingForReport(row.id),
  ])
  const decisionRule: IssuedReportDecisionRule | null = rule
    ? {
        id: rule.id,
        code: rule.code,
        name: rule.name,
        ruleType: rule.ruleType,
        guardBandFactor: rule.guardBandFactor,
        statementText: rule.statementText,
      }
    : null

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

  return {
    row,
    labName,
    notes,
    resultRows,
    coverDetails,
    printSettings,
    letterheads,
    templates,
    decisionRule,
    environmentByParameterId,
    opinions,
    sampling,
  }
}
