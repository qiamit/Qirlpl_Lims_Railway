import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'

import { Button } from '@/components/ui/button'

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'

import type { TestAllocationRow } from '../types'

import { groupRowsBySrf } from '../test-allocation/sortTestAllocationRows'

import { countFilledResults, getSectionParametersForEntry } from '../sample-under-testing/sectionParameterRows'

import {
  isResultsReviewPendingRow,
  partitionResultsUnderReviewRows,
  srfHasPendingReviewSections,
} from './resultsUnderReviewPartitions'

import { ClipboardList, CheckCircle2, Eye, Undo2 } from 'lucide-react'



const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')



function SrfGroupHeader({
  srfNumber,
  totalSections,
  pendingSections,
  colSpan,
}: {
  srfNumber: string
  totalSections: number
  pendingSections: number
  colSpan: number
}) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="px-4 py-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">SRF: {srfNumber}</span>
          <div className="flex flex-wrap items-center justify-end gap-1.5 text-muted-foreground">
            <span>
              {totalSections} section{totalSections === 1 ? '' : 's'}
            </span>
            {pendingSections > 0 ? (
              <Badge variant="warning" className="h-5 px-1.5 text-[10px] font-medium">
                {pendingSections} pending
              </Badge>
            ) : null}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}



function SectionGroupHeader({

  title,

  count,

  variant,

  colSpan,

}: {

  title: string

  count: number

  variant: 'pending' | 'reviewed'

  colSpan: number

}) {

  const styles =

    variant === 'pending'

      ? 'bg-amber-50/80 border-amber-200/80 text-amber-950'

      : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950'



  return (

    <TableRow className={`${styles} border-y-2 hover:bg-inherit`}>

      <TableCell colSpan={colSpan} className="px-4 py-2.5">

        <div className="flex items-center justify-between gap-2">

          <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>

          <span className="text-[11px] font-medium opacity-80">

            {count} section{count === 1 ? '' : 's'}

          </span>

        </div>

      </TableCell>

    </TableRow>

  )

}



function SectionGroupDivider({ colSpan }: { colSpan: number }) {

  return (

    <TableRow className="hover:bg-transparent pointer-events-none">

      <TableCell colSpan={colSpan} className="p-0 h-3 bg-muted/50 border-y-2 border-border" />

    </TableRow>

  )

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

  emptyStateMessage?: string

}) {

  const columnCount = showSelection ? 7 : 6

  const uniqueAllocIds = [...new Set(rows.map((r) => r.sampleAllocationId))]

  const allChecked =

    showSelection &&

    uniqueAllocIds.length > 0 &&

    uniqueAllocIds.every((id) => selectedIds?.has(id))

  const someChecked = showSelection && uniqueAllocIds.some((id) => selectedIds?.has(id))



  const { pending, reviewed } = useMemo(() => partitionResultsUnderReviewRows(rows), [rows])

  const srfStatsBySampleId = useMemo(() => {
    const map = new Map<string, { total: number; pending: number }>()
    for (const r of rows) {
      const id = r.sampleId?.trim()
      if (!id) continue
      if (!map.has(id)) map.set(id, { total: 0, pending: 0 })
      const stat = map.get(id)!
      stat.total += 1
      if (isResultsReviewPendingRow(r)) stat.pending += 1
    }
    return map
  }, [rows])



  const renderDataRow = (r: TestAllocationRow) => {

    const entries = getSectionParametersForEntry(r)

    const { filled, total } = countFilledResults(entries)

    const allFilled = total > 0 && filled === total

    const reviewPending = isResultsReviewPendingRow(r)
    const srfPending = srfHasPendingReviewSections(rows, r.sampleId)

    return (

      <TableRow key={r.sampleAllocationId}>

        {showSelection ? (

          <TableCell className="text-center">

            <input

              type="checkbox"

              aria-label={`Select section ${r.sectionCode}`}

              checked={selectedIds?.has(r.sampleAllocationId) ?? false}

              onChange={() => onToggleSelection?.(r.sampleAllocationId)}

            />

          </TableCell>

        ) : null}

        <TableCell className="text-left pl-4">

          <div className="font-medium truncate">{fmt(r.sectionCode)}</div>

          <div className="text-xs text-muted-foreground truncate">{fmt(r.department)}</div>

        </TableCell>

        <TableCell className="text-center text-xs truncate" title={r.isCodeLabel ?? undefined}>

          {fmt(r.isCodeLabel)}

        </TableCell>

        <TableCell className="text-center">

          <Button

            type="button"

            variant="outline"

            size="sm"

            className="h-8 gap-1.5"

            aria-label={`View sample description for section ${r.sectionCode}`}

            title="View sample description and declared value"

            onClick={() => onViewSampleDetails(r)}

          >

            <Eye size={14} />

            View

          </Button>

        </TableCell>

        <TableCell className="text-center">

          <div className="flex flex-col items-center gap-1">

            <Button

              type="button"

              size="sm"

              variant="secondary"

              className="h-8 gap-1.5 text-xs"

              onClick={() => onOpenReviewResults(r)}

            >

              <ClipboardList size={14} />

              Review Results

            </Button>

            <span className="text-[11px] text-muted-foreground">

              {filled}/{total} result{total === 1 ? '' : 's'}

              {allFilled ? ' · complete' : ''}

            </span>

          </div>

        </TableCell>

        <TableCell className="text-right pr-4">

          {reviewPending ? (
            <div className="inline-flex flex-col items-stretch gap-1.5 min-w-[148px]">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 justify-center gap-1.5 text-xs font-medium shadow-sm"
                aria-label={`Approve results for section ${fmt(r.sectionCode)}`}
                title="Approve — proceed to test report preparation when all sections are reviewed (Clause 7.8)"
                onClick={() => onApproved(r)}
              >
                <CheckCircle2 size={14} className="shrink-0" />
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 justify-center gap-1.5 text-xs font-medium border-amber-200/90 bg-amber-50/50 text-amber-950 hover:bg-amber-50 hover:text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100 dark:hover:bg-amber-950/40"
                aria-label={`Refer back section ${fmt(r.sectionCode)} to Sample Under Testing`}
                title="Refer back — assign testing engineer and return section to Sample Under Testing"
                onClick={() => onReferback(r)}
              >
                <Undo2 size={14} className="shrink-0" />
                Refer Back
              </Button>
            </div>
          ) : (

            <div className="flex flex-col items-end gap-1">
              <Badge variant="secondary" className="text-[10px] font-normal">
                Reviewed
              </Badge>
              {srfPending ? (
                <span className="text-[10px] font-medium text-amber-700">SRF pending review</span>
              ) : r.sampleStage === 'report_preparation' ? (
                <span className="text-[10px] text-muted-foreground">Report prep</span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Awaiting all sections</span>
              )}
            </div>

          )}

        </TableCell>

      </TableRow>

    )

  }



  const renderSectionRows = (sectionRows: TestAllocationRow[]) => {

    if (!groupBySrf) return sectionRows.map(renderDataRow)



    return groupRowsBySrf(sectionRows).flatMap((group) => {
      const srfLabel = group[0]?.srfNumber?.trim() || group[0]?.sectionCode || '—'
      const sampleId = group[0]?.sampleId?.trim() ?? ''
      const srfStats = srfStatsBySampleId.get(sampleId)
      const groupKey = `srf-${sampleId}-${srfLabel}`

      return [
        <SrfGroupHeader
          key={groupKey}
          srfNumber={srfLabel}
          totalSections={srfStats?.total ?? group.length}
          pendingSections={srfStats?.pending ?? 0}
          colSpan={columnCount}
        />,
        ...group.map(renderDataRow),
      ]
    })

  }



  const hasAnyRows = pending.length > 0 || reviewed.length > 0



  return (

    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">

      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}

      {loading ? (

        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>

      ) : !hasAnyRows ? (

        <p className="px-4 py-6 text-sm text-muted-foreground">

          {emptyStateMessage ??

            'No results assigned to your review queue. Items appear here when testing sends results for review, when you refer back from Test Report Preparation, or when another user selects you as reviewer (same mobile / linked lab login).'}

        </p>

      ) : (

        <Table className="min-w-[900px]">

          <TableHeader>

            <TableRow className="bg-muted/50">

              {showSelection ? (

                <TableHead className="text-xs w-[44px] text-center">

                  <input

                    type="checkbox"

                    aria-label="Select all sections"

                    checked={allChecked}

                    ref={(el) => {

                      if (el) el.indeterminate = !allChecked && !!someChecked

                    }}

                    onChange={(e) => onToggleAllSelection?.(e.target.checked)}

                  />

                </TableHead>

              ) : null}

              <TableHead className="text-xs text-left w-[140px]">Section Code</TableHead>

              <TableHead className="text-xs text-center w-[140px]">IS Code</TableHead>

              <TableHead className="text-xs text-center w-[120px]">Sample Details</TableHead>

              <TableHead className="text-xs text-center w-[180px]">Review the Result</TableHead>

              <TableHead className="text-xs text-right pr-3 w-[200px]">Action</TableHead>

            </TableRow>

          </TableHeader>

          <TableBody>

            {pending.length > 0 ? (

              <>

                <SectionGroupHeader

                  title="Pending for Review"

                  count={pending.length}

                  variant="pending"

                  colSpan={columnCount}

                />

                {renderSectionRows(pending)}

              </>

            ) : null}

            {pending.length > 0 && reviewed.length > 0 ? (

              <SectionGroupDivider colSpan={columnCount} />

            ) : null}

            {reviewed.length > 0 ? (

              <>

                <SectionGroupHeader

                  title="Results Reviewed"

                  count={reviewed.length}

                  variant="reviewed"

                  colSpan={columnCount}

                />

                {renderSectionRows(reviewed)}

              </>

            ) : null}

          </TableBody>

        </Table>

      )}

    </div>

  )

}


