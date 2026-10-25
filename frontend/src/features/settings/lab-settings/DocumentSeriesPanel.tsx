import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  DOCUMENT_SERIES_TOKEN_HELP,
  listDocumentSeries,
  resolveSeriesPrefix,
  sampleDocumentNumber,
  saveDocumentSeries,
  type DocumentSeriesRow,
} from '@/features/finance/sale/shared/documentSeriesApi'

const LABELS: Record<string, string> = {
  QUOTATION: 'Quotation',
  PROFORMA: 'Proforma Invoice',
  TAX_INVOICE: 'Tax Invoice',
  CREDIT_NOTE: 'Credit Note',
  PAYMENT_RECEIPT: 'Payment Receipt',
}

const ORDER = Object.keys(LABELS)

/** GST rules cap a tax invoice number at 16 characters. */
const TAX_INVOICE_MAX = 16

/**
 * Finance numbering (Lab Settings → Prefix's). Shown only once the
 * document_series migration is on the database.
 */
export function DocumentSeriesPanel() {
  const [rows, setRows] = useState<DocumentSeriesRow[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [savingType, setSavingType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listDocumentSeries()
      .then((list) => {
        if (cancelled || !list) return
        setRows(
          [...list].sort(
            (a, b) => ORDER.indexOf(a.doc_type) - ORDER.indexOf(b.doc_type),
          ),
        )
      })
      .catch((err: unknown) => {
        if (!cancelled) setMessage(err instanceof Error ? err.message : 'Document numbering could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!rows && !message) return null

  const update = (docType: string, patch: Partial<DocumentSeriesRow>) =>
    setRows((prev) => prev?.map((row) => (row.doc_type === docType ? { ...row, ...patch } : row)) ?? prev)

  const save = (row: DocumentSeriesRow) => {
    const label = LABELS[row.doc_type] ?? row.label ?? row.doc_type
    if (!row.prefix.trim()) {
      setMessage(`Enter a prefix for ${label}.`)
      return
    }
    setSavingType(row.doc_type)
    setMessage(null)
    saveDocumentSeries(row)
      .then(() => setMessage(`Saved ${label} numbering.`))
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save.'))
      .finally(() => setSavingType(null))
  }

  return (
    <section className="space-y-3 border-t border-stone-300 pt-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-stone-800">Finance document numbering</h3>
        <p className="text-xs text-stone-600">
          Numbers are taken from the database when a document is saved, so two people cannot get the same
          number. A new number is always higher than any number already saved with the same prefix. Prefix
          tokens: {DOCUMENT_SERIES_TOKEN_HELP}. When the year in the prefix changes, numbering starts again at 1.
        </p>
      </div>
      {message ? <p className="text-sm text-stone-700" role="status">{message}</p> : null}
      <div className="space-y-3">
        {(rows ?? []).map((row) => {
          const label = LABELS[row.doc_type] ?? row.label ?? row.doc_type
          const resolved = resolveSeriesPrefix(row.prefix)
          // The database starts again at 1 when the resolved prefix changes.
          const nextShown = row.active_prefix === resolved ? row.next_number : 1
          const sample = sampleDocumentNumber({ ...row, next_number: nextShown })
          const tooLong = row.doc_type === 'TAX_INVOICE' && sample.length > TAX_INVOICE_MAX
          const id = `doc-series-${row.doc_type.toLowerCase()}`
          return (
            <div
              key={row.doc_type}
              className="grid grid-cols-2 items-end gap-2 border border-stone-300 bg-white/90 p-3 sm:grid-cols-12"
            >
              <p className="col-span-2 text-sm font-medium text-stone-800 sm:col-span-12">{label}</p>
              <div className="col-span-2 space-y-1 sm:col-span-6">
                <Label htmlFor={`${id}-prefix`} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Prefix
                </Label>
                <Input
                  id={`${id}-prefix`}
                  className={limsFieldClass}
                  value={row.prefix}
                  onChange={(e) => update(row.doc_type, { prefix: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`${id}-pad`} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Digits
                </Label>
                <Input
                  id={`${id}-pad`}
                  type="number"
                  min={1}
                  max={8}
                  className={limsFieldClass}
                  value={row.pad_width}
                  onChange={(e) => update(row.doc_type, { pad_width: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`${id}-next`} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Next no.
                </Label>
                <Input
                  id={`${id}-next`}
                  type="number"
                  min={1}
                  className={limsFieldClass}
                  value={nextShown}
                  onChange={(e) =>
                    update(row.doc_type, {
                      next_number: Number(e.target.value) || 1,
                      active_prefix: resolved,
                    })
                  }
                />
              </div>
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'col-span-2 h-10 sm:col-span-2')}
                disabled={savingType === row.doc_type}
                onClick={() => save({ ...row, next_number: nextShown })}
              >
                {savingType === row.doc_type ? 'Saving…' : 'Save'}
              </Button>
              <p className={cn('col-span-2 text-xs sm:col-span-12', tooLong ? 'text-red-700' : 'text-stone-600')}>
                Next: <span className="font-mono">{sample}</span> ({sample.length} characters)
                {tooLong ? `. GST allows at most ${TAX_INVOICE_MAX} characters for a tax invoice number.` : ''}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
