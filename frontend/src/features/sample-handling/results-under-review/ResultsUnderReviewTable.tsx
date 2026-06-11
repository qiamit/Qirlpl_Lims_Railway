import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { formatSampleDescAndDeclared } from '../shared/formatSampleDescAndDeclared'
import { countFilledResults, getSectionParametersForEntry } from '../sample-under-testing/sectionParameterRows'
import { ClipboardList, CheckCircle2, Undo2 } from 'lucide-react'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')

export function ResultsUnderReviewTable({
  rows,
  loading,
  error,
  onReferback,
  onApproved,
  onOpenReviewResults,
  showSelection,
  selectedIds,
  onToggleSelection,
  onToggleAllSelection,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  onReferback: (row: TestAllocationRow) => void
  onApproved: (row: TestAllocationRow) => void
  onOpenReviewResults: (row: TestAllocationRow) => void
  showSelection?: boolean
  selectedIds?: Set<string>
  onToggleSelection?: (sampleAllocationId: string) => void
  onToggleAllSelection?: (checked: boolean) => void
}) {
  const uniqueAllocIds = [...new Set(rows.map((r) => r.sampleAllocationId))]
  const allChecked =
    showSelection &&
    uniqueAllocIds.length > 0 &&
    uniqueAllocIds.every((id) => selectedIds?.has(id))
  const someChecked = showSelection && uniqueAllocIds.some((id) => selectedIds?.has(id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No results assigned to your review queue. Items appear here when testing sends results for review, when you refer back from Test Report Preparation, or when another user selects you as reviewer (same mobile / linked lab login).
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
              <TableHead className="text-xs text-left w-[120px]">Section Code</TableHead>
              <TableHead className="text-xs text-center w-[140px]">IS Code</TableHead>
              <TableHead className="text-xs text-center min-w-[240px]">Sample Description &amp; Declared Value</TableHead>
              <TableHead className="text-xs text-center w-[180px]">Review the Result</TableHead>
              <TableHead className="text-xs text-center w-[140px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const entries = getSectionParametersForEntry(r)
              const { filled, total } = countFilledResults(entries)
              const allFilled = total > 0 && filled === total

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
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        aria-label="Refer back to Sample Under Testing"
                        title="Refer back — assign testing engineer and return section to Sample Under Testing"
                        onClick={() => onReferback(r)}
                      >
                        <Undo2 size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        aria-label="Approve results for test report"
                        title="Approved — proceed to test report preparation (Clause 7.8)"
                        onClick={() => onApproved(r)}
                      >
                        <CheckCircle2 size={14} className="text-primary" />
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
