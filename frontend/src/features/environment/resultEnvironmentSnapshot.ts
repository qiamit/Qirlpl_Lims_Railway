import type { EnvironmentConditions } from './environmentConditions'

/**
 * Environmental conditions recorded with a test result (ISO/IEC 17025 7.5.1)
 * and printed on the test report (7.8.3.1 a).
 *
 * Stored in test_allocation_parameters.environment_snapshot (migration
 * 20261026100300). Pure helpers only: no database, no DOM, so the report
 * renderer can use them for live and archived prints alike.
 */

/** Analyst's acknowledgement of readings outside the area limits during the test. */
export type ResultEnvironmentAcknowledgement = {
  reason: string
  by: string
  by_name: string
  at: string
}

export type ResultEnvironmentSnapshot = {
  area_id: string
  area_code: string
  area_name: string
  period_from: string
  period_to: string
  reading_count: number
  temperature_min: number | null
  temperature_max: number | null
  temperature_avg: number | null
  humidity_min: number | null
  humidity_max: number | null
  humidity_avg: number | null
  any_out_of_limits: boolean
  out_of_limit_count: number
  /** The area's limits when the snapshot was taken. */
  limits: {
    temp_min: number | null
    temp_max: number | null
    rh_min: number | null
    rh_max: number | null
  }
  captured_at: string
  /** Set when a reading was outside limits and the analyst acknowledged it. */
  acknowledgement: ResultEnvironmentAcknowledgement | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export function snapshotFromConditions(
  c: EnvironmentConditions,
  capturedAt: string,
  acknowledgement: ResultEnvironmentAcknowledgement | null,
): ResultEnvironmentSnapshot {
  return {
    area_id: c.areaId,
    area_code: c.areaCode,
    area_name: c.areaName,
    period_from: c.periodFrom,
    period_to: c.periodTo,
    reading_count: c.readingCount,
    temperature_min: c.temperatureMin,
    temperature_max: c.temperatureMax,
    temperature_avg: c.temperatureAvg,
    humidity_min: c.humidityMin,
    humidity_max: c.humidityMax,
    humidity_avg: c.humidityAvg,
    any_out_of_limits: c.anyOutOfLimits,
    out_of_limit_count: c.outOfLimitCount,
    limits: {
      temp_min: c.currentLimits.temp_min,
      temp_max: c.currentLimits.temp_max,
      rh_min: c.currentLimits.rh_min,
      rh_max: c.currentLimits.rh_max,
    },
    captured_at: capturedAt,
    acknowledgement: c.anyOutOfLimits ? acknowledgement : null,
  }
}

/** Reads a stored snapshot (jsonb object or JSON text); null when absent or malformed. */
export function parseResultEnvironmentSnapshot(raw: unknown): ResultEnvironmentSnapshot | null {
  let v = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const limits = (o.limits && typeof o.limits === 'object' ? o.limits : {}) as Record<string, unknown>
  const ack = o.acknowledgement && typeof o.acknowledgement === 'object'
    ? (o.acknowledgement as Record<string, unknown>)
    : null
  return {
    area_id: String(o.area_id ?? ''),
    area_code: String(o.area_code ?? ''),
    area_name: String(o.area_name ?? ''),
    period_from: String(o.period_from ?? ''),
    period_to: String(o.period_to ?? ''),
    reading_count: num(o.reading_count) ?? 0,
    temperature_min: num(o.temperature_min),
    temperature_max: num(o.temperature_max),
    temperature_avg: num(o.temperature_avg),
    humidity_min: num(o.humidity_min),
    humidity_max: num(o.humidity_max),
    humidity_avg: num(o.humidity_avg),
    any_out_of_limits: o.any_out_of_limits === true,
    out_of_limit_count: num(o.out_of_limit_count) ?? 0,
    limits: {
      temp_min: num(limits.temp_min),
      temp_max: num(limits.temp_max),
      rh_min: num(limits.rh_min),
      rh_max: num(limits.rh_max),
    },
    captured_at: String(o.captured_at ?? ''),
    acknowledgement: ack
      ? {
          reason: String(ack.reason ?? ''),
          by: String(ack.by ?? ''),
          by_name: String(ack.by_name ?? ''),
          at: String(ack.at ?? ''),
        }
      : null,
  }
}

function range(min: number | null, max: number | null, unit: string): string | null {
  const lo = min ?? max
  const hi = max ?? min
  if (lo === null || hi === null) return null
  return lo === hi ? `${lo.toFixed(1)} ${unit}` : `${lo.toFixed(1)}–${hi.toFixed(1)} ${unit}`
}

/** "Temperature 22.0–25.0 °C, RH 45.0–55.0 % (6 readings; 1 outside limits)". */
export function formatEnvironmentSnapshotSummary(s: ResultEnvironmentSnapshot): string {
  if (s.reading_count === 0) return 'No environmental readings recorded for this period'
  const parts = [
    range(s.temperature_min, s.temperature_max, '°C') && `Temperature ${range(s.temperature_min, s.temperature_max, '°C')}`,
    range(s.humidity_min, s.humidity_max, '%') && `RH ${range(s.humidity_min, s.humidity_max, '%')}`,
  ].filter(Boolean)
  const tail = `${s.reading_count} reading${s.reading_count === 1 ? '' : 's'}${
    s.any_out_of_limits ? `; ${s.out_of_limit_count} outside limits` : ''
  }`
  return `${parts.join(', ')} (${tail})`
}

// ---------------------------------------------------------------------------
// Test report (Part C): one line per area, over the parameters of the report.
// ---------------------------------------------------------------------------

/** Conditions in one area over all printed parameters tested there. JSON-safe. */
export type ReportEnvironmentLine = {
  areaCode: string
  areaName: string
  readingCount: number
  temperatureMin: number | null
  temperatureMax: number | null
  humidityMin: number | null
  humidityMax: number | null
}

const minOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b))
const maxOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b))

/**
 * Combines the snapshots of the given result rows by area (min of minima, max
 * of maxima). Rows without a snapshot are skipped; empty when none has one.
 */
export function summarizeReportEnvironment(
  parameterIds: string[],
  byParameterId: Record<string, ResultEnvironmentSnapshot | null | undefined> | null | undefined,
): ReportEnvironmentLine[] {
  if (!byParameterId) return []
  const byArea = new Map<string, ReportEnvironmentLine>()
  for (const id of parameterIds) {
    const s = byParameterId[id]
    if (!s) continue
    const key = s.area_id || s.area_code
    if (!key) continue
    const cur = byArea.get(key)
    if (!cur) {
      byArea.set(key, {
        areaCode: s.area_code,
        areaName: s.area_name,
        readingCount: s.reading_count,
        temperatureMin: s.temperature_min,
        temperatureMax: s.temperature_max,
        humidityMin: s.humidity_min,
        humidityMax: s.humidity_max,
      })
      continue
    }
    // Overlapping test periods share readings: the count is the largest single
    // period's, used only to tell "no readings" apart.
    cur.readingCount = Math.max(cur.readingCount, s.reading_count)
    cur.temperatureMin = minOf(cur.temperatureMin, s.temperature_min)
    cur.temperatureMax = maxOf(cur.temperatureMax, s.temperature_max)
    cur.humidityMin = minOf(cur.humidityMin, s.humidity_min)
    cur.humidityMax = maxOf(cur.humidityMax, s.humidity_max)
  }
  return [...byArea.values()].sort(
    (a, b) => a.areaCode.localeCompare(b.areaCode) || a.areaName.localeCompare(b.areaName),
  )
}

/** "Chemical lab (CHEM): Temperature 23.0–25.0 °C, RH 45.0–55.0 %". */
export function formatReportEnvironmentLine(line: ReportEnvironmentLine): string {
  const name = line.areaName.trim()
  const code = line.areaCode.trim()
  const label = name && code && name.toLowerCase() !== code.toLowerCase() ? `${name} (${code})` : name || code
  const parts = [
    range(line.temperatureMin, line.temperatureMax, '°C') &&
      `Temperature ${range(line.temperatureMin, line.temperatureMax, '°C')}`,
    range(line.humidityMin, line.humidityMax, '%') && `RH ${range(line.humidityMin, line.humidityMax, '%')}`,
  ].filter(Boolean)
  return `${label}: ${parts.length > 0 ? parts.join(', ') : 'No environmental readings recorded'}`
}
