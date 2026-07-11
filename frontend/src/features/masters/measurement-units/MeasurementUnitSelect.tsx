import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter as UiDialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { addMeasurementUnit, deleteMeasurementUnit } from './measurementUnitApi'
import { useMeasurementUnits } from './useMeasurementUnits'

export function MeasurementUnitSelect({
  id,
  value,
  onChange,
  label,
  labelClassName,
  showLabel = true,
  showManageButton = true,
  className,
  inputClassName,
  placeholder,
  disabled,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  labelClassName?: string
  showLabel?: boolean
  showManageButton?: boolean
  className?: string
  inputClassName?: string
  placeholder?: string
  disabled?: boolean
}) {
  const { units } = useMeasurementUnits()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredUnits = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return units
    return units.filter((unit) => unit.name.toLowerCase().includes(q))
  }, [units, value])

  const showAddUnitAction = useMemo(() => {
    const typed = value.trim()
    if (!typed) return false
    return !units.some((unit) => unit.name.toLowerCase() === typed.toLowerCase())
  }, [units, value])

  const totalOptions = filteredUnits.length + (showAddUnitAction ? 1 : 0)
  const resolvedPlaceholder =
    placeholder ?? (units.length > 0 ? 'Select unit' : 'Add units to use them here')

  useEffect(() => {
    setHighlight((prev) => (totalOptions === 0 ? 0 : Math.min(prev, totalOptions - 1)))
  }, [totalOptions])

  const pickUnit = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Shift+Tab') {
      setOpen(false)
      return
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true)
    }
    if (event.key === 'ArrowDown' && totalOptions > 0) {
      event.preventDefault()
      setHighlight((prev) => (prev + 1) % totalOptions)
    }
    if (event.key === 'ArrowUp' && totalOptions > 0) {
      event.preventDefault()
      setHighlight((prev) => (prev - 1 + totalOptions) % totalOptions)
    }
    if (event.key === 'Enter' && totalOptions > 0) {
      event.preventDefault()
      if (highlight < filteredUnits.length) {
        pickUnit(filteredUnits[highlight].name)
      } else if (showAddUnitAction) {
        setNewUnitName(value.trim())
        setDialogOpen(true)
        setOpen(false)
      }
    }
  }

  const handleAddUnit = async () => {
    const name = newUnitName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      const row = await addMeasurementUnit(name)
      onChange(row.name)
      setNewUnitName('')
      setDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add measurement unit')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUnit = async (unitId: string) => {
    setError(null)
    try {
      const removedName = await deleteMeasurementUnit(unitId)
      if (removedName && value === removedName) onChange('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete measurement unit')
    }
  }

  return (
    <>
      <div className={cn(showLabel || showManageButton ? 'space-y-2' : '', className)}>
        {(showLabel || showManageButton) && (
          <div className="flex min-h-6 items-center justify-between gap-2">
            {showLabel && label ? (
              <Label htmlFor={id} className={labelClassName}>
                {label}
              </Label>
            ) : showManageButton ? (
              <span />
            ) : null}
            {showManageButton ? (
              <button
                type="button"
                className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
                onClick={() => setDialogOpen(true)}
              >
                <Plus size={12} />
                Add New
              </button>
            ) : null}
          </div>
        )}

        <div className="relative">
          <Input
            ref={inputRef}
            id={id}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              setOpen(true)
              onChange(e.target.value)
              setHighlight(0)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder={resolvedPlaceholder}
            autoComplete="off"
            className={inputClassName}
          />
          {(filteredUnits.length > 0 || showAddUnitAction) && open && !disabled && (
            <div
              className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover shadow-lg"
              tabIndex={-1}
            >
              <ul className="max-h-56 overflow-auto text-sm">
                {filteredUnits.map((unit, index) => (
                  <li key={unit.id}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left ${index === highlight ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pickUnit(unit.name)}
                    >
                      {unit.name}
                    </button>
                  </li>
                ))}
                {showAddUnitAction && (
                  <li>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left text-primary ${
                        highlight === filteredUnits.length ? 'bg-muted font-semibold' : 'hover:bg-muted'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlight(filteredUnits.length)}
                      onClick={() => {
                        setNewUnitName(value.trim())
                        setDialogOpen(true)
                        setOpen(false)
                      }}
                    >
                      Add &quot;{value.trim()}&quot; as new unit
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add Measurement Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${id ?? 'unit'}-new`}>Unit Name</Label>
              <Input
                id={`${id ?? 'unit'}-new`}
                placeholder="e.g., kN"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Existing Units</p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {units.length > 0 ? (
                  units.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                    >
                      <span>{unit.name}</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteUnit(unit.id)}
                        className="text-destructive hover:text-destructive/80"
                        aria-label={`Delete ${unit.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No units added yet.</p>
                )}
              </div>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <UiDialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDialogOpen(false)
                setNewUnitName('')
                setError(null)
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAddUnit()} disabled={!newUnitName.trim() || saving}>
              {saving ? 'Saving…' : 'Save Unit'}
            </Button>
          </UiDialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
