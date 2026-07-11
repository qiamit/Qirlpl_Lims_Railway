import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  fetchSampleTestParametersForRetest,
  type RetestSampleTestParameterOption,
} from './fetchSampleTestParametersForRetest'

const GRID_TABLE =
  'table-auto w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const GRID_HEAD =
  'text-xs font-semibold text-foreground bg-muted/60 border-border whitespace-nowrap px-2 py-1.5 text-center'
const GRID_CELL = 'text-xs border-border px-2 py-1.5 align-middle text-center'

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

export function RetestTestParameterPickerDialog({
  open,
  onOpenChange,
  sampleId,
  srfNumber,
  testAllocationId,
  alreadyAddedIds,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string
  srfNumber: string
  testAllocationId?: string
  alreadyAddedIds: Set<string>
  onConfirm: (selected: RetestSampleTestParameterOption[]) => void
}) {
  const [options, setOptions] = useState<RetestSampleTestParameterOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !sampleId.trim()) {
      setOptions([])
      setSelectedIds(new Set())
      setSearch('')
      setError(null)
      return
    }

    if (!testAllocationId?.trim()) {
      setOptions([])
      setSelectedIds(new Set())
      setSearch('')
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const all = await fetchSampleTestParametersForRetest(sampleId, testAllocationId)
        const available = all.filter((p) => !alreadyAddedIds.has(p.id))
        if (!cancelled) {
          setOptions(available)
          setSelectedIds(new Set())
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load test parameters')
          setOptions([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, sampleId, testAllocationId, alreadyAddedIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = [
        o.label,
        o.testMethod,
        o.unit,
        o.uncertainty,
        o.oldResult,
        o.scope,
        o.specificRequirement ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [options, search])

  const allChecked = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id))
  const someChecked = filtered.some((o) => selectedIds.has(o.id))

  useEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = !allChecked && someChecked
  }, [allChecked, someChecked])

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(filtered.map((o) => o.id)) : new Set())
  }

  const handleConfirm = () => {
    const picked = options.filter((o) => selectedIds.has(o.id))
    if (picked.length === 0) return
    onConfirm(picked)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Test Parameter</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          SRF: <span className="font-medium text-foreground">{srfNumber || '—'}</span>
          {testAllocationId?.trim() ? null : (
            <span className="ml-2">Select a section code first.</span>
          )}
        </p>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search test name, method, unit, uncertainty, old result, scope…"
          aria-label="Search test parameters"
        />

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive py-2">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border/80 px-3 py-4 text-center">
            {sampleId.trim() && testAllocationId?.trim()
              ? 'No allocated test parameters found for this section.'
              : sampleId.trim()
                ? 'Select a section code first.'
                : 'Select a sample first.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/80 max-h-80 overflow-y-auto">
            <table className={cn('text-sm', GRID_TABLE)}>
              <thead>
                <tr className="hover:bg-muted/60">
                  <th className={cn(GRID_HEAD, 'w-10 p-2')}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all tests"
                      checked={allChecked}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className={cn(GRID_HEAD, 'min-w-[120px]')}>Test Name</th>
                  <th className={cn(GRID_HEAD, 'min-w-[120px]')}>Test Method</th>
                  <th className={cn(GRID_HEAD, 'min-w-[70px]')}>Unit</th>
                  <th className={cn(GRID_HEAD, 'min-w-[90px]')}>Uncertainty</th>
                  <th className={cn(GRID_HEAD, 'min-w-[100px]')}>Old Results</th>
                  <th className={cn(GRID_HEAD, 'min-w-[100px]')}>Scope (NABL/Non NABL)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/20">
                    <td className={cn(GRID_CELL, 'p-2')}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${o.label}`}
                        checked={selectedIds.has(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                    </td>
                    <td className={cn(GRID_CELL, 'font-medium')}>{displayValue(o.label)}</td>
                    <td className={cn(GRID_CELL, 'text-muted-foreground whitespace-pre-wrap')}>
                      {displayValue(o.testMethod)}
                    </td>
                    <td className={cn(GRID_CELL, 'whitespace-nowrap')}>{displayValue(o.unit)}</td>
                    <td className={cn(GRID_CELL, 'whitespace-nowrap')}>
                      {displayValue(o.uncertainty)}
                    </td>
                    <td className={cn(GRID_CELL, 'whitespace-pre-wrap')}>
                      {displayValue(o.oldResult)}
                    </td>
                    <td className={cn(GRID_CELL, 'whitespace-nowrap font-medium')}>
                      {displayValue(o.scope)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={selectedIds.size === 0}>
            Add Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
