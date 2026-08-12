import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { SampleRow } from '../types'
import {
  isSampleReceivingEditLocked,
  SAMPLE_RECEIVING_EDIT_LOCKED_TITLE,
} from './sampleReceivingEditLock'
import { getSampleWorkflowStatusLabel } from '../sampleWorkflowStatus'
import type { SampleReceivingSortKey } from './sortSampleReceivingRows'
import { formatDate } from '@/lib/utils'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => formatDate(v)

function SortableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  columnKey: SampleReceivingSortKey
  sortKey: SampleReceivingSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SampleReceivingSortKey) => void
  className?: string
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-1 text-xs font-medium hover:text-amber-100 transition-colors text-amber-200"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-amber-300' : 'text-amber-200/60'}`} />
      </button>
    </TableHead>
  )
}

export function SampleReceivingTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
  onViewDetails,
  sampleIdsInAllocation,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: SampleRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: SampleRow) => void
  onCopy: (row: SampleRow) => void
  onViewDetails: (row: SampleRow) => void
  sampleIdsInAllocation?: Set<string>
  sortKey: SampleReceivingSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SampleReceivingSortKey) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))
  const allocationSampleIds = sampleIdsInAllocation ?? new Set<string>()

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20 overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No samples in receiving. If you are looking for an SRF (e.g. QI/SRF/260305-01), it may have been moved to Sample Allocation or a later stage—check those modules. You can also clear the search box or go to another page.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 w-[36px] text-center">
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
              <SortableHead
                label="SRF Number & Date"
                columnKey="srfDate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs"
              />
              <SortableHead
                label="Name of the Customer"
                columnKey="clientName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <SortableHead
                label="Sample Codes"
                columnKey="sampleCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <SortableHead
                label="IS Code"
                columnKey="isCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Sample Details</TableHead>
              <SortableHead
                label="Date for Reporting"
                columnKey="reportingDate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <SortableHead
                label="Sample Status"
                columnKey="status"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const editLocked = isSampleReceivingEditLocked(r, allocationSampleIds)
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.srf_number ?? r.sample_code ?? r.id}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className="break-words">
                    <div className="font-medium">{fmt(r.srf_number)}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(r.date_of_sample_receiving)}</div>
                  </TableCell>
                  <TableCell className="text-center">{fmt(r.client_name)}</TableCell>
                  <TableCell className="text-center">
                    <div>{fmt(r.sample_code)}</div>
                    <div className="text-xs text-muted-foreground">{fmt(r.sample_qr_code)}</div>
                  </TableCell>
                  <TableCell className="text-center text-xs truncate" title={r.test_report_is_code_label ?? undefined}>
                    {fmt(r.test_report_is_code_label)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      aria-label={`View sample details for ${r.srf_number ?? r.sample_code ?? r.id}`}
                      title="View sample description, declaration, and customer specific information"
                      onClick={() => onViewDetails(r)}
                    >
                      <Eye size={14} />
                      View
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    <div>{fmtDate(r.tentative_date_required)}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(r.tentative_date_by_lab)}</div>
                  </TableCell>
                  <TableCell className="text-center">{fmt(getSampleWorkflowStatusLabel(r))}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Edit"
                        title={editLocked ? SAMPLE_RECEIVING_EDIT_LOCKED_TITLE : 'Edit sample receiving record'}
                        disabled={editLocked}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Copy" onClick={() => onCopy(r)}>
                        <Copy size={16} />
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
