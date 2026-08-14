import { calculateNextDueDate as calcNext } from '@/features/masters/equipment-master/types'
import type { Frequency as EqFrequency } from '@/features/masters/equipment-master/types'
import type { MaintenanceChecklistItem } from '@/features/masters/equipment-master/types'
import { parseMaintenanceChecklistFromDb } from '@/features/masters/equipment-master/maintenanceChecklist'
import {
  parseMaintenanceHistoryFromDb,
  type MaintenanceHistoryRecord,
} from '@/features/masters/equipment-master/maintenanceHistory'
import {
  parseIntermediateCheckHistoryFromDb,
  type IntermediateCheckHistoryRecord,
} from '@/features/masters/equipment-master/intermediateCheckHistory'
import { companyTwoWordInitials } from '@/features/calibration/equipments/types'
import type {
  RawDataColumnFormula,
  RawDataColumnType,
} from '@/features/calibration/rawDataSheetTypes'
import {
  emptyColumnFormula,
  parseColumnFormula,
} from '@/features/calibration/rawDataSheetTypes'

export type EquipmentStatus = 'Active' | 'In Repair' | 'Idle'
export const EQUIPMENT_STATUSES: EquipmentStatus[] = ['Active', 'In Repair', 'Idle']

/** Nested schedule dialog to auto-open when editing from a table status badge. */
export type EquipmentScheduleSection = 'calibration' | 'intermediate' | 'maintenance'

export type PresetFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'Half Yearly'
  | 'Yearly'

/** Preset labels, bare Manual, or custom interval like "90 Days". */
export type Frequency = '' | PresetFrequency | 'Manual' | `${number} Days`

export const PRESET_FREQUENCIES: PresetFrequency[] = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Half Yearly',
  'Yearly',
]

export const FREQUENCIES: Array<PresetFrequency | 'Manual'> = [...PRESET_FREQUENCIES, 'Manual']

const MANUAL_DAYS_RE = /^(\d+)\s*Days?$/i

export function isPresetFrequency(value: string): value is PresetFrequency {
  return (PRESET_FREQUENCIES as readonly string[]).includes(value)
}

/** Parse "90 Days" / "90 Day" → 90. */
export function parseManualIntervalDays(frequency: string | null | undefined): number | null {
  const m = String(frequency ?? '')
    .trim()
    .match(MANUAL_DAYS_RE)
  if (!m) return null
  const n = Number.parseInt(m[1]!, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function formatManualDaysFrequency(days: number): Frequency {
  return `${Math.trunc(days)} Days` as Frequency
}

/** Select shows Manual for bare Manual and for any "N Days" interval. */
export function frequencySelectValue(frequency: string): PresetFrequency | 'Manual' | undefined {
  if (!frequency.trim()) return undefined
  if (isPresetFrequency(frequency)) return frequency
  return 'Manual'
}

/** Next Due is auto when frequency is a preset or a custom day interval. */
export function hasAutoNextDue(frequency: string): boolean {
  return isPresetFrequency(frequency) || parseManualIntervalDays(frequency) !== null
}

/** Map DB string → form Frequency. Preserves "N Days"; unknown → Manual. */
export function parseStoredFrequency(raw: string | null | undefined): Frequency {
  const v = (raw ?? '').trim()
  if (!v) return ''
  if (isPresetFrequency(v)) return v
  const days = parseManualIntervalDays(v)
  if (days !== null) return formatManualDaysFrequency(days)
  return 'Manual'
}

/** Same column kinds as Raw Data Sheet (Number / Text / Calculated). */
export type CalibrationPointsColumnType = RawDataColumnType

export type CalibrationPointsColumn = {
  id: string
  header: string
  /** Defaults to `number` for legacy rows that only stored header. */
  type?: CalibrationPointsColumnType
  required?: boolean
  /** Present when type = `formula` — same engine as Raw Data calculated columns. */
  formula?: RawDataColumnFormula
}

export type CalibrationPointRow = {
  id: string
  values: Record<string, string>
}

/** Legacy fixed-shape point — still parsed from old DB rows for list views. */
export type CalibrationPoint = {
  id: string
  nominalValue: string
  actualValue: string
  correction: string
  uncertainty: string
}

export type CalibrationPointsStored = {
  columns: CalibrationPointsColumn[]
  rows: CalibrationPointRow[]
}

export const DEFAULT_CALIBRATION_POINT_HEADERS = [
  'Nominal',
  'Actual',
  'Correction',
  'Uncertainty',
] as const

export type EquipmentForCalibrationRow = {
  id: string
  asset_code: string
  equipment_name: string
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  current_location: string | null
  equipment_status: string | null
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
  mode_of_calibration?: string | null
  class_of_instrument?: string | null
  calibration_temperature?: string | null
  calibration_humidity?: string | null
  /** Canonical scientific text, e.g. 11.5e-6 (/°C implied). */
  coefficient_of_thermal_expansion?: string | null
  intermediate_check_frequency: string | null
  last_intermediate_check_date: string | null
  next_intermediate_check_date: string | null
  intermediate_check_result: string | null
  intermediate_check_performed_by?: string | null
  intermediate_check_history?: IntermediateCheckHistoryRecord[] | null
  maintenance_schedule_frequency: string | null
  last_maintenance_date: string | null
  next_maintenance_date: string | null
  maintenance_done_by: string | null
  maintenance_checklist?: MaintenanceChecklistItem[] | null
  maintenance_history?: MaintenanceHistoryRecord[] | null
  calibration_points: CalibrationPointsStored | CalibrationPoint[] | null
  remarks: string | null
  is_iqc_master?: boolean | null
  created_at?: string
  updated_at?: string
}

export type EquipmentForCalibrationForm = {
  assetCode: string
  equipmentName: string
  manufacturer: string
  modelNumber: string
  serialNumber: string
  currentLocation: string
  equipmentStatus: EquipmentStatus
  rangeCapacity: string
  rangeCapacityUnit: string
  resolutionLeastCount: string
  resolutionLeastCountUnit: string
  accuracyAcceptanceCriteria: string
  calibrationFrequency: Frequency
  lastCalibrationDate: string
  nextCalibrationDue: string
  calibrationCertificateNumber: string
  calibrationCertificateUncertainty: string
  calibrationUncertaintyUnit: string
  calibrationCoverageFactor: string
  externalCalibrationAgencyName: string
  modeOfCalibration: string
  classOfInstrument: string
  calibrationTemperature: string
  calibrationHumidity: string
  /** Stored as 11.5e-6; UI shows 11.5 × 10⁻⁶/°C. */
  coefficientOfThermalExpansion: string
  intermediateCheckFrequency: Frequency
  lastIntermediateCheckDate: string
  nextIntermediateCheckDate: string
  intermediateCheckResult: string
  intermediateCheckPerformedBy: string
  intermediateCheckHistory: IntermediateCheckHistoryRecord[]
  maintenanceScheduleFrequency: Frequency
  lastMaintenanceDate: string
  nextMaintenanceDate: string
  maintenanceDoneBy: string
  maintenanceChecklist: MaintenanceChecklistItem[]
  maintenanceHistory: MaintenanceHistoryRecord[]
  calibrationPointsColumns: CalibrationPointsColumn[]
  calibrationPoints: CalibrationPointRow[]
  remarks: string
}

export function newCalibrationPointId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function newCalibrationColumnId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Required checkbox in Create Table: checked → show in generated table. Formula columns always show. */
export function isCalibrationPointsColumnVisible(col: CalibrationPointsColumn): boolean {
  if ((col.type || 'number') === 'formula') return true
  return Boolean(col.required)
}

export function visibleCalibrationPointsColumns(
  columns: CalibrationPointsColumn[],
): CalibrationPointsColumn[] {
  return columns.filter(isCalibrationPointsColumnVisible)
}

export function emptyCalibrationPointRow(
  columns: CalibrationPointsColumn[],
): CalibrationPointRow {
  const values: Record<string, string> = {}
  for (const col of columns) values[col.id] = ''
  return { id: newCalibrationPointId(), values }
}

export function buildCalibrationColumnsFromHeaders(headers: string[]): CalibrationPointsColumn[] {
  return headers.map((header, index) => ({
    id: newCalibrationColumnId(),
    header: header.trim() || `Column ${index + 1}`,
    type: 'number' as const,
    required: false,
  }))
}

export function emptyCalibrationPointsColumn(
  header = '',
  type: CalibrationPointsColumnType = 'number',
): CalibrationPointsColumn {
  return {
    id: newCalibrationColumnId(),
    header,
    type,
    required: true,
    ...(type === 'formula' ? { formula: emptyColumnFormula() } : {}),
  }
}

function isPointsColumnType(v: unknown): v is CalibrationPointsColumnType {
  return v === 'text' || v === 'number' || v === 'formula'
}

export function normalizeCalibrationPointsColumn(
  raw: Record<string, unknown>,
  index: number,
): CalibrationPointsColumn {
  const type = isPointsColumnType(raw.type) ? raw.type : 'number'
  const formula =
    type === 'formula' ? (parseColumnFormula(raw.formula) ?? emptyColumnFormula()) : undefined
  return {
    id: String(raw.id ?? newCalibrationColumnId()),
    header: String(raw.header ?? `Column ${index + 1}`).trim() || `Column ${index + 1}`,
    type,
    required: type === 'formula' ? false : Boolean(raw.required),
    ...(formula ? { formula } : {}),
  }
}

export function rowHasCalibrationValues(row: CalibrationPointRow): boolean {
  return Object.values(row.values).some((v) => String(v ?? '').trim().length > 0)
}

function isLegacyPointArray(raw: unknown): raw is Array<Record<string, unknown>> {
  if (!Array.isArray(raw) || raw.length === 0) return false
  const first = raw[0]
  return Boolean(
    first &&
      typeof first === 'object' &&
      !('values' in first) &&
      ('nominalValue' in first || 'actualValue' in first),
  )
}

export function parseCalibrationPointsTable(raw: unknown): CalibrationPointsStored {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    const colsRaw = Array.isArray(obj.columns) ? obj.columns : []
    const rowsRaw = Array.isArray(obj.rows) ? obj.rows : []
    const columns: CalibrationPointsColumn[] = colsRaw.map((item, index) => {
      const col = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      return normalizeCalibrationPointsColumn(col, index)
    })
    const rows: CalibrationPointRow[] = rowsRaw.map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const valuesRaw =
        row.values && typeof row.values === 'object' && !Array.isArray(row.values)
          ? (row.values as Record<string, unknown>)
          : {}
      const values: Record<string, string> = {}
      for (const col of columns) {
        values[col.id] = String(valuesRaw[col.id] ?? '')
      }
      return { id: String(row.id ?? newCalibrationPointId()), values }
    })
    return {
      columns,
      rows:
        columns.length === 0
          ? []
          : rows.length > 0
            ? rows
            : [emptyCalibrationPointRow(columns)],
    }
  }

  if (isLegacyPointArray(raw)) {
    const columns = DEFAULT_CALIBRATION_POINT_HEADERS.map((header) => ({
      id: newCalibrationColumnId(),
      header,
      type: 'number' as const,
      required: true,
    }))
    const [nominal, actual, correction, uncertainty] = columns
    const rows = raw.map((item) => {
      const row = item as Record<string, unknown>
      return {
        id: String(row.id ?? newCalibrationPointId()),
        values: {
          [nominal!.id]: String(row.nominalValue ?? ''),
          [actual!.id]: String(row.actualValue ?? ''),
          [correction!.id]: String(row.correction ?? ''),
          [uncertainty!.id]: String(row.uncertainty ?? ''),
        },
      }
    })
    return {
      columns,
      rows: rows.length > 0 ? rows : [emptyCalibrationPointRow(columns)],
    }
  }

  return { columns: [], rows: [] }
}

/** Legacy helper for list/count views. */
export function parseCalibrationPoints(raw: unknown): CalibrationPoint[] {
  const table = parseCalibrationPointsTable(raw)
  if (table.columns.length === 0) return []
  const byHeader = (name: string) =>
    table.columns.find((c) => c.header.trim().toLowerCase() === name.toLowerCase())?.id
  const nId = byHeader('Nominal')
  const aId = byHeader('Actual')
  const cId = byHeader('Correction')
  const uId = byHeader('Uncertainty')
  return table.rows.map((row) => ({
    id: row.id,
    nominalValue: nId ? (row.values[nId] ?? '') : '',
    actualValue: aId ? (row.values[aId] ?? '') : '',
    correction: cId ? (row.values[cId] ?? '0.0000') : '0.0000',
    uncertainty: uId ? (row.values[uId] ?? '') : '',
  }))
}

export function serializeCalibrationPointsTable(
  columns: CalibrationPointsColumn[],
  rows: CalibrationPointRow[],
): CalibrationPointsStored | null {
  if (columns.length === 0) return null
  const cleanColumns = columns.map((c, index) => {
    const header = normalizeText(c.header) || `Column ${index + 1}`
    const type: CalibrationPointsColumnType = c.type || 'number'
    const base: CalibrationPointsColumn = {
      id: c.id || newCalibrationColumnId(),
      header,
      type,
      required: type === 'formula' ? false : Boolean(c.required),
    }
    if (type === 'formula') {
      base.formula = c.formula ?? emptyColumnFormula()
    }
    return base
  })
  const mappedRows = rows.map((r) => {
    const values: Record<string, string> = {}
    for (const col of cleanColumns) {
      values[col.id] = normalizeText(r.values[col.id] ?? '')
    }
    return { id: r.id || newCalibrationPointId(), values }
  })
  const filled = mappedRows.filter((r) => rowHasCalibrationValues(r))
  return {
    columns: cleanColumns,
    rows: filled.length > 0 ? filled : [{ id: newCalibrationPointId(), values: Object.fromEntries(cleanColumns.map((c) => [c.id, ''])) }],
  }
}

export function emptyEquipmentForCalibrationForm(): EquipmentForCalibrationForm {
  const today = todayIsoDate()
  return {
    assetCode: '',
    equipmentName: '',
    manufacturer: '',
    modelNumber: '',
    serialNumber: '',
    currentLocation: '',
    equipmentStatus: 'Active',
    rangeCapacity: '',
    rangeCapacityUnit: '',
    resolutionLeastCount: '',
    resolutionLeastCountUnit: '',
    accuracyAcceptanceCriteria: '',
    calibrationFrequency: '',
    lastCalibrationDate: '',
    nextCalibrationDue: '',
    calibrationCertificateNumber: '',
    calibrationCertificateUncertainty: '',
    calibrationUncertaintyUnit: '',
    calibrationCoverageFactor: '',
    externalCalibrationAgencyName: '',
    modeOfCalibration: '',
    classOfInstrument: '',
    calibrationTemperature: '',
    calibrationHumidity: '',
    coefficientOfThermalExpansion: '',
    intermediateCheckFrequency: 'Quarterly',
    lastIntermediateCheckDate: '',
    nextIntermediateCheckDate: '',
    intermediateCheckResult: '',
    intermediateCheckPerformedBy: '',
    intermediateCheckHistory: [],
    maintenanceScheduleFrequency: 'Quarterly',
    lastMaintenanceDate: today,
    nextMaintenanceDate: calculateNextDueDate(today, 'Quarterly'),
    maintenanceDoneBy: '',
    maintenanceChecklist: [],
    maintenanceHistory: [],
    calibrationPointsColumns: [],
    calibrationPoints: [],
    remarks: '',
  }
}

export function normalizeText(value: string): string {
  return value.trim()
}

/** Split stored "100 kN" / "0-100 mm" / "1 Count" into value + unit for the form. */
export function splitValueAndUnit(raw: string | null | undefined): {
  value: string
  unit: string
} {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { value: '', unit: '' }
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > 0) {
    const maybeUnit = trimmed.slice(lastSpace + 1).trim()
    const maybeValue = trimmed.slice(0, lastSpace).trim()
    if (maybeUnit && !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(maybeUnit)) {
      return { value: maybeValue, unit: maybeUnit }
    }
  }
  const match = trimmed.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/)
  if (match) return { value: match[1] ?? '', unit: (match[2] ?? '').trim() }
  return { value: trimmed, unit: '' }
}

/** @deprecated Prefer splitValueAndUnit */
export const splitLeastCount = splitValueAndUnit

export function joinValueAndUnit(value: string, unit: string): string {
  return [normalizeText(value), normalizeText(unit)].filter(Boolean).join(' ')
}

/** @deprecated Prefer joinValueAndUnit */
export const joinLeastCount = joinValueAndUnit

export function calculateNextDueDate(lastDateStr: string, frequency: Frequency): string {
  if (!lastDateStr.trim() || !frequency) return ''
  const days = parseManualIntervalDays(frequency)
  if (days !== null) {
    const date = new Date(lastDateStr)
    if (Number.isNaN(date.getTime())) return ''
    date.setDate(date.getDate() + days)
    return date.toISOString().split('T')[0] ?? ''
  }
  if (!isPresetFrequency(frequency)) return ''
  return calcNext(lastDateStr, frequency as EqFrequency)
}

/** Local calendar date as YYYY-MM-DD (avoids UTC day-shift). */
export function todayIsoDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export type EquipmentMasterVariant = 'master' | 'iqc'

/** Next code: {Company2Initials}-EQ-0001 or {Company2Initials}-IQC-0001 */
export function nextAssetCode(
  labName: string,
  existing: string[],
  variant: EquipmentMasterVariant = 'master',
): string {
  const initials = companyTwoWordInitials(labName)
  const prefix = `${initials}-${variant === 'iqc' ? 'IQC' : 'EQ'}-`
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i')
  let max = 0
  for (const code of existing) {
    const m = code.trim().match(re)
    if (!m) continue
    const n = Number.parseInt(m[1]!, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function rowToForm(
  row: EquipmentForCalibrationRow,
  asCopy = false,
  nextCode = '',
): EquipmentForCalibrationForm {
  const pointsTable = parseCalibrationPointsTable(row.calibration_points)
  const leastCount = splitValueAndUnit(row.resolution_least_count)
  const rangeCapacity = splitValueAndUnit(row.range_capacity)
  return {
    assetCode: asCopy ? nextCode : (row.asset_code ?? ''),
    equipmentName: asCopy
      ? `${row.equipment_name || ''} - Copy`
      : (row.equipment_name ?? ''),
    manufacturer: row.manufacturer ?? '',
    modelNumber: row.model_number ?? '',
    serialNumber: row.serial_number ?? '',
    currentLocation: row.current_location ?? '',
    equipmentStatus: (row.equipment_status as EquipmentStatus) || 'Active',
    rangeCapacity: rangeCapacity.value,
    rangeCapacityUnit: rangeCapacity.unit,
    resolutionLeastCount: leastCount.value,
    resolutionLeastCountUnit: leastCount.unit,
    accuracyAcceptanceCriteria: row.accuracy_acceptance_criteria ?? '',
    calibrationFrequency: parseStoredFrequency(row.calibration_frequency),
    lastCalibrationDate: row.last_calibration_date?.slice(0, 10) ?? '',
    nextCalibrationDue: row.next_calibration_due?.slice(0, 10) ?? '',
    calibrationCertificateNumber: row.calibration_certificate_number ?? '',
    calibrationCertificateUncertainty: row.calibration_certificate_uncertainty ?? '',
    calibrationUncertaintyUnit: row.calibration_uncertainty_unit ?? '',
    calibrationCoverageFactor: row.calibration_coverage_factor ?? '',
    externalCalibrationAgencyName: row.external_calibration_agency_name ?? '',
    modeOfCalibration: row.mode_of_calibration ?? '',
    classOfInstrument: row.class_of_instrument ?? '',
    calibrationTemperature: row.calibration_temperature ?? '',
    calibrationHumidity: row.calibration_humidity ?? '',
    coefficientOfThermalExpansion: row.coefficient_of_thermal_expansion ?? '',
    intermediateCheckFrequency:
      parseStoredFrequency(row.intermediate_check_frequency) || 'Quarterly',
    lastIntermediateCheckDate: row.last_intermediate_check_date?.slice(0, 10) ?? '',
    nextIntermediateCheckDate: row.next_intermediate_check_date?.slice(0, 10) ?? '',
    intermediateCheckResult: row.intermediate_check_result ?? '',
    intermediateCheckPerformedBy: row.intermediate_check_performed_by ?? '',
    intermediateCheckHistory: parseIntermediateCheckHistoryFromDb(row.intermediate_check_history),
    maintenanceScheduleFrequency:
      parseStoredFrequency(row.maintenance_schedule_frequency) || 'Quarterly',
    lastMaintenanceDate: row.last_maintenance_date?.slice(0, 10) || todayIsoDate(),
    nextMaintenanceDate:
      row.next_maintenance_date?.slice(0, 10) ||
      calculateNextDueDate(
        row.last_maintenance_date?.slice(0, 10) || todayIsoDate(),
        parseStoredFrequency(row.maintenance_schedule_frequency) || 'Quarterly',
      ),
    maintenanceDoneBy: row.maintenance_done_by ?? '',
    maintenanceChecklist: parseMaintenanceChecklistFromDb(row.maintenance_checklist),
    maintenanceHistory: parseMaintenanceHistoryFromDb(row.maintenance_history),
    calibrationPointsColumns: pointsTable.columns,
    calibrationPoints: pointsTable.rows,
    remarks: row.remarks ?? '',
  }
}

export function formToPayload(form: EquipmentForCalibrationForm) {
  const nextCal = form.nextCalibrationDue.trim().slice(0, 10)
  const nextIc = form.nextIntermediateCheckDate.trim().slice(0, 10)
  const nextMaint = form.nextMaintenanceDate.trim().slice(0, 10)
  return {
    asset_code: normalizeText(form.assetCode),
    equipment_name: normalizeText(form.equipmentName),
    manufacturer: normalizeText(form.manufacturer) || null,
    model_number: normalizeText(form.modelNumber) || null,
    serial_number: normalizeText(form.serialNumber) || null,
    current_location: normalizeText(form.currentLocation) || null,
    equipment_status: form.equipmentStatus,
    range_capacity: joinValueAndUnit(form.rangeCapacity, form.rangeCapacityUnit) || null,
    resolution_least_count:
      joinValueAndUnit(form.resolutionLeastCount, form.resolutionLeastCountUnit) || null,
    accuracy_acceptance_criteria: normalizeText(form.accuracyAcceptanceCriteria) || null,
    calibration_frequency: form.calibrationFrequency || null,
    last_calibration_date: form.lastCalibrationDate.slice(0, 10) || null,
    next_calibration_due: nextCal || null,
    calibration_certificate_number: normalizeText(form.calibrationCertificateNumber) || null,
    calibration_certificate_uncertainty:
      normalizeText(form.calibrationCertificateUncertainty) || null,
    calibration_uncertainty_unit: normalizeText(form.calibrationUncertaintyUnit) || null,
    calibration_coverage_factor: normalizeText(form.calibrationCoverageFactor) || null,
    external_calibration_agency_name:
      normalizeText(form.externalCalibrationAgencyName) || null,
    mode_of_calibration: normalizeText(form.modeOfCalibration) || null,
    class_of_instrument: normalizeText(form.classOfInstrument) || null,
    calibration_temperature: normalizeText(form.calibrationTemperature) || null,
    calibration_humidity: normalizeText(form.calibrationHumidity) || null,
    coefficient_of_thermal_expansion:
      normalizeText(form.coefficientOfThermalExpansion) || null,
    intermediate_check_frequency: form.intermediateCheckFrequency || null,
    last_intermediate_check_date: form.lastIntermediateCheckDate.slice(0, 10) || null,
    next_intermediate_check_date: nextIc || null,
    intermediate_check_result: normalizeText(form.intermediateCheckResult) || null,
    intermediate_check_performed_by: normalizeText(form.intermediateCheckPerformedBy) || null,
    intermediate_check_history: form.intermediateCheckHistory,
    maintenance_schedule_frequency: form.maintenanceScheduleFrequency || null,
    last_maintenance_date: form.lastMaintenanceDate.slice(0, 10) || null,
    next_maintenance_date: nextMaint || null,
    maintenance_done_by: normalizeText(form.maintenanceDoneBy) || null,
    maintenance_checklist: form.maintenanceChecklist,
    maintenance_history: form.maintenanceHistory,
    calibration_points: serializeCalibrationPointsTable(
      form.calibrationPointsColumns,
      form.calibrationPoints,
    ),
    remarks: normalizeText(form.remarks) || null,
  }
}
