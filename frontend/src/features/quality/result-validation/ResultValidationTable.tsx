import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { checkTypeLabel, RESULT_VALIDITY_STATUS_LABELS } from './checkTypes'
import type { ResultValidityCheckRow } from './types'

const GRID_TABLE =
  'table-fixed min-w-[920px] w-full border-collapse border border-stone-500 font-jakarta'

const thClass =
  'border border-stone-700 bg-stone-800 !p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const tdClass = 'border border-[#e7e0d4] !p-2 align-middle text-[12px] text-[#292524]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const iconBtnClass =
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

function StatusBadge({ status }: { status: ResultValidityCheckRow['status'] }) {
  const className =
    status === 'satisfactory'
      ? 'border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]'
      : status === 'unsatisfactory'
        ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
        : status === 'in_progress'
          ? 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]'
          : 'border-[#d6d3d1] bg-[#f5f5f4] text-[#57534e]'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-none border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
        className,
      )}
    >
      {RESULT_VALIDITY_STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function ResultValidationTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
}: {
  rows: ResultValidityCheckRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ResultValidityCheckRow) => void
  onDelete: (row: ResultValidityCheckRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {searchActive ? 'No checks match your search.' : 'No internal quality checks recorded yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">Use &quot;New Check&quot; to create your first record.</p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[4%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={thClass}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select all"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className={thClass}>Ref</TableHead>
                <TableHead className={thClass}>Date</TableHead>
                <TableHead className={thClass}>Check Type</TableHead>
                <TableHead className={thClass}>Title / Summary</TableHead>
                <TableHead className={thClass}>SRF</TableHead>
                <TableHead className={thClass}>Status</TableHead>
                <TableHead className={thClass}>Performed By</TableHead>
                <TableHead className={thClass}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedIds.has(r.id)
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      selected ? rowSelectedClass : index % 2 === 0 ? rowEvenClass : rowOddClass,
                    )}
                  >
                    <TableCell className={cn(tdClass, 'text-center')}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${r.checkRef}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-center font-mono font-semibold text-[#1c1917]')}>
                      {r.checkRef}
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-center text-[#44403c]')}>
                      {formatDate(r.checkDate)}
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-left text-[12.5px] font-semibold')}>
                      {checkTypeLabel(r.checkType)}
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-left')}>
                      <p className="line-clamp-2 text-[12.5px] font-semibold text-[#1c1917]">{r.title}</p>
                      {r.testParameterName ? (
                        <p className="mt-0.5 text-[11px] text-[#78716c]">{r.testParameterName}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-center font-mono text-[#b45309]')}>
                      {r.srfNumber ?? '—'}
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-center')}>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-left text-[#44403c]')}>
                      {r.performedByName ?? '—'}
                    </TableCell>
                    <TableCell className={cn(tdClass, 'text-center')}>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={iconBtnClass}
                          aria-label={`Edit ${r.checkRef}`}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={iconBtnClass}
                          aria-label={`Delete ${r.checkRef}`}
                          onClick={() => onDelete(r)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
