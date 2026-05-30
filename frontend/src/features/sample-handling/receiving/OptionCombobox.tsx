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
import { useRef, useState } from 'react'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const labels = options.map((o) => o.label)
  const q = value.trim().toLowerCase()
  const filtered = q ? labels.filter((l) => l.toLowerCase().includes(q)) : labels
  const showAddAction = value.trim().length > 0 && !labels.some((l) => l.toLowerCase() === value.trim().toLowerCase())

  const handlePick = (labelVal: string) => {
    onChange(labelVal)
    setOpen(false)
  }

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
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={options.length > 0 ? placeholder : 'Add options via Add New'}
          className="pr-8"
          autoComplete="off"
        />
        {(filtered.length > 0 || showAddAction) && open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
            <ul className="max-h-48 overflow-auto text-sm">
              {filtered.map((l) => (
                <li key={l}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handlePick(l)}
                  >
                    {l}
                  </button>
                </li>
              ))}
              {showAddAction && (
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-primary hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setNewLabel(value.trim())
                      setAddDialogOpen(true)
                      setOpen(false)
                    }}
                  >
                    Add &quot;{value.trim()}&quot;
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
