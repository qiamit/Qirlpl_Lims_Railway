import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatDateDisplay, formatDateTimeDisplay, sourceLabel, statusTone, type BreakdownRegisterRow } from './types'

const GRID_TABLE =
  'table-fixed min-w-[1100px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const primaryLineClass =
  'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'

const metaLineClass =
  'break-words font-mono text-[11px] font-medium tracking-normal text-[#b45309]'

const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const actionBtnClass =
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

export function EquipmentBreakdownTable({
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
  rows: BreakdownRegisterRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: BreakdownRegisterRow) => void
  onCopy: (row: BreakdownRegisterRow) => void
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
            {searchActive
              ? 'No breakdown records match your search.'
              : 'No equipment breakdown records yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">
              Use &quot;Add Breakdown&quot; to register the first incident.
            </p>
          ) : null}
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
                <TableHead className={thBase}>Breakdown ID</TableHead>
                <TableHead className={thBase}>Equipment</TableHead>
                <TableHead className={thBase}>Breakdown</TableHead>
                <TableHead className={thBase}>Nature</TableHead>
                <TableHead className={thBase}>Status</TableHead>
                <TableHead className={thBase}>Return / Auth</TableHead>
                <TableHead className={cn('w-20', thBase)}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedIds.has(r.id)
                const even = index % 2 === 0
                return (
                  <TableRow
                    key={r.id}
                    data-state={selected ? 'selected' : undefined}
                    className={cn(
                      'group border-b border-[#e7e0d4] transition-colors',
                      selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass,
                    )}
                  >
                    <TableCell className="align-middle text-center">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${r.register_no}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={metaLineClass}>{r.register_no}</p>
                      <p className={secondaryLineClass}>{sourceLabel(r.equipment_source)}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={primaryLineClass}>{r.equipment_name || '—'}</p>
                      <p className={metaLineClass}>{r.asset_code || '—'}</p>
                      <p className={secondaryLineClass}>{r.current_location || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top text-center">
                      <p className={primaryLineClass}>{formatDateDisplay(r.breakdown_date)}</p>
                      <p className={secondaryLineClass}>
                        {(r.breakdown_time ?? '').slice(0, 5) || '—'}
                      </p>
                      <p className={secondaryLineClass}>{r.reported_by_name || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={primaryLineClass}>{r.nature_of_breakdown || '—'}</p>
                      {r.impact_on_work ? (
                        <p className={secondaryLineClass}>{r.impact_on_work}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span
                        className={cn(
                          'inline-block border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          statusTone(r.status),
                        )}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-center">
                      <p className={primaryLineClass}>
                        {formatDateTimeDisplay(r.return_to_service_date)}
                      </p>
                      <p className={secondaryLineClass}>{r.authorized_by_name || '—'}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="inline-flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Edit ${r.register_no}`}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Copy ${r.register_no}`}
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
