import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatDateTimeDisplay } from '../shared'
import { complaintStatusTone, type ComplaintRow } from './types'

const GRID_TABLE =
  'table-fixed min-w-[1100px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'
const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const primaryLineClass = 'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'
const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'
const metaLineClass = 'break-words font-mono text-[11px] font-medium text-[#b45309]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const actionBtnClass =
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

export function ComplaintsTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: ComplaintRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ComplaintRow) => void
  onCopy: (row: ComplaintRow) => void
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
            {searchActive ? 'No complaints match your search.' : 'No complaints recorded yet.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn('w-10', thBase)}>
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
                <TableHead className={thBase}>Complaint</TableHead>
                <TableHead className={thBase}>Complainant</TableHead>
                <TableHead className={thBase}>Description</TableHead>
                <TableHead className={thBase}>Validation</TableHead>
                <TableHead className={thBase}>Status</TableHead>
                <TableHead className={cn('w-24', thBase)}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedIds.has(r.id)
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      selected
                        ? rowSelectedClass
                        : index % 2 === 0
                          ? rowEvenClass
                          : rowOddClass,
                    )}
                  >
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                        aria-label={`Select ${r.complaint_id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <p className={metaLineClass}>{r.complaint_id}</p>
                      <p className={secondaryLineClass}>{formatDateTimeDisplay(r.received_at)}</p>
                    </TableCell>
                    <TableCell>
                      <p className={primaryLineClass}>{r.complainant_name || '—'}</p>
                      <p className={secondaryLineClass}>{r.complainant_org || '—'}</p>
                    </TableCell>
                    <TableCell>
                      <p className={primaryLineClass}>{r.description || '—'}</p>
                      <p className={secondaryLineClass}>{r.related_activity || '—'}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <p className={primaryLineClass}>
                        {r.validated ? 'Validated' : 'Pending'}
                      </p>
                      <p className={secondaryLineClass}>
                        {r.relates_to_lab ? 'Lab related' : 'Not lab related'}
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'inline-block border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          complaintStatusTone(r.status),
                        )}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Edit ${r.complaint_id}`}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Copy ${r.complaint_id}`}
                          onClick={() => onCopy(r)}
                        >
                          <Copy size={16} />
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
