/**
 * NABL ULR scope guard (ISO/IEC 17025 5 / NABL 133, gap P3-3).
 *
 * Lists the parameters of a sample that are marked NABL in the test
 * parameter master but have no 'Accredited' NABL scope row for the
 * parameter, or none for its method. Uses the RPC ulr_scope_check(sample,
 * reported_only) from 20261031100000_p3_good_practice.sql.
 *
 * Warning only: this helper never blocks the issue flow. The report issue
 * screen can call it before a NABL ULR is generated and show the result
 * (wiring into the issue flow is a separate change). Before the migration
 * is applied it returns { available: false, warnings: [] }.
 */
import { supabase } from '@/lib/supabaseClient'
import { isMissingFunctionError } from '@/lib/missingSchema'

export type UlrScopeIssue = 'not_in_scope' | 'method_not_in_scope'

export type UlrScopeWarning = {
  testParameterId: string
  parameterName: string
  testMethod: string | null
  issue: UlrScopeIssue
  detail: string
  rowCount: number
}

export type UlrScopeCheckResult = {
  /** False when the RPC is not on the database yet (nothing was checked). */
  available: boolean
  warnings: UlrScopeWarning[]
}

/**
 * @param reportedOnly true (default): only rows that go on the report (sent
 *   for testing and with a result), like report preparation. false: every
 *   allocated parameter of the sample (useful before results are entered).
 */
export async function checkUlrScope(
  sampleId: string,
  opts?: { reportedOnly?: boolean },
): Promise<UlrScopeCheckResult> {
  const id = sampleId.trim()
  if (!id) return { available: true, warnings: [] }
  const { data, error } = await supabase.rpc('ulr_scope_check', {
    p_sample_id: id,
    p_reported_only: opts?.reportedOnly ?? true,
  })
  if (error) {
    if (isMissingFunctionError(error)) return { available: false, warnings: [] }
    throw error
  }
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
  return {
    available: true,
    warnings: rows.map((r) => ({
      testParameterId: String(r.test_parameter_id ?? ''),
      parameterName: String(r.parameter_name ?? '').trim() || '—',
      testMethod: r.test_method == null || String(r.test_method).trim() === '' ? null : String(r.test_method),
      issue: r.issue === 'method_not_in_scope' ? 'method_not_in_scope' : 'not_in_scope',
      detail: String(r.detail ?? ''),
      rowCount: Number(r.row_count ?? 1) || 1,
    })),
  }
}

/** One line per warning, for a confirm dialog or a banner. */
export function formatUlrScopeWarnings(warnings: UlrScopeWarning[]): string[] {
  return warnings.map((w) => {
    const method = w.testMethod ? ` (${w.testMethod})` : ''
    return w.issue === 'not_in_scope'
      ? `${w.parameterName}${method}: marked NABL but not in the accredited NABL scope`
      : `${w.parameterName}${method}: in the NABL scope, but not for this method`
  })
}

/**
 * Text for window.confirm before a NABL ULR is assigned, or null when there
 * is nothing to warn about.
 */
export function ulrScopeConfirmText(result: UlrScopeCheckResult): string | null {
  if (!result.available || result.warnings.length === 0) return null
  const lines = formatUlrScopeWarnings(result.warnings)
  return [
    `${lines.length} parameter${lines.length === 1 ? '' : 's'} marked NABL ${lines.length === 1 ? 'is' : 'are'} outside the accredited scope:`,
    ...lines.map((l) => `• ${l}`),
    '',
    'A NABL ULR / accreditation symbol must cover only accredited parameters (NABL 133). Report these under the non-accredited part, or correct the test parameter / scope first.',
  ].join('\n')
}
