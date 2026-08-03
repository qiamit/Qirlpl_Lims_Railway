/** Equipment-level Measurement Uncertainty (MU) calculation sheet — v2 (RDS-style columns). */

import {
  RAW_DATA_FORMULA_OPS,
  emptyColumnFormula,
  emptyRawDataSheetColumn,
  newRawDataColumnKey,
  type RawDataColumnFormula,
  type RawDataColumnType,
  type RawDataFormulaOp,
  type RawDataSheetColumn,
} from '@/features/calibration/rawDataSheetTypes'

/** One named table / component inside Type A or Type B. */
export type MuSheetTable = {
  id: string
  label: string
  columns: RawDataSheetColumn[]
}

export type MuSheetSection = {
  enabled: boolean
  label: string
  /** Multiple component tables under this Type (A or B). */
  tables: MuSheetTable[]
}

export type MuCalculationTemplate = {
  version: 2
  coverageFactorK: number
  decimalPlaces: number
  typeA: MuSheetSection
  typeB: MuSheetSection
}

/** Virtual field for Calibration Point (Conduct row point / check point). */
export const MU_CALIBRATION_POINT_FIELD_KEY = 'point_value'

export const MU_CALIBRATION_POINT_COLUMN: RawDataSheetColumn = {
  key: MU_CALIBRATION_POINT_FIELD_KEY,
  label: 'Calibration Point',
  type: 'number',
  required: false,
}

export function newMuSheetTableId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `mu_tbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export function emptyMuSheetTable(label = 'Component 1'): MuSheetTable {
  return {
    id: newMuSheetTableId(),
    label,
    columns: [],
  }
}

function emptySection(label: string): MuSheetSection {
  return {
    enabled: true,
    label,
    tables: [emptyMuSheetTable('Component 1')],
  }
}

/** Empty Type A / Type B with one blank component table each. */
export function defaultMuCalculationTemplate(
  _legacyFamily?: string,
): MuCalculationTemplate {
  return {
    version: 2,
    coverageFactorK: 2,
    decimalPlaces: 2,
    typeA: emptySection('Type A — Repeatability'),
    typeB: emptySection('Type B — Contributions'),
  }
}

function isColumnType(v: unknown): v is RawDataColumnType {
  return v === 'text' || v === 'number' || v === 'formula'
}

function isFormulaOp(v: unknown): v is RawDataFormulaOp {
  return RAW_DATA_FORMULA_OPS.some((o) => o.value === v)
}

function parseColumnFormula(raw: unknown): RawDataColumnFormula | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const expressionRaw = o.expression ?? o.formula_expression
  const expression =
    expressionRaw == null ? null : String(expressionRaw).trim() || null
  if (!isFormulaOp(o.op) && !expression) return null
  const sources = Array.isArray(o.sources)
    ? o.sources.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)
    : []
  const constantRaw = Number(o.constant)
  const decimalsRaw = Number(o.decimals)
  const refRaw = Number(o.referenceTempC ?? o.reference_temp_c)
  return {
    op: isFormulaOp(o.op) ? o.op : 'sum',
    sources,
    constant: o.constant == null || !Number.isFinite(constantRaw) ? null : constantRaw,
    decimals:
      o.decimals == null || !Number.isFinite(decimalsRaw) || decimalsRaw < 0 || decimalsRaw > 6
        ? null
        : Math.round(decimalsRaw),
    referenceTempC:
      o.referenceTempC == null && o.reference_temp_c == null
        ? null
        : Number.isFinite(refRaw)
          ? refRaw
          : null,
    expression,
  }
}

function parseSheetColumn(raw: unknown): RawDataSheetColumn | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const key = String(row.key ?? '').trim() || newRawDataColumnKey()
  const label = String(row.label ?? '').trim()
  const type = isColumnType(row.type) ? row.type : 'number'
  const formula =
    type === 'formula' ? (parseColumnFormula(row.formula) ?? emptyColumnFormula()) : undefined
  return {
    key,
    label,
    type,
    required: type === 'formula' ? false : Boolean(row.required),
    ...(formula ? { formula } : {}),
  }
}

function parseTable(raw: unknown, fallbackLabel: string, index: number): MuSheetTable | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const columnsRaw = o.columns
  const columns = Array.isArray(columnsRaw)
    ? columnsRaw.map(parseSheetColumn).filter((c): c is RawDataSheetColumn => c != null)
    : []
  const id = String(o.id ?? '').trim() || newMuSheetTableId()
  const label =
    String(o.label ?? '').trim() ||
    (index === 0 ? fallbackLabel : `Component ${index + 1}`)
  return { id, label, columns }
}

function parseSection(
  raw: unknown,
  defaults: MuSheetSection,
): MuSheetSection {
  if (!raw || typeof raw !== 'object') {
    return {
      ...defaults,
      tables: [emptyMuSheetTable('Component 1')],
    }
  }
  const o = raw as Record<string, unknown>
  const enabled = typeof o.enabled === 'boolean' ? o.enabled : defaults.enabled
  const label = String(o.label ?? defaults.label).trim() || defaults.label

  // Multi-table shape
  if (Array.isArray(o.tables)) {
    const tables = o.tables
      .map((t, i) => parseTable(t, 'Component 1', i))
      .filter((t): t is MuSheetTable => t != null)
    return {
      enabled,
      label,
      tables: tables.length > 0 ? tables : [emptyMuSheetTable('Component 1')],
    }
  }

  // Legacy single-sheet v2: top-level columns → one table
  if (Array.isArray(o.columns)) {
    const columns = o.columns
      .map(parseSheetColumn)
      .filter((c): c is RawDataSheetColumn => c != null)
    return {
      enabled,
      label,
      tables: [
        {
          id: newMuSheetTableId(),
          label: 'Component 1',
          columns,
        },
      ],
    }
  }

  return {
    enabled,
    label,
    tables: [emptyMuSheetTable('Component 1')],
  }
}

function readCoverageK(o: Record<string, unknown>, fallback: number): number {
  const kRaw = Number(o.coverageFactorK ?? o.coverage_factor_k)
  return Number.isFinite(kRaw) && kRaw > 0 ? kRaw : fallback
}

function readDecimalPlaces(o: Record<string, unknown>, fallback: number): number {
  const dpRaw = Number(o.decimalPlaces ?? o.decimal_places)
  return Number.isFinite(dpRaw) && dpRaw >= 0 && dpRaw <= 6
    ? Math.round(dpRaw)
    : fallback
}

function sectionLooksLikeV2(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return Array.isArray(o.tables) || Array.isArray(o.columns)
}

/**
 * Parse stored JSON. Version 2 loads Type A/B column sheets (single or multi-table).
 * Legacy v1 (sources / typeBComponents) → empty sheets (no silent migration).
 */
export function parseMuCalculationTemplate(raw: unknown): MuCalculationTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const defaults = defaultMuCalculationTemplate()
  const version = Number(o.version)

  // Legacy v1 or unknown → keep k/dp only; empty column sheets.
  if (version === 1 || (version !== 2 && Array.isArray(o.typeBComponents ?? o.type_b_components))) {
    return {
      version: 2,
      coverageFactorK: readCoverageK(o, defaults.coverageFactorK),
      decimalPlaces: readDecimalPlaces(o, defaults.decimalPlaces),
      typeA: emptySection(defaults.typeA.label),
      typeB: emptySection(defaults.typeB.label),
    }
  }

  const typeARaw = o.typeA ?? o.type_a
  const typeBRaw = o.typeB ?? o.type_b

  const looksLikeV2 =
    version === 2 || sectionLooksLikeV2(typeARaw) || sectionLooksLikeV2(typeBRaw)

  if (!looksLikeV2 && version !== 2) {
    if (Object.keys(o).length === 0) return null
    return {
      version: 2,
      coverageFactorK: readCoverageK(o, defaults.coverageFactorK),
      decimalPlaces: readDecimalPlaces(o, defaults.decimalPlaces),
      typeA: emptySection(defaults.typeA.label),
      typeB: emptySection(defaults.typeB.label),
    }
  }

  return {
    version: 2,
    coverageFactorK: readCoverageK(o, defaults.coverageFactorK),
    decimalPlaces: readDecimalPlaces(o, defaults.decimalPlaces),
    typeA: parseSection(typeARaw, defaults.typeA),
    typeB: parseSection(typeBRaw, defaults.typeB),
  }
}

/** Empty `{}` or invalid → default empty v2 template. */
export function muCalculationTemplateFromRaw(raw: unknown): MuCalculationTemplate {
  const parsed = parseMuCalculationTemplate(raw)
  if (parsed) return parsed
  return defaultMuCalculationTemplate()
}

function serializeColumn(col: RawDataSheetColumn): RawDataSheetColumn {
  const type = isColumnType(col.type) ? col.type : 'number'
  const base: RawDataSheetColumn = {
    key: col.key.trim() || newRawDataColumnKey(),
    label: col.label.trim(),
    type,
    required: type === 'formula' ? false : Boolean(col.required),
  }
  if (type === 'formula') {
    const f = col.formula ?? emptyColumnFormula()
    base.formula = {
      op: f.op,
      sources: [...f.sources],
      constant: f.constant,
      decimals: f.decimals,
      referenceTempC: f.referenceTempC,
      expression: f.expression?.trim() || null,
    }
  }
  return base
}

function serializeTable(table: MuSheetTable): MuSheetTable {
  return {
    id: table.id.trim() || newMuSheetTableId(),
    label: table.label.trim() || 'Component',
    columns: table.columns.map(serializeColumn),
  }
}

function serializeSection(section: MuSheetSection): MuSheetSection {
  const tables =
    section.tables.length > 0
      ? section.tables.map(serializeTable)
      : [emptyMuSheetTable('Component 1')]
  return {
    enabled: section.enabled,
    label: section.label.trim(),
    tables,
  }
}

export function serializeMuCalculationTemplate(
  template: MuCalculationTemplate,
): MuCalculationTemplate {
  return {
    version: 2,
    coverageFactorK:
      Number.isFinite(template.coverageFactorK) && template.coverageFactorK > 0
        ? template.coverageFactorK
        : 2,
    decimalPlaces:
      Number.isFinite(template.decimalPlaces) &&
      template.decimalPlaces >= 0 &&
      template.decimalPlaces <= 6
        ? Math.round(template.decimalPlaces)
        : 2,
    typeA: serializeSection(template.typeA),
    typeB: serializeSection(template.typeB),
  }
}

export function emptyMuSheetColumn(): RawDataSheetColumn {
  return emptyRawDataSheetColumn()
}

/** All columns across tables in a section (for formula refs). */
export function flattenMuSectionColumns(section: MuSheetSection): RawDataSheetColumn[] {
  return section.tables.flatMap((t) => t.columns)
}
