import { getCompanyInitials } from '@/features/settings/lab-settings/brandMark'

export type AuditType = 'internal' | 'external'

/** Persisted team row in audit_plans.team_rows jsonb */
export type AuditTeamRow = {
  auditeeDivision: string
  auditeeDepartment: string
  auditeeDesignation: string
  auditorDivision: string
  auditorDepartment: string
  auditorDesignation: string
  criteriaClauseNos: string[]
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
}

export type AuditPlanForm = {
  auditType: AuditType
  proposedFrom: string
  proposedTo: string
  auditId: string
  nextAuditDate: string
  teamRows: AuditTeamFormRow[]
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
        }))
      : [emptyTeamRow()]

  return {
    auditType: row.audit_type === 'external' ? 'external' : 'internal',
    proposedFrom: (row.proposed_from ?? '').slice(0, 10),
    proposedTo: (row.proposed_to ?? '').slice(0, 10),
    auditId: asCopy ? nextAuditId : row.audit_id,
    nextAuditDate: (row.next_audit_date ?? '').slice(0, 10),
    teamRows: team,
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

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Display dates as DD-MMM-YY (e.g. 10-Aug-26). Parses YYYY-MM-DD without timezone shift. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = value.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return d || '—'
  const monthIdx = Number(m[2]) - 1
  if (monthIdx < 0 || monthIdx > 11) return d
  return `${m[3]}-${MONTH_ABBR[monthIdx]}-${m[1].slice(2)}`
}

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
