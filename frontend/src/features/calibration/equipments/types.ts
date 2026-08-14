import {
  computeFormulaValue,
  defaultRawDataSheetTemplate,
  parseRawDataSheetTemplate,
  serializeRawDataSheetTemplate,
  wrapBareFormulaColumnRef,
  type RawDataSheetColumn,
  type RawDataSheetRowValues,
  type RawDataSheetTemplate,
} from '@/features/calibration/rawDataSheetTypes'
import { computeCalibrationPointRowValuesFromMaster } from '@/features/calibration/equipment-for-calibration/calibrationPointsFormula'
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
  parseMuCalculationTemplate,
  serializeMuCalculationTemplate,
  MU_CALIBRATION_POINT_FIELD_KEY,
  isMuEquipmentRangeFieldKey,
  type MuCalculationTemplate,
} from './muCalculationTypes'
import { buildMuBuiltinValues, type MuEquipmentRangeContext } from './muCalcEngine'
import {
  POINTS_FORMULA_REF_PREFIX,
  isPointsFormulaRefKey,
  masterPointsFormulaRefColumns,
  pointsHeaderSlug,
} from '@/features/calibration/masterEquipmentFormulaRefs'
import {
  defaultCalibrationCertificateTemplate,
  parseCalibrationCertificateTemplate,
  serializeCalibrationCertificateTemplate,
  type CalibrationCertificateTemplate,
} from './certificateTemplateTypes'
import {
  emptyEquipmentChecklistItems,
  parseEquipmentChecklistTemplate,
  type ConductOutsideChecklistItem,
} from '@/features/calibration/handling/jobs/conductOutsideChecklist'

export type { RawDataSheetTemplate }
export type { CalibrationPointsStored, CalibrationPointsColumn, CalibrationPointRow }
export type { MuCalculationTemplate }
export type { CalibrationCertificateTemplate }

/** Header used for the single default column when a range has no master table yet. */
export const DEFAULT_RANGE_POINT_COLUMN_HEADER = 'Calibration Point / Check Point'

export type EquipmentStatus = 'Active' | 'In Repair' | 'Idle'

export const EQUIPMENT_STATUSES: EquipmentStatus[] = ['Active', 'In Repair', 'Idle']

/** Stored in equipment_master.measurement_ranges (jsonb). */
export type MeasurementRangeStored = {
  /** Stable id for range-scoped templates and View Factor rangeId. */
  id?: string
  /** Legacy combined label e.g. "0 - 100" (kept for older readers). */
  range_capacity: string
  /** Preferred split bounds. */
  range_min?: string
  range_max?: string
  resolution_least_count: string
  unit?: string
  accuracy?: string
  /** Accreditation body id — same source as Test Parameter “Under Accreditation”. */
  accreditation_scope_id?: string | null
  accreditationScopeId?: string | null
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
  /** Per-range Raw Data Sheet format (preferred over equipment-level). */
  raw_data_sheet_template?: RawDataSheetTemplate | Record<string, unknown> | null
  /** Per-range MU calculation sheet (preferred over equipment-level). */
  mu_calculation_template?: MuCalculationTemplate | Record<string, unknown> | null
  /** Per-range Generate Report config (preferred over equipment-level). */
  generate_report_config?: GenerateReportConfig | Record<string, unknown> | null
  /** Per-range Calibration Certificate template (preferred over equipment-level). */
  certificate_template_config?: CalibrationCertificateTemplate | Record<string, unknown> | null
  /** Manual Mode of Calibration for certificate (preferred over equipment-level). */
  mode_of_calibration?: string | null
  modeOfCalibration?: string | null
  /** Manual Method Used for certificate (preferred over equipment-level). */
  method_used?: string | null
  methodUsed?: string | null
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
  rangeMin: string
  rangeMax: string
  /** Derived "min - max" (legacy display / sort / CSV sync). */
  rangeCapacity: string
  resolutionLeastCount: string
  unit: string
  accuracy: string
  /** accreditation_bodies.id — linked to Test Parameter Under Accreditation. */
  accreditationScopeId: string
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
  /** Per-range Raw Data Sheet format (optional — equipment-level is fallback). */
  rawDataSheetTemplate?: RawDataSheetTemplate
  /** Per-range MU calculation sheet (optional — equipment-level is fallback). */
  muCalculationTemplate?: MuCalculationTemplate
  /** Per-range Generate Report config (optional — equipment-level is fallback). */
  generateReportConfig?: GenerateReportConfig
  /** Per-range Calibration Certificate template (optional — equipment-level is fallback). */
  certificateTemplate?: CalibrationCertificateTemplate
  /** Manual Mode of Calibration for certificate (e.g. Tension / Compression). */
  modeOfCalibration?: string
  /** Manual Method Used for certificate. */
  methodUsed?: string
}

/** Equipment-level templates used as fallback when a range has none. */
export type EquipmentTemplateFallback = {
  rawDataSheetTemplate?: RawDataSheetTemplate | null
  muCalculationTemplate?: MuCalculationTemplate | null
  generateReportConfig?: GenerateReportConfig | null
  certificateTemplate?: CalibrationCertificateTemplate | null
  modeOfCalibration?: string | null
  methodUsed?: string | null
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
  /** Generate Report button visibility + column defaults for Raw Data Sheet. */
  generate_report_config?: GenerateReportConfig | Record<string, unknown> | null
  /** Calibration Certificate template defaults for Certificate Preparation. */
  certificate_template_config?: CalibrationCertificateTemplate | Record<string, unknown> | null
  outgoing_checklist_template?: Record<string, unknown> | null
  inward_checklist_template?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

/** How Randomness Factor is interpreted when generating readings. */
export type GenerateReportRandomnessMode =
  | 'percent'
  | 'absolute'
  | 'range_span'
  | 'range_max'

/** Equipment check-point plus resolved Reference for View Factor editor rows. */
export type EquipmentNominalPointReferenceEntry = {
  point: string
  referenceValue: string
  rangeId: string
}

/** Per-point View Factor (randomness) settings inside a Generate Report Format row. */
export type GenerateReportPointRandomness = {
  id: string
  /** Point label e.g. "100". */
  point: string
  /**
   * Resolved Reference value for this row when the same point appears in multiple
   * ranges with different references. Apply disambiguates by point + referenceValue.
   */
  referenceValue?: string
  /** Measurement range that owns this point (range_span / range_max preview). */
  rangeId?: string
  /**
   * Legacy flag from older configs. Ignored on parse/apply — only point-matched
   * entries are used. Kept optional for backward-compatible JSON shape.
   */
  isDefault?: boolean
  randomnessMode: GenerateReportRandomnessMode
  randomnessFactor: string
  randomnessFloor: string
  randomnessCap: string
}

/** One Generate Report Format mapping row (Input ↔ Reference + rounding). */
export type GenerateReportConfigRow = {
  id: string
  inputColumnKey: string
  referenceColumnKey: string
  /**
   * Legacy top-level Randomness Factor (unused for Apply).
   * Apply uses randomnessByPoint matched by sheet point only.
   * Meaning depends on randomnessMode when historically used:
   * percent → % of |scaled Ref|; absolute → fixed ± units;
   * range_span → % of |Range Max − Range Min|; range_max → % of |Range Max|.
   */
  randomnessFactor: string
  /** Legacy top-level mode — unused for Apply; kept for backward-compatible JSON. */
  randomnessMode: GenerateReportRandomnessMode
  /** Legacy top-level min absolute band — unused for Apply. */
  randomnessFloor: string
  /** Legacy top-level max absolute band — unused for Apply. */
  randomnessCap: string
  /**
   * Per-point View Factor settings. Apply matches by point; when multiple configs
   * share a point, referenceValue disambiguates. Rows without a match are skipped.
   */
  randomnessByPoint?: GenerateReportPointRandomness[]
  roundOff: string
  decimalPlaces: number
}

/** Stored in equipment_master.generate_report_config (jsonb). */
export type GenerateReportConfig = {
  enabled: boolean
  rows: GenerateReportConfigRow[]
}

export function newGenerateReportRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `grr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function newGenerateReportPointRandomnessId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function parseGenerateReportRandomnessMode(
  raw: unknown,
): GenerateReportRandomnessMode {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (v === 'absolute') return 'absolute'
  if (v === 'range_span') return 'range_span'
  if (v === 'range_max') return 'range_max'
  return 'percent'
}

export function emptyGenerateReportPointRandomness(
  overrides?: Partial<Omit<GenerateReportPointRandomness, 'id'>> & { id?: string },
): GenerateReportPointRandomness {
  const referenceValue = String(overrides?.referenceValue ?? '').trim()
  const rangeId = String(overrides?.rangeId ?? '').trim()
  return {
    id: overrides?.id ?? newGenerateReportPointRandomnessId(),
    point: overrides?.point ?? '',
    ...(referenceValue ? { referenceValue } : {}),
    ...(rangeId ? { rangeId } : {}),
    isDefault: overrides?.isDefault ?? false,
    randomnessMode: parseGenerateReportRandomnessMode(
      overrides?.randomnessMode ?? 'percent',
    ),
    randomnessFactor: overrides?.randomnessFactor ?? '',
    randomnessFloor: overrides?.randomnessFloor ?? '',
    randomnessCap: overrides?.randomnessCap ?? '',
  }
}

function parseGenerateReportPointRandomnessList(
  raw: unknown,
): GenerateReportPointRandomness[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const rows = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const point = String(o.point ?? '').trim()
      const isDefault = Boolean(o.isDefault ?? o.is_default) || point.length === 0
      // Strip legacy Default rows — only per-point configs apply.
      if (isDefault || !point) return null
      return emptyGenerateReportPointRandomness({
        id: String(o.id ?? newGenerateReportPointRandomnessId()),
        point,
        referenceValue: String(o.referenceValue ?? o.reference_value ?? '').trim(),
        rangeId: String(o.rangeId ?? o.range_id ?? '').trim(),
        isDefault: false,
        randomnessMode: parseGenerateReportRandomnessMode(
          o.randomnessMode ?? o.randomness_mode,
        ),
        randomnessFactor: String(o.randomnessFactor ?? o.randomness_factor ?? '').trim(),
        randomnessFloor: String(o.randomnessFloor ?? o.randomness_floor ?? '').trim(),
        randomnessCap: String(o.randomnessCap ?? o.randomness_cap ?? '').trim(),
      })
    })
    .filter((x): x is GenerateReportPointRandomness => x != null)
  return rows.length > 0 ? rows : undefined
}

/** Numeric-aware equality for load / calibration points (e.g. "100" === "100.0"). */
export function generateReportPointsMatch(a: string, b: string): boolean {
  const left = String(a ?? '').trim()
  const right = String(b ?? '').trim()
  if (!left || !right) return false
  const na = Number(left)
  const nb = Number(right)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return left === right
}

function pointLookupKey(point: string): string {
  const v = point.trim()
  const n = Number(v)
  if (Number.isFinite(n)) return `n:${n}`
  return `s:${v.toLowerCase()}`
}

function referenceLookupToken(raw: string): string {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  const n = parseGenerateReportReferenceNumber(v)
  if (n != null && Number.isFinite(n)) return `n:${n}`
  return `s:${v.toLowerCase()}`
}

/** Lookup key for View Factor editor rows and stored overrides. */
export function viewFactorRowLookupKey(
  point: string,
  referenceValue?: string,
  rangeId?: string,
): string {
  const pk = pointLookupKey(point)
  const refToken = referenceLookupToken(String(referenceValue ?? ''))
  const rangeToken = String(rangeId ?? '').trim()
  let key = pk
  if (refToken) key = `${key}|ref:${refToken}`
  if (rangeToken) key = `${key}|range:${rangeToken}`
  return key
}

function lookupGenerateReportRandomnessOverride(
  entry: Pick<EquipmentNominalPointReferenceEntry, 'point' | 'referenceValue' | 'rangeId'>,
  overrideByKey: Map<string, GenerateReportPointRandomness>,
): GenerateReportPointRandomness | undefined {
  const rangeId = String(entry.rangeId ?? '').trim()
  const withRange = viewFactorRowLookupKey(entry.point, entry.referenceValue, rangeId)
  const foundWithRange = overrideByKey.get(withRange)
  if (foundWithRange) return foundWithRange
  if (rangeId) {
    return overrideByKey.get(viewFactorRowLookupKey(entry.point, entry.referenceValue))
  }
  return undefined
}

/** Numeric / text equality for Reference values (Apply disambiguation). */
export function generateReportReferenceValuesMatch(a: string, b: string): boolean {
  const left = String(a ?? '').trim()
  const right = String(b ?? '').trim()
  if (!left || !right) return false
  if (left === right) return true
  const na = parseGenerateReportReferenceNumber(left)
  const nb = parseGenerateReportReferenceNumber(right)
  if (na != null && nb != null) return na === nb
  return left.toLowerCase() === right.toLowerCase()
}

/**
 * Unique nominal check-points from each range's primary calibration table,
 * ascending by numeric (deduped globally for legacy no-reference View Factor rows).
 */
export function collectEquipmentNominalPoints(ranges: EquipmentRangeEntry[]): string[] {
  const byKey = new Map<string, string>()
  const add = (raw: string) => {
    const v = String(raw ?? '').trim()
    if (!v) return
    const lookup = pointLookupKey(v)
    if (!byKey.has(lookup)) byKey.set(lookup, v)
  }
  for (const range of ranges) {
    for (const table of calibrationPointsTablesForViewFactor(range)) {
      const colId = nominalColumnId(table)
      if (!colId) continue
      for (const row of table.rows) {
        add(String(row.values[colId] ?? ''))
      }
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return a.localeCompare(b, undefined, { numeric: true })
  })
}

/**
 * One View Factor row per calibration-point table row on each master tab
 * for the range (Measurement Ranges → Masters & Points).
 * Does NOT collapse duplicate load values across masters — if Master A and
 * Master B both have point 100, both rows appear (8+11 stays 19, not 13 unique).
 */
export function collectEquipmentNominalPointReferenceEntries(
  ranges: EquipmentRangeEntry[],
  referenceKey: string,
  sheetColumns: RawDataSheetColumn[],
): EquipmentNominalPointReferenceEntry[] {
  const key = String(referenceKey ?? '').trim()
  const entries: EquipmentNominalPointReferenceEntry[] = []
  const seenRowKeys = new Set<string>()

  const pushRowsFromTable = (
    range: EquipmentRangeEntry,
    table: CalibrationPointsStored,
    sourceKey: string,
  ) => {
    const colId = nominalColumnId(table)
    if (!colId) return
    for (const row of table.rows) {
      const point = String(row.values[colId] ?? '').trim()
      if (!point) continue
      const rowKey = `${range.id}|${sourceKey}|${row.id}`
      if (seenRowKeys.has(rowKey)) continue
      seenRowKeys.add(rowKey)

      const referenceValue = key
        ? resolveGenerateReportReferenceValueForRangePoint(
            key,
            point,
            range,
            sheetColumns,
            row,
            table,
          )
        : ''
      entries.push({ point, referenceValue, rangeId: range.id })
    }
  }

  for (const range of ranges) {
    const tabs = range.masterPointsTabs ?? []
    const tabsWithPoints = tabs.filter((t) =>
      tableHasPointValues(t.calibrationPointsTable),
    )

    if (tabsWithPoints.length > 0) {
      for (const tab of tabsWithPoints) {
        pushRowsFromTable(range, tab.calibrationPointsTable, `tab:${tab.id}`)
      }
      continue
    }

    // No master-tab points — fall back to range-level / legacy sources.
    for (const table of calibrationPointsTablesForViewFactor(range)) {
      pushRowsFromTable(range, table, `fallback:${table.columns[0]?.id ?? 't'}`)
    }
  }

  return entries.sort((a, b) => {
    const rangeOrder =
      ranges.findIndex((r) => r.id === a.rangeId) -
      ranges.findIndex((r) => r.id === b.rangeId)
    if (rangeOrder !== 0) return rangeOrder

    const na = Number(a.point)
    const nb = Number(b.point)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    const byPoint = a.point.localeCompare(b.point, undefined, { numeric: true })
    if (byPoint !== 0) return byPoint
    return a.referenceValue.localeCompare(b.referenceValue, undefined, { numeric: true })
  })
}

/** Count per-point View Factor configs that have a non-empty factor. */
export function countConfiguredViewFactorPoints(row: GenerateReportConfigRow): number {
  return (row.randomnessByPoint ?? []).filter(
    (p) => !p.isDefault && p.point.trim().length > 0 && p.randomnessFactor.trim().length > 0,
  ).length
}

/** Count stored View Factor point rows (factor may still be empty). */
export function countViewFactorPointRows(row: GenerateReportConfigRow): number {
  return (row.randomnessByPoint ?? []).filter(
    (p) => !p.isDefault && p.point.trim().length > 0,
  ).length
}

/**
 * Button / chip label for View Factor column.
 * Prefer `availablePointCount` (range points shown in editor) when provided so the
 * label matches Measurement Ranges → Points, not only rows with a filled factor.
 */
export function summarizeGenerateReportViewFactor(
  row: GenerateReportConfigRow,
  availablePointCount?: number,
): string {
  const available =
    typeof availablePointCount === 'number' && Number.isFinite(availablePointCount)
      ? Math.max(0, Math.round(availablePointCount))
      : 0
  const stored = countViewFactorPointRows(row)
  const configured = countConfiguredViewFactorPoints(row)
  const n = Math.max(available, stored, configured)
  if (n > 0) return `View Factor · ${n} pts`
  return 'View Factor'
}

/**
 * Resolve View Factor for a sheet data row by matching randomnessByPoint.
 * When multiple configs share a point, referenceRaw disambiguates via referenceValue.
 * Returns null when no matching config (or factor empty) — no Default fallback.
 */
export function resolveGenerateReportRandomnessForPoint(
  row: GenerateReportConfigRow,
  pointValue: string | null | undefined,
  referenceRaw?: string | null | undefined,
): Pick<
  GenerateReportPointRandomness,
  'randomnessMode' | 'randomnessFactor' | 'randomnessFloor' | 'randomnessCap'
> | null {
  const point = String(pointValue ?? '').trim()
  if (!point) return null
  const byPoint = row.randomnessByPoint ?? []
  const pointMatches = byPoint.filter(
    (e) => !e.isDefault && e.point.trim() && generateReportPointsMatch(e.point, point),
  )
  if (pointMatches.length === 0) return null

  const refToken = String(referenceRaw ?? '').trim()
  let match: GenerateReportPointRandomness | undefined

  if (pointMatches.length === 1) {
    match = pointMatches[0]
  } else if (refToken) {
    match = pointMatches.find((e) => {
      const stored = String(e.referenceValue ?? '').trim()
      return stored && generateReportReferenceValuesMatch(stored, refToken)
    })
    if (!match) {
      const legacy = pointMatches.filter((e) => !String(e.referenceValue ?? '').trim())
      if (legacy.length === 1) match = legacy[0]
    }
  } else {
    const legacy = pointMatches.filter((e) => !String(e.referenceValue ?? '').trim())
    match = legacy.length === 1 ? legacy[0] : legacy[0] ?? pointMatches[0]
  }

  if (!match) return null
  const factor = match.randomnessFactor.trim()
  if (!factor) return null
  return {
    randomnessMode: parseGenerateReportRandomnessMode(match.randomnessMode),
    randomnessFactor: factor,
    randomnessFloor: match.randomnessFloor,
    randomnessCap: match.randomnessCap,
  }
}

/**
 * Build equipment (point + reference) rows for the View Factor editor (no Default row).
 * Prefills from randomnessByPoint overrides; unmatched entries start empty.
 */
export function buildGenerateReportRandomnessEditorRows(
  row: GenerateReportConfigRow,
  entries: EquipmentNominalPointReferenceEntry[],
): GenerateReportPointRandomness[] {
  const existing = row.randomnessByPoint ?? []
  const overrideByKey = new Map<string, GenerateReportPointRandomness>()
  const legacyByPoint = new Map<string, GenerateReportPointRandomness>()
  for (const e of existing) {
    if (e.isDefault || !e.point.trim()) continue
    overrideByKey.set(viewFactorRowLookupKey(e.point, e.referenceValue, e.rangeId), e)
    overrideByKey.set(viewFactorRowLookupKey(e.point, e.referenceValue), e)
    if (!String(e.referenceValue ?? '').trim()) {
      legacyByPoint.set(pointLookupKey(e.point), e)
    }
  }

  const pointCounts = new Map<string, number>()
  for (const entry of entries) {
    const pk = pointLookupKey(entry.point)
    pointCounts.set(pk, (pointCounts.get(pk) ?? 0) + 1)
  }
  const legacyUsed = new Set<string>()

  return entries.map((entry) => {
    let found = lookupGenerateReportRandomnessOverride(entry, overrideByKey)
    if (!found) {
      const pk = pointLookupKey(entry.point)
      const legacy = legacyByPoint.get(pk)
      if (legacy && (pointCounts.get(pk) ?? 0) === 1 && !legacyUsed.has(pk)) {
        found = legacy
        legacyUsed.add(pk)
      }
    }
    if (found) {
      return emptyGenerateReportPointRandomness({
        id: found.id,
        point: entry.point,
        referenceValue: entry.referenceValue,
        rangeId: entry.rangeId,
        isDefault: false,
        randomnessMode: found.randomnessMode,
        randomnessFactor: found.randomnessFactor,
        randomnessFloor: found.randomnessFloor,
        randomnessCap: found.randomnessCap,
      })
    }
    return emptyGenerateReportPointRandomness({
      point: entry.point,
      referenceValue: entry.referenceValue,
      rangeId: entry.rangeId,
      isDefault: false,
      randomnessMode: 'percent',
      randomnessFactor: '',
      randomnessFloor: '',
      randomnessCap: '',
    })
  })
}

/** Point + reference rows for a Generate Report Format row (View Factor editor). */
export function buildViewFactorPointEntriesForGenerateReportRow(
  row: GenerateReportConfigRow,
  ranges: EquipmentRangeEntry[],
  sheetColumns: RawDataSheetColumn[],
  scopeRange?: EquipmentRangeEntry | null,
): EquipmentNominalPointReferenceEntry[] {
  const effectiveRanges = scopeRange ? [scopeRange] : ranges
  const refKey = String(row.referenceColumnKey ?? '').trim()
  // Always one editor row per master calibration-point row (not unique load values).
  return collectEquipmentNominalPointReferenceEntries(
    effectiveRanges,
    refKey,
    sheetColumns,
  )
}

export type GenerateReportRandomnessDraftCopyResult = {
  pointRows: GenerateReportPointRandomness[]
  roundOff: string
  decimalPlaces: number
}

/**
 * Copy View Factor settings from another Generate Report row into the open editor draft.
 * Matches by point + referenceValue when duplicates exist; falls back to point-only.
 */
export function copyGenerateReportRandomnessDraftFromRow(
  targetDraft: GenerateReportPointRandomness[],
  sourceRow: GenerateReportConfigRow,
  sourceEntries: EquipmentNominalPointReferenceEntry[],
): GenerateReportRandomnessDraftCopyResult {
  const sourceRows = buildGenerateReportRandomnessEditorRows(sourceRow, sourceEntries)
  const sourceByKey = new Map<string, GenerateReportPointRandomness>()
  const sourceByPoint = new Map<string, GenerateReportPointRandomness[]>()
  for (const s of sourceRows) {
    if (!s.point.trim()) continue
    sourceByKey.set(viewFactorRowLookupKey(s.point, s.referenceValue, s.rangeId), s)
    sourceByKey.set(viewFactorRowLookupKey(s.point, s.referenceValue), s)
    const pk = pointLookupKey(s.point)
    const list = sourceByPoint.get(pk) ?? []
    list.push(s)
    sourceByPoint.set(pk, list)
  }

  const pointRows = targetDraft.map((target) => {
    if (!target.point.trim()) return target
    let source = lookupGenerateReportRandomnessOverride(
      {
        point: target.point,
        referenceValue: target.referenceValue ?? '',
        rangeId: target.rangeId ?? '',
      },
      sourceByKey,
    )
    if (!source) {
      const pk = pointLookupKey(target.point)
      const candidates = sourceByPoint.get(pk) ?? []
      if (candidates.length === 1) {
        source = candidates[0]
      } else if (candidates.length > 1) {
        const targetRef = String(target.referenceValue ?? '').trim()
        if (targetRef) {
          source = candidates.find(
            (c) =>
              String(c.referenceValue ?? '').trim() &&
              generateReportReferenceValuesMatch(String(c.referenceValue ?? ''), targetRef),
          )
        }
        if (!source) {
          source =
            candidates.find((c) => !String(c.referenceValue ?? '').trim()) ?? candidates[0]
        }
      }
    }
    if (!source) return target
    return emptyGenerateReportPointRandomness({
      id: target.id,
      point: target.point,
      referenceValue: target.referenceValue,
      rangeId: target.rangeId,
      isDefault: false,
      randomnessMode: source.randomnessMode,
      randomnessFactor: source.randomnessFactor,
      randomnessFloor: source.randomnessFloor,
      randomnessCap: source.randomnessCap,
    })
  })

  return {
    pointRows,
    roundOff: String(sourceRow.roundOff ?? '').trim(),
    decimalPlaces:
      typeof sourceRow.decimalPlaces === 'number' && Number.isFinite(sourceRow.decimalPlaces)
        ? Math.max(0, Math.min(6, Math.round(sourceRow.decimalPlaces)))
        : 2,
  }
}

function normalizeGenerateReportColumnToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isGenerateReportEquipmentReferenceKey(key: string): boolean {
  return isMuEquipmentRangeFieldKey(key) || key === MU_CALIBRATION_POINT_FIELD_KEY
}

function equipmentRangeContainsPoint(range: EquipmentRangeEntry, pointValue: string): boolean {
  const tables = [
    range.calibrationPointsTable,
    ...(range.masterPointsTabs ?? []).map((tab) => tab.calibrationPointsTable),
  ]
  for (const table of tables) {
    const colId = nominalColumnId(table)
    if (!colId) continue
    if (
      table.rows.some((row) =>
        generateReportPointsMatch(String(row.values[colId] ?? ''), pointValue),
      )
    ) {
      return true
    }
  }
  return (range.calibrationPoints ?? []).some((p) =>
    generateReportPointsMatch(p.pointValue, pointValue),
  )
}

/** Measurement range that owns a nominal check-point (prefers numeric in-bounds match). */
export function findEquipmentRangeForPoint(
  ranges: EquipmentRangeEntry[],
  pointValue: string,
): EquipmentRangeEntry | null {
  const containing = ranges.filter((range) => equipmentRangeContainsPoint(range, pointValue))
  if (containing.length === 0) return null
  if (containing.length === 1) return containing[0]!

  const pointNumber = parseGenerateReportReferenceNumber(String(pointValue ?? ''))
  if (pointNumber != null && Number.isFinite(pointNumber)) {
    const inBounds = containing.find((range) => {
      const bounds = resolveGenerateReportRangeBoundsForRangeEntry(range)
      if (bounds.rangeMin == null || bounds.rangeMax == null) return false
      return (
        pointNumber >= Math.min(bounds.rangeMin, bounds.rangeMax) &&
        pointNumber <= Math.max(bounds.rangeMin, bounds.rangeMax)
      )
    })
    if (inBounds) return inBounds
  }
  return containing[0]!
}

function toMuEquipmentRangeContext(
  range: EquipmentRangeEntry | null | undefined,
): MuEquipmentRangeContext | null {
  if (!range) return null
  return {
    rangeMin: range.rangeMin,
    rangeMax: range.rangeMax,
    leastCount: range.resolutionLeastCount,
    accuracy: range.accuracy,
  }
}

function findCalibrationTableRowForPoint(
  table: CalibrationPointsStored,
  pointValue: string,
): CalibrationPointRow | null {
  const colId = nominalColumnId(table)
  if (!colId) return null
  return (
    table.rows.find((row) =>
      generateReportPointsMatch(String(row.values[colId] ?? ''), pointValue),
    ) ?? null
  )
}

function findCalibrationPointTableForPoint(
  range: EquipmentRangeEntry,
  pointValue: string,
): { table: CalibrationPointsStored; row: CalibrationPointRow } | null {
  const tables = [
    ...(range.masterPointsTabs ?? []).map((tab) => tab.calibrationPointsTable),
    range.calibrationPointsTable,
  ]
  for (const table of tables) {
    const row = findCalibrationTableRowForPoint(table, pointValue)
    if (row) return { table, row }
  }
  return null
}

function calibrationColumnIdForSheetColumn(
  table: CalibrationPointsStored,
  sheetColumn: RawDataSheetColumn,
): string | null {
  const nominalId = nominalColumnId(table)
  const keyToken = normalizeGenerateReportColumnToken(sheetColumn.key)
  const labelToken = normalizeGenerateReportColumnToken(sheetColumn.label)
  if (keyToken === 'nominal' && nominalId) return nominalId
  for (const col of table.columns) {
    const headerToken = normalizeGenerateReportColumnToken(col.header)
    if (headerToken === labelToken || headerToken === keyToken) return col.id
  }
  return null
}

/** Map equipment calibration table cells to Raw Data Sheet column keys for one point. */
function buildSheetValuesFromCalibrationPoint(
  table: CalibrationPointsStored,
  row: CalibrationPointRow,
  sheetColumns: RawDataSheetColumn[],
): RawDataSheetRowValues {
  const values: RawDataSheetRowValues = {}
  for (const sheetColumn of sheetColumns) {
    if (sheetColumn.type === 'formula') continue
    const colId = calibrationColumnIdForSheetColumn(table, sheetColumn)
    if (!colId) continue
    values[sheetColumn.key] = String(row.values[colId] ?? '').trim()
  }
  return values
}

/** `pt:<slug>` values from one Master calibration-points row (after formula compute). */
function pointsRefValuesFromCalibrationRow(
  table: CalibrationPointsStored,
  rowValues: Record<string, string>,
): RawDataSheetRowValues {
  const out: RawDataSheetRowValues = {}
  for (const col of table.columns) {
    const slug = pointsHeaderSlug(col.header)
    if (!slug) continue
    const raw = String(rowValues[col.id] ?? '').trim()
    if (!raw) continue
    out[`${POINTS_FORMULA_REF_PREFIX}${slug}`] = raw
  }
  return out
}

/**
 * Master points tables + `pt:*` cell values for one Conduct / Generate Report sheet row.
 * Prefers the row's master tab, then point-value match, then row index in that master group.
 */
export function resolveMasterPointRefsForSheetRow(
  range: EquipmentRangeEntry | null | undefined,
  options: {
    pointValue?: string | null
    masterEquipmentId?: string | null
    rowIndexInMaster?: number
  } = {},
): { tables: CalibrationPointsStored[]; values: RawDataSheetRowValues } {
  if (!range) return { tables: [], values: {} }

  const masterId = String(options.masterEquipmentId ?? '').trim()
  const preferred: CalibrationPointsStored[] = []
  const seen = new Set<CalibrationPointsStored>()
  const push = (table: CalibrationPointsStored | null | undefined) => {
    if (!table || seen.has(table)) return
    seen.add(table)
    preferred.push(table)
  }

  if (masterId) {
    const tab = (range.masterPointsTabs ?? []).find(
      (t) => t.masterEquipmentId.trim() === masterId,
    )
    if (tab) push(tab.calibrationPointsTable)
  }
  for (const tab of range.masterPointsTabs ?? []) push(tab.calibrationPointsTable)
  push(range.calibrationPointsTable)

  const tables = preferred.filter((t) => (t.columns?.length ?? 0) > 0)
  let matchTable: CalibrationPointsStored | null = null
  let matchRow: CalibrationPointRow | null = null

  const point = String(options.pointValue ?? '').trim()
  if (point) {
    for (const table of preferred) {
      const row = findCalibrationTableRowForPoint(table, point)
      if (row) {
        matchTable = table
        matchRow = row
        break
      }
    }
  }

  if (!matchRow && options.rowIndexInMaster != null && options.rowIndexInMaster >= 0) {
    const table = preferred[0]
    const row = table?.rows[options.rowIndexInMaster]
    if (table && row) {
      matchTable = table
      matchRow = row
    }
  }

  if (!matchTable || !matchRow) return { tables, values: {} }

  const computed = computeCalibrationPointRowValuesFromMaster(
    matchTable.columns,
    matchRow.values,
    null,
    6,
  )
  return {
    tables,
    values: pointsRefValuesFromCalibrationRow(matchTable, computed),
  }
}

/**
 * Resolve Reference for a specific range + calibration table row (no cross-range pick).
 */
export function resolveGenerateReportReferenceValueForRangePoint(
  referenceKey: string,
  pointValue: string,
  range: EquipmentRangeEntry,
  sheetColumns: RawDataSheetColumn[],
  calibrationRow?: CalibrationPointRow | null,
  table?: CalibrationPointsStored | null,
): string {
  const key = String(referenceKey ?? '').trim()
  const point = String(pointValue ?? '').trim()
  if (!key || !point) return ''

  const rangeContext = toMuEquipmentRangeContext(range)

  if (isGenerateReportEquipmentReferenceKey(key)) {
    const builtins = buildMuBuiltinValues(point, rangeContext)
    return String(builtins[key] ?? '').trim()
  }

  let matchRow = calibrationRow ?? null
  let matchTable = table ?? null
  if (!matchRow || !matchTable) {
    const found = findCalibrationPointTableForPoint(range, point)
    if (found) {
      matchRow = found.row
      matchTable = found.table
    }
  }
  if (!matchRow || !matchTable) return ''

  const computedValues = computeCalibrationPointRowValuesFromMaster(
    matchTable.columns,
    matchRow.values,
    null,
    6,
  )
  const computedRow: CalibrationPointRow = { ...matchRow, values: computedValues }

  if (isPointsFormulaRefKey(key)) {
    const slug = key.slice(POINTS_FORMULA_REF_PREFIX.length)
    const col = matchTable.columns.find((c) => pointsHeaderSlug(c.header) === slug)
    return col ? String(computedValues[col.id] ?? '').trim() : ''
  }

  const sheetValues = buildSheetValuesFromCalibrationPoint(
    matchTable,
    computedRow,
    sheetColumns,
  )
  const sheetCol = sheetColumns.find((c) => c.key === key)
  if (sheetCol?.type === 'formula') {
    const ptValues = pointsRefValuesFromCalibrationRow(matchTable, computedValues)
    const ptCols = masterPointsFormulaRefColumns([matchTable])
    // Prefer Master point headers so `=[Load in kN]` uses the master cell,
    // not an empty same-label sheet column.
    const wrapCols = [...ptCols, ...sheetColumns]
    const columnsForEval = sheetColumns.map((col) => {
      const expr = col.formula?.expression?.trim() ?? ''
      if (col.type !== 'formula' || !expr) return col
      return {
        ...col,
        formula: {
          ...col.formula,
          expression: wrapBareFormulaColumnRef(expr, wrapCols),
        },
      }
    })
    const dp = sheetCol.formula?.decimals ?? 6
    const next: RawDataSheetRowValues = { ...sheetValues, ...ptValues }
    for (const col of columnsForEval) {
      if (col.type !== 'formula') continue
      next[col.key] = computeFormulaValue(col, next, dp, wrapCols)
    }
    return String(next[key] ?? '').trim()
  }
  return String(sheetValues[key] ?? '').trim()
}

/**
 * Resolve Generate Report Reference value for an equipment check-point (View Factor preview).
 * Equipment refs use range / point builtins; sheet refs use calibration table cells.
 */
export function resolveGenerateReportReferenceValueForEquipmentPoint(
  referenceKey: string,
  pointValue: string,
  ranges: EquipmentRangeEntry[],
  sheetColumns: RawDataSheetColumn[],
): string {
  const key = String(referenceKey ?? '').trim()
  const point = String(pointValue ?? '').trim()
  if (!key || !point) return ''

  const range = findEquipmentRangeForPoint(ranges, point)
  if (!range) {
    if (isGenerateReportEquipmentReferenceKey(key)) {
      const builtins = buildMuBuiltinValues(point, null)
      return String(builtins[key] ?? '').trim()
    }
    return ''
  }
  return resolveGenerateReportReferenceValueForRangePoint(
    key,
    point,
    range,
    sheetColumns,
  )
}

/** Parse measurement text to a number (matches Generate Report Apply in RawDataSheetDialog). */
export function parseGenerateReportReferenceNumber(raw: string): number | null {
  const full = raw.trim().replace(/,/g, '')
  if (!full) return null

  const segments = full
    .split(/[|;/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const pool = segments.length > 0 ? segments : [full]

  for (const segment of pool) {
    const t = segment.replace(/^[±+\s]+/, '').trim()
    if (!t) continue
    const direct = Number(t)
    if (Number.isFinite(direct)) return direct
    const m = t.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!m) continue
    const n = Number(m[0])
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Optional absolute floor/cap band — empty / 0 / invalid means unused. */
export function parseGenerateReportOptionalBand(
  raw: string | number | null | undefined,
): number {
  if (raw == null) return 0
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

function parseGenerateReportRangeBoundNumber(raw: string | null | undefined): number | null {
  const token = String(raw ?? '').trim()
  if (!token) return null
  const n = parseGenerateReportReferenceNumber(token)
  if (n == null || !Number.isFinite(n)) return null
  return n
}

/** Range Min / Max / Span for equipment point (View Factor preview & Apply). */
export function resolveGenerateReportRangeBoundsForPoint(
  ranges: EquipmentRangeEntry[],
  pointValue: string,
): { rangeMin: number | null; rangeMax: number | null; rangeSpan: number | null } {
  const range = findEquipmentRangeForPoint(ranges, pointValue)
  return resolveGenerateReportRangeBoundsForRangeEntry(range)
}

/** Range Min / Max / Span for a specific measurement range id. */
export function resolveGenerateReportRangeBoundsForRangeId(
  ranges: EquipmentRangeEntry[],
  rangeId: string,
): { rangeMin: number | null; rangeMax: number | null; rangeSpan: number | null } {
  const id = String(rangeId ?? '').trim()
  if (!id) return { rangeMin: null, rangeMax: null, rangeSpan: null }
  const range = ranges.find((r) => r.id === id) ?? null
  return resolveGenerateReportRangeBoundsForRangeEntry(range)
}

function boundsFromMinMaxText(
  rangeMin: string | null | undefined,
  rangeMax: string | null | undefined,
): { rangeMin: number | null; rangeMax: number | null; rangeSpan: number | null } {
  let min = parseGenerateReportRangeBoundNumber(rangeMin)
  let max = parseGenerateReportRangeBoundNumber(rangeMax)
  if (min == null || max == null) {
    const split = splitRangeCapacityToMinMax(
      formatRangeCapacityFromMinMax(String(rangeMin ?? ''), String(rangeMax ?? '')),
    )
    if (min == null) min = parseGenerateReportRangeBoundNumber(split.rangeMin)
    if (max == null) max = parseGenerateReportRangeBoundNumber(split.rangeMax)
  }
  const rangeSpan =
    min != null && max != null && Number.isFinite(min) && Number.isFinite(max)
      ? Math.abs(max - min)
      : null
  return { rangeMin: min, rangeMax: max, rangeSpan }
}

function resolveGenerateReportRangeBoundsForRangeEntry(
  range: EquipmentRangeEntry | null,
): { rangeMin: number | null; rangeMax: number | null; rangeSpan: number | null } {
  if (!range) return { rangeMin: null, rangeMax: null, rangeSpan: null }

  const fromFields = boundsFromMinMaxText(range.rangeMin, range.rangeMax)
  if (fromFields.rangeSpan != null) return fromFields

  const fromCapacity = splitRangeCapacityToMinMax(range.rangeCapacity)
  const merged = boundsFromMinMaxText(
    fromFields.rangeMin != null ? String(fromFields.rangeMin) : fromCapacity.rangeMin,
    fromFields.rangeMax != null ? String(fromFields.rangeMax) : fromCapacity.rangeMax,
  )
  return merged
}

/** Measurement range that lists this master (for per-equipment Generate Report bounds). */
export function findEquipmentRangeForMaster(
  ranges: EquipmentRangeEntry[],
  masterEquipmentId: string,
): EquipmentRangeEntry | null {
  const id = String(masterEquipmentId ?? '').trim()
  if (!id) return null
  return (
    ranges.find(
      (range) =>
        range.masterEquipmentIds.includes(id) ||
        (range.masterPointsTabs ?? []).some((tab) => tab.masterEquipmentId.trim() === id),
    ) ?? null
  )
}

/**
 * Range Min / Max / Span for Generate Report Apply — particular equipment range.
 * Prefers the range that owns the check-point, then the job-matched range,
 * then any range with Min+Max, then capacity / job labels.
 */
export function resolveGenerateReportRangeBoundsForEquipment(params: {
  ranges: EquipmentRangeEntry[]
  pointValue?: string | null
  masterEquipmentId?: string | null
  preferredRange?: EquipmentRangeEntry | null
  fallbackCapacity?: string | null
  jobRangeLabel?: string | null
}): { rangeMin: number | null; rangeMax: number | null; rangeSpan: number | null } {
  const point = String(params.pointValue ?? '').trim()
  const fromPoint = point
    ? resolveGenerateReportRangeBoundsForPoint(params.ranges, point)
    : { rangeMin: null, rangeMax: null, rangeSpan: null }
  if (fromPoint.rangeSpan != null && fromPoint.rangeSpan > 0) return fromPoint

  const fromMaster = params.masterEquipmentId
    ? resolveGenerateReportRangeBoundsForRangeEntry(
        findEquipmentRangeForMaster(params.ranges, params.masterEquipmentId),
      )
    : { rangeMin: null, rangeMax: null, rangeSpan: null }
  if (fromMaster.rangeSpan != null && fromMaster.rangeSpan > 0) return fromMaster

  const fromPreferred = resolveGenerateReportRangeBoundsForRangeEntry(
    params.preferredRange ?? null,
  )
  if (fromPreferred.rangeSpan != null && fromPreferred.rangeSpan > 0) return fromPreferred

  for (const range of params.ranges) {
    const bounds = resolveGenerateReportRangeBoundsForRangeEntry(range)
    if (bounds.rangeSpan != null && bounds.rangeSpan > 0) return bounds
  }

  const capacity = String(params.fallbackCapacity ?? '').trim()
  if (capacity) {
    const split = splitRangeCapacityToMinMax(capacity)
    const fromCapacity = boundsFromMinMaxText(split.rangeMin, split.rangeMax)
    if (fromCapacity.rangeMax != null) return fromCapacity
  }

  const jobLabel = String(params.jobRangeLabel ?? '').trim()
  if (jobLabel) {
    const split = splitRangeCapacityToMinMax(jobLabel)
    const fromJob = boundsFromMinMaxText(split.rangeMin, split.rangeMax)
    if (fromJob.rangeMax != null) return fromJob
  }

  if (fromPoint.rangeMax != null || fromPoint.rangeMin != null) return fromPoint
  if (fromPreferred.rangeMax != null || fromPreferred.rangeMin != null) return fromPreferred
  return { rangeMin: null, rangeMax: null, rangeSpan: null }
}

/** Keep a generated reading inside equipment Range Min / Max when the reference is in-range. */
export function clampGenerateReportReadingToEquipmentRange(
  value: number,
  reference: number,
  rangeMin: number | null,
  rangeMax: number | null,
): number {
  if (!Number.isFinite(value)) return value
  if (rangeMin == null || rangeMax == null) return value
  if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax)) return value
  const lo = Math.min(rangeMin, rangeMax)
  const hi = Math.max(rangeMin, rangeMax)
  if (hi === lo) return value
  // Only clamp load/point-like values (same domain as the range), never indicator counts.
  if (reference < lo || reference > hi) return value
  return Math.min(hi, Math.max(lo, value))
}

/**
 * Compute ± band from Mode / Factor / Min / Max (same rules as Generate Report Apply).
 * - percent: band = |scaledRef| × (factor/100)
 * - absolute: band = |factor|
 * - range_span: band = |rangeMax − rangeMin| × (factor/100)
 * - range_max: band = |rangeMax| × (factor/100)
 * Then optional absolute floor/cap clamp on band.
 */
export function computeGenerateReportBand(params: {
  mode: GenerateReportRandomnessMode
  randomnessFactor: number
  referenceValue: number
  multiple?: number
  floor?: number
  cap?: number
  rangeSpan?: number | null
  rangeMax?: number | null
}): number {
  const multiple =
    typeof params.multiple === 'number' && Number.isFinite(params.multiple) && params.multiple !== 0
      ? params.multiple
      : 1
  const scaled = params.referenceValue * multiple
  const factor = params.randomnessFactor
  const mode = parseGenerateReportRandomnessMode(params.mode)

  const rangeSpan =
    typeof params.rangeSpan === 'number' && Number.isFinite(params.rangeSpan)
      ? Math.abs(params.rangeSpan)
      : 0
  const rangeMaxAbs =
    typeof params.rangeMax === 'number' && Number.isFinite(params.rangeMax)
      ? Math.abs(params.rangeMax)
      : 0

  let band = 0
  if (mode === 'absolute') {
    band = Math.abs(factor)
  } else if (mode === 'range_span') {
    band = factor > 0 && rangeSpan > 0 ? rangeSpan * (factor / 100) : 0
  } else if (mode === 'range_max') {
    band = factor > 0 && rangeMaxAbs > 0 ? rangeMaxAbs * (factor / 100) : 0
  } else if (factor > 0) {
    band = Math.abs(scaled) * (factor / 100)
  }

  // When Randomness Factor is 0, keep band 0 (exact reference) — do not lift via Min floor.
  if (factor > 0) {
    const floor = parseGenerateReportOptionalBand(params.floor)
    const cap = parseGenerateReportOptionalBand(params.cap)
    if (floor > 0) band = Math.max(band, floor)
    if (cap > 0) band = Math.min(band, cap)
  }
  return band
}

/** Snap reading to Round Off step (Generate Report least-count snap). */
export function snapGenerateReportToRoundOff(raw: number, roundOff: number): number {
  if (Number.isFinite(roundOff) && roundOff > 0) {
    return Math.round(raw / roundOff) * roundOff
  }
  return raw
}

export function formatGenerateReportOutputNumber(
  value: number,
  decimalPlaces: number,
): string {
  if (!Number.isFinite(value)) return ''
  const dp = Math.max(0, Math.min(6, Math.round(decimalPlaces)))
  return value.toFixed(dp)
}

export type GenerateReportOutputMinMaxPreview = {
  outputMin: string
  outputMax: string
}

/**
 * Preview Output Min / Max for View Factor (Ref ± band, snap, decimals).
 * Matches Apply band logic; uses +band / −band instead of random salt.
 */
export function computeGenerateReportOutputMinMaxPreview(params: {
  referenceRaw: string
  mode: GenerateReportRandomnessMode
  randomnessFactor: string
  randomnessFloor: string
  randomnessCap: string
  roundOff: string
  decimalPlaces: number
  pointValue: string
  ranges: EquipmentRangeEntry[]
  rangeId?: string
  multiple?: number
}): GenerateReportOutputMinMaxPreview {
  const ref = parseGenerateReportReferenceNumber(params.referenceRaw)
  if (ref == null) return { outputMin: '—', outputMax: '—' }

  const factorText = params.randomnessFactor.trim()
  const factor = Number(factorText)
  if (!factorText || !Number.isFinite(factor) || factor <= 0) {
    const dp = Math.max(0, Math.min(6, Math.round(params.decimalPlaces)))
    const roundN = Number(params.roundOff.trim())
    const roundOff = Number.isFinite(roundN) && roundN > 0 ? roundN : 0
    const multiple =
      typeof params.multiple === 'number' &&
      Number.isFinite(params.multiple) &&
      params.multiple !== 0
        ? params.multiple
        : 1
    const scaled = ref * multiple
    const snapped = snapGenerateReportToRoundOff(scaled, roundOff)
    const formatted = formatGenerateReportOutputNumber(snapped, dp)
    return { outputMin: formatted, outputMax: formatted }
  }

  const rangeId = String(params.rangeId ?? '').trim()
  const rangeBounds = rangeId
    ? resolveGenerateReportRangeBoundsForRangeId(params.ranges, rangeId)
    : resolveGenerateReportRangeBoundsForPoint(params.ranges, params.pointValue)
  const { rangeSpan, rangeMax } = rangeBounds
  const band = computeGenerateReportBand({
    mode: params.mode,
    randomnessFactor: factor,
    referenceValue: ref,
    multiple: params.multiple,
    floor: parseGenerateReportOptionalBand(params.randomnessFloor),
    cap: parseGenerateReportOptionalBand(params.randomnessCap),
    rangeSpan,
    rangeMax,
  })

  const roundN = Number(params.roundOff.trim())
  const roundOff = Number.isFinite(roundN) && roundN > 0 ? roundN : 0
  const dp = Math.max(0, Math.min(6, Math.round(params.decimalPlaces)))
  const multiple =
    typeof params.multiple === 'number' && Number.isFinite(params.multiple) && params.multiple !== 0
      ? params.multiple
      : 1
  const scaled = ref * multiple
  const minRaw = clampGenerateReportReadingToEquipmentRange(
    scaled - band,
    scaled,
    rangeBounds.rangeMin,
    rangeBounds.rangeMax,
  )
  const maxRaw = clampGenerateReportReadingToEquipmentRange(
    scaled + band,
    scaled,
    rangeBounds.rangeMin,
    rangeBounds.rangeMax,
  )
  return {
    outputMin: formatGenerateReportOutputNumber(
      snapGenerateReportToRoundOff(minRaw, roundOff),
      dp,
    ),
    outputMax: formatGenerateReportOutputNumber(
      snapGenerateReportToRoundOff(maxRaw, roundOff),
      dp,
    ),
  }
}

export function emptyGenerateReportConfigRow(
  overrides?: Partial<Omit<GenerateReportConfigRow, 'id'>> & { id?: string },
): GenerateReportConfigRow {
  const randomnessByPoint =
    overrides?.randomnessByPoint != null
      ? overrides.randomnessByPoint.map((p) =>
          emptyGenerateReportPointRandomness({
            id: p.id,
            point: p.point,
            referenceValue: p.referenceValue,
            rangeId: p.rangeId,
            isDefault: p.isDefault,
            randomnessMode: p.randomnessMode,
            randomnessFactor: p.randomnessFactor,
            randomnessFloor: p.randomnessFloor,
            randomnessCap: p.randomnessCap,
          }),
        )
      : undefined
  return {
    id: overrides?.id ?? newGenerateReportRowId(),
    inputColumnKey: overrides?.inputColumnKey ?? '',
    referenceColumnKey: overrides?.referenceColumnKey ?? '',
    randomnessFactor: overrides?.randomnessFactor ?? '',
    randomnessMode: parseGenerateReportRandomnessMode(
      overrides?.randomnessMode ?? 'percent',
    ),
    randomnessFloor: overrides?.randomnessFloor ?? '',
    randomnessCap: overrides?.randomnessCap ?? '',
    ...(randomnessByPoint && randomnessByPoint.length > 0
      ? { randomnessByPoint }
      : {}),
    roundOff: overrides?.roundOff ?? '',
    decimalPlaces:
      typeof overrides?.decimalPlaces === 'number' && Number.isFinite(overrides.decimalPlaces)
        ? Math.max(0, Math.min(6, Math.round(overrides.decimalPlaces)))
        : 2,
  }
}

export const DEFAULT_GENERATE_REPORT_CONFIG: GenerateReportConfig = {
  enabled: true,
  rows: [emptyGenerateReportConfigRow()],
}

function clampDecimalPlaces(raw: unknown, fallback = 2): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(6, Math.round(n)))
}

function parseGenerateReportConfigRow(raw: unknown): GenerateReportConfigRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const randomnessByPoint = parseGenerateReportPointRandomnessList(
    o.randomnessByPoint ?? o.randomness_by_point,
  )
  return emptyGenerateReportConfigRow({
    id: String(o.id ?? newGenerateReportRowId()),
    inputColumnKey: String(o.inputColumnKey ?? o.input_column_key ?? '').trim(),
    referenceColumnKey: String(o.referenceColumnKey ?? o.reference_column_key ?? '').trim(),
    randomnessFactor: String(o.randomnessFactor ?? o.randomness_factor ?? '').trim(),
    randomnessMode: parseGenerateReportRandomnessMode(
      o.randomnessMode ?? o.randomness_mode,
    ),
    randomnessFloor: String(o.randomnessFloor ?? o.randomness_floor ?? '').trim(),
    randomnessCap: String(o.randomnessCap ?? o.randomness_cap ?? '').trim(),
    randomnessByPoint,
    roundOff: String(o.roundOff ?? o.round_off ?? '').trim(),
    decimalPlaces: clampDecimalPlaces(o.decimalPlaces ?? o.decimal_places, 2),
  })
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
  /** Design defaults for Generate Report on Raw Data Sheet. */
  generateReportConfig: GenerateReportConfig
  /** Per-equipment Calibration Certificate template (UTM default). */
  certificateTemplate: CalibrationCertificateTemplate
  /** Outgoing checklist template for Calibration Conduct Outside. */
  outgoingChecklist: ConductOutsideChecklistItem[]
  /** Inward checklist template for Calibration Conduct Outside. */
  inwardChecklist: ConductOutsideChecklistItem[]
  /** Default Mode of Calibration for certificate (manual; ranges may override). */
  modeOfCalibration: string
  /** Default Method Used for certificate (manual; ranges may override). */
  methodUsed: string
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

/**
 * Candidate calibration tables for a range, richest-first.
 * Includes every master tab with values, range-level table, and legacy list.
 */
export function calibrationPointsTablesForViewFactor(
  range: EquipmentRangeEntry,
): CalibrationPointsStored[] {
  const out: CalibrationPointsStored[] = []
  const seen = new Set<CalibrationPointsStored>()
  const push = (table: CalibrationPointsStored | null | undefined) => {
    if (!table || !tableHasPointValues(table) || seen.has(table)) return
    seen.add(table)
    out.push(table)
  }
  for (const tab of range.masterPointsTabs ?? []) {
    push(tab.calibrationPointsTable)
  }
  push(range.calibrationPointsTable)
  const legacyPoints = (range.calibrationPoints ?? []).filter((p) =>
    String(p.pointValue ?? '').trim(),
  )
  if (legacyPoints.length > 0) {
    push(tableFromLegacyPoints(legacyPoints))
  }
  // Richest first so earlier rows win stable ids when unioning.
  return out.sort(
    (a, b) => rangePointsFromTable(b).length - rangePointsFromTable(a).length,
  )
}

/**
 * Best single calibration points table for a range (most nominal points).
 * Prefer this when a single table is required; View Factor collection unions
 * all candidates via calibrationPointsTablesForViewFactor.
 */
export function calibrationPointsTableForViewFactor(
  range: EquipmentRangeEntry,
): CalibrationPointsStored {
  const tables = calibrationPointsTablesForViewFactor(range)
  if (tables.length > 0) return tables[0]!
  return primaryCalibrationPointsTable(
    range.masterPointsTabs ?? [],
    range.calibrationPointsTable ?? emptyCalibrationPointsTable(),
  )
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
    rangeMin: '',
    rangeMax: '',
    rangeCapacity: '',
    resolutionLeastCount: '',
    unit: '',
    accuracy: '',
    accreditationScopeId: '',
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
    generateReportConfig: {
      enabled: DEFAULT_GENERATE_REPORT_CONFIG.enabled,
      rows: DEFAULT_GENERATE_REPORT_CONFIG.rows.map((r) => ({ ...r, id: newGenerateReportRowId() })),
    },
    certificateTemplate: defaultCalibrationCertificateTemplate(),
    outgoingChecklist: emptyEquipmentChecklistItems('outgoing'),
    inwardChecklist: emptyEquipmentChecklistItems('inward'),
    modeOfCalibration: '',
    methodUsed: '',
  }
}

export function outgoingChecklistFromRow(row: CalibrationEquipmentRow): ConductOutsideChecklistItem[] {
  return parseEquipmentChecklistTemplate(row.outgoing_checklist_template, 'outgoing')
}

export function inwardChecklistFromRow(row: CalibrationEquipmentRow): ConductOutsideChecklistItem[] {
  return parseEquipmentChecklistTemplate(row.inward_checklist_template, 'inward')
}

export function parseGenerateReportConfig(raw: unknown): GenerateReportConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: true,
      rows: [emptyGenerateReportConfigRow()],
    }
  }
  const o = raw as Record<string, unknown>
  const enabled = true

  if (Array.isArray(o.rows)) {
    const rows = o.rows
      .map((item) => parseGenerateReportConfigRow(item))
      .filter((x): x is GenerateReportConfigRow => x != null)
    return {
      enabled,
      rows: rows.length > 0 ? rows : [emptyGenerateReportConfigRow()],
    }
  }

  // Backward compat: legacy flat single-object shape → one row
  const hasLegacyKeys =
    o.inputColumnKey != null ||
    o.input_column_key != null ||
    o.referenceColumnKey != null ||
    o.reference_column_key != null ||
    o.randomnessFactor != null ||
    o.randomness_factor != null ||
    o.roundOff != null ||
    o.round_off != null ||
    o.decimalPlaces != null ||
    o.decimal_places != null

  if (hasLegacyKeys) {
    return {
      enabled,
      rows: [
        emptyGenerateReportConfigRow({
          inputColumnKey: String(o.inputColumnKey ?? o.input_column_key ?? '').trim(),
          referenceColumnKey: String(o.referenceColumnKey ?? o.reference_column_key ?? '').trim(),
          randomnessFactor: String(o.randomnessFactor ?? o.randomness_factor ?? '').trim(),
          randomnessMode: parseGenerateReportRandomnessMode(
            o.randomnessMode ?? o.randomness_mode,
          ),
          randomnessFloor: String(o.randomnessFloor ?? o.randomness_floor ?? '').trim(),
          randomnessCap: String(o.randomnessCap ?? o.randomness_cap ?? '').trim(),
          roundOff: String(o.roundOff ?? o.round_off ?? '').trim(),
          decimalPlaces: clampDecimalPlaces(o.decimalPlaces ?? o.decimal_places, 2),
        }),
      ],
    }
  }

  return {
    enabled,
    rows: [emptyGenerateReportConfigRow()],
  }
}

export function generateReportConfigFromRow(row: CalibrationEquipmentRow): GenerateReportConfig {
  return parseGenerateReportConfig(row.generate_report_config)
}

export function certificateTemplateFromRow(
  row: CalibrationEquipmentRow,
): CalibrationCertificateTemplate {
  return parseCalibrationCertificateTemplate(row.certificate_template_config)
}

export function serializeEquipmentCertificateTemplate(
  template: CalibrationCertificateTemplate,
): CalibrationCertificateTemplate {
  return serializeCalibrationCertificateTemplate(template)
}

export function serializeEquipmentGenerateReportConfig(
  config: GenerateReportConfig,
): GenerateReportConfig {
  const rows = (config.rows ?? [])
    .map((row) => {
      const randomnessByPoint = (row.randomnessByPoint ?? [])
        .map((p) =>
          emptyGenerateReportPointRandomness({
            id: p.id || newGenerateReportPointRandomnessId(),
            point: String(p.point ?? '').trim(),
            referenceValue: String(p.referenceValue ?? '').trim(),
            rangeId: String(p.rangeId ?? '').trim(),
            isDefault: false,
            randomnessMode: parseGenerateReportRandomnessMode(p.randomnessMode),
            randomnessFactor: String(p.randomnessFactor ?? '').trim(),
            randomnessFloor: String(p.randomnessFloor ?? '').trim(),
            randomnessCap: String(p.randomnessCap ?? '').trim(),
          }),
        )
        .filter((p) => p.point.length > 0 && !p.isDefault)
      return emptyGenerateReportConfigRow({
        id: row.id || newGenerateReportRowId(),
        inputColumnKey: String(row.inputColumnKey ?? '').trim(),
        referenceColumnKey: String(row.referenceColumnKey ?? '').trim(),
        // Top-level randomness kept empty / unused for Apply (backward-compat shape).
        randomnessFactor: '',
        randomnessMode: 'percent',
        randomnessFloor: '',
        randomnessCap: '',
        randomnessByPoint: randomnessByPoint.length > 0 ? randomnessByPoint : undefined,
        roundOff: String(row.roundOff ?? '').trim(),
        decimalPlaces: clampDecimalPlaces(row.decimalPlaces, 2),
      })
    })
  return {
    enabled: true,
    rows: rows.length > 0 ? rows : [emptyGenerateReportConfigRow()],
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

export function resolveRangeRawDataSheetTemplate(
  range: EquipmentRangeEntry | null | undefined,
  equipmentFallback: RawDataSheetTemplate | null | undefined,
): RawDataSheetTemplate {
  if (range?.rawDataSheetTemplate) return range.rawDataSheetTemplate
  return equipmentFallback ?? defaultRawDataSheetTemplate()
}

export function resolveRangeMuCalculationTemplate(
  range: EquipmentRangeEntry | null | undefined,
  equipmentFallback: MuCalculationTemplate | null | undefined,
): MuCalculationTemplate {
  if (range?.muCalculationTemplate) return range.muCalculationTemplate
  return equipmentFallback ?? defaultMuCalculationTemplate()
}

export function resolveRangeGenerateReportConfig(
  range: EquipmentRangeEntry | null | undefined,
  equipmentFallback: GenerateReportConfig | null | undefined,
): GenerateReportConfig {
  if (range?.generateReportConfig) return range.generateReportConfig
  return equipmentFallback ?? parseGenerateReportConfig(null)
}

export function resolveRangeCertificateTemplate(
  range: EquipmentRangeEntry | null | undefined,
  equipmentFallback: CalibrationCertificateTemplate | null | undefined,
): CalibrationCertificateTemplate {
  if (range?.certificateTemplate) return range.certificateTemplate
  return equipmentFallback ?? defaultCalibrationCertificateTemplate()
}

export function resolveRangeModeOfCalibration(
  range: EquipmentRangeEntry | null | undefined,
  equipmentFallback: string | null | undefined,
): string {
  const fromRange = (range?.modeOfCalibration ?? '').trim()
  if (fromRange) return fromRange
  return (equipmentFallback ?? '').trim()
}

/** First non-empty Mode of Calibration across ranges, else equipment fallback. */
export function resolveEquipmentModeOfCalibration(
  ranges: EquipmentRangeEntry[] | null | undefined,
  equipmentFallback: string | null | undefined = '',
): string {
  for (const range of ranges ?? []) {
    const v = (range.modeOfCalibration ?? '').trim()
    if (v) return v
  }
  return (equipmentFallback ?? '').trim()
}

export function resolveRangeMethodUsed(
  range: EquipmentRangeEntry | null | undefined,
  equipmentFallback: string | null | undefined,
): string {
  const fromRange = (range?.methodUsed ?? '').trim()
  if (fromRange) return fromRange
  return (equipmentFallback ?? '').trim()
}

/** First non-empty Method Used across ranges, else equipment fallback. */
export function resolveEquipmentMethodUsed(
  ranges: EquipmentRangeEntry[] | null | undefined,
  equipmentFallback: string | null | undefined = '',
): string {
  for (const range of ranges ?? []) {
    const v = (range.methodUsed ?? '').trim()
    if (v) return v
  }
  return (equipmentFallback ?? '').trim()
}

/** Lazy seed: copy equipment-level templates onto a range that has none yet. */
export function seedRangeTemplatesFromEquipment(
  range: EquipmentRangeEntry,
  equipment: EquipmentTemplateFallback,
): EquipmentRangeEntry {
  const patch: Partial<EquipmentRangeEntry> = {}
  if (!range.rawDataSheetTemplate && equipment.rawDataSheetTemplate) {
    patch.rawDataSheetTemplate = equipment.rawDataSheetTemplate
  }
  if (!range.muCalculationTemplate && equipment.muCalculationTemplate) {
    patch.muCalculationTemplate = equipment.muCalculationTemplate
  }
  if (!range.generateReportConfig && equipment.generateReportConfig) {
    patch.generateReportConfig = equipment.generateReportConfig
  }
  if (!range.certificateTemplate && equipment.certificateTemplate) {
    patch.certificateTemplate = equipment.certificateTemplate
  }
  if (
    !(range.modeOfCalibration ?? '').trim() &&
    (equipment.modeOfCalibration ?? '').trim()
  ) {
    patch.modeOfCalibration = (equipment.modeOfCalibration ?? '').trim()
  }
  if (!(range.methodUsed ?? '').trim() && (equipment.methodUsed ?? '').trim()) {
    patch.methodUsed = (equipment.methodUsed ?? '').trim()
  }
  return Object.keys(patch).length > 0 ? { ...range, ...patch } : range
}

/** First range with nested templates, else equipment form fallback — for legacy column sync on save. */
export function equipmentTemplatesFromRanges(
  ranges: EquipmentRangeEntry[],
  fallback: EquipmentTemplateFallback,
): {
  rawDataSheetTemplate: RawDataSheetTemplate
  muCalculationTemplate: MuCalculationTemplate
  generateReportConfig: GenerateReportConfig
  certificateTemplate: CalibrationCertificateTemplate
} {
  for (const range of ranges) {
    if (
      range.rawDataSheetTemplate ||
      range.muCalculationTemplate ||
      range.generateReportConfig ||
      range.certificateTemplate
    ) {
      return {
        rawDataSheetTemplate: resolveRangeRawDataSheetTemplate(
          range,
          fallback.rawDataSheetTemplate,
        ),
        muCalculationTemplate: resolveRangeMuCalculationTemplate(
          range,
          fallback.muCalculationTemplate,
        ),
        generateReportConfig: resolveRangeGenerateReportConfig(
          range,
          fallback.generateReportConfig,
        ),
        certificateTemplate: resolveRangeCertificateTemplate(
          range,
          fallback.certificateTemplate,
        ),
      }
    }
  }
  return {
    rawDataSheetTemplate:
      fallback.rawDataSheetTemplate ?? defaultRawDataSheetTemplate(),
    muCalculationTemplate:
      fallback.muCalculationTemplate ?? defaultMuCalculationTemplate(),
    generateReportConfig:
      fallback.generateReportConfig ?? parseGenerateReportConfig(null),
    certificateTemplate:
      fallback.certificateTemplate ?? defaultCalibrationCertificateTemplate(),
  }
}

export function normalizeText(value: string): string {
  return value.trim()
}

export function formatRangeCapacityFromMinMax(rangeMin: string, rangeMax: string): string {
  const min = rangeMin.trim()
  const max = rangeMax.trim()
  if (min && max) return `${min} - ${max}`
  return min || max || ''
}

/** Split legacy "0 - 100" / "0–300" / single value into min & max. */
export function splitRangeCapacityToMinMax(rangeCapacity: string): {
  rangeMin: string
  rangeMax: string
} {
  const raw = rangeCapacity.trim()
  if (!raw) return { rangeMin: '', rangeMax: '' }

  const parts = raw
    .split(/\s*(?:–|—|-|to|TO)\s*/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length >= 2) {
    return { rangeMin: parts[0]!, rangeMax: parts[1]! }
  }
  return { rangeMin: raw, rangeMax: '' }
}

export function withSyncedRangeCapacity(
  patch: Partial<Pick<EquipmentRangeEntry, 'rangeMin' | 'rangeMax' | 'rangeCapacity'>> &
    Record<string, unknown>,
  current: Pick<EquipmentRangeEntry, 'rangeMin' | 'rangeMax'>,
): Partial<EquipmentRangeEntry> {
  const nextMin =
    patch.rangeMin !== undefined ? String(patch.rangeMin) : current.rangeMin
  const nextMax =
    patch.rangeMax !== undefined ? String(patch.rangeMax) : current.rangeMax
  return {
    ...patch,
    rangeMin: nextMin,
    rangeMax: nextMax,
    rangeCapacity: formatRangeCapacityFromMinMax(nextMin, nextMax),
  }
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
        const rangeMinRaw = String(row.range_min ?? row.rangeMin ?? '').trim()
        const rangeMaxRaw = String(row.range_max ?? row.rangeMax ?? '').trim()
        const rangeCapacityRaw = String(row.range_capacity ?? row.rangeCapacity ?? '').trim()
        const split =
          rangeMinRaw || rangeMaxRaw
            ? { rangeMin: rangeMinRaw, rangeMax: rangeMaxRaw }
            : splitRangeCapacityToMinMax(rangeCapacityRaw)
        const rangeMin = split.rangeMin
        const rangeMax = split.rangeMax
        const rangeCapacity =
          rangeCapacityRaw || formatRangeCapacityFromMinMax(rangeMin, rangeMax)
        const resolutionLeastCount = String(
          row.resolution_least_count ?? row.resolutionLeastCount ?? '',
        ).trim()
        const unit = String(row.unit ?? '').trim()
        const accuracy = String(row.accuracy ?? '').trim()
        const accreditationScopeId = String(
          row.accreditation_scope_id ?? row.accreditationScopeId ?? '',
        ).trim()
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
          !rangeMin &&
          !rangeMax &&
          !rangeCapacity &&
          !resolutionLeastCount &&
          !unit &&
          !accuracy &&
          !accreditationScopeId &&
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
        const storedId = String(row.id ?? row.range_id ?? '').trim()
        const hasRawSheet =
          row.raw_data_sheet_template != null || row.rawDataSheetTemplate != null
        const hasMu =
          row.mu_calculation_template != null || row.muCalculationTemplate != null
        const hasGenerateReport =
          row.generate_report_config != null || row.generateReportConfig != null
        const hasCertificateTemplate =
          row.certificate_template_config != null || row.certificateTemplate != null
        const modeOfCalibrationRaw = String(
          row.mode_of_calibration ?? row.modeOfCalibration ?? '',
        ).trim()
        const methodUsedRaw = String(row.method_used ?? row.methodUsed ?? '').trim()
        const parsedRawSheet = hasRawSheet
          ? parseRawDataSheetTemplate(
              row.raw_data_sheet_template ?? row.rawDataSheetTemplate,
            )
          : null
        const parsedMu = hasMu
          ? parseMuCalculationTemplate(
              row.mu_calculation_template ?? row.muCalculationTemplate,
            )
          : null
        const parsedGenerateReport = hasGenerateReport
          ? parseGenerateReportConfig(
              row.generate_report_config ?? row.generateReportConfig,
            )
          : undefined
        const parsedCertificateTemplate = hasCertificateTemplate
          ? parseCalibrationCertificateTemplate(
              row.certificate_template_config ?? row.certificateTemplate,
            )
          : undefined
        return {
          id: storedId || newEquipmentRangeId(),
          rangeMin,
          rangeMax,
          rangeCapacity,
          resolutionLeastCount,
          unit,
          accuracy,
          accreditationScopeId,
          masterEquipmentIds: resolvedMasterIds,
          calibrationPoints: rangePointsFromTable(primaryTable),
          calibrationPointsTable: primaryTable,
          masterPointsTabs: resolvedTabs,
          ...(parsedRawSheet ? { rawDataSheetTemplate: parsedRawSheet } : {}),
          ...(parsedMu ? { muCalculationTemplate: parsedMu } : {}),
          ...(parsedGenerateReport ? { generateReportConfig: parsedGenerateReport } : {}),
          ...(parsedCertificateTemplate
            ? { certificateTemplate: parsedCertificateTemplate }
            : {}),
          ...(modeOfCalibrationRaw ? { modeOfCalibration: modeOfCalibrationRaw } : {}),
          ...(methodUsedRaw ? { methodUsed: methodUsedRaw } : {}),
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
    Array.from({ length: len }, (_, i) => {
      const capacity = ranges[i] ?? ''
      const split = splitRangeCapacityToMinMax(capacity)
      return {
        id: newEquipmentRangeId(),
        rangeMin: split.rangeMin,
        rangeMax: split.rangeMax,
        rangeCapacity: capacity || formatRangeCapacityFromMinMax(split.rangeMin, split.rangeMax),
        resolutionLeastCount: resolutions[i] ?? '',
        unit: '',
        accuracy: '',
        accreditationScopeId: '',
        masterEquipmentIds: legacyMaster ? [legacyMaster] : [],
        calibrationPoints: [],
        calibrationPointsTable: emptyCalibrationPointsTable(),
        masterPointsTabs: [emptyMasterPointsTab(legacyMaster)],
      }
    }),
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
      const rangeMin = normalizeText(r.rangeMin)
      const rangeMax = normalizeText(r.rangeMax)
      const rangeCapacity =
        normalizeText(r.rangeCapacity) ||
        formatRangeCapacityFromMinMax(rangeMin, rangeMax)
      const stored: MeasurementRangeStored = {
        id: r.id || newEquipmentRangeId(),
        range_capacity: rangeCapacity,
        range_min: rangeMin,
        range_max: rangeMax,
        resolution_least_count: normalizeText(r.resolutionLeastCount),
        unit: normalizeText(r.unit),
        accuracy: normalizeText(r.accuracy),
        accreditation_scope_id: normalizeText(r.accreditationScopeId) || null,
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
      if (r.rawDataSheetTemplate) {
        stored.raw_data_sheet_template = serializeEquipmentRawDataSheetTemplate(
          r.rawDataSheetTemplate,
        )
      }
      if (r.muCalculationTemplate) {
        stored.mu_calculation_template = serializeEquipmentMuCalculationTemplate(
          r.muCalculationTemplate,
        )
      }
      if (r.generateReportConfig) {
        stored.generate_report_config = serializeEquipmentGenerateReportConfig(
          r.generateReportConfig,
        )
      }
      if (r.certificateTemplate) {
        stored.certificate_template_config = serializeEquipmentCertificateTemplate(
          r.certificateTemplate,
        )
      }
      if ((r.modeOfCalibration ?? '').trim()) {
        stored.mode_of_calibration = (r.modeOfCalibration ?? '').trim()
      }
      if ((r.methodUsed ?? '').trim()) {
        stored.method_used = (r.methodUsed ?? '').trim()
      }
      return stored
    })
    .filter(
      (r) =>
        r.range_capacity.length > 0 ||
        (r.range_min?.length ?? 0) > 0 ||
        (r.range_max?.length ?? 0) > 0 ||
        r.resolution_least_count.length > 0 ||
        (r.unit?.length ?? 0) > 0 ||
        (r.accuracy?.length ?? 0) > 0 ||
        (r.accreditation_scope_id?.length ?? 0) > 0 ||
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
