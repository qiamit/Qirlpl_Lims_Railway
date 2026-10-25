import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { limsDialogClass, limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { formatPlannedRange, mrmStatusLabel, type MrmPlanRow } from '../mrm-agenda/types'
import { createMeetingFromPlan, defaultPeriod, errorText } from './mrmMeetingDb'
import { todayIso, type MrmMeetingRow } from './types'

const labelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'

/** Create a draft management review meeting from an MRM plan (mounted only while open). */
export function MrmNewMeetingDialog({
  plans,
  meetings,
  suggestedNo,
  onOpenChange,
  onCreated,
}: {
  plans: MrmPlanRow[]
  meetings: MrmMeetingRow[]
  suggestedNo: string
  onOpenChange: (open: boolean) => void
  onCreated: (meetingId: string) => void
}) {
  const usedPlanIds = new Set(meetings.map((m) => m.mrmPlanId))
  const firstFree = plans.find((p) => !usedPlanIds.has(p.id)) ?? plans[0]
  const initialHeld = firstFree?.plannedFrom.slice(0, 10) || todayIso()
  const initialPeriod = defaultPeriod(initialHeld, meetings)

  const [planId, setPlanId] = useState(firstFree?.id ?? '')
  const [meetingNo, setMeetingNo] = useState(suggestedNo)
  const [heldOn, setHeldOn] = useState(initialHeld)
  const [periodFrom, setPeriodFrom] = useState(initialPeriod.from)
  const [periodTo, setPeriodTo] = useState(initialPeriod.to)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = plans.find((p) => p.id === planId) ?? null

  const choosePlan = (id: string) => {
    setPlanId(id)
    const p = plans.find((x) => x.id === id)
    if (p?.plannedFrom) {
      const held = p.plannedFrom.slice(0, 10)
      setHeldOn(held)
      const per = defaultPeriod(held, meetings)
      setPeriodFrom(per.from)
      setPeriodTo(per.to)
    }
  }

  const create = async () => {
    if (!plan) {
      setError('Choose the MRM plan this meeting was held for.')
      return
    }
    if (!meetingNo.trim() || !heldOn) {
      setError('Meeting no. and date are required.')
      return
    }
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      setError('Enter a valid review period (from ≤ to).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const id = await createMeetingFromPlan({ plan, meetingNo, heldOn, periodFrom, periodTo })
      onCreated(id)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'w-[calc(100vw-1.5rem)] max-w-xl p-0')}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">New management review meeting</DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-3 bg-[#f7f3eb] px-4 py-4 text-sm">
          {plans.length === 0 ? (
            <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2">
              No MRM plan found. Create the plan and agenda first (Audit &amp; MRM → MRM Plan &amp; Agenda).
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="mrm-new-plan" className={labelClass}>MRM plan</Label>
                <select
                  id="mrm-new-plan"
                  className={cn(limsFieldClass, 'w-full px-2 text-sm')}
                  value={planId}
                  onChange={(e) => choosePlan(e.target.value)}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.planCode} · {formatPlannedRange(p.plannedFrom, p.plannedTo)} · {mrmStatusLabel(p.status)}
                      {usedPlanIds.has(p.id) ? ' · has a meeting' : ''}
                    </option>
                  ))}
                </select>
                {plan ? (
                  <p className="text-xs text-stone-600">
                    Venue {plan.venue || '—'} · Chair {plan.chairperson || '—'} ·{' '}
                    {plan.recipients.length} invitee(s) become the attendance list · agenda inputs a–o are copied.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="mrm-new-no" className={labelClass}>Meeting no.</Label>
                  <Input id="mrm-new-no" className={limsFieldClass} value={meetingNo} onChange={(e) => setMeetingNo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mrm-new-held" className={labelClass}>Held on</Label>
                  <Input id="mrm-new-held" type="date" className={limsFieldClass} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mrm-new-from" className={labelClass}>Review period from</Label>
                  <Input id="mrm-new-from" type="date" className={limsFieldClass} value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mrm-new-to" className={labelClass}>Review period to</Label>
                  <Input id="mrm-new-to" type="date" className={limsFieldClass} value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-stone-600">
                Figures for inputs a–o are pulled for {formatDate(periodFrom)} – {formatDate(periodTo)}.
              </p>
            </>
          )}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
          <Button type="button" className={limsPrimaryBtnClass} onClick={() => void create()} disabled={saving || plans.length === 0}>
            {saving ? 'Creating…' : 'Create meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
