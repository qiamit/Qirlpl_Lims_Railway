import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsOutlineBtnClass,
  limsPanelClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type {
  EquipmentForCalibrationRow,
  EquipmentMasterVariant,
  EquipmentScheduleSection,
} from './types'

function scheduleTone(nextDue: string | null | undefined): 'ok' | 'soon' | 'overdue' | 'na' {
  if (!nextDue) return 'na'
  const due = new Date(nextDue)
  if (Number.isNaN(due.getTime())) return 'na'
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'soon'
  return 'ok'
}

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
  na: {
    text: 'Not Set',
    className: 'border-stone-400 bg-stone-100 text-stone-600 hover:bg-stone-200',
  },
} as const

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 accent-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

function ScheduleOpenButton({
  label,
  section,
  nextDue,
  row,
  onEdit,
}: {
  label: string
  section: EquipmentScheduleSection
  nextDue: string | null | undefined
  row: EquipmentForCalibrationRow
  onEdit: (row: EquipmentForCalibrationRow, section?: EquipmentScheduleSection) => void
}) {
  const tone = scheduleTone(nextDue)
  const ui = scheduleStatusUi[tone]
  const dueLabel = nextDue ? formatDate(nextDue) : '—'

  return (
    <Button
      type="button"
      size="sm"
      className={cn(
        'h-7 w-full max-w-[8.5rem] rounded-none border px-2 text-[11px] font-bold uppercase tracking-wide shadow-none',
        ui.className,
      )}
      onClick={() => onEdit(row, section)}
      aria-label={`Open ${label} details for ${row.equipment_name || row.asset_code || 'equipment'}. Status: ${ui.text}`}
      title={`${label}: ${ui.text}${nextDue ? ` · Due ${dueLabel}` : ''}`}
    >
      {ui.text}
    </Button>
  )
}

export function EquipmentForCalibrationTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onViewDetails,
  onCopy,
  variant = 'master',
}: {
  rows: EquipmentForCalibrationRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: EquipmentForCalibrationRow, section?: EquipmentScheduleSection) => void
  onViewDetails: (row: EquipmentForCalibrationRow) => void
  onCopy: (row: EquipmentForCalibrationRow) => void
  variant?: EquipmentMasterVariant
}) {
  const isIqc = variant === 'iqc'
  const showIntermediate = !isIqc
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))
  const colSpan = showIntermediate ? 7 : 6

  const emptyPrimary = searchActive
    ? isIqc
      ? 'No IQC masters match your search.'
      : 'No equipment matches your search.'
    : 'No records added yet.'
  const emptySecondary = isIqc
    ? 'Use “Add New” to register standards used to calibrate other equipment.'
    : 'Use “Add New” to register master equipment for calibration.'

  return (
    <div className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-4 pt-4 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="px-4 py-6 text-center text-sm text-stone-600">Loading…</p>
      ) : (
        <div className="[&>div]:overflow-x-auto">
          <Table className={cn(limsTableClass, 'table-fixed min-w-[960px]')}>
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[24%]" />
              <col className="w-[14%]" />
              <col className="w-[15%]" />
              {showIntermediate ? <col className="w-[17%]" /> : null}
              <col className="w-[15%]" />
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
                <TableHead className={cn(limsTableHeadClass, 'text-left')}>
                  Equipment Identity
                </TableHead>
                <TableHead className={limsTableHeadClass}>Range</TableHead>
                <TableHead className={limsTableHeadClass}>Calibration</TableHead>
                {showIntermediate ? (
                  <TableHead className={limsTableHeadClass}>Intermediate Check</TableHead>
                ) : null}
                <TableHead className={limsTableHeadClass}>Maintenance</TableHead>
                <TableHead className={limsTableHeadClass}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={colSpan}
                    className="border border-[#e7e0d4] bg-[#fffcf7] px-4 py-10 text-center"
                  >
                    <p className="text-sm text-stone-600">{emptyPrimary}</p>
                    {!searchActive ? (
                      <p className="mt-1 text-xs text-stone-500">{emptySecondary}</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  const rowTone = selected
                    ? rowSelectedClass
                    : index % 2 === 0
                      ? rowEvenClass
                      : rowOddClass
                  return (
                    <TableRow
                      key={r.id}
                      data-state={selected ? 'selected' : undefined}
                      className={cn('border-[#e7e0d4]', rowTone)}
                    >
                      <TableCell className="align-middle px-2 text-center">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${r.equipment_name}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className="align-middle text-left">
                        <button
                          type="button"
                          className="line-clamp-2 break-words text-left font-medium leading-snug text-amber-800 underline-offset-2 hover:text-amber-950 hover:underline"
                          onClick={() => onViewDetails(r)}
                          aria-label={`View details for ${r.equipment_name || r.asset_code || 'equipment'}`}
                        >
                          {r.equipment_name || '-'}
                        </button>
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm font-medium text-stone-800">
                        {r.range_capacity?.trim() || '—'}
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex justify-center">
                          <ScheduleOpenButton
                            label="Calibration"
                            section="calibration"
                            nextDue={r.next_calibration_due}
                            row={r}
                            onEdit={onEdit}
                          />
                        </div>
                      </TableCell>
                      {showIntermediate ? (
                        <TableCell className="align-middle text-center">
                          <div className="flex justify-center">
                            <ScheduleOpenButton
                              label="Intermediate Check"
                              section="intermediate"
                              nextDue={r.next_intermediate_check_date}
                              row={r}
                              onEdit={onEdit}
                            />
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="align-middle text-center">
                        <div className="flex justify-center">
                          <ScheduleOpenButton
                            label="Maintenance"
                            section="maintenance"
                            nextDue={r.next_maintenance_date}
                            row={r}
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
                            aria-label={`Edit ${r.asset_code}`}
                            onClick={() => onEdit(r)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className={cn('h-8 w-8', limsOutlineBtnClass)}
                            aria-label={`Copy ${r.asset_code}`}
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
