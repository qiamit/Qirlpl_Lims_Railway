import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { countFilledResults, getSectionParametersForEntry } from '../sample-under-testing/sectionParameterRows'
import {
  isResultsReviewPendingRow,
  partitionResultsUnderReviewRows,
  srfHasPendingReviewSections,
} from './resultsUnderReviewPartitions'
import { ClipboardList, CheckCircle2, Undo2 } from 'lucide-react'
import {
  limsPanelClass,
  limsPrimaryBtnClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')

const thClass = cn(limsTableHeadClass, 'border border-stone-700 !p-2')
const tdClass = 'border border-[#e7e0d4] !p-2 align-middle text-xs text-[#292524]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const sectionLinkClass =
  'max-w-full truncate text-center text-[12.5px] font-semibold tracking-tight text-amber-800 underline-offset-2 hover:text-amber-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const actionBtnClass =
  'h-8 w-8 rounded-none border border-amber-700/50 bg-[#fde68a]/70 text-[#78350f] shadow-none hover:bg-amber-700 hover:text-white hover:border-amber-800'

function sortRowsBySrf(rows: TestAllocationRow[]): TestAllocationRow[] {
  return [...rows].sort((a, b) => {
    const srf = (a.srfNumber ?? '').localeCompare(b.srfNumber ?? '', undefined, {
      sensitivity: 'base',
      numeric: true,
    })
    if (srf !== 0) return srf
    return (a.sectionCode ?? '').localeCompare(b.sectionCode ?? '', undefined, {
      sensitivity: 'base',
    })
  })
}

export function ResultsUnderReviewTable({
  rows,
  loading,
  error,
  onReferback,
  onApproved,
  onOpenReviewResults,
  onViewSampleDetails,
  showSelection,
  selectedIds,
  onToggleSelection,
  onToggleAllSelection,
  groupBySrf = false,
  /** Full pending list (all pages) — used so Approve stays gated by other SRF sections. */
  reviewScopeRows,
  emptyStateMessage,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  onReferback: (row: TestAllocationRow) => void
  onApproved: (row: TestAllocationRow) => void
  onOpenReviewResults: (row: TestAllocationRow) => void
  onViewSampleDetails: (row: TestAllocationRow) => void
  showSelection?: boolean
  selectedIds?: Set<string>
  onToggleSelection?: (sampleAllocationId: string) => void
  onToggleAllSelection?: (checked: boolean) => void
  groupBySrf?: boolean
  reviewScopeRows?: TestAllocationRow[]
  emptyStateMessage?: string
}) {
  /** Main list shows only pending review sections; reviewed SRFs live in Results Reviewed dialog. */
  const pending = useMemo(() => {
    const { pending: list } = partitionResultsUnderReviewRows(rows)
    return groupBySrf ? sortRowsBySrf(list) : list
  }, [rows, groupBySrf])

  const uniqueAllocIds = [...new Set(pending.map((r) => r.sampleAllocationId))]
  const allChecked =
    Boolean(showSelection) &&
    uniqueAllocIds.length > 0 &&
    uniqueAllocIds.every((id) => selectedIds?.has(id))
  const someChecked = Boolean(showSelection) && uniqueAllocIds.some((id) => selectedIds?.has(id))

  return (
    <div className={cn(limsPanelClass, 'overflow-hidden bg-[#f7f3eb]')}>
      {error ? <p className="px-4 pt-4 text-sm text-red-700 sm:px-5">{error}</p> : null}

      {loading ? (
        <p className="px-4 py-6 text-sm text-[#78716c] sm:px-5">Loading…</p>
      ) : pending.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {emptyStateMessage ??
              'No results assigned to your review queue. Items appear here when testing sends results for review.'}
          </p>
        </div>
      ) : (
        <Table className={cn(limsTableClass, 'min-w-[980px]')}>
          <TableHeader>
            <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
              {showSelection ? (
                <TableHead className={cn(thClass, 'w-[44px] text-center')}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select all sections"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAllSelection?.(e.target.checked)}
                  />
                </TableHead>
              ) : null}
              <TableHead className={cn(thClass, 'w-[150px] text-left')}>SRF Number</TableHead>
              <TableHead className={cn(thClass, 'w-[140px]')}>Section Code</TableHead>
              <TableHead className={cn(thClass, 'w-[120px]')}>Department</TableHead>
              <TableHead className={cn(thClass, 'w-[140px]')}>IS Code</TableHead>
              <TableHead className={cn(thClass, 'w-[160px]')}>Review Results</TableHead>
              <TableHead className={cn(thClass, 'w-[120px]')}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((r, index) => {
              const entries = getSectionParametersForEntry(r)
              const { filled, total } = countFilledResults(entries)
              const allFilled = total > 0 && filled === total
              const reviewPending = isResultsReviewPendingRow(r)
              const srfPending = srfHasPendingReviewSections(reviewScopeRows ?? rows, r.sampleId)
              const sectionLabel = fmt(r.sectionCode)

              return (
                <TableRow
                  key={r.sampleAllocationId}
                  className={index % 2 === 0 ? rowEvenClass : rowOddClass}
                >
                  {showSelection ? (
                    <TableCell className={cn(tdClass, 'text-center')}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select section ${r.sectionCode}`}
                        checked={selectedIds?.has(r.sampleAllocationId) ?? false}
                        onChange={() => onToggleSelection?.(r.sampleAllocationId)}
                      />
                    </TableCell>
                  ) : null}

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
                    <Button
                      type="button"
                      size="sm"
                      className={cn(limsPrimaryBtnClass, 'h-8 gap-1.5 text-xs')}
                      aria-label={`Review results for section ${sectionLabel}`}
                      title={
                        allFilled
                          ? 'All results filled — open review'
                          : `${filled}/${total} results filled`
                      }
                      onClick={() => onOpenReviewResults(r)}
                    >
                      <ClipboardList size={14} />
                      Review Results
                    </Button>
                  </TableCell>

                  <TableCell className={cn(tdClass, 'text-center')}>
                    {reviewPending ? (
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={actionBtnClass}
                          aria-label={`Approve results for section ${sectionLabel}`}
                          title="Approve — proceed to test report preparation when all sections are reviewed"
                          onClick={() => onApproved(r)}
                        >
                          <CheckCircle2 size={17} strokeWidth={2.35} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={actionBtnClass}
                          aria-label={`Refer back section ${sectionLabel} to Sample Under Testing`}
                          title="Refer Back"
                          onClick={() => onReferback(r)}
                        >
                          <Undo2 size={17} strokeWidth={2.35} />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Badge
                          variant="secondary"
                          className="rounded-none border border-stone-500 bg-stone-100 text-[10px] font-normal text-stone-800"
                        >
                          Reviewed
                        </Badge>
                        {srfPending ? (
                          <span className="text-[10px] font-medium text-amber-800">SRF pending</span>
                        ) : r.sampleStage === 'report_preparation' ? (
                          <span className="text-[10px] text-[#78716c]">Report prep</span>
                        ) : (
                          <span className="text-[10px] text-[#78716c]">Awaiting sections</span>
                        )}
                      </div>
                    )}
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
