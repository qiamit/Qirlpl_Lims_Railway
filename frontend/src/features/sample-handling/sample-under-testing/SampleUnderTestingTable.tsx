import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { formatSampleDescAndDeclared } from '../shared/formatSampleDescAndDeclared'
import { countFilledResults, getSectionParametersForEntry } from './sectionParameterRows'
import { ClipboardList, Undo2, FileCheck } from 'lucide-react'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')

function isSectionResultsComplete(row: TestAllocationRow): boolean {
  if (row.resultsLocked) return true
  const entries = getSectionParametersForEntry(row)
  const { filled, total } = countFilledResults(entries)
  return total > 0 && filled === total
}

function partitionRowsByResultsStatus(rows: TestAllocationRow[]) {
  const pending: TestAllocationRow[] = []
  const completed: TestAllocationRow[] = []
  rows.forEach((row) => {
    if (isSectionResultsComplete(row)) completed.push(row)
    else pending.push(row)
  })
  return { pending, completed }
}

function SectionGroupHeader({
  title,
  count,
  variant,
}: {
  title: string
  count: number
  variant: 'pending' | 'completed'
}) {
  const styles =
    variant === 'pending'
      ? 'bg-amber-50/80 border-amber-200/80 text-amber-950'
      : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950'

  return (
    <TableRow className={`${styles} border-y-2 hover:bg-inherit`}>
      <TableCell colSpan={6} className="px-4 py-2.5">
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
      <TableCell colSpan={6} className="p-0 h-3 bg-muted/50 border-y-2 border-border" />
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
  onReferback,
  onSendForReview,
  emptyStateMessage,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleAllocationId: string) => void
  onToggleAll: (checked: boolean) => void
  onOpenResults: (row: TestAllocationRow) => void
  onReferback: (row: TestAllocationRow) => void
  onSendForReview: (row: TestAllocationRow) => void
  emptyStateMessage?: string
}) {
  const uniqueAllocationIds = [...new Set(rows.map((r) => r.sampleAllocationId))]
  const allChecked = uniqueAllocationIds.length > 0 && uniqueAllocationIds.every((id) => selectedIds.has(id))
  const someChecked = uniqueAllocationIds.some((id) => selectedIds.has(id))
  const { pending, completed } = useMemo(() => partitionRowsByResultsStatus(rows), [rows])

  const renderDataRow = (r: TestAllocationRow) => {
    const locked = Boolean(r.resultsLocked)
    const entries = getSectionParametersForEntry(r)
    const { filled, total } = countFilledResults(entries)
    const allFilled = total > 0 && filled === total

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
        <TableCell className="text-left truncate font-medium">{fmt(r.sectionCode)}</TableCell>
        <TableCell className="text-center text-xs truncate" title={r.isCodeLabel ?? undefined}>
          {fmt(r.isCodeLabel)}
        </TableCell>
        <TableCell className="text-center text-xs text-muted-foreground max-w-[320px] align-top">
          <p
            className="break-words whitespace-pre-wrap text-center"
            title={formatSampleDescAndDeclared(r.sampleDescription, r.declaredValue)}
          >
            {formatSampleDescAndDeclared(r.sampleDescription, r.declaredValue)}
          </p>
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
        <TableCell className="text-center">
          {locked ? (
            <div className="flex flex-col items-center gap-1">
              <Badge variant="secondary" className="text-[10px] font-normal">
                Under Review
              </Badge>
              {r.resultsReviewerName?.trim() ? (
                <span className="text-[10px] text-muted-foreground text-center line-clamp-2 max-w-[120px]">
                  {r.resultsReviewerName}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label="Referback section to Test Allocation"
                title="Referback — removes this section from Sample Under Testing"
                onClick={() => onReferback(r)}
              >
                <Undo2 size={14} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label="Send result for review"
                title="Send result for review"
                onClick={() => onSendForReview(r)}
              >
                <FileCheck size={14} />
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
    )
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
              <TableHead className="text-xs text-left w-[120px]">Section Code</TableHead>
              <TableHead className="text-xs text-center w-[140px]">IS Code</TableHead>
              <TableHead className="text-xs text-center min-w-[240px]">Sample Description &amp; Declared Value</TableHead>
              <TableHead className="text-xs text-center w-[180px]">Submitted Results</TableHead>
              <TableHead className="text-xs text-center w-[140px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length > 0 ? (
              <>
                <SectionGroupHeader title="Pending for Results" count={pending.length} variant="pending" />
                {pending.map(renderDataRow)}
              </>
            ) : null}
            {pending.length > 0 && completed.length > 0 ? <SectionGroupDivider /> : null}
            {completed.length > 0 ? (
              <>
                <SectionGroupHeader title="Completed" count={completed.length} variant="completed" />
                {completed.map(renderDataRow)}
              </>
            ) : null}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
