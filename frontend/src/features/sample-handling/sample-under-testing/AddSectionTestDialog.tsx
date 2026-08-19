import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Pencil, Plus, Search } from 'lucide-react'
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
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  AddTestParameterNestedDialog,
  type AddedTestParameterInfo,
} from '@/features/masters/test-parameter/AddTestParameterNestedDialog'
import type { TestAllocationRow } from '../types'
import {
  fetchIsCodeTestsForSection,
  type AllocatedTestOption,
  type SectionTestSelectionChange,
} from './allocatedTestsForSection'
import { formatTestParamClauseLine } from '../shared/formatTestParamClauseLine'
import { toProperRequirementText } from '../shared/toProperRequirementText'
import { SectionSampleDescViewDialog } from '../shared/SectionSampleDescViewDialog'

const TEST_GRID_COLS =
  'grid grid-cols-[2.25rem_minmax(9rem,1.5fr)_minmax(4.5rem,0.55fr)_minmax(10rem,2fr)_minmax(5rem,0.8fr)_minmax(7rem,1.1fr)]'

const thClass = cn(limsTableHeadClass, 'border-b border-r border-stone-700 !p-2 last:border-r-0')
const thCenterClass = cn(thClass, 'flex items-center justify-center')
const tdClass =
  'border-b border-r border-[#e7e0d4] px-2 py-2 text-xs text-[#292524] last:border-r-0'
const tdCenterClass = cn(tdClass, 'flex items-center justify-center text-center')
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/70 hover:bg-[#fde68a]/80'
const rowWillRemoveClass = 'bg-red-50/80 hover:bg-red-50'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const pencilBtnClass =
  'h-7 w-7 shrink-0 rounded-none text-amber-800 hover:bg-amber-500/15 hover:text-amber-950'

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
  const [addTestParameterOpen, setAddTestParameterOpen] = useState(false)
  const [sampleDetailsOpen, setSampleDetailsOpen] = useState(false)
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
      const unit = (o.unitValue ?? '').toLowerCase()
      const isCode = (o.isCodeLabel ?? '').toLowerCase()
      const accr = (o.underAccreditation ?? '').toLowerCase()
      return (
        label.includes(q) ||
        spec.includes(q) ||
        clause.includes(q) ||
        unit.includes(q) ||
        isCode.includes(q) ||
        accr.includes(q)
      )
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
    const raw = override !== undefined ? override.trim() || '—' : opt.specificRequirement?.trim() || '—'
    if (raw === '—') return raw
    return toProperRequirementText(raw)
  }

  const openEditSpec = (opt: AllocatedTestOption, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditSpecTestId(opt.testParameterId)
    const raw = specOverrides[opt.testParameterId] ?? opt.specificRequirement ?? ''
    setEditSpecValue(toProperRequirementText(raw))
    setEditSpecOpen(true)
  }

  const saveEditSpec = () => {
    if (!editSpecTestId) return
    const nextValue = toProperRequirementText(editSpecValue).trim()
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
    if (hasChanges) await onConfirm(selectionChange)
    onOpenChange(false)
  }

  const openAddTestParameterDirectory = () => {
    setAddTestParameterOpen(true)
  }

  const handleTestParameterAdded = (param: AddedTestParameterInfo) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.add(param.id)
      return next
    })
    void loadOptions('soft')
  }

  const sectionLabel = row?.sectionCode?.trim() || '—'
  const editSpecTestLabel =
    options.find((o) => o.testParameterId === editSpecTestId)?.testLabel ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          limsDialogClass,
          'left-0 top-0 z-[60] flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
        )}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        layer="nested"
        showCloseButton={!editSpecOpen && !addTestParameterOpen && !sampleDetailsOpen}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-row flex-wrap items-center gap-3 pr-10">
            <DialogHeader className="shrink-0 space-y-0 text-left">
              <DialogTitle className="whitespace-nowrap text-base font-semibold tracking-tight text-white sm:text-lg">
                Manage Tests — Section {sectionLabel}
              </DialogTitle>
            </DialogHeader>
            <div className="relative w-[14rem] shrink-0 sm:w-[18rem]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                placeholder="Search Test Name | Method | Clause"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(limsDarkBarSearchClass, 'h-8 pl-9')}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'h-8 shrink-0 gap-1.5')}
              disabled={!row}
              aria-label="View sample description and sample declaration"
              title="Sample Description & Sample Declaration"
              onClick={() => setSampleDetailsOpen(true)}
            >
              <FileText size={14} />
              Sample Details
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(limsPrimaryBtnClass, 'h-8 shrink-0 gap-1.5')}
              disabled={!row?.isCodeId}
              title="Add a new test parameter"
              onClick={openAddTestParameterDirectory}
            >
              <Plus size={14} />
              Add New Test Parameter
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          {error ? (
            <p className="py-4 text-sm text-red-700">{error}</p>
          ) : !row?.isCodeId ? (
            <p className="py-6 text-center text-sm text-[#57534e]">
              No IS code on this section. Set IS code in Sample Receiving first.
            </p>
          ) : (
            <div className={cn(limsPanelClass, 'min-h-full bg-[#f7f3eb]')}>
              <div className={cn(TEST_GRID_COLS, 'sticky top-0 z-10 bg-stone-800')}>
                <div className={cn(thClass, 'flex items-center justify-center')}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select all tests"
                    checked={allFilteredSelected}
                    disabled={loading || filtered.length === 0}
                    onChange={toggleAll}
                  />
                </div>
                <div className={cn(thClass, 'flex items-center text-left')}>Test Name</div>
                <div className={thCenterClass}>Unit</div>
                <div className={thCenterClass}>Specified Requirement</div>
                <div className={thCenterClass}>Uncertainty</div>
                <div className={thCenterClass}>Under Accreditation</div>
              </div>

              {loading ? (
                <p className="py-8 text-center text-sm text-[#57534e]">Loading…</p>
              ) : options.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#57534e]">
                  No test parameters found for this IS code and department in Test Parameter master.
                </p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#57534e]">
                  No matches for &quot;{search.trim()}&quot;.
                </p>
              ) : (
                filtered.map((opt, index) => {
                  const inSection = Boolean(opt.alreadyInSection)
                  const checked = selectedIds.has(opt.testParameterId)
                  const willRemove = inSection && !checked
                  const clauseLine = formatTestParamClauseLine(opt, row?.isCodeLabel)
                  return (
                    <div
                      key={opt.testParameterId}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        TEST_GRID_COLS,
                        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-inset',
                        willRemove
                          ? rowWillRemoveClass
                          : checked
                            ? rowSelectedClass
                            : index % 2 === 0
                              ? rowEvenClass
                              : rowOddClass,
                      )}
                      onClick={() => toggle(opt)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(opt)
                        }
                      }}
                    >
                      <div className={cn(tdClass, 'flex items-center justify-center')}>
                        <input
                          type="checkbox"
                          className={checkboxClass}
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
                      <div className={cn(tdClass, 'break-words font-semibold text-[#1c1917]')}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{opt.testLabel}</span>
                          {inSection && checked ? (
                            <span className="border border-amber-700/40 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                              In section
                            </span>
                          ) : null}
                          {willRemove ? (
                            <span className="border border-red-500/40 bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">
                              Will remove
                            </span>
                          ) : null}
                        </div>
                        {clauseLine ? (
                          <span className="mt-0.5 block text-[11px] font-normal text-[#57534e]">
                            {clauseLine}
                          </span>
                        ) : null}
                      </div>
                      <div className={cn(tdCenterClass, 'break-words text-[#57534e]')}>
                        {opt.unitValue?.trim() || '—'}
                      </div>
                      <div className={cn(tdCenterClass, 'text-[#57534e]')}>
                        <div className="flex w-full items-center justify-center gap-1">
                          <span className="min-w-0 flex-1 break-words whitespace-pre-wrap text-center">
                            {displaySpecificRequirement(opt)}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={cn(pencilBtnClass, 'shrink-0')}
                            aria-label="Edit specified requirement"
                            onClick={(e) => openEditSpec(opt, e)}
                          >
                            <Pencil size={14} />
                          </Button>
                        </div>
                      </div>
                      <div className={cn(tdCenterClass, 'break-words text-[#57534e]')}>
                        {opt.uncertaintyMu?.trim() || '—'}
                      </div>
                      <div className={cn(tdCenterClass, 'break-words text-[#57534e]')}>
                        {opt.underAccreditation || '—'}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        <DialogFooter className="relative shrink-0 gap-2 border-t-2 border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end sm:px-5">
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'relative min-w-[8.5rem]')}
            onClick={() => void handleConfirm()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AddTestParameterNestedDialog
        open={addTestParameterOpen}
        onOpenChange={setAddTestParameterOpen}
        layer="stacked"
        prefill={{
          isCodeId: row?.isCodeId,
          isCodeLabel: row?.isCodeLabel,
          department: row?.department,
          designation: row?.designation,
        }}
        onSaved={handleTestParameterAdded}
      />

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent
          className={cn(
            limsDialogClass,
            '!max-w-md !gap-0 !p-0',
            'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          portalClassName="md:left-[268px]"
          layer="stacked"
          aria-describedby={undefined}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                Edit Specified Requirements — Section {sectionLabel}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#f7f3eb] px-4 py-4">
            {editSpecTestLabel ? (
              <p className="text-sm font-medium text-[#1c1917]">{editSpecTestLabel}</p>
            ) : null}
            <div className="space-y-2">
              <Label
                htmlFor="add-section-edit-spec-value"
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                Specified Requirement
              </Label>
              <Textarea
                id="add-section-edit-spec-value"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.30 Maximum"
                className="rounded-none border-stone-500 bg-stone-50 shadow-none focus-visible:border-amber-600 focus-visible:ring-amber-500/20"
              />
            </div>
          </div>
          <DialogFooter className="relative gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
            <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'relative min-w-[8.5rem]')}
              onClick={saveEditSpec}
            >
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SectionSampleDescViewDialog
        row={row}
        open={sampleDetailsOpen}
        onOpenChange={setSampleDetailsOpen}
        layer="stacked"
      />
    </Dialog>
  )
}
