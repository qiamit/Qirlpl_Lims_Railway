import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { limsDialogClass, limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { errorText, saveActionFollowUp } from './mrmMeetingDb'
import { todayIso, type MrmActionForm, type MrmActionStatus } from './types'

/** Follow-up of an action item: status, closure date and evidence, CAPA reference. */
export function MrmActionFollowUpDialog({
  action,
  meetingNo,
  onOpenChange,
  onSaved,
}: {
  action: MrmActionForm
  meetingNo: string
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  // The parent mounts this dialog with key={action.id}, so the draft starts from the action.
  const [draft, setDraft] = useState<MrmActionForm>(action)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (draft.status === 'done' && !draft.closureEvidence.trim()) {
      setError('Closure evidence is required to mark the action done.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveActionFollowUp({ ...draft, closedOn: draft.status === 'done' ? draft.closedOn || todayIso() : '' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        layer="nested"
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'w-[calc(100vw-1.5rem)] max-w-lg p-0')}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Action follow-up</DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-3 bg-[#f7f3eb] px-4 py-4 text-sm">
            <div className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2">
              <p className="font-semibold text-stone-900">{draft.action}</p>
              <p className="text-xs text-stone-600">
                {meetingNo} · Owner {draft.ownerName || '—'} · Due {draft.dueOn ? formatDate(draft.dueOn) : '—'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mrm-fu-status" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Status
                </Label>
                <select
                  id="mrm-fu-status"
                  className={cn(limsFieldClass, 'w-full px-2 text-sm')}
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as MrmActionStatus })}
                >
                  <option value="open">Open</option>
                  <option value="overdue">Overdue</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mrm-fu-closed" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Closed on
                </Label>
                <Input
                  id="mrm-fu-closed"
                  type="date"
                  className={limsFieldClass}
                  value={draft.status === 'done' ? draft.closedOn || todayIso() : ''}
                  disabled={draft.status !== 'done'}
                  onChange={(e) => setDraft({ ...draft, closedOn: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mrm-fu-evidence" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Closure evidence
              </Label>
              <Textarea
                id="mrm-fu-evidence"
                rows={3}
                className="border-stone-500"
                value={draft.closureEvidence}
                onChange={(e) => setDraft({ ...draft, closureEvidence: e.target.value })}
                placeholder="What was done and where the record is"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mrm-fu-capa" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                CAPA reference
              </Label>
              <Input
                id="mrm-fu-capa"
                className={limsFieldClass}
                value={draft.capaRef}
                onChange={(e) => setDraft({ ...draft, capaRef: e.target.value })}
                placeholder="e.g. NC ID / corrective action no."
              />
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
          <Button type="button" className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save follow-up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
