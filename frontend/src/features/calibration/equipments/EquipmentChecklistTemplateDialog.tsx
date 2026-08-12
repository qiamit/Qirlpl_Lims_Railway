import { useEffect, useState } from 'react'
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  checklistKindLabel,
  emptyEquipmentChecklistItems,
  newChecklistItemId,
  type ConductOutsideChecklistItem,
  type ConductOutsideChecklistKind,
} from '@/features/calibration/handling/jobs/conductOutsideChecklist'

const FULLSCREEN_OVERLAY = 'md:inset-y-0 md:left-[268px] md:right-0 md:w-auto'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
)

export function EquipmentChecklistTemplateDialog({
  open,
  onOpenChange,
  kind,
  equipmentName,
  items,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ConductOutsideChecklistKind
  equipmentName: string
  items: ConductOutsideChecklistItem[]
  onSave: (items: ConductOutsideChecklistItem[]) => void
}) {
  const [draft, setDraft] = useState<ConductOutsideChecklistItem[]>([])

  useEffect(() => {
    if (!open) return
    const next = items.map((item) => ({ ...item }))
    setDraft(next.length > 0 ? next : emptyEquipmentChecklistItems(kind))
  }, [open, items, kind])

  const title = checklistKindLabel(kind)

  const updateLabel = (id: string, label: string) => {
    setDraft((prev) => prev.map((item) => (item.id === id ? { ...item, label } : item)))
  }

  const addItem = () => {
    setDraft((prev) => [
      ...prev,
      { id: newChecklistItemId(kind), label: '', checked: false },
    ])
  }

  const removeItem = (id: string) => {
    setDraft((prev) => {
      const next = prev.filter((item) => item.id !== id)
      return next.length > 0 ? next : emptyEquipmentChecklistItems(kind)
    })
  }

  const handleSave = () => {
    const next = draft
      .map((item) => ({ ...item, label: item.label.trim(), checked: false }))
      .filter((item) => item.label.length > 0)
    onSave(next.length > 0 ? next : emptyEquipmentChecklistItems(kind))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
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
              {equipmentName.trim() ? (
                <p className="min-w-0 truncate text-right text-xs text-stone-300 sm:text-sm">
                  {equipmentName.trim()}
                </p>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-none border-2 border-stone-700">
            <table className={cn(limsTableClass, 'table-fixed')}>
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-14" />
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(limsTableHeadClass, 'px-1 py-1.5')}>#</th>
                  <th className={cn(limsTableHeadClass, 'px-2 py-1.5')}>Description</th>
                  <th className={cn(limsTableHeadClass, 'px-1 py-1.5')}>Action</th>
                </tr>
              </thead>
              <tbody className={limsTableBodyToneClass}>
                {draft.map((item, index) => {
                  const isLast = index === draft.length - 1
                  return (
                    <tr key={item.id} className="hover:bg-[#fff7ed]">
                      <td className="px-1 py-1.5 text-center text-xs font-semibold text-stone-700">
                        {index + 1}
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={item.label}
                          onChange={(e) => updateLabel(item.id, e.target.value)}
                          placeholder="Checklist item"
                          className="h-8 rounded-none border-stone-400 bg-white text-sm"
                          aria-label={`Description ${index + 1}`}
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        {isLast ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mx-auto h-8 w-8 px-0 text-amber-800 hover:bg-amber-500/15 hover:text-amber-950"
                            onClick={addItem}
                            aria-label="Add item"
                          >
                            <Plus size={16} />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeItem(item.id)}
                            aria-label={`Delete item ${index + 1}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t-2 border-stone-500 bg-stone-50 px-4 py-3 sm:px-5">
          <Button type="button" size="sm" className={limsPrimaryBtnClass} onClick={handleSave}>
            Save & Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
