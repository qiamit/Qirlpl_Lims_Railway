import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { Pencil, Undo2 } from 'lucide-react'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

export function TestAllocationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onAddTestParameter,
  onToggleReferback,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleAllocationId: string) => void
  onToggleAll: (checked: boolean) => void
  onAddTestParameter: (row: TestAllocationRow) => void
  onToggleReferback: (row: TestAllocationRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.sampleAllocationId))
  const someChecked = rows.some((r) => selectedIds.has(r.sampleAllocationId))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No test allocation entries yet. Use &quot;Add Test Parameter&quot; to fill and save; entries will appear here after save.</p>
      ) : (
        <Table>
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
              <TableHead className="text-xs text-center">Test Parameters</TableHead>
              <TableHead className="text-xs text-center">Employee Name</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sampleAllocationId}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.sectionCode}`}
                    checked={selectedIds.has(r.sampleAllocationId)}
                    onChange={() => onToggle(r.sampleAllocationId)}
                  />
                </TableCell>
                <TableCell className="text-center truncate font-medium">{fmt(r.sectionCode)}</TableCell>
                <TableCell className="text-center text-xs truncate">
                  {r.testParameterSummary ? (
                    <span title={r.testParameterSummary}>{fmt(r.testParameterSummary)}</span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-center truncate">{fmt(r.assignedEmployeeName)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit Test Parameter"
                      title={
                        r.referbackFromAllocation
                          ? 'Edit test parameters'
                          : 'Only sections referred back from Sample Allocation can be edited'
                      }
                      disabled={!r.referbackFromAllocation}
                      onClick={() => r.referbackFromAllocation && onAddTestParameter(r)}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant={r.referbackFromAllocation ? 'secondary' : 'ghost'}
                      aria-label={r.referbackFromAllocation ? 'Clear referback' : 'Referback'}
                      title={
                        r.referbackFromAllocation
                          ? 'Clear referback and lock Sample Allocation edit'
                          : 'Mark as referred back to unlock Sample Allocation edit'
                      }
                      onClick={() => onToggleReferback(r)}
                    >
                      <Undo2 size={16} />
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
