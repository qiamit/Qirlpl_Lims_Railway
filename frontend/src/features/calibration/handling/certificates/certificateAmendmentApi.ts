/**
 * Amendments to issued calibration certificates (ISO/IEC 17025 7.8.8).
 * Backed by migration 20261025100100_calibration_certificate_amendments.sql;
 * every call degrades to "feature unavailable" until that migration is applied.
 */
import { supabase } from '@/lib/supabaseClient'
import type { CertificateAmendmentType } from '../certificate-preparation/certificateDraftTypes'

export type CertificateAmendmentStatus = 'open' | 'issued' | 'cancelled'

export type CertificateAmendmentSnapshot = {
  snapshot_at?: string
  certificate_draft?: Record<string, unknown> | null
  job?: Record<string, unknown> | null
  raw_data_sheet?: {
    id?: string
    sheet_status?: 'draft' | 'under_review' | 'approved'
    payload?: Record<string, unknown> | null
    reviewed_at?: string | null
    reviewed_by?: string | null
  } | null
}

export type CertificateAmendmentRow = {
  id: string
  calibration_job_id: string
  original_certificate_number: string
  original_ulr: string | null
  original_issued_at: string | null
  original_issue_date: string | null
  amendment_type: CertificateAmendmentType
  amendment_no: number
  reason: string
  new_certificate_number: string
  requested_by: string | null
  requested_at: string
  approved_by: string | null
  approved_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  status: CertificateAmendmentStatus
  original_snapshot: CertificateAmendmentSnapshot
  created_at: string
}

const AMENDMENT_SELECT =
  'id, calibration_job_id, original_certificate_number, original_ulr, original_issued_at, original_issue_date, amendment_type, amendment_no, reason, new_certificate_number, requested_by, requested_at, approved_by, approved_at, cancelled_by, cancelled_at, status, original_snapshot, created_at'

export const CERTIFICATE_AMENDMENT_TYPE_OPTIONS: Array<{
  value: CertificateAmendmentType
  label: string
  hint: string
}> = [
  { value: 'amendment', label: 'Amendment', hint: 'Corrects an error; replaces the issued certificate.' },
  { value: 'revised', label: 'Revised', hint: 'Re-issues the certificate with revised results.' },
  {
    value: 'supplementary',
    label: 'Supplementary',
    hint: 'Adds information; the issued certificate stays valid.',
  },
]

/** Missing table / function: the migration has not been applied yet. */
function isMissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  if (e.code === '42P01' || e.code === '42883' || e.code === 'PGRST202' || e.code === 'PGRST205') {
    return true
  }
  const msg = (e.message ?? '').toLowerCase()
  return (
    msg.includes('calibration_certificate_amendments') &&
    (msg.includes('does not exist') || msg.includes('could not find'))
  )
}

export function certificateAmendmentErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback
  const msg = (err as { message?: string }).message
  return msg && msg.trim() ? msg : fallback
}

export type CertificateAmendmentCapability = {
  /** Migration applied (table + functions exist). */
  available: boolean
  /** Current user may start / cancel amendments (Director, QM, Technical Manager). */
  canAmend: boolean
}

export async function fetchCertificateAmendmentCapability(): Promise<CertificateAmendmentCapability> {
  const { data, error } = await supabase.rpc('app_can_amend_calibration_certificate')
  if (error) {
    if (isMissingObjectError(error)) return { available: false, canAmend: false }
    console.warn('[fetchCertificateAmendmentCapability]', error.message)
    return { available: true, canAmend: false }
  }
  return { available: true, canAmend: data === true }
}

export async function fetchCertificateAmendments(jobId: string): Promise<CertificateAmendmentRow[]> {
  const { data, error } = await supabase
    .from('calibration_certificate_amendments')
    .select(AMENDMENT_SELECT)
    .eq('calibration_job_id', jobId)
    .order('amendment_no', { ascending: false })
  if (error) {
    if (isMissingObjectError(error)) return []
    throw error
  }
  return (data ?? []) as CertificateAmendmentRow[]
}

/** Open amendment id per job (jobs without one are absent). */
export async function fetchOpenCertificateAmendmentIds(
  jobIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (jobIds.length === 0) return map
  const { data, error } = await supabase
    .from('calibration_certificate_amendments')
    .select('id, calibration_job_id')
    .in('calibration_job_id', jobIds)
    .eq('status', 'open')
  if (error) {
    if (isMissingObjectError(error)) return map
    throw error
  }
  for (const row of data ?? []) {
    const r = row as { id: string; calibration_job_id: string }
    map.set(r.calibration_job_id, r.id)
  }
  return map
}

/** Snapshot the issued certificate and reopen the job at Certificate Preparation. */
export async function startCertificateAmendment(input: {
  jobId: string
  type: CertificateAmendmentType
  reason: string
}): Promise<string> {
  const reason = input.reason.trim()
  if (!reason) throw new Error('A reason for the amendment is required.')
  const { data, error } = await supabase.rpc('start_certificate_amendment', {
    p_job_id: input.jobId,
    p_type: input.type,
    p_reason: reason,
  })
  if (error) throw error
  return String(data)
}

/** Issue the amended certificate (job returns to Calibration Certificates). */
export async function issueCertificateAmendment(amendmentId: string): Promise<void> {
  const { error } = await supabase.rpc('issue_certificate_amendment', {
    p_amendment_id: amendmentId,
  })
  if (error) throw error
}

/** Withdraw an amendment opened by mistake; restores the original certificate. */
export async function cancelCertificateAmendment(amendmentId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_certificate_amendment', {
    p_amendment_id: amendmentId,
  })
  if (error) throw error
}

/** Preview of the number start_certificate_amendment() will assign. */
export function previewAmendedCertificateNumber(
  original: string,
  type: CertificateAmendmentType,
  amendmentNo: number,
): string {
  const root = original.trim().replace(/\/[ARS]\d+$/, '')
  const letter = type === 'revised' ? 'R' : type === 'supplementary' ? 'S' : 'A'
  return `${root}/${letter}${amendmentNo}`
}

export async function fetchUserNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('id', unique)
  if (error) return map
  for (const row of data ?? []) {
    const r = row as { id: string; full_name?: string | null }
    map.set(r.id, (r.full_name ?? '').trim() || r.id)
  }
  return map
}
