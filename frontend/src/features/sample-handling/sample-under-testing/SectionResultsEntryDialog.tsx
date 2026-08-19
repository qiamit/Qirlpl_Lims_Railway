import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { limsDarkBarBtnClass, limsDarkBarGlowStyle, limsDialogClass, limsFieldClass, limsPrimaryBtnClass, limsTableHeadClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { Eye, FileText, Plus } from 'lucide-react'
import type { TestAllocationRow } from '../types'
import { AddSectionTestDialog } from './AddSectionTestDialog'
import type { SectionTestSelectionChange } from './allocatedTestsForSection'
import { formatTestParamClauseLine } from '../shared/formatTestParamClauseLine'
import { toProperRequirementText } from '../shared/toProperRequirementText'
import { SectionSampleDescViewDialog } from '../shared/SectionSampleDescViewDialog'
import { TestResultsEntryCell } from './TestResultsEntryCell'
import { buildSectionCompareSources, paramKeyFromRow } from './sectionCompareSources'
import {
  getSectionParametersForEntry,
  mergeSectionDraftPreservingEdits,
  type SectionParameterEntry,
} from './sectionParameterRows'
import { formatTestResultDisplay, formatTestResultForTable } from './testResultValues'

export type SectionResultsDraft = SectionParameterEntry

type BulkDateField = 'testStartDate' | 'testEndDate'

const RESULTS_GRID_COLS =
  'grid grid-cols-[2.5rem_minmax(9rem,1.2fr)_minmax(4.5rem,0.5fr)_minmax(10rem,1.5fr)_minmax(8rem,0.9fr)_minmax(8rem,0.9fr)_minmax(12rem,1.7fr)]'

const cellClass =
  'flex h-full min-h-[2.75rem] items-center border-b border-r border-[#e7e0d4] px-2 py-2 text-xs text-[#292524] last:border-r-0'
const headCellClass = cn(
  limsTableHeadClass,
  'flex h-full items-center justify-center border-b border-r border-stone-700 !p-2 last:border-r-0',
)
const rowEvenClass = 'bg-[#f7f3eb]'
const rowOddClass = 'bg-[#fffcf7]'
const eyeBtnClass =
  'h-7 w-7 shrink-0 rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'
const dateInputClass = cn(limsFieldClass, 'h-8 w-full max-w-[140px] text-xs text-center')
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const dialogShellClass = cn(
  limsDialogClass,
  '!fixed !left-0 !top-0 !flex !h-[100dvh] !max-h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !rounded-none !border-0 !bg-white !p-0 sm:!rounded-none',
  'md:!left-[268px] md:!w-[calc(100vw-268px)] md:!max-w-[calc(100vw-268px)]',
)

const toDateInput = (v: string | null | undefined) => {
  if (!v?.trim()) return ''
  const s = v.trim()
  // Pass through ISO date so mid-typing years (e.g. 0002) are not timezone-shifted.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Chrome fires onChange while year is still being typed (e.g. 0002-01-10). */
const isCompleteIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= 1000
}

const formatDateDisplay = (v: string | null | undefined) => formatDate(toDateInput(v) || v)

export function SectionResultsEntryDialog({
  open,
  onOpenChange,
  row,
  readOnly,
  saving,
  onSave,
  onViewTestParameter,
  onAddTests,
  onUpdateSpecificRequirement,
  readOnlyTitle = 'Submitted Results',
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: TestAllocationRow | null
  readOnly: boolean
  saving?: boolean
  onSave: (draft: SectionResultsDraft[]) => void | Promise<void>
  onViewTestParameter?: (testLabel: string) => void
  onAddTests?: (change: SectionTestSelectionChange) => Promise<void>
  onUpdateSpecificRequirement?: (
    entry: SectionParameterEntry,
    nextValue: string,
  ) => Promise<{ sectionSpecOverride: string | null; specificRequirement: string | null }>
  readOnlyTitle?: string
  layer?: 'default' | 'nested' | 'stacked' | 'top'
}) {
  const [draft, setDraft] = useState<SectionResultsDraft[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [bulkDatePrompt, setBulkDatePrompt] = useState<{
    field: BulkDateField
    value: string
  } | null>(null)
  const [addTestOpen, setAddTestOpen] = useState(false)
  const [sampleDetailsOpen, setSampleDetailsOpen] = useState(false)
  const [addingTests, setAddingTests] = useState(false)
  const [editSpecOpen, setEditSpecOpen] = useState(false)
  const [editSpecEntry, setEditSpecEntry] = useState<SectionParameterEntry | null>(null)
  const [editSpecValue, setEditSpecValue] = useState('')
  const [editSpecSaving, setEditSpecSaving] = useState(false)
  const [editSpecError, setEditSpecError] = useState<string | null>(null)
  const openSectionKeyRef = useRef<string | null>(null)
  const nestedDialogOpen =
    addTestOpen ||
    sampleDetailsOpen ||
    editSpecOpen ||
    bulkDatePrompt !== null

  useEffect(() => {
    if (!open) {
      openSectionKeyRef.current = null
      setDraft([])
      setSelectedKeys(new Set())
      setBulkDatePrompt(null)
      setAddTestOpen(false)
      setSampleDetailsOpen(false)
      setEditSpecOpen(false)
      setEditSpecEntry(null)
      setEditSpecValue('')
      setEditSpecError(null)
      return
    }
    // Keep draft while open if row briefly null (parent race); do not clear section key.
    if (!row) return
    const sectionKey = row.testAllocationId?.trim() || row.sampleAllocationId?.trim() || ''
    const next = getSectionParametersForEntry(row)
    const sameSectionOpen = openSectionKeyRef.current === sectionKey
    openSectionKeyRef.current = sectionKey

    if (!sameSectionOpen) {
      setDraft(next)
      setSelectedKeys(new Set())
      return
    }
    setDraft((prev) => mergeSectionDraftPreservingEdits(prev, next))
  }, [open, row])

  const handleParentOpenChange = (next: boolean) => {
    if (!next && nestedDialogOpen) return
    onOpenChange(next)
  }

  const rowKeyAt = (p: SectionParameterEntry, index: number) =>
    paramKeyFromRow(p.paramRowId, p.testLabel) || `idx-${index}`

  const sectionCompareItems = useMemo(
    () =>
      draft.map((p) => ({
        paramKey: paramKeyFromRow(p.paramRowId, p.testLabel),
        testLabel: p.testLabel,
        results: p.results,
      })),
    [draft],
  )

  const draftKeys = useMemo(
    () => draft.map((p, i) => paramKeyFromRow(p.paramRowId, p.testLabel) || `idx-${i}`),
    [draft],
  )
  const allChecked = draftKeys.length > 0 && draftKeys.every((k) => selectedKeys.has(k))
  const someChecked = draftKeys.some((k) => selectedKeys.has(k))
  const selectedCount = draftKeys.filter((k) => selectedKeys.has(k)).length

  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(checked ? new Set(draftKeys) : new Set())
  }

  const updateDraft = (index: number, patch: Partial<SectionResultsDraft>) => {
    setDraft((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const handleDateChange = (index: number, field: BulkDateField, value: string) => {
    const nextValue = value || null
    updateDraft(index, { [field]: nextValue })
    // Only ask to fill all rows after a full date — incomplete years must not steal focus.
    if (value && isCompleteIsoDate(value) && draft.length > 1) {
      setBulkDatePrompt({ field, value })
    }
  }

  const applyBulkDate = () => {
    if (!bulkDatePrompt) return
    const { field, value } = bulkDatePrompt
    setDraft((prev) =>
      prev.map((p, i) => {
        const key = rowKeyAt(p, i)
        if (selectedKeys.size > 0 && !selectedKeys.has(key)) return p
        return { ...p, [field]: value }
      }),
    )
    setBulkDatePrompt(null)
  }

  const bulkDateLabel =
    bulkDatePrompt?.field === 'testStartDate' ? 'Test Start Date' : 'Test End Date'
  const bulkDateTargetCount = selectedKeys.size > 0 ? selectedCount : draft.length
  const bulkDateTargetLabel =
    selectedKeys.size > 0
      ? `${bulkDateTargetCount} selected parameter${bulkDateTargetCount === 1 ? '' : 's'}`
      : `all ${draft.length} parameters`

  const sectionLabel = row?.sectionCode?.trim() || '—'

  const handleAddTestsConfirm = async (change: SectionTestSelectionChange) => {
    if (!onAddTests) return
    setAddingTests(true)
    try {
      await onAddTests(change)
    } finally {
      setAddingTests(false)
    }
  }

  const openEditSpec = (entry: SectionParameterEntry) => {
    setEditSpecEntry(entry)
    setEditSpecValue(
      toProperRequirementText(
        entry.specificRequirement?.trim() || entry.sectionSpecOverride?.trim() || '',
      ),
    )
    setEditSpecError(null)
    setEditSpecOpen(true)
  }

  const openParameterDetails = (entry: SectionParameterEntry) => {
    if (onViewTestParameter) {
      onViewTestParameter(entry.testLabel)
      return
    }
    if (!readOnly && onUpdateSpecificRequirement && entry.testParameterId) {
      openEditSpec(entry)
    }
  }

  const saveEditSpec = async () => {
    if (!editSpecEntry || !onUpdateSpecificRequirement) return
    setEditSpecSaving(true)
    setEditSpecError(null)
    try {
      const next = await onUpdateSpecificRequirement(
        editSpecEntry,
        toProperRequirementText(editSpecValue).trim(),
      )
      setDraft((prev) =>
        prev.map((p) =>
          p.testLabel === editSpecEntry.testLabel && p.paramRowId === editSpecEntry.paramRowId
            ? {
                ...p,
                sectionSpecOverride: next.sectionSpecOverride,
                specificRequirement: next.specificRequirement,
              }
            : p,
        ),
      )
      setEditSpecOpen(false)
      setEditSpecEntry(null)
      setEditSpecValue('')
    } catch (err) {
      setEditSpecError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditSpecSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleParentOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(dialogShellClass, layer !== 'default' && '!z-[60]')}
        showCloseButton={!nestedDialogOpen}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-col gap-2 pr-10 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <DialogHeader className="shrink-0 space-y-0 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {readOnly ? readOnlyTitle : 'Enter Results'} — Section {sectionLabel}
              </DialogTitle>
            </DialogHeader>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {row ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('gap-1.5', limsDarkBarBtnClass)}
                  onClick={() => setSampleDetailsOpen(true)}
                  disabled={saving}
                  aria-label="View sample description and declared value"
                  title="Sample Description & Customer Declaration"
                >
                  <FileText size={14} />
                  Sample Details
                </Button>
              ) : null}
              {!readOnly && onAddTests ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('gap-1.5', limsDarkBarBtnClass)}
                  onClick={() => setAddTestOpen(true)}
                  disabled={saving || addingTests}
                >
                  <Plus size={14} />
                  Manage Tests
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          <div className="min-h-full overflow-hidden border-2 border-stone-500 bg-[#f7f3eb] shadow-sm ring-1 ring-amber-700/20">
            <div className={cn(RESULTS_GRID_COLS, 'sticky top-0 z-10 bg-stone-800')}>
              <div className={cn(headCellClass, 'text-center')}>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label="Select all parameters"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  disabled={draft.length === 0}
                />
              </div>
              <div className={cn(headCellClass, 'justify-start text-left')}>Test Parameter</div>
              <div className={headCellClass}>Unit</div>
              <div className={headCellClass}>Specified Requirement</div>
              <div className={headCellClass}>Test Start Date</div>
              <div className={headCellClass}>Test End Date</div>
              <div className={headCellClass}>Results</div>
            </div>

            {draft.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#57534e]">
                No test parameters for this section.
              </p>
            ) : (
              draft.map((p, index) => {
                const resultsDisplay = formatTestResultForTable(p.results)
                const resultsTitle = formatTestResultDisplay(p.results)
                const key = rowKeyAt(p, index)
                const canViewDetails =
                  Boolean(onViewTestParameter) ||
                  (!readOnly && Boolean(onUpdateSpecificRequirement && p.testParameterId))
                const clauseLine = formatTestParamClauseLine(p, row?.isCodeLabel)

                return (
                  <div
                    key={`${p.paramRowId ?? 'new'}-${p.testLabel}-${index}`}
                    className={cn(RESULTS_GRID_COLS, index % 2 === 0 ? rowEvenClass : rowOddClass)}
                  >
                    <div className={cn(cellClass, 'justify-center')}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${p.testLabel}`}
                        checked={selectedKeys.has(key)}
                        onChange={() => toggleRow(key)}
                      />
                    </div>
                    <div className={cn(cellClass, 'items-start justify-start gap-1 text-left')}>
                      <div className="min-w-0 flex-1">
                        <span
                          className="block break-words text-[12.5px] font-semibold text-[#1c1917]"
                          title={p.testLabel}
                        >
                          {p.testLabel}
                        </span>
                        {clauseLine ? (
                          <span className="mt-0.5 block text-[11px] font-normal text-[#57534e]">
                            {clauseLine}
                          </span>
                        ) : null}
                      </div>
                      {canViewDetails ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(eyeBtnClass, 'mt-0.5')}
                          aria-label={`View parameter details for ${p.testLabel}`}
                          title="View full test parameter details"
                          onClick={() => openParameterDetails(p)}
                          disabled={saving || editSpecSaving}
                        >
                          <Eye size={14} strokeWidth={2.25} />
                        </Button>
                      ) : null}
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center text-[#57534e]')}>
                      {p.unitValue?.trim() || '—'}
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center')}>
                      <span
                        className="w-full break-words whitespace-pre-wrap text-center text-[#57534e]"
                        title={
                          p.specificRequirement?.trim()
                            ? toProperRequirementText(p.specificRequirement)
                            : undefined
                        }
                      >
                        {p.specificRequirement?.trim()
                          ? toProperRequirementText(p.specificRequirement)
                          : '—'}
                      </span>
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center')}>
                      {readOnly ? (
                        <span className="break-words text-center">
                          {formatDateDisplay(p.testStartDate)}
                        </span>
                      ) : (
                        <Input
                          type="date"
                          className={dateInputClass}
                          value={toDateInput(p.testStartDate)}
                          onChange={(e) => handleDateChange(index, 'testStartDate', e.target.value)}
                          onDoubleClick={() => {
                            updateDraft(index, {
                              testStartDate: new Date().toISOString().slice(0, 10),
                            })
                          }}
                        />
                      )}
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center')}>
                      {readOnly ? (
                        <span className="break-words text-center">
                          {formatDateDisplay(p.testEndDate)}
                        </span>
                      ) : (
                        <Input
                          type="date"
                          className={dateInputClass}
                          value={toDateInput(p.testEndDate)}
                          onChange={(e) => handleDateChange(index, 'testEndDate', e.target.value)}
                          onDoubleClick={() => {
                            updateDraft(index, {
                              testEndDate: new Date().toISOString().slice(0, 10),
                            })
                          }}
                        />
                      )}
                    </div>
                    <div className={cn(cellClass, 'min-w-0 justify-center text-center')}>
                      {readOnly ? (
                        <span
                          className="w-full break-words whitespace-pre-wrap text-center leading-relaxed"
                          title={resultsTitle || undefined}
                        >
                          {resultsDisplay || '—'}
                        </span>
                      ) : (
                        <TestResultsEntryCell
                          value={p.results}
                          testLabel={p.testLabel}
                          sectionCompareSources={buildSectionCompareSources(
                            sectionCompareItems,
                            paramKeyFromRow(p.paramRowId, p.testLabel),
                          )}
                          onChange={(next) => updateDraft(index, { results: next })}
                        />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="relative shrink-0 overflow-hidden border-t-2 border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5">
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
            {!readOnly ? (
              <Button
                type="button"
                className={cn('h-8', limsPrimaryBtnClass)}
                onClick={() => void onSave(draft)}
                disabled={saving || draft.length === 0}
              >
                {saving ? 'Saving…' : 'Save & Close'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className={limsDarkBarBtnClass}
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      <Dialog
        open={bulkDatePrompt !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setBulkDatePrompt(null)
        }}
      >
        <DialogContent className={cn(limsDialogClass, 'max-w-sm p-0')} layer="nested">
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                Populate {bulkDateLabel}?
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#f7f3eb] px-4 py-4">
            <DialogDescription className="text-[#57534e]">
              Apply{' '}
              <span className="font-medium text-[#1c1917]">
                {bulkDatePrompt ? formatDateDisplay(bulkDatePrompt.value) : '—'}
              </span>{' '}
              as {bulkDateLabel} for {bulkDateTargetLabel} in this section?
            </DialogDescription>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-stone-500"
                onClick={() => setBulkDatePrompt(null)}
              >
                Cancel
              </Button>
              <Button type="button" className={limsPrimaryBtnClass} onClick={applyBulkDate}>
                OK
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <SectionSampleDescViewDialog
        row={row}
        open={sampleDetailsOpen}
        onOpenChange={setSampleDetailsOpen}
      />

      {!readOnly && onAddTests ? (
        <AddSectionTestDialog
          open={addTestOpen}
          onOpenChange={setAddTestOpen}
          row={row}
          existingDraft={draft}
          onConfirm={handleAddTestsConfirm}
          saving={addingTests}
        />
      ) : null}

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent
          className={cn(
            limsDialogClass,
            '!max-w-md !gap-0 !p-0',
            'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          portalClassName="md:left-[268px]"
          layer="nested"
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                Edit Specified Requirements — Section {sectionLabel}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#f7f3eb] px-4 py-4">
            {editSpecEntry?.testLabel ? (
              <p className="text-sm font-medium text-[#1c1917]">{editSpecEntry.testLabel}</p>
            ) : null}
            <div className="space-y-2">
              <Label
                htmlFor="section-results-edit-spec-value"
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                Specified Requirement
              </Label>
              <Textarea
                id="section-results-edit-spec-value"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.30 Maximum"
                className="rounded-none border-stone-500 bg-stone-50"
                disabled={editSpecSaving}
              />
            </div>
            {editSpecError ? <p className="text-sm text-red-700">{editSpecError}</p> : null}
          </div>
          <DialogFooter className="relative gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
            <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'relative min-w-[8.5rem]')}
              onClick={() => void saveEditSpec()}
              disabled={editSpecSaving}
            >
              {editSpecSaving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
