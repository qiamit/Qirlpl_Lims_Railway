export type TestResultStatKey =
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'range'
  | 'stddev'
  | 'cv'
  | 'count'

export type TestResultSeparator = 'comma' | 'semicolon' | 'newline' | 'pipe' | 'slash'

export type TestResultReadingEntry = {
  label?: string
  value: number
  unit?: string
}

export type TestResultCompareAction =
  | 'use'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'difference'
  | 'ratio'

export const TEST_RESULT_COMPARE_ACTIONS: Array<{
  value: TestResultCompareAction
  label: string
}> = [
  { value: 'use', label: 'Use value' },
  { value: 'add', label: 'Add (+)' },
  { value: 'subtract', label: 'Subtract (−)' },
  { value: 'multiply', label: 'Multiply (×)' },
  { value: 'divide', label: 'Divide (÷)' },
  { value: 'difference', label: 'Difference (Δ)' },
  { value: 'ratio', label: 'Ratio (%)' },
]

export type TestResultComposeOptions = {
  includeLabels: boolean
  includeStat: boolean
  separator: TestResultSeparator
}

export type StructuredTestResult = {
  v: 1 | 2
  readings: number[]
  entries: TestResultReadingEntry[]
  reported: string
  stat?: TestResultStatKey | 'manual' | 'readings' | 'composed'
  compose?: TestResultComposeOptions
  decimals?: number
}

export const DEFAULT_DECIMAL_PLACES = 2

export const TEST_RESULT_DECIMAL_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((n) => ({
  value: String(n),
  label: n === 0 ? '0 (whole number)' : `${n} decimal${n === 1 ? '' : 's'}`,
}))

export type TestResultStats = {
  sum: number
  average: number
  min: number
  max: number
  range: number
  stddev: number
  cv: number
  count: number
}

const STAT_LABELS: Record<TestResultStatKey, string> = {
  sum: 'Sum',
  average: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  range: 'Range',
  stddev: 'Std. Deviation',
  cv: 'CV (%)',
  count: 'Count (n)',
}

const SEPARATOR_CHARS: Record<TestResultSeparator, string> = {
  comma: ', ',
  semicolon: '; ',
  newline: '\n',
  pipe: ' | ',
  slash: ' / ',
}

export const TEST_RESULT_SEPARATOR_OPTIONS: Array<{ value: TestResultSeparator; label: string }> = [
  { value: 'comma', label: 'Comma (,)' },
  { value: 'semicolon', label: 'Semicolon (;)' },
  { value: 'pipe', label: 'Pipe (|)' },
  { value: 'slash', label: 'Slash (/)' },
  { value: 'newline', label: 'New line' },
]

export function statLabel(key: TestResultStatKey): string {
  return STAT_LABELS[key]
}

export function separatorChar(separator: TestResultSeparator): string {
  return SEPARATOR_CHARS[separator]
}

function normalizeDecimals(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) {
    return undefined
  }
  return value
}

function normalizeEntries(
  entries: Array<{ label?: unknown; value: unknown }>,
): TestResultReadingEntry[] {
  return entries
    .filter((e) => typeof e.value === 'number' && Number.isFinite(e.value))
    .map((e) => ({
      label: typeof e.label === 'string' ? e.label.trim() : '',
      value: e.value as number,
      unit: typeof e.unit === 'string' ? e.unit.trim() : '',
    }))
}

export function parseTestResultValue(raw: string | null | undefined): StructuredTestResult | null {
  const t = (raw ?? '').trim()
  if (!t.startsWith('{')) return null
  try {
    const o = JSON.parse(t) as Partial<StructuredTestResult> & {
      entries?: Array<{ label?: string; value: number }>
      readings?: number[]
    }

    if (o.v === 2 && Array.isArray(o.entries)) {
      const entries = normalizeEntries(o.entries)
      const reported = typeof o.reported === 'string' ? o.reported.trim() : ''
      return {
        v: 2,
        entries,
        readings: entries.map((e) => e.value),
        reported,
        stat: o.stat,
        compose: o.compose,
        decimals: normalizeDecimals(o.decimals),
      }
    }

    if (o.v === 1 && Array.isArray(o.readings)) {
      const readings = o.readings.filter((n) => typeof n === 'number' && Number.isFinite(n))
      const entries = readings.map((value) => ({ value }))
      const reported = typeof o.reported === 'string' ? o.reported.trim() : ''
      return {
        v: 1,
        readings,
        entries,
        reported,
        stat: o.stat,
        compose: o.compose,
        decimals: normalizeDecimals(o.decimals),
      }
    }

    return null
  } catch {
    return null
  }
}

export function serializeTestResult(record: StructuredTestResult): string {
  if (record.readings.length === 0 && !record.reported) return ''
  const hasLabels = record.entries.some((e) => Boolean(e.label?.trim()))
  const hasUnits = record.entries.some((e) => Boolean(e.unit?.trim()))
  const hasCompose = Boolean(record.compose)
  const isSimple =
    record.readings.length <= 1 &&
    !record.stat &&
    !hasLabels &&
    !hasUnits &&
    !hasCompose &&
    record.reported

  if (isSimple) return record.reported

  const useV2 = hasLabels || hasUnits || record.entries.length > 1 || hasCompose
  const payload = {
    reported: record.reported,
    stat: record.stat,
    compose: record.compose,
    ...(record.decimals !== undefined ? { decimals: record.decimals } : {}),
  }

  if (useV2) {
    return JSON.stringify({
      v: 2,
      entries: record.entries,
      ...payload,
    })
  }

  return JSON.stringify({
    v: 1,
    readings: record.readings,
    ...payload,
  })
}

export function getReportedTestResult(raw: string | null | undefined): string {
  const formatted = formatTestResultForTable(raw)
  if (formatted) return formatted
  return (raw ?? '').trim()
}

export function formatValueWithUnit(
  value: number,
  unit: string | undefined,
  decimals = DEFAULT_DECIMAL_PLACES,
): string {
  const val = formatNumber(value, decimals)
  const u = unit?.trim()
  return u ? `${val} ${u}` : val
}

export function formatEntriesForDisplay(
  entries: TestResultReadingEntry[],
  includeLabels: boolean,
  separator: TestResultSeparator = 'comma',
  decimals = DEFAULT_DECIMAL_PLACES,
): string {
  const sep = separatorChar(separator)
  return entries
    .map((e) => {
      const val = formatValueWithUnit(e.value, e.unit, decimals)
      if (includeLabels && e.label?.trim()) return `${e.label.trim()}: ${val}`
      return val
    })
    .join(sep)
}

export function computeCompareResult(
  action: TestResultCompareAction,
  base: number,
  compare: number,
  decimals = DEFAULT_DECIMAL_PLACES,
): string {
  let result: number
  switch (action) {
    case 'use':
      result = compare
      break
    case 'add':
      result = base + compare
      break
    case 'subtract':
      result = base - compare
      break
    case 'multiply':
      result = base * compare
      break
    case 'divide':
      result = compare !== 0 ? base / compare : Number.NaN
      break
    case 'difference':
      result = Math.abs(base - compare)
      break
    case 'ratio':
      result = compare !== 0 ? (base / compare) * 100 : Number.NaN
      break
    default:
      result = compare
  }
  if (!Number.isFinite(result)) return '—'
  if (action === 'ratio') return `${formatNumber(result, decimals)}%`
  return formatNumber(result, decimals)
}

export function appendReportedFragment(current: string, fragment: string, separator = ', '): string {
  const piece = fragment.trim()
  if (!piece) return current
  const base = current.trim()
  if (!base) return piece
  return `${base}${separator}${piece}`
}

export function formatStatDisplay(
  stats: TestResultStats,
  key: TestResultStatKey,
  decimals = DEFAULT_DECIMAL_PLACES,
): string {
  if (key === 'count') return String(stats.count)
  if (key === 'cv') return `${formatNumber(statValue(stats, key), decimals)}%`
  return formatNumber(statValue(stats, key), decimals)
}

export function buildComposedReported(
  entries: TestResultReadingEntry[],
  options: TestResultComposeOptions,
  stats: TestResultStats | null,
  statKey?: TestResultStatKey | 'manual' | 'readings' | 'composed',
  decimals = DEFAULT_DECIMAL_PLACES,
): string {
  if (entries.length === 0) return ''
  const sep = separatorChar(options.separator)
  let result = formatEntriesForDisplay(entries, options.includeLabels, options.separator, decimals)

  if (
    options.includeStat &&
    stats &&
    statKey &&
    statKey !== 'manual' &&
    statKey !== 'readings' &&
    statKey !== 'composed'
  ) {
    const statVal = formatStatDisplay(stats, statKey, decimals)
    const statPart = `${statLabel(statKey)}: ${statVal}`
    result = result ? `${result}${sep}${statPart}` : statPart
  }

  return result
}

export function formatTestResultDisplay(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  const structured = parseTestResultValue(t)
  if (!structured) return t
  if (structured.readings.length === 0) return structured.reported

  const hasLabels = structured.entries.some((e) => Boolean(e.label?.trim()))
  const sep = structured.compose?.separator ?? DEFAULT_COMPOSE_OPTIONS.separator
  const readingsStr = formatEntriesForDisplay(
    structured.entries,
    hasLabels || Boolean(structured.compose?.includeLabels),
    sep,
  )

  if (structured.reported) {
    const statNote =
      structured.stat &&
      structured.stat !== 'manual' &&
      structured.stat !== 'readings' &&
      structured.stat !== 'composed'
        ? ` (${statLabel(structured.stat as TestResultStatKey)})`
        : ''
    if (readingsStr && structured.reported !== readingsStr) {
      return `${readingsStr} → ${structured.reported}${statNote}`
    }
    return `${structured.reported}${statNote}`
  }

  return readingsStr
}

/** Human-readable text for table cells — never returns raw JSON. */
export function formatTestResultForTable(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  const structured = parseTestResultValue(t)
  if (!structured) return t

  if (structured.reported) {
    return structured.reported
  }

  if (structured.entries.length === 0) return ''

  const hasLabels = structured.entries.some((e) => Boolean(e.label?.trim()))
  const sep =
    structured.compose?.separator ??
    (hasLabels || structured.entries.length > 1 ? 'newline' : 'comma')
  const decimals = structured.decimals ?? DEFAULT_DECIMAL_PLACES

  return formatEntriesForDisplay(
    structured.entries,
    hasLabels || Boolean(structured.compose?.includeLabels),
    sep,
    decimals,
  )
}

export function formatTestResultShort(raw: string | null | undefined): string {
  const display = formatTestResultForTable(raw)
  if (!display) return ''
  const structured = parseTestResultValue(raw)
  if (structured && structured.entries.length > 1 && !structured.reported) {
    return `${structured.entries.length} readings`
  }
  const oneLine = display.replace(/\s+/g, ' ').trim()
  if (oneLine.length > 48) return `${oneLine.slice(0, 45)}…`
  return oneLine
}

export function parseReadingInput(value: string): number | null {
  const t = value.trim().replace(/,/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function formatNumber(n: number, decimals = 4): string {
  if (!Number.isFinite(n)) return ''
  const rounded = Number(n.toFixed(decimals))
  return String(rounded)
}

export function computeTestResultStats(readings: number[]): TestResultStats | null {
  if (readings.length === 0) return null
  const n = readings.length
  const sum = readings.reduce((a, b) => a + b, 0)
  const average = sum / n
  const min = Math.min(...readings)
  const max = Math.max(...readings)
  const range = max - min
  let stddev = 0
  if (n > 1) {
    const variance = readings.reduce((acc, x) => acc + (x - average) ** 2, 0) / (n - 1)
    stddev = Math.sqrt(variance)
  }
  const cv = average !== 0 ? (stddev / Math.abs(average)) * 100 : 0
  return { sum, average, min, max, range, stddev, cv, count: n }
}

export function statValue(stats: TestResultStats, key: TestResultStatKey): number {
  switch (key) {
    case 'sum':
      return stats.sum
    case 'average':
      return stats.average
    case 'min':
      return stats.min
    case 'max':
      return stats.max
    case 'range':
      return stats.range
    case 'stddev':
      return stats.stddev
    case 'cv':
      return stats.cv
    case 'count':
      return stats.count
    default:
      return stats.average
  }
}

export function structuredFromLegacyText(text: string): StructuredTestResult {
  const t = text.trim()
  const n = parseReadingInput(t)
  const entries: TestResultReadingEntry[] = n !== null ? [{ value: n }] : []
  return {
    v: 1,
    readings: n !== null ? [n] : [],
    entries,
    reported: t,
    stat: 'manual',
  }
}

export const TEST_RESULT_STAT_KEYS: TestResultStatKey[] = [
  'sum',
  'average',
  'min',
  'max',
  'range',
  'stddev',
  'cv',
  'count',
]

export const DEFAULT_COMPOSE_OPTIONS: TestResultComposeOptions = {
  includeLabels: true,
  includeStat: false,
  separator: 'newline',
}
