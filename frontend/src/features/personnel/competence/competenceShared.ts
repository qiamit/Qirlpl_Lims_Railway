/**
 * Personnel competence (ISO/IEC 17025 6.2): types and helpers shared by the
 * competence pages. Tables: migration 20261027100400_personnel_competence.sql.
 */
import { supabase } from '@/lib/supabaseClient'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { assertAllowedUpload, fileExtension, uploadContentType } from '@/lib/validateUpload'
import type { AuthorizationActivity } from '@/lib/authorizationCheck'

export const PERSONNEL_BUCKET = 'personnel-records'
export const MIGRATION_NAME = '20261027100400_personnel_competence.sql'

export type RequirementType = 'education' | 'qualification' | 'experience' | 'training' | 'skill' | 'knowledge'

export const REQUIREMENT_TYPES: ReadonlyArray<{ value: RequirementType; label: string }> = [
  { value: 'education', label: 'Education' },
  { value: 'qualification', label: 'Qualification / certification' },
  { value: 'experience', label: 'Experience' },
  { value: 'training', label: 'Training' },
  { value: 'skill', label: 'Skill' },
  { value: 'knowledge', label: 'Knowledge' },
]

export type TrainingType = 'induction' | 'internal' | 'external' | 'on_the_job'
export const TRAINING_TYPES: ReadonlyArray<{ value: TrainingType; label: string }> = [
  { value: 'induction', label: 'Induction' },
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'on_the_job', label: 'On the job' },
]

export type MonitoringMethod =
  | 'witnessing'
  | 'replicate_testing'
  | 'retained_sample'
  | 'pt_ilc'
  | 'blind_sample'
  | 'review_of_records'
export const MONITORING_METHODS: ReadonlyArray<{ value: MonitoringMethod; label: string }> = [
  { value: 'witnessing', label: 'Witnessing of test / calibration' },
  { value: 'replicate_testing', label: 'Replicate testing' },
  { value: 'retained_sample', label: 'Retesting of retained sample' },
  { value: 'pt_ilc', label: 'PT / ILC result' },
  { value: 'blind_sample', label: 'Blind / reference sample' },
  { value: 'review_of_records', label: 'Review of records / reports' },
]

export type MonitoringResult = 'satisfactory' | 'needs_training' | 'unsatisfactory'
export const MONITORING_RESULTS: ReadonlyArray<{ value: MonitoringResult; label: string }> = [
  { value: 'satisfactory', label: 'Satisfactory' },
  { value: 'needs_training', label: 'Needs training' },
  { value: 'unsatisfactory', label: 'Unsatisfactory' },
]

export type AuthorizationStatus = 'active' | 'suspended' | 'withdrawn'

export type CompetenceRequirement = {
  id: string
  role: string
  department: string | null
  requirement_type: RequirementType
  description: string
  minimum_level: string | null
  mandatory: boolean
  sort_order: number
  active: boolean
  created_at: string
}

export type Qualification = {
  id: string
  user_id: string
  qualification_type: RequirementType
  title: string
  institution: string | null
  year: number | null
  requirement_id: string | null
  document_path: string | null
  verified_by: string | null
  verified_by_name: string | null
  verified_on: string | null
  remarks: string | null
  created_at: string
}

export type TrainingRecord = {
  id: string
  record_no: string | null
  title: string
  topic: string | null
  training_type: TrainingType
  trainer: string | null
  held_from: string
  held_to: string | null
  duration_hours: number | null
  material_path: string | null
  evaluation_method: string | null
  requirement_id: string | null
  test_parameter_id: string | null
  remarks: string | null
  created_at: string
}

export type TrainingAttendee = {
  id: string
  training_id: string
  user_id: string
  attended: boolean
  score: number | null
  passed: boolean | null
  effectiveness_review: string | null
  effectiveness_rating: number | null
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_on: string | null
}

export type MonitoringRecord = {
  id: string
  user_id: string
  method: MonitoringMethod
  test_parameter_id: string | null
  calibration_scope_id: string | null
  performed_on: string
  result: MonitoringResult
  reference: string | null
  pt_participation_id: string | null
  observed_by: string | null
  observed_by_name: string | null
  remarks: string | null
  follow_up: string | null
  created_at: string
}

export type AuthorizationRow = {
  id: string
  user_id: string
  activity: AuthorizationActivity
  scope_kind: 'testing' | 'calibration' | null
  test_parameter_id: string | null
  calibration_scope_id: string | null
  discipline: string | null
  group_name: string | null
  valid_from: string
  valid_to: string | null
  authorized_by: string | null
  authorized_by_name: string | null
  authorized_on: string
  basis: string | null
  status: AuthorizationStatus
  withdrawn_reason: string | null
  status_changed_at: string | null
  remarks: string | null
  created_at: string
}

export type AuthorizationException = {
  id: string
  activity: AuthorizationActivity
  user_id: string | null
  user_name: string | null
  test_parameter_ids: string[]
  calibration_scope_ids: string[]
  mode: 'warn' | 'override'
  reason: string
  record_table: string | null
  record_id: string | null
  record_label: string | null
  created_by_name: string | null
  created_at: string
}

export type TestParameterOption = {
  id: string
  item_name: string
  department: string | null
  is_code_label: string | null
  test_method: string | null
}

export type ScopeOption = {
  id: string
  s_no: number | null
  measurand: string
  calibration_method: string | null
  discipline_name: string | null
  group_name: string | null
}

/** True when the competence tables are not on this database yet. */
export function isCompetenceMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /(competence_requirements|personnel_qualifications|training_records|training_attendees|competence_monitoring|personnel_authorizations|authorization_exceptions)/.test(
      msg,
    ) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function errText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isQualityManager(designation: string, department: string): boolean {
  return norm(designation) === 'quality manager' && norm(department) === 'quality assurance'
}

/** Director / Quality Manager: may grant and withdraw authorizations. */
export function canAuthorize(designation: string, department: string): boolean {
  return isLaboratoryDirector(designation) || isQualityManager(designation, department)
}

/** Director / Quality Manager / Technical Manager: may maintain competence records. */
export function canManageCompetence(designation: string, department: string): boolean {
  return canAuthorize(designation, department) || norm(designation) === 'technical manager'
}

export function labelOf<T extends string>(list: ReadonlyArray<{ value: T; label: string }>, v: string | null | undefined): string {
  return list.find((x) => x.value === v)?.label ?? (v || '—')
}

export async function loadTestParameterOptions(): Promise<TestParameterOption[]> {
  const { data, error } = await supabase
    .from('test_parameters')
    .select('id, item_name, department, is_code_label, test_method')
    .order('item_name')
  if (error) throw error
  return (data ?? []) as TestParameterOption[]
}

export async function loadScopeOptions(): Promise<ScopeOption[]> {
  const { data, error } = await supabase
    .from('calibration_nabl_scope')
    .select('id, s_no, measurand, calibration_method, discipline_name, group_name')
    .order('s_no')
  if (error) {
    console.warn('[competence] calibration scope not loaded', error)
    return []
  }
  return (data ?? []) as ScopeOption[]
}

export function parameterLabel(p: TestParameterOption | undefined): string {
  if (!p) return 'Unknown parameter'
  const code = (p.is_code_label ?? '').trim()
  return code ? `${p.item_name} (${code})` : p.item_name
}

export function scopeLabel(s: ScopeOption | undefined): string {
  if (!s) return 'Unknown scope line'
  return `${s.s_no ?? ''} ${s.measurand}`.trim() + (s.group_name ? ` · ${s.group_name}` : '')
}

/** Human text for the scope of a grant. */
export function authorizationScopeText(
  a: Pick<AuthorizationRow, 'test_parameter_id' | 'calibration_scope_id' | 'discipline' | 'group_name' | 'scope_kind'>,
  tpById: Map<string, TestParameterOption>,
  scopeById: Map<string, ScopeOption>,
): string {
  if (a.test_parameter_id) return parameterLabel(tpById.get(a.test_parameter_id))
  if (a.calibration_scope_id) return `Scope ${scopeLabel(scopeById.get(a.calibration_scope_id))}`
  if (a.discipline || a.group_name) {
    const kind = a.scope_kind === 'calibration' ? 'Calibration' : a.scope_kind === 'testing' ? 'Testing' : ''
    return [kind, a.discipline, a.group_name].filter(Boolean).join(' · ') + ' (group)'
  }
  return 'Whole activity'
}

/** Active and inside its validity window today. */
export function isAuthorizationCurrent(a: Pick<AuthorizationRow, 'status' | 'valid_from' | 'valid_to'>, today = todayKey()): boolean {
  return a.status === 'active' && a.valid_from <= today && (!a.valid_to || a.valid_to >= today)
}

export type AuthorizationState = 'current' | 'future' | 'expired' | 'suspended' | 'withdrawn'

export function authorizationState(a: Pick<AuthorizationRow, 'status' | 'valid_from' | 'valid_to'>, today = todayKey()): AuthorizationState {
  if (a.status === 'withdrawn') return 'withdrawn'
  if (a.status === 'suspended') return 'suspended'
  if (a.valid_from > today) return 'future'
  if (a.valid_to && a.valid_to < today) return 'expired'
  return 'current'
}

/** Upload evidence to the private personnel-records bucket; returns the storage path. */
export async function uploadPersonnelFile(folder: string, file: File): Promise<string> {
  assertAllowedUpload(file, {
    extensions: new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']),
  })
  const ext = fileExtension(file)
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const contentType =
    ext === 'ppt'
      ? 'application/vnd.ms-powerpoint'
      : ext === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : uploadContentType(file)
  const { error } = await supabase.storage.from(PERSONNEL_BUCKET).upload(path, file, { upsert: false, contentType })
  if (error) throw error
  return path
}

export async function openPersonnelFile(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(PERSONNEL_BUCKET).createSignedUrl(path, 600)
  if (error) throw error
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}
