import { getCompanyInitials } from '@/features/settings/lab-settings/brandMark'
import { formatDate } from '@/lib/utils'

export type AuditType = 'internal' | 'external'

/** NABL: system (horizontal) audit, vertical audit (one job traced end to end), witness audit. */
export type AuditKind = 'system' | 'vertical' | 'witness'

/** Team row where the auditor is from the audited department (ISO/IEC 17025 8.8.2). */
export type IndependenceConflict = {
  row: number
  auditee_department: string
  auditor_department: string
  auditor_name: string | null
}

/** Persisted team row in audit_plans.team_rows jsonb */
export type AuditTeamRow = {
  auditeeDivision: string
  auditeeDepartment: string
  auditeeDesignation: string
  auditorDivision: string
  auditorDepartment: string
  auditorDesignation: string
  criteriaClauseNos: string[]
  /** Auditor person (user_profiles.id) — used for the independence check. */
  auditorUserId?: string
  auditorName?: string
  /** Legacy free-text (read-only migration aid; not written on new saves) */
  auditee?: string
  auditor?: string
  criteria?: string
}

export type AuditPlanRow = {
  id: string
  audit_type: AuditType
  proposed_from: string
  proposed_to: string
  audit_id: string
  next_audit_date: string
  team_rows: AuditTeamRow[]
  /** Columns from 20261028100100_risk_scoring_audit_coverage.sql (absent before it). */
  audit_kind?: AuditKind
  scope_discipline?: string | null
  witnessed_user_id?: string | null
  witnessed_name?: string | null
  sample_ref?: string | null
  independence_conflicts?: IndependenceConflict[]
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type AuditTeamFormRow = {
  key: string
  auditeeDivision: string
  auditeeDepartment: string
  auditeeDesignation: string
  auditorDivision: string
  auditorDepartment: string
  auditorDesignation: string
  criteriaClauseNos: string[]
  auditorUserId: string
  auditorName: string
}

export type AuditPlanForm = {
  auditType: AuditType
  proposedFrom: string
  proposedTo: string
  auditId: string
  nextAuditDate: string
  teamRows: AuditTeamFormRow[]
  auditKind: AuditKind
  scopeDiscipline: string
  witnessedUserId: string
  witnessedName: string
  sampleRef: string
}

export const AUDIT_KINDS: Array<{ value: AuditKind; label: string }> = [
  { value: 'system', label: 'System / horizontal' },
  { value: 'vertical', label: 'Vertical (job traced end to end)' },
  { value: 'witness', label: 'Witness (activity observed)' },
]

export function auditKindLabel(kind: AuditKind | string | null | undefined): string {
  if (kind === 'vertical') return 'Vertical'
  if (kind === 'witness') return 'Witness'
  return 'System'
}

export function normalizeAuditKind(raw: unknown): AuditKind {
  return raw === 'vertical' || raw === 'witness' ? raw : 'system'
}

export function normalizeIndependenceConflicts(raw: unknown): IndependenceConflict[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .map((c) => ({
      row: Number(c.row) || 0,
      auditee_department: String(c.auditee_department ?? ''),
      auditor_department: String(c.auditor_department ?? ''),
      auditor_name: c.auditor_name == null ? null : String(c.auditor_name),
    }))
}

/**
 * Same rule as app_audit_team_conflicts() in the database: the auditor's
 * department is the chosen person's profile department, else the department
 * picked on the row; equal (case-insensitive) to the auditee department = conflict.
 */
export function teamIndependenceConflicts(
  rows: Array<Pick<AuditTeamFormRow, 'auditeeDepartment' | 'auditorDepartment' | 'auditorUserId' | 'auditorName' | 'auditorDesignation'>>,
  profileDeptById: Map<string, { department: string; name: string }>,
): IndependenceConflict[] {
  const out: IndependenceConflict[] = []
  rows.forEach((r, index) => {
    const auditee = r.auditeeDepartment.trim()
    if (!auditee) return
    const profile = r.auditorUserId ? profileDeptById.get(r.auditorUserId) : undefined
    const auditorDept = profile?.department.trim() || r.auditorDepartment.trim()
    if (auditorDept.toLowerCase() !== auditee.toLowerCase()) return
    out.push({
      row: index + 1,
      auditee_department: auditee,
      auditor_department: auditorDept,
      auditor_name: profile?.name || r.auditorName.trim() || r.auditorDesignation.trim() || null,
    })
  })
  return out
}

export function describeIndependenceConflict(c: IndependenceConflict): string {
  const who = c.auditor_name ? `${c.auditor_name} (${c.auditor_department})` : `an auditor from ${c.auditor_department}`
  return `Row ${c.row}: ${who} audits own department ${c.auditee_department}`
}

export const AUDIT_TYPES: Array<{ value: AuditType; label: string }> = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
]

function newRowKey() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function emptyTeamRow(): AuditTeamFormRow {
  return {
    key: newRowKey(),
    auditeeDivision: '',
    auditeeDepartment: '',
    auditeeDesignation: '',
    auditorDivision: '',
    auditorDepartment: '',
    auditorDesignation: '',
    criteriaClauseNos: [],
    auditorUserId: '',
    auditorName: '',
  }
}

export function emptyAuditPlanForm(auditId = ''): AuditPlanForm {
  return {
    auditType: 'internal',
    proposedFrom: '',
    proposedTo: '',
    auditId,
    nextAuditDate: '',
    teamRows: [emptyTeamRow()],
    auditKind: 'system',
    scopeDiscipline: '',
    witnessedUserId: '',
    witnessedName: '',
    sampleRef: '',
  }
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const s = item.trim()
      if (s) out.push(s)
      continue
    }
    if (item && typeof item === 'object') {
      const no = String((item as { no?: unknown; clauseNo?: unknown }).no
        ?? (item as { clauseNo?: unknown }).clauseNo
        ?? '').trim()
      if (no) out.push(no)
    }
  }
  return out
}

function teamRowHasContent(r: AuditTeamRow): boolean {
  return Boolean(
    r.auditeeDivision ||
      r.auditeeDepartment ||
      r.auditeeDesignation ||
      r.auditorDivision ||
      r.auditorDepartment ||
      r.auditorDesignation ||
      r.criteriaClauseNos.length > 0 ||
      r.auditorUserId ||
      r.auditee ||
      r.auditor ||
      r.criteria,
  )
}

export function normalizeTeamRows(raw: unknown): AuditTeamRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const r = (item ?? {}) as Record<string, unknown>
    const criteriaClauseNos = asStringArray(r.criteriaClauseNos ?? r.criteriaClauses)
    return {
      auditeeDivision: String(r.auditeeDivision ?? '').trim(),
      auditeeDepartment: String(r.auditeeDepartment ?? '').trim(),
      auditeeDesignation: String(r.auditeeDesignation ?? '').trim(),
      auditorDivision: String(r.auditorDivision ?? '').trim(),
      auditorDepartment: String(r.auditorDepartment ?? '').trim(),
      auditorDesignation: String(r.auditorDesignation ?? '').trim(),
      criteriaClauseNos,
      auditorUserId: String(r.auditorUserId ?? '').trim() || undefined,
      auditorName: String(r.auditorName ?? '').trim() || undefined,
      auditee: String(r.auditee ?? '').trim() || undefined,
      auditor: String(r.auditor ?? '').trim() || undefined,
      criteria: String(r.criteria ?? '').trim() || undefined,
    }
  })
}

export function formatOrgTriple(division: string, department: string, designation: string): string {
  const parts = [division, department, designation].map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts.join(' / ') : ''
}

export function formatTeamAuditee(row: AuditTeamRow): string {
  const structured = formatOrgTriple(row.auditeeDivision, row.auditeeDepartment, row.auditeeDesignation)
  if (structured) return structured
  return (row.auditee ?? '').trim()
}

export function formatTeamAuditor(row: AuditTeamRow): string {
  const structured = formatOrgTriple(row.auditorDivision, row.auditorDepartment, row.auditorDesignation)
  if (structured) return structured
  return (row.auditor ?? '').trim()
}

export function formatTeamCriteria(row: AuditTeamRow): string {
  if (row.criteriaClauseNos.length > 0) {
    return row.criteriaClauseNos.join(', ')
  }
  return (row.criteria ?? '').trim()
}

export function rowToForm(row: AuditPlanRow, asCopy = false, nextAuditId = ''): AuditPlanForm {
  const team =
    row.team_rows && row.team_rows.length > 0
      ? row.team_rows.map((t) => ({
          key: newRowKey(),
          auditeeDivision: t.auditeeDivision ?? '',
          auditeeDepartment: t.auditeeDepartment ?? '',
          auditeeDesignation: t.auditeeDesignation ?? '',
          auditorDivision: t.auditorDivision ?? '',
          auditorDepartment: t.auditorDepartment ?? '',
          auditorDesignation: t.auditorDesignation ?? '',
          criteriaClauseNos: [...(t.criteriaClauseNos ?? [])],
          auditorUserId: t.auditorUserId ?? '',
          auditorName: t.auditorName ?? '',
        }))
      : [emptyTeamRow()]

  return {
    auditType: row.audit_type === 'external' ? 'external' : 'internal',
    proposedFrom: (row.proposed_from ?? '').slice(0, 10),
    proposedTo: (row.proposed_to ?? '').slice(0, 10),
    auditId: asCopy ? nextAuditId : row.audit_id,
    nextAuditDate: (row.next_audit_date ?? '').slice(0, 10),
    teamRows: team,
    auditKind: normalizeAuditKind(row.audit_kind),
    scopeDiscipline: row.scope_discipline ?? '',
    witnessedUserId: row.witnessed_user_id ?? '',
    witnessedName: row.witnessed_name ?? '',
    sampleRef: row.sample_ref ?? '',
  }
}

export function formTeamToPayload(rows: AuditTeamFormRow[]): AuditTeamRow[] {
  return rows
    .map((r) => ({
      auditeeDivision: r.auditeeDivision.trim(),
      auditeeDepartment: r.auditeeDepartment.trim(),
      auditeeDesignation: r.auditeeDesignation.trim(),
      auditorDivision: r.auditorDivision.trim(),
      auditorDepartment: r.auditorDepartment.trim(),
      auditorDesignation: r.auditorDesignation.trim(),
      criteriaClauseNos: [...r.criteriaClauseNos],
      ...(r.auditorUserId.trim()
        ? { auditorUserId: r.auditorUserId.trim(), auditorName: r.auditorName.trim() }
        : {}),
    }))
    .filter(teamRowHasContent)
}

/** Exactly 2 letters from laboratory / firm name (fallback QI). */
export function getAuditFirmInitials(labName: string, fallback = 'QI'): string {
  const raw = getCompanyInitials(labName, fallback).replace(/[^A-Za-z]/g, '').toUpperCase()
  if (raw.length >= 2) return raw.slice(0, 2)
  if (raw.length === 1) return `${raw}${fallback[1] ?? 'I'}`.slice(0, 2)
  return fallback.slice(0, 2).toUpperCase()
}

/** Next Audit ID: {INITIALS}/AP-01, /AP-02, … from max existing sequence. */
export function nextAuditPlanId(firmInitials: string, existingIds: string[]): string {
  const initials = (firmInitials || 'QI').slice(0, 2).toUpperCase()
  let max = 0
  for (const id of existingIds) {
    const m = String(id).match(/\/AP-(\d+)$/i)
    if (!m) continue
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${initials}/AP-${String(max + 1).padStart(2, '0')}`
}

export { formatDate }

export function formatProposedRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = formatDate(from)
  const b = formatDate(to)
  if (a === '—' && b === '—') return '—'
  return `${a} – ${b}`
}

export function auditTypeLabel(type: AuditType | string | null | undefined): string {
  if (type === 'external') return 'External'
  return 'Internal'
}
