import { useEffect, useMemo, useState } from 'react'
import { Calculator, ChevronDown, ClipboardList, Copy, FileBarChart, FileSpreadsheet, Plus, Thermometer, Trash2 } from 'lucide-react'
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
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { fetchGenerateReportFeatureEnabled } from '@/features/settings/lab-settings/labSettingsDb'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
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
  resolveRangeModeOfCalibration,
  resolveEquipmentModeOfCalibration,
  resolveRangeMethodUsed,
  resolveEquipmentMethodUsed,
  type CalibrationEquipmentForm,
  type EquipmentRangeEntry,
  type GenerateReportConfig,
  type GenerateReportConfigRow,
  type GenerateReportPointRandomness,
  type GenerateReportRandomnessMode,
} from './types'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { CalibrationRangePointsDialog, type CalibrationPointsDialogSection } from './CalibrationRangePointsDialog'
import {
  allRawDataSheetColumns,
  rawDataSheetPrimaryTableName,
} from '@/features/calibration/rawDataSheetTypes'
import { masterPointsFormulaRefColumns } from '@/features/calibration/masterEquipmentFormulaRefs'
import { RawDataSheetTemplateEditor } from './RawDataSheetTemplateEditor'
import { MuCalculationSheetEditor } from './MuCalculationSheetEditor'
import {
  CertificateFormatButton,
  CertificateFormatDialog,
} from './CertificateFormatDialog'
import { EquipmentChecklistTemplateDialog } from './EquipmentChecklistTemplateDialog'
import {
  equipmentChecklistHasCustomItems,
  type ConductOutsideChecklistKind,
} from '@/features/calibration/handling/jobs/conductOutsideChecklist'
import {
  certificateTemplateIsConfigured,
  serializeCalibrationCertificateTemplate,
} from './certificateTemplateTypes'
import {
  MU_CALIBRATION_POINT_COLUMN,
  MU_EQUIPMENT_RANGE_FIELD_COLUMNS,
  MU_RANGE_MAX_FIELD_KEY,
  MU_RANGE_MIN_FIELD_KEY,
} from './muCalculationTypes'

const COLUMN_NONE = '__none__'

const VIEW_FACTOR_OVERLAY = 'md:inset-y-0 md:left-[268px] md:right-0 md:w-auto'

const VIEW_FACTOR_FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
)

const vfThClass =
  'border border-stone-700 bg-stone-800 px-1 py-2 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.08em] text-amber-200'
const vfTdClass = 'border border-[#e7e0d4] px-1.5 py-1.5 text-center align-middle'

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

const rangeThClass =
  'border border-stone-700 bg-stone-800 px-2 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const rangeTdClass = 'border border-[#e7e0d4] px-2 py-2 text-center'

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
  autoSaveStatus = 'idle',
  onSave,
}: {
  form: CalibrationEquipmentForm
  onChange: (next: CalibrationEquipmentForm) => void
  isCodeOptions: FilterComboboxOption[]
  masterEquipmentOptions: FilterComboboxOption[]
  canSave: boolean
  saveLoading: boolean
  autoSaveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  onSave: () => void
}) {
  const [methodQuery, setMethodQuery] = useState(form.calibrationMethodLabel)
  const [methodOpen, setMethodOpen] = useState(false)
  const [pointsRangeId, setPointsRangeId] = useState<string | null>(null)
  const [pointsDialogSection, setPointsDialogSection] =
    useState<CalibrationPointsDialogSection>('masters')
  const [randomnessEditorRowId, setRandomnessEditorRowId] = useState<string | null>(null)
  const [randomnessDraft, setRandomnessDraft] = useState<GenerateReportPointRandomness[]>([])
  const [randomnessFormatDraft, setRandomnessFormatDraft] = useState<{
    roundOff: string
    decimalPlaces: number
  }>({ roundOff: '', decimalPlaces: 2 })
  const [selectedRangeIds, setSelectedRangeIds] = useState<Set<string>>(() => new Set())
  const [certificateFormatOpen, setCertificateFormatOpen] = useState(false)
  const [checklistKind, setChecklistKind] = useState<ConductOutsideChecklistKind | null>(null)
  const [envConditionOpen, setEnvConditionOpen] = useState(false)
  const [verificationOpen, setVerificationOpen] = useState(false)
  const [companyGenerateReportEnabled, setCompanyGenerateReportEnabled] = useState(true)
  const [accreditationBodies, setAccreditationBodies] = useState<Array<{ id: string; name: string }>>(
    [],
  )

  useEffect(() => {
    setMethodQuery(form.calibrationMethodLabel)
  }, [form.calibrationMethodIsCodeId, form.calibrationMethodLabel])

  useEffect(() => {
    let canceled = false
    void fetchGenerateReportFeatureEnabled(supabase).then((enabled) => {
      if (!canceled) setCompanyGenerateReportEnabled(enabled)
    })
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    let canceled = false
    void (async () => {
      const { data, error } = await supabase
        .from('accreditation_bodies')
        .select('id, name')
        .order('name', { ascending: true })
      if (canceled || error) return
      const list = Array.isArray(data) ? data : []
      setAccreditationBodies(
        list
          .map((row) => ({
            id: String((row as { id?: unknown }).id ?? ''),
            name: String((row as { name?: unknown }).name ?? '').trim(),
          }))
          .filter((row) => row.id && row.name),
      )
    })()
    return () => {
      canceled = true
    }
  }, [])

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
      modeOfCalibration: form.modeOfCalibration,
      methodUsed: form.methodUsed,
    })
  }, [
    pointsRange,
    form.rawDataSheetTemplate,
    form.muCalculationTemplate,
    form.generateReportConfig,
    form.certificateTemplate,
    form.modeOfCalibration,
    form.methodUsed,
  ])

  const templateRawDataSheet = templateRange?.rawDataSheetTemplate ?? form.rawDataSheetTemplate
  const templateMuCalculation = templateRange?.muCalculationTemplate ?? form.muCalculationTemplate
  const templateGenerateReport = templateRange?.generateReportConfig ?? form.generateReportConfig

  /** Raw Data Sheet columns for Certificate Format Results preview (any range with columns). */
  const certificateRawDataColumnLabels = useMemo(() => {
    for (const range of form.ranges) {
      const seeded = seedRangeTemplatesFromEquipment(range, {
        rawDataSheetTemplate: form.rawDataSheetTemplate,
        muCalculationTemplate: form.muCalculationTemplate,
        generateReportConfig: form.generateReportConfig,
        certificateTemplate: form.certificateTemplate,
        modeOfCalibration: form.modeOfCalibration,
        methodUsed: form.methodUsed,
      })
      const cols = seeded.rawDataSheetTemplate
        ? allRawDataSheetColumns(seeded.rawDataSheetTemplate)
        : []
      const labels = cols
        .filter((c) => c.requiredInCertificate !== false)
        .map((c) => String(c.label ?? '').trim())
        .filter(Boolean)
      if (labels.length > 0) return labels
    }
    return allRawDataSheetColumns(form.rawDataSheetTemplate)
      .filter((c) => c.requiredInCertificate !== false)
      .map((c) => String(c.label ?? '').trim())
      .filter(Boolean)
  }, [
    form.ranges,
    form.rawDataSheetTemplate,
    form.muCalculationTemplate,
    form.generateReportConfig,
    form.certificateTemplate,
    form.modeOfCalibration,
    form.methodUsed,
  ])

  const templateModeOfCalibration = resolveRangeModeOfCalibration(
    templateRange,
    form.modeOfCalibration,
  )
  const templateMethodUsed = resolveRangeMethodUsed(templateRange, form.methodUsed)

  const ensureRangeTemplatesSeeded = (rangeId: string) => {
    const range = form.ranges.find((r) => r.id === rangeId)
    if (!range) return
    const seeded = seedRangeTemplatesFromEquipment(range, {
      rawDataSheetTemplate: form.rawDataSheetTemplate,
      muCalculationTemplate: form.muCalculationTemplate,
      generateReportConfig: form.generateReportConfig,
      certificateTemplate: form.certificateTemplate,
      modeOfCalibration: form.modeOfCalibration,
      methodUsed: form.methodUsed,
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
    if (seeded.modeOfCalibration && !(range.modeOfCalibration ?? '').trim()) {
      patch.modeOfCalibration = seeded.modeOfCalibration
    }
    if (seeded.methodUsed && !(range.methodUsed ?? '').trim()) {
      patch.methodUsed = seeded.methodUsed
    }
    if (Object.keys(patch).length > 0) updateRange(rangeId, patch)
  }

  const openPointsForRange = (rangeId: string, section: CalibrationPointsDialogSection = 'masters') => {
    ensureRangeTemplatesSeeded(rangeId)
    setPointsDialogSection(section)
    setPointsRangeId(rangeId)
  }

  const hasAnyRangeMaster = useMemo(
    () =>
      form.ranges.some((range) => {
        const fromIds = (range.masterEquipmentIds ?? []).some((id) => id.trim())
        if (fromIds) return true
        return (range.masterPointsTabs ?? []).some((tab) => tab.masterEquipmentId.trim())
      }),
    [form.ranges],
  )

  const openTemplateSection = (
    section: 'rawSheet' | 'muSheet' | 'generateReport' | 'modeOfCalibration',
  ) => {
    const rangeWithMaster = form.ranges.find((range) => {
      if ((range.masterEquipmentIds ?? []).some((id) => id.trim())) return true
      return (range.masterPointsTabs ?? []).some((tab) => tab.masterEquipmentId.trim())
    })
    const rangeId =
      pointsRangeId ??
      (section === 'rawSheet' ? rangeWithMaster?.id : null) ??
      form.ranges[0]?.id ??
      null
    if (!rangeId) return
    if (section === 'generateReport') {
      updateRange(rangeId, {
        generateReportConfig: {
          ...(form.ranges.find((r) => r.id === rangeId)?.generateReportConfig ??
            templateGenerateReport),
          enabled: true,
        },
      })
    }
    openPointsForRange(rangeId, section)
  }

  /** Input Column may target any sheet column (including formula). */
  const generateReportInputColumns = useMemo(
    () => allRawDataSheetColumns(templateRawDataSheet),
    [templateRawDataSheet],
  )

  /** Every Raw Data table column (number / text / calculated), grouped by table. */
  const rawDataRefColumnGroups = useMemo(() => {
    const groups: Array<{ label: string; columns: typeof templateRawDataSheet.columns }> = []
    const primary = templateRawDataSheet.columns.filter((c) => c.key.trim())
    if (primary.length > 0) {
      groups.push({
        label: rawDataSheetPrimaryTableName(templateRawDataSheet),
        columns: primary,
      })
    }
    for (const table of templateRawDataSheet.extraTables ?? []) {
      const columns = table.columns.filter((c) => c.key.trim())
      if (columns.length === 0) continue
      groups.push({
        label: String(table.name ?? '').trim() || 'Additional table',
        columns,
      })
    }
    return groups
  }, [templateRawDataSheet])

  const patchGenerateReportConfig = (patch: Partial<GenerateReportConfig>) => {
    if (!pointsRangeId) return
    updateRange(pointsRangeId, {
      generateReportConfig: { ...templateGenerateReport, ...patch, enabled: true },
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
      generateReportInputColumns,
      templateRange,
    )
  }, [randomnessEditorRow, form.ranges, generateReportInputColumns, templateRange])

  const openRandomnessEditor = (row: GenerateReportConfigRow) => {
    if (!templateRange) return
    const entries = buildViewFactorPointEntriesForGenerateReportRow(
      row,
      form.ranges,
      generateReportInputColumns,
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
      generateReportInputColumns,
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
    <>
    <div
      className={cn(
        labRegistryFormClass,
        'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
      )}
    >
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
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

          <div className="overflow-x-auto rounded-none border-2 border-stone-400 bg-white">
            <table className="w-full min-w-[1020px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(rangeThClass, 'w-10 text-center')}>
                    <input
                      type="checkbox"
                      className="mx-auto block h-4 w-4 accent-amber-700"
                      checked={allRangesSelected}
                      onChange={(e) => toggleAllRanges(e.target.checked)}
                      aria-label="Select all ranges"
                    />
                  </th>
                  <th className={cn(rangeThClass, 'w-12 text-center')}>S.No</th>
                  <th className={cn(rangeThClass, 'min-w-[110px] text-center')}>
                    Range Minimum
                  </th>
                  <th className={cn(rangeThClass, 'min-w-[110px] text-center')}>
                    Range Maximum
                  </th>
                  <th className={cn(rangeThClass, 'min-w-[100px] text-center')}>
                    Least Count
                  </th>
                  <th className={cn(rangeThClass, 'min-w-[90px] text-center')}>Accuracy</th>
                  <th className={cn(rangeThClass, 'min-w-[110px] text-center')}>Unit</th>
                  <th className={cn(rangeThClass, 'min-w-[140px] text-center')}>
                    Accreditation
                    <br />
                    Scope
                  </th>
                  <th className={cn(rangeThClass, 'w-28 text-center')}>Point</th>
                  <th className={cn(rangeThClass, 'w-16 text-center')}>Action</th>
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
                  const rowSelected = selectedRangeIds.has(range.id)
                  return (
                    <tr
                      key={range.id}
                      className={cn(
                        'align-middle',
                        rowSelected
                          ? 'bg-[#fde68a]/80'
                          : index % 2 === 0
                            ? 'bg-[#f7f3eb]'
                            : 'bg-[#fffcf7]',
                      )}
                    >
                      <td className={rangeTdClass}>
                        <input
                          type="checkbox"
                          className="mx-auto block h-4 w-4 accent-amber-700"
                          checked={rowSelected}
                          onChange={() => toggleRange(range.id)}
                          aria-label={`Select range ${index + 1}`}
                        />
                      </td>
                      <td className={cn(rangeTdClass, 'text-stone-500')}>{index + 1}</td>
                      <td className={rangeTdClass}>
                        <Input
                          id={`cal-eq-range-min-${range.id}`}
                          placeholder="e.g. 0"
                          value={range.rangeMin}
                          onChange={(e) =>
                            updateRange(range.id, { rangeMin: e.target.value })
                          }
                          className="!h-8 text-center"
                          aria-label={`Range minimum ${index + 1}`}
                        />
                      </td>
                      <td className={rangeTdClass}>
                        <Input
                          id={`cal-eq-range-max-${range.id}`}
                          placeholder="e.g. 300"
                          value={range.rangeMax}
                          onChange={(e) =>
                            updateRange(range.id, { rangeMax: e.target.value })
                          }
                          className="!h-8 text-center"
                          aria-label={`Range maximum ${index + 1}`}
                        />
                      </td>
                      <td className={rangeTdClass}>
                        <Input
                          id={`cal-eq-res-${range.id}`}
                          placeholder="e.g. 0.02"
                          value={range.resolutionLeastCount}
                          onChange={(e) =>
                            updateRange(range.id, { resolutionLeastCount: e.target.value })
                          }
                          className="!h-8 text-center"
                          aria-label={`Least count ${index + 1}`}
                        />
                      </td>
                      <td className={rangeTdClass}>
                        <Input
                          id={`cal-eq-acc-${range.id}`}
                          placeholder="e.g. ±0.02"
                          value={range.accuracy}
                          onChange={(e) => updateRange(range.id, { accuracy: e.target.value })}
                          className="!h-8 text-center"
                          aria-label={`Accuracy ${index + 1}`}
                        />
                      </td>
                      <td className={rangeTdClass}>
                        <MeasurementUnitSelect
                          id={`cal-eq-unit-${range.id}`}
                          value={range.unit}
                          onChange={(unit) => updateRange(range.id, { unit })}
                          showLabel={false}
                          showManageButton
                          placeholder="Unit"
                          className="mx-auto w-full"
                          inputClassName="!h-8 text-center"
                          shellClassName="!h-8"
                        />
                      </td>
                      <td className={rangeTdClass}>
                        <Select
                          value={range.accreditationScopeId || COLUMN_NONE}
                          onValueChange={(v) =>
                            updateRange(range.id, {
                              accreditationScopeId: v === COLUMN_NONE ? '' : v,
                            })
                          }
                        >
                          <SelectTrigger
                            id={`cal-eq-accr-scope-${range.id}`}
                            className="mx-auto !h-8 w-full"
                            aria-label={`Accreditation scope ${index + 1}`}
                          >
                            <SelectValue placeholder="Select scope" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={COLUMN_NONE}>—</SelectItem>
                            {accreditationBodies.map((body) => (
                              <SelectItem key={body.id} value={body.id}>
                                {body.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={rangeTdClass}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            'mx-auto h-8 gap-1.5 px-2 text-xs font-medium',
                            limsOutlineBtnClass,
                          )}
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
                            <span className="rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              {pointCount}
                            </span>
                          ) : null}
                          {masterCount > 0 ? (
                            <span className="rounded-none bg-stone-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">
                              M{masterCount}
                            </span>
                          ) : null}
                        </Button>
                      </td>
                      <td className={rangeTdClass}>
                        {isLast ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mx-auto h-8 w-8 px-0 text-amber-800 hover:bg-amber-500/15 hover:text-amber-950"
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

          <div className="overflow-hidden rounded-none border-2 border-stone-700 bg-[#f7f3eb]">
            <div className="grid grid-cols-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-8 min-w-0 justify-center rounded-none border-0 border-r border-b border-stone-500 px-2 text-xs shadow-none',
                limsOutlineBtnClass,
              )}
              disabled={!hasAnyRangeMaster}
              onClick={() => openTemplateSection('rawSheet')}
              aria-label="Raw Data Sheet Format"
              title={
                hasAnyRangeMaster
                  ? undefined
                  : 'Select a master on at least one range (Points) first'
              }
            >
              <FileSpreadsheet size={14} className="mr-1.5 shrink-0 text-amber-800" />
              <span className="truncate">Raw Data Sheet Format</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-8 min-w-0 justify-center rounded-none border-0 border-r border-b border-stone-500 px-2 text-xs shadow-none',
                limsOutlineBtnClass,
              )}
              disabled={form.ranges.length === 0}
              onClick={() => openTemplateSection('muSheet')}
              aria-label="MU Calculation Sheet"
            >
              <Calculator size={14} className="mr-1.5 shrink-0 text-amber-800" />
              <span className="truncate">MU Calculation Sheet</span>
            </Button>
            {companyGenerateReportEnabled ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  'relative h-8 min-w-0 justify-center rounded-none border-0 border-b border-stone-500 px-2 text-xs shadow-none sm:border-r-0',
                  limsOutlineBtnClass,
                )}
                disabled={form.ranges.length === 0}
                onClick={() => openTemplateSection('generateReport')}
                aria-label="Generate Report Format"
              >
                <FileBarChart size={14} className="mr-1.5 shrink-0 text-amber-800" />
                <span className="truncate">Generate Report Format</span>
              </Button>
            ) : null}
            <CertificateFormatButton
              configured={certificateTemplateIsConfigured(form.certificateTemplate)}
              onClick={() => setCertificateFormatOpen(true)}
              className={cn(
                'h-8 min-w-0 justify-center rounded-none border-0 border-r border-b border-stone-500 px-2 text-xs shadow-none sm:border-b-0',
                limsOutlineBtnClass,
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'relative h-8 min-w-0 justify-center rounded-none border-0 border-r border-stone-500 px-2 text-xs shadow-none',
                limsOutlineBtnClass,
              )}
              onClick={() => setChecklistKind('outgoing')}
              aria-label="Outgoing Checklist"
            >
              <ClipboardList size={14} className="mr-1.5 shrink-0 text-amber-800" />
              <span className="truncate">Outgoing Checklist</span>
              {equipmentChecklistHasCustomItems(form.outgoingChecklist) ? (
                <span
                  className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                  aria-hidden
                  title="Outgoing checklist configured"
                />
              ) : null}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'relative h-8 min-w-0 justify-center rounded-none border-0 px-2 text-xs shadow-none',
                limsOutlineBtnClass,
              )}
              onClick={() => setChecklistKind('inward')}
              aria-label="Inward Checklist"
            >
              <ClipboardList size={14} className="mr-1.5 shrink-0 text-amber-800" />
              <span className="truncate">Inward Checklist</span>
              {equipmentChecklistHasCustomItems(form.inwardChecklist) ? (
                <span
                  className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                  aria-hidden
                  title="Inward checklist configured"
                />
              ) : null}
            </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto border-t border-stone-300 bg-white px-4 py-3 sm:gap-2 sm:px-6">
        <span className="text-[11px] text-stone-500" aria-live="polite">
          {autoSaveStatus === 'saving'
            ? 'Saving…'
            : autoSaveStatus === 'saved'
              ? 'Saved'
              : autoSaveStatus === 'error'
                ? 'Save failed'
                : null}
        </span>
        <Button
          type="button"
          size="sm"
          className={cn('h-9 shrink-0', limsPrimaryBtnClass)}
          onClick={onSave}
          disabled={!canSave || saveLoading}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>

      <EquipmentChecklistTemplateDialog
        open={checklistKind != null}
        onOpenChange={(open) => {
          if (!open) setChecklistKind(null)
        }}
        kind={checklistKind ?? 'outgoing'}
        equipmentName={form.equipmentName}
        items={checklistKind === 'inward' ? form.inwardChecklist : form.outgoingChecklist}
        onSave={(items) => {
          if (checklistKind === 'inward') set('inwardChecklist', items)
          else set('outgoingChecklist', items)
        }}
      />

      <CertificateFormatDialog
        open={certificateFormatOpen}
        onOpenChange={setCertificateFormatOpen}
        value={form.certificateTemplate}
        equipmentName={form.equipmentName}
        rawDataColumnLabels={certificateRawDataColumnLabels}
        onChange={(certificateTemplate) => {
          onChange({
            ...form,
            certificateTemplate: serializeCalibrationCertificateTemplate(certificateTemplate),
          })
        }}
      />

      <CalibrationRangePointsDialog
        open={pointsRangeId != null && pointsRange != null}
        initialSection={pointsDialogSection}
        onOpenChange={(open) => {
          if (!open) {
            setPointsRangeId(null)
            setPointsDialogSection('masters')
            setEnvConditionOpen(false)
            setVerificationOpen(false)
            closeRandomnessEditor()
          }
        }}
        rangeLabel={pointsRange?.rangeCapacity?.trim() || 'Range'}
        unit={pointsRange?.unit ?? ''}
        pointsTable={pointsRange?.calibrationPointsTable ?? emptyCalibrationPointsTable()}
        masterEquipmentIds={pointsRange?.masterEquipmentIds ?? []}
        masterPointsTabs={pointsRange?.masterPointsTabs}
        masterEquipmentOptions={masterEquipmentOptions ?? []}
        modeOfCalibrationConfigured={Boolean(
          templateModeOfCalibration.trim() || templateMethodUsed.trim(),
        )}
        rawSheetContent={(live) => (
            <RawDataSheetTemplateEditor
              value={templateRawDataSheet}
              masterEquipmentIds={live.masterEquipmentIds}
              masterPointsTables={live.masterPointsTables}
              environmentDialogOpen={envConditionOpen}
              onEnvironmentDialogOpenChange={setEnvConditionOpen}
              verificationDialogOpen={verificationOpen}
              onVerificationDialogOpenChange={setVerificationOpen}
              onChange={(rawDataSheetTemplate) => {
                if (!pointsRangeId) return
                updateRange(pointsRangeId, { rawDataSheetTemplate })
              }}
            />
        )}
        rawSheetFooterActions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn('h-9', limsOutlineBtnClass)}
              onClick={() => setVerificationOpen(true)}
            >
              <ClipboardList size={16} className="mr-1.5" aria-hidden />
              Verification Checklist
              {templateRawDataSheet.verification.items.length > 0 ? (
                <span className="ml-1.5 rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  {templateRawDataSheet.verification.items.length}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn('h-9', limsOutlineBtnClass)}
              onClick={() => setEnvConditionOpen(true)}
            >
              <Thermometer size={16} className="mr-1.5" aria-hidden />
              Environment Condition
              {(templateRawDataSheet.environmentDefaults?.parameterColumns?.length ?? 0) > 0 ? (
                <span className="ml-1.5 rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  {templateRawDataSheet.environmentDefaults?.parameterColumns?.length}
                </span>
              ) : null}
            </Button>
          </div>
        }
        muSheetContent={
          <>
            <MuCalculationSheetEditor
              value={templateMuCalculation}
              rawDataSheetColumns={allRawDataSheetColumns(templateRawDataSheet)}
              onChange={(muCalculationTemplate) => {
                if (!pointsRangeId) return
                updateRange(pointsRangeId, { muCalculationTemplate })
              }}
            />
          </>
        }
        generateReportContent={(live) => {
          const masterPointRefColumns = masterPointsFormulaRefColumns(live.masterPointsTables)
          return (
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
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
                            generateReportInputColumns,
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
                                {masterPointRefColumns.length > 0 ? (
                                  <SelectGroup>
                                    <SelectLabel>Calibration Points</SelectLabel>
                                    {masterPointRefColumns
                                      .filter((col) => col.key !== row.inputColumnKey)
                                      .map((col) => (
                                        <SelectItem key={col.key} value={col.key}>
                                          {col.label || col.key}
                                        </SelectItem>
                                      ))}
                                  </SelectGroup>
                                ) : null}
                                {rawDataRefColumnGroups.map((group) => {
                                  const cols = group.columns.filter(
                                    (col) => col.key !== row.inputColumnKey,
                                  )
                                  if (cols.length === 0) return null
                                  return (
                                    <SelectGroup key={group.label}>
                                      <SelectLabel>{group.label}</SelectLabel>
                                      {cols.map((col) => (
                                        <SelectItem key={col.key} value={col.key}>
                                          {col.label.trim() || 'Untitled column'}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  )
                                })}
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
          )
        }}
        modeOfCalibrationContent={
          <>
            <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mode-of-calibration-input">Mode of Calibration</Label>
                <Input
                  id="mode-of-calibration-input"
                  value={templateModeOfCalibration}
                  onChange={(e) => {
                    const next = e.target.value
                    if (!pointsRangeId) return
                    const nextRanges = form.ranges.map((r) =>
                      r.id === pointsRangeId ? { ...r, modeOfCalibration: next } : r,
                    )
                    onChange({
                      ...form,
                      ranges: nextRanges,
                      modeOfCalibration: resolveEquipmentModeOfCalibration(nextRanges, next),
                    })
                  }}
                  placeholder="e.g. Tension / Compression / Both"
                  aria-label="Mode of Calibration"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="method-used-input">Method Used</Label>
                <Input
                  id="method-used-input"
                  value={templateMethodUsed}
                  onChange={(e) => {
                    const next = e.target.value
                    if (!pointsRangeId) return
                    const nextRanges = form.ranges.map((r) =>
                      r.id === pointsRangeId ? { ...r, methodUsed: next } : r,
                    )
                    onChange({
                      ...form,
                      ranges: nextRanges,
                      methodUsed: resolveEquipmentMethodUsed(nextRanges, next),
                    })
                  }}
                  placeholder="e.g. Direct comparison"
                  aria-label="Method Used"
                />
              </div>
            </div>
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
          overlayClassName={VIEW_FACTOR_OVERLAY}
          className={VIEW_FACTOR_FULLSCREEN_DIALOG_CLASS}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-28 text-left sm:pr-[22rem]">
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
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            {viewFactorPointEntries.length === 0 ? (
              <p className="mb-3 rounded-none border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Add Measurement Range points first (Measurement Ranges → Points). View
                Factor can only be set per point.
              </p>
            ) : null}
            <div className="overflow-hidden rounded-none border-2 border-stone-400 bg-white">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(vfThClass, 'w-[8%]')}>Point</th>
                    <th className={cn(vfThClass, 'w-[10%]')}>Reference Value</th>
                    <th className={cn(vfThClass, 'w-[14%]')}>Mode</th>
                    <th className={cn(vfThClass, 'w-[12%]')}>Randomness Factor</th>
                    <th className={cn(vfThClass, 'w-[8%]')}>Min</th>
                    <th className={cn(vfThClass, 'w-[8%]')}>Max</th>
                    <th className={cn(vfThClass, 'w-[10%]')}>Round Off</th>
                    <th className={cn(vfThClass, 'w-[8%]')}>Decimal</th>
                    <th
                      className={cn(vfThClass, 'w-[11%]')}
                      title="Output of Reference Value Minimum"
                    >
                      Output Min
                    </th>
                    <th
                      className={cn(vfThClass, 'w-[11%]')}
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
                        className="border border-[#e7e0d4] bg-[#fffcf7] px-3 py-6 text-center text-sm text-stone-500"
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
                        <tr
                          key={entry.id}
                          className={index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}
                        >
                          <td className={cn(vfTdClass, 'font-medium text-stone-800')}>
                            {entry.point}
                          </td>
                          <td
                            className={cn(vfTdClass, 'text-stone-700')}
                            title={referenceValue || 'No reference value'}
                          >
                            {referenceValue || '—'}
                          </td>
                          <td className={vfTdClass}>
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
                          <td className={vfTdClass}>
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
                          <td className={vfTdClass}>
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
                          <td className={vfTdClass}>
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
                          <td className={vfTdClass}>
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
                          <td className={vfTdClass}>
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
                            className={cn(vfTdClass, 'tabular-nums text-stone-700')}
                            title="Preview: Reference − band (after Round Off & Decimal)"
                          >
                            {outputMin}
                          </td>
                          <td
                            className={cn(vfTdClass, 'tabular-nums text-stone-700')}
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
          <DialogFooter className="shrink-0 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
            <Button type="button" className={limsPrimaryBtnClass} onClick={saveRandomnessEditor}>
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
