import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  limsOutlineBtnClass,
  limsPanelClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { IQC_SOURCE_LABELS, type EquipmentsForIqcListRow } from './types'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 accent-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const scheduleStatusUi = {
  overdue: {
    text: 'Overdue',
    className: 'border-red-700 bg-red-700 text-white hover:bg-red-800',
  },
  soon: {
    text: 'Due Soon',
    className: 'border-amber-600 bg-amber-500 text-stone-950 hover:bg-amber-400',
  },
  ok: {
    text: 'Active',
    className: 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700',
  },
  notSet: {
    text: 'Not Set',
    className: 'border-stone-400 bg-stone-100 text-stone-600 hover:bg-stone-200',
  },
  notApplicable: {
    text: 'N/A',
    className:
      'cursor-not-allowed border-stone-300 bg-stone-200/80 text-stone-500 opacity-80 hover:bg-stone-200/80',
  },
} as const

function scheduleTone(nextDue: string | null | undefined): 'overdue' | 'soon' | 'ok' | 'notSet' {
  if (!nextDue) return 'notSet'
  const due = new Date(nextDue)
  if (Number.isNaN(due.getTime())) return 'notSet'
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'soon'
  return 'ok'
}

function ScheduleStatusButton({
  label,
  section,
  nextDue,
  row,
  applicable,
  onEdit,
}: {
  label: string
  section: 'calibration' | 'intermediate' | 'maintenance'
  nextDue: string | null | undefined
  row: EquipmentsForIqcListRow
  applicable: boolean
  onEdit: (
    row: EquipmentsForIqcListRow,
    section?: 'calibration' | 'intermediate' | 'maintenance' | 'details',
  ) => void
}) {
  const tone = applicable ? scheduleTone(nextDue) : 'notApplicable'
  const ui = scheduleStatusUi[tone]
  const dueLabel = nextDue ? formatDate(nextDue) : '—'

  return (
    <Button
      type="button"
      size="sm"
      disabled={!applicable}
      className={cn(
        'h-7 w-full max-w-[8.5rem] rounded-none border px-2 text-[11px] font-bold uppercase tracking-wide shadow-none',
        ui.className,
      )}
      onClick={() => {
        if (!applicable) return
        onEdit(row, section)
      }}
      aria-label={
        applicable
          ? `Open ${label} for ${row.equipmentName || row.assetCode}. Status: ${ui.text}`
          : `${label} not applicable for ${row.equipmentName || row.assetCode}`
      }
      title={
        applicable
          ? `${label}: ${ui.text}${nextDue ? ` · Due ${dueLabel}` : ''}`
          : `${label}: N/A`
      }
    >
      {ui.text}
    </Button>
  )
}

export function EquipmentsForIqcTable({
  rows,
  loading,
  error,
  searchActive,
  selectedKeys,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: EquipmentsForIqcListRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedKeys: Set<string>
  onToggle: (key: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (
    row: EquipmentsForIqcListRow,
    section?: 'calibration' | 'intermediate' | 'maintenance' | 'details',
  ) => void
  onCopy: (row: EquipmentsForIqcListRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedKeys.has(r.key))
  const someChecked = rows.some((r) => selectedKeys.has(r.key))

  return (
    <div className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-4 pt-4 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="px-4 py-6 text-center text-sm text-stone-600">Loading…</p>
      ) : (
        <div className="[&>div]:overflow-x-auto">
          <Table className={cn(limsTableClass, 'table-fixed min-w-[1080px]')}>
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[90px]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn(limsTableHeadClass, 'px-2')}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select all"
                    checked={allChecked}
                    disabled={rows.length === 0}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className={cn(limsTableHeadClass, 'text-left')}>Equipment</TableHead>
                <TableHead className={limsTableHeadClass}>Source</TableHead>
                <TableHead className={limsTableHeadClass}>Least Count</TableHead>
                <TableHead className={limsTableHeadClass}>Range</TableHead>
                <TableHead className={limsTableHeadClass}>Calibration</TableHead>
                <TableHead className={limsTableHeadClass}>Intermediate Check</TableHead>
                <TableHead className={limsTableHeadClass}>Maintenance</TableHead>
                <TableHead className={limsTableHeadClass}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={9}
                    className="border border-[#e7e0d4] bg-[#fffcf7] px-4 py-10 text-center"
                  >
                    <p className="text-sm text-stone-600">
                      {searchActive
                        ? 'No equipment matches your filters.'
                        : 'No IQC equipment added yet.'}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Use “Add New” to register Testing or Calibration IQC equipment.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, index) => {
                  const selected = selectedKeys.has(r.key)
                  const rowTone = selected
                    ? rowSelectedClass
                    : index % 2 === 0
                      ? rowEvenClass
                      : rowOddClass

                  return (
                    <TableRow
                      key={r.key}
                      data-state={selected ? 'selected' : undefined}
                      className={cn('border-[#e7e0d4]', rowTone)}
                    >
                      <TableCell className="align-middle px-2 text-center">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${r.equipmentName || r.assetCode}`}
                          checked={selected}
                          onChange={() => onToggle(r.key)}
                        />
                      </TableCell>
                      <TableCell className="align-middle text-left">
                        <button
                          type="button"
                          className="line-clamp-2 max-w-full break-words text-left text-[13px] font-bold leading-snug text-amber-800 underline-offset-2 hover:text-amber-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                          onClick={() => onEdit(r, 'details')}
                          aria-label={`View details for ${r.equipmentName || r.assetCode}`}
                          title="View details"
                        >
                          {r.equipmentName || '—'}
                        </button>
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm font-medium text-stone-700">
                        {IQC_SOURCE_LABELS[r.source]}
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm font-medium text-stone-800">
                        {r.leastCount || '—'}
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm font-medium text-stone-800">
                        {r.range || '—'}
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex justify-center">
                          <ScheduleStatusButton
                            label="Calibration"
                            section="calibration"
                            nextDue={r.nextCalibrationDue}
                            row={r}
                            applicable={r.calibrationApplicable}
                            onEdit={onEdit}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex justify-center">
                          <ScheduleStatusButton
                            label="Intermediate Check"
                            section="intermediate"
                            nextDue={r.nextIntermediateCheckDate}
                            row={r}
                            applicable={r.intermediateApplicable}
                            onEdit={onEdit}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex justify-center">
                          <ScheduleStatusButton
                            label="Maintenance"
                            section="maintenance"
                            nextDue={r.nextMaintenanceDate}
                            row={r}
                            applicable={r.maintenanceApplicable}
                            onEdit={onEdit}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className={cn('h-8 w-8', limsOutlineBtnClass)}
                            aria-label={`Edit ${r.assetCode || r.equipmentName}`}
                            onClick={() => onEdit(r)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className={cn('h-8 w-8', limsOutlineBtnClass)}
                            aria-label={`Copy ${r.assetCode || r.equipmentName}`}
                            onClick={() => onCopy(r)}
                          >
                            <Copy size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
