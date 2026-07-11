import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { openAddTestParameterWindow } from '@/features/masters/test-parameter/openAddTestParameterWindow'
import type { TestAllocationRow } from '../types'
import {
  fetchIsCodeTestsForSection,
  type AllocatedTestOption,
  type SectionTestSelectionChange,
} from './allocatedTestsForSection'
import type { SectionParameterEntry } from './sectionParameterRows'

const TEST_GRID_COLS =
  'grid grid-cols-[2.25rem_minmax(9rem,1.5fr)_minmax(5rem,0.7fr)_minmax(10rem,2fr)_minmax(5rem,0.8fr)_minmax(7rem,1.1fr)]'

export function AddSectionTestDialog({
  open,
  onOpenChange,
  row,
  existingDraft,
  onConfirm,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: TestAllocationRow | null
  existingDraft: SectionParameterEntry[]
  onConfirm: (change: SectionTestSelectionChange) => Promise<void>
  saving?: boolean
}) {
  const [options, setOptions] = useState<AllocatedTestOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  /** Checked test parameter ids (includes already-in-section until unselected). */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [specOverrides, setSpecOverrides] = useState<Record<string, string>>({})
  const [editSpecOpen, setEditSpecOpen] = useState(false)
  const [editSpecTestId, setEditSpecTestId] = useState<string | null>(null)
  const [editSpecValue, setEditSpecValue] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  const applyLoadedOptions = (list: AllocatedTestOption[], resetSelection: boolean) => {
    setOptions(list)
    if (resetSelection) {
      setSelectedIds(
        new Set(list.filter((o) => o.alreadyInSection).map((o) => o.testParameterId)),
      )
    }
  }

  const loadOptions = useCallback(
    async (mode: 'full' | 'soft' = 'full') => {
      if (!row) {
        setOptions([])
        return
      }
      if (mode === 'full') {
        setLoading(true)
        setError(null)
      }
      try {
        const list = await fetchIsCodeTestsForSection(row, existingDraft)
        applyLoadedOptions(list, mode === 'full')
      } catch (e) {
        if (mode === 'full') {
          setError(e instanceof Error ? e.message : 'Unable to load test parameters')
          setOptions([])
        }
      } finally {
        if (mode === 'full') setLoading(false)
      }
    },
    [row, existingDraft],
  )

  useEffect(() => {
    if (!open || !row) {
      setOptions([])
      setSelectedIds(new Set())
      setSearch('')
      setError(null)
      setSpecOverrides({})
      setEditSpecOpen(false)
      setEditSpecTestId(null)
      setEditSpecValue('')
      return
    }

    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await fetchIsCodeTestsForSection(row, existingDraft)
        if (!cancelled) applyLoadedOptions(list, true)
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
  }, [open, row, existingDraft])

  useEffect(() => {
    if (!open) return
    const onFocus = () => {
      void loadOptions('soft')
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [open, loadOptions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const label = o.testLabel.toLowerCase()
      const spec = (o.specificRequirement ?? '').toLowerCase()
      const clause = (o.clauseNo ?? '').toLowerCase()
      const accr = (o.underAccreditation ?? '').toLowerCase()
      return label.includes(q) || spec.includes(q) || clause.includes(q) || accr.includes(q)
    })
  }, [options, search])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedIds.has(o.testParameterId))
  const someFilteredSelected = filtered.some((o) => selectedIds.has(o.testParameterId))

  useEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected
  }, [allFilteredSelected, someFilteredSelected])

  const selectionChange = useMemo((): SectionTestSelectionChange => {
    const toAdd: AllocatedTestOption[] = []
    const toRemove: AllocatedTestOption[] = []
    const toUpdate: AllocatedTestOption[] = []
    for (const o of options) {
      const checked = selectedIds.has(o.testParameterId)
      const override = specOverrides[o.testParameterId]
      if (o.alreadyInSection && !checked) {
        toRemove.push(o)
        continue
      }
      if (!o.alreadyInSection && checked) {
        toAdd.push(
          override === undefined
            ? o
            : { ...o, specificRequirement: override.trim() || null },
        )
        continue
      }
      if (o.alreadyInSection && checked && override !== undefined) {
        const nextSpec = override.trim() || null
        const prevSpec = o.specificRequirement?.trim() || null
        if (nextSpec !== prevSpec) {
          toUpdate.push({ ...o, specificRequirement: nextSpec })
        }
      }
    }
    return { toAdd, toRemove, toUpdate }
  }, [options, selectedIds, specOverrides])

  const hasChanges =
    selectionChange.toAdd.length > 0 ||
    selectionChange.toRemove.length > 0 ||
    selectionChange.toUpdate.length > 0

  const displaySpecificRequirement = (opt: AllocatedTestOption): string => {
    const override = specOverrides[opt.testParameterId]
    if (override !== undefined) return override.trim() || '—'
    return opt.specificRequirement?.trim() || '—'
  }

  const openEditSpec = (opt: AllocatedTestOption, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditSpecTestId(opt.testParameterId)
    setEditSpecValue(specOverrides[opt.testParameterId] ?? opt.specificRequirement ?? '')
    setEditSpecOpen(true)
  }

  const saveEditSpec = () => {
    if (!editSpecTestId) return
    const nextValue = editSpecValue.trim()
    setSpecOverrides((prev) => ({
      ...prev,
      [editSpecTestId]: nextValue,
    }))
    setEditSpecOpen(false)
    setEditSpecTestId(null)
    setEditSpecValue('')
  }

  const toggle = (opt: AllocatedTestOption) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(opt.testParameterId)) next.delete(opt.testParameterId)
      else next.add(opt.testParameterId)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const o of filtered) next.delete(o.testParameterId)
      } else {
        for (const o of filtered) next.add(o.testParameterId)
      }
      return next
    })
  }

  const handleConfirm = async () => {
    if (!hasChanges) return
    await onConfirm(selectionChange)
    onOpenChange(false)
  }

  const openAddTestParameterDirectory = () => {
    openAddTestParameterWindow({
      isCodeId: row?.isCodeId,
      isCodeLabel: row?.isCodeLabel,
      department: row?.department,
      designation: row?.designation,
    })
  }

  const sectionLabel = row?.sectionCode?.trim() || '—'
  const editSpecTestLabel =
    options.find((o) => o.testParameterId === editSpecTestId)?.testLabel ?? ''
  const alreadyCount = options.filter((o) => o.alreadyInSection).length
  const availableCount = options.length - alreadyCount

  const applyLabel = (() => {
    const { toAdd, toRemove, toUpdate } = selectionChange
    const parts: string[] = []
    if (toAdd.length > 0) parts.push(`Add ${toAdd.length}`)
    if (toRemove.length > 0) parts.push(`Remove ${toRemove.length}`)
    if (toUpdate.length > 0) parts.push(`Update ${toUpdate.length}`)
    if (parts.length === 0) return 'Apply'
    return parts.join(' · ')
  })()

  const cellClass = 'border-b border-r border-border/60 px-2 py-2 text-sm last:border-r-0'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] flex flex-col gap-0 overflow-hidden p-0 sm:rounded-lg"
        layer="nested"
        showCloseButton={!editSpecOpen}
      >
        <DialogHeader className="px-6 pt-5 pb-3 pr-14 space-y-2">
          <div className="flex flex-row flex-wrap items-center gap-3 sm:pr-2">
            <DialogTitle className="shrink-0 whitespace-nowrap">
              Manage Tests — Section {sectionLabel}
            </DialogTitle>
            <Input
              placeholder="Search test name, clause, requirement…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 min-w-[12rem] flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="default"
              className="shrink-0 gap-1.5"
              disabled={!row?.isCodeId}
              title="Add a new test parameter in Test Parameter module"
              onClick={openAddTestParameterDirectory}
            >
              <Plus size={14} />
              Add New Test Parameter
            </Button>
          </div>
          {!loading && options.length > 0 ? (
            <p className="text-xs text-muted-foreground font-normal text-left">
              {alreadyCount} already in section · {availableCount} available · Unselect to remove from
              section
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-2">
          {error ? (
            <p className="text-sm text-destructive py-4">{error}</p>
          ) : !row?.isCodeId ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No IS code on this section. Set IS code in Sample Receiving first.
            </p>
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
                    aria-label="Select all tests"
                    checked={allFilteredSelected}
                    disabled={loading || filtered.length === 0}
                    onChange={toggleAll}
                  />
                </div>
                <div className={cn(cellClass, 'bg-muted/50 text-left')}>Test Name</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Clause Number</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Specified Requirement</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Uncertainty</div>
                <div className={cn(cellClass, 'bg-muted/50 text-center')}>Under Accreditation</div>
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No test parameters found for this IS code and department in Test Parameter master.
                </p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No matches for &quot;{search.trim()}&quot;.
                </p>
              ) : (
                filtered.map((opt) => {
                  const inSection = Boolean(opt.alreadyInSection)
                  const checked = selectedIds.has(opt.testParameterId)
                  const willRemove = inSection && !checked
                  return (
                    <div
                      key={opt.testParameterId}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        TEST_GRID_COLS,
                        'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        willRemove && 'bg-destructive/5',
                        inSection && checked && 'bg-muted/20',
                      )}
                      onClick={() => toggle(opt)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(opt)
                        }
                      }}
                    >
                      <div className={cn(cellClass, 'flex items-start justify-center')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(opt)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={
                            inSection
                              ? checked
                                ? `${opt.testLabel} (in section — uncheck to remove)`
                                : `${opt.testLabel} (will be removed)`
                              : `Select ${opt.testLabel}`
                          }
                        />
                      </div>
                      <div className={cn(cellClass, 'font-medium break-words')}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{opt.testLabel}</span>
                          {inSection && checked ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              In section
                            </span>
                          ) : null}
                          {willRemove ? (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                              Will remove
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div
                        className={cn(
                          cellClass,
                          'text-xs text-muted-foreground text-center break-words',
                        )}
                      >
                        {opt.clauseNo?.trim() || '—'}
                      </div>
                      <div className={cn(cellClass, 'text-xs text-muted-foreground break-words')}>
                        <div className="flex items-start w-full gap-1">
                          <span className="flex-1 min-w-0 break-words whitespace-pre-wrap text-center">
                            {displaySpecificRequirement(opt)}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 ml-auto"
                            aria-label="Edit specified requirement"
                            onClick={(e) => openEditSpec(opt, e)}
                          >
                            <Pencil size={14} />
                          </Button>
                        </div>
                      </div>
                      <div
                        className={cn(
                          cellClass,
                          'text-xs text-muted-foreground text-center break-words',
                        )}
                      >
                        {opt.uncertaintyMu?.trim() || '—'}
                      </div>
                      <div className={cn(cellClass, 'text-xs text-center break-words')}>
                        {opt.underAccreditation || '—'}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving…' : applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent className="max-w-md" layer="stacked">
          <DialogHeader>
            <DialogTitle>Edit Specified Requirement — Section {sectionLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Applies only to this section code. Test Parameter master and other sections are not
              changed. Click Apply to save requirement edits for tests already in the section.
            </p>
            {editSpecTestLabel ? (
              <p className="text-sm font-medium">{editSpecTestLabel}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="add-section-edit-spec-value">Specified Requirement</Label>
              <Textarea
                id="add-section-edit-spec-value"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.30 Maximum"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditSpecOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveEditSpec}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
