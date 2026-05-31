import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { Eye, CheckCircle2, Undo2 } from 'lucide-react'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '-')

type ExpandedReviewRow = {
  row: TestAllocationRow
  paramRowId: string | null
  testLabel: string
  specificRequirement: string | null
  testStartDate: string | null
  testEndDate: string | null
  results: string | null
  showSectionActions: boolean
}

function expandRowsByTest(rows: TestAllocationRow[]): ExpandedReviewRow[] {
  const out: ExpandedReviewRow[] = []
  for (const row of rows) {
    if (row.parameters && row.parameters.length > 0) {
      row.parameters.forEach((p, paramIdx) => {
        out.push({
          row,
          paramRowId: p.id,
          testLabel: p.testLabel,
          specificRequirement: p.specificRequirement ?? null,
          testStartDate: p.testStartDate ?? null,
          testEndDate: p.testEndDate ?? null,
          results: p.results ?? null,
          showSectionActions: paramIdx === 0,
        })
      })
      continue
    }
    const summary = row.testParameterSummary?.trim() ?? ''
    const labels = summary ? summary.split(',').map((s) => s.trim()).filter(Boolean) : []
    if (labels.length === 0) {
      out.push({
        row,
        paramRowId: null,
        testLabel: '-',
        specificRequirement: null,
        testStartDate: row.testStartDate ?? null,
        testEndDate: row.testEndDate ?? null,
        results: row.results ?? null,
        showSectionActions: true,
      })
    } else {
      labels.forEach((label, paramIdx) => {
        out.push({
          row,
          paramRowId: null,
          testLabel: label,
          specificRequirement: null,
          testStartDate: row.testStartDate ?? null,
          testEndDate: row.testEndDate ?? null,
          results: row.results ?? null,
          showSectionActions: paramIdx === 0,
        })
      })
    }
  }
  return out
}

export function ResultsUnderReviewTable({
  rows,
  loading,
  error,
  onReferback,
  onApproved,
  onViewTestParameter,
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
  onViewTestParameter: (row: TestAllocationRow, testLabel: string) => void
  showSelection?: boolean
  selectedIds?: Set<string>
  onToggleSelection?: (sampleAllocationId: string) => void
  onToggleAllSelection?: (checked: boolean) => void
}) {
  const expanded = expandRowsByTest(rows)
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
        <Table className="min-w-[1050px]">
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
              ) : (
                <TableHead className="text-xs w-[44px] text-center">#</TableHead>
              )}
              <TableHead className="text-xs text-center">Section Code</TableHead>
              <TableHead className="text-xs">Test Parameter</TableHead>
              <TableHead className="text-xs text-center">Specified Requirement</TableHead>
              <TableHead className="text-xs text-center">Test Start Date</TableHead>
              <TableHead className="text-xs text-center">Test End Date</TableHead>
              <TableHead className="text-xs text-center">Results</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expanded.map(({ row: r, testLabel, specificRequirement, testStartDate, testEndDate, results, showSectionActions }, idx) => (
              <TableRow key={`${r.sampleAllocationId}-${idx}-${testLabel}`}>
                <TableCell className="text-center text-muted-foreground text-xs">
                  {showSelection && showSectionActions ? (
                    <input
                      type="checkbox"
                      aria-label={`Select section ${r.sectionCode}`}
                      checked={selectedIds?.has(r.sampleAllocationId) ?? false}
                      onChange={() => onToggleSelection?.(r.sampleAllocationId)}
                    />
                  ) : (
                    idx + 1
                  )}
                </TableCell>
                <TableCell className="text-center truncate font-medium">{fmt(r.sectionCode)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-start gap-1">
                    <span className="truncate text-xs" title={testLabel}>{fmt(testLabel)}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      aria-label="View test parameter data"
                      title="View data from Test Parameter directory"
                      onClick={() => onViewTestParameter(r, testLabel)}
                    >
                      <Eye size={14} />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-center text-xs">
                  <span className="line-clamp-2 mx-auto max-w-[200px]" title={specificRequirement ?? undefined}>
                    {fmt(specificRequirement)}
                  </span>
                </TableCell>
                <TableCell className="text-center text-xs">{fmtDate(testStartDate)}</TableCell>
                <TableCell className="text-center text-xs">{fmtDate(testEndDate)}</TableCell>
                <TableCell className="text-center text-xs truncate" title={results ?? ''}>
                  {fmt(results)}
                </TableCell>
                <TableCell>
                  {showSectionActions ? (
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
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
