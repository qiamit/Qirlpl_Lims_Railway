import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatDate } from '@/lib/utils'
import { checkTypeLabel, RESULT_VALIDITY_STATUS_LABELS } from './checkTypes'
import type { ResultValidityCheckRow } from './types'

const compactCol = 'w-0 whitespace-nowrap'

function StatusBadge({ status }: { status: ResultValidityCheckRow['status'] }) {
  const className =
    status === 'satisfactory'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'unsatisfactory'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : status === 'in_progress'
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap', className)}>
      {RESULT_VALIDITY_STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function ResultValidationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
}: {
  rows: ResultValidityCheckRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ResultValidityCheckRow) => void
  onDelete: (row: ResultValidityCheckRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-card overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No internal quality checks recorded yet. Use &quot;New Check&quot; to perform ISO 17025 Clause 7.7 monitoring.
        </p>
      ) : (
        <div className="overflow-x-auto [&>div]:overflow-visible">
          <Table className="w-full table-auto">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className={cn(compactCol, 'px-1 text-center text-xs')}>
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
                <TableHead className={cn(compactCol, 'text-xs')}>Ref</TableHead>
                <TableHead className={cn(compactCol, 'text-xs')}>Date</TableHead>
                <TableHead className="text-left text-xs">Check Type</TableHead>
                <TableHead className="text-left text-xs">Title / Summary</TableHead>
                <TableHead className={cn(compactCol, 'text-xs')}>SRF</TableHead>
                <TableHead className={cn(compactCol, 'text-xs text-center')}>Status</TableHead>
                <TableHead className={cn(compactCol, 'text-xs')}>Performed By</TableHead>
                <TableHead className={cn(compactCol, 'text-xs text-center')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={cn(compactCol, 'align-middle px-1 text-center')}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      aria-label={`Select ${r.checkRef}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-xs font-mono')}>{r.checkRef}</TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-xs text-muted-foreground')}>
                    {formatDate(r.checkDate)}
                  </TableCell>
                  <TableCell className="align-middle text-left text-xs">
                    <div className="font-medium">{checkTypeLabel(r.checkType)}</div>
                  </TableCell>
                  <TableCell className="align-middle text-left text-xs">
                    <div className="line-clamp-2 font-medium">{r.title}</div>
                    {r.testParameterName ? (
                      <div className="text-[11px] text-muted-foreground mt-0.5">{r.testParameterName}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-xs')}>{r.srfNumber ?? '—'}</TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-center')}>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-xs text-muted-foreground')}>
                    {r.performedByName ?? '—'}
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-center px-1')}>
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => onEdit(r)}>
                        <Pencil size={12} />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        aria-label={`Delete ${r.checkRef}`}
                        onClick={() => onDelete(r)}
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
