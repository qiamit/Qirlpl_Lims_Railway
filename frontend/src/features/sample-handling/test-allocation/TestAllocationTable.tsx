import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { TestAllocationRow } from '../types'
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FlaskConical, Pencil, Undo2 } from 'lucide-react'
import { limsTableClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { isPendingTestAllocationRow, type TestAllocationSortKey } from './sortTestAllocationRows'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

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
        className={`inline-flex w-full items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 transition-colors hover:text-amber-100 ${justify}`}
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-amber-300' : 'text-amber-200/60'}`} />
      </button>
    </TableHead>
  )
}

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

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No pending test allocation entries. Sent sections are under SRF Sent for Testing.
        </p>
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
                />
              </TableHead>
              <SortableHead
                label="SRF Number"
                columnKey="srfNumber"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="left"
                className="border border-stone-700"
              />
              <SortableHead
                label="Section Code"
                columnKey="sectionCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="border border-stone-700"
              />
              <SortableHead
                label="Department"
                columnKey="department"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="border border-stone-700"
              />
              <SortableHead
                label="IS Code"
                columnKey="isCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="border border-stone-700"
              />
              <SortableHead
                label="Test Parameter"
                columnKey="testParameters"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="border border-stone-700"
              />
              <SortableHead
                label="Employee Name"
                columnKey="employeeName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="border border-stone-700"
              />
              <TableHead className="border border-stone-700 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const pendingAllot = isPendingTestAllocationRow(r)
              const editLocked = Boolean(r.sentForTesting)
              const canReferback = !r.sentForTesting
              const canSend = !pendingAllot && !editLocked
              const hasParameters =
                (r.testParameterSummary ?? '').trim().length > 0 || (r.testParameterIds?.length ?? 0) > 0
              const paramSummary = (r.testParameterSummary ?? '').trim()

              return (
                <TableRow key={r.sampleAllocationId} className="odd:bg-[#f7f3eb]/80">
                  <TableCell className="border border-[#e7e0d4] text-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.sectionCode}`}
                      checked={selectedIds.has(r.sampleAllocationId)}
                      onChange={() => onToggle(r.sampleAllocationId)}
                      disabled={pendingAllot}
                    />
                  </TableCell>
                  <TableCell className="border border-[#e7e0d4] text-left font-medium">{fmt(r.srfNumber)}</TableCell>
                  <TableCell className="border border-[#e7e0d4] text-center">{fmt(r.sectionCode)}</TableCell>
                  <TableCell className="border border-[#e7e0d4] text-center">{fmt(r.department)}</TableCell>
                  <TableCell className="border border-[#e7e0d4] text-center text-xs" title={r.isCodeLabel ?? undefined}>
                    {fmt(r.isCodeLabel)}
                  </TableCell>
                  <TableCell className="border border-[#e7e0d4] text-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 min-w-[5.5rem] gap-1.5 rounded-none px-3"
                      aria-label={`View test parameters for ${r.sectionCode}`}
                      title={
                        hasParameters
                          ? paramSummary || 'View allotted test parameters'
                          : 'View test parameters (none allotted yet)'
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewParameters(r)
                      }}
                    >
                      <Eye size={14} />
                      View
                    </Button>
                  </TableCell>
                  <TableCell className="border border-[#e7e0d4] text-center truncate">{fmt(r.assignedEmployeeName)}</TableCell>
                  <TableCell className="border border-[#e7e0d4] text-center">
                    <div className="flex items-center justify-center gap-1">
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
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
