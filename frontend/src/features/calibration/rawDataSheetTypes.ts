/** Raw Data Sheet template (equipment_master) + filled payload (calibration_raw_data_sheets). */

import {
  masterEquipmentFormulaRefColumns,
  masterEquipmentFormulaRefValues,
  masterPointsFormulaRefColumns,
  masterPointsFormulaRefValues,
  type MasterFormulaRefSource,
} from './masterEquipmentFormulaRefs'

export type RawDataColumnType = 'text' | 'number' | 'formula'

export type RawDataFormulaOp =
  | 'sum'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'average'
  | 'median'
  | 'mode'
  | 'stddev'
  | 'variance'
  | 'min'
  | 'max'
  | 'range'
  | 'error'
  | 'abs_error'
  | 'percent_error'
  | 'percent_of'
  /** Observed × (1 + α × (T_ref − T)) */
  | 'temp_correct'

export type RawDataColumnFormula = {
  op: RawDataFormulaOp
  /** Source column keys, in the order they are used by the operation. */
  sources: string[]
  /** Optional extra operand for sum / subtract / multiply / divide; α for temp_correct. */
  constant: number | null
  /** Decimal places override; null → use sheet decimal places. */
  decimals: number | null
  /** Reference temperature °C for temp_correct (default 20). */
  referenceTempC?: number | null
  /**
   * Excel-style formula, e.g. `=AVERAGE([Reading at 0],[Reading at 120])` or `=[As Found]-[Nominal]`.
   * When set (non-empty), this is evaluated instead of op/sources.
   */
  expression?: string | null
}

export type RawDataSheetColumn = {
  key: string
  label: string
  type: RawDataColumnType
  required: boolean
  /** Present only when type = 'formula'. */
  formula?: RawDataColumnFormula
}

export type RawDataFormulaOpMeta = {
  value: RawDataFormulaOp
  label: string
  /** How many source columns the operation consumes. */
  arity: 'multi' | 'two'
  /** Whether a constant operand is meaningful. */
  allowsConstant: boolean
  hint: string
}

export const RAW_DATA_FORMULA_OPS: RawDataFormulaOpMeta[] = [
  {
    value: 'sum',
    label: 'Add (+)',
    arity: 'multi',
    allowsConstant: true,
    hint: 'A + B + C + k',
  },
  {
    value: 'subtract',
    label: 'Subtract (−)',
    arity: 'multi',
    allowsConstant: true,
    hint: 'A − B − C − k',
  },
  {
    value: 'multiply',
    label: 'Multiply (×)',
    arity: 'multi',
    allowsConstant: true,
    hint: 'A × B × C × k',
  },
  {
    value: 'divide',
    label: 'Divide (÷)',
    arity: 'multi',
    allowsConstant: true,
    hint: 'A ÷ B ÷ k',
  },
  {
    value: 'average',
    label: 'Average / Mean',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Mean of selected columns',
  },
  {
    value: 'median',
    label: 'Median',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Middle value',
  },
  {
    value: 'mode',
    label: 'Mode',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Most frequent value',
  },
  {
    value: 'stddev',
    label: 'Standard Deviation',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Sample SD (n−1)',
  },
  {
    value: 'variance',
    label: 'Variance',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Sample variance (n−1)',
  },
  {
    value: 'min',
    label: 'Minimum',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Lowest value',
  },
  {
    value: 'max',
    label: 'Maximum',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Highest value',
  },
  {
    value: 'range',
    label: 'Range (max − min)',
    arity: 'multi',
    allowsConstant: false,
    hint: 'Spread',
  },
  {
    value: 'error',
    label: 'Error (A − B)',
    arity: 'two',
    allowsConstant: false,
    hint: 'Measured − Nominal',
  },
  {
    value: 'abs_error',
    label: 'Absolute Error |A − B|',
    arity: 'two',
    allowsConstant: false,
    hint: 'Magnitude only',
  },
  {
    value: 'percent_error',
    label: '% Error ((A − B) ÷ B × 100)',
    arity: 'two',
    allowsConstant: false,
    hint: 'Relative error',
  },
  {
    value: 'percent_of',
    label: '% of (A ÷ B × 100)',
    arity: 'two',
    allowsConstant: false,
    hint: 'Ratio in percent',
  },
  {
    value: 'temp_correct',
    label: 'Temp Corrected (A × (1 + α(Tref − T)))',
    arity: 'two',
    allowsConstant: true,
    hint: 'A = reading, B = temperature °C; constant = α',
  },
]

export function formulaOpMeta(op: RawDataFormulaOp): RawDataFormulaOpMeta {
  return RAW_DATA_FORMULA_OPS.find((o) => o.value === op) ?? RAW_DATA_FORMULA_OPS[0]!
}

export type RawDataVerificationItem = {
  id: string
  label: string
  required: boolean
}

export type RawDataSheetTemplate = {
  version: 1
  verification: { items: RawDataVerificationItem[] }
  columns: RawDataSheetColumn[]
  /** Seed raw-data rows from equipment measurement_ranges.calibration_points */
  seedFrom: 'calibration_points' | 'none'
  /** Default Environment Condition setup for Conduct Raw Data Sheet. */
  environmentDefaults?: {
    /** Built-in parameter keys (legacy). Prefer parameterColumns when set. */
    selectedParameters: EnvParameterKey[]
    /** User-defined parameter column headers (Temperature, Pressure, Humidity, custom…). */
    parameterColumns?: EnvParameterColumn[]
    /** Reading / Point labels available (and preferred) for the Field column. */
    selectedReadingPoints: string[]
    /** Pre-filled environment rows (Field + parameter values) forwarded to Conduct. */
    rows: RawDataEnvironmentReadingRow[]
  }
}

export type RawDataSheetRowValues = Record<string, string>

export type RawDataSheetPayloadRow = {
  id: string
  /** Seeded nominal / point label when seedFrom = calibration_points */
  pointValue?: string
  /** Master equipment id when row was seeded from a master points tab. */
  masterEquipmentId?: string
  /** Display label for the master (optional group header). */
  masterLabel?: string
  values: RawDataSheetRowValues
}

export type RawDataSheetTableSettings = {
  /** Display / input decimal places for number columns (0–6). */
  decimalPlaces: number
  /** When true, Error = As Found − Nominal (if those columns exist). */
  autoComputeError: boolean
  /** Show row numbers column. */
  showRowNumbers: boolean
}

export const DEFAULT_RAW_DATA_TABLE_SETTINGS: RawDataSheetTableSettings = {
  decimalPlaces: 0,
  autoComputeError: true,
  showRowNumbers: true,
}

/** Last Generate Report dialog settings (restored on reopen). */
export type RawDataReportGenerationSettings = {
  randomnessFactor: string
  readingCols: string[]
  referenceCols: Record<string, string>
  multiples: Record<string, number>
  leastCounts: Record<string, string>
  decimals: Record<string, number>
}

export type RawDataSheetActor = {
  userId: string
  name: string
  designation: string
}

export type RawDataSheetPayload = {
  version: 1
  /** Snapshot of master template at first open (historical integrity). */
  template: RawDataSheetTemplate
  verificationAnswers: Record<string, boolean>
  rows: RawDataSheetPayloadRow[]
  seededAt: string
  tableSettings?: RawDataSheetTableSettings
  /** Lab ambient conditions recorded during calibration (multi-reading). */
  environmentConditions?: RawDataEnvironmentConditions
  /** Config used to insert temperature-corrected reading columns. */
  temperatureCorrection?: RawDataTemperatureCorrectionConfig
  /** Saved Generate Report column / randomness settings. */
  reportGenerationSettings?: RawDataReportGenerationSettings
  /** Who entered / last saved Raw Data (Calibrated By on certificate). */
  entryBy?: RawDataSheetActor
  /** Who reviewed Raw Data (Authorized Signatory on certificate). */
  reviewedBy?: RawDataSheetActor
}

export type RawDataTemperatureCorrectionConfig = {
  alpha: string
  referenceTempC: string
  temperatureColumnKey: string
  sourceColumnKeys: string[]
}

export const DEFAULT_TEMP_CORRECTION: RawDataTemperatureCorrectionConfig = {
  /** Default α ≈ 11.5 × 10⁻⁶ /°C; prefer equipment_for_calibration.coefficient_of_thermal_expansion when set. */
  alpha: '0.0000115',
  referenceTempC: '20',
  temperatureColumnKey: 'temperature_c',
  sourceColumnKeys: [],
}

export const TEMP_CORRECT_TEMP_COLUMN_KEY = 'temperature_c'
export const TEMP_CORRECT_TEMP_COLUMN_LABEL = 'Temperature (°C)'

export function tempCorrectedColumnKey(sourceKey: string): string {
  return `tcr_${sourceKey}`
}

export function parseTemperatureCorrectionConfig(
  raw: unknown,
): RawDataTemperatureCorrectionConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const sourceColumnKeys = Array.isArray(o.sourceColumnKeys)
    ? o.sourceColumnKeys.map((k) => String(k).trim()).filter(Boolean)
    : Array.isArray(o.source_column_keys)
      ? o.source_column_keys.map((k) => String(k).trim()).filter(Boolean)
      : []
  return {
    alpha: String(o.alpha ?? DEFAULT_TEMP_CORRECTION.alpha).trim() || DEFAULT_TEMP_CORRECTION.alpha,
    referenceTempC:
      String(o.referenceTempC ?? o.reference_temp_c ?? DEFAULT_TEMP_CORRECTION.referenceTempC).trim() ||
      DEFAULT_TEMP_CORRECTION.referenceTempC,
    temperatureColumnKey:
      String(
        o.temperatureColumnKey ?? o.temperature_column_key ?? TEMP_CORRECT_TEMP_COLUMN_KEY,
      ).trim() || TEMP_CORRECT_TEMP_COLUMN_KEY,
    sourceColumnKeys,
  }
}

/**
 * Insert / refresh Temperature (°C) + Temp Corrected formula columns for selected sources.
 * Formula: Corrected = Reading × (1 + α × (T_ref − T))
 */
export function applyTemperatureCorrectedColumns(
  columns: RawDataSheetColumn[],
  config: {
    sourceKeys: string[]
    alpha: number
    referenceTempC: number
    decimalPlaces: number
  },
): { columns: RawDataSheetColumn[]; temperatureColumnKey: string } {
  const sourceKeys = [...new Set(config.sourceKeys.map((k) => k.trim()).filter(Boolean))]
  let next = [...columns]

  let temperatureColumnKey =
    next.find((c) => c.key === TEMP_CORRECT_TEMP_COLUMN_KEY)?.key ??
    next.find((c) => /temperature/i.test(c.label) && c.type === 'number')?.key

  if (!temperatureColumnKey) {
    temperatureColumnKey = TEMP_CORRECT_TEMP_COLUMN_KEY
    next.push({
      key: temperatureColumnKey,
      label: TEMP_CORRECT_TEMP_COLUMN_LABEL,
      type: 'number',
      required: true,
    })
  }

  // Remove previous auto-inserted tcr_* columns for these sources (refresh)
  const tcrKeys = new Set(sourceKeys.map(tempCorrectedColumnKey))
  next = next.filter((c) => !(c.key.startsWith('tcr_') && tcrKeys.has(c.key)))

  for (const sourceKey of sourceKeys) {
    const source = next.find((c) => c.key === sourceKey)
    if (!source) continue
    const key = tempCorrectedColumnKey(sourceKey)
    next = next.filter((c) => c.key !== key)
    next.push({
      key,
      label: `Temp Corrected — ${source.label}`,
      type: 'formula',
      required: false,
      formula: {
        op: 'temp_correct',
        sources: [sourceKey, temperatureColumnKey],
        constant: config.alpha,
        decimals: config.decimalPlaces,
        referenceTempC: config.referenceTempC,
      },
    })
  }

  return { columns: next, temperatureColumnKey }
}

/** Built-in environment parameters that can be toggled as table columns. */
export type EnvParameterKey = 'temperatureC' | 'humidityPercent' | 'pressureHpa'

/** One environment table column — header is user-editable. */
export type EnvParameterColumn = {
  id: string
  header: string
}

export const ENV_PARAMETER_OPTIONS: {
  key: EnvParameterKey
  label: string
  shortLabel: string
  unit: string
  placeholder: string
}[] = [
  {
    key: 'temperatureC',
    label: 'Temperature (°C)',
    shortLabel: 'Temp',
    unit: '°C',
    placeholder: 'e.g. 23.0',
  },
  {
    key: 'humidityPercent',
    label: 'Humidity (% RH)',
    shortLabel: 'RH',
    unit: '% RH',
    placeholder: 'e.g. 45',
  },
  {
    key: 'pressureHpa',
    label: 'Pressure (hPa)',
    shortLabel: 'Pressure',
    unit: 'hPa',
    placeholder: 'e.g. 1013',
  },
]

export function newEnvParameterColumnId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `envcol_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
  }
  return `envcol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function defaultEnvParameterColumns(): EnvParameterColumn[] {
  return ENV_PARAMETER_OPTIONS.map((o) => ({
    id: o.key,
    header: o.label,
  }))
}

export function emptyEnvParameterColumn(header = ''): EnvParameterColumn {
  return {
    id: newEnvParameterColumnId(),
    header,
  }
}

function isEnvParameterKey(v: unknown): v is EnvParameterKey {
  return (
    v === 'temperatureC' || v === 'humidityPercent' || v === 'pressureHpa'
  )
}

const DEFAULT_ENV_SELECTED: EnvParameterKey[] = [
  'temperatureC',
  'humidityPercent',
  'pressureHpa',
]

/**
 * Resolve environment table columns: prefer custom parameterColumns,
 * else fall back to selectedParameters / built-in defaults.
 */
export function resolveEnvParameterColumns(input?: {
  parameterColumns?: EnvParameterColumn[] | null
  selectedParameters?: EnvParameterKey[] | null
} | null): EnvParameterColumn[] {
  const custom = (input?.parameterColumns ?? [])
    .map((c) => ({
      id: String(c?.id ?? '').trim(),
      header: String(c?.header ?? '').trim(),
    }))
    .filter((c) => c.id.length > 0)
  if (Array.isArray(input?.parameterColumns)) {
    return custom.map((c) => ({
      id: c.id,
      header: c.header || 'Parameter',
    }))
  }
  const selected = (input?.selectedParameters ?? []).filter(isEnvParameterKey)
  const keys = selected.length > 0 ? selected : [...DEFAULT_ENV_SELECTED]
  return ENV_PARAMETER_OPTIONS.filter((o) => keys.includes(o.key)).map((o) => ({
    id: o.key,
    header: o.label,
  }))
}

/** Statistical Field labels — cells become formula/calculation fields. */
export const ENV_STANDARD_FIELD_OPTIONS = [
  'Average',
  'Mean',
  'Sum',
  'Median',
  'Mode',
  'Minimum',
  'Maximum',
  'Range',
  'Standard Deviation',
  'Variance',
] as const

export type EnvStandardFieldLabel = (typeof ENV_STANDARD_FIELD_OPTIONS)[number]

export function isEnvStandardFieldLabel(label: string): boolean {
  return (ENV_STANDARD_FIELD_OPTIONS as readonly string[]).includes(label.trim())
}

/** Map a standard Field name → Excel-style function seed expression. */
export function defaultEnvStatFormulaExpression(
  fieldLabel: string,
  sourceFieldLabels: string[],
): string {
  const refs = sourceFieldLabels
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `[${l}]`)
  const list = refs.join(',')
  const name = fieldLabel.trim()
  if (refs.length === 0) {
    switch (name) {
      case 'Sum':
        return '=SUM()'
      case 'Minimum':
        return '=MIN()'
      case 'Maximum':
        return '=MAX()'
      case 'Median':
        return '=MEDIAN()'
      case 'Mode':
        return '=MODE()'
      case 'Standard Deviation':
        return '=STDEV()'
      case 'Variance':
        return '=VAR()'
      case 'Range':
        return '=MAX()-MIN()'
      case 'Mean':
        return '=MEAN()'
      default:
        return '=AVERAGE()'
    }
  }
  switch (name) {
    case 'Sum':
      return `=SUM(${list})`
    case 'Minimum':
      return `=MIN(${list})`
    case 'Maximum':
      return `=MAX(${list})`
    case 'Median':
      return `=MEDIAN(${list})`
    case 'Mode':
      return `=MODE(${list})`
    case 'Standard Deviation':
      return `=STDEV(${list})`
    case 'Variance':
      return `=VAR(${list})`
    case 'Range':
      return `=MAX(${list})-MIN(${list})`
    case 'Mean':
      return `=MEAN(${list})`
    default:
      return `=AVERAGE(${list})`
  }
}

export type RawDataEnvironmentReadingRow = {
  id: string
  /** First-column label / linked raw-data row id or free text. */
  readingLabel: string
  /** Values keyed by EnvParameterColumn.id (or legacy EnvParameterKey). */
  values: Record<string, string>
  /**
   * Per-parameter Excel-style formulas (when Field is Average / Sum / …).
   * Refs use other Field labels: `=AVERAGE([Reading at 0],[Reading at 120])`.
   */
  formulas?: Record<string, string>
}

export type RawDataEnvironmentConditions = {
  /** Which built-in parameter columns are visible (legacy). */
  selectedParameters: EnvParameterKey[]
  /** Custom / renamed parameter columns (preferred when present). */
  parameterColumns?: EnvParameterColumn[]
  rows: RawDataEnvironmentReadingRow[]
  notes: string
}

export const EMPTY_RAW_DATA_ENVIRONMENT: RawDataEnvironmentConditions = {
  selectedParameters: [...DEFAULT_ENV_SELECTED],
  parameterColumns: defaultEnvParameterColumns(),
  rows: [],
  notes: '',
}

function newEnvReadingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `env-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function emptyEnvironmentReadingRow(
  label = '',
): RawDataEnvironmentReadingRow {
  return {
    id: newEnvReadingId(),
    readingLabel: label,
    values: {},
  }
}

function parseEnvParameterColumns(raw: unknown): EnvParameterColumn[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const id = String(row.id ?? row.key ?? '').trim()
      const header = String(row.header ?? row.label ?? '').trim()
      if (!id) return null
      return { id, header: header || 'Parameter' } satisfies EnvParameterColumn
    })
    .filter((x): x is EnvParameterColumn => x != null)
}

function parseEnvRowValues(valuesRaw: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(valuesRaw)) {
    const key = String(k ?? '').trim()
    if (!key || v == null) continue
    const s = String(v).trim()
    if (s) values[key] = s
  }
  return values
}

function parseEnvRowFormulas(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const formulas: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k ?? '').trim()
    if (!key || v == null) continue
    const s = String(v).trim()
    if (s) formulas[key] = s
  }
  return Object.keys(formulas).length > 0 ? formulas : undefined
}

export function parseEnvironmentConditions(raw: unknown): RawDataEnvironmentConditions {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_RAW_DATA_ENVIRONMENT, rows: [] }
  const o = raw as Record<string, unknown>

  // New multi-row shape
  if (
    Array.isArray(o.rows) ||
    Array.isArray(o.selectedParameters) ||
    Array.isArray(o.parameterColumns) ||
    Array.isArray(o.parameter_columns)
  ) {
    const selectedRaw = Array.isArray(o.selectedParameters)
      ? o.selectedParameters
      : Array.isArray(o.selected_parameters)
        ? o.selected_parameters
        : ['temperatureC', 'humidityPercent', 'pressureHpa']
    const selectedParameters = selectedRaw.filter(isEnvParameterKey)
    const parameterColumnsRaw = o.parameterColumns ?? o.parameter_columns
    const parameterColumns = parseEnvParameterColumns(parameterColumnsRaw)
    const rowsRaw = Array.isArray(o.rows) ? o.rows : []
    const rows: RawDataEnvironmentReadingRow[] = rowsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>
        const valuesRaw =
          row.values && typeof row.values === 'object'
            ? (row.values as Record<string, unknown>)
            : {}
        const formulas = parseEnvRowFormulas(row.formulas)
        return {
          id: String(row.id ?? newEnvReadingId()),
          readingLabel: String(row.readingLabel ?? row.reading_label ?? row.label ?? '').trim(),
          values: parseEnvRowValues(valuesRaw),
          ...(formulas ? { formulas } : {}),
        } satisfies RawDataEnvironmentReadingRow
      })
      .filter((x): x is RawDataEnvironmentReadingRow => x != null)

    return {
      selectedParameters:
        selectedParameters.length > 0
          ? selectedParameters
          : [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters],
      ...(Array.isArray(parameterColumnsRaw) ? { parameterColumns } : {}),
      rows,
      notes: String(o.notes ?? '').trim(),
    }
  }

  // Legacy flat single-reading → one table row
  const temperatureC = String(o.temperatureC ?? o.temperature_c ?? o.temperature ?? '').trim()
  const humidityPercent = String(
    o.humidityPercent ?? o.humidity_percent ?? o.humidity ?? '',
  ).trim()
  const pressureHpa = String(o.pressureHpa ?? o.pressure_hpa ?? o.pressure ?? '').trim()
  const notes = String(o.notes ?? '').trim()
  const values: Record<string, string> = {}
  if (temperatureC) values.temperatureC = temperatureC
  if (humidityPercent) values.humidityPercent = humidityPercent
  if (pressureHpa) values.pressureHpa = pressureHpa
  const hasAny = Object.keys(values).length > 0

  return {
    selectedParameters: [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters],
    parameterColumns: defaultEnvParameterColumns(),
    rows: hasAny
      ? [{ id: newEnvReadingId(), readingLabel: 'Reading 1', values }]
      : [],
    notes,
  }
}

export function environmentConditionsFilled(env: RawDataEnvironmentConditions | undefined): boolean {
  if (!env) return false
  if (env.notes.trim()) return true
  return env.rows.some(
    (row) =>
      row.readingLabel.trim() ||
      Object.values(row.values).some((v) => String(v ?? '').trim()),
  )
}

/**
 * Certificate Environment Condition: value from the Raw Data Sheet "Average" Field row
 * (falls back to "Mean"). Matches Temperature / Humidity by column id or header text.
 */
export function getEnvironmentAverageParamValue(
  env: RawDataEnvironmentConditions | null | undefined,
  kind: 'temperature' | 'humidity',
): string {
  if (!env) return ''
  const rows = env.rows ?? []
  const avgRow =
    rows.find((r) => /^average$/i.test(r.readingLabel.trim())) ??
    rows.find((r) => /^mean$/i.test(r.readingLabel.trim()))
  if (!avgRow) return ''

  const cols = resolveEnvParameterColumns(env)
  const idHints =
    kind === 'temperature'
      ? [/temp/i, /^temperaturec$/i]
      : [/humid/i, /%?\s*rh/i, /^humiditypercent$/i]
  const headerHints =
    kind === 'temperature' ? [/temp/i] : [/humid/i, /%?\s*rh/i]

  const col =
    cols.find((c) => idHints.some((re) => re.test(c.id))) ??
    cols.find((c) => headerHints.some((re) => re.test(c.header)))

  if (col) {
    const direct = (avgRow.values[col.id] ?? '').trim()
    if (direct) return direct
    const expr = (avgRow.formulas?.[col.id] ?? '').trim()
    if (expr) {
      try {
        const n = evaluateEnvParameterFormula(expr, rows, col.id)
        if (n != null && Number.isFinite(n)) return String(n)
      } catch {
        // incomplete
      }
    }
  }

  for (const [k, v] of Object.entries(avgRow.values ?? {})) {
    if (!v.trim()) continue
    if (idHints.some((re) => re.test(k))) return v.trim()
  }
  return ''
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function newRawDataColumnKey(): string {
  return `col_${newId('c').replace(/-/g, '').slice(0, 10)}`
}

export function newVerificationItemId(): string {
  return newId('ver')
}

export function newPayloadRowId(): string {
  return newId('row')
}

/** Sensible default when equipment has no template yet. */
export function defaultRawDataSheetTemplate(): RawDataSheetTemplate {
  return {
    version: 1,
    seedFrom: 'calibration_points',
    verification: {
      items: [emptyVerificationItem()],
    },
    columns: [emptyRawDataSheetColumn()],
    environmentDefaults: {
      selectedParameters: [],
      parameterColumns: [],
      selectedReadingPoints: [],
      rows: [],
    },
  }
}

export function emptyRawDataSheetColumn(): RawDataSheetColumn {
  return {
    key: newRawDataColumnKey(),
    label: '',
    type: 'number',
    required: false,
  }
}

export function emptyVerificationItem(): RawDataVerificationItem {
  return {
    id: newVerificationItemId(),
    label: '',
    required: false,
  }
}

export function emptyColumnFormula(): RawDataColumnFormula {
  return {
    op: 'sum',
    sources: [],
    constant: null,
    decimals: 2,
    referenceTempC: null,
    expression: null,
  }
}

function isColumnType(v: unknown): v is RawDataColumnType {
  return v === 'text' || v === 'number' || v === 'formula'
}

function isFormulaOp(v: unknown): v is RawDataFormulaOp {
  return RAW_DATA_FORMULA_OPS.some((o) => o.value === v)
}

export function parseColumnFormula(raw: unknown): RawDataColumnFormula | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const expressionRaw = o.expression ?? o.formula_expression
  const expression =
    expressionRaw == null ? null : String(expressionRaw).trim() || null
  // Expression-only formulas are valid even when op is missing/invalid.
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

export function parseRawDataSheetTemplate(raw: unknown): RawDataSheetTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.version !== 1) return null

  const columnsRaw = obj.columns
  if (!Array.isArray(columnsRaw) || columnsRaw.length === 0) return null

  const columns: RawDataSheetColumn[] = []
  for (const item of columnsRaw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = String(row.key ?? '').trim()
    const label = String(row.label ?? '').trim()
    if (!key || !label) continue
    const type = isColumnType(row.type) ? row.type : 'text'
    const formula =
      type === 'formula' ? (parseColumnFormula(row.formula) ?? emptyColumnFormula()) : undefined
    columns.push({
      key,
      label,
      type,
      required: type === 'formula' ? false : Boolean(row.required),
      ...(formula ? { formula } : {}),
    })
  }
  if (columns.length === 0) return null

  const verificationObj =
    obj.verification && typeof obj.verification === 'object'
      ? (obj.verification as Record<string, unknown>)
      : {}
  const itemsRaw = Array.isArray(verificationObj.items) ? verificationObj.items : []
  const items: RawDataVerificationItem[] = itemsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const label = String(row.label ?? '').trim()
      if (!label) return null
      return {
        id: String(row.id ?? newVerificationItemId()),
        label,
        required: Boolean(row.required),
      } satisfies RawDataVerificationItem
    })
    .filter((x): x is RawDataVerificationItem => x != null)

  const seedFrom = obj.seedFrom === 'none' ? 'none' : 'calibration_points'

  const envDefaultsRaw = obj.environmentDefaults ?? obj.environment_defaults
  let environmentDefaults: RawDataSheetTemplate['environmentDefaults']
  if (envDefaultsRaw && typeof envDefaultsRaw === 'object') {
    const ed = envDefaultsRaw as Record<string, unknown>
    const selectedRaw = ed.selectedParameters ?? ed.selected_parameters
    const selected = Array.isArray(selectedRaw)
      ? selectedRaw.filter(isEnvParameterKey)
      : []
    const pointsRaw = ed.selectedReadingPoints ?? ed.selected_reading_points
    const selectedReadingPoints = Array.isArray(pointsRaw)
      ? [...new Set(pointsRaw.map((v) => String(v ?? '').trim()).filter(Boolean))]
      : []
    const rowsRaw = Array.isArray(ed.rows) ? ed.rows : []
    const rows: RawDataEnvironmentReadingRow[] = rowsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>
        const valuesRaw =
          row.values && typeof row.values === 'object'
            ? (row.values as Record<string, unknown>)
            : {}
        const values = parseEnvRowValues(valuesRaw)
        const readingLabel = String(
          row.readingLabel ?? row.reading_label ?? row.label ?? '',
        ).trim()
        const formulas = parseEnvRowFormulas(row.formulas)
        return {
          id: String(row.id ?? newEnvReadingId()),
          readingLabel,
          values,
          ...(formulas ? { formulas } : {}),
        } satisfies RawDataEnvironmentReadingRow
      })
      .filter((x): x is RawDataEnvironmentReadingRow => x != null)

    // Legacy: only selectedReadingPoints → seed empty rows
    const seededRows =
      rows.length > 0
        ? rows
        : selectedReadingPoints.map((label) => emptyEnvironmentReadingRow(label))

    const parameterColumnsRaw = ed.parameterColumns ?? ed.parameter_columns
    const parameterColumns = parseEnvParameterColumns(parameterColumnsRaw)

    environmentDefaults = {
      selectedParameters:
        selected.length > 0
          ? selected
          : [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters],
      parameterColumns:
        Array.isArray(parameterColumnsRaw)
          ? parameterColumns
          : defaultEnvParameterColumns(),
      selectedReadingPoints:
        selectedReadingPoints.length > 0
          ? selectedReadingPoints
          : seededRows.map((r) => r.readingLabel).filter(Boolean),
      rows: seededRows,
    }
  }

  return {
    version: 1,
    columns,
    verification: { items },
    seedFrom,
    ...(environmentDefaults ? { environmentDefaults } : {}),
  }
}

/** Empty `{}` or invalid → treat as unset (use default only when user clicks Apply Default). */
export function isRawDataSheetTemplateSet(raw: unknown): boolean {
  return parseRawDataSheetTemplate(raw) != null
}

export function serializeRawDataSheetTemplate(
  template: RawDataSheetTemplate,
): RawDataSheetTemplate {
  const selected =
    template.environmentDefaults?.selectedParameters?.filter(isEnvParameterKey) ?? []
  const parameterColumns = resolveEnvParameterColumns(template.environmentDefaults)
  const rows = (template.environmentDefaults?.rows ?? []).map((row) => {
    const formulas = parseEnvRowFormulas(row.formulas)
    return {
      id: row.id || newEnvReadingId(),
      readingLabel: String(row.readingLabel ?? '').trim(),
      values: { ...row.values },
      ...(formulas ? { formulas } : {}),
    }
  })
  const selectedReadingPoints = [
    ...new Set(
      [
        ...(template.environmentDefaults?.selectedReadingPoints ?? []),
        ...rows.map((r) => r.readingLabel),
      ]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean),
    ),
  ]
  return {
    version: 1,
    seedFrom: template.seedFrom === 'none' ? 'none' : 'calibration_points',
    verification: {
      items: template.verification.items
        .map((i) => ({
          id: i.id || newVerificationItemId(),
          label: i.label.trim(),
          required: Boolean(i.required),
        }))
        .filter((i) => i.label.length > 0),
    },
    columns: template.columns
      .map((c) => {
        const type = isColumnType(c.type) ? c.type : 'text'
        const formula = type === 'formula' ? (c.formula ?? emptyColumnFormula()) : undefined
        return {
          key: (c.key || newRawDataColumnKey()).trim(),
          label: c.label.trim(),
          type,
          required: type === 'formula' ? false : Boolean(c.required),
          ...(formula
            ? {
                formula: {
                  op: formula.op,
                  sources: formula.sources.filter((s) => s.trim().length > 0),
                  constant: formula.constant ?? null,
                  decimals: formula.decimals ?? null,
                  referenceTempC: formula.referenceTempC ?? null,
                  expression: formula.expression?.trim() || null,
                },
              }
            : {}),
        } satisfies RawDataSheetColumn
      })
      .filter((c) => c.label.length > 0),
    environmentDefaults: {
      selectedParameters:
        selected.length > 0
          ? selected
          : [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters],
      parameterColumns,
      selectedReadingPoints,
      rows,
    },
  }
}

export function parseRawDataSheetPayload(raw: unknown): RawDataSheetPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.version !== 1) return null
  const template = parseRawDataSheetTemplate(obj.template)
  if (!template) return null

  const answersRaw =
    obj.verificationAnswers && typeof obj.verificationAnswers === 'object'
      ? (obj.verificationAnswers as Record<string, unknown>)
      : {}
  const verificationAnswers: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(answersRaw)) {
    if (typeof v === 'boolean') verificationAnswers[k] = v
  }

  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : []
  const rows: RawDataSheetPayloadRow[] = []
  for (const item of rowsRaw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const valuesRaw =
      row.values && typeof row.values === 'object' ? (row.values as Record<string, unknown>) : {}
    const values: RawDataSheetRowValues = {}
    for (const col of template.columns) {
      values[col.key] = String(valuesRaw[col.key] ?? '')
    }
    const pointValue = String(row.pointValue ?? row.point_value ?? '').trim()
    const masterEquipmentId = String(
      row.masterEquipmentId ?? row.master_equipment_id ?? '',
    ).trim()
    const masterLabel = String(row.masterLabel ?? row.master_label ?? '').trim()
    const parsed: RawDataSheetPayloadRow = {
      id: String(row.id ?? newPayloadRowId()),
      values,
    }
    if (pointValue) parsed.pointValue = pointValue
    if (masterEquipmentId) parsed.masterEquipmentId = masterEquipmentId
    if (masterLabel) parsed.masterLabel = masterLabel
    rows.push(parsed)
  }

  return {
    version: 1,
    template,
    verificationAnswers,
    rows,
    seededAt: String(obj.seededAt ?? obj.seeded_at ?? ''),
    tableSettings: parseTableSettings(obj.tableSettings ?? obj.table_settings),
    environmentConditions: parseEnvironmentConditions(
      obj.environmentConditions ?? obj.environment_conditions,
    ),
    temperatureCorrection: parseTemperatureCorrectionConfig(
      obj.temperatureCorrection ?? obj.temperature_correction,
    ),
    reportGenerationSettings: parseReportGenerationSettings(
      obj.reportGenerationSettings ?? obj.report_generation_settings,
    ),
    entryBy: parseRawDataSheetActor(obj.entryBy ?? obj.entry_by),
    reviewedBy: parseRawDataSheetActor(obj.reviewedBy ?? obj.reviewed_by),
  }
}

export function parseRawDataSheetActor(raw: unknown): RawDataSheetActor | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const name = String(o.name ?? '').trim()
  if (!name) return undefined
  return {
    userId: String(o.userId ?? o.user_id ?? '').trim(),
    name,
    designation: String(o.designation ?? '').trim(),
  }
}

export function parseReportGenerationSettings(
  raw: unknown,
): RawDataReportGenerationSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const readingCols = Array.isArray(o.readingCols)
    ? o.readingCols.map((v) => String(v)).filter(Boolean)
    : Array.isArray(o.reading_cols)
      ? o.reading_cols.map((v) => String(v)).filter(Boolean)
      : []
  const asStringRecord = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = String(v ?? '')
    }
    return out
  }
  const asNumberRecord = (value: unknown): Record<string, number> => {
    if (!value || typeof value !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n)) out[k] = n
    }
    return out
  }
  return {
    randomnessFactor: String(o.randomnessFactor ?? o.randomness_factor ?? ''),
    readingCols,
    referenceCols: asStringRecord(o.referenceCols ?? o.reference_cols),
    multiples: asNumberRecord(o.multiples),
    leastCounts: asStringRecord(o.leastCounts ?? o.least_counts),
    decimals: asNumberRecord(o.decimals),
  }
}

export function parseTableSettings(raw: unknown): RawDataSheetTableSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RAW_DATA_TABLE_SETTINGS }
  const o = raw as Record<string, unknown>
  const dp = Number(o.decimalPlaces ?? o.decimal_places)
  return {
    decimalPlaces:
      Number.isFinite(dp) && dp >= 0 && dp <= 6
        ? Math.round(dp)
        : DEFAULT_RAW_DATA_TABLE_SETTINGS.decimalPlaces,
    autoComputeError:
      typeof o.autoComputeError === 'boolean'
        ? o.autoComputeError
        : typeof o.auto_compute_error === 'boolean'
          ? o.auto_compute_error
          : DEFAULT_RAW_DATA_TABLE_SETTINGS.autoComputeError,
    showRowNumbers:
      typeof o.showRowNumbers === 'boolean'
        ? o.showRowNumbers
        : typeof o.show_row_numbers === 'boolean'
          ? o.show_row_numbers
          : DEFAULT_RAW_DATA_TABLE_SETTINGS.showRowNumbers,
  }
}

function toFiniteNumbers(values: RawDataSheetRowValues, sources: string[]): number[] | null {
  const nums: number[] = []
  for (const key of sources) {
    const raw = (values[key] ?? '').trim()
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    nums.push(n)
  }
  return nums
}

function meanOf(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function medianOf(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function modeOf(nums: number[]): number {
  const counts = new Map<number, number>()
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1)
  let best = nums[0]!
  let bestCount = 0
  for (const [n, count] of counts) {
    if (count > bestCount || (count === bestCount && n < best)) {
      best = n
      bestCount = count
    }
  }
  return best
}

function sampleVariance(nums: number[]): number | null {
  if (nums.length < 2) return null
  const avg = meanOf(nums)
  return nums.reduce((acc, n) => acc + (n - avg) ** 2, 0) / (nums.length - 1)
}

const EXPRESSION_FN_NAMES = new Set([
  'average',
  'mean',
  'sum',
  'min',
  'max',
  'abs',
  'sqrt',
  'round',
  'median',
  'mode',
  'stdev',
  'stddev',
  'var',
  'variance',
  'count',
  'product',
  'power',
  'mod',
  'int',
  'ceiling',
  'floor',
  'roundup',
  'rounddown',
  'exp',
  'ln',
  'log',
  'log10',
  'pi',
  'e',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'radians',
  'degrees',
  'sign',
  'trunc',
  'fact',
  'quotient',
  'even',
  'odd',
  'if',
  'and',
  'or',
  'not',
  'geomean',
  'harmean',
  'avedev',
  'large',
  'small',
])

/** Normalize Excel-ish operators / leading equals. */
export function normalizeColumnFormulaExpression(expr: string): string {
  return expr
    .trim()
    .replace(/^\s*=\s*/, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\^/g, '**')
}

function normalizeRefToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[°º]/g, '')
    .replace(/[%()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveColumnRef(
  ref: string,
  columns: RawDataSheetColumn[],
  options?: { excludeKeys?: ReadonlySet<string> },
): RawDataSheetColumn | null {
  const needle = ref.trim().toLowerCase()
  if (!needle) return null
  const exclude = options?.excludeKeys

  const candidates = exclude
    ? columns.filter((c) => !exclude.has(c.key))
    : columns

  const byLabel = candidates.find((c) => c.label.trim().toLowerCase() === needle)
  if (byLabel) return byLabel
  const byKey = candidates.find((c) => c.key.toLowerCase() === needle)
  if (byKey) return byKey

  const softNeedle = normalizeRefToken(ref)
  if (!softNeedle) return null

  // Climate / environment refs must prefer env:* virtual columns — never a
  // "TEMPRATURE CORRECTED…" formula column via loose includes().
  const isClimateRef = /^(temp|temperature|humidity|pressure|rh)\b/.test(softNeedle)
  if (isClimateRef) {
    const envHits = candidates.filter((c) => {
      if (!c.key.startsWith(ENV_FORMULA_REF_PREFIX)) return false
      const softLabel = normalizeRefToken(c.label)
      return (
        softLabel === softNeedle ||
        softLabel.startsWith(softNeedle) ||
        softNeedle.startsWith(softLabel.split(' ')[0] ?? softLabel)
      )
    })
    if (envHits.length === 1) return envHits[0]!
    if (envHits.length > 1) {
      const exact = envHits.find((c) => normalizeRefToken(c.label) === softNeedle)
      return exact ?? envHits[0]!
    }
  }

  // Fuzzy only against input (non-formula) columns; require strong token overlap.
  const softMatches = candidates.filter((c) => {
    if (c.type === 'formula') return false
    const softLabel = normalizeRefToken(c.label)
    const softKey = normalizeRefToken(c.key.replace(/^env:/i, ''))
    if (!softLabel && !softKey) return false
    if (softLabel === softNeedle || softKey === softNeedle) return true
    if (softLabel.startsWith(softNeedle) || softKey.startsWith(softNeedle)) return true
    // Avoid "reading" matching every "* READING *" column unless needle is longer.
    const needleTokens = softNeedle.split(/\s+/).filter(Boolean)
    if (needleTokens.length < 2 && softNeedle.length < 8) {
      return softLabel === softNeedle || softKey === softNeedle
    }
    return (
      softLabel.includes(softNeedle) ||
      softNeedle.includes(softLabel) ||
      softKey.includes(softNeedle)
    )
  })
  if (softMatches.length === 1) return softMatches[0]!
  const envHit = softMatches.find((c) => c.key.startsWith(ENV_FORMULA_REF_PREFIX))
  if (envHit) return envHit
  return softMatches[0] ?? null
}

/**
 * Collect column keys referenced by `[Label]` tokens (and optional bare keys).
 */
export function extractExpressionSourceKeys(
  expr: string,
  columns: RawDataSheetColumn[],
): string[] {
  const normalized = normalizeColumnFormulaExpression(expr)
  if (!normalized) return []
  const keys: string[] = []
  const seen = new Set<string>()
  const bracketRe = /\[([^\]]+)\]/g
  let m: RegExpExecArray | null
  while ((m = bracketRe.exec(normalized)) != null) {
    const col = resolveColumnRef(m[1] ?? '', columns)
    if (col && !seen.has(col.key)) {
      seen.add(col.key)
      keys.push(col.key)
    }
  }
  return keys
}

function validateExpressionBody(body: string): string | null {
  // Strip quoted text literals before checking tokens
  let rest = body.replace(/"(?:\\.|[^"\\])*"/g, ' ')
  // After refs replaced with numbers, only math + allowed fn names + & should remain.
  rest = rest.replace(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, ' ')
  rest = rest.replace(/[+\-*/().,&\s]/g, ' ')
  const tokens = rest.split(/\s+/).filter(Boolean)
  for (const tok of tokens) {
    if (!EXPRESSION_FN_NAMES.has(tok.toLowerCase())) {
      return `Unknown symbol "${tok}". Use names in [brackets], numbers, + − × ÷, & "text", or AVERAGE/SUM/MIN/MAX/MEDIAN/MODE/STDEV/VAR/ABS/SQRT.`
    }
  }
  return null
}

/** Split formula body into math / quoted-text segments joined by `&`. */
function splitConcatSegments(
  body: string,
): Array<{ type: 'math' | 'text'; value: string }> {
  const segments: Array<{ type: 'math' | 'text'; value: string }> = []
  let i = 0
  let mathBuf = ''
  const flushMath = () => {
    const t = mathBuf.trim()
    if (t) segments.push({ type: 'math', value: t })
    mathBuf = ''
  }
  while (i < body.length) {
    const ch = body[i]!
    if (ch === '"') {
      flushMath()
      i += 1
      let text = ''
      while (i < body.length) {
        if (body[i] === '\\' && i + 1 < body.length) {
          text += body[i + 1]
          i += 2
          continue
        }
        if (body[i] === '"') {
          i += 1
          break
        }
        text += body[i]
        i += 1
      }
      segments.push({ type: 'text', value: text })
      continue
    }
    if (ch === '&') {
      flushMath()
      i += 1
      continue
    }
    mathBuf += ch
    i += 1
  }
  flushMath()
  return segments
}

function expressionUsesTextConcat(body: string): boolean {
  return /&/.test(body) || /"(?:\\.|[^"\\])*"/.test(body)
}

/**
 * Formula pad ± often inserts ASCII `-`, and older sheet snapshots store
 * `&"-"&` instead of `&"±"&`. Treat lone dash / +/- join text as ±.
 */
function normalizeUncertaintyJoinText(text: string): string {
  const t = text.trim()
  if (!t) return text
  if (t === '±') return '±'
  if (/^(?:[-−–—]|\+\/[-−])$/.test(t)) return '±'
  return text
}

/**
 * Display helper: `0.09-0.09` / `-0.04-0.04` → `0.09±0.09` / `-0.04±0.04`.
 * Only rewrites a single hyphen/minus between two numeric tokens.
 */
export function formatPlusMinusPairDisplay(value: string): string {
  const t = value.trim()
  if (!t || t.includes('±')) return value
  const m = /^(-?\d+(?:\.\d+)?)\s*[-−–—]\s*(-?\d+(?:\.\d+)?)$/.exec(t)
  if (!m) return value
  return `${m[1]}±${m[2]}`
}

/** Round a formula result to the column's Decimals setting (numbers and numeric strings / ± pairs). */
export function formatFormulaOutput(result: number | string, decimals: number): string {
  const dp =
    Number.isFinite(decimals) && decimals >= 0 && decimals <= 12
      ? Math.round(decimals)
      : 2

  if (typeof result === 'number') {
    if (!Number.isFinite(result)) return ''
    return result.toFixed(dp)
  }

  const t = String(result ?? '').trim()
  if (!t) return ''

  const pm = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*±\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.exec(
    t,
  )
  if (pm) {
    return `${Number(pm[1]).toFixed(dp)}±${Number(pm[2]).toFixed(dp)}`
  }

  const withPm = formatPlusMinusPairDisplay(t)
  if (withPm !== t) return formatFormulaOutput(withPm, dp)

  const asNum = Number(t)
  if (Number.isFinite(asNum) && /^-?\d/.test(t) && !/[^\d.eE+-]/.test(t)) {
    return asNum.toFixed(dp)
  }

  // Mixed text + numbers (e.g. `0.123456 °C`): round each numeric token.
  return t.replace(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (m) => {
    const x = Number(m)
    return Number.isFinite(x) ? x.toFixed(dp) : m
  })
}

function runValidatedMathExpression(body: string): number | null {
  const validationError = validateExpressionBody(body)
  if (validationError) throw new Error(validationError)

  const average = (...nums: number[]) => {
    if (nums.length === 0) throw new Error('incomplete')
    return meanOf(nums)
  }
  const sum = (...nums: number[]) => {
    if (nums.length === 0) throw new Error('incomplete')
    return nums.reduce((a, b) => a + b, 0)
  }
  const median = (...nums: number[]) => {
    if (nums.length === 0) throw new Error('incomplete')
    return medianOf(nums)
  }
  const mode = (...nums: number[]) => {
    if (nums.length === 0) throw new Error('incomplete')
    return modeOf(nums)
  }
  const stdev = (...nums: number[]) => {
    const v = sampleVariance(nums)
    if (v == null) throw new Error('incomplete')
    return Math.sqrt(v)
  }
  const variance = (...nums: number[]) => {
    const v = sampleVariance(nums)
    if (v == null) throw new Error('incomplete')
    return v
  }
  const count = (...nums: number[]) => nums.filter((n) => Number.isFinite(n)).length
  const product = (...nums: number[]) => {
    if (nums.length === 0) throw new Error('incomplete')
    return nums.reduce((a, b) => a * b, 1)
  }
  const power = (base: number, exp: number) => base ** exp
  const mod = (a: number, b: number) => a % b
  const intFn = (x: number) => Math.floor(x)
  const roundUp = (x: number) => (x < 0 ? Math.floor(x) : Math.ceil(x))
  const roundDown = (x: number) => (x < 0 ? Math.ceil(x) : Math.floor(x))
  const truncTowardZero = (x: number) => (x < 0 ? Math.ceil(x) : Math.floor(x))
  const fact = (n: number) => {
    const k = Math.floor(n)
    if (k < 0 || k > 170) throw new Error('incomplete')
    let r = 1
    for (let i = 2; i <= k; i++) r *= i
    return r
  }
  const quotient = (a: number, b: number) => {
    if (b === 0) throw new Error('incomplete')
    return truncTowardZero(a / b)
  }
  const evenFn = (x: number) => {
    const t = truncTowardZero(x)
    return t % 2 === 0 ? t : t + (x >= 0 ? 1 : -1)
  }
  const oddFn = (x: number) => {
    const t = truncTowardZero(x)
    return t % 2 !== 0 ? t : t + (x >= 0 ? 1 : -1)
  }
  const ifFn = (cond: number, whenTrue: number, whenFalse: number) =>
    cond ? whenTrue : whenFalse
  const andFn = (...nums: number[]) => (nums.every((n) => Boolean(n)) ? 1 : 0)
  const orFn = (...nums: number[]) => (nums.some((n) => Boolean(n)) ? 1 : 0)
  const notFn = (x: number) => (x ? 0 : 1)
  const geomean = (...nums: number[]) => {
    if (nums.length === 0 || nums.some((n) => n <= 0)) throw new Error('incomplete')
    return Math.exp(nums.reduce((a, b) => a + Math.log(b), 0) / nums.length)
  }
  const harmean = (...nums: number[]) => {
    if (nums.length === 0 || nums.some((n) => n === 0)) throw new Error('incomplete')
    return nums.length / nums.reduce((a, b) => a + 1 / b, 0)
  }
  const avedev = (...nums: number[]) => {
    if (nums.length === 0) throw new Error('incomplete')
    const avg = meanOf(nums)
    return nums.reduce((a, b) => a + Math.abs(b - avg), 0) / nums.length
  }
  const large = (...args: number[]) => {
    if (args.length < 2) throw new Error('incomplete')
    const k = Math.floor(args[args.length - 1]!)
    const vals = args.slice(0, -1).sort((a, b) => b - a)
    if (k < 1 || k > vals.length) throw new Error('incomplete')
    return vals[k - 1]!
  }
  const small = (...args: number[]) => {
    if (args.length < 2) throw new Error('incomplete')
    const k = Math.floor(args[args.length - 1]!)
    const vals = args.slice(0, -1).sort((a, b) => a - b)
    if (k < 1 || k > vals.length) throw new Error('incomplete')
    return vals[k - 1]!
  }

  // Function name → implementation (all lowercase; wrapper serves upper/lower)
  const impl: Record<string, (...n: number[]) => number> = {
    average,
    mean: average,
    sum,
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    sqrt: Math.sqrt,
    round: Math.round,
    median,
    mode,
    stdev,
    stddev: stdev,
    var: variance,
    variance,
    count,
    product,
    power,
    mod,
    int: intFn,
    ceiling: Math.ceil,
    floor: Math.floor,
    roundup: roundUp,
    rounddown: roundDown,
    exp: Math.exp,
    ln: Math.log,
    log: (x: number, base?: number) => (base == null ? Math.log10(x) : Math.log(x) / Math.log(base)),
    log10: Math.log10,
    pi: () => Math.PI,
    e: () => Math.E,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    radians: (deg: number) => (deg * Math.PI) / 180,
    degrees: (rad: number) => (rad * 180) / Math.PI,
    sign: Math.sign,
    trunc: truncTowardZero,
    fact,
    quotient,
    even: evenFn,
    odd: oddFn,
    if: ifFn,
    and: andFn,
    or: orFn,
    not: notFn,
    geomean,
    harmean,
    avedev,
    large,
    small,
  }

  const names = Object.keys(impl)
  // JavaScript identifiers are case-sensitive, while spreadsheet function names are not.
  // Canonicalize Average/MAX/min etc. and alias reserved words before evaluation.
  const reservedAlias: Record<string, string> = {
    if: '_if',
    var: '_var',
  }
  let safeBody = body
  for (const name of Object.keys(impl)) {
    const callableName = reservedAlias[name] ?? name
    safeBody = safeBody.replace(
      new RegExp(`\\b${name}\\s*\\(`, 'gi'),
      `${callableName}(`,
    )
  }
  const safeNames = names.filter((n) => !(n in reservedAlias))
  const aliasNames = Object.keys(reservedAlias).filter((n) => n in impl)
  const argNames = [
    ...safeNames.map((n) => n.toUpperCase()),
    ...safeNames,
    ...aliasNames.map((n) => reservedAlias[n]!),
  ]
  const argValues = [
    ...safeNames.map((n) => impl[n]!),
    ...safeNames.map((n) => impl[n]!),
    ...aliasNames.map((n) => impl[n]!),
  ]

  try {
    // eslint-disable-next-line no-new-func -- tokens validated; only numbers + allowlisted fns
    const fn = new Function(...argNames, `"use strict"; return (${safeBody});`)
    const result = fn(...argValues)
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  } catch (err) {
    if (err instanceof Error && err.message === 'incomplete') return null
    throw err
  }
}

/**
 * Evaluate an Excel-style column formula against a row.
 * Returns null when incomplete/invalid (caller maps to '').
 * Supports text join: `=[A]&" °C "&[B]` → string; pure math → number.
 */
export function evaluateColumnFormulaExpression(
  expr: string,
  columns: RawDataSheetColumn[],
  values: RawDataSheetRowValues,
  options?: { excludeKeys?: ReadonlySet<string> },
): number | string | null {
  let body = normalizeColumnFormulaExpression(expr)
  if (!body) return null

  const replaceRefs = (segment: string): string =>
    segment.replace(/\[([^\]]+)\]/g, (_full, rawRef: string) => {
      const col = resolveColumnRef(rawRef, columns, options)
      if (!col) throw new Error(`Unknown column "${rawRef.trim()}"`)
      const raw = (values[col.key] ?? '').trim()
      if (!raw) throw new Error('incomplete')
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new Error('incomplete')
      return `(${n})`
    })

  if (expressionUsesTextConcat(body)) {
    const segments = splitConcatSegments(body)
    if (segments.length === 0) return null
    const parts: string[] = []
    for (const seg of segments) {
      if (seg.type === 'text') {
        parts.push(normalizeUncertaintyJoinText(seg.value))
        continue
      }
      const mathBody = replaceRefs(seg.value)
      const n = runValidatedMathExpression(mathBody)
      if (n == null) throw new Error('incomplete')
      parts.push(String(n))
    }
    return formatPlusMinusPairDisplay(parts.join(''))
  }

  body = replaceRefs(body)
  return runValidatedMathExpression(body)
}

/**
 * Evaluate an environment cell formula where `[Field]` refs resolve to
 * that Field row's value for the same parameter column.
 */
export function evaluateEnvParameterFormula(
  expr: string,
  rows: RawDataEnvironmentReadingRow[],
  parameterColumnId: string,
): number | null {
  let body = normalizeColumnFormulaExpression(expr)
  if (!body) return null

  body = body.replace(/\[([^\]]+)\]/g, (_full, rawRef: string) => {
    const needle = String(rawRef ?? '').trim().toLowerCase()
    const row = rows.find((r) => r.readingLabel.trim().toLowerCase() === needle)
    if (!row) throw new Error(`Unknown field "${String(rawRef ?? '').trim()}"`)
    const raw = (row.values[parameterColumnId] ?? '').trim()
    if (!raw) throw new Error('incomplete')
    const n = Number(raw)
    if (!Number.isFinite(n)) throw new Error('incomplete')
    return `(${n})`
  })

  return runValidatedMathExpression(body)
}

/** Prefix used for virtual formula columns that map to Environment Condition params. */
export const ENV_FORMULA_REF_PREFIX = 'env:'

/** Stable slug for an Environment Field label, used in `env:<param>@<field>` keys. */
function envFieldSlug(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function envCellFormulaKey(parameterColumnId: string, fieldLabel: string): string {
  return `${ENV_FORMULA_REF_PREFIX}${parameterColumnId}@${envFieldSlug(fieldLabel)}`
}

/** `Temperature (°C) — Reading at 0` */
export function envCellFormulaLabel(parameterHeader: string, fieldLabel: string): string {
  return `${parameterHeader} — ${fieldLabel}`
}

/**
 * Virtual "source columns" so a Raw Data column formula can reference
 * Environment Condition values by name. Includes:
 *  - one column per parameter (Temperature, Humidity, …) → mean of its readings
 *  - one column per table cell (`Temperature (°C) — Reading at 0`) → that exact Field
 * These are NEVER added to the visible table — only used for autocomplete,
 * validation and evaluation.
 */
export function envParameterFormulaColumns(
  env?: {
    parameterColumns?: EnvParameterColumn[] | null
    selectedParameters?: EnvParameterKey[] | null
    rows?: RawDataEnvironmentReadingRow[] | null
  } | null,
): RawDataSheetColumn[] {
  const params = resolveEnvParameterColumns(env)
  const columns: RawDataSheetColumn[] = params.map((c) => ({
    key: `${ENV_FORMULA_REF_PREFIX}${c.id}`,
    label: c.header,
    type: 'number' as const,
    required: false,
  }))

  const seen = new Set(columns.map((c) => c.key))
  for (const param of params) {
    for (const row of env?.rows ?? []) {
      const fieldLabel = String(row.readingLabel ?? '').trim()
      if (!fieldLabel) continue
      const key = envCellFormulaKey(param.id, fieldLabel)
      if (seen.has(key)) continue
      seen.add(key)
      columns.push({
        key,
        label: envCellFormulaLabel(param.header, fieldLabel),
        type: 'number',
        required: false,
      })
    }
  }

  return columns
}

/**
 * Representative numeric value per Environment parameter, keyed by the virtual
 * `env:<id>` column key. Uses the mean of numeric data-row values for that param.
 */
export function envFormulaRefValues(
  env?: RawDataEnvironmentConditions | null,
): RawDataSheetRowValues {
  const values: RawDataSheetRowValues = {}
  if (!env) return values
  const cols = resolveEnvParameterColumns(env)
  const allRows = env.rows ?? []
  const dataRows = allRows.filter((r) => !isEnvStandardFieldLabel(r.readingLabel))

  for (const col of cols) {
    const nums: number[] = []
    for (const row of dataRows) {
      const raw = (row.values[col.id] ?? '').trim()
      if (!raw) continue
      const n = Number(raw)
      if (Number.isFinite(n)) nums.push(n)
    }
    if (nums.length > 0) {
      values[`${ENV_FORMULA_REF_PREFIX}${col.id}`] = String(meanOf(nums))
    }

    // Per-cell refs: `Temperature (°C) — Reading at 0`, including calculated Fields.
    for (const row of allRows) {
      const fieldLabel = String(row.readingLabel ?? '').trim()
      if (!fieldLabel) continue
      const key = envCellFormulaKey(col.id, fieldLabel)
      const raw = (row.values[col.id] ?? '').trim()

      if (isEnvStandardFieldLabel(fieldLabel)) {
        const expr = (row.formulas?.[col.id] ?? raw).trim()
        if (!expr) continue
        try {
          const n = evaluateEnvParameterFormula(expr, allRows, col.id)
          if (n != null && Number.isFinite(n)) values[key] = String(n)
        } catch {
          // incomplete env inputs — leave unset
        }
        continue
      }

      if (!raw) continue
      const n = Number(raw)
      if (Number.isFinite(n)) values[key] = String(n)
    }
  }
  return values
}

/** Validate env formula structure (Field refs + syntax) without numeric values. */
export function validateEnvParameterFormula(
  expr: string,
  sourceFieldLabels: string[],
): string | null {
  const normalized = normalizeColumnFormulaExpression(expr)
  if (!normalized) return 'Enter a formula, e.g. =AVERAGE([Reading at 0],[Reading at 120])'

  const known = new Set(sourceFieldLabels.map((l) => l.trim().toLowerCase()).filter(Boolean))
  const unknown: string[] = []
  const bracketRe = /\[([^\]]+)\]/g
  let m: RegExpExecArray | null
  while ((m = bracketRe.exec(normalized)) != null) {
    const ref = (m[1] ?? '').trim()
    if (!ref) continue
    if (!known.has(ref.toLowerCase())) unknown.push(ref)
  }
  if (unknown.length > 0) {
    return `Unknown field: ${unknown.map((u) => `[${u}]`).join(', ')}`
  }

  // Syntax check with placeholder numbers
  try {
    const body = normalized.replace(/\[([^\]]+)\]/g, '(1)')
    runValidatedMathExpression(body)
    return null
  } catch (err) {
    if (err instanceof Error && err.message === 'incomplete') return null
    return err instanceof Error ? err.message : 'Invalid formula'
  }
}

/** Validate expression structure (column refs + syntax) without row values. */
export function validateColumnFormulaExpression(
  expr: string,
  columns: RawDataSheetColumn[],
): string | null {
  return analyzeColumnFormulaExpression(expr, columns)?.message ?? null
}

export type FormulaValidationIssue = {
  message: string
  /** Substring to highlight red in the formula editor (first match). */
  errorToken: string | null
}

/**
 * Validate formula and return the bad token for inline red highlighting.
 */
export function analyzeColumnFormulaExpression(
  expr: string,
  columns: RawDataSheetColumn[],
): FormulaValidationIssue | null {
  const normalized = normalizeColumnFormulaExpression(expr)
  if (!normalized) {
    return {
      message: 'Enter a formula, e.g. =AVERAGE([Col A],[Col B]) or =[A]&" °C"',
      errorToken: null,
    }
  }

  const unknown: string[] = []
  const bracketRe = /\[([^\]]+)\]/g
  let m: RegExpExecArray | null
  while ((m = bracketRe.exec(normalized)) != null) {
    const ref = (m[1] ?? '').trim()
    if (!resolveColumnRef(ref, columns)) unknown.push(ref)
  }
  if (unknown.length > 0) {
    const first = unknown[0]!
    return {
      message: `Unknown column: ${unknown.map((u) => `"${u}"`).join(', ')}. Pick from suggestions.`,
      errorToken: `[${first}]`,
    }
  }

  // Unclosed quote?
  let q = 0
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '\\') {
      i += 1
      continue
    }
    if (normalized[i] === '"') q += 1
  }
  if (q % 2 !== 0) {
    return { message: 'Unclosed text in quotes ( "… ).', errorToken: '"' }
  }

  if (expressionUsesTextConcat(normalized)) {
    const segments = splitConcatSegments(normalized)
    for (const seg of segments) {
      if (seg.type !== 'math') continue
      const withPlaceholders = seg.value.replace(/\[([^\]]+)\]/g, '1')
      const err = validateExpressionBody(withPlaceholders)
      if (err) {
        const tokMatch = /Unknown symbol "([^"]+)"/.exec(err)
        return {
          message: err,
          errorToken: tokMatch?.[1] ?? (seg.value.trim().slice(0, 24) || null),
        }
      }
    }
    return null
  }

  const withPlaceholders = normalized.replace(/\[([^\]]+)\]/g, '1')
  const err = validateExpressionBody(withPlaceholders)
  if (!err) return null
  const tokMatch = /Unknown symbol "([^"]+)"/.exec(err)
  return {
    message: err,
    errorToken: tokMatch?.[1] ?? null,
  }
}

/** Catalog of supported formulas for the Help dialog. */
export const COLUMN_FORMULA_HELP_ROWS: {
  name: string
  syntax: string
  example: string
  use: string
}[] = [
  {
    name: 'AVERAGE / MEAN',
    syntax: 'AVERAGE(a,b,…)',
    example: '=AVERAGE([Reading at 0],[Reading at 120])',
    use: 'Mean of values',
  },
  {
    name: 'SUM',
    syntax: 'SUM(a,b,…)',
    example: '=SUM([As Found],[As Left])',
    use: 'Add values',
  },
  {
    name: 'MIN / MAX',
    syntax: 'MIN(a,b,…) / MAX(a,b,…)',
    example: '=MAX([Reading at 0],[Reading at 360])',
    use: 'Smallest / largest value',
  },
  {
    name: 'MEDIAN',
    syntax: 'MEDIAN(a,b,…)',
    example: '=MEDIAN([R1],[R2],[R3])',
    use: 'Middle value',
  },
  {
    name: 'MODE',
    syntax: 'MODE(a,b,…)',
    example: '=MODE([R1],[R2],[R3])',
    use: 'Most frequent value',
  },
  {
    name: 'STDEV',
    syntax: 'STDEV(a,b,…)',
    example: '=STDEV([R1],[R2],[R3])',
    use: 'Sample standard deviation',
  },
  {
    name: 'VAR',
    syntax: 'VAR(a,b,…)',
    example: '=VAR([R1],[R2],[R3])',
    use: 'Sample variance',
  },
  {
    name: 'COUNT',
    syntax: 'COUNT(a,b,…)',
    example: '=COUNT([R1],[R2],[R3])',
    use: 'How many numeric values',
  },
  {
    name: 'PRODUCT',
    syntax: 'PRODUCT(a,b,…)',
    example: '=PRODUCT([Gain],[Reading])',
    use: 'Multiply all values',
  },
  {
    name: 'POWER',
    syntax: 'POWER(x,y)',
    example: '=POWER([Reading],2)',
    use: 'x raised to y (x^y)',
  },
  {
    name: 'MOD',
    syntax: 'MOD(a,b)',
    example: '=MOD([Count],2)',
    use: 'Remainder of a ÷ b',
  },
  {
    name: 'ABS',
    syntax: 'ABS(x)',
    example: '=ABS([As Found]-[Nominal])',
    use: 'Absolute (drop sign)',
  },
  {
    name: 'SQRT',
    syntax: 'SQRT(x)',
    example: '=SQRT([Variance])',
    use: 'Square root',
  },
  {
    name: 'ROUND',
    syntax: 'ROUND(x)',
    example: '=ROUND([Error])',
    use: 'Round to nearest',
  },
  {
    name: 'ROUNDUP / ROUNDDOWN',
    syntax: 'ROUNDUP(x) / ROUNDDOWN(x)',
    example: '=ROUNDUP([Error])',
    use: 'Round away / toward zero',
  },
  {
    name: 'INT / CEILING / FLOOR',
    syntax: 'INT(x) / CEILING(x) / FLOOR(x)',
    example: '=FLOOR([Reading])',
    use: 'Whole number down / up / down',
  },
  {
    name: 'EXP / LN / LOG / LOG10',
    syntax: 'EXP(x) / LN(x) / LOG(x[,base]) / LOG10(x)',
    example: '=LN([Reading])',
    use: 'Exponential & logarithms',
  },
  {
    name: 'PI / E',
    syntax: 'PI() / E()',
    example: '=[Diameter]*PI()',
    use: 'Constants π and e',
  },
  {
    name: 'SIN / COS / TAN',
    syntax: 'SIN(x) / COS(x) / TAN(x)',
    example: '=SIN(RADIANS(90))',
    use: 'Trigonometry (radians)',
  },
  {
    name: 'ASIN / ACOS / ATAN / ATAN2',
    syntax: 'ASIN(x) / ACOS(x) / ATAN(x) / ATAN2(y,x)',
    example: '=DEGREES(ATAN([Rise]/[Run]))',
    use: 'Inverse trig',
  },
  {
    name: 'RADIANS / DEGREES',
    syntax: 'RADIANS(deg) / DEGREES(rad)',
    example: '=RADIANS(180)',
    use: 'Angle unit conversion',
  },
  {
    name: 'SIGN / TRUNC',
    syntax: 'SIGN(x) / TRUNC(x)',
    example: '=SIGN([Error])',
    use: 'Sign (−1/0/1) / truncate toward 0',
  },
  {
    name: 'FACT / QUOTIENT',
    syntax: 'FACT(n) / QUOTIENT(a,b)',
    example: '=QUOTIENT([Total],2)',
    use: 'Factorial / integer division',
  },
  {
    name: 'EVEN / ODD',
    syntax: 'EVEN(x) / ODD(x)',
    example: '=EVEN([Count])',
    use: 'Next even / odd integer',
  },
  {
    name: 'IF / AND / OR / NOT',
    syntax: 'IF(c,a,b) / AND(…) / OR(…) / NOT(x)',
    example: '=IF([Error]>0,[Error],0)',
    use: 'Logic (true→1, false→0)',
  },
  {
    name: 'GEOMEAN / HARMEAN',
    syntax: 'GEOMEAN(a,b,…) / HARMEAN(a,b,…)',
    example: '=GEOMEAN([R1],[R2],[R3])',
    use: 'Geometric / harmonic mean',
  },
  {
    name: 'AVEDEV',
    syntax: 'AVEDEV(a,b,…)',
    example: '=AVEDEV([R1],[R2],[R3])',
    use: 'Average absolute deviation',
  },
  {
    name: 'LARGE / SMALL',
    syntax: 'LARGE(a,b,…,k) / SMALL(a,b,…,k)',
    example: '=LARGE([R1],[R2],[R3],1)',
    use: 'k-th largest / smallest (k = last arg)',
  },
  {
    name: '+ − × ÷',
    syntax: 'a+b  a-b  a*b  a/b',
    example: '=[As Found]-[Nominal]',
    use: 'Arithmetic',
  },
  {
    name: '& (text join)',
    syntax: 'a & " text " & b',
    example: '=[Error]&" °C"',
    use: 'Put text between formula results',
  },
]

export type FormulaCalculationInput = {
  label: string
  value: string
}

export type FormulaCalculationExplanation = {
  columnKey: string
  columnLabel: string
  result: string
  /** Original formula text (expression or op description). */
  formulaText: string
  /** Formula with column refs replaced by actual numbers. */
  substitutedText: string
  inputs: FormulaCalculationInput[]
  /** Human-readable calculation steps. */
  steps: string[]
}

function columnLabelForKey(
  key: string,
  columns: RawDataSheetColumn[],
): string {
  return columns.find((c) => c.key === key)?.label ?? key
}

function formatStepNumber(n: number, decimalPlaces: number): string {
  if (!Number.isFinite(n)) return String(n)
  return n.toFixed(decimalPlaces)
}

/** Calculation-step display values always use 2 decimal places. */
const CALC_STEPS_DISPLAY_DP = 2

function formatStepDisplayValue(raw: string): string {
  const t = raw.trim()
  if (!t) return '—'
  const withPm = formatPlusMinusPairDisplay(t)
  if (withPm !== t) return withPm
  const n = Number(t)
  if (!Number.isFinite(n)) return t
  return formatStepNumber(n, CALC_STEPS_DISPLAY_DP)
}

/**
 * Build a human-readable step-by-step explanation for one formula column
 * against the current row values (used in Calculations dialog).
 */
export function explainFormulaCalculation(
  column: RawDataSheetColumn,
  values: RawDataSheetRowValues,
  decimalPlaces: number,
  allColumns?: RawDataSheetColumn[],
  env?: RawDataEnvironmentConditions | null,
): FormulaCalculationExplanation {
  const empty: FormulaCalculationExplanation = {
    columnKey: column.key,
    columnLabel: column.label,
    result: '',
    formulaText: '',
    substitutedText: '',
    inputs: [],
    steps: ['No formula configured for this column.'],
  }

  const formula = column.formula
  if (column.type !== 'formula' || !formula) return empty

  const envCols = env ? envParameterFormulaColumns(env) : []
  const envVals = env ? envFormulaRefValues(env) : {}
  const mergedValues: RawDataSheetRowValues = { ...values, ...envVals }
  const cols = [...(allColumns ?? [column]), ...envCols]
  const result = computeFormulaValue(column, values, decimalPlaces, allColumns, env)
  const dp = CALC_STEPS_DISPLAY_DP

  const expr = formula.expression?.trim() ?? ''
  if (expr) {
    const alpha = formula.constant
    const prepared =
      alpha != null && Number.isFinite(alpha)
        ? expr.replace(/α/g, String(alpha))
        : expr.replace(/α/g, '0')
    const normalized = normalizeColumnFormulaExpression(prepared)
    const inputs: FormulaCalculationInput[] = []
    const seen = new Set<string>()
    let substituted = normalized
    substituted = substituted.replace(/\[([^\]]+)\]/g, (_full, rawRef: string) => {
      const col = resolveColumnRef(rawRef, cols, { excludeKeys: new Set([column.key]) })
      const label = col?.label ?? String(rawRef).trim()
      const raw = col ? (mergedValues[col.key] ?? '').trim() : ''
      if (col && !seen.has(col.key)) {
        seen.add(col.key)
        inputs.push({ label, value: formatStepDisplayValue(raw) })
      }
      return raw && Number.isFinite(Number(raw))
        ? formatStepNumber(Number(raw), dp)
        : `[${label}?]`
    })

    const steps: string[] = [
      `Formula: ${expr.startsWith('=') ? expr : `=${expr}`}`,
      `Substitute values: ${substituted}`,
    ]
    if (alpha != null && Number.isFinite(alpha) && /α|alpha/i.test(expr)) {
      steps.splice(1, 0, `α (constant) = ${formatStepNumber(alpha, 8)}`)
    }
    if (result) {
      const resultDisplay = formatStepDisplayValue(result)
      steps.push(`Result = ${resultDisplay}`)
    } else {
      steps.push('Result incomplete — one or more input values are missing.')
    }

    return {
      columnKey: column.key,
      columnLabel: column.label,
      result: result ? formatStepDisplayValue(result) : result,
      formulaText: expr.startsWith('=') ? expr : `=${expr}`,
      substitutedText: substituted,
      inputs,
      steps,
    }
  }

  // Legacy op-based formula
  const meta = formulaOpMeta(formula.op)
  let sources = [...formula.sources]
  if (formula.op === 'temp_correct') {
    const tempEnvKey =
      Object.keys(envVals).find((k) => {
        const label = envCols.find((c) => c.key === k)?.label ?? k
        return /temp/i.test(k) || /temp/i.test(label)
      }) ?? null
    if (sources.length >= 1 && tempEnvKey) {
      if (sources.length < 2) sources = [sources[0]!, tempEnvKey]
      else if (!(mergedValues[sources[1]!] ?? '').trim()) sources = [sources[0]!, tempEnvKey]
    }
  }

  const inputs: FormulaCalculationInput[] = sources.map((key) => ({
    label: columnLabelForKey(key, cols),
    value: formatStepDisplayValue((mergedValues[key] ?? '').trim()),
  }))
  const nums = sources.map((key) => {
    const raw = (mergedValues[key] ?? '').trim()
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  })
  const labels = sources.map((key) => columnLabelForKey(key, cols))
  const k = meta.allowsConstant ? formula.constant : null

  const formulaText = `${meta.label}: ${meta.hint}`
  const steps: string[] = [`Operation: ${meta.label} (${meta.hint})`]
  inputs.forEach((input, i) => {
    steps.push(`Input ${i + 1}: ${input.label} = ${input.value}`)
  })
  if (k != null && Number.isFinite(k)) {
    steps.push(`Constant k = ${formatStepNumber(k, 8)}`)
  }

  let substitutedText = ''
  if (nums.every((n) => n != null)) {
    const n = nums as number[]
    switch (formula.op) {
      case 'sum':
        substitutedText = `${n.map((v) => formatStepNumber(v, dp)).join(' + ')}${k != null ? ` + ${formatStepNumber(k, dp)}` : ''}`
        steps.push(`Calculate: ${substitutedText}`)
        break
      case 'subtract':
        substitutedText = `${n.map((v) => formatStepNumber(v, dp)).join(' − ')}${k != null ? ` − ${formatStepNumber(k, dp)}` : ''}`
        steps.push(`Calculate: ${substitutedText}`)
        break
      case 'multiply':
        substitutedText = `${n.map((v) => formatStepNumber(v, dp)).join(' × ')}${k != null ? ` × ${formatStepNumber(k, dp)}` : ''}`
        steps.push(`Calculate: ${substitutedText}`)
        break
      case 'divide':
        substitutedText = `${n.map((v) => formatStepNumber(v, dp)).join(' ÷ ')}${k != null ? ` ÷ ${formatStepNumber(k, dp)}` : ''}`
        steps.push(`Calculate: ${substitutedText}`)
        break
      case 'average':
        substitutedText = `(${n.map((v) => formatStepNumber(v, dp)).join(' + ')}) / ${n.length}`
        steps.push(`Mean = ${substitutedText}`)
        break
      case 'median':
        substitutedText = `median(${n.map((v) => formatStepNumber(v, dp)).join(', ')})`
        steps.push(`Median of [${n.map((v) => formatStepNumber(v, dp)).join(', ')}]`)
        break
      case 'mode':
        substitutedText = `mode(${n.map((v) => formatStepNumber(v, dp)).join(', ')})`
        steps.push(`Mode of [${n.map((v) => formatStepNumber(v, dp)).join(', ')}]`)
        break
      case 'variance':
        substitutedText = `sampleVariance(${n.map((v) => formatStepNumber(v, dp)).join(', ')})`
        steps.push(`Sample variance of [${n.map((v) => formatStepNumber(v, dp)).join(', ')}]`)
        break
      case 'stddev':
        substitutedText = `√sampleVariance(${n.map((v) => formatStepNumber(v, dp)).join(', ')})`
        steps.push(`Std Dev = √(sample variance of [${n.map((v) => formatStepNumber(v, dp)).join(', ')}])`)
        break
      case 'min':
        substitutedText = `min(${n.map((v) => formatStepNumber(v, dp)).join(', ')})`
        steps.push(`Minimum of [${n.map((v) => formatStepNumber(v, dp)).join(', ')}]`)
        break
      case 'max':
        substitutedText = `max(${n.map((v) => formatStepNumber(v, dp)).join(', ')})`
        steps.push(`Maximum of [${n.map((v) => formatStepNumber(v, dp)).join(', ')}]`)
        break
      case 'range':
        substitutedText = `max − min = ${formatStepNumber(Math.max(...n), dp)} − ${formatStepNumber(Math.min(...n), dp)}`
        steps.push(`Range = Max − Min = ${formatStepNumber(Math.max(...n), dp)} − ${formatStepNumber(Math.min(...n), dp)}`)
        break
      case 'error':
        substitutedText = `${formatStepNumber(n[0]!, dp)} − ${formatStepNumber(n[1]!, dp)}`
        steps.push(`Error = ${labels[0]} − ${labels[1]} = ${substitutedText}`)
        break
      case 'abs_error':
        substitutedText = `|${formatStepNumber(n[0]!, dp)} − ${formatStepNumber(n[1]!, dp)}|`
        steps.push(`Absolute Error = |${labels[0]} − ${labels[1]}| = ${substitutedText}`)
        break
      case 'percent_error':
        substitutedText = `((${formatStepNumber(n[0]!, dp)} − ${formatStepNumber(n[1]!, dp)}) / ${formatStepNumber(n[1]!, dp)}) × 100`
        steps.push(`% Error = ((${labels[0]} − ${labels[1]}) / ${labels[1]}) × 100`)
        steps.push(`= ${substitutedText}`)
        break
      case 'percent_of':
        substitutedText = `(${formatStepNumber(n[0]!, dp)} / ${formatStepNumber(n[1]!, dp)}) × 100`
        steps.push(`% of = (${labels[0]} / ${labels[1]}) × 100 = ${substitutedText}`)
        break
      case 'temp_correct': {
        const tRef =
          formula.referenceTempC != null && Number.isFinite(formula.referenceTempC)
            ? formula.referenceTempC
            : 20
        const alpha = k ?? 0
        substitutedText = `${formatStepNumber(n[0]!, dp)} × (1 + ${formatStepNumber(alpha, 8)} × (${formatStepNumber(tRef, dp)} − ${formatStepNumber(n[1]!, dp)}))`
        steps.push(`T_ref = ${formatStepNumber(tRef, dp)} °C, α = ${formatStepNumber(alpha, 8)}`)
        steps.push(`Corrected = Reading × (1 + α × (T_ref − T))`)
        steps.push(`= ${substitutedText}`)
        break
      }
      default:
        substitutedText = n.map((v) => formatStepNumber(v, dp)).join(', ')
        steps.push(`Inputs: ${substitutedText}`)
    }
  } else {
    steps.push('Cannot calculate — one or more numeric inputs are missing.')
  }

  if (result) steps.push(`Result = ${formatStepDisplayValue(result)}`)

  return {
    columnKey: column.key,
    columnLabel: column.label,
    result: result ? formatStepDisplayValue(result) : result,
    formulaText,
    substitutedText,
    inputs,
    steps,
  }
}

/** Evaluate one formula column against a row. Returns '' when inputs are incomplete/invalid. */
export function computeFormulaValue(
  column: RawDataSheetColumn,
  values: RawDataSheetRowValues,
  decimalPlaces: number,
  allColumns?: RawDataSheetColumn[],
  env?: RawDataEnvironmentConditions | null,
): string {
  const formula = column.formula
  if (column.type !== 'formula' || !formula) return ''

  const envCols = env ? envParameterFormulaColumns(env) : []
  const envVals = env ? envFormulaRefValues(env) : {}
  // Env params (Temperature, Humidity, …) available to expression + legacy ops.
  const mergedValues: RawDataSheetRowValues = { ...values, ...envVals }
  const cols = [...(allColumns ?? [column]), ...envCols]

  const expr = formula.expression?.trim() ?? ''
  if (expr) {
    try {
      // Allow α in expressions as a synonym for the formula constant (expansion coeff).
      const alpha = formula.constant
      const prepared =
        alpha != null && Number.isFinite(alpha)
          ? expr.replace(/α/g, String(alpha))
          : expr.replace(/α/g, '0')
      const result = evaluateColumnFormulaExpression(prepared, cols, mergedValues, {
        excludeKeys: new Set([column.key]),
      })
      if (result != null) {
        const dp = formula.decimals != null ? formula.decimals : decimalPlaces
        return formatFormulaOutput(result, dp)
      }
      // Expression present but incomplete → blank (do NOT use stale legacy op).
      return ''
    } catch {
      // Expression present but invalid → blank (avoids AVERAGE fallthrough on temp formulas).
      return ''
    }
  }

  const meta = formulaOpMeta(formula.op)
  const needed = meta.arity === 'two' ? 2 : 1
  let sources = [...formula.sources]

  // Temp-correct: auto-wire Environment Temperature when T source is missing/empty.
  if (formula.op === 'temp_correct') {
    const tempEnvKey =
      Object.keys(envVals).find((k) => {
        const label = envCols.find((c) => c.key === k)?.label ?? k
        return /temp/i.test(k) || /temp/i.test(label)
      }) ?? null
    if (sources.length >= 1 && tempEnvKey) {
      if (sources.length < 2) {
        sources = [sources[0]!, tempEnvKey]
      } else if (!(mergedValues[sources[1]!] ?? '').trim()) {
        sources = [sources[0]!, tempEnvKey]
      }
    }
  }

  if (sources.length < needed) return ''

  const nums = toFiniteNumbers(
    mergedValues,
    meta.arity === 'two' ? sources.slice(0, 2) : sources,
  )
  if (!nums) return ''

  const k = meta.allowsConstant ? formula.constant : null
  let result: number | null = null

  switch (formula.op) {
    case 'sum':
      result = nums.reduce((a, b) => a + b, 0) + (k ?? 0)
      break
    case 'subtract':
      result = nums.slice(1).reduce((a, b) => a - b, nums[0]!) - (k ?? 0)
      break
    case 'multiply':
      result = nums.reduce((a, b) => a * b, 1) * (k ?? 1)
      break
    case 'divide': {
      const divisors = [...nums.slice(1), ...(k != null ? [k] : [])]
      if (divisors.some((d) => d === 0)) return ''
      result = divisors.reduce((a, b) => a / b, nums[0]!)
      break
    }
    case 'average':
      result = meanOf(nums)
      break
    case 'median':
      result = medianOf(nums)
      break
    case 'mode':
      result = modeOf(nums)
      break
    case 'variance':
      result = sampleVariance(nums)
      break
    case 'stddev': {
      const variance = sampleVariance(nums)
      result = variance == null ? null : Math.sqrt(variance)
      break
    }
    case 'min':
      result = Math.min(...nums)
      break
    case 'max':
      result = Math.max(...nums)
      break
    case 'range':
      result = Math.max(...nums) - Math.min(...nums)
      break
    case 'error':
      result = nums[0]! - nums[1]!
      break
    case 'abs_error':
      result = Math.abs(nums[0]! - nums[1]!)
      break
    case 'percent_error':
      if (nums[1] === 0) return ''
      result = ((nums[0]! - nums[1]!) / nums[1]!) * 100
      break
    case 'percent_of':
      if (nums[1] === 0) return ''
      result = (nums[0]! / nums[1]!) * 100
      break
    case 'temp_correct': {
      // Corrected = Reading × (1 + α × (T_ref − T))
      const reading = nums[0]!
      const temperature = nums[1]!
      const alpha = k ?? 0
      const tRef =
        formula.referenceTempC != null && Number.isFinite(formula.referenceTempC)
          ? formula.referenceTempC
          : 20
      result = reading * (1 + alpha * (tRef - temperature))
      break
    }
    default:
      result = null
  }

  if (result == null || !Number.isFinite(result)) return ''
  const dp = formula.decimals != null ? formula.decimals : decimalPlaces
  return formatFormulaOutput(result, dp)
}

/**
 * Recompute every formula column of a row. Columns are evaluated in template order,
 * so a formula can reference an earlier formula column.
 * Optional `master` supplies Master Equipment field refs (`eq:*` / [Least Count], …).
 * Optional `pointsTables` supplies Selected Master points column refs (`pt:*`).
 */
export function applyFormulaColumns(
  columns: RawDataSheetColumn[],
  values: RawDataSheetRowValues,
  decimalPlaces: number,
  env?: RawDataEnvironmentConditions | null,
  master?: MasterFormulaRefSource | null,
  pointsTables?: Array<{ columns?: Array<{ header?: string | null }> | null } | null | undefined>,
): RawDataSheetRowValues {
  if (!columns.some((c) => c.type === 'formula')) return values

  const masterCols = masterEquipmentFormulaRefColumns()
  const pointsCols = masterPointsFormulaRefColumns(pointsTables ?? [])
  const mergedValues: RawDataSheetRowValues = {
    ...values,
    ...masterEquipmentFormulaRefValues(master),
    ...masterPointsFormulaRefValues(pointsCols, columns, values),
  }
  const allColumns = [...columns, ...masterCols, ...pointsCols]
  const next = { ...mergedValues }
  for (const col of columns) {
    if (col.type !== 'formula') continue
    next[col.key] = computeFormulaValue(col, next, decimalPlaces, allColumns, env)
  }
  return next
}

/**
 * Copy formula definitions from Calibration Equipment template onto the Conduct
 * sheet snapshot (match by key, then by label). Preserves sheet column order/keys.
 */
export function mergeFormulasFromEquipmentTemplate(
  sheetTemplate: RawDataSheetTemplate,
  equipmentTemplate: RawDataSheetTemplate | null | undefined,
): RawDataSheetTemplate {
  if (!equipmentTemplate?.columns?.length) return sheetTemplate
  const byKey = new Map(equipmentTemplate.columns.map((c) => [c.key, c]))
  const byLabel = new Map(
    equipmentTemplate.columns.map((c) => [c.label.trim().toLowerCase(), c]),
  )
  return {
    ...sheetTemplate,
    columns: sheetTemplate.columns.map((col) => {
      const src =
        byKey.get(col.key) ?? byLabel.get(col.label.trim().toLowerCase()) ?? null
      if (!src || src.type !== 'formula' || !src.formula) return col
      return {
        ...col,
        type: 'formula' as const,
        required: false,
        formula: {
          op: src.formula.op,
          sources: [...(src.formula.sources ?? [])],
          constant: src.formula.constant ?? null,
          decimals: src.formula.decimals ?? null,
          referenceTempC: src.formula.referenceTempC ?? null,
          expression: src.formula.expression?.trim() || null,
        },
      }
    }),
  }
}

export type CalibrationPointSeed = {
  pointValue: string
}

/** Blank value map for a column set — every column starts as an empty string. */
export function emptyValuesForColumns(columns: { key: string }[]): RawDataSheetRowValues {
  const values: RawDataSheetRowValues = {}
  for (const col of columns) values[col.key] = ''
  return values
}

/**
 * Build first-open payload: snapshot template + seed rows from calibration points.
 * Prefills Nominal column when present; otherwise the first number input column.
 */
export function buildInitialRawDataSheetPayload(
  template: RawDataSheetTemplate,
  points: CalibrationPointSeed[],
): RawDataSheetPayload {
  const snap = serializeRawDataSheetTemplate(template)
  const seedCol =
    snap.columns.find((c) => c.key === 'nominal') ??
    snap.columns.find((c) => c.label.trim().toLowerCase() === 'nominal') ??
    snap.columns.find((c) => c.type === 'number')

  let rows: RawDataSheetPayloadRow[]
  if (snap.seedFrom === 'calibration_points' && points.length > 0) {
    rows = points.map((p) => {
      const values = emptyValuesForColumns(snap.columns)
      if (seedCol) values[seedCol.key] = p.pointValue
      return {
        id: newPayloadRowId(),
        pointValue: p.pointValue,
        values,
      }
    })
  } else {
    rows = [
      {
        id: newPayloadRowId(),
        values: emptyValuesForColumns(snap.columns),
      },
    ]
  }

  const envSelected =
    snap.environmentDefaults?.selectedParameters?.length
      ? [...snap.environmentDefaults.selectedParameters]
      : [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters]
  const envParameterColumns = resolveEnvParameterColumns(snap.environmentDefaults)

  const envRowsFromDefaults = (snap.environmentDefaults?.rows ?? [])
    .map((row) => {
      const formulas = parseEnvRowFormulas(row.formulas)
      return {
        id: row.id || newEnvReadingId(),
        readingLabel: String(row.readingLabel ?? '').trim(),
        values: { ...row.values },
        ...(formulas ? { formulas } : {}),
      }
    })
    .filter(
      (r) =>
        r.readingLabel ||
        Object.values(r.values).some((v) => String(v ?? '').trim()) ||
        (r.formulas && Object.keys(r.formulas).length > 0),
    )

  const envReadingPoints = (snap.environmentDefaults?.selectedReadingPoints ?? [])
    .map((v) => v.trim())
    .filter(Boolean)

  const envRows =
    envRowsFromDefaults.length > 0
      ? envRowsFromDefaults
      : envReadingPoints.map((label) => emptyEnvironmentReadingRow(label))

  return {
    version: 1,
    template: snap,
    verificationAnswers: {},
    rows,
    seededAt: new Date().toISOString(),
    tableSettings: { ...DEFAULT_RAW_DATA_TABLE_SETTINGS },
    environmentConditions: {
      ...EMPTY_RAW_DATA_ENVIRONMENT,
      selectedParameters: envSelected,
      parameterColumns: envParameterColumns,
      rows: envRows,
    },
  }
}
