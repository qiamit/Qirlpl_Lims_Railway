import {
  auditTypeLabel,
  formatDate,
  formatProposedRange,
  type AuditType,
} from '@/features/audit-mrm/audit-plan/types'
import {
  mapChecklistItem,
  type AuditChecklistItemRow,
} from '@/features/audit-mrm/audit-summary/types'

export type { AuditChecklistItemRow, AuditType }
export { auditTypeLabel, formatDate, formatProposedRange, mapChecklistItem }

/** Derived CAPA workflow status from audit_nc_actions field content. */
export type CapaStatus = 'not_started' | 'open' | 'in_progress' | 'closed'

export const CAPA_STATUS_LABEL: Record<CapaStatus, string> = {
  not_started: 'Not started',
  open: 'Open',
  in_progress: 'In Progress',
  closed: 'Closed',
}

/** One auto row = one checklist item marked Non Conforming (conformity = no). */
export type NonConformityRow = {
  id: string
  checklistItemId: string
  auditPlanId: string
  auditId: string
  auditType: AuditType
  proposedFrom: string
  proposedTo: string
  nextAuditDate: string
  clauseNo: string
  clauseMatter: string
  observation: string
  nonConformity: string
  sortOrder: number
  updatedAt?: string
  /** True when CAPA / action form has any saved content. */
  actionStarted?: boolean
  /** CAPA status derived from audit_nc_actions fields (completion stays in NCW CAPA hub). */
  capaStatus?: CapaStatus
}

export type NcActionFieldKey =
  | 'description_of_nc'
  | 'immediate_correction'
  | 'root_cause_analysis'
  | 'extent_check'
  | 'corrective_action_plan'
  | 'corrective_action_implemented'
  | 'review_of_effectiveness'
  | 'risk_opportunity_review'
  | 'changes_to_management_system'
  | 'objective_evidence'
  | 'verification_closure'

export type NcActionForm = Record<NcActionFieldKey, string>

export type NcEvidenceFile = {
  id: string
  name: string
  path: string
  uploadedAt: string
}

export type NcEvidenceByField = Partial<Record<NcActionFieldKey, NcEvidenceFile[]>>

/** Who filled a CAPA field (stamped on first save of non-empty content). */
export type NcFieldAuthor = {
  userId: string
  name: string
  designation: string
  department: string
  division: string
  /** ISO date YYYY-MM-DD (local calendar day when stamped). */
  date: string
}

export type NcFieldAuthors = Partial<Record<NcActionFieldKey, NcFieldAuthor>>

export const NC_EVIDENCE_BUCKET = 'audit-nc-evidence'

export const NC_ACTION_FIELDS: Array<{ key: NcActionFieldKey; label: string; step: number }> = [
  { key: 'description_of_nc', label: 'Description of Non Conformity', step: 1 },
  {
    key: 'immediate_correction',
    label: 'Immediate Correction & Handling of Consequences',
    step: 2,
  },
  { key: 'root_cause_analysis', label: 'Root Cause Analysis', step: 3 },
  {
    key: 'extent_check',
    label: 'Extent Check – Do Similar NC Exist Elsewhere?',
    step: 4,
  },
  { key: 'corrective_action_plan', label: 'Corrective Action Plan', step: 5 },
  { key: 'corrective_action_implemented', label: 'Corrective Action Implemented', step: 6 },
  {
    key: 'review_of_effectiveness',
    label: 'Review of Effectiveness of Corrective Action',
    step: 7,
  },
  { key: 'risk_opportunity_review', label: 'Risk & Opportunity Review / Update', step: 8 },
  { key: 'changes_to_management_system', label: 'Changes to Management System', step: 9 },
  { key: 'objective_evidence', label: 'Objective Evidence / Records Retained', step: 10 },
  { key: 'verification_closure', label: 'Verification & Closure', step: 11 },
]

export function emptyNcActionForm(): NcActionForm {
  return {
    description_of_nc: '',
    immediate_correction: '',
    root_cause_analysis: '',
    extent_check: '',
    corrective_action_plan: '',
    corrective_action_implemented: '',
    review_of_effectiveness: '',
    risk_opportunity_review: '',
    changes_to_management_system: '',
    objective_evidence: '',
    verification_closure: '',
  }
}

export function mapNcActionForm(raw: Record<string, unknown> | null | undefined): NcActionForm {
  const base = emptyNcActionForm()
  if (!raw) return base
  for (const { key } of NC_ACTION_FIELDS) {
    base[key] = String(raw[key] ?? '').trim()
  }
  return base
}

export function mapNcEvidenceByField(raw: unknown): NcEvidenceByField {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: NcEvidenceByField = {}
  for (const { key } of NC_ACTION_FIELDS) {
    const list = src[key]
    if (!Array.isArray(list)) continue
    const files: NcEvidenceFile[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      const path = String(r.path ?? '').trim()
      const name = String(r.name ?? '').trim()
      if (!path || !name) continue
      files.push({
        id: String(r.id ?? path),
        name,
        path,
        uploadedAt: String(r.uploadedAt ?? r.uploaded_at ?? ''),
      })
    }
    if (files.length > 0) out[key] = files
  }
  return out
}

export function mapNcFieldAuthors(raw: unknown): NcFieldAuthors {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: NcFieldAuthors = {}
  for (const { key } of NC_ACTION_FIELDS) {
    const item = src[key]
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const r = item as Record<string, unknown>
    const name = String(r.name ?? '').trim()
    if (!name) continue
    out[key] = {
      userId: String(r.userId ?? r.user_id ?? '').trim(),
      name,
      designation: String(r.designation ?? '').trim(),
      department: String(r.department ?? '').trim(),
      division: String(r.division ?? '').trim(),
      date: String(r.date ?? '').trim().slice(0, 10),
    }
  }
  return out
}

export function formatNcFieldAuthorLine(author: NcFieldAuthor): string {
  const parts = [
    author.name,
    author.designation,
    author.department,
    author.division,
    author.date,
  ].filter((p) => p.trim().length > 0)
  return parts.join(' · ')
}

export function isNcActionStarted(form: NcActionForm): boolean {
  return NC_ACTION_FIELDS.some(({ key }) => form[key].trim().length > 0)
}

/**
 * Derive list CAPA status from saved action fields (and optional evidence).
 * Closed = verification & closure filled; In Progress = mid/late CAPA steps;
 * Open = early CAPA content only; Not started = empty.
 */
export function deriveCapaStatus(
  form: NcActionForm,
  options?: { hasEvidence?: boolean },
): CapaStatus {
  if (form.verification_closure.trim().length > 0) return 'closed'

  const midOrLateKeys: NcActionFieldKey[] = [
    'root_cause_analysis',
    'extent_check',
    'corrective_action_plan',
    'corrective_action_implemented',
    'review_of_effectiveness',
    'risk_opportunity_review',
    'changes_to_management_system',
    'objective_evidence',
  ]
  if (midOrLateKeys.some((key) => form[key].trim().length > 0)) return 'in_progress'

  const earlyStarted =
    form.description_of_nc.trim().length > 0 ||
    form.immediate_correction.trim().length > 0 ||
    Boolean(options?.hasEvidence)
  if (earlyStarted) return 'open'

  return 'not_started'
}

export function buildNonConformityRows(
  plans: Array<{
    id: string
    audit_id: string
    audit_type: AuditType
    proposed_from: string
    proposed_to: string
    next_audit_date: string
  }>,
  items: AuditChecklistItemRow[],
  actionStartedByItemId?: Record<string, boolean>,
  capaStatusByItemId?: Record<string, CapaStatus>,
): NonConformityRow[] {
  const planById = new Map(plans.map((p) => [p.id, p]))
  const rows: NonConformityRow[] = []

  for (const item of items) {
    if (item.conformity !== 'no') continue
    const plan = planById.get(item.audit_plan_id)
    if (!plan) continue
    const capaStatus = capaStatusByItemId?.[item.id] ?? 'not_started'
    rows.push({
      id: item.id,
      checklistItemId: item.id,
      auditPlanId: plan.id,
      auditId: plan.audit_id,
      auditType: plan.audit_type,
      proposedFrom: plan.proposed_from,
      proposedTo: plan.proposed_to,
      nextAuditDate: plan.next_audit_date,
      clauseNo: item.clause_no,
      clauseMatter: item.clause_matter,
      observation: item.remark,
      nonConformity: item.non_conformity,
      sortOrder: item.sort_order,
      updatedAt: item.updated_at,
      actionStarted: Boolean(actionStartedByItemId?.[item.id]),
      capaStatus,
    })
  }

  rows.sort((a, b) => {
    const auditCmp = a.auditId.localeCompare(b.auditId)
    if (auditCmp !== 0) return auditCmp
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.clauseNo.localeCompare(b.clauseNo, undefined, { numeric: true })
  })

  return rows
}
