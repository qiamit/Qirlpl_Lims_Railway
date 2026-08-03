import { useEffect, useMemo, useState } from 'react'
import { Calculator, FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  emptyEquipmentRangeEntry,
  emptyCalibrationPointsTable,
  rangePointsFromTable,
  sortEquipmentRangesByCapacityAsc,
  type CalibrationEquipmentForm,
  type EquipmentRangeEntry,
} from './types'
import { defaultRawDataSheetTemplate } from '@/features/calibration/rawDataSheetTypes'
import { defaultMuCalculationTemplate } from './muCalculationTypes'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { CalibrationRangePointsDialog } from './CalibrationRangePointsDialog'
import { RawDataSheetTemplateEditor } from './RawDataSheetTemplateEditor'
import { MuCalculationSheetEditor } from './MuCalculationSheetEditor'

export function CalibrationEquipmentsForm({
  form,
  onChange,
  isCodeOptions,
  masterEquipmentOptions,
  canSave,
  saveLoading,
  onSave,
}: {
  form: CalibrationEquipmentForm
  onChange: (next: CalibrationEquipmentForm) => void
  isCodeOptions: FilterComboboxOption[]
  masterEquipmentOptions: FilterComboboxOption[]
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const [methodQuery, setMethodQuery] = useState(form.calibrationMethodLabel)
  const [methodOpen, setMethodOpen] = useState(false)
  const [pointsRangeId, setPointsRangeId] = useState<string | null>(null)
  const [rawSheetOpen, setRawSheetOpen] = useState(false)
  const [muSheetOpen, setMuSheetOpen] = useState(false)
  const [selectedRangeIds, setSelectedRangeIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setMethodQuery(form.calibrationMethodLabel)
  }, [form.calibrationMethodIsCodeId, form.calibrationMethodLabel])

  useEffect(() => {
    const valid = new Set(form.ranges.map((r) => r.id))
    setSelectedRangeIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)))
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev
      return next
    })
  }, [form.ranges])

  const set = <K extends keyof CalibrationEquipmentForm>(
    key: K,
    value: CalibrationEquipmentForm[K],
  ) => {
    onChange({ ...form, [key]: value })
  }

  const selectedMethodLabel = useMemo(() => {
    const match = isCodeOptions.find((o) => o.id === form.calibrationMethodIsCodeId)
    return match?.label ?? form.calibrationMethodLabel
  }, [isCodeOptions, form.calibrationMethodIsCodeId, form.calibrationMethodLabel])

  const sortedRanges = useMemo(
    () => sortEquipmentRangesByCapacityAsc(form.ranges),
    [form.ranges],
  )

  const filteredIsCodes = useMemo(() => {
    const q = methodQuery.trim().toLowerCase()
    if (!q || !methodOpen) return isCodeOptions
    return isCodeOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [isCodeOptions, methodQuery, methodOpen])

  const pointsRange = useMemo(
    () => form.ranges.find((r) => r.id === pointsRangeId) ?? null,
    [form.ranges, pointsRangeId],
  )

  const allRangesSelected =
    form.ranges.length > 0 && form.ranges.every((r) => selectedRangeIds.has(r.id))

  const updateRange = (id: string, patch: Partial<EquipmentRangeEntry>) => {
    set(
      'ranges',
      form.ranges.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    )
  }

  const addRange = () => {
    set('ranges', [...form.ranges, emptyEquipmentRangeEntry()])
  }

  const removeRange = (id: string) => {
    if (form.ranges.length <= 1) {
      set('ranges', [emptyEquipmentRangeEntry()])
      setSelectedRangeIds(new Set())
      return
    }
    set(
      'ranges',
      form.ranges.filter((r) => r.id !== id),
    )
    setSelectedRangeIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const toggleRange = (id: string) => {
    setSelectedRangeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllRanges = (checked: boolean) => {
    if (!checked) {
      setSelectedRangeIds(new Set())
      return
    }
    setSelectedRangeIds(new Set(form.ranges.map((r) => r.id)))
  }

  const removeSelectedRanges = () => {
    if (selectedRangeIds.size === 0) return
    const remaining = form.ranges.filter((r) => !selectedRangeIds.has(r.id))
    set('ranges', remaining.length > 0 ? remaining : [emptyEquipmentRangeEntry()])
    setSelectedRangeIds(new Set())
  }

  return (
    <div className={labRegistryFormClass}>
      <div className="space-y-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 space-y-2 md:col-span-6">
            <Label htmlFor="cal-eq-name">Equipment Name *</Label>
            <Input
              id="cal-eq-name"
              placeholder="Digital Multimeter"
              value={form.equipmentName}
              onChange={(e) => set('equipmentName', e.target.value)}
            />
          </div>
          <div className="col-span-12 space-y-2 md:col-span-6">
            <Label>Calibration Method</Label>
            <FilterCombobox
              value={methodOpen ? methodQuery : selectedMethodLabel}
              onValueChange={(v) => {
                setMethodQuery(v)
                if (!methodOpen) setMethodOpen(true)
                if (!v.trim()) {
                  onChange({
                    ...form,
                    calibrationMethodIsCodeId: '',
                    calibrationMethodLabel: '',
                  })
                }
              }}
              options={filteredIsCodes}
              onSelectOption={(opt) => {
                onChange({
                  ...form,
                  calibrationMethodIsCodeId: opt.id,
                  calibrationMethodLabel: opt.label,
                })
                setMethodQuery(opt.label)
                setMethodOpen(false)
              }}
              open={methodOpen}
              onOpenChange={(open) => {
                setMethodOpen(open)
                if (open) setMethodQuery(selectedMethodLabel)
              }}
              placeholder="Select IS Code : Revision year"
              listId="cal-eq-method-list"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Measurement Ranges
            </p>
            <div className="flex items-center gap-2">
              {selectedRangeIds.size > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={removeSelectedRanges}
                >
                  <Trash2 size={14} className="mr-1" />
                  Delete ({selectedRangeIds.size})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                onClick={() => setRawSheetOpen(true)}
              >
                <FileSpreadsheet size={14} className="mr-1" />
                Raw Data Sheet Format
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
                onClick={() => setMuSheetOpen(true)}
              >
                <Calculator size={14} className="mr-1" />
                MU Calculation Sheet
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 border border-slate-200 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="mx-auto block h-4 w-4 accent-teal-600"
                      checked={allRangesSelected}
                      onChange={(e) => toggleAllRanges(e.target.checked)}
                      aria-label="Select all ranges"
                    />
                  </th>
                  <th className="w-12 border border-slate-200 px-2 py-2 text-center">S.No</th>
                  <th className="min-w-[120px] border border-slate-200 px-2 py-2 text-center">
                    Range
                  </th>
                  <th className="min-w-[100px] border border-slate-200 px-2 py-2 text-center">
                    Least Count
                  </th>
                  <th className="min-w-[90px] border border-slate-200 px-2 py-2 text-center">
                    Accuracy
                  </th>
                  <th className="min-w-[110px] border border-slate-200 px-2 py-2 text-center">
                    Unit
                  </th>
                  <th className="w-28 border border-slate-200 px-2 py-2 text-center">Point</th>
                  <th className="w-16 border border-slate-200 px-2 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedRanges.map((range, index) => {
                  const isLast = index === sortedRanges.length - 1
                  const tabs = range.masterPointsTabs ?? []
                  const pointCount =
                    tabs.length > 0
                      ? tabs.reduce(
                          (sum, tab) =>
                            sum +
                            tab.calibrationPointsTable.rows.filter((r) =>
                              Object.values(r.values).some(
                                (v) => String(v ?? '').trim().length > 0,
                              ),
                            ).length,
                          0,
                        )
                      : (range.calibrationPointsTable?.rows?.length ??
                        range.calibrationPoints?.length ??
                        0)
                  const masterCount =
                    range.masterEquipmentIds?.filter((id) => id.trim()).length ??
                    tabs.filter((t) => t.masterEquipmentId.trim()).length
                  return (
                    <tr key={range.id} className="align-middle">
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          className="mx-auto block h-4 w-4 accent-teal-600"
                          checked={selectedRangeIds.has(range.id)}
                          onChange={() => toggleRange(range.id)}
                          aria-label={`Select range ${index + 1}`}
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center text-slate-500">
                        {index + 1}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <Input
                          id={`cal-eq-range-${range.id}`}
                          placeholder="e.g. 0–300"
                          value={range.rangeCapacity}
                          onChange={(e) =>
                            updateRange(range.id, { rangeCapacity: e.target.value })
                          }
                          className="h-9 text-center"
                          aria-label={`Range ${index + 1}`}
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <Input
                          id={`cal-eq-res-${range.id}`}
                          placeholder="e.g. 0.02"
                          value={range.resolutionLeastCount}
                          onChange={(e) =>
                            updateRange(range.id, { resolutionLeastCount: e.target.value })
                          }
                          className="h-9 text-center"
                          aria-label={`Least count ${index + 1}`}
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <Input
                          id={`cal-eq-acc-${range.id}`}
                          placeholder="e.g. ±0.02"
                          value={range.accuracy}
                          onChange={(e) => updateRange(range.id, { accuracy: e.target.value })}
                          className="h-9 text-center"
                          aria-label={`Accuracy ${index + 1}`}
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <MeasurementUnitSelect
                          id={`cal-eq-unit-${range.id}`}
                          value={range.unit}
                          onChange={(unit) => updateRange(range.id, { unit })}
                          showLabel={false}
                          showManageButton={false}
                          placeholder="Unit"
                          className="mx-auto w-full"
                          inputClassName="h-9 text-center"
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mx-auto h-8 gap-1.5 border-slate-300 bg-transparent px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() => setPointsRangeId(range.id)}
                          aria-label={`Calibration points for range ${index + 1}`}
                          title={
                            masterCount > 0
                              ? `${pointCount} points · ${masterCount} master(s)`
                              : undefined
                          }
                        >
                          <span>Points</span>
                          {pointCount > 0 ? (
                            <span className="rounded-full bg-teal-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                              {pointCount}
                            </span>
                          ) : null}
                          {masterCount > 0 ? (
                            <span className="rounded-full bg-slate-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                              M{masterCount}
                            </span>
                          ) : null}
                        </Button>
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        {isLast ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mx-auto h-8 w-8 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                            onClick={addRange}
                            aria-label="Add range"
                          >
                            <Plus size={16} />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeRange(range.id)}
                            aria-label={`Delete range ${index + 1}`}
                          >
                            <Trash2 size={16} />
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
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <Button
          type="button"
          className="bg-teal-600 text-white hover:bg-teal-500"
          onClick={onSave}
          disabled={!canSave || saveLoading}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>

      <CalibrationRangePointsDialog
        open={pointsRangeId != null && pointsRange != null}
        onOpenChange={(open) => {
          if (!open) setPointsRangeId(null)
        }}
        rangeLabel={pointsRange?.rangeCapacity?.trim() || 'Range'}
        unit={pointsRange?.unit ?? ''}
        pointsTable={pointsRange?.calibrationPointsTable ?? emptyCalibrationPointsTable()}
        masterEquipmentIds={pointsRange?.masterEquipmentIds ?? []}
        masterPointsTabs={pointsRange?.masterPointsTabs}
        masterEquipmentOptions={masterEquipmentOptions ?? []}
        onChange={({ calibrationPointsTable, masterEquipmentIds, masterPointsTabs }) => {
          if (!pointsRangeId) return
          updateRange(pointsRangeId, {
            calibrationPointsTable,
            calibrationPoints: rangePointsFromTable(calibrationPointsTable),
            masterEquipmentIds,
            masterPointsTabs,
          })
        }}
      />

      <Dialog open={rawSheetOpen} onOpenChange={setRawSheetOpen}>
        <DialogContent
          persistOnFocusLoss
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
            <DialogHeader className="relative pr-28 text-left sm:pr-32">
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300/90">
                Calibration Equipments
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                  Raw Data Sheet Format
                </DialogTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/30 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    onChange({ ...form, rawDataSheetTemplate: defaultRawDataSheetTemplate() })
                  }
                  aria-label="Reset raw data sheet format to default"
                >
                  Reset to Default
                </Button>
              </div>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
            <RawDataSheetTemplateEditor
              value={form.rawDataSheetTemplate}
              onChange={(rawDataSheetTemplate) => onChange({ ...form, rawDataSheetTemplate })}
            />
          </div>
          <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <Button type="button" onClick={() => setRawSheetOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={muSheetOpen} onOpenChange={setMuSheetOpen}>
        <DialogContent
          persistOnFocusLoss
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
            <DialogHeader className="relative pr-28 text-left sm:pr-32">
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-300/90">
                Calibration Equipments
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                  MU Calculation Sheet
                </DialogTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/30 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    onChange({
                      ...form,
                      muCalculationTemplate: defaultMuCalculationTemplate(),
                    })
                  }
                  aria-label="Reset MU calculation sheet to empty default"
                >
                  Reset
                </Button>
              </div>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
            <MuCalculationSheetEditor
              value={form.muCalculationTemplate}
              rawDataSheetColumns={form.rawDataSheetTemplate.columns}
              onChange={(muCalculationTemplate) =>
                onChange({ ...form, muCalculationTemplate })
              }
            />
          </div>
          <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <Button type="button" onClick={() => setMuSheetOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
