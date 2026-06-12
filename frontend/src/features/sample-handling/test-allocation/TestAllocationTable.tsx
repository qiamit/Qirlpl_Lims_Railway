import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FlaskConical, Pencil, Undo2 } from 'lucide-react'
import {
  groupRowsBySrf,
  isPendingTestAllocationRow,
  isPendingTestingRow,
  type TestAllocationSortKey,
} from './sortTestAllocationRows'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

function partitionRows(rows: TestAllocationRow[]) {
  const pendingAllotment: TestAllocationRow[] = []
  const pendingTesting: TestAllocationRow[] = []
  const sent: TestAllocationRow[] = []
  rows.forEach((row) => {
    if (row.sentForTesting) sent.push(row)
    else if (isPendingTestAllocationRow(row)) pendingAllotment.push(row)
    else if (isPendingTestingRow(row)) pendingTesting.push(row)
  })
  return { pendingAllotment, pendingTesting, sent }
}

function SectionGroupHeader({
  title,
  count,
  variant,
  colSpan,
}: {
  title: string
  count: number
  variant: 'pendingAllotment' | 'pendingTesting' | 'sent'
  colSpan: number
}) {
  const styles =
    variant === 'pendingAllotment'
      ? 'bg-violet-50/80 border-violet-200/80 text-violet-950'
      : variant === 'pendingTesting'
        ? 'bg-amber-50/80 border-amber-200/80 text-amber-950'
        : 'bg-sky-50/80 border-sky-200/80 text-sky-950'

  return (
    <TableRow className={`${styles} border-y-2 hover:bg-inherit`}>
      <TableCell colSpan={colSpan} className="px-4 py-2.5">
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

function SrfGroupHeader({ srfNumber, sectionCount, colSpan }: { srfNumber: string; sectionCount: number; colSpan: number }) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="px-4 py-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">SRF: {srfNumber}</span>
          <span className="text-muted-foreground">
            {sectionCount} section{sectionCount === 1 ? '' : 's'}
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
  align = 'center',
}: {
  label: string
  columnKey: TestAllocationSortKey
  sortKey: TestAllocationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: TestAllocationSortKey) => void
  className?: string
  align?: 'left' | 'center' | 'right'
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  const justify = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center'

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={`inline-flex w-full items-center gap-1 text-xs font-medium hover:text-foreground transition-colors ${justify}`}
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  )
}

const COLUMN_COUNT = 6

export function TestAllocationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onAddTestParameter,
  onReferback,
  onSendForTesting,
  onViewParameters,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleAllocationId: string) => void
  onToggleAll: (checked: boolean) => void
  onAddTestParameter: (row: TestAllocationRow) => void
  onReferback: (row: TestAllocationRow) => void
  onSendForTesting: (row: TestAllocationRow) => void
  onViewParameters: (row: TestAllocationRow) => void
  sortKey: TestAllocationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: TestAllocationSortKey) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.sampleAllocationId))
  const someChecked = rows.some((r) => selectedIds.has(r.sampleAllocationId))
  const { pendingAllotment, pendingTesting, sent } = useMemo(() => partitionRows(rows), [rows])

  const renderDataRow = (r: TestAllocationRow) => {
    const pendingAllot = isPendingTestAllocationRow(r)
    const editLocked = Boolean(r.sentForTesting)
    const canReferback = !r.sentForTesting
    const canSend = !pendingAllot && !editLocked
    const hasParameters =
      (r.testParameterSummary ?? '').trim().length > 0 || (r.testParameterIds?.length ?? 0) > 0

    return (
      <TableRow key={r.sampleAllocationId}>
        <TableCell className="text-center">
          <input
            type="checkbox"
            aria-label={`Select ${r.sectionCode}`}
            checked={selectedIds.has(r.sampleAllocationId)}
            onChange={() => onToggle(r.sampleAllocationId)}
            disabled={pendingAllot}
          />
        </TableCell>
        <TableCell className="text-left pl-4">
          <div className="font-medium truncate">{fmt(r.sectionCode)}</div>
          <div className="text-xs text-muted-foreground truncate">{fmt(r.department)}</div>
        </TableCell>
        <TableCell className="text-center text-xs truncate" title={r.isCodeLabel ?? undefined}>
          {fmt(r.isCodeLabel)}
        </TableCell>
        <TableCell className="text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            aria-label={`View test parameters for ${r.sectionCode}`}
            title={
              hasParameters
                ? 'View allotted test parameters'
                : 'No test parameters allotted yet'
            }
            disabled={!hasParameters}
            onClick={() => onViewParameters(r)}
          >
            <Eye size={14} />
            View
          </Button>
        </TableCell>
        <TableCell className="text-center truncate">{fmt(r.assignedEmployeeName)}</TableCell>
        <TableCell className="text-right pr-4">
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={pendingAllot ? 'Allot tests' : 'Edit test parameters'}
              title={
                editLocked
                  ? 'Edit locked — section already sent for testing'
                  : pendingAllot
                    ? 'Allot tests — assign parameters and employee'
                    : 'Edit test parameters'
              }
              disabled={editLocked}
              onClick={() => onAddTestParameter(r)}
            >
              <Pencil size={16} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Send for testing"
              title={
                editLocked
                  ? 'Already sent for testing'
                  : pendingAllot
                    ? 'Allot tests before sending for testing'
                    : 'Send for testing — moves section to Sample Under Testing'
              }
              disabled={!canSend}
              onClick={() => onSendForTesting(r)}
            >
              <FlaskConical size={16} className="text-primary" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Refer back to Sample Allocation"
              title="Refer back to Sample Allocation — removes test parameters; section stays in allocation"
              disabled={!canReferback}
              onClick={() => onReferback(r)}
            >
              <Undo2 size={16} />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  const renderGroupedSection = (sectionRows: TestAllocationRow[]) => {
    const groups = groupRowsBySrf(sectionRows)
    return groups.flatMap((group) => {
      const srfLabel = group[0]?.srfNumber?.trim() || group[0]?.sectionCode || 'SRF'
      const showSrfHeader = groups.length > 1 || group.length > 1
      const items = []
      if (showSrfHeader) {
        items.push(
          <SrfGroupHeader
            key={`srf-${group[0]?.sampleId}-${srfLabel}`}
            srfNumber={srfLabel}
            sectionCount={group.length}
            colSpan={COLUMN_COUNT}
          />,
        )
      }
      group.forEach((row) => items.push(renderDataRow(row)))
      return items
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No test allocation entries yet. Sections from Sample Allocation appear under Pending for Test Allocation.
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
              <SortableHead
                label="Section Code & Department"
                columnKey="srfSection"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs"
                align="left"
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
                label="Test Parameters"
                columnKey="testParameters"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <SortableHead
                label="Employee Name"
                columnKey="employeeName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="text-xs text-center"
              />
              <TableHead className="text-xs text-right pr-4">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingAllotment.length > 0 ? (
              <>
                <SectionGroupHeader
                  title="Pending for Test Allocation"
                  count={pendingAllotment.length}
                  variant="pendingAllotment"
                  colSpan={COLUMN_COUNT}
                />
                {renderGroupedSection(pendingAllotment)}
              </>
            ) : null}
            {pendingAllotment.length > 0 && pendingTesting.length > 0 ? (
              <SectionGroupDivider colSpan={COLUMN_COUNT} />
            ) : null}
            {pendingTesting.length > 0 ? (
              <>
                <SectionGroupHeader
                  title="Pending for Testing"
                  count={pendingTesting.length}
                  variant="pendingTesting"
                  colSpan={COLUMN_COUNT}
                />
                {renderGroupedSection(pendingTesting)}
              </>
            ) : null}
            {(pendingAllotment.length > 0 || pendingTesting.length > 0) && sent.length > 0 ? (
              <SectionGroupDivider colSpan={COLUMN_COUNT} />
            ) : null}
            {sent.length > 0 ? (
              <>
                <SectionGroupHeader
                  title="Sent for Testing"
                  count={sent.length}
                  variant="sent"
                  colSpan={COLUMN_COUNT}
                />
                {renderGroupedSection(sent)}
              </>
            ) : null}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
