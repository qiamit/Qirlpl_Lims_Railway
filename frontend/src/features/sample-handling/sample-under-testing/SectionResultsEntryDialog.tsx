import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Eye } from 'lucide-react'
import type { TestAllocationRow } from '../types'
import { TestResultsEntryCell } from './TestResultsEntryCell'
import { buildSectionCompareSources, paramKeyFromRow } from './sectionCompareSources'
import {
  getSectionParametersForEntry,
  type SectionParameterEntry,
} from './sectionParameterRows'
import { formatTestResultDisplay, formatTestResultForTable } from './testResultValues'

export type SectionResultsDraft = SectionParameterEntry

type BulkDateField = 'testStartDate' | 'testEndDate'

const toDateInput = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 10) : ''

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
  readOnlyTitle = 'Submitted Results',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: TestAllocationRow | null
  readOnly: boolean
  saving?: boolean
  onSave: (draft: SectionResultsDraft[]) => void | Promise<void>
  onViewTestParameter?: (testLabel: string) => void
  readOnlyTitle?: string
}) {
  const [draft, setDraft] = useState<SectionResultsDraft[]>([])
  const [bulkDatePrompt, setBulkDatePrompt] = useState<{
    field: BulkDateField
    value: string
  } | null>(null)

  useEffect(() => {
    if (!open || !row) {
      setDraft([])
      setBulkDatePrompt(null)
      return
    }
    setDraft(getSectionParametersForEntry(row))
  }, [open, row])

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
    if (value && draft.length > 1) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {readOnly ? readOnlyTitle : 'Enter Results'} — Section {sectionLabel}
          </DialogTitle>
          {readOnly && row?.resultsReviewerName?.trim() ? (
            <p className="text-sm text-muted-foreground">
              Sent for review to {row.resultsReviewerName}. Editing is locked until refer back.
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-2">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs w-[18%] text-left">Test Parameter</TableHead>
                <TableHead className="text-xs text-center w-[26%]">Specified Requirement</TableHead>
                <TableHead className="text-xs text-center w-[14%]">Test Start Date</TableHead>
                <TableHead className="text-xs text-center w-[14%]">Test End Date</TableHead>
                <TableHead className="text-xs text-center w-[28%]">Results</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground text-center py-6">
                    No test parameters for this section.
                  </TableCell>
                </TableRow>
              ) : (
                draft.map((p, index) => {
                  const resultsDisplay = formatTestResultForTable(p.results)
                  const resultsTitle = formatTestResultDisplay(p.results)

                  return (
                  <TableRow key={`${p.paramRowId ?? 'new'}-${p.testLabel}-${index}`}>
                    <TableCell className="align-top text-left">
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
                    </TableCell>
                    <TableCell className="align-top text-center text-xs text-muted-foreground">
                      <span className="break-words whitespace-pre-wrap" title={p.specificRequirement ?? undefined}>
                        {p.specificRequirement?.trim() || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="align-top p-2 text-center">
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
                    </TableCell>
                    <TableCell className="align-top p-2 text-center">
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
                    </TableCell>
                    <TableCell className="align-top p-2 min-w-0 text-center">
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
                    </TableCell>
                  </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly ? (
            <Button type="button" onClick={() => void onSave(draft)} disabled={saving || draft.length === 0}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ) : null}
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
    </Dialog>
  )
}
