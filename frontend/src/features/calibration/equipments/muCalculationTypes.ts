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
  /** Combined / final calculations — same multi-table + formula designer as Type A/B. */
  calculation: MuSheetSection
  /**
   * Uncertainty Budget sheet — same multi-table + formula designer as Calculation.
   * Source of truth for MU sheet design going forward.
   */
  uncertaintyBudgetSheet: MuSheetSection
  /**
   * Legacy GUM uncertainty budget table (old dialog model).
   * Kept for parse/serialize backward compatibility; not edited in MU sheet UI.
   */
  uncertaintyBudget: MuUncertaintyBudget
}

export type MuBudgetFieldType = 'text' | 'number' | 'formula'

export type MuBudgetCell = {
  type: MuBudgetFieldType
  /** Typed value, or formula expression when type is formula (e.g. =[Estimate]/SQRT(3)). */
  value: string
  /** Decimal places for formula result display (0–6). Optional; defaults to 2 when formula. */
  decimalPlaces?: number
}

export type MuUncertaintyBudgetColumnDef = {
  key: string
  label: string
  defaultType: MuBudgetFieldType
  /** Default formula expression for formula (Calculated) columns — seeded into each row cell. */
  formulaExpression?: string
  /** Default decimal places for formula columns (0–6). */
  decimalPlaces?: number
}

export type MuUncertaintyBudgetRow = {
  id: string
  /** Cells keyed by column `key`. */
  cells: Record<string, MuBudgetCell>
}

export type MuUncertaintyBudget = {
  /** Empty until user clicks Create Uncertainty Budget Table. */
  columns: MuUncertaintyBudgetColumnDef[]
  rows: MuUncertaintyBudgetRow[]
  combinedUncertainty: MuBudgetCell
  coverageFactorK: MuBudgetCell
  expandedUncertainty: MuBudgetCell
}

/** Standard GUM budget columns created by the Create Table button. */
export const MU_UNCERTAINTY_BUDGET_STANDARD_COLUMNS: MuUncertaintyBudgetColumnDef[] = [
  { key: 'sourceOfUncertainty', label: 'Source of Uncertainty', defaultType: 'text' },
  { key: 'estimate', label: 'Estimate', defaultType: 'number' },
  { key: 'limitDivisor', label: 'Limit / Divisor', defaultType: 'number' },
  { key: 'probabilityDistribution', label: 'Probability Distribution', defaultType: 'text' },
  { key: 'standardUncertainty', label: 'Standard Uncertainty', defaultType: 'number' },
  { key: 'sensitivityCoefficient', label: 'Sensitivity Coefficient', defaultType: 'number' },
  {
    key: 'uncertaintyContribution',
    label: 'Uncertainty Contribution',
    defaultType: 'formula',
    formulaExpression: '=[Standard Uncertainty]*[Sensitivity Coefficient]',
    decimalPlaces: 2,
  },
]

/** Virtual field for Calibration Point (Conduct row point / check point). */
export const MU_CALIBRATION_POINT_FIELD_KEY = 'point_value'

export const MU_CALIBRATION_POINT_COLUMN: RawDataSheetColumn = {
  key: MU_CALIBRATION_POINT_FIELD_KEY,
  label: 'Calibration Point',
  type: 'number',
  required: false,
}

/** Equipment measurement-range fields available as MU formula refs. */
export const MU_RANGE_MIN_FIELD_KEY = 'range_min'
export const MU_RANGE_MAX_FIELD_KEY = 'range_max'
export const MU_LEAST_COUNT_FIELD_KEY = 'least_count'
export const MU_ACCURACY_FIELD_KEY = 'accuracy'

export const MU_EQUIPMENT_RANGE_FIELD_COLUMNS: RawDataSheetColumn[] = [
  {
    key: MU_RANGE_MIN_FIELD_KEY,
    label: 'Range Min',
    type: 'number',
    required: false,
  },
  {
    key: MU_RANGE_MAX_FIELD_KEY,
    label: 'Range Max',
    type: 'number',
    required: false,
  },
  {
    key: MU_LEAST_COUNT_FIELD_KEY,
    label: 'Least Count',
    type: 'number',
    required: false,
  },
  {
    key: MU_ACCURACY_FIELD_KEY,
    label: 'Accuracy',
    type: 'number',
    required: false,
  },
]

const MU_EQUIPMENT_RANGE_FIELD_KEY_SET = new Set(
  MU_EQUIPMENT_RANGE_FIELD_COLUMNS.map((c) => c.key),
)

export function isMuEquipmentRangeFieldKey(key: string): boolean {
  return MU_EQUIPMENT_RANGE_FIELD_KEY_SET.has(key)
}

/** Built-in virtual refs: Calibration Point + Range Min/Max + Least Count + Accuracy. */
export function muBuiltInExternalColumns(): RawDataSheetColumn[] {
  return [MU_CALIBRATION_POINT_COLUMN, ...MU_EQUIPMENT_RANGE_FIELD_COLUMNS]
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

export function newMuUncertaintyBudgetRowId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `mu_ub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export function emptyMuBudgetCell(type: MuBudgetFieldType = 'text'): MuBudgetCell {
  return type === 'formula' ? { type, value: '', decimalPlaces: 2 } : { type, value: '' }
}

function isBudgetFieldType(v: unknown): v is MuBudgetFieldType {
  return v === 'text' || v === 'number' || v === 'formula'
}

/** Clamp formula cell decimal places to 0–6 (default 2). */
export function clampMuBudgetDecimalPlaces(raw: unknown, fallback = 2): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 6) return fallback
  return Math.round(n)
}

/** Legacy string or { type, value } → cell. */
export function parseMuBudgetCell(
  raw: unknown,
  defaultType: MuBudgetFieldType = 'text',
): MuBudgetCell {
  if (raw == null) return emptyMuBudgetCell(defaultType)
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return defaultType === 'formula'
      ? { type: defaultType, value: String(raw), decimalPlaces: 2 }
      : { type: defaultType, value: String(raw) }
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const type = isBudgetFieldType(o.type) ? o.type : defaultType
    const value = String(o.value ?? o.expression ?? '')
    if (type === 'formula') {
      return {
        type,
        value,
        decimalPlaces: clampMuBudgetDecimalPlaces(
          o.decimalPlaces ?? o.decimal_places,
          2,
        ),
      }
    }
    return { type, value }
  }
  return emptyMuBudgetCell(defaultType)
}

export function serializeMuBudgetCell(cell: MuBudgetCell): MuBudgetCell {
  const type = isBudgetFieldType(cell.type) ? cell.type : 'text'
  const base: MuBudgetCell = {
    type,
    value: String(cell.value ?? '').trim(),
  }
  if (type === 'formula') {
    base.decimalPlaces = clampMuBudgetDecimalPlaces(cell.decimalPlaces, 2)
  }
  return base
}

export function emptyMuUncertaintyBudgetRow(
  columns: MuUncertaintyBudgetColumnDef[] = MU_UNCERTAINTY_BUDGET_STANDARD_COLUMNS,
): MuUncertaintyBudgetRow {
  const cells: Record<string, MuBudgetCell> = {}
  for (const col of columns) {
    if (col.key === 'sensitivityCoefficient') {
      cells[col.key] = { type: 'number', value: '1' }
    } else if (col.defaultType === 'formula') {
      cells[col.key] = {
        type: 'formula',
        value: String(col.formulaExpression ?? '').trim(),
        decimalPlaces: clampMuBudgetDecimalPlaces(col.decimalPlaces, 2),
      }
    } else {
      cells[col.key] = emptyMuBudgetCell(col.defaultType)
    }
  }
  return {
    id: newMuUncertaintyBudgetRowId(),
    cells,
  }
}

/** Default: no table until Create Uncertainty Budget Table. */
export function defaultMuUncertaintyBudget(coverageFactorK = 2): MuUncertaintyBudget {
  return {
    columns: [],
    rows: [],
    combinedUncertainty: emptyMuBudgetCell('formula'),
    coverageFactorK: { type: 'number', value: String(coverageFactorK) },
    expandedUncertainty: emptyMuBudgetCell('formula'),
  }
}

/** Stable key from a column label (camelCase); falls back to ub_col_* when empty. */
export function newUncertaintyBudgetColumnKey(label = ''): string {
  const fromLabel = label
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
  if (fromLabel.length > 0) return fromLabel
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `ub_col_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  }
  return `ub_col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function summaryCellsForColumns(
  columns: MuUncertaintyBudgetColumnDef[],
  coverageFactorK: number,
): Pick<
  MuUncertaintyBudget,
  'combinedUncertainty' | 'coverageFactorK' | 'expandedUncertainty'
> {
  const hasContribution = columns.some(
    (c) =>
      c.key === 'uncertaintyContribution' ||
      c.label.trim().toLowerCase() === 'uncertainty contribution',
  )
  return {
    combinedUncertainty: hasContribution
      ? {
          type: 'formula',
          value: '=SQRT(SUMSQ([Uncertainty Contribution]))',
          decimalPlaces: 2,
        }
      : emptyMuBudgetCell('formula'),
    coverageFactorK: { type: 'number', value: String(coverageFactorK || 2) },
    expandedUncertainty: hasContribution
      ? {
          type: 'formula',
          value: '=[Combined Uncertainty]*[Coverage Factor k]',
          decimalPlaces: 2,
        }
      : emptyMuBudgetCell('formula'),
  }
}

/** Create budget table from a custom column list + one blank row + summary defaults. */
export function createUncertaintyBudgetTableFromColumns(
  columns: MuUncertaintyBudgetColumnDef[],
  coverageFactorK = 2,
): MuUncertaintyBudget {
  const normalized = columns.map((c) => {
    const label = c.label.trim() || c.key.trim() || 'Column'
    const key = c.key.trim() || newUncertaintyBudgetColumnKey(label)
    const defaultType: MuBudgetFieldType = isBudgetFieldType(c.defaultType)
      ? c.defaultType
      : 'text'
    const def: MuUncertaintyBudgetColumnDef = { key, label, defaultType }
    if (defaultType === 'formula') {
      const expr = String(c.formulaExpression ?? '').trim()
      if (expr) def.formulaExpression = expr
      def.decimalPlaces = clampMuBudgetDecimalPlaces(c.decimalPlaces, 2)
    }
    return def
  })
  const uniqueKeys = new Set<string>()
  const deduped = normalized.map((c) => {
    let key = c.key
    if (uniqueKeys.has(key)) {
      let n = 2
      while (uniqueKeys.has(`${key}_${n}`)) n += 1
      key = `${key}_${n}`
    }
    uniqueKeys.add(key)
    return { ...c, key }
  })
  return {
    columns: deduped,
    rows: [emptyMuUncertaintyBudgetRow(deduped)],
    ...summaryCellsForColumns(deduped, coverageFactorK),
  }
}

/** Create standard columns + one blank row + summary defaults. */
export function createUncertaintyBudgetTable(coverageFactorK = 2): MuUncertaintyBudget {
  return createUncertaintyBudgetTableFromColumns(
    MU_UNCERTAINTY_BUDGET_STANDARD_COLUMNS.map((c) => ({ ...c })),
    coverageFactorK,
  )
}

/** @deprecated Use createUncertaintyBudgetTable — kept name for call sites during migrate. */
export function buildUncertaintyBudgetFromComponents(
  _typeA: MuSheetSection | null | undefined,
  _typeB: MuSheetSection | null | undefined,
  coverageFactorK = 2,
): MuUncertaintyBudget {
  return createUncertaintyBudgetTable(coverageFactorK)
}

/** Empty Type A / Type B / Calculation / Uncertainty Budget with one blank component each. */
export function defaultMuCalculationTemplate(
  _legacyFamily?: string,
): MuCalculationTemplate {
  return {
    version: 2,
    coverageFactorK: 2,
    decimalPlaces: 2,
    typeA: emptySection('Type A — Repeatability'),
    typeB: emptySection('Type B — Contributions'),
    calculation: emptySection('Calculation'),
    uncertaintyBudgetSheet: emptySection('Uncertainty Budget'),
    uncertaintyBudget: defaultMuUncertaintyBudget(2),
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

function parseUncertaintyBudgetColumn(raw: unknown): MuUncertaintyBudgetColumnDef | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const key = String(o.key ?? '').trim()
  if (!key) return null
  const label = String(o.label ?? key).trim() || key
  const defaultType = isBudgetFieldType(o.defaultType)
    ? o.defaultType
    : isBudgetFieldType(o.default_type)
      ? o.default_type
      : 'text'
  const def: MuUncertaintyBudgetColumnDef = { key, label, defaultType }
  if (defaultType === 'formula') {
    const expr = String(
      o.formulaExpression ?? o.formula_expression ?? o.defaultFormula ?? '',
    ).trim()
    if (expr) def.formulaExpression = expr
    if (o.decimalPlaces != null || o.decimal_places != null) {
      def.decimalPlaces = clampMuBudgetDecimalPlaces(
        o.decimalPlaces ?? o.decimal_places,
        2,
      )
    }
  }
  return def
}

function legacyFixedRowToCells(o: Record<string, unknown>): Record<string, MuBudgetCell> {
  const cells: Record<string, MuBudgetCell> = {}
  for (const col of MU_UNCERTAINTY_BUDGET_STANDARD_COLUMNS) {
    const snake = col.key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
    cells[col.key] = parseMuBudgetCell(o[col.key] ?? o[snake], col.defaultType)
  }
  return cells
}

function parseUncertaintyBudgetRow(raw: unknown): MuUncertaintyBudgetRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? '').trim() || newMuUncertaintyBudgetRowId()

  if (o.cells && typeof o.cells === 'object' && !Array.isArray(o.cells)) {
    const cellsRaw = o.cells as Record<string, unknown>
    const cells: Record<string, MuBudgetCell> = {}
    for (const [key, val] of Object.entries(cellsRaw)) {
      const std = MU_UNCERTAINTY_BUDGET_STANDARD_COLUMNS.find((c) => c.key === key)
      cells[key] = parseMuBudgetCell(val, std?.defaultType ?? 'text')
    }
    return { id, cells }
  }

  // Legacy fixed-field row
  if (
    'sourceOfUncertainty' in o ||
    'source_of_uncertainty' in o ||
    'estimate' in o
  ) {
    return { id, cells: legacyFixedRowToCells(o) }
  }

  return { id, cells: {} }
}

function parseUncertaintyBudget(
  raw: unknown,
  coverageFactorK: number,
): MuUncertaintyBudget {
  const defaults = defaultMuUncertaintyBudget(coverageFactorK)
  if (!raw || typeof raw !== 'object') return defaults
  const o = raw as Record<string, unknown>

  const columnsRaw = o.columns
  let columns: MuUncertaintyBudgetColumnDef[] = Array.isArray(columnsRaw)
    ? columnsRaw
        .map(parseUncertaintyBudgetColumn)
        .filter((c): c is MuUncertaintyBudgetColumnDef => c != null)
    : []

  const rowsRaw = o.rows
  const rows = Array.isArray(rowsRaw)
    ? rowsRaw
        .map(parseUncertaintyBudgetRow)
        .filter((r): r is MuUncertaintyBudgetRow => r != null)
    : []

  // Legacy: had rows with fixed fields but no columns array → restore standard columns
  if (columns.length === 0 && rows.some((r) => Object.keys(r.cells).length > 0)) {
    columns = MU_UNCERTAINTY_BUDGET_STANDARD_COLUMNS.map((c) => ({ ...c }))
  }

  return {
    columns,
    rows: columns.length > 0 ? (rows.length > 0 ? rows : []) : [],
    combinedUncertainty: parseMuBudgetCell(
      o.combinedUncertainty ?? o.combined_uncertainty,
      'formula',
    ),
    coverageFactorK: parseMuBudgetCell(
      o.coverageFactorK ?? o.coverage_factor_k ?? defaults.coverageFactorK.value,
      'number',
    ),
    expandedUncertainty: parseMuBudgetCell(
      o.expandedUncertainty ?? o.expanded_uncertainty,
      'formula',
    ),
  }
}

function serializeUncertaintyBudget(budget: MuUncertaintyBudget): MuUncertaintyBudget {
  const columns = (budget.columns ?? []).map((c) => {
    const defaultType: MuBudgetFieldType = isBudgetFieldType(c.defaultType)
      ? c.defaultType
      : 'text'
    const def: MuUncertaintyBudgetColumnDef = {
      key: c.key.trim(),
      label: c.label.trim() || c.key,
      defaultType,
    }
    if (defaultType === 'formula') {
      const expr = String(c.formulaExpression ?? '').trim()
      if (expr) def.formulaExpression = expr
      if (c.decimalPlaces != null) {
        def.decimalPlaces = clampMuBudgetDecimalPlaces(c.decimalPlaces, 2)
      }
    }
    return def
  })
  const rows =
    columns.length === 0
      ? []
      : (budget.rows ?? []).map((r) => {
          const cells: Record<string, MuBudgetCell> = {}
          for (const col of columns) {
            cells[col.key] = serializeMuBudgetCell(
              r.cells?.[col.key] ?? emptyMuBudgetCell(col.defaultType),
            )
          }
          return {
            id: r.id.trim() || newMuUncertaintyBudgetRowId(),
            cells,
          }
        })
  const kCell = serializeMuBudgetCell(budget.coverageFactorK)
  return {
    columns,
    rows,
    combinedUncertainty: serializeMuBudgetCell(budget.combinedUncertainty),
    coverageFactorK: { ...kCell, value: kCell.value || '2' },
    expandedUncertainty: serializeMuBudgetCell(budget.expandedUncertainty),
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
    const coverageFactorK = readCoverageK(o, defaults.coverageFactorK)
    return {
      version: 2,
      coverageFactorK,
      decimalPlaces: readDecimalPlaces(o, defaults.decimalPlaces),
      typeA: emptySection(defaults.typeA.label),
      typeB: emptySection(defaults.typeB.label),
      calculation: emptySection(defaults.calculation.label),
      uncertaintyBudgetSheet: emptySection(defaults.uncertaintyBudgetSheet.label),
      uncertaintyBudget: defaultMuUncertaintyBudget(coverageFactorK),
    }
  }

  const typeARaw = o.typeA ?? o.type_a
  const typeBRaw = o.typeB ?? o.type_b
  const calculationRaw = o.calculation ?? o.calc
  const uncertaintyBudgetSheetRaw =
    o.uncertaintyBudgetSheet ?? o.uncertainty_budget_sheet
  const uncertaintyBudgetRaw = o.uncertaintyBudget ?? o.uncertainty_budget

  const looksLikeV2 =
    version === 2 ||
    sectionLooksLikeV2(typeARaw) ||
    sectionLooksLikeV2(typeBRaw) ||
    sectionLooksLikeV2(calculationRaw) ||
    sectionLooksLikeV2(uncertaintyBudgetSheetRaw)

  if (!looksLikeV2 && version !== 2) {
    if (Object.keys(o).length === 0) return null
    const coverageFactorK = readCoverageK(o, defaults.coverageFactorK)
    return {
      version: 2,
      coverageFactorK,
      decimalPlaces: readDecimalPlaces(o, defaults.decimalPlaces),
      typeA: emptySection(defaults.typeA.label),
      typeB: emptySection(defaults.typeB.label),
      calculation: emptySection(defaults.calculation.label),
      uncertaintyBudgetSheet: emptySection(defaults.uncertaintyBudgetSheet.label),
      uncertaintyBudget: defaultMuUncertaintyBudget(coverageFactorK),
    }
  }

  const coverageFactorK = readCoverageK(o, defaults.coverageFactorK)
  return {
    version: 2,
    coverageFactorK,
    decimalPlaces: readDecimalPlaces(o, defaults.decimalPlaces),
    typeA: parseSection(typeARaw, defaults.typeA),
    typeB: parseSection(typeBRaw, defaults.typeB),
    calculation: parseSection(calculationRaw, defaults.calculation),
    uncertaintyBudgetSheet: parseSection(
      uncertaintyBudgetSheetRaw,
      defaults.uncertaintyBudgetSheet,
    ),
    uncertaintyBudget: parseUncertaintyBudget(uncertaintyBudgetRaw, coverageFactorK),
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
  const coverageFactorK =
    Number.isFinite(template.coverageFactorK) && template.coverageFactorK > 0
      ? template.coverageFactorK
      : 2
  return {
    version: 2,
    coverageFactorK,
    decimalPlaces:
      Number.isFinite(template.decimalPlaces) &&
      template.decimalPlaces >= 0 &&
      template.decimalPlaces <= 6
        ? Math.round(template.decimalPlaces)
        : 2,
    typeA: serializeSection(template.typeA),
    typeB: serializeSection(template.typeB),
    calculation: serializeSection(
      template.calculation ?? emptySection('Calculation'),
    ),
    uncertaintyBudgetSheet: serializeSection(
      template.uncertaintyBudgetSheet ?? emptySection('Uncertainty Budget'),
    ),
    uncertaintyBudget: serializeUncertaintyBudget(
      template.uncertaintyBudget ?? defaultMuUncertaintyBudget(coverageFactorK),
    ),
  }
}

export function emptyMuSheetColumn(): RawDataSheetColumn {
  return emptyRawDataSheetColumn()
}

/** Formula autocomplete source — column plus optional parent component/table label. */
export type MuFormulaSourceColumn = RawDataSheetColumn & {
  /** Parent component/table label for autocomplete disambiguation. */
  componentLabel?: string
}

/** All columns across tables in a section (for formula refs), with component labels. */
export function flattenMuSectionColumns(section: MuSheetSection): MuFormulaSourceColumn[] {
  return section.tables.flatMap((t, index) => {
    const componentLabel = t.label.trim() || `Component ${index + 1}`
    return t.columns.map((c) => ({ ...c, componentLabel }))
  })
}
