import {
  auditTypeLabel,
  formatDate,
  formatProposedRange,
  type AuditPlanRow,
  type AuditType,
} from '@/features/audit-mrm/audit-plan/types'
import {
  conformityLabel,
  normalizeConformity,
  type AuditChecklistItemRow,
  type ConformityValue,
} from '@/features/audit-mrm/audit-checklist/types'
import { ISO_17025_AUDIT_CLAUSE_COUNT } from '@/features/audit-mrm/audit-checklist/iso17025Clauses'

export type { AuditPlanRow, AuditType, AuditChecklistItemRow, ConformityValue }
export { auditTypeLabel, formatDate, formatProposedRange, conformityLabel, normalizeConformity }

export type AuditSummaryStats = {
  total: number
  answered: number
  yes: number
  no: number
  na: number
  observations: number
  nonConformities: number
}

export type AuditSummaryStatus = 'not_started' | 'in_progress' | 'completed'

export type SummaryFindingsTab = 'all' | 'yes' | 'nc' | 'na' | 'observations'

export function emptySummaryStats(total = ISO_17025_AUDIT_CLAUSE_COUNT): AuditSummaryStats {
  return {
    total,
    answered: 0,
    yes: 0,
    no: 0,
    na: 0,
    observations: 0,
    nonConformities: 0,
  }
}

export function computeSummaryStats(
  items: Array<{
    conformity?: string | null
    remark?: string | null
    non_conformity?: string | null
  }>,
): AuditSummaryStats {
  const stats = emptySummaryStats(items.length > 0 ? items.length : ISO_17025_AUDIT_CLAUSE_COUNT)
  if (items.length === 0) return stats

  stats.total = items.length
  for (const raw of items) {
    const c = normalizeConformity(raw.conformity)
    if (c === 'yes' || c === 'no' || c === 'na') {
      stats.answered += 1
      if (c === 'yes') stats.yes += 1
      if (c === 'no') stats.no += 1
      if (c === 'na') stats.na += 1
    }
    if (String(raw.remark ?? '').trim()) stats.observations += 1
    if (c === 'no') stats.nonConformities += 1
  }
  return stats
}

export function summaryStatus(stats: AuditSummaryStats): AuditSummaryStatus {
  if (stats.answered <= 0) return 'not_started'
  if (stats.total > 0 && stats.answered >= stats.total) return 'completed'
  return 'in_progress'
}

export function summaryStatusLabel(status: AuditSummaryStatus): string {
  if (status === 'completed') return 'Completed'
  if (status === 'in_progress') return 'In progress'
  return 'Not started'
}

export function mapChecklistItem(raw: Record<string, unknown>): AuditChecklistItemRow {
  return {
    id: String(raw.id),
    audit_plan_id: String(raw.audit_plan_id),
    clause_no: String(raw.clause_no ?? ''),
    clause_matter: String(raw.clause_matter ?? ''),
    conformity: normalizeConformity(raw.conformity),
    remark: String(raw.remark ?? ''),
    non_conformity: String(raw.non_conformity ?? ''),
    sort_order: Number(raw.sort_order ?? 0) || 0,
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  }
}
