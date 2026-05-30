import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { AllocationRow } from '../types'
import { Pencil, Undo2 } from 'lucide-react'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '-')
const joinList = (arr: string[]) => arr.filter(Boolean).join(', ') || '-'

export function SampleAllocationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onReferback,
  sampleIdsWithTestAllocation,
}: {
  rows: AllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleId: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: AllocationRow) => void
  onReferback: (row: AllocationRow) => void
  sampleIdsWithTestAllocation?: Set<string>
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.sampleId))
  const someChecked = rows.some((r) => selectedIds.has(r.sampleId))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No sample allocations yet.</p>
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
              <TableHead className="text-xs text-center">SRF Number &amp; Date</TableHead>
              <TableHead className="text-xs text-center">IS Code</TableHead>
              <TableHead className="text-xs text-center">Section Code</TableHead>
              <TableHead className="text-xs text-center">Department</TableHead>
              <TableHead className="text-xs text-center">Sample Quantity</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sampleId}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.sample.srf_number ?? r.sample.sample_code ?? r.sampleId}`}
                    checked={selectedIds.has(r.sampleId)}
                    onChange={() => onToggle(r.sampleId)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <div className="font-medium truncate">{fmt(r.sample.srf_number)}</div>
                  <div className="text-xs text-muted-foreground truncate">{fmtDate(r.sample.date_of_sample_receiving ?? r.sample.collection_date)}</div>
                </TableCell>
                <TableCell className="text-center truncate">{fmt(r.sample.test_report_is_code_label)}</TableCell>
                <TableCell className="text-center truncate">{joinList(r.sectionCodes)}</TableCell>
                <TableCell className="text-center text-xs truncate">{joinList(r.departments)}</TableCell>
                <TableCell className="text-center truncate">{joinList(r.quantities)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit"
                      title={
                        sampleIdsWithTestAllocation?.has(r.sampleId) && !r.sample.referback_from_allocation
                          ? 'Edit locked: this SRF is in Test Allocation. Use Referback in Test Allocation to unlock.'
                          : 'Edit allocation'
                      }
                      disabled={Boolean(
                        sampleIdsWithTestAllocation?.has(r.sampleId) && !r.sample.referback_from_allocation,
                      )}
                      onClick={() => onEdit(r)}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Referback" onClick={() => onReferback(r)}>
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
