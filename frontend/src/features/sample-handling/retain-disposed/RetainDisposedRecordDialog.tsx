import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import {
  computeDefaultDisposedDate,
  computeRetentionDueDate,
  deriveRetentionStatus,
  SAMPLE_RETENTION_DAYS,
  type SampleDisposalOutcome,
} from './sampleRetention'
import type { RetainDisposedListRow } from './types'

export function RetainDisposedRecordDialog({
  open,
  onOpenChange,
  row,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: RetainDisposedListRow | null
  saving: boolean
  onSave: (payload: {
    quantityRetained: string
    quantityDisposed: string
    disposedAt: string
    disposalOutcome: SampleDisposalOutcome | ''
  }) => Promise<void>
}) {
  const [quantityRetained, setQuantityRetained] = useState('')
  const [quantityDisposed, setQuantityDisposed] = useState('')
  const [disposedAt, setDisposedAt] = useState('')
  const [disposalOutcome, setDisposalOutcome] = useState<SampleDisposalOutcome | ''>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !row) return
    const defaultDisposedAt = computeDefaultDisposedDate(row.issuedAt) ?? ''
    setQuantityRetained(row.quantityRetained ?? row.sampleQuantity ?? '')
    setQuantityDisposed(row.quantityDisposed ?? '')
    setDisposedAt(row.disposedAt?.slice(0, 10) || defaultDisposedAt)
    setDisposalOutcome(row.disposalOutcome ?? '')
    setError(null)
  }, [open, row])

  if (!row) return null

  const retentionDue =
    row.retentionDueDate ?? computeRetentionDueDate(row.issuedAt) ?? ''
  const previewStatus = deriveRetentionStatus({
    issuedAt: row.issuedAt,
    disposedAt: disposedAt || null,
    disposalOutcome: disposalOutcome || null,
    retentionDueDate: retentionDue || null,
  })

  const handleSubmit = async () => {
    setError(null)
    if (!quantityRetained.trim()) {
      setError('Quantity Retained is required.')
      return
    }
    const closing = Boolean(disposedAt.trim() || disposalOutcome)
    if (closing) {
      if (!disposedAt.trim()) {
        setError('Date of Disposed is required when recording disposal or return.')
        return
      }
      if (!disposalOutcome) {
        setError('Select whether the sample was Disposed or Returned to Customer.')
        return
      }
      if (!quantityDisposed.trim()) {
        setError('Quantity Disposed is required when closing retention.')
        return
      }
    }

    try {
      await onSave({
        quantityRetained: quantityRetained.trim(),
        quantityDisposed: quantityDisposed.trim(),
        disposedAt: disposedAt.trim(),
        disposalOutcome,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Sample Retention / Disposal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">SRF:</span>{' '}
              <span className="font-semibold">{row.srfNumber ?? '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Test report issued:</span>{' '}
              {formatDate(row.issuedAt ?? '')}
            </p>
            <p>
              <span className="text-muted-foreground">Retention due ({SAMPLE_RETENTION_DAYS} days):</span>{' '}
              <span className={previewStatus === 'due' ? 'font-semibold text-rose-600' : 'font-medium'}>
                {formatDate(retentionDue)}
              </span>
            </p>
            <p className="text-muted-foreground pt-1">
              After {SAMPLE_RETENTION_DAYS} days from issue, sample must be disposed or returned to the
              customer. Default disposal date is the 91st day after report issue.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ret-qty-retained">Quantity Retained</Label>
              <Input
                id="ret-qty-retained"
                value={quantityRetained}
                onChange={(e) => setQuantityRetained(e.target.value)}
                placeholder="e.g. 2 kg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-qty-disposed">Quantity Disposed</Label>
              <Input
                id="ret-qty-disposed"
                value={quantityDisposed}
                onChange={(e) => setQuantityDisposed(e.target.value)}
                placeholder="e.g. 1 kg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ret-disposed-at">Date of Disposed</Label>
              <Input
                id="ret-disposed-at"
                type="date"
                value={disposedAt}
                onChange={(e) => setDisposedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Disposal Outcome</Label>
              <Select
                value={disposalOutcome || 'unset'}
                onValueChange={(v) =>
                  setDisposalOutcome(v === 'unset' ? '' : (v as SampleDisposalOutcome))
                }
              >
                <SelectTrigger aria-label="Disposal outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not closed yet</SelectItem>
                  <SelectItem value="disposed">Disposed</SelectItem>
                  <SelectItem value="returned_to_customer">Returned to Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
