import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { CalibrationJobRow } from '../types'
import { updateCalibrationJobOutsideChecklist } from './calibrationJobApi'
import {
  allItemsChecked,
  checklistKindLabel,
  emptyChecklistPayload,
  parseConductOutsideChecklist,
  type ConductOutsideChecklistItem,
  type ConductOutsideChecklistKind,
  type ConductOutsideChecklistPayload,
} from './conductOutsideChecklist'

const checkboxClass =
  'h-4 w-4 shrink-0 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function formatError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  return (err as { message?: string }).message ?? 'Unknown error'
}

export function ConductOutsideChecklistDialog({
  job,
  kind,
  open,
  onOpenChange,
  onSaved,
}: {
  job: CalibrationJobRow | null
  kind: ConductOutsideChecklistKind
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (jobId: string, kind: ConductOutsideChecklistKind, payload: ConductOutsideChecklistPayload) => void
}) {
  const [items, setItems] = useState<ConductOutsideChecklistItem[]>([])
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !job) return
    const source =
      kind === 'outgoing' ? job.outgoing_checklist : job.inward_checklist
    const parsed = parseConductOutsideChecklist(source, kind)
    setItems(parsed.items.map((i) => ({ ...i })))
    setRemarks(parsed.remarks)
    setError(null)
    setSaving(false)
  }, [open, job, kind])

  if (!job) return null

  const title = checklistKindLabel(kind)
  const subtitle =
    kind === 'outgoing'
      ? 'Complete before opening the Raw Data Sheet (pre-calibration / dispatch).'
      : 'Complete before forwarding to Review Data (post-calibration / return).'
  const allChecked = allItemsChecked(items)

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    )
  }

  const toggleAll = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, checked })))
  }

  const handleSave = async (markComplete: boolean) => {
    if (markComplete && !allChecked) {
      setError('Check all items before marking the checklist as completed.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: ConductOutsideChecklistPayload = {
        completed: markComplete,
        completedAt: markComplete ? new Date().toISOString() : null,
        remarks: remarks.trim(),
        items,
      }
      await updateCalibrationJobOutsideChecklist(job.id, kind, payload)
      onSaved(job.id, kind, payload)
      onOpenChange(false)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    const fresh = emptyChecklistPayload(kind)
    setItems(fresh.items)
    setRemarks('')
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
        layer="nested"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-12 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Calibration Conduct Outside
            </p>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <ClipboardCheck size={18} aria-hidden />
              {title}
            </DialogTitle>
            <p className="mt-1 text-xs text-slate-300">{job.equipment_label}</p>
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          </DialogHeader>
        </div>

        <div className="max-h-[min(60vh,520px)] space-y-3 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Checklist items</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => toggleAll(true)}
                disabled={saving}
              >
                Check all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => toggleAll(false)}
                disabled={saving}
              >
                Clear
              </Button>
            </div>
          </div>

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm hover:border-teal-300/60">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={item.checked}
                    onChange={() => toggleItem(item.id)}
                    disabled={saving}
                    aria-label={item.label}
                  />
                  <span className={item.checked ? 'text-slate-700' : 'text-slate-900'}>
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor={`checklist-remarks-${kind}`} className="text-xs">
              Remarks (optional)
            </Label>
            <textarea
              id={`checklist-remarks-${kind}`}
              className="min-h-[72px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={saving}
              placeholder="Notes for this checklist…"
            />
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={handleReset}
            disabled={saving}
          >
            Reset template
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void handleSave(false)}
            >
              Save draft
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 text-white hover:bg-teal-500"
              disabled={saving || !allChecked}
              title={
                allChecked
                  ? 'Save and mark checklist completed'
                  : 'Check all items to mark completed'
              }
              onClick={() => void handleSave(true)}
            >
              {saving ? 'Saving…' : 'Save & Complete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
