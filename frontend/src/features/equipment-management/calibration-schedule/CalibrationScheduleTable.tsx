import { Link } from 'react-router-dom'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  CALIBRATION_SOURCE_LABELS,
  calibrationScheduleEquipmentHref,
  dueLabel,
  dueTone,
  formatDateDisplay,
  type CalibrationScheduleRow,
} from './types'

const GRID_TABLE =
  'table-fixed min-w-[1080px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const primaryLineClass =
  'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export function CalibrationScheduleTable({
  rows,
  loading,
  error,
  searchActive,
  selectedKeys,
  onToggle,
  onToggleAll,
}: {
  rows: CalibrationScheduleRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedKeys: Set<string>
  onToggle: (key: string) => void
  onToggleAll: (checked: boolean) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedKeys.has(r.key))
  const someChecked = rows.some((r) => selectedKeys.has(r.key))

  return (
    <div className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading calibration schedule…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {searchActive
              ? 'No equipment matches your filters.'
              : 'No equipment found in Testing, Calibration, or IQC masters.'}
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
                <TableHead className={thBase}>Equipment</TableHead>
                <TableHead className={thBase}>Source</TableHead>
                <TableHead className={thBase}>Location</TableHead>
                <TableHead className={thBase}>Frequency</TableHead>
                <TableHead className={thBase}>Last Calibration</TableHead>
                <TableHead className={thBase}>Next Due</TableHead>
                <TableHead className={thBase}>Schedule Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedKeys.has(r.key)
                const even = index % 2 === 0
                return (
                  <TableRow
                    key={r.key}
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
                        aria-label={`Select ${r.equipmentName || r.assetCode}`}
                        checked={selected}
                        onChange={() => onToggle(r.key)}
                      />
                    </TableCell>
                    <TableCell className="align-middle">
                      {r.equipmentName.trim() ? (
                        <Link
                          to={calibrationScheduleEquipmentHref(r)}
                          className={cn(
                            primaryLineClass,
                            'text-amber-800 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950 hover:decoration-amber-800',
                          )}
                          title={`View details — ${r.equipmentName}`}
                        >
                          {r.equipmentName}
                        </Link>
                      ) : (
                        <p className={primaryLineClass}>—</p>
                      )}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={primaryLineClass}>
                        {CALIBRATION_SOURCE_LABELS[r.source]}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <p className={primaryLineClass}>{r.location || '—'}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={primaryLineClass}>{r.frequency || '—'}</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={primaryLineClass}>
                        {formatDateDisplay(r.lastCalibrationDate)}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={primaryLineClass}>
                        {formatDateDisplay(r.nextCalibrationDate)}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span
                        className={cn(
                          'inline-block border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          dueTone(r.dueBucket),
                        )}
                      >
                        {dueLabel(r)}
                      </span>
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
