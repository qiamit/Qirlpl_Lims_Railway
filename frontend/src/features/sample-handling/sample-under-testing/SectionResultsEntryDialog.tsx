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
import { cn } from '@/lib/utils'
import { Eye, Pencil, Plus } from 'lucide-react'
import type { TestAllocationRow } from '../types'
import { AddSectionTestDialog } from './AddSectionTestDialog'
import type { SectionTestSelectionChange } from './allocatedTestsForSection'
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
  'grid grid-cols-[minmax(9rem,1.2fr)_minmax(10rem,1.6fr)_minmax(8rem,0.9fr)_minmax(8rem,0.9fr)_minmax(12rem,1.8fr)]'

const cellClass = 'border-b border-r border-border/60 px-2 py-2 text-sm last:border-r-0'

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

const formatDateDisplay = (v: string | null | undefined) => {
  const input = toDateInput(v)
  if (!input) return '—'
  const [y, m, d] = input.split('-')
  return `${d}/${m}/${y}`
}

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
}) {
  const [draft, setDraft] = useState<SectionResultsDraft[]>([])
  const [bulkDatePrompt, setBulkDatePrompt] = useState<{
    field: BulkDateField
    value: string
  } | null>(null)
  const [addTestOpen, setAddTestOpen] = useState(false)
  const [addingTests, setAddingTests] = useState(false)
  const [editSpecOpen, setEditSpecOpen] = useState(false)
  const [editSpecEntry, setEditSpecEntry] = useState<SectionParameterEntry | null>(null)
  const [editSpecValue, setEditSpecValue] = useState('')
  const [editSpecSaving, setEditSpecSaving] = useState(false)
  const [editSpecError, setEditSpecError] = useState<string | null>(null)
  const openSectionKeyRef = useRef<string | null>(null)
  const nestedDialogOpen = addTestOpen || editSpecOpen || bulkDatePrompt !== null

  useEffect(() => {
    if (!open) {
      openSectionKeyRef.current = null
      setDraft([])
      setBulkDatePrompt(null)
      setAddTestOpen(false)
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
      return
    }
    setDraft((prev) => mergeSectionDraftPreservingEdits(prev, next))
  }, [open, row])

  const handleParentOpenChange = (next: boolean) => {
    if (!next && nestedDialogOpen) return
    onOpenChange(next)
  }

  const sectionCompareItems = useMemo(
    () =>
      draft.map((p) => ({
        paramKey: paramKeyFromRow(p.paramRowId, p.testLabel),
        testLabel: p.testLabel,
        results: p.results,
      })),
    [draft],
  )

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
    setDraft((prev) => prev.map((p) => ({ ...p, [field]: value })))
    setBulkDatePrompt(null)
  }

  const bulkDateLabel =
    bulkDatePrompt?.field === 'testStartDate' ? 'Test Start Date' : 'Test End Date'

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
    setEditSpecValue(entry.specificRequirement?.trim() || entry.sectionSpecOverride?.trim() || '')
    setEditSpecError(null)
    setEditSpecOpen(true)
  }

  const saveEditSpec = async () => {
    if (!editSpecEntry || !onUpdateSpecificRequirement) return
    setEditSpecSaving(true)
    setEditSpecError(null)
    try {
      const next = await onUpdateSpecificRequirement(editSpecEntry, editSpecValue.trim())
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
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] flex flex-col gap-0 overflow-hidden p-0 sm:rounded-lg"
        showCloseButton={!nestedDialogOpen}
      >
        <DialogHeader className="px-6 pt-6 pb-2 pr-14">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:pr-2">
            <DialogTitle>
              {readOnly ? readOnlyTitle : 'Enter Results'} — Section {sectionLabel}
            </DialogTitle>
            {!readOnly && onAddTests ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1.5"
                onClick={() => setAddTestOpen(true)}
                disabled={saving || addingTests}
              >
                <Plus size={14} />
                Manage Tests
              </Button>
            ) : null}
          </div>
          {readOnly && row?.resultsReviewerName?.trim() ? (
            <p className="text-sm text-muted-foreground">
              Sent for review to {row.resultsReviewerName}. Editing is locked until refer back.
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-2">
          <div className="min-h-full rounded-md border border-border overflow-hidden">
            <div
              className={cn(
                RESULTS_GRID_COLS,
                'sticky top-0 z-10 border-b border-border bg-muted/80 text-xs font-semibold backdrop-blur-sm',
              )}
            >
              <div className={cn(cellClass, 'bg-muted/50 text-left')}>Test Parameter</div>
              <div className={cn(cellClass, 'bg-muted/50 text-center')}>Specified Requirement</div>
              <div className={cn(cellClass, 'bg-muted/50 text-center')}>Test Start Date</div>
              <div className={cn(cellClass, 'bg-muted/50 text-center')}>Test End Date</div>
              <div className={cn(cellClass, 'bg-muted/50 text-center')}>Results</div>
            </div>

            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No test parameters for this section.
              </p>
            ) : (
              draft.map((p, index) => {
                const resultsDisplay = formatTestResultForTable(p.results)
                const resultsTitle = formatTestResultDisplay(p.results)

                return (
                  <div
                    key={`${p.paramRowId ?? 'new'}-${p.testLabel}-${index}`}
                    className={RESULTS_GRID_COLS}
                  >
                    <div className={cn(cellClass, 'align-top text-left')}>
                      <div className="flex items-start gap-1 min-w-0">
                        <span className="text-xs break-words" title={p.testLabel}>
                          {p.testLabel}
                        </span>
                        {onViewTestParameter ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            aria-label="View test parameter"
                            onClick={() => onViewTestParameter(p.testLabel)}
                          >
                            <Eye size={14} />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className={cn(cellClass, 'text-center text-xs text-muted-foreground')}>
                      <div className="flex items-start w-full gap-1">
                        <span
                          className="flex-1 min-w-0 break-words whitespace-pre-wrap text-center"
                          title={p.specificRequirement ?? undefined}
                        >
                          {p.specificRequirement?.trim() || '—'}
                        </span>
                        {!readOnly && onUpdateSpecificRequirement && p.testParameterId ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 ml-auto"
                            aria-label="Edit specified requirement"
                            onClick={() => openEditSpec(p)}
                            disabled={saving || editSpecSaving}
                          >
                            <Pencil size={14} />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className={cn(cellClass, 'text-center')}>
                      {readOnly ? (
                        <span className="text-xs block text-center break-words">
                          {formatDateDisplay(p.testStartDate)}
                        </span>
                      ) : (
                        <div className="flex justify-center">
                          <Input
                            type="date"
                            className="h-8 w-full max-w-[140px] text-xs text-center"
                            value={toDateInput(p.testStartDate)}
                            onChange={(e) => handleDateChange(index, 'testStartDate', e.target.value)}
                            onDoubleClick={() => {
                              updateDraft(index, {
                                testStartDate: new Date().toISOString().slice(0, 10),
                              })
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className={cn(cellClass, 'text-center')}>
                      {readOnly ? (
                        <span className="text-xs block text-center break-words">
                          {formatDateDisplay(p.testEndDate)}
                        </span>
                      ) : (
                        <div className="flex justify-center">
                          <Input
                            type="date"
                            className="h-8 w-full max-w-[140px] text-xs text-center"
                            value={toDateInput(p.testEndDate)}
                            onChange={(e) => handleDateChange(index, 'testEndDate', e.target.value)}
                            onDoubleClick={() => {
                              updateDraft(index, {
                                testEndDate: new Date().toISOString().slice(0, 10),
                              })
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className={cn(cellClass, 'min-w-0 text-center')}>
                      {readOnly ? (
                        <span
                          className="text-xs block text-center whitespace-pre-wrap break-words leading-relaxed"
                          title={resultsTitle || undefined}
                        >
                          {resultsDisplay || '—'}
                        </span>
                      ) : (
                        <div className="flex justify-center">
                          <TestResultsEntryCell
                            value={p.results}
                            testLabel={p.testLabel}
                            sectionCompareSources={buildSectionCompareSources(
                              sectionCompareItems,
                              paramKeyFromRow(p.paramRowId, p.testLabel),
                            )}
                            onChange={(next) => updateDraft(index, { results: next })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          {!readOnly ? (
            <Button type="button" onClick={() => void onSave(draft)} disabled={saving || draft.length === 0}>
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <Dialog
        open={bulkDatePrompt !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setBulkDatePrompt(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Populate {bulkDateLabel}?</DialogTitle>
            <DialogDescription>
              Apply{' '}
              <span className="font-medium text-foreground">
                {bulkDatePrompt ? formatDateDisplay(bulkDatePrompt.value) : '—'}
              </span>{' '}
              as {bulkDateLabel} for all {draft.length} parameters in this section?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDatePrompt(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyBulkDate}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="max-w-md" layer="nested">
          <DialogHeader>
            <DialogTitle>Edit Specified Requirement — Section {sectionLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Applies only to this section code. Test Parameter master and other sections are not changed.
            </p>
            {editSpecEntry?.testLabel ? (
              <p className="text-sm font-medium">{editSpecEntry.testLabel}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="section-results-edit-spec-value">Specified Requirement</Label>
              <Textarea
                id="section-results-edit-spec-value"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.30 Maximum"
                disabled={editSpecSaving}
              />
            </div>
            {editSpecError ? <p className="text-sm text-destructive">{editSpecError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditSpecOpen(false)} disabled={editSpecSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveEditSpec()} disabled={editSpecSaving}>
                {editSpecSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
