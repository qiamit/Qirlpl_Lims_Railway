import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { CalibrationJobRow } from '../types'
import {
  resolveEquipmentMasterForJob,
  updateCalibrationJobOutsideChecklist,
} from './calibrationJobApi'
import {
  allItemsChecked,
  applyStoredChecksToTemplate,
  checklistKindLabel,
  parseConductOutsideChecklist,
  parseEquipmentChecklistTemplate,
  type ConductOutsideChecklistItem,
  type ConductOutsideChecklistKind,
  type ConductOutsideChecklistPayload,
} from './conductOutsideChecklist'

const checkboxClass =
  'h-4 w-4 shrink-0 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const FULLSCREEN_OVERLAY = 'md:inset-y-0 md:left-[268px] md:right-0 md:w-auto'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
)

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
  readOnly = false,
}: {
  job: CalibrationJobRow | null
  kind: ConductOutsideChecklistKind
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (jobId: string, kind: ConductOutsideChecklistKind, payload: ConductOutsideChecklistPayload) => void
  readOnly?: boolean
}) {
  const [items, setItems] = useState<ConductOutsideChecklistItem[]>([])
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const allChecked = allItemsChecked(items)
  const someChecked = items.some((item) => item.checked)

  useEffect(() => {
    if (!open || !job) return
    let cancelled = false
    const source =
      kind === 'outgoing' ? job.outgoing_checklist : job.inward_checklist
    const parsed = parseConductOutsideChecklist(source, kind)
    setRemarks(parsed.remarks)
    setError(null)
    setSaving(false)

    const loadItems = async () => {
      try {
        const equipment = await resolveEquipmentMasterForJob(job)
        if (cancelled) return
        const raw =
          kind === 'outgoing'
            ? equipment?.outgoing_checklist_template
            : equipment?.inward_checklist_template
        const templateItems = parseEquipmentChecklistTemplate(raw, kind)
        if (templateItems.some((item) => item.label.trim())) {
          setItems(applyStoredChecksToTemplate(templateItems, parsed.items))
          return
        }
      } catch {
        // Fall back to job / built-in items
      }
      if (!cancelled) setItems(parsed.items.map((i) => ({ ...i })))
    }

    void loadItems()
    return () => {
      cancelled = true
    }
  }, [open, job, kind])

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = someChecked && !allChecked
  }, [someChecked, allChecked])

  if (!job) return null

  const title = checklistKindLabel(kind)

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    )
  }

  const toggleAll = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, checked })))
  }

  const handleSaveAndClose = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload: ConductOutsideChecklistPayload = {
        completed: allChecked,
        completedAt: allChecked ? new Date().toISOString() : null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName={FULLSCREEN_OVERLAY}
        className={FULLSCREEN_DIALOG_CLASS}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <DialogTitle className="flex min-w-0 shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-white sm:text-lg">
                <ClipboardCheck size={18} aria-hidden />
                {title}
              </DialogTitle>
              <p className="min-w-0 truncate text-right text-xs text-stone-300 sm:text-sm">
                {job.equipment_label}
              </p>
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-none border-2 border-stone-700">
            <table className={cn(limsTableClass, 'table-fixed')}>
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-[4.5rem]" />
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(limsTableHeadClass, 'px-1 py-1.5')}>#</th>
                  <th className={cn(limsTableHeadClass, 'px-2 py-1.5')}>Description</th>
                  <th className={cn(limsTableHeadClass, 'px-1 py-1.5')}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className={cn(checkboxClass, 'mx-auto accent-amber-400')}
                      checked={allChecked && items.length > 0}
                      onChange={(e) => toggleAll(e.target.checked)}
                      disabled={saving || readOnly || items.length === 0}
                      aria-label="Select all"
                      title="Select all / Deselect all"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className={limsTableBodyToneClass}>
                {items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-[#fff7ed]">
                    <td className="px-1 py-1.5 text-center text-xs font-semibold text-stone-700">
                      {index + 1}
                    </td>
                    <td className="px-2 py-1.5 text-left text-sm text-stone-900">
                      {item.label}
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        className={cn(checkboxClass, 'mx-auto')}
                        checked={item.checked}
                        onChange={() => toggleItem(item.id)}
                        disabled={saving || readOnly}
                        aria-label={item.label}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error ? (
            <p className="rounded-none border-2 border-amber-700/40 bg-[#fff7ed] px-3 py-2 text-sm text-amber-950">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t-2 border-stone-500 bg-stone-50 px-4 py-3 sm:px-5">
          {readOnly ? (
            <p className="text-xs text-stone-500">View only</p>
          ) : (
            <Button
              type="button"
              size="sm"
              className={limsPrimaryBtnClass}
              disabled={saving}
              onClick={() => void handleSaveAndClose()}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
