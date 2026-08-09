import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  limsAddLinkClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { FilterCombobox } from './FilterCombobox'

export type OptionWithId = { id: string; label: string }

const manageListItemClass =
  'flex items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-stone-900'

export function OptionCombobox({
  value,
  onChange,
  options,
  category,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  placeholder = 'Select or Type',
  label,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: OptionWithId[]
  category: string
  onAddOption: (category: string, label: string) => Promise<void>
  onUpdateOption?: (category: string, id: string, label: string) => Promise<void>
  onDeleteOption?: (category: string, id: string) => Promise<void>
  placeholder?: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputId = `option-${category}-value`
  const labels = options.map((o) => o.label)
  const q = value.trim().toLowerCase()
  const filteredLabels = q ? labels.filter((l) => l.toLowerCase().includes(q)) : labels
  const filteredOptions = options.filter((o) => filteredLabels.includes(o.label))
  const showAddAction =
    value.trim().length > 0 && !labels.some((l) => l.toLowerCase() === value.trim().toLowerCase())

  useEffect(() => {
    if (!addDialogOpen) {
      setEditingId(null)
      setNewLabel('')
      setError(null)
    }
  }, [addDialogOpen])

  const handleSaveAndClose = async () => {
    const labelToSave = newLabel.trim() || (!editingId ? value.trim() : '')
    if (!labelToSave) return
    setAddLoading(true)
    setError(null)
    try {
      if (editingId && onUpdateOption) {
        const prev = options.find((o) => o.id === editingId)?.label
        await onUpdateOption(category, editingId, labelToSave)
        if (prev && value === prev) onChange(labelToSave)
      } else {
        await onAddOption(category, labelToSave)
        onChange(labelToSave)
      }
      setNewLabel('')
      setEditingId(null)
      setAddDialogOpen(false)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save option')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!onDeleteOption) return
    setDeletingId(id)
    setError(null)
    try {
      const removed = options.find((o) => o.id === id)?.label
      await onDeleteOption(category, id)
      if (removed && value === removed) onChange('')
      if (editingId === id) {
        setEditingId(null)
        setNewLabel('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete option')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={className}>
      {label != null && (
        <div className="mb-1 flex min-h-6 items-center justify-between gap-2">
          <Label>{label}</Label>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(limsAddLinkClass, 'inline-flex h-6 w-6 items-center justify-center')}
                aria-label="Add Option"
                title="Add New"
              >
                <Plus size={14} />
              </button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'max-w-sm p-0')}>
              <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <DialogTitle className="text-base font-semibold tracking-tight text-white">
                    {editingId ? 'Edit Option' : 'Add Option'}
                  </DialogTitle>
                </DialogHeader>
              </div>

              <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                <div className="space-y-2">
                  <Label
                    htmlFor={inputId}
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    {editingId ? 'Edit value' : 'New value'}
                  </Label>
                  <Input
                    id={inputId}
                    placeholder={`New ${category
                      .split('_')
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')}`}
                    value={newLabel || (!editingId ? value : '')}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className={limsFieldClass}
                  />
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                    Existing list
                  </p>
                  <div className="max-h-40 space-y-1 overflow-auto">
                    {options.length > 0 ? (
                      options.map((o) => (
                        <div key={o.id} className={manageListItemClass}>
                          <span className="min-w-0 truncate">{o.label}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {onUpdateOption ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(o.id)
                                  setNewLabel(o.label)
                                  setError(null)
                                  window.requestAnimationFrame(() => {
                                    document.getElementById(inputId)?.focus()
                                  })
                                }}
                                className="text-amber-800 hover:text-amber-950"
                                aria-label={`Edit ${o.label}`}
                              >
                                <Pencil size={14} />
                              </button>
                            ) : null}
                            {onDeleteOption ? (
                              <button
                                type="button"
                                onClick={() => void handleDelete(o.id)}
                                disabled={!!deletingId}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                aria-label={`Delete ${o.label}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-stone-500">No options yet. Add one above.</p>
                    )}
                  </div>
                </div>
                {error ? <p className="text-xs text-red-700">{error}</p> : null}
              </div>

              <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
                  onClick={() => void handleSaveAndClose()}
                  disabled={!(newLabel.trim() || (!editingId && value.trim())) || addLoading}
                >
                  {addLoading ? 'Saving…' : 'Save & Close'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <FilterCombobox
        value={value}
        onValueChange={onChange}
        options={filteredOptions}
        onSelectOption={(opt) => onChange(opt.label)}
        open={open}
        onOpenChange={setOpen}
        placeholder={options.length > 0 ? placeholder : 'Add options via +'}
        inputClassName="pr-8"
        listId={`option-combobox-${category}`}
        extraActions={
          showAddAction
            ? [
                {
                  key: 'add-inline',
                  label: `Add "${value.trim()}"`,
                  onSelect: () => {
                    setEditingId(null)
                    setNewLabel(value.trim())
                    setAddDialogOpen(true)
                    setOpen(false)
                  },
                },
              ]
            : []
        }
      />
    </div>
  )
}
