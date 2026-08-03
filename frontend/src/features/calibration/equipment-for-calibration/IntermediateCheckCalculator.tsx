import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IqcMasterSearchSelect } from '@/features/masters/equipment-master/IqcMasterSearchSelect'
import {
  DEFAULT_INTERMEDIATE_HUMIDITY,
  DEFAULT_INTERMEDIATE_TEMPERATURE,
} from '@/features/masters/equipment-master/intermediateCheckHistory'
import {
  calcIntermediateCheckError,
  emptyIntermediateCheckReading,
  extractAcceptanceCriteriaUnit,
  formatIntermediateCheckError,
  parseAcceptanceLimit,
  summarizeIntermediateCheck,
  type IntermediateCheckDraft,
  type IntermediateCheckReading,
} from './intermediateCheck'

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
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB')
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
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {message}
        </div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between border-b pb-2 text-xs">
          <span className="font-bold uppercase text-slate-700">
            Interactive Check Layout (ISO 17025)
          </span>
          <span className="text-[11px] text-muted-foreground">
            Criteria: <strong className="text-foreground">{acceptanceCriteria || 'None'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="efc-ic-temperature"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-500"
            >
              Temperature (°C)
            </Label>
            <Input
              id="efc-ic-temperature"
              inputMode="decimal"
              placeholder="e.g. 23.5"
              className="h-9 text-xs"
              value={draft.temperature || DEFAULT_INTERMEDIATE_TEMPERATURE}
              onChange={(e) => patch({ temperature: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="efc-ic-humidity"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-500"
            >
              Humidity (% RH)
            </Label>
            <Input
              id="efc-ic-humidity"
              inputMode="decimal"
              placeholder="e.g. 55"
              className="h-9 text-xs"
              value={draft.humidity || DEFAULT_INTERMEDIATE_HUMIDITY}
              onChange={(e) => patch({ humidity: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Master Standard(s) Used
            </Label>
            <IqcMasterSearchSelect
              iqcMasters={masterEquipment}
              selectedMasterIds={draft.masterIds}
              onSelectedMasterIdsChange={(ids) => patch({ masterIds: ids })}
              emptyPlaceholder="No calibration standards found"
              searchPlaceholder="Type to search equipment…"
              listId="efc-ic-master-search-list"
            />
          </div>
        </div>

        {selectedMasters.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-slate-150 bg-slate-50 p-3">
            <div className="border-b border-slate-200 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
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
                  className="space-y-2 rounded-md border border-slate-200 bg-white p-2.5 text-[11px]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800">
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
                        className="h-7 border-destructive/30 px-2 text-[10px] text-destructive hover:bg-destructive/5"
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
                            : 'text-[10px] text-slate-500'
                        }
                      >
                        {master.next_calibration_due
                          ? `Cal Due: ${formatDate(master.next_calibration_due)}${isOverdue ? ' (Overdue!)' : ''}`
                          : 'No Calibration Due Date'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:grid-cols-3">
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

        <div className="max-h-[220px] overflow-x-auto overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-semibold uppercase text-muted-foreground">
                <th className="w-[5%] px-2 py-1.5">#</th>
                <th className="w-[22%] px-2 py-1.5 text-center">Check Point</th>
                <th className="w-[20%] px-2 py-1.5 text-center">Std Value</th>
                <th className="w-[20%] px-2 py-1.5 text-center">Obs Value</th>
                <th className="w-[18%] px-2 py-1.5 text-center">
                  Error{criteriaUnit ? ` (${criteriaUnit})` : ''}
                </th>
                <th className="w-[7%] px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.readings.map((reading, idx) => {
                const errValue = calcIntermediateCheckError(reading.std, reading.obs)
                const isPass = errValue === null || limit === null || errValue <= limit
                const isLastRow = idx === draft.readings.length - 1

                return (
                  <tr key={idx} className="group hover:bg-slate-50/50">
                    <td className="px-2 py-1.5 align-middle font-mono text-slate-500">{idx + 1}</td>
                    <td className="px-1 py-0.5 text-center align-middle">
                      <Input
                        placeholder="Check Point"
                        className="h-7 px-2 py-0.5 text-center text-xs"
                        value={reading.checkPointValue}
                        onChange={(e) => updateReading(idx, 'checkPointValue', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5 text-center align-middle">
                      <Input
                        placeholder="Std"
                        className="h-7 px-2 py-0.5 text-center text-xs"
                        value={reading.std}
                        onChange={(e) => updateReading(idx, 'std', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5 text-center align-middle">
                      <Input
                        placeholder="Obs"
                        className="h-7 px-2 py-0.5 text-center text-xs"
                        value={reading.obs}
                        onChange={(e) => updateReading(idx, 'obs', e.target.value)}
                      />
                    </td>
                    <td className="py-1.5 text-center align-middle">
                      {errValue !== null ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-[11px] font-medium text-slate-700">
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
                        <span className="text-[10px] text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-0.5 pl-1 text-right align-middle">
                      <div className="flex items-center justify-end gap-0.5">
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
                            className="h-6 w-6 text-primary hover:bg-primary/10"
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
              <tfoot className="border-t border-slate-200 bg-slate-50/40 text-[11px] text-slate-700">
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-right font-semibold">
                    Combined Error (RSS):
                  </td>
                  <td className="py-2 text-center font-mono font-bold text-primary">
                    {formatIntermediateCheckError(rssError, criteriaUnit)}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={4} className="px-2 py-1 text-right font-semibold">
                    Max Error:
                  </td>
                  <td className="py-1 text-center font-mono font-semibold">
                    {formatIntermediateCheckError(maxError, criteriaUnit)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  )
}
