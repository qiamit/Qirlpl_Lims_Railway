import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { Eye, FileCheck } from 'lucide-react'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '-')

type ExpandedReviewRow = {
  row: TestAllocationRow
  paramRowId: string | null
  testLabel: string
  testStartDate: string | null
  testEndDate: string | null
  results: string | null
}

function expandRowsByTest(rows: TestAllocationRow[]): ExpandedReviewRow[] {
  const out: ExpandedReviewRow[] = []
  for (const row of rows) {
    if (row.parameters && row.parameters.length > 0) {
      for (const p of row.parameters) {
        out.push({
          row,
          paramRowId: p.id,
          testLabel: p.testLabel,
          testStartDate: p.testStartDate ?? null,
          testEndDate: p.testEndDate ?? null,
          results: p.results ?? null,
        })
      }
      continue
    }
    const summary = row.testParameterSummary?.trim() ?? ''
    const labels = summary ? summary.split(',').map((s) => s.trim()).filter(Boolean) : []
    if (labels.length === 0) {
      out.push({
        row,
        paramRowId: null,
        testLabel: '-',
        testStartDate: row.testStartDate ?? null,
        testEndDate: row.testEndDate ?? null,
        results: row.results ?? null,
      })
    } else {
      for (const label of labels) {
        out.push({
          row,
          paramRowId: null,
          testLabel: label,
          testStartDate: row.testStartDate ?? null,
          testEndDate: row.testEndDate ?? null,
          results: row.results ?? null,
        })
      }
    }
  }
  return out
}

export function ResultsUnderReviewTable({
  rows,
  loading,
  error,
  onApproveForTestReport,
  onViewTestParameter,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  onApproveForTestReport: (row: TestAllocationRow) => void
  onViewTestParameter: (row: TestAllocationRow, testLabel: string) => void
}) {
  const expanded = expandRowsByTest(rows)

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No results sent for your review. Results appear here when testing personnel send them for review and select you as the reviewer.
        </p>
      ) : (
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs w-[44px] text-center">#</TableHead>
              <TableHead className="text-xs text-center">Section Code</TableHead>
              <TableHead className="text-xs">Test Parameter</TableHead>
              <TableHead className="text-xs text-center">Test Start Date</TableHead>
              <TableHead className="text-xs text-center">Test End Date</TableHead>
              <TableHead className="text-xs text-center">Results</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expanded.map(({ row: r, testLabel, testStartDate, testEndDate, results }, idx) => (
              <TableRow key={`${r.sampleAllocationId}-${idx}-${testLabel}`}>
                <TableCell className="text-center text-muted-foreground text-xs">
                  {idx + 1}
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
                <TableCell className="text-center text-xs">{fmtDate(testStartDate)}</TableCell>
                <TableCell className="text-center text-xs">{fmtDate(testEndDate)}</TableCell>
                <TableCell className="text-center text-xs truncate" title={results ?? ''}>
                  {fmt(results)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 shrink-0"
                      aria-label="Approve for test report"
                      title="Send SRF to test report preparation (ISO 17025 Clause 7.8)"
                      onClick={() => onApproveForTestReport(r)}
                    >
                      <FileCheck size={14} className="mr-1" />
                      Approve for report
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
