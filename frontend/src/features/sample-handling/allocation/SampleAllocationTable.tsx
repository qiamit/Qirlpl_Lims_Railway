import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { AllocationRow } from '../types'
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Pencil, SendHorizontal } from 'lucide-react'
import {
  areSampleAllocationActionsLocked,
  getSectionCodesInTestAllocation,
  sampleAllocationEditLockedTitle,
} from './sampleAllocationEditLock'
import type { SampleAllocationSortKey } from './sortSampleAllocationRows'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '-')
const joinList = (arr: string[]) => arr.filter(Boolean).join(', ') || '-'

function isPendingAllocationRow(row: AllocationRow): boolean {
  return row.allocationIds.length === 0
}

function partitionRowsByAllocationStatus(rows: AllocationRow[]) {
  const allocated: AllocationRow[] = []
  const pending: AllocationRow[] = []
  rows.forEach((row) => {
    if (isPendingAllocationRow(row)) pending.push(row)
    else allocated.push(row)
  })
  return { allocated, pending }
}

function SectionGroupHeader({
  title,
  count,
  variant,
  colSpan,
}: {
  title: string
  count: number
  variant: 'allocated' | 'pending'
  colSpan: number
}) {
  const styles =
    variant === 'allocated'
      ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950'
      : 'bg-amber-50/80 border-amber-200/80 text-amber-950'

  return (
    <TableRow className={`${styles} border-y-2 hover:bg-inherit`}>
      <TableCell colSpan={colSpan} className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
          <span className="text-[11px] font-medium opacity-80">
            {count} SRF{count === 1 ? '' : 's'}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}

function SectionGroupDivider({ colSpan }: { colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent pointer-events-none">
      <TableCell colSpan={colSpan} className="p-0 h-3 bg-muted/50 border-y-2 border-border" />
    </TableRow>
  )
}

function SortableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  columnKey: SampleAllocationSortKey
  sortKey: SampleAllocationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SampleAllocationSortKey) => void
  className?: string
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-1 text-xs font-medium hover:text-foreground transition-colors"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  )
}

const COLUMN_COUNT = 7

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
  const { allocated, pending } = useMemo(() => partitionRowsByAllocationStatus(rows), [rows])

  const renderDataRow = (r: AllocationRow) => {
    const isPending = isPendingAllocationRow(r)
    const testAllocIds = sampleAllocationIdsWithTestAllocation ?? new Set<string>()
    const actionsLocked = areSampleAllocationActionsLocked(r, testAllocIds)
    const lockedSections = getSectionCodesInTestAllocation(r, testAllocIds)
    const lockTitle = sampleAllocationEditLockedTitle(lockedSections)

    return (
      <TableRow key={r.sampleId}>
        <TableCell className="text-center">
          <input
            type="checkbox"
            aria-label={`Select ${r.sample.srf_number ?? r.sample.sample_code ?? r.sampleId}`}
            checked={selectedIds.has(r.sampleId)}
            onChange={() => onToggle(r.sampleId)}
            disabled={isPending}
          />
        </TableCell>
        <TableCell className="text-center">
          <div className="font-medium truncate">{fmt(r.sample.srf_number)}</div>
          <div className="text-xs text-muted-foreground truncate">
            {fmtDate(r.sample.date_of_sample_receiving ?? r.sample.collection_date)}
          </div>
        </TableCell>
        <TableCell className="text-center truncate">{fmt(r.sample.test_report_is_code_label)}</TableCell>
        <TableCell className="text-center truncate">{isPending ? '-' : joinList(r.sectionCodes)}</TableCell>
        <TableCell className="text-center text-xs truncate">
          {isPending ? '-' : joinList(r.departments)}
        </TableCell>
        <TableCell className="text-center truncate">{isPending ? '-' : joinList(r.quantities)}</TableCell>
        <TableCell>
          <div className="flex items-center justify-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={isPending ? 'Allocate section codes' : 'Edit allocation'}
              title={
                actionsLocked
                  ? lockTitle
                  : isPending
                    ? 'Allocate section codes for this SRF'
                    : 'Edit section codes and departments'
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
                  : isPending
                    ? 'Allocate section codes before sending to Test Allocation'
                    : 'Send for Test Allocation — SRF appears in Test Allocation for parameter assignment'
              }
              disabled={actionsLocked || isPending}
              onClick={() => onSendToTestAllocation(r)}
            >
              <SendHorizontal size={16} className="text-primary" />
            </Button>
          </div>
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
        <div className="px-4 py-6 space-y-1 text-sm text-muted-foreground">
          <p>No SRFs in Pending for Allocation or Allocated SRF.</p>
          <p className="text-xs">Received SRFs appear under Pending; after section codes are saved they move to Allocated.</p>
        </div>
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
              <SortableHead
                label="SRF Number & Date"
                columnKey="srfDate"
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
              <SortableHead
                label="Section Code"
                columnKey="sectionCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <SortableHead
                label="Department"
                columnKey="department"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <SortableHead
                label="Sample Quantity"
                columnKey="quantity"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length > 0 ? (
              <>
                <SectionGroupHeader
                  title="Pending for Allocation"
                  count={pending.length}
                  variant="pending"
                  colSpan={COLUMN_COUNT}
                />
                {pending.map(renderDataRow)}
              </>
            ) : null}
            {pending.length > 0 && allocated.length > 0 ? (
              <SectionGroupDivider colSpan={COLUMN_COUNT} />
            ) : null}
            {allocated.length > 0 ? (
              <>
                <SectionGroupHeader
                  title="Allocated SRF"
                  count={allocated.length}
                  variant="allocated"
                  colSpan={COLUMN_COUNT}
                />
                {allocated.map(renderDataRow)}
              </>
            ) : null}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
