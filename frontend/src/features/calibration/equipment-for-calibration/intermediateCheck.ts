import {
  DEFAULT_INTERMEDIATE_HUMIDITY,
  DEFAULT_INTERMEDIATE_TEMPERATURE,
  type IntermediateCheckReadingItem,
} from '@/features/masters/equipment-master/intermediateCheckHistory'
import {
  emptyCalibrationPointRow,
  normalizeCalibrationPointsColumn,
  type CalibrationPointRow,
  type CalibrationPointsColumn,
} from './types'

export type IntermediateCheckReading = IntermediateCheckReadingItem
export type IntermediateCheckStatus = 'Satisfactory' | 'Unsatisfactory' | 'N/A'

/** Draft state behind the encoded `intermediate_check_result` string. */
export type IntermediateCheckDraft = {
  readings: IntermediateCheckReading[]
  doneBy: string
  masterIds: string[]
  temperature: string
  humidity: string
  envColumns: CalibrationPointsColumn[]
  envRows: CalibrationPointRow[]
  checkColumns: CalibrationPointsColumn[]
  checkRows: CalibrationPointRow[]
}

function parseStoredTable(raw: unknown): {
  columns: CalibrationPointsColumn[]
  rows: CalibrationPointRow[]
} {
  if (!raw || typeof raw !== 'object') return { columns: [], rows: [] }
  const o = raw as Record<string, unknown>
  const colsRaw = Array.isArray(o.columns) ? o.columns : []
  const columns = colsRaw.map((item, index) =>
    normalizeCalibrationPointsColumn(
      (item && typeof item === 'object' ? item : {}) as Record<string, unknown>,
      index,
    ),
  )
  const rowsRaw = Array.isArray(o.rows) ? o.rows : []
  const rows: CalibrationPointRow[] = rowsRaw.map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const valuesRaw =
      row.values && typeof row.values === 'object' && !Array.isArray(row.values)
        ? (row.values as Record<string, unknown>)
        : {}
    const values: Record<string, string> = {}
    for (const col of columns) values[col.id] = String(valuesRaw[col.id] ?? '')
    return { id: String(row.id ?? `ic-${Math.random().toString(36).slice(2, 8)}`), values }
  })
  return {
    columns,
    rows: columns.length === 0 ? [] : rows.length > 0 ? rows : [emptyCalibrationPointRow(columns)],
  }
}

export function emptyIntermediateCheckReading(): IntermediateCheckReading {
  return { checkPointValue: '', std: '', obs: '' }
}

function normalizeReading(row: unknown): IntermediateCheckReading {
  if (!row || typeof row !== 'object') return emptyIntermediateCheckReading()
  const r = row as Record<string, unknown>
  return {
    checkPointValue: String(r.checkPointValue ?? r.checkPoint ?? r.checkpoint ?? ''),
    std: String(r.std ?? ''),
    obs: String(r.obs ?? ''),
  }
}

/** Numeric tolerance from free-text criteria like "1 %" or "±0.5 mm". */
export function parseAcceptanceLimit(criteria: string | null | undefined): number | null {
  if (!criteria) return null
  const match = criteria.match(/[\d.]+/)
  if (!match) return null
  const num = Number.parseFloat(match[0])
  return Number.isNaN(num) ? null : num
}

export function extractAcceptanceCriteriaUnit(criteria: string | null | undefined): string {
  if (!criteria?.trim()) return ''
  return criteria.replace(/[\d.\s±+\-]+/g, '').trim()
}

export function calcIntermediateCheckError(std: string, obs: string): number | null {
  const stdNum = Number.parseFloat(std)
  const obsNum = Number.parseFloat(obs)
  if (Number.isNaN(stdNum) || Number.isNaN(obsNum)) return null
  return Math.abs(obsNum - stdNum)
}

export function formatIntermediateCheckError(err: number, unit: string): string {
  return `${err.toFixed(4)}${unit ? ` ${unit}` : ''}`
}

/** Reads the `[DATA:{...}]` block written by {@link encodeIntermediateCheckResult}. */
export function decodeIntermediateCheckResult(
  result: string | null | undefined,
  fallbackDoneBy = '',
): IntermediateCheckDraft & { isLegacy: boolean } {
  const text = result ?? ''
  const match = text.match(/\[DATA:([\s\S]+)\]/)

  if (match) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>
      if (Array.isArray(parsed.readings)) {
        const env = parseStoredTable(parsed.envTable)
        const check = parseStoredTable(parsed.checkTable)
        return {
          readings: parsed.readings.map(normalizeReading),
          doneBy: String(parsed.doneBy ?? '').trim() || fallbackDoneBy,
          masterIds: Array.isArray(parsed.masters)
            ? parsed.masters.map((id) => String(id)).filter(Boolean)
            : [],
          temperature:
            String(parsed.temperature ?? '').trim() || DEFAULT_INTERMEDIATE_TEMPERATURE,
          humidity: String(parsed.humidity ?? '').trim() || DEFAULT_INTERMEDIATE_HUMIDITY,
          envColumns: env.columns,
          envRows: env.rows,
          checkColumns: check.columns,
          checkRows: check.rows,
          isLegacy: false,
        }
      }
    } catch {
      // fall through to defaults
    }
  }

  return {
    readings: [emptyIntermediateCheckReading()],
    doneBy: fallbackDoneBy,
    masterIds: [],
    temperature: DEFAULT_INTERMEDIATE_TEMPERATURE,
    humidity: DEFAULT_INTERMEDIATE_HUMIDITY,
    envColumns: [],
    envRows: [],
    checkColumns: [],
    checkRows: [],
    isLegacy: text.trim().length > 0 && !text.includes('[DATA:'),
  }
}

export function summarizeIntermediateCheck(
  readings: IntermediateCheckReading[],
  acceptanceCriteria: string,
): { status: IntermediateCheckStatus; maxError: number; rssError: number; hasReading: boolean } {
  const limit = parseAcceptanceLimit(acceptanceCriteria)
  let maxError = 0
  let sumSq = 0
  let hasReading = false
  let hasFail = false

  for (const reading of readings) {
    const err = calcIntermediateCheckError(reading.std, reading.obs)
    if (err === null) continue
    hasReading = true
    sumSq += err * err
    if (err > maxError) maxError = err
    if (limit !== null && err > limit) hasFail = true
  }

  return {
    status: hasReading ? (hasFail ? 'Unsatisfactory' : 'Satisfactory') : 'N/A',
    maxError,
    rssError: Math.sqrt(sumSq),
    hasReading,
  }
}

/**
 * Serializes the draft into `summary\n[DATA:{...}]` — the same shape Testing LIMS
 * writes, so the shared history helpers can parse it unchanged.
 */
export function encodeIntermediateCheckResult(
  draft: IntermediateCheckDraft,
  acceptanceCriteria: string,
): string {
  const { status, maxError, rssError, hasReading } = summarizeIntermediateCheck(
    draft.readings,
    acceptanceCriteria,
  )
  const unit = extractAcceptanceCriteriaUnit(acceptanceCriteria)
  const limit = parseAcceptanceLimit(acceptanceCriteria)

  const summaryLine = hasReading
    ? `${status} (Max Error: ${maxError.toFixed(4)}${unit ? ` ${unit}` : ''}, RSS Combined Error: ${rssError.toFixed(4)}${unit ? ` ${unit}` : ''})`
    : 'No check performed yet'

  const dataStr = `[DATA:${JSON.stringify({
    status,
    limit: limit !== null ? String(limit) : '',
    readings: draft.readings,
    doneBy: draft.doneBy,
    masters: draft.masterIds,
    temperature: draft.temperature || DEFAULT_INTERMEDIATE_TEMPERATURE,
    humidity: draft.humidity || DEFAULT_INTERMEDIATE_HUMIDITY,
    envTable:
      draft.envColumns.length > 0
        ? { columns: draft.envColumns, rows: draft.envRows }
        : undefined,
    checkTable:
      draft.checkColumns.length > 0
        ? { columns: draft.checkColumns, rows: draft.checkRows }
        : undefined,
    combinedErrorRSS: rssError.toFixed(4),
  })}]`

  return `${summaryLine}\n${dataStr}`
}

export function hasValidIntermediateReading(readings: IntermediateCheckReading[]): boolean {
  return readings.some((r) => calcIntermediateCheckError(r.std, r.obs) !== null)
}
