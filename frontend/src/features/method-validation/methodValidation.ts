/**
 * Method verification / validation (ISO/IEC 17025 7.2.1.4, 7.2.1.5, 7.2.2).
 * Types and pure helpers shared by the method-validation pages, the IS code
 * master and the NABL scope screens.
 * Tables / RPCs: migration 20261027100100_method_validation.sql.
 */

export const METHOD_VALIDATION_BUCKET = 'method-validation-files'
export const METHOD_VALIDATION_MIGRATION = '20261027100100_method_validation.sql'
export const METHOD_VERIFICATIONS_PATH = '/quality/method-verifications'
export const SCOPE_VERIFICATION_STATUS_PATH = '/quality/scope-verification-status'

export type MvKind = 'verification' | 'validation'
export type MvMethodType = 'standard' | 'non_standard' | 'lab_developed' | 'modified_standard'
export type MvConclusion = 'fit_for_purpose' | 'not_fit' | 'conditional'
export type MvStatus = 'draft' | 'under_review' | 'approved' | 'superseded'

export type PerformanceCharacteristic = {
  characteristic: string
  acceptance_criterion: string
  observed: string
  unit: string
  pass: boolean | null
}

export type MvAttachment = { path: string; name: string; uploaded_at?: string }

export type MethodVerification = {
  id: string
  record_no: string
  version: number
  supersedes_id: string | null
  kind: MvKind
  test_parameter_id: string | null
  is_code_id: string | null
  method_reference: string
  method_type: MvMethodType
  scope_note: string | null
  protocol: string | null
  performance_characteristics: PerformanceCharacteristic[] | null
  conclusion: MvConclusion | null
  performed_by: string | null
  performed_on: string | null
  reviewed_by: string | null
  approved_by: string | null
  approved_by_name: string | null
  approved_on: string | null
  approved_reauthenticated_at: string | null
  status: MvStatus
  attachments: MvAttachment[] | null
  valid_until: string | null
  remarks: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ScopeCoverage = 'verified' | 'expired' | 'not_fit' | 'missing'
export type ScopeMatchSource = 'linked' | 'parameter' | 'method' | 'method_edition'

export type ScopeVerificationRow = {
  scope_kind: 'testing' | 'calibration'
  scope_id: string
  s_no: number
  discipline: string | null
  item: string | null
  parameter: string | null
  method: string | null
  scope_status: string | null
  linked_verification_id: string | null
  covered: boolean
  coverage: ScopeCoverage
  verification_id: string | null
  record_no: string | null
  version: number | null
  kind: MvKind | null
  conclusion: MvConclusion | null
  approved_on: string | null
  valid_until: string | null
  match_source: ScopeMatchSource | null
  standard_status: string | null
  pending_record_no: string | null
  message: string | null
}

export const PERFORMANCE_CHARACTERISTICS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'precision', label: 'Precision' },
  { value: 'repeatability', label: 'Repeatability' },
  { value: 'reproducibility', label: 'Reproducibility' },
  { value: 'bias', label: 'Bias / trueness' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'LOD', label: 'Limit of detection (LOD)' },
  { value: 'LOQ', label: 'Limit of quantitation (LOQ)' },
  { value: 'linearity', label: 'Linearity' },
  { value: 'range', label: 'Measuring range' },
  { value: 'selectivity', label: 'Selectivity' },
  { value: 'robustness', label: 'Robustness' },
  { value: 'MU', label: 'Measurement uncertainty' },
]

export const KIND_LABEL: Record<MvKind, string> = {
  verification: 'Verification (7.2.1.5)',
  validation: 'Validation (7.2.2)',
}

export const METHOD_TYPE_LABEL: Record<MvMethodType, string> = {
  standard: 'Standard method',
  non_standard: 'Non-standard method',
  lab_developed: 'Laboratory-developed method',
  modified_standard: 'Modified standard / used outside scope',
}

export const CONCLUSION_LABEL: Record<MvConclusion, string> = {
  fit_for_purpose: 'Fit for intended use',
  conditional: 'Fit with conditions',
  not_fit: 'Not fit for purpose',
}

export const STATUS_LABEL: Record<MvStatus, string> = {
  draft: 'Draft',
  under_review: 'Under review',
  approved: 'Approved',
  superseded: 'Superseded',
}

export const COVERAGE_LABEL: Record<ScopeCoverage, string> = {
  verified: 'Verified',
  expired: 'Expired',
  not_fit: 'Not fit',
  missing: 'Missing',
}

export const MATCH_SOURCE_LABEL: Record<ScopeMatchSource, string> = {
  linked: 'Linked record',
  parameter: 'Same method and parameter',
  method: 'Same method',
  method_edition: 'Same method, other edition',
}

export const STANDARD_STATUS_OPTIONS = ['current', 'under_review', 'superseded', 'withdrawn'] as const
export type StandardStatus = (typeof STANDARD_STATUS_OPTIONS)[number]

export const STANDARD_STATUS_LABEL: Record<StandardStatus, string> = {
  current: 'Current',
  under_review: 'Under review',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
}

/** Kind follows the method type (verification for a standard method used as published). */
export function kindForMethodType(t: MvMethodType): MvKind {
  return t === 'standard' ? 'verification' : 'validation'
}

export function emptyCharacteristic(characteristic = ''): PerformanceCharacteristic {
  return { characteristic, acceptance_criterion: '', observed: '', unit: '', pass: null }
}

export function normalizeCharacteristics(v: unknown): PerformanceCharacteristic[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    .map((x) => ({
      characteristic: String(x.characteristic ?? ''),
      acceptance_criterion: String(x.acceptance_criterion ?? ''),
      observed: String(x.observed ?? ''),
      unit: String(x.unit ?? ''),
      pass: typeof x.pass === 'boolean' ? x.pass : null,
    }))
}

export function normalizeAttachments(v: unknown): MvAttachment[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && typeof (x as { path?: unknown }).path === 'string')
    .map((x) => ({
      path: String(x.path),
      name: String(x.name ?? String(x.path).split('/').pop() ?? 'file'),
      uploaded_at: typeof x.uploaded_at === 'string' ? x.uploaded_at : undefined,
    }))
}

/** Same rule as the database guard: what blocks approval, or null. */
export function approvalProblem(
  rows: PerformanceCharacteristic[],
  conclusion: MvConclusion | '' | null,
): string | null {
  const used = rows.filter((r) => r.characteristic.trim())
  if (used.length === 0) return 'Record at least one performance characteristic.'
  if (used.some((r) => r.pass === null)) return 'Every characteristic needs a pass / fail decision.'
  if (!conclusion) return 'Record the conclusion.'
  const failed = used.filter((r) => r.pass === false).length
  if (failed > 0 && conclusion === 'fit_for_purpose') {
    return `${failed} characteristic(s) failed: use "Fit with conditions" or "Not fit for purpose".`
  }
  return null
}

/** Today as yyyy-mm-dd (local). */
export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDaysKey(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return todayKey(new Date(y, m - 1, d + days))
}

export type ReviewState = 'overdue' | 'due_soon' | 'ok' | 'none'

/** IS code edition review (7.2.1.4): overdue, due within `soonDays`, ok, or no date. */
export function reviewState(nextReviewDue: string | null | undefined, soonDays = 30, today = todayKey()): ReviewState {
  const due = (nextReviewDue ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'none'
  if (due < today) return 'overdue'
  if (due <= addDaysKey(today, soonDays)) return 'due_soon'
  return 'ok'
}

export function fmtDate(v: string | null | undefined): string {
  const s = (v ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—'
  const [y, m, d] = s.split('-')
  return `${d}-${m}-${y}`
}

/** True when the method-validation tables / RPCs are not on this database yet. */
export function isMvMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /(method_verifications|method_verification_status_for_scope|method_verification_check|standard_status|method_verification_id)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function mvErrorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export function canApproveMethodRecords(designation: string, departmentName: string): boolean {
  const des = designation.trim().toLowerCase()
  return (
    des === 'laboratory director' ||
    des === 'technical manager' ||
    (des === 'quality manager' && departmentName.trim().toLowerCase() === 'quality assurance')
  )
}

/** Input classes: 16px text on phones (no iOS zoom), compact on desktop. */
export const mvInputClass =
  'h-10 rounded-none border border-stone-500 bg-stone-50 text-base shadow-none focus-visible:border-amber-600 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-amber-500/20 sm:h-8 sm:text-sm'

export const mvTextareaClass =
  'min-h-[72px] w-full rounded-none border border-stone-500 bg-stone-50 px-2 py-1.5 text-base shadow-none focus:border-amber-600 focus:bg-card focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60 sm:text-sm'

export const mvThClass =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200'
export const mvTdClass = 'border border-[#e7e0d4] px-2 py-1.5 align-top text-[12.5px] text-[#292524]'
