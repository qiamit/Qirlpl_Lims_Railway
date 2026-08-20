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
import {
  limsDarkBarGlowStyle,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import {
  computeDefaultDisposedDate,
  computeRetentionDueDate,
  deriveRetentionStatus,
  SAMPLE_RETENTION_DAYS,
  type SampleDisposalOutcome,
} from './sampleRetention'
import type { RetainDisposedListRow } from './types'

const dialogOverlayClass = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const dialogShellClass = cn(
  'max-h-[92vh] w-[calc(100vw-1rem)] max-w-lg gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-white p-0 shadow-2xl ring-2 ring-amber-700/40 sm:w-full sm:rounded-none',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
  'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 lg:w-[min(32rem,calc(100vw-268px-2rem))] lg:max-w-[min(32rem,calc(100vw-268px-2rem))] md:!-translate-x-1/2 md:!-translate-y-1/2',
)

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
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName={dialogOverlayClass}
        className={dialogShellClass}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Record Sample Retention / Disposal
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="max-h-[min(72vh,640px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
          <div className={cn(limsRegistryFormClass, 'space-y-4 text-sm')}>
            <div className="space-y-1 rounded-none border border-stone-500 bg-stone-50 px-3 py-2.5 text-xs">
              <p>
                <span className="text-stone-500">SRF:</span>{' '}
                <span className="font-semibold text-stone-800">{row.srfNumber ?? '—'}</span>
              </p>
              <p>
                <span className="text-stone-500">Test report issued:</span>{' '}
                <span className="text-stone-800">{formatDate(row.issuedAt ?? '')}</span>
              </p>
              <p>
                <span className="text-stone-500">Retention due ({SAMPLE_RETENTION_DAYS} days):</span>{' '}
                <span
                  className={
                    previewStatus === 'due'
                      ? 'font-semibold text-rose-600'
                      : 'font-medium text-stone-800'
                  }
                >
                  {formatDate(retentionDue)}
                </span>
              </p>
              <p className="pt-1 text-stone-500">
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

            {error ? (
              <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-end sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
