import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { countFilledResults, getSectionParametersForEntry } from './sectionParameterRows'
import { ClipboardList, Undo2, FileCheck } from 'lucide-react'
import { isSectionSubmittedForReview } from './underTestingSectionStatus'
import {
  limsPanelClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** checkbox + SRF + Section + Department + IS Code + Results + Action */
const COLUMN_COUNT = 7

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')

const thClass = cn(limsTableHeadClass, 'border border-stone-700 !p-2')
const tdClass = 'border border-[#e7e0d4] !p-2 align-middle text-xs text-[#292524]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const actionBtnClass =
  'h-8 w-8 rounded-none border border-amber-700/50 bg-[#fde68a]/70 text-[#78350f] shadow-none hover:bg-amber-700 hover:text-white hover:border-amber-800'
const sectionLinkClass =
  'max-w-full truncate text-center text-[12.5px] font-semibold tracking-tight text-amber-800 underline-offset-2 hover:text-amber-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

/** Red (0%) → green (100%) for Enter Results progress. */
function resultsProgressButtonStyle(filled: number, total: number): {
  backgroundColor: string
  borderColor: string
  color: string
} {
  const ratio = total <= 0 ? 0 : Math.min(1, Math.max(0, filled / total))
  const r = Math.round(185 + (22 - 185) * ratio)
  const g = Math.round(28 + (163 - 28) * ratio)
  const b = Math.round(28 + (74 - 28) * ratio)
  const bg = `rgb(${r}, ${g}, ${b})`
  return { backgroundColor: bg, borderColor: bg, color: '#ffffff' }
}

function sortRowsBySrf(rows: TestAllocationRow[]): TestAllocationRow[] {
  return [...rows].sort((a, b) => {
    const srf = (a.srfNumber ?? '').localeCompare(b.srfNumber ?? '', undefined, { sensitivity: 'base' })
    if (srf !== 0) return srf
    return (a.sectionCode ?? '').localeCompare(b.sectionCode ?? '', undefined, { sensitivity: 'base' })
  })
}

export function SampleUnderTestingTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onOpenResults,
  onViewSampleDetails,
  onReferback,
  onSendForReview,
  emptyStateMessage,
  groupBySrf = false,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleAllocationId: string) => void
  onToggleAll: (checked: boolean) => void
  onOpenResults: (row: TestAllocationRow) => void
  onViewSampleDetails: (row: TestAllocationRow) => void
  onReferback: (row: TestAllocationRow) => void
  onSendForReview: (row: TestAllocationRow) => void
  emptyStateMessage?: string
  /** Laboratory Director view — sort sections by SRF. */
  groupBySrf?: boolean
}) {
  /** Main table: pending results only — submitted rows live under header button dialog. */
  const pendingRows = useMemo(() => {
    const pending = rows.filter((r) => !isSectionSubmittedForReview(r))
    return groupBySrf ? sortRowsBySrf(pending) : pending
  }, [rows, groupBySrf])

  const uniqueAllocationIds = [...new Set(pendingRows.map((r) => r.sampleAllocationId))]
  const allChecked =
    uniqueAllocationIds.length > 0 && uniqueAllocationIds.every((id) => selectedIds.has(id))
  const someChecked = uniqueAllocationIds.some((id) => selectedIds.has(id))

  return (
    <div className={cn(limsPanelClass, 'overflow-hidden bg-[#f7f3eb]')}>
      {error ? <p className="px-4 pt-4 text-sm text-red-700 sm:px-5">{error}</p> : null}
      {loading ? (
        <p className="px-4 py-6 text-sm text-[#78716c] sm:px-5">Loading…</p>
      ) : pendingRows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {emptyStateMessage ??
              'No sections pending results. Use Submitted for Review in the header to view sent sections.'}
          </p>
        </div>
      ) : (
        <Table className={cn(limsTableClass, 'min-w-[980px]')}>
          <TableHeader>
            <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
              <TableHead className={cn(thClass, 'w-[44px] text-center')}>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className={cn(thClass, 'w-[150px] text-left')}>SRF Number</TableHead>
              <TableHead className={cn(thClass, 'w-[140px]')}>Section Code</TableHead>
              <TableHead className={cn(thClass, 'w-[120px]')}>Department</TableHead>
              <TableHead className={cn(thClass, 'w-[140px]')}>IS Code</TableHead>
              <TableHead className={cn(thClass, 'w-[160px]')}>Results</TableHead>
              <TableHead className={cn(thClass, 'w-[110px]')}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingRows.map((r, index) => {
              const entries = getSectionParametersForEntry(r)
              const { filled, total } = countFilledResults(entries)
              const allFilled = total > 0 && filled === total
              const sectionLabel = fmt(r.sectionCode)

              return (
                <TableRow
                  key={r.sampleAllocationId}
                  className={index % 2 === 0 ? rowEvenClass : rowOddClass}
                >
                  <TableCell className={cn(tdClass, 'text-center')}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select section ${r.sectionCode}`}
                      checked={selectedIds.has(r.sampleAllocationId)}
                      onChange={() => onToggle(r.sampleAllocationId)}
                    />
                  </TableCell>
                  <TableCell className={cn(tdClass, 'pl-3 text-left font-medium')}>
                    {fmt(r.srfNumber)}
                  </TableCell>
                  <TableCell className={cn(tdClass, 'text-center')}>
                    <div className="flex justify-center">
                      <button
                        type="button"
                        className={sectionLinkClass}
                        aria-label={`View sample details for section ${sectionLabel}`}
                        title="View sample description and declared value"
                        onClick={() => onViewSampleDetails(r)}
                      >
                        {sectionLabel}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className={cn(tdClass, 'text-center')}>{fmt(r.department)}</TableCell>
                  <TableCell
                    className={cn(tdClass, 'text-center text-xs')}
                    title={r.isCodeLabel ?? undefined}
                  >
                    {fmt(r.isCodeLabel)}
                  </TableCell>
                  <TableCell className={cn(tdClass, 'text-center')}>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-none border text-xs text-white shadow-none hover:opacity-90 hover:text-white"
                        style={resultsProgressButtonStyle(filled, total)}
                        aria-label={`Enter results — ${filled} of ${total} filled`}
                        title={
                          allFilled
                            ? 'All results filled'
                            : filled === 0
                              ? 'No results entered yet'
                              : `${filled}/${total} results filled`
                        }
                        onClick={() => onOpenResults(r)}
                      >
                        <ClipboardList size={14} />
                        Enter Results
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className={cn(tdClass, 'text-center')}>
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={actionBtnClass}
                        aria-label={`Send results for review — section ${sectionLabel}`}
                        title="Send for Review"
                        onClick={() => onSendForReview(r)}
                      >
                        <FileCheck size={17} strokeWidth={2.35} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={actionBtnClass}
                        aria-label={`Refer back section ${sectionLabel} to Test Allocation`}
                        title="Refer Back"
                        onClick={() => onReferback(r)}
                      >
                        <Undo2 size={17} strokeWidth={2.35} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
