import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Copy, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  emptyEquipmentRangeEntry,
  emptyCalibrationPointsTable,
  emptyGenerateReportConfigRow,
  buildGenerateReportRandomnessEditorRows,
  buildViewFactorPointEntriesForGenerateReportRow,
  computeGenerateReportOutputMinMaxPreview,
  copyGenerateReportRandomnessDraftFromRow,
  parseGenerateReportRandomnessMode,
  rangePointsFromTable,
  seedRangeTemplatesFromEquipment,
  sortEquipmentRangesByCapacityAsc,
  summarizeGenerateReportViewFactor,
  withSyncedRangeCapacity,
  type CalibrationEquipmentForm,
  type EquipmentRangeEntry,
  type GenerateReportConfig,
  type GenerateReportConfigRow,
  type GenerateReportPointRandomness,
  type GenerateReportRandomnessMode,
} from './types'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { CalibrationRangePointsDialog } from './CalibrationRangePointsDialog'
import { RawDataSheetTemplateEditor } from './RawDataSheetTemplateEditor'
import { MuCalculationSheetEditor } from './MuCalculationSheetEditor'
import { CertificateTemplateEditor } from './CertificateTemplateEditor'
import {
  MU_CALIBRATION_POINT_COLUMN,
  MU_EQUIPMENT_RANGE_FIELD_COLUMNS,
  MU_RANGE_MAX_FIELD_KEY,
  MU_RANGE_MIN_FIELD_KEY,
} from './muCalculationTypes'
import type { CalibrationCertificateTemplate } from './certificateTemplateTypes'

const COLUMN_NONE = '__none__'

const VIEW_FACTOR_FULLSCREEN_DIALOG_CLASS =
  '!flex fixed inset-0 !z-[70] !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100'

const VIEW_FACTOR_FULLSCREEN_DIALOG_STYLE = {
  width: '100vw',
  height: '100dvh',
  maxWidth: 'none',
  maxHeight: '100dvh',
  top: 0,
  left: 0,
  transform: 'none',
} as const

function randomnessFactorPlaceholder(mode: GenerateReportRandomnessMode): string {
  switch (mode) {
    case 'absolute':
      return 'e.g. 0.05'
    case 'range_span':
    case 'range_max':
      return 'e.g. 1'
    default:
      return 'e.g. 0.5'
  }
}

function randomnessFactorAriaLabel(
  mode: GenerateReportRandomnessMode,
  rowIndex: number,
): string {
  const row = `row ${rowIndex + 1}`
  switch (mode) {
    case 'absolute':
      return `Randomness Factor absolute units ${row}`
    case 'range_span':
      return `Randomness Factor range span percent ${row}`
    case 'range_max':
      return `Randomness Factor range max percent ${row}`
    default:
      return `Randomness Factor percent ${row}`
  }
}

/** Equipment measurement-range fields for Generate Report Reference Column. */
const GENERATE_REPORT_EQUIPMENT_REF_COLUMNS = [
  ...MU_EQUIPMENT_RANGE_FIELD_COLUMNS.map((col) => {
    if (col.key === MU_RANGE_MIN_FIELD_KEY) return { ...col, label: 'Range Minimum' }
    if (col.key === MU_RANGE_MAX_FIELD_KEY) return { ...col, label: 'Range Maximum' }
    return col
  }),
  MU_CALIBRATION_POINT_COLUMN,
]

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
  const [randomnessEditorRowId, setRandomnessEditorRowId] = useState<string | null>(null)
  const [randomnessDraft, setRandomnessDraft] = useState<GenerateReportPointRandomness[]>([])
  const [randomnessFormatDraft, setRandomnessFormatDraft] = useState<{
    roundOff: string
    decimalPlaces: number
  }>({ roundOff: '', decimalPlaces: 2 })
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

  /** Active range for per-range template editors (seeded from equipment-level fallback). */
  const templateRange = useMemo(() => {
    if (!pointsRange) return null
    return seedRangeTemplatesFromEquipment(pointsRange, {
      rawDataSheetTemplate: form.rawDataSheetTemplate,
      muCalculationTemplate: form.muCalculationTemplate,
      generateReportConfig: form.generateReportConfig,
      certificateTemplate: form.certificateTemplate,
    })
  }, [
    pointsRange,
    form.rawDataSheetTemplate,
    form.muCalculationTemplate,
    form.generateReportConfig,
    form.certificateTemplate,
  ])

  const templateRawDataSheet = templateRange?.rawDataSheetTemplate ?? form.rawDataSheetTemplate
  const templateMuCalculation = templateRange?.muCalculationTemplate ?? form.muCalculationTemplate
  const templateGenerateReport = templateRange?.generateReportConfig ?? form.generateReportConfig
  const templateCertificate =
    templateRange?.certificateTemplate ?? form.certificateTemplate

  const ensureRangeTemplatesSeeded = (rangeId: string) => {
    const range = form.ranges.find((r) => r.id === rangeId)
    if (!range) return
    const seeded = seedRangeTemplatesFromEquipment(range, {
      rawDataSheetTemplate: form.rawDataSheetTemplate,
      muCalculationTemplate: form.muCalculationTemplate,
      generateReportConfig: form.generateReportConfig,
      certificateTemplate: form.certificateTemplate,
    })
    const patch: Partial<EquipmentRangeEntry> = {}
    if (seeded.rawDataSheetTemplate && !range.rawDataSheetTemplate) {
      patch.rawDataSheetTemplate = seeded.rawDataSheetTemplate
    }
    if (seeded.muCalculationTemplate && !range.muCalculationTemplate) {
      patch.muCalculationTemplate = seeded.muCalculationTemplate
    }
    if (seeded.generateReportConfig && !range.generateReportConfig) {
      patch.generateReportConfig = seeded.generateReportConfig
    }
    if (seeded.certificateTemplate && !range.certificateTemplate) {
      patch.certificateTemplate = seeded.certificateTemplate
    }
    if (Object.keys(patch).length > 0) updateRange(rangeId, patch)
  }

  const openPointsForRange = (rangeId: string) => {
    ensureRangeTemplatesSeeded(rangeId)
    setPointsRangeId(rangeId)
  }

  /** Input Column may target any sheet column (including formula). */
  const generateReportInputColumns = useMemo(
    () => templateRawDataSheet.columns,
    [templateRawDataSheet.columns],
  )

  /** Reference sheet columns exclude formula (equipment refs cover range fields). */
  const rawDataSheetColumns = useMemo(
    () => templateRawDataSheet.columns.filter((c) => c.type !== 'formula'),
    [templateRawDataSheet.columns],
  )

  const patchGenerateReportConfig = (patch: Partial<GenerateReportConfig>) => {
    if (!pointsRangeId) return
    updateRange(pointsRangeId, {
      generateReportConfig: { ...templateGenerateReport, ...patch },
    })
  }

  const patchCertificateTemplate = (next: CalibrationCertificateTemplate) => {
    if (!pointsRangeId) return
    onChange({
      ...form,
      certificateTemplate: next,
      ranges: form.ranges.map((r) =>
        r.id === pointsRangeId ? { ...r, certificateTemplate: next } : r,
      ),
    })
  }

  const generateReportRows =
    templateGenerateReport.rows?.length > 0
      ? templateGenerateReport.rows
      : [emptyGenerateReportConfigRow()]

  const setGenerateReportRows = (rows: GenerateReportConfigRow[]) => {
    patchGenerateReportConfig({
      rows: rows.length > 0 ? rows : [emptyGenerateReportConfigRow()],
    })
  }

  const updateGenerateReportRow = (
    id: string,
    patch: Partial<Omit<GenerateReportConfigRow, 'id'>>,
  ) => {
    setGenerateReportRows(
      generateReportRows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  const addGenerateReportRow = () => {
    setGenerateReportRows([...generateReportRows, emptyGenerateReportConfigRow()])
  }

  const removeGenerateReportRow = (id: string) => {
    if (generateReportRows.length <= 1) {
      setGenerateReportRows([emptyGenerateReportConfigRow()])
      return
    }
    setGenerateReportRows(generateReportRows.filter((row) => row.id !== id))
  }

  const randomnessEditorRow = useMemo(
    () => generateReportRows.find((r) => r.id === randomnessEditorRowId) ?? null,
    [generateReportRows, randomnessEditorRowId],
  )

  const viewFactorPointEntries = useMemo(() => {
    if (!randomnessEditorRow || !templateRange) return []
    return buildViewFactorPointEntriesForGenerateReportRow(
      randomnessEditorRow,
      form.ranges,
      templateRawDataSheet.columns,
      templateRange,
    )
  }, [randomnessEditorRow, form.ranges, templateRawDataSheet.columns, templateRange])

  const openRandomnessEditor = (row: GenerateReportConfigRow) => {
    if (!templateRange) return
    const entries = buildViewFactorPointEntriesForGenerateReportRow(
      row,
      form.ranges,
      templateRawDataSheet.columns,
      templateRange,
    )
    setRandomnessDraft(buildGenerateReportRandomnessEditorRows(row, entries))
    setRandomnessFormatDraft({
      roundOff: row.roundOff,
      decimalPlaces: Number.isFinite(row.decimalPlaces)
        ? Math.max(0, Math.min(6, Math.round(row.decimalPlaces)))
        : 2,
    })
    setRandomnessEditorRowId(row.id)
  }

  const closeRandomnessEditor = () => {
    setRandomnessEditorRowId(null)
    setRandomnessDraft([])
    setRandomnessFormatDraft({ roundOff: '', decimalPlaces: 2 })
  }

  const updateRandomnessDraftRow = (
    id: string,
    patch: Partial<Omit<GenerateReportPointRandomness, 'id'>>,
  ) => {
    setRandomnessDraft((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  const saveRandomnessEditor = () => {
    if (!randomnessEditorRowId) return
    const pointRows = randomnessDraft.filter((r) => r.point.trim())
    const randomnessByPoint: GenerateReportPointRandomness[] = pointRows.map((p) => {
      const referenceValue = String(p.referenceValue ?? '').trim()
      const rangeId = String(p.rangeId ?? '').trim()
      return {
        ...p,
        point: p.point.trim(),
        ...(referenceValue ? { referenceValue } : {}),
        ...(rangeId ? { rangeId } : {}),
        isDefault: false,
        randomnessMode: parseGenerateReportRandomnessMode(p.randomnessMode),
      }
    })
    updateGenerateReportRow(randomnessEditorRowId, {
      // Top-level unused for Apply — clear so UI never shows legacy "Percent 0".
      randomnessMode: 'percent',
      randomnessFactor: '',
      randomnessFloor: '',
      randomnessCap: '',
      randomnessByPoint,
      roundOff: randomnessFormatDraft.roundOff,
      decimalPlaces: randomnessFormatDraft.decimalPlaces,
    })
    closeRandomnessEditor()
  }

  const updateRandomnessFormatDraft = (
    patch: Partial<{ roundOff: string; decimalPlaces: number }>,
  ) => {
    setRandomnessFormatDraft((prev) => ({ ...prev, ...patch }))
  }

  const randomnessEditorInputLabel = useMemo(() => {
    if (!randomnessEditorRow) return ''
    const key = randomnessEditorRow.inputColumnKey.trim()
    if (!key) return 'Input Column'
    const col = generateReportInputColumns.find((c) => c.key === key)
    return (col?.label || key).trim() || 'Input Column'
  }, [randomnessEditorRow, generateReportInputColumns])

  const viewFactorCopySourceOptions = useMemo(() => {
    if (!randomnessEditorRow) return []
    return generateReportRows
      .filter((r) => r.id !== randomnessEditorRow.id && r.inputColumnKey.trim())
      .map((r) => {
        const key = r.inputColumnKey.trim()
        const col = generateReportInputColumns.find((c) => c.key === key)
        return {
          row: r,
          label: (col?.label || key).trim() || key,
        }
      })
  }, [generateReportRows, randomnessEditorRow, generateReportInputColumns])

  const copyViewFactorFromField = (sourceRow: GenerateReportConfigRow) => {
    if (!templateRange) return
    const sourceEntries = buildViewFactorPointEntriesForGenerateReportRow(
      sourceRow,
      form.ranges,
      templateRawDataSheet.columns,
      templateRange,
    )
    const { pointRows, roundOff, decimalPlaces } = copyGenerateReportRandomnessDraftFromRow(
      randomnessDraft,
      sourceRow,
      sourceEntries,
    )
    setRandomnessDraft(pointRows)
    setRandomnessFormatDraft({ roundOff, decimalPlaces })
  }

  const allRangesSelected =
    form.ranges.length > 0 && form.ranges.every((r) => selectedRangeIds.has(r.id))

  const updateRange = (id: string, patch: Partial<EquipmentRangeEntry>) => {
    set(
      'ranges',
      form.ranges.map((r) => {
        if (r.id !== id) return r
        const synced =
          patch.rangeMin !== undefined || patch.rangeMax !== undefined
            ? withSyncedRangeCapacity(patch, r)
            : patch
        return { ...r, ...synced }
      }),
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
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] border-collapse text-sm">
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
                  <th className="min-w-[110px] border border-slate-200 px-2 py-2 text-center">
                    Range Minimum
                  </th>
                  <th className="min-w-[110px] border border-slate-200 px-2 py-2 text-center">
                    Range Maximum
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
                          id={`cal-eq-range-min-${range.id}`}
                          placeholder="e.g. 0"
                          value={range.rangeMin}
                          onChange={(e) =>
                            updateRange(range.id, { rangeMin: e.target.value })
                          }
                          className="h-9 text-center"
                          aria-label={`Range minimum ${index + 1}`}
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <Input
                          id={`cal-eq-range-max-${range.id}`}
                          placeholder="e.g. 300"
                          value={range.rangeMax}
                          onChange={(e) =>
                            updateRange(range.id, { rangeMax: e.target.value })
                          }
                          className="h-9 text-center"
                          aria-label={`Range maximum ${index + 1}`}
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
                          onClick={() => openPointsForRange(range.id)}
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
          if (!open) {
            setPointsRangeId(null)
            closeRandomnessEditor()
          }
        }}
        rangeLabel={pointsRange?.rangeCapacity?.trim() || 'Range'}
        unit={pointsRange?.unit ?? ''}
        pointsTable={pointsRange?.calibrationPointsTable ?? emptyCalibrationPointsTable()}
        masterEquipmentIds={pointsRange?.masterEquipmentIds ?? []}
        masterPointsTabs={pointsRange?.masterPointsTabs}
        masterEquipmentOptions={masterEquipmentOptions ?? []}
        generateReportEnabled={templateGenerateReport.enabled}
        certificateTemplateConfigured={Boolean(
          pointsRange?.certificateTemplate || form.certificateTemplate,
        )}
        rawSheetContent={
          <>
            <h3 className="text-base font-semibold text-slate-900">Raw Data Sheet Format</h3>
            <RawDataSheetTemplateEditor
              value={templateRawDataSheet}
              onChange={(rawDataSheetTemplate) => {
                if (!pointsRangeId) return
                updateRange(pointsRangeId, { rawDataSheetTemplate })
              }}
            />
          </>
        }
        muSheetContent={
          <>
            <h3 className="text-base font-semibold text-slate-900">MU Calculation Sheet</h3>
            <MuCalculationSheetEditor
              value={templateMuCalculation}
              rawDataSheetColumns={templateRawDataSheet.columns}
              onChange={(muCalculationTemplate) => {
                if (!pointsRangeId) return
                updateRange(pointsRangeId, { muCalculationTemplate })
              }}
            />
          </>
        }
        generateReportContent={
          <>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-600"
                checked={templateGenerateReport.enabled}
                onChange={(e) => patchGenerateReportConfig({ enabled: e.target.checked })}
                aria-label="Enable Generate Report"
              />
              <span className="text-sm font-medium text-slate-800">Enable Generate Report</span>
            </label>
            {templateGenerateReport.enabled ? (
              <p className="mt-1.5 text-xs text-slate-500">
                Use View Factor for per-point Mode / Factor / Min / Max, Round Off, and
                Decimal. Points without a matching config are skipped on Apply. Range span
                (%) uses the same ± band at every point from Range Min/Max.
              </p>
            ) : null}

            {templateGenerateReport.enabled ? (
              <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                      <th className="min-w-[140px] border border-slate-200 px-2 py-2 text-center">
                        Input Column
                      </th>
                      <th className="min-w-[140px] border border-slate-200 px-2 py-2 text-center">
                        Reference Column
                      </th>
                      <th className="min-w-[140px] border border-slate-200 px-2 py-2 text-center">
                        View Factor
                      </th>
                      <th className="w-16 border border-slate-200 px-2 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generateReportRows.map((row, index) => {
                      const isLast = index === generateReportRows.length - 1
                      const availablePointCount = templateRange
                        ? buildViewFactorPointEntriesForGenerateReportRow(
                            row,
                            form.ranges,
                            templateRawDataSheet.columns,
                            templateRange,
                          ).length
                        : undefined
                      const viewFactorLabel = summarizeGenerateReportViewFactor(
                        row,
                        availablePointCount,
                      )
                      return (
                        <tr key={row.id} className="align-middle">
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Select
                              value={row.inputColumnKey || COLUMN_NONE}
                              onValueChange={(value) => {
                                const inputColumnKey = value === COLUMN_NONE ? '' : value
                                const referenceColumnKey =
                                  row.referenceColumnKey === inputColumnKey
                                    ? ''
                                    : row.referenceColumnKey
                                updateGenerateReportRow(row.id, {
                                  inputColumnKey,
                                  referenceColumnKey,
                                })
                              }}
                            >
                              <SelectTrigger
                                id={`cal-eq-report-input-col-${row.id}`}
                                className="h-9"
                                aria-label={`Input column row ${index + 1}`}
                              >
                                <SelectValue placeholder="Select input column" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={COLUMN_NONE}>Select column</SelectItem>
                                {generateReportInputColumns.map((col) => (
                                  <SelectItem key={col.key} value={col.key}>
                                    {col.label || col.key}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Select
                              value={row.referenceColumnKey || COLUMN_NONE}
                              onValueChange={(value) =>
                                updateGenerateReportRow(row.id, {
                                  referenceColumnKey: value === COLUMN_NONE ? '' : value,
                                })
                              }
                            >
                              <SelectTrigger
                                id={`cal-eq-report-ref-col-${row.id}`}
                                className="h-9"
                                aria-label={`Reference column row ${index + 1}`}
                              >
                                <SelectValue placeholder="Select reference column" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={COLUMN_NONE}>Select column</SelectItem>
                                <SelectGroup>
                                  <SelectLabel>Equipment</SelectLabel>
                                  {GENERATE_REPORT_EQUIPMENT_REF_COLUMNS.filter(
                                    (col) => col.key !== row.inputColumnKey,
                                  ).map((col) => (
                                    <SelectItem key={col.key} value={col.key}>
                                      {col.label || col.key}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                                {rawDataSheetColumns.filter(
                                  (col) => col.key !== row.inputColumnKey,
                                ).length > 0 ? (
                                  <SelectGroup>
                                    <SelectLabel>Raw Data Sheet</SelectLabel>
                                    {rawDataSheetColumns
                                      .filter((col) => col.key !== row.inputColumnKey)
                                      .map((col) => (
                                        <SelectItem key={col.key} value={col.key}>
                                          {col.label || col.key}
                                        </SelectItem>
                                      ))}
                                  </SelectGroup>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mx-auto h-9 max-w-[200px] truncate border-slate-300 px-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                              onClick={() => openRandomnessEditor(row)}
                              aria-label={`View Factor row ${index + 1}`}
                              title={viewFactorLabel}
                            >
                              {viewFactorLabel}
                            </Button>
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            {isLast ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mx-auto h-8 w-8 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                                onClick={addGenerateReportRow}
                                aria-label="Add generate report row"
                              >
                                <Plus size={16} />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => removeGenerateReportRow(row.id)}
                                aria-label={`Delete generate report row ${index + 1}`}
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
            ) : null}
          </>
        }
        certificateTemplateContent={
          <>
            <h3 className="text-base font-semibold text-slate-900">
              Template of Calibration Certificate
            </h3>
            <CertificateTemplateEditor
              value={templateCertificate}
              onChange={patchCertificateTemplate}
            />
          </>
        }
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

      <Dialog
        open={randomnessEditorRowId != null}
        onOpenChange={(open) => {
          if (!open) closeRandomnessEditor()
        }}
      >
        <DialogContent
          layer="stacked"
          persistOnFocusLoss
          className={VIEW_FACTOR_FULLSCREEN_DIALOG_CLASS}
          style={VIEW_FACTOR_FULLSCREEN_DIALOG_STYLE}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
            <DialogHeader className="relative pr-28 text-left sm:pr-[22rem]">
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300/90">
                Generate Report
              </p>
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                View Factor — {randomnessEditorInputLabel}
              </DialogTitle>
            </DialogHeader>
            {viewFactorCopySourceOptions.length > 0 ? (
              <div className="absolute right-12 top-1/2 z-10 hidden -translate-y-1/2 sm:right-14 sm:block">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-white/25 bg-white/10 px-2.5 text-[11px] text-white hover:bg-white/20 hover:text-white"
                      aria-label="Copy View Factor data from another Input field"
                    >
                      <Copy size={13} aria-hidden />
                      Copy Data from Another Field
                      <ChevronDown size={12} aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="z-[90] max-h-72 w-72 overflow-y-auto"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
                      Input fields
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {viewFactorCopySourceOptions.map(({ row, label }) => (
                      <DropdownMenuItem
                        key={row.id}
                        className="cursor-pointer"
                        onSelect={() => copyViewFactorFromField(row)}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
            {viewFactorCopySourceOptions.length > 0 ? (
              <div className="mt-2 sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-full gap-1.5 border-white/25 bg-white/10 text-[11px] text-white hover:bg-white/20 hover:text-white"
                      aria-label="Copy View Factor data from another Input field"
                    >
                      <Copy size={13} aria-hidden />
                      Copy Data from Another Field
                      <ChevronDown size={12} aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="z-[90] max-h-72 w-[min(100vw-2rem,18rem)] overflow-y-auto"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
                      Input fields
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {viewFactorCopySourceOptions.map(({ row, label }) => (
                      <DropdownMenuItem
                        key={row.id}
                        className="cursor-pointer"
                        onSelect={() => copyViewFactorFromField(row)}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
            {viewFactorPointEntries.length === 0 ? (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Add Measurement Range points first (Measurement Ranges → Points). View
                Factor can only be set per point.
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full min-w-[1180px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    <th className="min-w-[88px] border border-slate-200 px-2 py-2 text-center">
                      Point
                    </th>
                    <th className="min-w-[110px] border border-slate-200 px-2 py-2 text-center">
                      Reference Value
                    </th>
                    <th className="min-w-[130px] border border-slate-200 px-2 py-2 text-center">
                      Mode
                    </th>
                    <th className="min-w-[100px] border border-slate-200 px-2 py-2 text-center">
                      Randomness Factor
                    </th>
                    <th className="min-w-[72px] border border-slate-200 px-2 py-2 text-center">
                      Min
                    </th>
                    <th className="min-w-[72px] border border-slate-200 px-2 py-2 text-center">
                      Max
                    </th>
                    <th className="min-w-[90px] border border-slate-200 px-2 py-2 text-center">
                      Round Off
                    </th>
                    <th className="min-w-[80px] border border-slate-200 px-2 py-2 text-center">
                      Decimal
                    </th>
                    <th
                      className="min-w-[96px] border border-slate-200 px-2 py-2 text-center"
                      title="Output of Reference Value Minimum"
                    >
                      Output Min
                    </th>
                    <th
                      className="min-w-[96px] border border-slate-200 px-2 py-2 text-center"
                      title="Output of Reference Value Maximum"
                    >
                      Output Max
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {randomnessDraft.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="border border-slate-200 px-3 py-6 text-center text-sm text-slate-500"
                      >
                        No points yet. Add Measurement Range points first.
                      </td>
                    </tr>
                  ) : (
                    randomnessDraft.map((entry, index) => {
                      const mode = parseGenerateReportRandomnessMode(entry.randomnessMode)
                      const referenceValue = String(entry.referenceValue ?? '').trim()
                      const { outputMin, outputMax } = computeGenerateReportOutputMinMaxPreview({
                        referenceRaw: referenceValue,
                        mode,
                        randomnessFactor: entry.randomnessFactor,
                        randomnessFloor: entry.randomnessFloor,
                        randomnessCap: entry.randomnessCap,
                        roundOff: randomnessFormatDraft.roundOff,
                        decimalPlaces: randomnessFormatDraft.decimalPlaces,
                        pointValue: entry.point,
                        ranges: form.ranges,
                        rangeId: entry.rangeId,
                      })
                      return (
                        <tr key={entry.id} className="align-middle">
                          <td className="border border-slate-200 px-2 py-2 text-center text-sm font-medium text-slate-800">
                            {entry.point}
                          </td>
                          <td
                            className="border border-slate-200 px-2 py-2 text-center text-sm text-slate-700"
                            title={referenceValue || 'No reference value'}
                          >
                            {referenceValue || '—'}
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Select
                              value={mode}
                              onValueChange={(value) =>
                                updateRandomnessDraftRow(entry.id, {
                                  randomnessMode: parseGenerateReportRandomnessMode(value),
                                })
                              }
                            >
                              <SelectTrigger
                                id={`cal-eq-report-pt-mode-${entry.id}`}
                                className="h-9"
                                aria-label={`View Factor mode for point ${entry.point}`}
                              >
                                <SelectValue placeholder="Mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percent">Percent (%)</SelectItem>
                                <SelectItem value="absolute">Absolute (±)</SelectItem>
                                <SelectItem value="range_span">Range span (%)</SelectItem>
                                <SelectItem value="range_max">Range max (%)</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Input
                              id={`cal-eq-report-pt-factor-${entry.id}`}
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              placeholder={randomnessFactorPlaceholder(mode)}
                              value={entry.randomnessFactor}
                              onChange={(e) =>
                                updateRandomnessDraftRow(entry.id, {
                                  randomnessFactor: e.target.value,
                                })
                              }
                              className="h-9 text-center"
                              aria-label={randomnessFactorAriaLabel(mode, index)}
                            />
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Input
                              id={`cal-eq-report-pt-floor-${entry.id}`}
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              placeholder="floor"
                              title="Min absolute band (0 = off)"
                              value={entry.randomnessFloor}
                              onChange={(e) =>
                                updateRandomnessDraftRow(entry.id, {
                                  randomnessFloor: e.target.value,
                                })
                              }
                              className="h-9 px-1 text-center"
                              aria-label={`Min absolute band floor for point ${entry.point}`}
                            />
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Input
                              id={`cal-eq-report-pt-cap-${entry.id}`}
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              placeholder="cap"
                              title="Max absolute band (0 = off)"
                              value={entry.randomnessCap}
                              onChange={(e) =>
                                updateRandomnessDraftRow(entry.id, {
                                  randomnessCap: e.target.value,
                                })
                              }
                              className="h-9 px-1 text-center"
                              aria-label={`Max absolute band cap for point ${entry.point}`}
                            />
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Input
                              id={`cal-eq-report-pt-roundoff-${entry.id}`}
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              placeholder="e.g. 0.01"
                              value={randomnessFormatDraft.roundOff}
                              onChange={(e) =>
                                updateRandomnessFormatDraft({ roundOff: e.target.value })
                              }
                              className="h-9 text-center"
                              aria-label={`Round Off for point ${entry.point}`}
                            />
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <Input
                              id={`cal-eq-report-pt-decimal-${entry.id}`}
                              type="number"
                              min={0}
                              max={6}
                              step={1}
                              inputMode="numeric"
                              placeholder="0–6"
                              value={randomnessFormatDraft.decimalPlaces}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                updateRandomnessFormatDraft({
                                  decimalPlaces:
                                    !e.target.value.trim() || !Number.isFinite(n)
                                      ? 0
                                      : Math.max(0, Math.min(6, Math.round(n))),
                                })
                              }}
                              className="h-9 text-center"
                              aria-label={`Decimal places for point ${entry.point}`}
                            />
                          </td>
                          <td
                            className="border border-slate-200 px-2 py-2 text-center text-sm tabular-nums text-slate-700"
                            title="Preview: Reference − band (after Round Off & Decimal)"
                          >
                            {outputMin}
                          </td>
                          <td
                            className="border border-slate-200 px-2 py-2 text-center text-sm tabular-nums text-slate-700"
                            title="Preview: Reference + band (after Round Off & Decimal)"
                          >
                            {outputMax}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <Button type="button" variant="outline" onClick={closeRandomnessEditor}>
              Cancel
            </Button>
            <Button type="button" onClick={saveRandomnessEditor}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
