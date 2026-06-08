import { Plus, Trash2 } from 'lucide-react'
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
import { useState } from 'react'
import { FilterCombobox } from './FilterCombobox'

export type OptionWithId = { id: string; label: string }

export function OptionCombobox({
  value,
  onChange,
  options,
  category,
  onAddOption,
  onDeleteOption,
  placeholder = 'Select or type',
  label,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: OptionWithId[]
  category: string
  onAddOption: (category: string, label: string) => Promise<void>
  onDeleteOption?: (category: string, id: string) => Promise<void>
  placeholder?: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const labels = options.map((o) => o.label)
  const q = value.trim().toLowerCase()
  const filteredLabels = q ? labels.filter((l) => l.toLowerCase().includes(q)) : labels
  const filteredOptions = options.filter((o) => filteredLabels.includes(o.label))
  const showAddAction =
    value.trim().length > 0 && !labels.some((l) => l.toLowerCase() === value.trim().toLowerCase())

  const handleAddNew = async () => {
    const labelToAdd = newLabel.trim() || value.trim()
    if (!labelToAdd) return
    setAddLoading(true)
    try {
      await onAddOption(category, labelToAdd)
      onChange(labelToAdd)
      setNewLabel('')
      setAddDialogOpen(false)
      setOpen(false)
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!onDeleteOption) return
    setDeletingId(id)
    try {
      await onDeleteOption(category, id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={className}>
      {(label != null) && (
        <div className="flex min-h-6 items-center justify-between gap-2 mb-1">
          <Label>{label}</Label>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
              >
                <Plus size={12} />
                Add New
              </button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Add option</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>New value</Label>
                  <Input
                    placeholder={`New ${category.replace(/_/g, ' ')}`}
                    value={newLabel || value}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Existing list</p>
                  <div className="max-h-40 overflow-auto rounded-md border border-border divide-y divide-border">
                    {options.length > 0 ? (
                      options.map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span>{o.label}</span>
                          {onDeleteOption && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label={`Delete ${o.label}`}
                              onClick={() => handleDelete(o.id)}
                              disabled={!!deletingId}
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No options yet. Add one above.</p>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleAddNew} disabled={!(newLabel.trim() || value.trim()) || addLoading}>
                  {addLoading ? 'Saving…' : 'Save'}
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
        placeholder={options.length > 0 ? placeholder : 'Add options via Add New'}
        inputClassName="pr-8"
        listId={`option-combobox-${category}`}
        extraActions={
          showAddAction
            ? [
                {
                  key: 'add-inline',
                  label: `Add "${value.trim()}"`,
                  onSelect: () => {
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
