/**
 * LIMS validation registers (ISO/IEC 17025 7.11.2, 7.11.3 c–e, 7.11.6).
 * Types and pure helpers shared by the four register pages.
 * Tables: migration 20261027100300_lims_validation_registers.sql.
 */

import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'

export const VALIDATION_MIGRATION = '20261027100300_lims_validation_registers.sql'
export const NC_RECORDS_PATH = '/nonconforming-work/records'

// ---------------------------------------------------------------- types

export type ChangeRisk = 'low' | 'medium' | 'high'
export type ChangeStatus = 'requested' | 'approved' | 'rejected' | 'deployed' | 'rolled_back' | 'cancelled'

export type SoftwareChange = {
  id: string
  change_no: string
  title: string
  description: string | null
  reason: string | null
  modules_affected: string | null
  app_version: string | null
  commit_sha: string | null
  risk: ChangeRisk
  validation_required: boolean
  validation_ref: string | null
  requested_by: string | null
  requested_on: string
  approved_by: string | null
  approved_at: string | null
  deployed_at: string | null
  deployed_by: string | null
  status: ChangeStatus
  rollback_plan: string | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export type ValidationScope = 'IQ' | 'OQ' | 'PQ' | 'regression' | 'calculation'
export type ValidationEnvironment = 'staging' | 'production' | 'local'
export type RunResult = 'pass' | 'fail' | 'partial'

export type ValidationRun = {
  id: string
  run_no: string
  title: string
  scope: ValidationScope
  app_version: string
  commit_sha: string | null
  environment: ValidationEnvironment
  executed_by: string
  executed_at: string
  result: RunResult
  cases_total: number | null
  cases_passed: number | null
  cases_failed: number | null
  evidence: unknown
  evidence_paths: string[]
  deviations: string | null
  linked_change_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  remarks: string | null
  created_at: string
}

export type IncidentCategory = 'outage' | 'data_integrity' | 'security' | 'backup' | 'performance' | 'other'
export type IncidentStatus = 'open' | 'investigating' | 'closed'

export type ItIncident = {
  id: string
  incident_no: string
  occurred_at: string
  detected_at: string | null
  detected_by: string | null
  category: IncidentCategory
  description: string
  data_impact: string | null
  affected_records: string | null
  immediate_action: string | null
  root_cause: string | null
  corrective_action: string | null
  nc_record_id: string | null
  status: IncidentStatus
  closed_at: string | null
  closed_by: string | null
  remarks: string | null
  created_at: string
}

export type BackupKind = 'daily' | 'weekly' | 'manual' | 'other'
export type RestoreCheck = { check: string; ok: boolean; note?: string }

export type BackupRestoreTest = {
  id: string
  test_no: string
  tested_on: string
  backup_kind: BackupKind
  backup_id: string | null
  backup_name: string | null
  backup_taken_at: string | null
  restored_to: string
  checks_done: RestoreCheck[]
  result: RunResult
  restore_minutes: number | null
  performed_by: string
  witnessed_by: string | null
  linked_incident_id: string | null
  remarks: string | null
  created_at: string
}

export type NcOption = { id: string; nc_id: string; status: string; description: string }

// ---------------------------------------------------------------- labels

export const RISK_LABEL: Record<ChangeRisk, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  deployed: 'Deployed',
  rolled_back: 'Rolled back',
  cancelled: 'Cancelled',
}

export const SCOPE_LABEL: Record<ValidationScope, string> = {
  IQ: 'IQ — installation',
  OQ: 'OQ — operation',
  PQ: 'PQ — performance',
  regression: 'Regression',
  calculation: 'Calculation check (7.11.6)',
}

export const ENVIRONMENT_LABEL: Record<ValidationEnvironment, string> = {
  staging: 'Staging',
  production: 'Production',
  local: 'Local machine',
}

export const RESULT_LABEL: Record<RunResult, string> = { pass: 'Pass', fail: 'Fail', partial: 'Partial' }

export const INCIDENT_CATEGORY_LABEL: Record<IncidentCategory, string> = {
  outage: 'Outage / not available',
  data_integrity: 'Data integrity',
  security: 'Security',
  backup: 'Backup',
  performance: 'Performance',
  other: 'Other',
}

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  closed: 'Closed',
}

export const BACKUP_KIND_LABEL: Record<BackupKind, string> = {
  daily: 'Daily volume backup',
  weekly: 'Weekly volume backup',
  manual: 'Manual backup',
  other: 'Other',
}

/** Checks from docs/lims-validation/backup-restore-procedure.md, section 5. */
export const STANDARD_RESTORE_CHECKS: readonly string[] = [
  'Restored service starts and accepts connections',
  'Row counts match the reference list (samples, test results, issued reports, certificates, audit_log)',
  'Latest SRF / sample before the backup time is present',
  'Latest issued test report opens and re-prints from the archived copy',
  'Latest calibration certificate is present with its ULR',
  'Audit trail has entries up to the backup time',
  'Sign-in works with a test account (restored copy only)',
  'Restored copy deleted / detached after the test',
]

// ---------------------------------------------------------------- helpers

/** Laboratory Director or Quality Manager (Quality Assurance): same rule as the database. */
export function canWriteValidationRegisters(designation: string, departmentName: string): boolean {
  if (isLaboratoryDirector(designation)) return true
  return (
    designation.trim().toLowerCase() === 'quality manager' &&
    departmentName.trim().toLowerCase() === 'quality assurance'
  )
}

/** True when the register tables are not on this database yet. */
export function isValidationMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /(software_changes|validation_test_runs|it_incidents|backup_restore_tests)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function errorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Value for <input type="datetime-local">; '' for null. */
export function toLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${localDateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function localInputToIso(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function blankToNull(v: string): string | null {
  const t = v.trim()
  return t ? t : null
}

export function intOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Whole days between a yyyy-mm-dd date and today (local). */
export function daysSince(day: string, today = new Date()): number {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  const then = new Date(y, (m ?? 1) - 1, d ?? 1)
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((now.getTime() - then.getTime()) / 86_400_000)
}

/** A restore test is due every 90 days (backup-restore-procedure.md). */
export const RESTORE_TEST_INTERVAL_DAYS = 90

/**
 * Reads the JSON evidence written by `npm run validate:calculations`
 * (scripts/validation/run-calculation-validation.mjs) into run fields.
 * Returns null when the file is not that evidence.
 */
export function runFieldsFromCalculationEvidence(json: unknown): {
  title: string
  scope: ValidationScope
  appVersion: string
  commitSha: string | null
  executedAt: string | null
  result: RunResult
  total: number
  passed: number
  failed: number
  deviations: string
} | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (o.suite !== 'calculation-validation' || !Array.isArray(o.cases)) return null
  const summary = (o.summary ?? {}) as Record<string, unknown>
  const app = (o.app ?? {}) as Record<string, unknown>
  const cases = o.cases as Array<Record<string, unknown>>
  const failedCases = cases.filter((c) => c.status === 'fail')
  const known = cases.filter((c) => c.status === 'known_deviation')
  const total = Number(summary.total ?? cases.length) || cases.length
  const failed = Number(summary.failed ?? failedCases.length) || 0
  // Known deviations are neither passed nor failed: they are listed in deviations.
  const passed = Math.max(0, Math.min(total - failed, Number(summary.passed ?? total - failed - known.length) || 0))
  const devLines = [
    ...failedCases.map((c) => `FAIL ${String(c.id)}: ${String(c.title ?? '')}`),
    ...known.map((c) => `KNOWN ${String(c.id)}: ${String(c.note ?? c.title ?? '')}`),
  ]
  const commit = String(app.commit ?? '').trim().toLowerCase()
  return {
    title: `Calculation validation suite (${cases.length} reference cases)`,
    scope: 'calculation',
    appVersion: String(app.version ?? app.commit ?? '').trim() || 'unknown',
    commitSha: /^[0-9a-f]{7,40}$/.test(commit) ? commit : null,
    executedAt: typeof o.executedAt === 'string' ? o.executedAt : null,
    result: failed > 0 ? 'fail' : 'pass',
    total,
    passed,
    failed,
    deviations: devLines.join('\n'),
  }
}

// ---------------------------------------------------------------- classes

/** Inputs: 16px text on phones (no iOS zoom), compact on desktop. */
export const inputClass =
  'h-10 rounded-none border border-stone-500 bg-stone-50 text-base shadow-none focus-visible:border-amber-600 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-amber-500/20 sm:h-8 sm:text-sm'

export const textareaClass =
  'min-h-[64px] rounded-none border border-stone-500 bg-stone-50 text-base shadow-none sm:text-sm'

export const thClass =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200'

export const tdClass = 'border border-[#e7e0d4] px-2 py-1.5 align-top text-[12.5px] text-[#292524]'
