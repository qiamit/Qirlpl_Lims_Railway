import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatSupabaseError, type EmployeeOption } from '../shared'
import {
  capaSourceLabel,
  loadCapaTracking,
  saveCapaTracking,
  type CapaRegisterRow,
  type CapaTracking,
} from './capaRegister'

const EMPTY: CapaTracking = {
  ownerUserId: '',
  ownerName: '',
  dueOn: '',
  closedOn: '',
  effectivenessReviewDueOn: '',
  effectivenessOutcome: '',
  effectivenessNotes: '',
  effectivenessVerifiedOn: '',
  effectivenessVerifiedByName: '',
}

const selectClass = 'h-9 w-full rounded-none border border-stone-400 bg-white px-2 text-sm'

/** Owner, due date, closure and effectiveness review of one corrective action (ISO/IEC 17025 8.7.1, 8.7.3). */
export function CapaTrackingDialog({
  row,
  employees,
  canVerify,
  onClose,
  onSaved,
}: {
  row: CapaRegisterRow | null
  employees: EmployeeOption[]
  /** Laboratory Director, Quality Manager or Technical Manager (checked again by the database). */
  canVerify: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<CapaTracking>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!row) return
    let cancelled = false
    setForm(EMPTY)
    setError(null)
    setLoading(true)
    void loadCapaTracking(row)
      .then((t) => {
        if (!cancelled) setForm(t)
      })
      .catch((err) => {
        if (!cancelled) setError(formatSupabaseError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [row])

  const hasClosedOn = row?.source === 'audit' || row?.source === 'ncw'
  const set = (patch: Partial<CapaTracking>) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    if (!row || saving) return
    setSaving(true)
    setError(null)
    try {
      await saveCapaTracking(row, form, canVerify)
      onSaved()
      onClose()
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-xl flex-col p-0')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">
              CAPA tracking · {row ? `${capaSourceLabel(row.source)} ${row.ref}` : ''}
            </DialogTitle>
            <DialogDescription className="line-clamp-2 text-[12px] text-stone-300">{row?.description}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="capa-owner">Action owner</Label>
                  <select
                    id="capa-owner"
                    className={selectClass}
                    value={form.ownerUserId}
                    onChange={(e) => {
                      const emp = employees.find((x) => x.id === e.target.value)
                      set({ ownerUserId: e.target.value, ownerName: emp?.full_name ?? '' })
                    }}
                  >
                    <option value="">{form.ownerName && !form.ownerUserId ? form.ownerName : '— Not assigned —'}</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="capa-due">Due date</Label>
                  <Input id="capa-due" type="date" value={form.dueOn} onChange={(e) => set({ dueOn: e.target.value })} />
                </div>
                {hasClosedOn ? (
                  <div className="space-y-1">
                    <Label htmlFor="capa-closed">Action completed on</Label>
                    <Input
                      id="capa-closed"
                      type="date"
                      value={form.closedOn}
                      onChange={(e) => set({ closedOn: e.target.value })}
                    />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="capa-eff-due">Effectiveness review due</Label>
                  <Input
                    id="capa-eff-due"
                    type="date"
                    value={form.effectivenessReviewDueOn}
                    onChange={(e) => set({ effectivenessReviewDueOn: e.target.value })}
                  />
                </div>
              </div>

              <fieldset className="space-y-2 border border-stone-400 bg-white p-3">
                <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  Effectiveness review (8.7.1 d)
                </legend>
                {!canVerify ? (
                  <p className="text-xs text-stone-600">
                    Recorded by the Laboratory Director, Quality Manager or a Technical Manager.
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="capa-eff-outcome">Outcome</Label>
                    <select
                      id="capa-eff-outcome"
                      className={selectClass}
                      disabled={!canVerify}
                      value={form.effectivenessOutcome}
                      onChange={(e) => set({ effectivenessOutcome: e.target.value as CapaTracking['effectivenessOutcome'] })}
                    >
                      <option value="">— Not reviewed —</option>
                      <option value="effective">Effective</option>
                      <option value="not_effective">Not effective (raise further action)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="capa-eff-on">Reviewed on</Label>
                    <Input
                      id="capa-eff-on"
                      type="date"
                      disabled={!canVerify || !form.effectivenessOutcome}
                      value={form.effectivenessVerifiedOn}
                      onChange={(e) => set({ effectivenessVerifiedOn: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="capa-eff-notes">Evidence / notes</Label>
                  <Textarea
                    id="capa-eff-notes"
                    rows={2}
                    disabled={!canVerify}
                    value={form.effectivenessNotes}
                    onChange={(e) => set({ effectivenessNotes: e.target.value })}
                    className="rounded-none border-stone-400 bg-white text-sm"
                    placeholder="e.g. No recurrence in the next 3 audits / 50 jobs"
                  />
                </div>
                {form.effectivenessVerifiedByName ? (
                  <p className="text-xs text-stone-600">Verified by {form.effectivenessVerifiedByName}</p>
                ) : null}
              </fieldset>
            </>
          )}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className={limsOutlineBtnClass} onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
