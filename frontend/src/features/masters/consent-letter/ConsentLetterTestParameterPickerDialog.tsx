import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  fetchTestParametersForIsCode,
  type ConsentLetterTestParameterOption,
} from '@/features/sample-handling/report-preparation/fetchConsentLetterFormData'

const TEST_GRID_COLS =
  'grid grid-cols-[2.25rem_minmax(9rem,1.5fr)_minmax(5rem,0.7fr)_minmax(10rem,2fr)_minmax(5rem,0.8fr)_minmax(7rem,1.1fr)]'

const cellClass = 'border-b border-r border-border/60 px-2 py-2 text-sm last:border-r-0'

export function ConsentLetterTestParameterPickerDialog({
  open,
  onOpenChange,
  isCodeId,
  isCodeLabel,
  alreadyAddedKeys,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string
  isCodeLabel: string
  alreadyAddedKeys: Set<string>
  onConfirm: (selected: ConsentLetterTestParameterOption[]) => void
}) {
  const [options, setOptions] = useState<ConsentLetterTestParameterOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !isCodeId) {
      setOptions([])
      setSelectedKeys(new Set())
      setSearch('')
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const all = await fetchTestParametersForIsCode(isCodeId)
        const available = all.filter((p) => !alreadyAddedKeys.has(p.key))
        if (!cancelled) {
          setOptions(available)
          setSelectedKeys(new Set())
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
  }, [open, isCodeId, alreadyAddedKeys])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = [o.testName, o.clauseNo, o.specificRequirement, o.underAccreditation]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [options, search])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedKeys.has(o.key))
  const someFilteredSelected = filtered.some((o) => selectedKeys.has(o.key))

  useEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected
  }, [allFilteredSelected, someFilteredSelected])

  const toggle = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const o of filtered) next.delete(o.key)
      } else {
        for (const o of filtered) next.add(o.key)
      }
      return next
    })
  }

  const handleAdd = () => {
    const picked = options.filter((o) => selectedKeys.has(o.key))
    if (picked.length === 0) return
    onConfirm(picked)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] flex flex-col gap-0 overflow-hidden p-0 sm:rounded-lg"
        layer="nested"
      >
        <DialogHeader className="px-6 pt-5 pb-3 pr-14 space-y-2">
          <div className="flex flex-row flex-wrap items-center gap-3 sm:pr-2">
            <DialogTitle className="shrink-0 whitespace-nowrap">Add Test Parameter</DialogTitle>
            <Input
              placeholder="Search test name, clause, requirement…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 min-w-[12rem] flex-1"
            />
          </div>
          {isCodeLabel.trim() ? (
            <p className="text-xs text-muted-foreground font-normal text-left">{isCodeLabel}</p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-2">
          {error ? (
            <p className="text-sm text-destructive py-4">{error}</p>
          ) : (
            <div className="min-h-full rounded-md border border-border overflow-hidden">
              <div
                className={cn(
                  TEST_GRID_COLS,
                  'sticky top-0 z-10 border-b border-border bg-muted/80 text-xs font-semibold backdrop-blur-sm',
                )}
              >
                <div className={cn(cellClass, 'flex items-start justify-center bg-muted/50')}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Select all"
                    checked={allFilteredSelected}
                    disabled={loading || filtered.length === 0}
                    onChange={toggleAll}
                  />
                </div>
                <div className={cn(cellClass, 'bg-muted/50 text-left')}>Test Name</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Clause</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Specified Requirement</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Uncertainty</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Under Accreditation</div>
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No more test parameters for this IS code, or none exist in Test Parameter master.
                </p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No matches for &quot;{search.trim()}&quot;.
                </p>
              ) : (
                filtered.map((opt) => (
                  <div
                    key={opt.key}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      TEST_GRID_COLS,
                      'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    )}
                    onClick={() => toggle(opt.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggle(opt.key)
                      }
                    }}
                  >
                    <div className={cn(cellClass, 'flex items-start justify-center')}>
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(opt.key)}
                        onChange={() => toggle(opt.key)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${opt.testName}`}
                      />
                    </div>
                    <div className={cn(cellClass, 'font-medium break-words')}>{opt.testName}</div>
                    <div
                      className={cn(
                        cellClass,
                        'text-xs text-muted-foreground text-center break-words',
                      )}
                    >
                      {opt.clauseNo || '—'}
                    </div>
                    <div
                      className={cn(
                        cellClass,
                        'text-xs text-muted-foreground text-center break-words',
                      )}
                    >
                      {opt.specificRequirement || '—'}
                    </div>
                    <div
                      className={cn(
                        cellClass,
                        'text-xs text-muted-foreground text-center break-words',
                      )}
                    >
                      {opt.uncertaintyMu || '—'}
                    </div>
                    <div className={cn(cellClass, 'text-xs text-center break-words')}>
                      {opt.underAccreditation || '—'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd} disabled={selectedKeys.size === 0}>
            Add {selectedKeys.size > 0 ? selectedKeys.size : ''} Test
            {selectedKeys.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
