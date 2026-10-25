import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorText } from '@/lib/missingSchema'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import {
  bandToDraft,
  emptyMuBandDraft,
  formatMuRange,
  formatMuU,
  muReviewStatus,
  validateMuBandDraft,
  type MuBand,
  type MuBandDraft,
  type MuReviewStatus,
} from './muBands'
import { deleteMuBand, saveMuBand } from './muBandsApi'

const REVIEW_LABEL: Record<MuReviewStatus, string> = {
  none: 'No review date',
  ok: 'Review scheduled',
  due_soon: 'MU review due soon',
  overdue: 'MU review overdue',
}

/** Small badge for the MU review state of a parameter or band. */
export function MuReviewBadge({ status, due }: { status: MuReviewStatus; due?: string | null }) {
  if (status === 'none' || status === 'ok') return null
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        status === 'overdue' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900',
      )}
      title={due ? `${REVIEW_LABEL[status]}: ${formatDate(due)}` : REVIEW_LABEL[status]}
    >
      {status === 'overdue' ? 'MU review overdue' : 'MU review due'}
    </span>
  )
}

export function MuBandsDialog({
  open,
  onOpenChange,
  parameter,
  bands,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parameter: { id: string; item_name: string; unit_value: string | null } | null
  bands: MuBand[]
  onChanged: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<MuBandDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setDraft(null)
      setError(null)
    }
  }, [open])

  const startNew = () => {
    setEditingId(null)
    setDraft({ ...emptyMuBandDraft(), unit: parameter?.unit_value?.trim() ?? '' })
    setError(null)
  }

  const startEdit = (b: MuBand) => {
    setEditingId(b.id)
    setDraft(bandToDraft(b))
    setError(null)
  }

  const save = async () => {
    if (!parameter || !draft) return
    const problem = validateMuBandDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveMuBand(parameter.id, draft, editingId)
      setDraft(null)
      setEditingId(null)
      onChanged()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (b: MuBand) => {
    if (!parameter) return
    if (!window.confirm(`Delete the MU band ${formatMuRange(b)}?`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteMuBand(b.id, parameter.id)
      onChanged()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const set = (patch: Partial<MuBandDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const sorted = [...bands].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.range_from ?? -Infinity) - (b.range_from ?? -Infinity) ||
      (a.valid_from < b.valid_from ? 1 : -1),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'flex w-[min(100%-1.5rem,60rem)] max-w-none flex-col')}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              MU by range — {parameter?.item_name ?? ''}
            </DialogTitle>
            <p className="text-xs text-stone-300">
              Expanded uncertainty per measuring range (ISO/IEC 17025 7.6). The band whose range holds the
              result applies; at a shared boundary the band that starts there wins.
            </p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          {error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}

          <div className="overflow-x-auto border border-stone-400">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-stone-800 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">
                  <th className="px-2 py-1.5 text-left">Range</th>
                  <th className="px-2 py-1.5 text-left">Expanded U</th>
                  <th className="px-2 py-1.5 text-left">Valid from</th>
                  <th className="px-2 py-1.5 text-left">Review due</th>
                  <th className="px-2 py-1.5 text-left">Basis</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-stone-500">
                      No bands yet. The single MU on the parameter is used for every result.
                    </td>
                  </tr>
                ) : (
                  sorted.map((b) => (
                    <tr key={b.id} className={cn('border-t border-stone-300', !b.active && 'opacity-50')}>
                      <td className="px-2 py-1.5">
                        {formatMuRange(b)}
                        {!b.active ? <span className="ml-1 text-[10px] uppercase">(inactive)</span> : null}
                      </td>
                      <td className="px-2 py-1.5">{formatMuU(b)}</td>
                      <td className="px-2 py-1.5">{formatDate(b.valid_from)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <span>{b.review_due ? formatDate(b.review_due) : '—'}</span>
                          {b.active ? <MuReviewBadge status={muReviewStatus(b.review_due)} due={b.review_due} /> : null}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-stone-600">{b.basis || '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label="Edit band"
                            disabled={busy}
                            onClick={() => startEdit(b)}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-700"
                            aria-label="Delete band"
                            disabled={busy}
                            onClick={() => void remove(b)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {draft ? (
            <div className="space-y-3 border border-stone-400 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                {editingId ? 'Edit band' : 'New band'}
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="mu-from">Range from</Label>
                  <Input id="mu-from" inputMode="decimal" placeholder="open" className={limsFieldClass}
                    value={draft.rangeFrom} onChange={(e) => set({ rangeFrom: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mu-to">Range to</Label>
                  <Input id="mu-to" inputMode="decimal" placeholder="open" className={limsFieldClass}
                    value={draft.rangeTo} onChange={(e) => set({ rangeTo: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mu-unit">Unit</Label>
                  <Input id="mu-unit" className={limsFieldClass} value={draft.unit}
                    onChange={(e) => set({ unit: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mu-u">Expanded U (±)</Label>
                  <div className="flex gap-1">
                    <Input id="mu-u" inputMode="decimal" className={limsFieldClass} value={draft.expandedU}
                      onChange={(e) => set({ expandedU: e.target.value })} />
                    <select
                      aria-label="U is absolute or relative"
                      className={cn(limsFieldClass, 'w-20 px-1 text-sm')}
                      value={draft.uUnit}
                      onChange={(e) => set({ uUnit: e.target.value === '%' ? '%' : 'abs' })}
                    >
                      <option value="abs">unit</option>
                      <option value="%">%</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mu-k">k</Label>
                  <Input id="mu-k" inputMode="decimal" className={limsFieldClass} value={draft.k}
                    onChange={(e) => set({ k: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mu-cl">Confidence</Label>
                  <Input id="mu-cl" className={limsFieldClass} value={draft.confidenceLevel}
                    onChange={(e) => set({ confidenceLevel: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mu-vf">Valid from</Label>
                  <Input id="mu-vf" type="date" className={limsFieldClass} value={draft.validFrom}
                    onChange={(e) => set({ validFrom: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mu-rd">Review due</Label>
                  <Input id="mu-rd" type="date" className={limsFieldClass} value={draft.reviewDue}
                    onChange={(e) => set({ reviewDue: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="mu-basis">Basis (budget / validation ref.)</Label>
                  <Input id="mu-basis" className={limsFieldClass} value={draft.basis}
                    onChange={(e) => set({ basis: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="mu-remarks">Remarks</Label>
                  <Input id="mu-remarks" className={limsFieldClass} value={draft.remarks}
                    onChange={(e) => set({ remarks: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
                Active (untick when a band is replaced by a new evaluation)
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className={limsOutlineBtnClass} disabled={busy}
                  onClick={() => { setDraft(null); setEditingId(null); setError(null) }}>
                  Cancel
                </Button>
                <Button type="button" className={limsPrimaryBtnClass} disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save band'}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} disabled={busy || !parameter}
              onClick={startNew}>
              <Plus size={14} /> Add band
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
