import {
  auditTypeLabel,
  formatDate,
  formatProposedRange,
  type AuditPlanRow,
  type AuditType,
} from '@/features/audit-mrm/audit-plan/types'

export type { AuditPlanRow, AuditType }
export { auditTypeLabel, formatDate, formatProposedRange }

export type ConformityValue = '' | 'yes' | 'no' | 'na'

export type AuditChecklistItemRow = {
  id: string
  audit_plan_id: string
  clause_no: string
  clause_matter: string
  conformity: ConformityValue
  remark: string
  non_conformity: string
  sort_order: number
  updated_at?: string
}

export type ChecklistProgress = {
  total: number
  answered: number
}

export const CONFORMITY_OPTIONS: Array<{ value: Exclude<ConformityValue, ''>; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
]

export function normalizeConformity(raw: unknown): ConformityValue {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'yes' || v === 'no' || v === 'na') return v
  return ''
}

export function conformityLabel(value: ConformityValue): string {
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  if (value === 'na') return 'N/A'
  return '—'
}

/** Client-side validation for a checklist answer row. */
export function validateChecklistItem(item: {
  conformity: ConformityValue
  remark: string
  non_conformity: string
}): string | null {
  if (item.conformity === 'yes') {
    if (!item.remark.trim()) return 'Observation is required when Conformity is Yes.'
  }
  if (item.conformity === 'no') {
    if (!item.non_conformity.trim()) return 'Non Conformity is required when Conformity is No.'
    if (!item.remark.trim()) return 'Observation is required when Conformity is No.'
  }
  return null
}

export function isItemAnswered(item: { conformity: ConformityValue }): boolean {
  return item.conformity === 'yes' || item.conformity === 'no' || item.conformity === 'na'
}
