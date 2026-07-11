import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { groupRowsBySrf } from '../test-allocation/sortTestAllocationRows'
import { countFilledResults, getSectionParametersForEntry } from './sectionParameterRows'
import { ClipboardList, Eye, Undo2, FileCheck } from 'lucide-react'
import { isActiveReviewerName } from '../results-under-review/resultsUnderReviewPartitions'
import {
  getUnderTestingSubmittedStatus,
  isSectionApprovedForDisplay,
  UNDER_TESTING_SUBMITTED_STATUS_LABEL,
} from './underTestingSectionStatus'

const COLUMN_COUNT = 6

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')

function isSectionSubmittedForReview(row: TestAllocationRow): boolean {
  if (row.referredBackFromReview) return false
  const stage = String(row.sampleStage ?? '')
    .trim()
    .toLowerCase()
  // Issued / completed work must never sit in Pending for Results
  if (stage === 'completed') return true
  if (stage === 'report_preparation' && (row.resultsLocked || row.sectionReviewApproved)) return true
  return Boolean(row.resultsLocked)
}

function partitionRowsByResultsStatus(rows: TestAllocationRow[]) {
  const pending: TestAllocationRow[] = []
  const submittedForReview: TestAllocationRow[] = []
  rows.forEach((row) => {
    if (isSectionSubmittedForReview(row)) submittedForReview.push(row)
    else pending.push(row)
  })
  return { pending, submittedForReview }
}

function SrfGroupHeader({
  srfNumber,
  totalSections,
  pendingSections,
}: {
  srfNumber: string
  totalSections: number
  pendingSections: number
}) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={COLUMN_COUNT} className="px-4 py-1.5">
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
}: {
  title: string
  count: number
  variant: 'pending' | 'submitted'
}) {
  const styles =
    variant === 'pending'
      ? 'bg-amber-50/80 border-amber-200/80 text-amber-950'
      : 'bg-sky-50/80 border-sky-200/80 text-sky-950'

  return (
    <TableRow className={`${styles} border-y-2 hover:bg-inherit`}>
      <TableCell colSpan={COLUMN_COUNT} className="px-4 py-2.5">
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

function SectionGroupDivider() {
  return (
    <TableRow className="hover:bg-transparent pointer-events-none">
      <TableCell colSpan={COLUMN_COUNT} className="p-0 h-3 bg-muted/50 border-y-2 border-border" />
    </TableRow>
  )
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
  /** Laboratory Director view — group section rows under SRF headers. */
  groupBySrf?: boolean
}) {
  const uniqueAllocationIds = [...new Set(rows.map((r) => r.sampleAllocationId))]
  const allChecked = uniqueAllocationIds.length > 0 && uniqueAllocationIds.every((id) => selectedIds.has(id))
  const someChecked = uniqueAllocationIds.some((id) => selectedIds.has(id))
  const { pending, submittedForReview } = useMemo(() => partitionRowsByResultsStatus(rows), [rows])

  const srfStatsBySampleId = useMemo(() => {
    const map = new Map<string, { total: number; pending: number }>()
    for (const r of rows) {
      const id = r.sampleId?.trim()
      if (!id) continue
      if (!map.has(id)) map.set(id, { total: 0, pending: 0 })
      const stat = map.get(id)!
      stat.total += 1
      if (!isSectionSubmittedForReview(r)) stat.pending += 1
    }
    return map
  }, [rows])

  const renderDataRow = (r: TestAllocationRow) => {
    const locked = Boolean(r.resultsLocked)
    const approved = isSectionApprovedForDisplay(r)
    const submittedStatus = locked ? getUnderTestingSubmittedStatus(r) : null
    const submittedStatusLabel = submittedStatus
      ? UNDER_TESTING_SUBMITTED_STATUS_LABEL[submittedStatus]
      : null
    const entries = getSectionParametersForEntry(r)
    const { filled, total } = countFilledResults(entries)
    const allFilled = total > 0 && filled === total

    const badgeLabel =
      submittedStatus === 'test_report_issued'
        ? 'Issued'
        : approved
          ? 'Approved'
          : 'Under Review'

    return (
      <TableRow key={r.sampleAllocationId}>
        <TableCell className="text-center">
          <input
            type="checkbox"
            aria-label={`Select section ${r.sectionCode}`}
            checked={selectedIds.has(r.sampleAllocationId)}
            onChange={() => onToggle(r.sampleAllocationId)}
          />
        </TableCell>
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
              variant={locked ? 'outline' : 'secondary'}
              className="h-8 gap-1.5 text-xs"
              onClick={() => onOpenResults(r)}
            >
              <ClipboardList size={14} />
              {locked ? 'View Results' : 'Enter Results'}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {filled}/{total} result{total === 1 ? '' : 's'}
              {allFilled ? ' · complete' : ''}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-right pr-4">
          {locked ? (
            <div className="inline-flex flex-col items-end gap-1 min-w-[148px]">
              <Badge variant="secondary" className="text-[10px] font-medium">
                {badgeLabel}
              </Badge>
              <span className="text-[10px] text-muted-foreground text-right line-clamp-2 max-w-[160px]">
                {submittedStatusLabel}
              </span>
              {!approved && isActiveReviewerName(r.resultsReviewerName) ? (
                <span className="text-[10px] text-muted-foreground text-right line-clamp-2 max-w-[160px]">
                  {r.resultsReviewerName}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="inline-flex items-center justify-end gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={`Send results for review — section ${fmt(r.sectionCode)}`}
                title="Send for Review"
                onClick={() => onSendForReview(r)}
              >
                <FileCheck size={16} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={`Refer back section ${fmt(r.sectionCode)} to Test Allocation`}
                title="Refer Back"
                onClick={() => onReferback(r)}
              >
                <Undo2 size={16} className="text-amber-700 dark:text-amber-500" />
              </Button>
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
        />,
        ...group.map(renderDataRow),
      ]
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {emptyStateMessage ??
            'No section codes or test parameters assigned to you in Test Allocation (Select Employee).'}
        </p>
      ) : (
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs w-[44px] text-center">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className="text-xs text-left w-[140px]">Section Code</TableHead>
              <TableHead className="text-xs text-center w-[140px]">IS Code</TableHead>
              <TableHead className="text-xs text-center w-[120px]">Sample Details</TableHead>
              <TableHead className="text-xs text-center w-[180px]">Submitted Results</TableHead>
              <TableHead className="text-xs text-right pr-4 w-[90px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SectionGroupHeader title="Pending for Results" count={pending.length} variant="pending" />
            {pending.length > 0 ? (
              renderSectionRows(pending)
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="px-4 py-3 text-center text-xs text-muted-foreground">
                  No sections pending results entry
                </TableCell>
              </TableRow>
            )}
            <SectionGroupDivider />
            <SectionGroupHeader
              title="Submitted for Review"
              count={submittedForReview.length}
              variant="submitted"
            />
            {submittedForReview.length > 0 ? (
              renderSectionRows(submittedForReview)
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="px-4 py-3 text-center text-xs text-muted-foreground">
                  No sections submitted for review yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
