import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatDate } from '@/lib/utils'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  parseCalibrationPointsTable,
  emptyCalibrationPointRow,
  newCalibrationPointId,
  type CalibrationPointRow,
} from '@/features/calibration/equipment-for-calibration/types'
import { computeCalibrationPointRowValuesFromMaster } from '@/features/calibration/equipment-for-calibration/calibrationPointsFormula'
import type { MasterFormulaRefSource } from '@/features/calibration/masterEquipmentFormulaRefs'
import { supabase } from '@/lib/supabaseClient'
import {
  emptyCalibrationPointsTable,
  emptyMasterPointsTab,
  masterEquipmentIdsFromTabs,
  primaryCalibrationPointsTable,
  singleColumnPointsTable,
  type CalibrationPointsStored,
  type MasterPointsTab,
} from './types'

export type RawSheetLiveMasterRefs = {
  masterEquipmentIds: string[]
  masterPointsTables: Array<{ columns: Array<{ header: string }> }>
}

export type CalibrationPointsDialogSection =
  | 'masters'
  | 'rawSheet'
  | 'muSheet'
  | 'generateReport'
  | 'modeOfCalibration'

const FULLSCREEN_OVERLAY = 'md:inset-y-0 md:left-[268px] md:right-0 md:w-auto'

const mastersThClass =
  'border border-stone-700 bg-stone-800 px-1.5 py-2 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.08em] text-amber-200'
const mastersTdClass = 'border border-[#e7e0d4] px-2 py-2 text-center align-middle'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
)

type DueStatus = 'valid' | 'dueSoon' | 'overdue' | 'notSet'

type MasterEquipmentMeta = {
  assetCode: string
  equipmentName: string
  serialNumber: string
  equipmentStatus: string
  currentLocation: string
  manufacturer: string
  modelNumber: string
  classOfInstrument: string
  modeOfCalibration: string
  rangeCapacity: string
  resolutionLeastCount: string
  accuracyAcceptanceCriteria: string
  calibrationFrequency: string
  lastCalibrationDate: string
  nextCalibrationDue: string
  nextCalibrationDueRaw: string | null
  calibrationCertificateNumber: string
  uncertainty: string
  calibrationCoverageFactor: string
  externalCalibrationAgencyName: string
  intermediateCheckFrequency: string
  lastIntermediateCheckDate: string
  nextIntermediateCheckDate: string
  nextIntermediateCheckDateRaw: string | null
  intermediateCheckResult: string
  intermediateCheckPerformedBy: string
  maintenanceScheduleFrequency: string
  lastMaintenanceDate: string
  nextMaintenanceDate: string
  nextMaintenanceDateRaw: string | null
  maintenanceDoneBy: string
  /** Raw fields for calculated calibration-point formulas. */
  formulaRef: MasterFormulaRefSource
}

function displayMetaValue(value: string | null | undefined): string {
  const v = String(value ?? '').trim()
  return v || '—'
}

function formatMetaDate(value: string | null | undefined): string {
  return formatDate(value)
}

/** Deep-clone a table with fresh row ids so imports never share references. */
function cloneTableWithFreshRowIds(table: CalibrationPointsStored): CalibrationPointsStored {
  return {
    columns: table.columns.map((c) => ({ ...c })),
    rows: table.rows.map((r) => ({
      id: newCalibrationPointId(),
      values: { ...r.values },
    })),
  }
}

function tableHasPointValues(table: CalibrationPointsStored): boolean {
  return table.rows.some((r) =>
    Object.values(r.values).some((v) => String(v ?? '').trim().length > 0),
  )
}

function formatMasterUncertainty(
  value: string | null | undefined,
  unit: string | null | undefined,
): string {
  const v = String(value ?? '').trim()
  if (!v) return '—'
  const u = String(unit ?? '').trim()
  return u ? `${v} ${u}` : v
}

function isDueSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const due = new Date(dateStr)
  if (Number.isNaN(due.getTime())) return false
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays <= 30 && diffDays >= 0
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const due = new Date(dateStr)
  if (Number.isNaN(due.getTime())) return false
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return due.getTime() < now.getTime()
}

function computeDueStatus(dateStr: string | null | undefined): DueStatus {
  const v = String(dateStr ?? '').trim()
  if (!v) return 'notSet'
  if (isOverdue(v)) return 'overdue'
  if (isDueSoon(v)) return 'dueSoon'
  return 'valid'
}

const DUE_STATUS_LABEL: Record<DueStatus, string> = {
  valid: 'Valid',
  dueSoon: 'Due Soon',
  overdue: 'Overdue',
  notSet: 'Not set',
}

const DUE_STATUS_CLASS: Record<DueStatus, string> = {
  valid:
    'border-emerald-200 bg-emerald-50 text-emerald-700',
  dueSoon:
    'border-amber-200 bg-amber-50 text-amber-700',
  overdue:
    'border-rose-200 bg-rose-50 text-rose-700',
  notSet:
    'border-slate-200 bg-slate-50 text-slate-500',
}

function DueStatusBadge({ status }: { status: DueStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        DUE_STATUS_CLASS[status],
      )}
    >
      {DUE_STATUS_LABEL[status]}
    </span>
  )
}

function MetaField({
  label,
  value,
  className,
  badge,
}: {
  label: string
  value: string
  className?: string
  badge?: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2',
        className,
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-800">{value}</p>
        {badge}
      </div>
    </div>
  )
}

function MetaSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="border-t border-slate-200 px-4 py-4">
      <h3 className="mb-3 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

/** Load one master's check-point table AS-IS from equipment_for_calibration. */
async function fetchSingleMasterTable(
  masterId: string,
): Promise<CalibrationPointsStored | null> {
  const id = masterId.trim()
  if (!id) return null

  const { data, error } = await supabase
    .from('equipment_for_calibration')
    .select('id, calibration_points')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const table = parseCalibrationPointsTable(
    (data as { calibration_points: unknown }).calibration_points,
  )
  if (table.columns.length === 0 || table.rows.length === 0) return null
  return cloneTableWithFreshRowIds(table)
}

async function fetchMasterMetadataMap(
  ids: string[],
): Promise<Map<string, MasterEquipmentMeta>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return new Map()

  const { data, error } = await supabase
    .from('equipment_for_calibration')
    .select(
      'id, asset_code, equipment_name, serial_number, equipment_status, current_location, manufacturer, model_number, mode_of_calibration, class_of_instrument, range_capacity, resolution_least_count, accuracy_acceptance_criteria, calibration_frequency, last_calibration_date, next_calibration_due, calibration_certificate_number, calibration_certificate_uncertainty, calibration_uncertainty_unit, calibration_coverage_factor, external_calibration_agency_name, calibration_temperature, calibration_humidity, coefficient_of_thermal_expansion, intermediate_check_frequency, last_intermediate_check_date, next_intermediate_check_date, intermediate_check_result, intermediate_check_performed_by, maintenance_schedule_frequency, last_maintenance_date, next_maintenance_date, maintenance_done_by',
    )
    .in('id', unique)
  if (error) throw error

  const map = new Map<string, MasterEquipmentMeta>()
  for (const row of (data ?? []) as Array<{
    id: string
    asset_code: string | null
    equipment_name: string | null
    serial_number: string | null
    equipment_status: string | null
    current_location: string | null
    manufacturer: string | null
    model_number: string | null
    mode_of_calibration: string | null
    class_of_instrument: string | null
    range_capacity: string | null
    resolution_least_count: string | null
    accuracy_acceptance_criteria: string | null
    calibration_frequency: string | null
    last_calibration_date: string | null
    next_calibration_due: string | null
    calibration_certificate_number: string | null
    calibration_certificate_uncertainty: string | null
    calibration_uncertainty_unit: string | null
    calibration_coverage_factor: string | null
    external_calibration_agency_name: string | null
    calibration_temperature: string | null
    calibration_humidity: string | null
    coefficient_of_thermal_expansion: string | null
    intermediate_check_frequency: string | null
    last_intermediate_check_date: string | null
    next_intermediate_check_date: string | null
    intermediate_check_result: string | null
    intermediate_check_performed_by: string | null
    maintenance_schedule_frequency: string | null
    last_maintenance_date: string | null
    next_maintenance_date: string | null
    maintenance_done_by: string | null
  }>) {
    map.set(row.id, {
      assetCode: displayMetaValue(row.asset_code),
      equipmentName: displayMetaValue(row.equipment_name),
      serialNumber: displayMetaValue(row.serial_number),
      equipmentStatus: displayMetaValue(row.equipment_status),
      currentLocation: displayMetaValue(row.current_location),
      manufacturer: displayMetaValue(row.manufacturer),
      modelNumber: displayMetaValue(row.model_number),
      classOfInstrument: displayMetaValue(row.class_of_instrument),
      modeOfCalibration: displayMetaValue(row.mode_of_calibration),
      rangeCapacity: displayMetaValue(row.range_capacity),
      resolutionLeastCount: displayMetaValue(row.resolution_least_count),
      accuracyAcceptanceCriteria: displayMetaValue(row.accuracy_acceptance_criteria),
      calibrationFrequency: displayMetaValue(row.calibration_frequency),
      lastCalibrationDate: formatMetaDate(row.last_calibration_date),
      nextCalibrationDue: formatMetaDate(row.next_calibration_due),
      nextCalibrationDueRaw: row.next_calibration_due,
      calibrationCertificateNumber: displayMetaValue(row.calibration_certificate_number),
      uncertainty: formatMasterUncertainty(
        row.calibration_certificate_uncertainty,
        row.calibration_uncertainty_unit,
      ),
      calibrationCoverageFactor: displayMetaValue(row.calibration_coverage_factor),
      externalCalibrationAgencyName: displayMetaValue(row.external_calibration_agency_name),
      intermediateCheckFrequency: displayMetaValue(row.intermediate_check_frequency),
      lastIntermediateCheckDate: formatMetaDate(row.last_intermediate_check_date),
      nextIntermediateCheckDate: formatMetaDate(row.next_intermediate_check_date),
      nextIntermediateCheckDateRaw: row.next_intermediate_check_date,
      intermediateCheckResult: displayMetaValue(row.intermediate_check_result),
      intermediateCheckPerformedBy: displayMetaValue(row.intermediate_check_performed_by),
      maintenanceScheduleFrequency: displayMetaValue(row.maintenance_schedule_frequency),
      lastMaintenanceDate: formatMetaDate(row.last_maintenance_date),
      nextMaintenanceDate: formatMetaDate(row.next_maintenance_date),
      nextMaintenanceDateRaw: row.next_maintenance_date,
      maintenanceDoneBy: displayMetaValue(row.maintenance_done_by),
      formulaRef: {
        asset_code: row.asset_code,
        equipment_name: row.equipment_name,
        manufacturer: row.manufacturer,
        model_number: row.model_number,
        serial_number: row.serial_number,
        range_capacity: row.range_capacity,
        resolution_least_count: row.resolution_least_count,
        accuracy_acceptance_criteria: row.accuracy_acceptance_criteria,
        class_of_instrument: row.class_of_instrument,
        calibration_temperature: row.calibration_temperature,
        calibration_humidity: row.calibration_humidity,
        coefficient_of_thermal_expansion: row.coefficient_of_thermal_expansion,
        calibration_certificate_uncertainty: row.calibration_certificate_uncertainty,
        calibration_coverage_factor: row.calibration_coverage_factor,
        calibration_certificate_number: row.calibration_certificate_number,
      },
    })
  }
  return map
}

function buildInitialTabs(
  masterPointsTabs: MasterPointsTab[] | undefined,
  masterEquipmentIds: string[],
  pointsTable: CalibrationPointsStored,
): MasterPointsTab[] {
  if (masterPointsTabs && masterPointsTabs.length > 0) {
    return masterPointsTabs.map((tab, index) => ({
      id: tab.id || `tab-${index}-${Date.now()}`,
      masterEquipmentId: tab.masterEquipmentId,
      calibrationPointsTable:
        tab.calibrationPointsTable.columns.length > 0
          ? cloneTableWithFreshRowIds(tab.calibrationPointsTable)
          : emptyCalibrationPointsTable(),
    }))
  }

  if (masterEquipmentIds.length > 0) {
    return masterEquipmentIds.map((id, index) => ({
      id: `tab-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      masterEquipmentId: id,
      calibrationPointsTable:
        index === 0 && pointsTable.columns.length > 0
          ? cloneTableWithFreshRowIds(pointsTable)
          : emptyCalibrationPointsTable(),
    }))
  }

  if (pointsTable.columns.length > 0) {
    return [
      {
        id: `tab-0-${Date.now()}`,
        masterEquipmentId: '',
        calibrationPointsTable: cloneTableWithFreshRowIds(pointsTable),
      },
    ]
  }

  return [emptyMasterPointsTab()]
}

function masterLabelForTab(
  tab: MasterPointsTab,
  index: number,
  options: FilterComboboxOption[],
): string {
  if (tab.masterEquipmentId.trim()) {
    return (
      options.find((o) => o.id === tab.masterEquipmentId)?.label ?? tab.masterEquipmentId
    )
  }
  return `Master ${index + 1}`
}

function MasterEquipmentNameCell({
  tabId,
  masterEquipmentId,
  options,
  usedMasterIds,
  masterMetadata,
  onSelectMaster,
}: {
  tabId: string
  masterEquipmentId: string
  options: FilterComboboxOption[]
  usedMasterIds: Set<string>
  masterMetadata: Map<string, MasterEquipmentMeta>
  onSelectMaster: (tabId: string, masterId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedLabel = useMemo(() => {
    if (!masterEquipmentId.trim()) return ''
    const fromOption = options.find((o) => o.id === masterEquipmentId)?.label
    if (fromOption) return fromOption
    const fromMeta = masterMetadata.get(masterEquipmentId)?.equipmentName
    if (fromMeta && fromMeta !== '—') return fromMeta
    return masterEquipmentId
  }, [masterEquipmentId, options, masterMetadata])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter((opt) => {
      if (usedMasterIds.has(opt.id) && opt.id !== masterEquipmentId) return false
      if (!q) return true
      if (opt.label.toLowerCase().includes(q)) return true
      const assetCode = masterMetadata.get(opt.id)?.assetCode ?? ''
      if (assetCode && assetCode !== '—' && assetCode.toLowerCase().includes(q)) return true
      return false
    })
  }, [options, query, usedMasterIds, masterEquipmentId, masterMetadata])

  return (
    <FilterCombobox
      value={open ? query : selectedLabel}
      onValueChange={(v) => {
        setQuery(v)
        if (!open) setOpen(true)
        if (!v.trim() && masterEquipmentId) {
          onSelectMaster(tabId, '')
        }
      }}
      options={filteredOptions}
      onSelectOption={(opt) => {
        onSelectMaster(tabId, opt.id)
        setQuery(opt.label)
        setOpen(false)
      }}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) setQuery(selectedLabel)
      }}
      placeholder="Type to search master equipment…"
      listId={`master-eq-list-${tabId}`}
      inputClassName="h-9"
    />
  )
}

function CalibrationPointsTableEditor({
  table,
  onChange,
  masterRef = null,
}: {
  table: CalibrationPointsStored
  onChange: (next: CalibrationPointsStored) => void
  /** Master equipment fields for Calculated column formulas. */
  masterRef?: MasterFormulaRefSource | null
}) {
  const ensureColumns = (t: CalibrationPointsStored): CalibrationPointsStored =>
    t.columns.length > 0 ? t : singleColumnPointsTable()

  const draft = ensureColumns(table)
  const displayColumns = draft.columns
  const displayRows =
    draft.rows.length > 0 ? draft.rows : [emptyCalibrationPointRow(displayColumns)]
  const hasFormulaColumns = displayColumns.some((c) => c.type === 'formula')
  const [sortColId, setSortColId] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const updateCell = (rowId: string, colId: string, value: string) => {
    const col = displayColumns.find((c) => c.id === colId)
    if (col?.type === 'formula') return
    onChange({
      ...draft,
      rows: draft.rows.map((r) => {
        if (r.id !== rowId) return r
        const nextValues = { ...r.values, [colId]: value }
        if (!hasFormulaColumns) return { ...r, values: nextValues }
        return {
          ...r,
          values: {
            ...nextValues,
            ...computeCalibrationPointRowValuesFromMaster(
              displayColumns,
              nextValues,
              masterRef,
            ),
          },
        }
      }),
    })
  }

  const sortByColumn = (columnId: string) => {
    const nextDir: 'asc' | 'desc' =
      sortColId === columnId && sortDir === 'asc' ? 'desc' : 'asc'
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    const valueForSort = (row: CalibrationPointRow): string => {
      if (hasFormulaColumns) {
        const computed = computeCalibrationPointRowValuesFromMaster(
          displayColumns,
          row.values,
          masterRef,
        )
        return String(computed[columnId] ?? row.values[columnId] ?? '').trim()
      }
      return String(row.values[columnId] ?? '').trim()
    }
    const sorted = [...displayRows].sort((a, b) => {
      const av = valueForSort(a)
      const bv = valueForSort(b)
      const an = Number(av.replace(/^[±+\s]+/, ''))
      const bn = Number(bv.replace(/^[±+\s]+/, ''))
      let cmp = 0
      if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) {
        cmp = an - bn
      } else {
        cmp = collator.compare(av, bv)
      }
      return nextDir === 'asc' ? cmp : -cmp
    })
    setSortColId(columnId)
    setSortDir(nextDir)
    onChange({ ...draft, rows: sorted })
  }

  const addRow = () => {
    onChange({
      ...draft,
      rows: [...draft.rows, emptyCalibrationPointRow(displayColumns)],
    })
  }

  const removeRow = (rowId: string) => {
    const nextRows = draft.rows.filter((r) => r.id !== rowId)
    onChange({
      ...draft,
      rows:
        nextRows.length > 0 ? nextRows : [emptyCalibrationPointRow(displayColumns)],
    })
  }

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-400 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-12 border border-stone-700 bg-stone-800 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                #
              </th>
              {displayColumns.map((col) => {
                const active = sortColId === col.id
                return (
                  <th
                    key={col.id}
                    className="min-w-[140px] border border-stone-700 bg-stone-800 px-2 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200"
                  >
                    <button
                      type="button"
                      className="inline-flex max-w-full items-center gap-1 text-left text-amber-200 hover:text-amber-100"
                      title={
                        active && sortDir === 'asc'
                          ? 'Sorted lower → higher (click for higher → lower)'
                          : active && sortDir === 'desc'
                            ? 'Sorted higher → lower (click for lower → higher)'
                            : `Sort ${col.header} lower → higher`
                      }
                      onClick={() => sortByColumn(col.id)}
                    >
                      <span className="truncate">{col.header}</span>
                      {col.type === 'formula' ? (
                        <span className="rounded bg-indigo-50 px-1 text-[9px] font-semibold normal-case tracking-wide text-indigo-700">
                          Calc
                        </span>
                      ) : null}
                      {active && sortDir === 'asc' ? (
                        <ArrowUp size={12} className="shrink-0 text-amber-300" aria-hidden />
                      ) : active && sortDir === 'desc' ? (
                        <ArrowDown size={12} className="shrink-0 text-amber-300" aria-hidden />
                      ) : (
                        <ArrowUpDown size={12} className="shrink-0 text-stone-400" aria-hidden />
                      )}
                    </button>
                  </th>
                )
              })}
              <th className="w-14 border border-stone-700 bg-stone-800 px-2 py-2 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                {' '}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row: CalibrationPointRow, index) => {
              const isLast = index === displayRows.length - 1
              const displayValues = hasFormulaColumns
                ? computeCalibrationPointRowValuesFromMaster(
                    displayColumns,
                    row.values,
                    masterRef,
                  )
                : row.values
              return (
                <tr
                  key={row.id}
                  className={index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}
                >
                  <td className="border border-[#e7e0d4] px-2 py-2 text-center align-middle text-stone-500">
                    {index + 1}
                  </td>
                  {displayColumns.map((col) => {
                    const isFormula = col.type === 'formula'
                    return (
                      <td key={col.id} className="border border-[#e7e0d4] px-2 py-2 align-middle">
                        <Label htmlFor={`view-pt-${row.id}-${col.id}`} className="sr-only">
                          {col.header} row {index + 1}
                          {isFormula ? ' (calculated)' : ''}
                        </Label>
                        <Input
                          id={`view-pt-${row.id}-${col.id}`}
                          value={
                            isFormula
                              ? (displayValues[col.id] ?? '')
                              : (row.values[col.id] ?? '')
                          }
                          onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                          readOnly={isFormula}
                          tabIndex={isFormula ? -1 : undefined}
                          placeholder={isFormula ? 'Auto' : col.header}
                          className={cn('h-9 text-center', isFormula && 'bg-stone-100 text-stone-700')}
                          title={
                            isFormula
                              ? col.formula?.expression?.trim() || 'Calculated column'
                              : undefined
                          }
                        />
                      </td>
                    )
                  })}
                  <td className="border border-[#e7e0d4] px-2 py-2 text-center align-middle">
                    {isLast ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mx-auto h-8 w-8 px-0 text-amber-800 hover:bg-amber-500/15 hover:text-amber-950"
                        onClick={addRow}
                        aria-label="Add check point"
                      >
                        <Plus size={16} />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 px-0 text-destructive hover:bg-destructive/10"
                        onClick={() => removeRow(row.id)}
                        aria-label={`Remove point ${index + 1}`}
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
  )
}

function MasterEquipmentStatusDialog({
  open,
  onOpenChange,
  meta,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: MasterEquipmentMeta | null
  title: string
}) {
  const calibrationDueStatus = computeDueStatus(meta?.nextCalibrationDueRaw)
  const intermediateDueStatus = computeDueStatus(meta?.nextIntermediateCheckDateRaw)
  const maintenanceDueStatus = computeDueStatus(meta?.nextMaintenanceDateRaw)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            {title}
          </DialogTitle>
          <p className="text-xs text-slate-500">Master equipment details</p>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {meta ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300/90">
                  Asset Code
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight">{meta.assetCode}</p>
                <p className="mt-1 text-sm text-slate-300">{meta.equipmentName}</p>
              </div>

              <MetaSection title="Equipment Identity">
                <MetaField label="Serial Number" value={meta.serialNumber} />
                <MetaField label="Equipment Status" value={meta.equipmentStatus} />
                <MetaField label="Location" value={meta.currentLocation} />
                <MetaField label="Manufacturer" value={meta.manufacturer} />
                <MetaField label="Model" value={meta.modelNumber} />
                <MetaField label="Class of Instrument" value={meta.classOfInstrument} />
                <MetaField label="Mode of Calibration" value={meta.modeOfCalibration} />
                <MetaField label="Range Capacity" value={meta.rangeCapacity} />
                <MetaField label="Least Count / Resolution" value={meta.resolutionLeastCount} />
                <MetaField
                  label="Accuracy / Acceptance Criteria"
                  value={meta.accuracyAcceptanceCriteria}
                  className="sm:col-span-2"
                />
              </MetaSection>

              <MetaSection title="Calibration Status">
                <MetaField label="Frequency" value={meta.calibrationFrequency} />
                <MetaField label="Last Calibration Date" value={meta.lastCalibrationDate} />
                <MetaField
                  label="Next Calibration Due"
                  value={meta.nextCalibrationDue}
                  badge={<DueStatusBadge status={calibrationDueStatus} />}
                />
                <MetaField
                  label="Certificate Number"
                  value={meta.calibrationCertificateNumber}
                />
                <MetaField label="Uncertainty" value={meta.uncertainty} />
                <MetaField label="Coverage Factor" value={meta.calibrationCoverageFactor} />
                <MetaField
                  label="External Calibration Agency"
                  value={meta.externalCalibrationAgencyName}
                  className="sm:col-span-2"
                />
              </MetaSection>

              <MetaSection title="Intermediate Check Status">
                <MetaField label="Frequency" value={meta.intermediateCheckFrequency} />
                <MetaField
                  label="Last Intermediate Check Date"
                  value={meta.lastIntermediateCheckDate}
                />
                <MetaField
                  label="Next Intermediate Check Date"
                  value={meta.nextIntermediateCheckDate}
                  badge={<DueStatusBadge status={intermediateDueStatus} />}
                />
                <MetaField label="Last Result" value={meta.intermediateCheckResult} />
                <MetaField
                  label="Performed By"
                  value={meta.intermediateCheckPerformedBy}
                  className="sm:col-span-2"
                />
              </MetaSection>

              <MetaSection title="Maintenance Status">
                <MetaField label="Frequency" value={meta.maintenanceScheduleFrequency} />
                <MetaField label="Last Maintenance Date" value={meta.lastMaintenanceDate} />
                <MetaField
                  label="Next Maintenance Date"
                  value={meta.nextMaintenanceDate}
                  badge={<DueStatusBadge status={maintenanceDueStatus} />}
                />
                <MetaField
                  label="Done By"
                  value={meta.maintenanceDoneBy}
                  className="sm:col-span-2"
                />
              </MetaSection>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No master equipment details available.</p>
          )}
        </div>
        <DialogFooter className="border-t border-slate-200 px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MasterCalibrationPointsViewDialog({
  open,
  onOpenChange,
  tab,
  tabIndex,
  masterEquipmentOptions,
  masterMetadata,
  loading,
  loadHint,
  onUpdateTable,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: MasterPointsTab | null
  tabIndex: number
  masterEquipmentOptions: FilterComboboxOption[]
  masterMetadata: Map<string, MasterEquipmentMeta>
  loading: boolean
  loadHint: string | null
  onUpdateTable: (table: CalibrationPointsStored) => void
}) {
  const title = tab
    ? masterLabelForTab(tab, tabIndex, masterEquipmentOptions)
    : 'Calibration Points'
  const masterRef =
    tab?.masterEquipmentId.trim()
      ? (masterMetadata.get(tab.masterEquipmentId)?.formulaRef ?? null)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName={FULLSCREEN_OVERLAY}
        className={FULLSCREEN_DIALOG_CLASS}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {title} — Calibration Points
            </DialogTitle>
            {loadHint ? <p className="mt-0.5 text-xs text-stone-300">{loadHint}</p> : null}
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <p className="text-sm text-stone-600">Loading calibration points…</p>
          ) : tab ? (
            <CalibrationPointsTableEditor
              table={tab.calibrationPointsTable}
              onChange={onUpdateTable}
              masterRef={masterRef}
            />
          ) : null}
        </div>
        <DialogFooter className="shrink-0 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => onOpenChange(false)}
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CalibrationRangePointsDialog({
  open,
  onOpenChange,
  pointsTable,
  masterEquipmentIds = [],
  masterPointsTabs,
  masterEquipmentOptions = [],
  modeOfCalibrationConfigured = false,
  rawSheetContent = null,
  rawSheetFooterActions = null,
  muSheetContent = null,
  generateReportContent = null,
  modeOfCalibrationContent = null,
  initialSection = 'masters',
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rangeLabel: string
  unit: string
  pointsTable: CalibrationPointsStored
  masterEquipmentIds?: string[]
  masterPointsTabs?: MasterPointsTab[]
  masterEquipmentOptions?: FilterComboboxOption[]
  /** Indicator when Mode of Calibration has been entered for this range. */
  modeOfCalibrationConfigured?: boolean
  /** Inline Raw Data Sheet Format editor (section panel). */
  rawSheetContent?: ReactNode | ((live: RawSheetLiveMasterRefs) => ReactNode)
  /** Extra footer actions while Raw Data Sheet Format is open. */
  rawSheetFooterActions?: ReactNode
  /** Inline MU Calculation Sheet editor (section panel). */
  muSheetContent?: ReactNode
  /** Inline Generate Report Format editor (section panel). */
  generateReportContent?: ReactNode | ((live: RawSheetLiveMasterRefs) => ReactNode)
  /** Inline Mode of Calibration manual input (section panel). */
  modeOfCalibrationContent?: ReactNode
  /** Section to open when the dialog becomes visible. */
  initialSection?: CalibrationPointsDialogSection
  onChange: (next: {
    calibrationPointsTable: CalibrationPointsStored
    masterEquipmentIds: string[]
    masterPointsTabs: MasterPointsTab[]
  }) => void
}) {
  const [tabs, setTabs] = useState<MasterPointsTab[]>(() => [emptyMasterPointsTab()])
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(() => new Set())
  const [viewTabId, setViewTabId] = useState<string | null>(null)
  const [statusViewMasterId, setStatusViewMasterId] = useState<string | null>(null)
  const [loadingPointsTabId, setLoadingPointsTabId] = useState<string | null>(null)
  const [viewLoadHint, setViewLoadHint] = useState<string | null>(null)
  const [masterMetadata, setMasterMetadata] = useState<Map<string, MasterEquipmentMeta>>(
    () => new Map(),
  )
  const [activeSection, setActiveSection] =
    useState<CalibrationPointsDialogSection>('masters')

  const viewTab = viewTabId ? (tabs.find((t) => t.id === viewTabId) ?? null) : null
  const viewTabIndex = viewTab ? tabs.findIndex((t) => t.id === viewTab.id) : 0
  const statusViewMeta = statusViewMasterId
    ? (masterMetadata.get(statusViewMasterId) ?? null)
    : null
  const statusViewTitle = statusViewMeta?.equipmentName ?? 'Master Equipment Status'

  const loadPointsForTab = useCallback(async (masterId: string, tabId: string) => {
    if (!masterId.trim()) {
      setViewLoadHint('Select a master equipment first.')
      return
    }
    setLoadingPointsTabId(tabId)
    setViewLoadHint(null)
    try {
      const table = await fetchSingleMasterTable(masterId)
      if (table) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === tabId ? { ...tab, calibrationPointsTable: table } : tab,
          ),
        )
        setViewLoadHint(`Loaded ${table.rows.length} check point(s) from master equipment.`)
        return
      }
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, calibrationPointsTable: singleColumnPointsTable() }
            : tab,
        ),
      )
      setViewLoadHint(
        'Selected master has no calibration points yet. Add them under Equipment for Calibration.',
      )
    } catch {
      setViewLoadHint('Could not load check points from master equipment.')
    } finally {
      setLoadingPointsTabId(null)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setViewLoadHint(null)
    setViewTabId(null)
    setStatusViewMasterId(null)
    setSelectedTabIds(new Set())
    setActiveSection(initialSection ?? 'masters')
    const initial = buildInitialTabs(masterPointsTabs, masterEquipmentIds, pointsTable)
    setTabs(initial.length > 0 ? initial : [emptyMasterPointsTab()])
  }, [open, pointsTable, masterEquipmentIds, masterPointsTabs, initialSection])

  useEffect(() => {
    if (!open) return
    const optionIds = (masterEquipmentOptions ?? []).map((o) => o.id)
    const tabIds = tabs.map((t) => t.masterEquipmentId.trim()).filter(Boolean)
    const ids = [...new Set([...optionIds, ...tabIds])]
    if (ids.length === 0) {
      setMasterMetadata(new Map())
      return
    }
    let cancelled = false
    void fetchMasterMetadataMap(ids).then((map) => {
      if (!cancelled) setMasterMetadata(map)
    })
    return () => {
      cancelled = true
    }
  }, [open, masterEquipmentOptions, tabs])

  useEffect(() => {
    if (!open || (activeSection !== 'rawSheet' && activeSection !== 'generateReport')) return
    for (const tab of tabs) {
      if (loadingPointsTabId === tab.id) continue
      if (
        tab.masterEquipmentId.trim() &&
        (tab.calibrationPointsTable.columns?.length ?? 0) === 0
      ) {
        void loadPointsForTab(tab.masterEquipmentId, tab.id)
      }
    }
  }, [open, activeSection, tabs, loadPointsForTab, loadingPointsTabId])

  const usedMasterIds = useMemo(
    () =>
      new Set(
        tabs.map((t) => t.masterEquipmentId.trim()).filter(Boolean),
      ),
    [tabs],
  )

  const allTabsSelected =
    tabs.length > 0 && tabs.every((tab) => selectedTabIds.has(tab.id))

  const toggleAllTabs = (checked: boolean) => {
    setSelectedTabIds(checked ? new Set(tabs.map((t) => t.id)) : new Set())
  }

  const toggleTabSelected = (tabId: string, checked: boolean) => {
    setSelectedTabIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(tabId)
      else next.delete(tabId)
      return next
    })
  }

  const selectMasterForTab = (tabId: string, masterId: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, masterEquipmentId: masterId } : tab,
      ),
    )
    if (masterId.trim()) {
      void loadPointsForTab(masterId, tabId)
    }
  }

  const addMasterRow = () => {
    const tab = emptyMasterPointsTab()
    setTabs((prev) => [...prev, tab])
  }

  const removeMasterRow = (tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) {
        const only = emptyMasterPointsTab()
        setSelectedTabIds(new Set())
        if (viewTabId === tabId) setViewTabId(null)
        return [only]
      }
      const next = prev.filter((t) => t.id !== tabId)
      setSelectedTabIds((sel) => {
        const updated = new Set(sel)
        updated.delete(tabId)
        return updated
      })
      if (viewTabId === tabId) setViewTabId(null)
      return next
    })
    setViewLoadHint(null)
  }

  const openViewForTab = (tab: MasterPointsTab) => {
    setViewTabId(tab.id)
    setViewLoadHint(null)
    if (
      tab.masterEquipmentId.trim() &&
      !tableHasPointValues(tab.calibrationPointsTable)
    ) {
      void loadPointsForTab(tab.masterEquipmentId, tab.id)
    }
  }

  const updateViewTabTable = (table: CalibrationPointsStored) => {
    if (!viewTabId) return
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === viewTabId ? { ...tab, calibrationPointsTable: table } : tab,
      ),
    )
  }

  const handleDone = () => {
    const cleanedTabs = tabs
      .filter((tab) => tab.masterEquipmentId.trim().length > 0)
      .map((tab) => {
        const table = tab.calibrationPointsTable
        const nextRows = table.rows.filter((r) =>
          Object.values(r.values).some((v) => String(v ?? '').trim().length > 0),
        )
        const cleaned: CalibrationPointsStored =
          table.columns.length === 0
            ? emptyCalibrationPointsTable()
            : { columns: table.columns.map((c) => ({ ...c })), rows: nextRows }
        return {
          ...tab,
          masterEquipmentId: tab.masterEquipmentId.trim(),
          calibrationPointsTable: cleaned,
        }
      })
    const resolvedTabs = cleanedTabs.length > 0 ? cleanedTabs : [emptyMasterPointsTab()]
    onChange({
      calibrationPointsTable: primaryCalibrationPointsTable(resolvedTabs),
      masterEquipmentIds: masterEquipmentIdsFromTabs(resolvedTabs),
      masterPointsTabs: resolvedTabs,
    })
    onOpenChange(false)
  }

  const headerTitle =
    activeSection === 'rawSheet'
      ? 'Raw Data Sheet Format'
      : activeSection === 'muSheet'
        ? 'MU Calculation Sheet'
        : activeSection === 'generateReport'
          ? 'Generate Report Format'
          : activeSection === 'modeOfCalibration'
            ? 'Mode of Calibration'
            : 'Calibration Points'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer="nested"
          overlayClassName={FULLSCREEN_OVERLAY}
          className={FULLSCREEN_DIALOG_CLASS}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {headerTitle}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {activeSection === 'rawSheet' ? (
              <div className="mx-auto w-full max-w-none space-y-3">
                {typeof rawSheetContent === 'function'
                  ? rawSheetContent({
                      masterEquipmentIds: tabs
                        .map((t) => t.masterEquipmentId.trim())
                        .filter(Boolean),
                      masterPointsTables: tabs
                        .map((t) => t.calibrationPointsTable)
                        .filter((t) => (t.columns?.length ?? 0) > 0)
                        .map((t) => ({
                          columns: t.columns.map((c) => ({ header: c.header })),
                        })),
                    })
                  : rawSheetContent}
              </div>
            ) : null}
            {activeSection === 'muSheet' ? (
              <div className="mx-auto w-full max-w-none space-y-3">{muSheetContent}</div>
            ) : null}
            {activeSection === 'generateReport' ? (
              <div className="mx-auto w-full max-w-none space-y-3">
                {typeof generateReportContent === 'function'
                  ? generateReportContent({
                      masterEquipmentIds: tabs
                        .map((t) => t.masterEquipmentId.trim())
                        .filter(Boolean),
                      masterPointsTables: tabs
                        .map((t) => t.calibrationPointsTable)
                        .filter((t) => (t.columns?.length ?? 0) > 0)
                        .map((t) => ({
                          columns: t.columns.map((c) => ({ header: c.header })),
                        })),
                    })
                  : generateReportContent}
              </div>
            ) : null}
            {activeSection === 'modeOfCalibration' ? (
              <div className="mx-auto w-full max-w-none space-y-3">{modeOfCalibrationContent}</div>
            ) : null}
            {activeSection === 'masters' ? (
              <div className="mx-auto w-full max-w-none space-y-3">
                <div className="overflow-hidden rounded-none border-2 border-stone-400 bg-white">
                  <div className="w-full">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className={cn(mastersThClass, 'w-10')}>
                            <input
                              type="checkbox"
                              className="mx-auto block h-4 w-4 accent-amber-700"
                              checked={allTabsSelected}
                              onChange={(e) => toggleAllTabs(e.target.checked)}
                              aria-label="Select all masters"
                            />
                          </th>
                          <th className={mastersThClass}>
                            Master Equipment Name
                          </th>
                          <th className={cn(mastersThClass, 'w-[18%]')}>
                            Range of Master
                          </th>
                          <th className={cn(mastersThClass, 'w-[16%]')}>
                            Uncertainty of Master
                          </th>
                          <th className={cn(mastersThClass, 'w-[15%]')}>Status of Master</th>
                          <th className={cn(mastersThClass, 'w-[14%]')}>Calibration Point</th>
                          <th className={cn(mastersThClass, 'w-10')}>
                            <span className="sr-only">Action</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tabs.map((tab, index) => {
                          const isLast = index === tabs.length - 1
                          const meta = tab.masterEquipmentId.trim()
                            ? masterMetadata.get(tab.masterEquipmentId)
                            : undefined
                          const pointCount = tab.calibrationPointsTable.rows.filter((r) =>
                            Object.values(r.values).some((v) => String(v ?? '').trim()),
                          ).length
                          const usedElsewhere = new Set(
                            [...usedMasterIds].filter((id) => id !== tab.masterEquipmentId),
                          )
                          const rowSelected = selectedTabIds.has(tab.id)

                          return (
                            <tr
                              key={tab.id}
                              className={
                                rowSelected
                                  ? 'bg-[#fde68a]/80'
                                  : index % 2 === 0
                                    ? 'bg-[#f7f3eb]'
                                    : 'bg-[#fffcf7]'
                              }
                            >
                              <td className={mastersTdClass}>
                                <input
                                  type="checkbox"
                                  className="mx-auto block h-4 w-4 accent-amber-700"
                                  checked={rowSelected}
                                  onChange={(e) => toggleTabSelected(tab.id, e.target.checked)}
                                  aria-label={`Select ${masterLabelForTab(tab, index, masterEquipmentOptions)}`}
                                />
                              </td>
                              <td className={cn(mastersTdClass, 'text-left')}>
                                <MasterEquipmentNameCell
                                  tabId={tab.id}
                                  masterEquipmentId={tab.masterEquipmentId}
                                  options={masterEquipmentOptions ?? []}
                                  usedMasterIds={usedElsewhere}
                                  masterMetadata={masterMetadata}
                                  onSelectMaster={selectMasterForTab}
                                />
                              </td>
                              <td className={cn(mastersTdClass, 'text-stone-700')}>
                                {meta?.rangeCapacity ?? '—'}
                              </td>
                              <td className={cn(mastersTdClass, 'text-stone-700')}>
                                {meta?.uncertainty ?? '—'}
                              </td>
                              <td className={mastersTdClass}>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className={cn('h-8 w-full max-w-[7.5rem] px-2 text-xs', limsOutlineBtnClass)}
                                  disabled={!tab.masterEquipmentId.trim()}
                                  onClick={() => setStatusViewMasterId(tab.masterEquipmentId)}
                                  aria-label={`View status for ${masterLabelForTab(tab, index, masterEquipmentOptions)}`}
                                >
                                  View Status
                                </Button>
                              </td>
                              <td className={mastersTdClass}>
                                <div className="flex justify-center">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={cn('h-8 w-full max-w-[6.5rem] gap-1 px-2 text-xs', limsOutlineBtnClass)}
                                    disabled={!tab.masterEquipmentId.trim()}
                                    onClick={() => openViewForTab(tab)}
                                    aria-label={`View calibration points for ${masterLabelForTab(tab, index, masterEquipmentOptions)}`}
                                  >
                                    <Eye size={14} aria-hidden />
                                    View
                                    {pointCount > 0 ? (
                                      <span className="rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                        {pointCount}
                                      </span>
                                    ) : null}
                                  </Button>
                                </div>
                              </td>
                              <td className={mastersTdClass}>
                                {isLast ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mx-auto h-8 w-8 px-0 text-amber-800 hover:bg-amber-500/15 hover:text-amber-950"
                                    onClick={addMasterRow}
                                    aria-label="Add master row"
                                  >
                                    <Plus size={16} />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                                    onClick={() => removeMasterRow(tab.id)}
                                    aria-label={`Delete ${masterLabelForTab(tab, index, masterEquipmentOptions)}`}
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
                {(masterEquipmentOptions ?? []).length === 0 ? (
                  <p className="text-xs text-stone-500">
                    No master equipment found. Add standards under Equipment for Calibration.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              {activeSection === 'rawSheet' ? rawSheetFooterActions : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                className={limsPrimaryBtnClass}
                onClick={handleDone}
                disabled={loadingPointsTabId != null}
              >
                Save & Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MasterCalibrationPointsViewDialog
        open={viewTabId != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setViewTabId(null)
            setViewLoadHint(null)
          }
        }}
        tab={viewTab}
        tabIndex={viewTabIndex}
        masterEquipmentOptions={masterEquipmentOptions ?? []}
        masterMetadata={masterMetadata}
        loading={viewTab != null && loadingPointsTabId === viewTab.id}
        loadHint={viewLoadHint}
        onUpdateTable={updateViewTabTable}
      />

      <MasterEquipmentStatusDialog
        open={statusViewMasterId != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setStatusViewMasterId(null)
        }}
        meta={statusViewMeta}
        title={statusViewTitle}
      />
    </>
  )
}
