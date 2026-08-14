import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import {
  calcIntermediateCheckError,
  emptyIntermediateCheckReading,
  extractAcceptanceCriteriaUnit,
  formatIntermediateCheckError,
  parseAcceptanceLimit,
  readingsFromCheckTable,
  summarizeIntermediateCheck,
  type IntermediateCheckDraft,
  type IntermediateCheckReading,
} from './intermediateCheck'
import { computeCalibrationPointRowValuesFromMaster } from './calibrationPointsFormula'
import {
  emptyCalibrationPointRow,
  visibleCalibrationPointsColumns,
  type CalibrationPointRow,
  type CalibrationPointsColumn,
} from './types'

/** Peer calibration standard used as reference during the check. */
export type IntermediateCheckMasterOption = {
  id: string
  equipment_name?: string | null
  asset_code?: string | null
  range_capacity?: string | null
  resolution_least_count?: string | null
  accuracy_acceptance_criteria?: string | null
  calibration_frequency?: string | null
  last_calibration_date?: string | null
  next_calibration_due?: string | null
  calibration_certificate_number?: string | null
  calibration_certificate_uncertainty?: string | null
  calibration_uncertainty_unit?: string | null
  calibration_points?: unknown
}

export function IntermediateCheckCalculator({
  draft,
  onDraftChange,
  acceptanceCriteria,
  masterEquipment,
  message,
}: {
  draft: IntermediateCheckDraft
  onDraftChange: (next: IntermediateCheckDraft) => void
  acceptanceCriteria: string
  masterEquipment: IntermediateCheckMasterOption[]
  message?: string | null
}) {
  const criteriaUnit = extractAcceptanceCriteriaUnit(acceptanceCriteria)
  const limit = parseAcceptanceLimit(acceptanceCriteria)
  const { maxError, rssError, hasReading } = summarizeIntermediateCheck(
    draft.readings,
    acceptanceCriteria,
  )

  const patch = (next: Partial<IntermediateCheckDraft>) => onDraftChange({ ...draft, ...next })

  const setReadings = (readings: IntermediateCheckReading[]) => patch({ readings })

  const updateReading = (index: number, field: keyof IntermediateCheckReading, value: string) => {
    const next = [...draft.readings]
    next[index] = { ...next[index], [field]: value }
    setReadings(next)
  }

  const selectedMasters = draft.masterIds
    .map((id) => masterEquipment.find((m) => m.id === id))
    .filter((m): m is IntermediateCheckMasterOption => Boolean(m))

  return (
    <div className="space-y-3">
      {message ? (
        <div className="rounded-none border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {message}
        </div>
      ) : null}

      <div className="space-y-4 rounded-none border-2 border-stone-400 bg-white p-3 shadow-sm">
        {draft.envColumns.length > 0 ? (
          <FlexiblePointsTable
            title="Environmental Condition"
            columns={draft.envColumns}
            rows={draft.envRows}
            onRowsChange={(envRows) => patch({ envRows })}
          />
        ) : null}

        {draft.checkColumns.length > 0 ? (
          <FlexiblePointsTable
            title="Check Point Table"
            columns={draft.checkColumns}
            rows={draft.checkRows}
            onRowsChange={(checkRows) =>
              patch({
                checkRows,
                readings: readingsFromCheckTable(draft.checkColumns, checkRows),
              })
            }
          />
        ) : null}

        {selectedMasters.length > 0 ? (
          <div className="space-y-2 rounded-none border-2 border-stone-300 bg-stone-50 p-3">
            <div className="border-b border-stone-300 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              Selected Master Details
            </div>
            {selectedMasters.map((master) => {
              const isOverdue = Boolean(
                master.next_calibration_due &&
                  new Date(master.next_calibration_due) < new Date(),
              )
              return (
                <div
                  key={master.id}
                  className="space-y-2 rounded-none border border-stone-300 bg-white p-2.5 text-[11px]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-stone-800">
                        {master.equipment_name || '—'}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {master.asset_code || '-'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-7 px-2 text-[10px]',
                          limsOutlineBtnClass,
                          'border-red-300 text-red-800 hover:bg-red-50',
                        )}
                        onClick={() =>
                          patch({ masterIds: draft.masterIds.filter((id) => id !== master.id) })
                        }
                      >
                        Deselect
                      </Button>
                      <span
                        className={
                          isOverdue
                            ? 'text-[10px] font-bold text-rose-600'
                            : 'text-[10px] text-stone-500'
                        }
                      >
                        {master.next_calibration_due
                          ? `Cal Due: ${formatDate(master.next_calibration_due)}${isOverdue ? ' (Overdue!)' : ''}`
                          : 'No Calibration Due Date'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-stone-600 sm:grid-cols-3">
                    <div>
                      <span className="text-muted-foreground">Range / Capacity: </span>
                      {master.range_capacity || '-'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Resolution: </span>
                      {master.resolution_least_count || '-'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Acceptance: </span>
                      {master.accuracy_acceptance_criteria || '-'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cal Frequency: </span>
                      {master.calibration_frequency || '-'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Calibration: </span>
                      {formatDate(master.last_calibration_date)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Certificate No: </span>
                      {master.calibration_certificate_number || '-'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {/* Default Std/Obs/Error grid only when no IC Check Point Table was generated */}
        {draft.checkColumns.length === 0 ? (
        <div className="overflow-x-auto overflow-y-auto rounded-none border-2 border-stone-400">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-stone-800 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                <th className="w-[5%] border border-stone-700 px-2 py-2 text-center">#</th>
                <th className="w-[22%] border border-stone-700 px-2 py-2 text-center">Check Point</th>
                <th className="w-[20%] border border-stone-700 px-2 py-2 text-center">Std Value</th>
                <th className="w-[20%] border border-stone-700 px-2 py-2 text-center">Obs Value</th>
                <th className="w-[18%] border border-stone-700 px-2 py-2 text-center">
                  Error{criteriaUnit ? ` (${criteriaUnit})` : ''}
                </th>
                <th className="w-[7%] border border-stone-700 px-2 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-[#f7f3eb]">
              {draft.readings.map((reading, idx) => {
                const errValue = calcIntermediateCheckError(reading.std, reading.obs)
                const isPass = errValue === null || limit === null || errValue <= limit
                const isLastRow = idx === draft.readings.length - 1

                return (
                  <tr key={idx} className="group hover:bg-amber-50/40">
                    <td className="border border-stone-300 px-2 py-1.5 text-center align-middle font-mono text-stone-500">
                      {idx + 1}
                    </td>
                    <td className="border border-stone-300 px-1 py-0.5 text-center align-middle">
                      <Input
                        placeholder="Check Point"
                        className="!h-7 min-h-0 px-2 py-0.5 text-center text-xs"
                        value={reading.checkPointValue}
                        onChange={(e) => updateReading(idx, 'checkPointValue', e.target.value)}
                      />
                    </td>
                    <td className="border border-stone-300 px-1 py-0.5 text-center align-middle">
                      <Input
                        placeholder="Std"
                        className="!h-7 min-h-0 px-2 py-0.5 text-center text-xs"
                        value={reading.std}
                        onChange={(e) => updateReading(idx, 'std', e.target.value)}
                      />
                    </td>
                    <td className="border border-stone-300 px-1 py-0.5 text-center align-middle">
                      <Input
                        placeholder="Obs"
                        className="!h-7 min-h-0 px-2 py-0.5 text-center text-xs"
                        value={reading.obs}
                        onChange={(e) => updateReading(idx, 'obs', e.target.value)}
                      />
                    </td>
                    <td className="border border-stone-300 py-1.5 text-center align-middle">
                      {errValue !== null ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-[11px] font-medium text-stone-800">
                            {formatIntermediateCheckError(errValue, criteriaUnit)}
                          </div>
                          {isPass ? (
                            <span className="inline-flex items-center rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-600">
                              Pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded bg-rose-50 px-1 py-0.5 text-[9px] font-semibold text-rose-600">
                              Fail
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-stone-400">-</span>
                      )}
                    </td>
                    <td className="border border-stone-300 py-0.5 text-center align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {!isLastRow && draft.readings.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-rose-50"
                            aria-label={`Delete reading ${idx + 1}`}
                            onClick={() =>
                              setReadings(draft.readings.filter((_, i) => i !== idx))
                            }
                          >
                            <Trash2 size={10} />
                          </Button>
                        ) : null}
                        {isLastRow ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-amber-800 hover:bg-amber-500/15"
                            aria-label="Add reading"
                            onClick={() =>
                              setReadings([...draft.readings, emptyIntermediateCheckReading()])
                            }
                          >
                            <Plus size={12} />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {hasReading ? (
              <tfoot className="border-t border-stone-300 bg-stone-100 text-[11px] text-stone-800">
                <tr>
                  <td colSpan={4} className="border border-stone-300 px-2 py-2 text-right font-semibold">
                    Combined Error (RSS):
                  </td>
                  <td className="border border-stone-300 py-2 text-center font-mono font-bold text-amber-900">
                    {formatIntermediateCheckError(rssError, criteriaUnit)}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={4} className="border border-stone-300 px-2 py-1 text-right font-semibold">
                    Max Error:
                  </td>
                  <td className="border border-stone-300 py-1 text-center font-mono font-semibold">
                    {formatIntermediateCheckError(maxError, criteriaUnit)}
                  </td>
                  <td className="border border-stone-300" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        ) : null}
      </div>
    </div>
  )
}

function FlexiblePointsTable({
  title,
  columns,
  rows,
  onRowsChange,
}: {
  title: string
  columns: CalibrationPointsColumn[]
  rows: CalibrationPointRow[]
  onRowsChange: (rows: CalibrationPointRow[]) => void
}) {
  const visible = visibleCalibrationPointsColumns(columns)
  if (visible.length === 0) return null

  const updateCell = (rowId: string, colId: string, value: string) => {
    onRowsChange(
      rows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [colId]: value } } : row,
      ),
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{title}</p>
      <div className="overflow-x-auto rounded-none border-2 border-stone-400">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-stone-800 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
              <th className="border border-stone-700 px-2 py-2 text-center">#</th>
              {visible.map((col) => (
                <th key={col.id} className="border border-stone-700 px-2 py-2 text-center">
                  {col.header}
                </th>
              ))}
              <th className="border border-stone-700 px-2 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="bg-[#f7f3eb]">
            {rows.map((row, index) => {
              const display = computeCalibrationPointRowValuesFromMaster(columns, row.values, null)
              const isLast = index === rows.length - 1
              return (
                <tr key={row.id}>
                  <td className="border border-stone-300 px-2 py-1 text-center font-mono text-stone-500">
                    {index + 1}
                  </td>
                  {visible.map((col) => (
                    <td key={col.id} className="border border-stone-300 px-1 py-0.5">
                      <Input
                        value={
                          col.type === 'formula'
                            ? (display[col.id] ?? '')
                            : (row.values[col.id] ?? '')
                        }
                        readOnly={col.type === 'formula'}
                        className="!h-7 min-h-0 px-2 py-0.5 text-center text-xs"
                        onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="border border-stone-300 text-center">
                    {isLast ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-amber-800 hover:bg-amber-500/15"
                        aria-label={`Add ${title} row`}
                        onClick={() => onRowsChange([...rows, emptyCalibrationPointRow(columns)])}
                      >
                        <Plus size={12} />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:bg-rose-50"
                        aria-label={`Remove ${title} row`}
                        onClick={() => onRowsChange(rows.filter((r) => r.id !== row.id))}
                      >
                        <Trash2 size={10} />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
