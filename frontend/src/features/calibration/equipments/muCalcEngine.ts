/** Runtime helpers for MU Calculation Sheet evaluation (Conduct / GUM wizard). */

import {
  computeFormulaValue,
  type RawDataSheetColumn,
  type RawDataSheetRowValues,
} from '@/features/calibration/rawDataSheetTypes'
import {
  MU_ACCURACY_FIELD_KEY,
  MU_CALIBRATION_POINT_FIELD_KEY,
  MU_LEAST_COUNT_FIELD_KEY,
  MU_RANGE_MAX_FIELD_KEY,
  MU_RANGE_MIN_FIELD_KEY,
  flattenMuSectionColumns,
  muBuiltInExternalColumns,
  type MuCalculationTemplate,
  type MuSheetSection,
  type MuSheetTable,
} from './muCalculationTypes'

export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Type A u_A = s / √n from observation values (Conduct auto-calc). */
export function computeTypeAFromReadings(values: number[]): number | null {
  const s = sampleStdDev(values)
  if (s == null) return null
  return s / Math.sqrt(values.length)
}

export function parseMuNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const t = String(raw ?? '').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function formatMuNumber(n: number | null, decimalPlaces: number): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(decimalPlaces)
}

export type MuEquipmentRangeContext = {
  rangeMin?: string
  rangeMax?: string
  leastCount?: string
  accuracy?: string
}

/**
 * Prefer a single positive LC token from equipment text.
 * Handles units ("0.05 kN") and legacy joined columns ("0.01 | 0.05").
 */
export function normalizeMuLeastCountRaw(raw: string | null | undefined): string {
  const full = String(raw ?? '').trim()
  if (!full) return ''
  const segments = full
    .split(/[|;/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const pool = segments.length > 0 ? segments : [full]
  for (const segment of pool) {
    const t = segment.replace(/^[±+\s]+/, '').replace(/,/g, '').trim()
    if (!t) continue
    const direct = Number(t)
    if (Number.isFinite(direct) && direct > 0) return segment
    const m = t.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!m) continue
    const n = Number(m[0])
    if (Number.isFinite(n) && n > 0) return segment
  }
  return full
}

/** Built-in MU formula refs: Calibration Point + range fields. */
export function buildMuBuiltinValues(
  pointValue: string | null | undefined,
  range: MuEquipmentRangeContext | null | undefined,
): RawDataSheetRowValues {
  return {
    [MU_CALIBRATION_POINT_FIELD_KEY]: String(pointValue ?? '').trim(),
    [MU_RANGE_MIN_FIELD_KEY]: String(range?.rangeMin ?? '').trim(),
    [MU_RANGE_MAX_FIELD_KEY]: String(range?.rangeMax ?? '').trim(),
    [MU_LEAST_COUNT_FIELD_KEY]: normalizeMuLeastCountRaw(range?.leastCount),
    [MU_ACCURACY_FIELD_KEY]: String(range?.accuracy ?? '').trim(),
  }
}

export function sectionHasConfiguredColumns(section: MuSheetSection | null | undefined): boolean {
  if (!section?.enabled) return false
  return (section.tables ?? []).some((t) => (t.columns?.length ?? 0) > 0)
}

/** True when at least one of Type A / Type B / Calculation has enabled columns. */
export function muTemplateHasUsableSections(template: MuCalculationTemplate | null | undefined): boolean {
  if (!template) return false
  return (
    sectionHasConfiguredColumns(template.typeA) ||
    sectionHasConfiguredColumns(template.typeB) ||
    sectionHasConfiguredColumns(template.calculation)
  )
}

export function emptyValuesForMuTable(table: MuSheetTable): RawDataSheetRowValues {
  const values: RawDataSheetRowValues = {}
  for (const col of table.columns) {
    values[col.key] = ''
  }
  return values
}

/**
 * Evaluate formula columns for one MU component table.
 * Only this table's Calculated columns are recomputed; external (RDS / other section)
 * values are used as formula inputs via `externalColumns` / `externalValues`.
 */
export function evaluateMuTableValues(
  table: MuSheetTable,
  values: RawDataSheetRowValues,
  decimalPlaces: number,
  externalColumns: RawDataSheetColumn[] = [],
  externalValues: RawDataSheetRowValues = {},
): RawDataSheetRowValues {
  const allColumns = [...externalColumns, ...table.columns]
  const working: RawDataSheetRowValues = { ...externalValues }
  for (const col of table.columns) {
    if (col.type !== 'formula') {
      working[col.key] = values[col.key] ?? ''
    }
  }

  const next: RawDataSheetRowValues = { ...values }
  for (const col of table.columns) {
    if (col.type !== 'formula') {
      next[col.key] = values[col.key] ?? ''
      continue
    }
    const result = computeFormulaValue(col, working, decimalPlaces, allColumns)
    next[col.key] = result
    working[col.key] = result
  }
  return next
}

export function flattenSectionTableValues(
  section: MuSheetSection,
  tableValues: Record<string, RawDataSheetRowValues>,
  decimalPlaces: number,
  externalColumns: RawDataSheetColumn[],
  externalValues: RawDataSheetRowValues,
): RawDataSheetRowValues {
  const out: RawDataSheetRowValues = {}
  for (const table of section.tables) {
    if (table.columns.length === 0) continue
    const evaluated = evaluateMuTableValues(
      table,
      tableValues[table.id] ?? emptyValuesForMuTable(table),
      decimalPlaces,
      externalColumns,
      { ...externalValues, ...out },
    )
    Object.assign(out, evaluated)
  }
  return out
}

/** Required non-formula columns must be non-blank. */
export function sectionRequiredFieldsFilled(
  section: MuSheetSection,
  tableValues: Record<string, RawDataSheetRowValues>,
): boolean {
  for (const table of section.tables) {
    const vals = tableValues[table.id] ?? emptyValuesForMuTable(table)
    for (const col of table.columns) {
      if (col.type === 'formula') continue
      if (!col.required) continue
      if (!String(vals[col.key] ?? '').trim()) return false
    }
  }
  return true
}

/**
 * Copy RDS row values into MU table number columns by key or label match.
 * Formula columns are never overwritten. Text columns fill only on exact key match.
 */
export function importRdsValuesIntoMuTable(
  table: MuSheetTable,
  current: RawDataSheetRowValues,
  rdsColumns: RawDataSheetColumn[],
  rdsValues: RawDataSheetRowValues,
): RawDataSheetRowValues {
  const byKey = new Map(rdsColumns.map((c) => [c.key, c]))
  const byLabel = new Map(
    rdsColumns.map((c) => [c.label.trim().toLowerCase(), c]),
  )
  const next = { ...current }
  for (const col of table.columns) {
    if (col.type === 'formula') continue
    const match =
      byKey.get(col.key) ?? byLabel.get(col.label.trim().toLowerCase()) ?? null
    if (!match) continue
    if (col.type === 'text' && match.key !== col.key) continue
    const raw = String(rdsValues[match.key] ?? '').trim()
    if (raw) next[col.key] = raw
  }
  return next
}

const EXPANDED_U_LABEL = /expanded|\bU\b|uncertainty\s*U|combined.*k|coverage/i
const UC_LABEL = /combined|u\s*c\b|uc\b|standard\s*uncertainty/i

/** Prefer an Expanded U (or similar) calculation output for Generate Report. */
export function pickExpandedUncertaintyDisplay(
  calculation: MuSheetSection | null | undefined,
  calcValues: RawDataSheetRowValues,
  coverageFactorK: number,
): { label: string; value: string } | null {
  if (!calculation) return null
  const cols = flattenMuSectionColumns(calculation)
  const formulaCols = cols.filter((c) => c.type === 'formula')

  const expandedCol =
    formulaCols.find((c) => /expanded/i.test(c.label)) ??
    formulaCols.find((c) => EXPANDED_U_LABEL.test(c.label)) ??
    null
  if (expandedCol) {
    const v = String(calcValues[expandedCol.key] ?? '').trim()
    if (v) return { label: expandedCol.label || 'Expanded U', value: v }
  }

  const ucCol =
    formulaCols.find((c) => /combined/i.test(c.label)) ??
    formulaCols.find((c) => UC_LABEL.test(c.label)) ??
    null
  if (ucCol) {
    const uc = parseMuNumber(calcValues[ucCol.key])
    const k =
      Number.isFinite(coverageFactorK) && coverageFactorK > 0 ? coverageFactorK : 2
    if (uc != null) {
      const U = uc * k
      const dp = ucCol.formula?.decimals ?? 2
      return {
        label: `Expanded U (k = ${k})`,
        value: formatMuNumber(U, dp),
      }
    }
  }

  for (let i = formulaCols.length - 1; i >= 0; i -= 1) {
    const col = formulaCols[i]!
    const v = String(calcValues[col.key] ?? '').trim()
    if (v) return { label: col.label || col.key, value: v }
  }

  for (let i = cols.length - 1; i >= 0; i -= 1) {
    const col = cols[i]!
    const v = String(calcValues[col.key] ?? '').trim()
    if (v && parseMuNumber(v) != null) {
      return { label: col.label || col.key, value: v }
    }
  }
  return null
}

export type MuCalcResult = {
  typeA: number | null
  typeBRows: Array<{
    id: string
    name: string
    ui: number | null
    contribution: number | null
  }>
  /** Combined standard uncertainty u_c */
  uc: number | null
  coverageFactorK: number
  /** Expanded uncertainty U = k · u_c */
  expandedU: number | null
}

/**
 * Template design stub — runtime evaluation is done via evaluateMuTableValues
 * in the Conduct GUM wizard.
 */
export function computeMuCalculation(template: MuCalculationTemplate): MuCalcResult {
  const k =
    Number.isFinite(template.coverageFactorK) && template.coverageFactorK > 0
      ? template.coverageFactorK
      : 2
  return {
    typeA: null,
    typeBRows: [],
    uc: null,
    coverageFactorK: k,
    expandedU: null,
  }
}

export { muBuiltInExternalColumns }
