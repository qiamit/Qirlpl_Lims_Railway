import { supabase } from '@/lib/supabaseClient'

/**
 * Report issue hold (ISO/IEC 17025 7.10.1, migration 20261029100300): while a
 * nonconforming work record linked to the sample is not Closed and has no
 * resumption authorization, the database refuses to issue the test report.
 * Only the Laboratory Director can override, with a reason sent in the issue
 * UPDATE (samples.issue_hold_override_reason).
 */
export type IssueHoldNc = {
  id: string
  ncId: string
  status: string
  description: string
}

export const ISSUE_HOLD_OVERRIDE_COLUMN = 'issue_hold_override_reason'

/** Open NC records holding this sample's report. [] when none or before the migration. Never throws. */
export async function fetchIssueHoldNcs(sampleId: string): Promise<IssueHoldNc[]> {
  try {
    const { data, error } = await supabase
      .from('nc_work_records')
      .select('id, nc_id, status, description')
      .eq('sample_id', sampleId)
      .neq('status', 'Closed')
      .is('resumption_authorized_at', null)
      .order('nc_id')
    if (error) return []
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      ncId: String(r.nc_id ?? ''),
      status: String(r.status ?? ''),
      description: String(r.description ?? ''),
    }))
  } catch {
    return []
  }
}

export function isIssueHoldError(err: unknown): boolean {
  const msg = (err as { message?: string } | null)?.message ?? ''
  return /report issue is on hold/i.test(msg)
}
