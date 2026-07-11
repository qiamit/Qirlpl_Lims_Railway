import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatDate } from '@/lib/utils'
import { frequencySelectOptions } from './iqcPlanFrequency'
import { IQC_PLAN_STATUS_LABELS } from './iqcPlanStatus'
import type { IqcPlanRow, IqcPlanStatus } from './types'

const GRID_TABLE =
  'table-auto w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const GRID_HEAD =
  'text-xs font-semibold text-foreground bg-muted/60 border-border whitespace-nowrap px-2 py-1.5 text-center'
const GRID_CELL = 'text-xs border-border px-2 py-1.5 align-middle text-center'

function StatusBadge({ status }: { status: IqcPlanStatus }) {
  const className =
    status === 'on_track'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'due_soon'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : status === 'overdue'
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : status === 'inactive'
            ? 'bg-slate-100 text-slate-500 border-slate-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'

  return (
    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap', className)}>
      {IQC_PLAN_STATUS_LABELS[status]}
    </span>
  )
}

function displayDate(value: string | null): string {
  if (!value?.trim()) return '—'
  return formatDate(value) || '—'
}

export function IqcPlanTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
  onFrequencyChange,
  frequencyUpdatingId,
}: {
  rows: IqcPlanRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: IqcPlanRow) => void
  onDelete: (row: IqcPlanRow) => void
  onFrequencyChange: (row: IqcPlanRow, frequency: string) => void
  frequencyUpdatingId?: string | null
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-card overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          No IQC plan items yet. Click &quot;Add Plan Item&quot; to create the schedule.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="hover:bg-muted/60">
                <TableHead className={cn(GRID_HEAD, 'w-10 p-2')}>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    aria-label="Select all"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className={cn(GRID_HEAD, 'min-w-[180px]')}>Name / Type of Check</TableHead>
                <TableHead className={cn(GRID_HEAD, 'min-w-[120px]')}>Frequency</TableHead>
                <TableHead className={cn(GRID_HEAD, 'min-w-[160px]')}>Acceptance Criteria</TableHead>
                <TableHead className={cn(GRID_HEAD, 'min-w-[100px]')}>Last Done</TableHead>
                <TableHead className={cn(GRID_HEAD, 'min-w-[100px]')}>Next Due</TableHead>
                <TableHead className={cn(GRID_HEAD, 'min-w-[100px]')}>Status</TableHead>
                <TableHead className={cn(GRID_HEAD, 'w-20 p-1')} aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/20">
                  <TableCell className={cn(GRID_CELL, 'p-2')}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      aria-label={`Select ${row.checkName}`}
                      checked={selectedIds.has(row.id)}
                      onChange={() => onToggle(row.id)}
                    />
                  </TableCell>
                  <TableCell className={cn(GRID_CELL, 'font-medium text-left')}>{row.checkName}</TableCell>
                  <TableCell className={cn(GRID_CELL, 'p-1')}>
                    <Select
                      value={row.frequency}
                      onValueChange={(value) => onFrequencyChange(row, value)}
                      disabled={frequencyUpdatingId === row.id}
                    >
                      <SelectTrigger
                        className="h-8 text-xs mx-auto min-w-[130px]"
                        aria-label={`Frequency for ${row.checkName}`}
                      >
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {frequencySelectOptions(row.frequency).map((option) => (
                          <SelectItem key={option} value={option} className="text-xs">
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className={cn(GRID_CELL, 'whitespace-pre-wrap text-center')}>
                    {row.acceptanceCriteria || '—'}
                  </TableCell>
                  <TableCell className={GRID_CELL}>{displayDate(row.lastDone)}</TableCell>
                  <TableCell className={GRID_CELL}>{displayDate(row.nextDue)}</TableCell>
                  <TableCell className={GRID_CELL}>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className={cn(GRID_CELL, 'p-1')}>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Edit ${row.checkName}`}
                        onClick={() => onEdit(row)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label={`Delete ${row.checkName}`}
                        onClick={() => onDelete(row)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
