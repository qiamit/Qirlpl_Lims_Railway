import type { SampleDisposalOutcome, SampleRetentionStatus } from './sampleRetention'

export type RetainDisposedListRow = {
  id: string
  srfNumber: string | null
  isCodeId: string | null
  isCodeLabel: string | null
  sampleQuantity: string | null
  issuedAt: string | null
  retentionDueDate: string | null
  quantityRetained: string | null
  quantityDisposed: string | null
  disposedAt: string | null
  disposalOutcome: SampleDisposalOutcome | null
  retentionStatus: SampleRetentionStatus
}

export type RetainDisposedFilter = 'all' | 'retained' | 'due' | 'closed'
