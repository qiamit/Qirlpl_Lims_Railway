import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { Undo2, Eye } from 'lucide-react'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

type ExpandedUnderTestRow = {
  row: TestAllocationRow
  paramRowId: string | null
  testLabel: string
  testStartDate: string | null
  testEndDate: string | null
  results: string | null
}

function expandRowsByTest(rows: TestAllocationRow[]): ExpandedUnderTestRow[] {
  const out: ExpandedUnderTestRow[] = []
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

export function SampleUnderTestingTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onUpdateStartDate,
  onUpdateResults,
  onUpdateEndDate,
  onToggleReferback,
  onViewTestParameter,
  emptyStateMessage,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleAllocationId: string) => void
  onToggleAll: (checked: boolean) => void
  onUpdateStartDate: (row: TestAllocationRow, paramRowId: string | null, testLabel: string, value: string) => void
  onUpdateResults: (row: TestAllocationRow, paramRowId: string | null, testLabel: string, value: string) => void
  onUpdateEndDate: (row: TestAllocationRow, paramRowId: string | null, testLabel: string, value: string) => void
  onToggleReferback: (row: TestAllocationRow) => void
  onViewTestParameter: (row: TestAllocationRow, testLabel: string) => void
  /** When rows are empty, overrides the default technician-oriented hint */
  emptyStateMessage?: string
}) {
  const expanded = expandRowsByTest(rows)
  const uniqueAllocationIds = [...new Set(rows.map((r) => r.sampleAllocationId))]
  const allChecked = uniqueAllocationIds.length > 0 && uniqueAllocationIds.every((id) => selectedIds.has(id))
  const someChecked = uniqueAllocationIds.some((id) => selectedIds.has(id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {emptyStateMessage ??
            'No test allocations assigned to you in Test Allocation (Select Employee). Unassigned rows are not listed here.'}
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
              <TableHead className="text-xs text-center">Section Code</TableHead>
              <TableHead className="text-xs">Test Parameter</TableHead>
              <TableHead className="text-xs text-center">Test Start Date</TableHead>
              <TableHead className="text-xs text-center">Test End Date</TableHead>
              <TableHead className="text-xs text-center">Results</TableHead>
              <TableHead className="text-xs text-center">Referback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expanded.map(({ row: r, paramRowId, testLabel, testStartDate, testEndDate, results }, idx) => (
              <TableRow key={`${r.sampleAllocationId}-${idx}-${testLabel}`}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.sectionCode} ${testLabel}`}
                    checked={selectedIds.has(r.sampleAllocationId)}
                    onChange={() => onToggle(r.sampleAllocationId)}
                  />
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
                <TableCell className="p-2">
                  <Input
                    type="date"
                    className="h-8 text-xs text-center"
                    value={testStartDate ? new Date(testStartDate).toISOString().slice(0, 10) : ''}
                    onChange={(e) => onUpdateStartDate(r, paramRowId, testLabel, e.target.value)}
                    onDoubleClick={() => onUpdateStartDate(r, paramRowId, testLabel, new Date().toISOString().slice(0, 10))}
                    title="Single click: open picker. Double click: set today."
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input
                    type="date"
                    className="h-8 text-xs text-center"
                    value={testEndDate ? new Date(testEndDate).toISOString().slice(0, 10) : ''}
                    onChange={(e) => onUpdateEndDate(r, paramRowId, testLabel, e.target.value)}
                    onDoubleClick={() => onUpdateEndDate(r, paramRowId, testLabel, new Date().toISOString().slice(0, 10))}
                    title="Single click: open picker. Double click: set today."
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input
                    type="text"
                    className="h-8 text-xs w-full text-center"
                    placeholder="Results"
                    value={results ?? ''}
                    onChange={(e) => onUpdateResults(r, paramRowId, testLabel, e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center">
                    <Button
                      type="button"
                      size="icon"
                      variant={r.referbackFromAllocation ? 'secondary' : 'ghost'}
                      className="h-8 w-8 shrink-0"
                      aria-label={r.referbackFromAllocation ? 'Clear referback' : 'Referback'}
                      title={r.referbackFromAllocation ? 'Clear referback' : 'Referback'}
                      onClick={() => onToggleReferback(r)}
                    >
                      <Undo2 size={14} />
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
