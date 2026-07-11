import { addDays } from '@/features/sample-handling/types'

export const SAMPLE_RETENTION_DAYS = 90

export type SampleRetentionStatus = 'retained' | 'due' | 'disposed' | 'returned'

export type SampleDisposalOutcome = 'disposed' | 'returned_to_customer'

export function issuedDateOnly(issuedAt: string | null | undefined): string | null {
  if (!issuedAt?.trim()) return null
  return issuedAt.slice(0, 10)
}

export function computeRetentionDueDate(issuedAt: string | null | undefined): string | null {
  const issued = issuedDateOnly(issuedAt)
  if (!issued) return null
  return addDays(issued, SAMPLE_RETENTION_DAYS)
}

/** Default disposal date: 91st day after test report issue (day after retention ends). */
function compareRetentionDueAsc(
  da: string | null | undefined,
  db: string | null | undefined,
): number {
  const a = da ?? ''
  const b = db ?? ''
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b)
}

/** Retained rows first (earliest due first); all other statuses last. */
export function compareRetainDisposedRows<
  T extends { retentionDueDate: string | null; retentionStatus: SampleRetentionStatus },
>(a: T, b: T): number {
  const aRetained = a.retentionStatus === 'retained'
  const bRetained = b.retentionStatus === 'retained'
  if (aRetained !== bRetained) return aRetained ? -1 : 1
  return compareRetentionDueAsc(a.retentionDueDate, b.retentionDueDate)
}

/** Red blink when retention due date is today or already passed. */
export function shouldHighlightRetentionDue(retentionDueDate: string | null | undefined): boolean {
  const due = retentionDueDate?.trim().slice(0, 10)
  if (!due) return false
  const today = new Date().toISOString().slice(0, 10)
  return today >= due
}

/** Default disposal date: 91st day after test report issue (day after retention ends). */
export function computeDefaultDisposedDate(issuedAt: string | null | undefined): string | null {
  const issued = issuedDateOnly(issuedAt)
  if (!issued) return null
  return addDays(issued, SAMPLE_RETENTION_DAYS + 1)
}

export function deriveRetentionStatus(params: {
  issuedAt: string | null
  disposedAt: string | null
  disposalOutcome: string | null
  retentionDueDate: string | null
  storedStatus?: string | null
}): SampleRetentionStatus {
  if (params.disposalOutcome === 'returned_to_customer' || params.storedStatus === 'returned') {
    return 'returned'
  }
  if (params.disposedAt || params.disposalOutcome === 'disposed' || params.storedStatus === 'disposed') {
    return 'disposed'
  }
  const due = params.retentionDueDate ?? computeRetentionDueDate(params.issuedAt)
  if (!due) return 'retained'
  const today = new Date().toISOString().slice(0, 10)
  if (today >= due) return 'due'
  return 'retained'
}

export function retentionStatusLabel(status: SampleRetentionStatus): string {
  switch (status) {
    case 'retained':
      return 'Retained'
    case 'due':
      return 'Due for Disposal'
    case 'disposed':
      return 'Disposed'
    case 'returned':
      return 'Returned to Customer'
    default:
      return status
  }
}

export function disposalOutcomeLabel(outcome: string | null | undefined): string {
  if (outcome === 'returned_to_customer') return 'Returned to Customer'
  if (outcome === 'disposed') return 'Disposed'
  return '—'
}

export function buildSampleRetentionIssuePayload(
  issuedAtIso: string,
  sampleQuantity?: string | null,
): Record<string, string | null> {
  const issueDate = issuedAtIso.slice(0, 10)
  return {
    sample_retention_due_date: addDays(issueDate, SAMPLE_RETENTION_DAYS),
    sample_retention_status: 'retained',
    quantity_retained: sampleQuantity?.trim() || null,
    quantity_disposed: null,
    sample_disposed_at: null,
    sample_disposal_outcome: null,
  }
}

export function clearSampleRetentionPayload(): Record<string, null> {
  return {
    sample_retention_due_date: null,
    sample_retention_status: null,
    quantity_retained: null,
    quantity_disposed: null,
    sample_disposed_at: null,
    sample_disposal_outcome: null,
  }
}
