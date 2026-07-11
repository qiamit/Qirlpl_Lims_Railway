import { Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { disposalOutcomeLabel } from './sampleRetention'
import type { RetainDisposedListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function RetainDisposedQuantityDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: RetainDisposedListRow | null
}) {
  if (!row) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Sample Quantity Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">SRF:</span>{' '}
              <span className="font-semibold">{fmt(row.srfNumber)}</span>
            </p>
            {row.isCodeLabel ? (
              <p>
                <span className="text-muted-foreground">IS Code:</span> {row.isCodeLabel}
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex justify-between gap-3 rounded-md border border-border px-3 py-2">
              <dt className="text-muted-foreground">Received Quantity</dt>
              <dd className="font-medium text-right">{fmt(row.sampleQuantity)}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-md border border-border px-3 py-2">
              <dt className="text-muted-foreground">Quantity Retained</dt>
              <dd className="font-medium text-right">{fmt(row.quantityRetained)}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-md border border-border px-3 py-2">
              <dt className="text-muted-foreground">Quantity Disposed</dt>
              <dd className="font-medium text-right">{fmt(row.quantityDisposed)}</dd>
            </div>
            {row.disposedAt ? (
              <div className="flex justify-between gap-3 rounded-md border border-border px-3 py-2">
                <dt className="text-muted-foreground">Date of Disposed</dt>
                <dd className="font-medium text-right">{formatDate(row.disposedAt)}</dd>
              </div>
            ) : null}
            {row.disposalOutcome ? (
              <div className="flex justify-between gap-3 rounded-md border border-border px-3 py-2">
                <dt className="text-muted-foreground">Disposal Outcome</dt>
                <dd className="font-medium text-right">{disposalOutcomeLabel(row.disposalOutcome)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
