import { supabase } from '@/lib/supabaseClient'

/**
 * ISO/IEC 17025:2017 clause 7.8.4.3: a calibration certificate shall not
 * recommend a calibration interval / due date unless agreed with the customer.
 * The agreement is recorded on the SRF (calibration_service_requests).
 */
export type SrfDueDatePolicy = {
  /** Customer asked for a recommended due date on the certificate. */
  requested: boolean
  /** Interval the customer asked for (blank = Raw Data Sheet frequency). */
  interval: string
}

export const NO_DUE_DATE_POLICY: SrfDueDatePolicy = { requested: false, interval: '' }

/**
 * Reads the due-date request from the SRF. Uses select('*') so the query does not
 * fail before migration 20261024100100 adds the columns; a missing column, a
 * missing SRF or any read error means "not requested" (no due date printed).
 */
export async function fetchSrfDueDatePolicy(
  serviceRequestId: string | null | undefined,
): Promise<SrfDueDatePolicy> {
  const id = (serviceRequestId ?? '').trim()
  if (!id) return NO_DUE_DATE_POLICY
  try {
    const { data, error } = await supabase
      .from('calibration_service_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return NO_DUE_DATE_POLICY
    const row = data as Record<string, unknown>
    return {
      requested: row.customer_requests_due_date === true,
      interval: typeof row.due_date_interval === 'string' ? row.due_date_interval.trim() : '',
    }
  } catch {
    return NO_DUE_DATE_POLICY
  }
}

/** Customer's interval when given, else the job's Raw Data Sheet frequency, else Yearly. */
export function dueDateFrequency(policy: SrfDueDatePolicy, jobFrequency: string): string {
  return policy.interval.trim() || jobFrequency.trim() || 'Yearly'
}
