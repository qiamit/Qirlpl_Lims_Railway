import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { AllocationRow } from '../types'
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Pencil, SendHorizontal } from 'lucide-react'
import { limsTableClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  areSampleAllocationActionsLocked,
  getSectionCodesInTestAllocation,
  sampleAllocationEditLockedTitle,
} from './sampleAllocationEditLock'
import type { SampleAllocationSortKey } from './sortSampleAllocationRows'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '-')

function SortableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
  align = 'center',
}: {
  label: string
  columnKey: SampleAllocationSortKey
  sortKey: SampleAllocationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SampleAllocationSortKey) => void
  className?: string
  align?: 'left' | 'center'
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  const justify = align === 'left' ? 'justify-start' : 'justify-center'

  return (
    <TableHead className={cn('border border-stone-700', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex w-full items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 transition-colors hover:text-amber-100',
          justify,
        )}
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-amber-300' : 'text-amber-200/60'}`} />
      </button>
    </TableHead>
  )
}

const td = 'border border-[#e7e0d4] text-center'

export function SampleAllocationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onReferbackToReceiving,
  onSendToTestAllocation,
  sampleAllocationIdsWithTestAllocation,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: AllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleId: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: AllocationRow) => void
  onReferbackToReceiving: (row: AllocationRow) => void
  onSendToTestAllocation: (row: AllocationRow) => void
  sampleAllocationIdsWithTestAllocation?: Set<string>
  sortKey: SampleAllocationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SampleAllocationSortKey) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.sampleId))
  const someChecked = rows.some((r) => selectedIds.has(r.sampleId))

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 space-y-1 text-sm text-muted-foreground">
          <p>No SRFs pending for allocation.</p>
          <p className="text-xs">
            Received SRFs appear here; after section codes are saved they move to Allocated SRF.
          </p>
        </div>
      ) : (
        <Table className={cn(limsTableClass, 'min-w-[980px]')}>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="w-[44px] border border-stone-700 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  disabled
                  title="Select allocated SRFs from Allocated SRF"
                />
              </TableHead>
              <SortableHead
                label="SRF Number"
                columnKey="srfNumber"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="left"
              />
              <SortableHead
                label="Date"
                columnKey="date"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableHead
                label="IS Code"
                columnKey="isCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableHead
                label="Section Code"
                columnKey="sectionCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableHead
                label="Department"
                columnKey="department"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableHead
                label="Sample Quantity"
                columnKey="quantity"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <TableHead className="border border-stone-700 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const testAllocIds = sampleAllocationIdsWithTestAllocation ?? new Set<string>()
              const actionsLocked = areSampleAllocationActionsLocked(r, testAllocIds)
              const lockedSections = getSectionCodesInTestAllocation(r, testAllocIds)
              const lockTitle = sampleAllocationEditLockedTitle(lockedSections)

              return (
                <TableRow key={r.sampleId} className="odd:bg-[#f7f3eb]/80">
                  <TableCell className={td}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.sample.srf_number ?? r.sample.sample_code ?? r.sampleId}`}
                      checked={selectedIds.has(r.sampleId)}
                      onChange={() => onToggle(r.sampleId)}
                      disabled
                      title="Select allocated SRFs from Allocated SRF"
                    />
                  </TableCell>
                  <TableCell className={cn(td, 'text-left font-medium')}>{fmt(r.sample.srf_number)}</TableCell>
                  <TableCell className={cn(td, 'text-xs')}>
                    {fmtDate(r.sample.date_of_sample_receiving ?? r.sample.collection_date)}
                  </TableCell>
                  <TableCell className={td}>{fmt(r.sample.test_report_is_code_label)}</TableCell>
                  <TableCell className={td}>-</TableCell>
                  <TableCell className={cn(td, 'text-xs')}>-</TableCell>
                  <TableCell className={cn(td, 'text-xs')}>-</TableCell>
                  <TableCell className={td}>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Allocate section codes"
                        title={
                          actionsLocked
                            ? lockTitle
                            : 'Allocate section codes for this SRF'
                        }
                        disabled={actionsLocked}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Refer back to Sample Receiving"
                        title={
                          actionsLocked
                            ? lockTitle
                            : 'Refer back to Sample Receiving — removes from Sample Allocation and unlocks edit in Sample Receiving'
                        }
                        disabled={actionsLocked}
                        onClick={() => onReferbackToReceiving(r)}
                      >
                        <Inbox size={16} className="text-amber-700 dark:text-amber-500" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Send for Test Allocation"
                        title={
                          actionsLocked
                            ? lockTitle
                            : 'Allocate section codes before sending to Test Allocation'
                        }
                        disabled
                        onClick={() => onSendToTestAllocation(r)}
                      >
                        <SendHorizontal size={16} className="text-primary" />
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
