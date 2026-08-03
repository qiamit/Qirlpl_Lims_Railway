import {
  defaultRawDataSheetTemplate,
  parseRawDataSheetTemplate,
  serializeRawDataSheetTemplate,
  type RawDataSheetTemplate,
} from '@/features/calibration/rawDataSheetTypes'
import {
  parseCalibrationPointsTable,
  serializeCalibrationPointsTable,
  newCalibrationColumnId,
  newCalibrationPointId,
  type CalibrationPointsStored,
  type CalibrationPointsColumn,
  type CalibrationPointRow,
} from '@/features/calibration/equipment-for-calibration/types'
import {
  defaultMuCalculationTemplate,
  muCalculationTemplateFromRaw,
  serializeMuCalculationTemplate,
  type MuCalculationTemplate,
} from './muCalculationTypes'

export type { RawDataSheetTemplate }
export type { CalibrationPointsStored, CalibrationPointsColumn, CalibrationPointRow }
export type { MuCalculationTemplate }

/** Header used for the single default column when a range has no master table yet. */
export const DEFAULT_RANGE_POINT_COLUMN_HEADER = 'Calibration Point / Check Point'

export type EquipmentStatus = 'Active' | 'In Repair' | 'Idle'

export const EQUIPMENT_STATUSES: EquipmentStatus[] = ['Active', 'In Repair', 'Idle']

/** Stored in equipment_master.measurement_ranges (jsonb). */
export type MeasurementRangeStored = {
  range_capacity: string
  resolution_least_count: string
  unit?: string
  accuracy?: string
  /** One or more reference standards (equipment_for_calibration ids) for this range. */
  master_equipment_ids?: string[]
  /** Legacy single master — migrated into master_equipment_ids on read. */
  master_equipment_id?: string | null
  calibration_points?: Array<{
    id?: string
    point_value?: string
    pointValue?: string
    percent?: number | null
  }>
  /** Full multi-column check-point table, imported as-is from the master equipment. */
  calibration_points_table?: CalibrationPointsStored | null
  /**
   * Per-master point tabs (keeps each master's table separate — no mixing).
   * When present, preferred over the single calibration_points_table for editing.
   */
  master_points_tabs?: Array<{
    id?: string
    master_equipment_id?: string | null
    calibration_points_table?: CalibrationPointsStored | null
  }>
}

export type RangeCalibrationPoint = {
  id: string
  pointValue: string
  /** Legacy full-scale percent (kept for backward-compat; no longer auto-generated). */
  percent: number | null
}

/** One master + its own points table (UI tab). */
export type MasterPointsTab = {
  id: string
  masterEquipmentId: string
  calibrationPointsTable: CalibrationPointsStored
}

export type EquipmentRangeEntry = {
  id: string
  rangeCapacity: string
  resolutionLeastCount: string
  unit: string
  accuracy: string
  /** Master / reference equipment ids for this range (derived from masterPointsTabs). */
  masterEquipmentIds: string[]
  /** Derived nominal check-point list (first / nominal column of the primary table). */
  calibrationPoints: RangeCalibrationPoint[]
  /**
   * Primary table for seeding Raw Data Sheet (first tab with points, else first tab).
   * Kept for backward compatibility with consumers that expect one table.
   */
  calibrationPointsTable: CalibrationPointsStored
  /** Per-master tabs — each master keeps its own points (no data mix). */
  masterPointsTabs: MasterPointsTab[]
}

export type CalibrationEquipmentRow = {
  id: string
  asset_code: string
  equipment_name: string
  manufacturer?: string | null
  model_number?: string | null
  serial_number: string | null
  equipment_status: string | null
  range_capacity: string | null
  resolution_least_count: string | null
  measurement_ranges?: MeasurementRangeStored[] | null
  calibration_method_is_code_id?: string | null
  calibration_method_label?: string | null
  master_equipment_id?: string | null
  raw_data_sheet_template?: RawDataSheetTemplate | Record<string, unknown> | null
  mu_calculation_template?: MuCalculationTemplate | Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export type CalibrationEquipmentForm = {
  assetCode: string
  equipmentName: string
  /** Kept for form shape compatibility; not shown in Calibration Equipments UI. */
  manufacturer: string
  modelNumber: string
  serialNumber: string
  equipmentStatus: EquipmentStatus
  ranges: EquipmentRangeEntry[]
  calibrationMethodIsCodeId: string
  calibrationMethodLabel: string
  /** Columns + verification checklist for Conduct Raw Data Sheet. */
  rawDataSheetTemplate: RawDataSheetTemplate
  /** Measurement Uncertainty (MU) calculation sheet template. */
  muCalculationTemplate: MuCalculationTemplate
}

const RANGE_JOIN = ' | '

export function newEquipmentRangeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `rng-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function newRangeCalibrationPointId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyRangeCalibrationPoint(
  percent?: number | null,
): RangeCalibrationPoint {
  return {
    id: newRangeCalibrationPointId(),
    pointValue: '',
    percent: percent ?? null,
  }
}

/** Empty multi-column table shell. */
export function emptyCalibrationPointsTable(): CalibrationPointsStored {
  return { columns: [], rows: [] }
}

/** Single-column manual table used when a range has no master table yet. */
export function singleColumnPointsTable(): CalibrationPointsStored {
  const col: CalibrationPointsColumn = {
    id: newCalibrationColumnId(),
    header: DEFAULT_RANGE_POINT_COLUMN_HEADER,
  }
  return { columns: [col], rows: [{ id: newCalibrationPointId(), values: { [col.id]: '' } }] }
}

/** Column that holds the nominal check-point value (header contains "nominal", else first). */
export function nominalColumnId(table: CalibrationPointsStored): string | null {
  if (table.columns.length === 0) return null
  const byNominal = table.columns.find((c) => c.header.trim().toLowerCase().includes('nominal'))
  return (byNominal ?? table.columns[0]!).id
}

/** Derive the legacy nominal point list from the full table (for downstream consumers). */
export function rangePointsFromTable(table: CalibrationPointsStored): RangeCalibrationPoint[] {
  const colId = nominalColumnId(table)
  if (!colId) return []
  return table.rows
    .map((r) => ({
      id: r.id || newRangeCalibrationPointId(),
      pointValue: String(r.values[colId] ?? '').trim(),
      percent: null,
    }))
    .filter((p) => p.pointValue.length > 0)
}

/** Build a single-column table from a legacy nominal point array. */
function tableFromLegacyPoints(points: RangeCalibrationPoint[]): CalibrationPointsStored {
  if (points.length === 0) return emptyCalibrationPointsTable()
  const col: CalibrationPointsColumn = {
    id: newCalibrationColumnId(),
    header: DEFAULT_RANGE_POINT_COLUMN_HEADER,
  }
  return {
    columns: [col],
    rows: points.map((p) => ({
      id: p.id || newCalibrationPointId(),
      values: { [col.id]: p.pointValue },
    })),
  }
}

export function parseRangeCalibrationPoints(raw: unknown): RangeCalibrationPoint[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const pointValue = String(row.point_value ?? row.pointValue ?? '').trim()
      if (!pointValue) return null
      const percentRaw = row.percent
      const percent =
        typeof percentRaw === 'number' && Number.isFinite(percentRaw)
          ? percentRaw
          : percentRaw != null && String(percentRaw).trim() !== ''
            ? Number(percentRaw)
            : null
      return {
        id: String(row.id ?? newRangeCalibrationPointId()),
        pointValue,
        percent: percent != null && Number.isFinite(percent) ? percent : null,
      } satisfies RangeCalibrationPoint
    })
    .filter((x): x is RangeCalibrationPoint => x != null)
}

export function serializeRangeCalibrationPoints(
  points: RangeCalibrationPoint[],
): Array<{ id: string; point_value: string; percent: number | null }> {
  return points
    .map((p) => ({
      id: p.id || newRangeCalibrationPointId(),
      point_value: normalizeText(p.pointValue),
      percent:
        typeof p.percent === 'number' && Number.isFinite(p.percent) ? p.percent : null,
    }))
    .filter((p) => p.point_value.length > 0)
}

export function newMasterPointsTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `mpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyMasterPointsTab(masterEquipmentId = ''): MasterPointsTab {
  return {
    id: newMasterPointsTabId(),
    masterEquipmentId,
    calibrationPointsTable: emptyCalibrationPointsTable(),
  }
}

function tableHasPointValues(table: CalibrationPointsStored): boolean {
  return table.rows.some((row) =>
    Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
  )
}

/** Primary table for a range: first tab with values, else fallback with values, else structure. */
export function primaryCalibrationPointsTable(
  tabs: MasterPointsTab[],
  fallback: CalibrationPointsStored = emptyCalibrationPointsTable(),
): CalibrationPointsStored {
  const withPoints = tabs.find((t) => tableHasPointValues(t.calibrationPointsTable))
  if (withPoints) return withPoints.calibrationPointsTable

  // Important: empty master tabs must NOT hide a filled range-level fallback table.
  if (tableHasPointValues(fallback)) return fallback

  const withColumns = tabs.find((t) => t.calibrationPointsTable.columns.length > 0)
  if (withColumns) return withColumns.calibrationPointsTable
  if (fallback.columns.length > 0) return fallback

  return tabs[0]?.calibrationPointsTable ?? fallback
}

export function masterEquipmentIdsFromTabs(tabs: MasterPointsTab[]): string[] {
  const ids: string[] = []
  for (const tab of tabs) {
    const id = tab.masterEquipmentId.trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function parseMasterPointsTabs(
  rawTabs: unknown,
  masterEquipmentIds: string[],
  fallbackTable: CalibrationPointsStored,
): MasterPointsTab[] {
  if (Array.isArray(rawTabs) && rawTabs.length > 0) {
    return rawTabs
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>
        const table = parseCalibrationPointsTable(
          row.calibration_points_table ?? row.calibrationPointsTable,
        )
        return {
          id: String(row.id ?? newMasterPointsTabId()),
          masterEquipmentId: String(
            row.master_equipment_id ?? row.masterEquipmentId ?? '',
          ).trim(),
          calibrationPointsTable: table,
        } satisfies MasterPointsTab
      })
      .filter((x): x is MasterPointsTab => x != null)
  }

  // Migrate legacy: one shared table + master id list → one tab per master
  if (masterEquipmentIds.length > 0) {
    return masterEquipmentIds.map((id, index) => ({
      id: newMasterPointsTabId(),
      masterEquipmentId: id,
      calibrationPointsTable:
        index === 0 ? fallbackTable : emptyCalibrationPointsTable(),
    }))
  }

  if (fallbackTable.columns.length > 0 || fallbackTable.rows.length > 0) {
    return [
      {
        id: newMasterPointsTabId(),
        masterEquipmentId: '',
        calibrationPointsTable: fallbackTable,
      },
    ]
  }

  return [emptyMasterPointsTab()]
}

export function emptyEquipmentRangeEntry(): EquipmentRangeEntry {
  const tab = emptyMasterPointsTab()
  return {
    id: newEquipmentRangeId(),
    rangeCapacity: '',
    resolutionLeastCount: '',
    unit: '',
    accuracy: '',
    masterEquipmentIds: [],
    calibrationPoints: [],
    calibrationPointsTable: emptyCalibrationPointsTable(),
    masterPointsTabs: [tab],
  }
}

export function emptyCalibrationEquipmentForm(): CalibrationEquipmentForm {
  return {
    assetCode: '',
    equipmentName: '',
    manufacturer: '',
    modelNumber: '',
    serialNumber: '',
    equipmentStatus: 'Active',
    ranges: [emptyEquipmentRangeEntry()],
    calibrationMethodIsCodeId: '',
    calibrationMethodLabel: '',
    rawDataSheetTemplate: defaultRawDataSheetTemplate(),
    muCalculationTemplate: defaultMuCalculationTemplate(),
  }
}

function parseMasterEquipmentIds(raw: unknown, legacySingle?: unknown): string[] {
  const ids: string[] = []
  const push = (v: unknown) => {
    const id = String(v ?? '').trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (Array.isArray(raw)) {
    for (const item of raw) push(item)
  }
  push(legacySingle)
  return ids
}

export function rawDataSheetTemplateFromRow(
  row: CalibrationEquipmentRow,
): RawDataSheetTemplate {
  return parseRawDataSheetTemplate(row.raw_data_sheet_template) ?? defaultRawDataSheetTemplate()
}

export function serializeEquipmentRawDataSheetTemplate(
  template: RawDataSheetTemplate,
): RawDataSheetTemplate {
  return serializeRawDataSheetTemplate(template)
}

export function muCalculationTemplateFromRow(
  row: CalibrationEquipmentRow,
): MuCalculationTemplate {
  return muCalculationTemplateFromRaw(row.mu_calculation_template)
}

export function serializeEquipmentMuCalculationTemplate(
  template: MuCalculationTemplate,
): MuCalculationTemplate {
  return serializeMuCalculationTemplate(template)
}

export function normalizeText(value: string): string {
  return value.trim()
}

/** Lower/upper numeric bounds from strings like "0 - 200", "0–400 kN", "50". */
export function parseRangeCapacitySortKey(rangeCapacity: string): {
  lo: number
  hi: number
} {
  const nums =
    rangeCapacity
      .trim()
      .match(/-?\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter((n) => Number.isFinite(n)) ?? []
  if (nums.length === 0) {
    return { lo: Number.POSITIVE_INFINITY, hi: Number.POSITIVE_INFINITY }
  }
  if (nums.length === 1) {
    const n = nums[0]!
    return { lo: n, hi: n }
  }
  const a = nums[0]!
  const b = nums[1]!
  return { lo: Math.min(a, b), hi: Math.max(a, b) }
}

/** Ascending: chhoti range pehle, badi baad me. Empty ranges last. */
export function compareRangeCapacityAsc(a: string, b: string): number {
  const A = parseRangeCapacitySortKey(a)
  const B = parseRangeCapacitySortKey(b)
  if (A.lo !== B.lo) return A.lo - B.lo
  if (A.hi !== B.hi) return A.hi - B.hi
  return a.trim().localeCompare(b.trim())
}

export function sortEquipmentRangesByCapacityAsc(
  ranges: EquipmentRangeEntry[],
): EquipmentRangeEntry[] {
  return [...ranges].sort((x, y) =>
    compareRangeCapacityAsc(x.rangeCapacity, y.rangeCapacity),
  )
}

export function parseMeasurementRanges(
  raw: unknown,
  fallbackRange?: string | null,
  fallbackResolution?: string | null,
  fallbackMasterEquipmentId?: string | null,
): EquipmentRangeEntry[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const parsed = raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>
        const rangeCapacity = String(row.range_capacity ?? row.rangeCapacity ?? '').trim()
        const resolutionLeastCount = String(
          row.resolution_least_count ?? row.resolutionLeastCount ?? '',
        ).trim()
        const unit = String(row.unit ?? '').trim()
        const accuracy = String(row.accuracy ?? '').trim()
        const legacyPoints = parseRangeCalibrationPoints(
          row.calibration_points ?? row.calibrationPoints,
        )
        const parsedTable = parseCalibrationPointsTable(
          row.calibration_points_table ?? row.calibrationPointsTable,
        )
        const calibrationPointsTable =
          parsedTable.columns.length > 0 ? parsedTable : tableFromLegacyPoints(legacyPoints)
        const calibrationPoints = rangePointsFromTable(calibrationPointsTable)
        const masterEquipmentIds = parseMasterEquipmentIds(
          row.master_equipment_ids ?? row.masterEquipmentIds,
          row.master_equipment_id ?? row.masterEquipmentId,
        )
        const masterPointsTabs = parseMasterPointsTabs(
          row.master_points_tabs ?? row.masterPointsTabs,
          masterEquipmentIds,
          calibrationPointsTable,
        )
        const primaryTable = primaryCalibrationPointsTable(
          masterPointsTabs,
          calibrationPointsTable,
        )
        const derivedIds = masterEquipmentIdsFromTabs(masterPointsTabs)
        // Union tabs + stored ids so a partial tabs list never hides other linked masters.
        const resolvedMasterIds: string[] = []
        for (const id of [...derivedIds, ...masterEquipmentIds]) {
          const t = id.trim()
          if (t && !resolvedMasterIds.includes(t)) resolvedMasterIds.push(t)
        }
        // Ensure every resolved id has a tab (empty points ok).
        let resolvedTabs = masterPointsTabs
        if (resolvedMasterIds.length > 0) {
          const tabIds = new Set(
            masterPointsTabs.map((t) => t.masterEquipmentId.trim()).filter(Boolean),
          )
          const missing = resolvedMasterIds.filter((id) => !tabIds.has(id))
          if (missing.length > 0 || masterPointsTabs.length === 0) {
            resolvedTabs = resolvedMasterIds.map((id, index) => {
              const existing = masterPointsTabs.find((t) => t.masterEquipmentId.trim() === id)
              if (existing) return existing
              return {
                id: newMasterPointsTabId(),
                masterEquipmentId: id,
                calibrationPointsTable:
                  index === 0 && masterPointsTabs[0] && !masterPointsTabs[0].masterEquipmentId.trim()
                    ? masterPointsTabs[0].calibrationPointsTable
                    : emptyCalibrationPointsTable(),
              }
            })
          }
        }
        if (
          !rangeCapacity &&
          !resolutionLeastCount &&
          !unit &&
          !accuracy &&
          calibrationPoints.length === 0 &&
          calibrationPointsTable.columns.length === 0 &&
          resolvedMasterIds.length === 0 &&
          resolvedTabs.every(
            (t) =>
              !t.masterEquipmentId &&
              t.calibrationPointsTable.columns.length === 0 &&
              t.calibrationPointsTable.rows.length === 0,
          )
        ) {
          return null
        }
        return {
          id: newEquipmentRangeId(),
          rangeCapacity,
          resolutionLeastCount,
          unit,
          accuracy,
          masterEquipmentIds: resolvedMasterIds,
          calibrationPoints: rangePointsFromTable(primaryTable),
          calibrationPointsTable: primaryTable,
          masterPointsTabs: resolvedTabs,
        } satisfies EquipmentRangeEntry
      })
      .filter((x): x is EquipmentRangeEntry => x != null)

    if (parsed.length > 0) {
      const legacyMaster = (fallbackMasterEquipmentId ?? '').trim()
      if (!legacyMaster) return sortEquipmentRangesByCapacityAsc(parsed)
      // Migrate equipment-level master onto ranges that have none yet.
      return sortEquipmentRangesByCapacityAsc(
        parsed.map((r) =>
          (r.masterEquipmentIds ?? []).length > 0
            ? r
            : { ...r, masterEquipmentIds: [legacyMaster] },
        ),
      )
    }
  }

  const range = (fallbackRange ?? '').trim()
  const resolution = (fallbackResolution ?? '').trim()
  const legacyMaster = (fallbackMasterEquipmentId ?? '').trim()
  if (!range && !resolution && !legacyMaster) return [emptyEquipmentRangeEntry()]

  // CSV / legacy may store multi values joined with " | "
  const ranges = range.includes(RANGE_JOIN) ? range.split(RANGE_JOIN).map((s) => s.trim()) : [range]
  const resolutions = resolution.includes(RANGE_JOIN)
    ? resolution.split(RANGE_JOIN).map((s) => s.trim())
    : [resolution]
  const len = Math.max(ranges.length, resolutions.length, 1)

  return sortEquipmentRangesByCapacityAsc(
    Array.from({ length: len }, (_, i) => ({
      id: newEquipmentRangeId(),
      rangeCapacity: ranges[i] ?? '',
      resolutionLeastCount: resolutions[i] ?? '',
      unit: '',
      accuracy: '',
      masterEquipmentIds: legacyMaster ? [legacyMaster] : [],
      calibrationPoints: [],
      calibrationPointsTable: emptyCalibrationPointsTable(),
      masterPointsTabs: [emptyMasterPointsTab(legacyMaster)],
    })),
  )
}

export function serializeMeasurementRanges(
  ranges: EquipmentRangeEntry[],
): MeasurementRangeStored[] {
  return sortEquipmentRangesByCapacityAsc(ranges)
    .map((r) => {
      const tabs =
        r.masterPointsTabs?.length > 0
          ? r.masterPointsTabs
          : [
              {
                id: newMasterPointsTabId(),
                masterEquipmentId: (r.masterEquipmentIds ?? [])[0] ?? '',
                calibrationPointsTable:
                  r.calibrationPointsTable ?? emptyCalibrationPointsTable(),
              },
            ]
      const primaryTable = primaryCalibrationPointsTable(
        tabs,
        r.calibrationPointsTable ?? emptyCalibrationPointsTable(),
      )
      const serializedTable = serializeCalibrationPointsTable(
        primaryTable.columns,
        primaryTable.rows,
      )
      const derivedPoints = rangePointsFromTable(primaryTable)
      const masterIds = masterEquipmentIdsFromTabs(tabs)
      return {
        range_capacity: normalizeText(r.rangeCapacity),
        resolution_least_count: normalizeText(r.resolutionLeastCount),
        unit: normalizeText(r.unit),
        accuracy: normalizeText(r.accuracy),
        master_equipment_ids: masterIds,
        calibration_points: serializeRangeCalibrationPoints(derivedPoints),
        calibration_points_table: serializedTable,
        master_points_tabs: tabs.map((tab) => {
          const table = tab.calibrationPointsTable ?? emptyCalibrationPointsTable()
          return {
            id: tab.id || newMasterPointsTabId(),
            master_equipment_id: tab.masterEquipmentId.trim() || null,
            calibration_points_table: serializeCalibrationPointsTable(
              table.columns,
              table.rows,
            ),
          }
        }),
      }
    })
    .filter(
      (r) =>
        r.range_capacity.length > 0 ||
        r.resolution_least_count.length > 0 ||
        r.unit.length > 0 ||
        r.accuracy.length > 0 ||
        (r.master_equipment_ids?.length ?? 0) > 0 ||
        (r.calibration_points?.length ?? 0) > 0 ||
        ((r.calibration_points_table?.rows?.length ?? 0) > 0) ||
        (r.master_points_tabs?.some(
          (t) =>
            Boolean(t.master_equipment_id) ||
            ((t.calibration_points_table?.rows?.length ?? 0) > 0),
        ) ??
          false),
    )
}

/** First master across ranges — keeps legacy equipment_master.master_equipment_id in sync. */
export function primaryMasterEquipmentIdFromRanges(
  ranges: EquipmentRangeEntry[],
): string | null {
  for (const r of ranges) {
    const id = (r.masterEquipmentIds ?? []).find((x) => x.trim().length > 0)?.trim()
    if (id) return id
  }
  return null
}

/** Keep legacy text columns in sync for other modules / simple CSV. */
export function legacyRangeColumnsFromRanges(ranges: EquipmentRangeEntry[]): {
  range_capacity: string | null
  resolution_least_count: string | null
} {
  const stored = serializeMeasurementRanges(ranges)
  if (stored.length === 0) {
    return { range_capacity: null, resolution_least_count: null }
  }
  return {
    range_capacity: stored.map((r) => r.range_capacity).join(RANGE_JOIN) || null,
    resolution_least_count:
      stored.map((r) => r.resolution_least_count).join(RANGE_JOIN) || null,
  }
}

export function rangesFromRow(row: CalibrationEquipmentRow): EquipmentRangeEntry[] {
  return parseMeasurementRanges(
    row.measurement_ranges,
    row.range_capacity,
    row.resolution_least_count,
    row.master_equipment_id,
  )
}

const INITIALS_STOP = new Set([
  'pvt',
  'ltd',
  'llp',
  'inc',
  'llc',
  'and',
  'the',
  'of',
  'for',
  'private',
  'limited',
  'company',
  'co',
])

/**
 * First 2 significant words → initials.
 * "Quality Engineering Lab" → "QE"
 * "Qirlpl" → "QI" (first 2 letters)
 */
export function companyTwoWordInitials(labName: string, fallback = 'QI'): string {
  const raw = labName.trim()
  if (!raw) return fallback

  const words = raw
    .split(/[\s,/&.\-]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => {
      const n = w.toLowerCase()
      return n.length > 0 && !INITIALS_STOP.has(n)
    })

  if (words.length === 0) return fallback
  if (words.length === 1) {
    return (words[0]!.slice(0, 2).toUpperCase() || fallback)
  }

  return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase() || fallback
}

/**
 * Auto asset code: {Company2Initials}-EQ-{0001}
 * e.g. Quality Engineering → QE-EQ-0001
 */
export function nextCalibrationAssetCode(
  labName: string,
  existingCodes: string[],
): string {
  const initials = companyTwoWordInitials(labName)
  const prefix = `${initials}-EQ-`
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i')

  let max = 0
  for (const code of existingCodes) {
    const m = code.trim().match(re)
    if (!m) continue
    const n = Number.parseInt(m[1]!, 10)
    if (Number.isFinite(n) && n > max) max = n
  }

  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
