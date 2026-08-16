import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { CalibrationNablScopeRow } from './types'

const GRID_TABLE =
  'table-fixed min-w-[1180px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const primaryLineClass =
  'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'

const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'

const monoLineClass =
  'break-words font-mono text-[12px] font-semibold tabular-nums tracking-tight text-[#1c1917]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const actionBtnClass =
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

export function CalibrationNablScopeTable({
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
  rows: CalibrationNablScopeRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: CalibrationNablScopeRow) => void
  onCopy: (row: CalibrationNablScopeRow) => void
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
            {searchActive ? 'No calibration scope entries match your search.' : 'No calibration scope entries yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">
              Use &quot;Add Scope Entry&quot; to create your first NABL calibration scope record.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[5%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[16%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn(thBase)}>
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
                <TableHead className={thBase}>S. No.</TableHead>
                <TableHead className={thBase}>Discipline</TableHead>
                <TableHead className={thBase}>Group</TableHead>
                <TableHead className={thBase}>Measurand / Instrument</TableHead>
                <TableHead className={thBase}>Method / Procedure</TableHead>
                <TableHead className={thBase}>Range &amp; Frequency</TableHead>
                <TableHead className={thBase}>CMC (±)</TableHead>
                <TableHead className={thBase}>Facility</TableHead>
                <TableHead className={thBase}>Action</TableHead>
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
                      'border-b border-[#e7e0d4] transition-colors',
                      selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass,
                    )}
                  >
                    <TableCell className="align-middle text-center">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select S.No ${r.s_no}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={monoLineClass}>{r.s_no}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={primaryLineClass}>{r.discipline_name || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={secondaryLineClass}>{r.group_name || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={primaryLineClass}>{r.measurand || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={secondaryLineClass}>{r.calibration_method || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={secondaryLineClass}>{r.measurement_range || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={monoLineClass}>{r.cmc || '—'}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={secondaryLineClass}>{r.facility_type || '—'}</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="inline-flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Edit S.No ${r.s_no}`}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Copy S.No ${r.s_no}`}
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
