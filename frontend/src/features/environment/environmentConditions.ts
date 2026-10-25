import { supabase } from '@/lib/supabaseClient'

/**
 * Environmental conditions during a period (ISO/IEC 17025 6.3.3, 7.8.2.1),
 * for showing on test results, calibration certificates and reports.
 * Wraps RPC environment_conditions_for (migration 20261026100200).
 */
export type EnvironmentConditions = {
  areaId: string
  areaCode: string
  areaName: string
  periodFrom: string
  periodTo: string
  readingCount: number
  temperatureMin: number | null
  temperatureMax: number | null
  temperatureAvg: number | null
  humidityMin: number | null
  humidityMax: number | null
  humidityAvg: number | null
  /** At least one reading in the period was outside the area limits. */
  anyOutOfLimits: boolean
  outOfLimitCount: number
  firstReadingAt: string | null
  lastReadingAt: string | null
  /** The area's limits now: { temp_min, temp_max, rh_min, rh_max, other_limits }. */
  currentLimits: {
    temp_min: number | null
    temp_max: number | null
    rh_min: number | null
    rh_max: number | null
    other_limits: Record<string, unknown>
  }
  /** Last reading before the period (useful when the period has no reading). */
  lastBefore: {
    at: string
    temperature: number | null
    humidity: number | null
    withinLimits: boolean | null
  } | null
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function isMissing(err: { code?: string; message?: string }): boolean {
  if (err.code === 'PGRST202' || err.code === '42883' || err.code === '42P01' || err.code === 'PGRST205') return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    msg.includes('environment_conditions_for') &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : v
}

/**
 * Conditions in `areaId` between `from` and `to` (Date or ISO text; reversed
 * bounds are swapped by the database).
 * Resolves null when the migration is not applied yet, or when the area does
 * not exist / is not visible to the user. Throws on other errors.
 */
export async function fetchConditionsFor(
  areaId: string,
  from: Date | string,
  to: Date | string,
): Promise<EnvironmentConditions | null> {
  if (!areaId) return null
  const { data, error } = await supabase.rpc('environment_conditions_for', {
    p_area_id: areaId,
    p_from: toIso(from),
    p_to: toIso(to),
  })
  if (error) {
    if (isMissing(error)) return null
    throw error
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row) return null
  const limits = (row.current_limits ?? {}) as Record<string, unknown>
  return {
    areaId: String(row.area_id ?? areaId),
    areaCode: String(row.area_code ?? ''),
    areaName: String(row.area_name ?? ''),
    periodFrom: String(row.period_from ?? toIso(from)),
    periodTo: String(row.period_to ?? toIso(to)),
    readingCount: n(row.reading_count) ?? 0,
    temperatureMin: n(row.temperature_min),
    temperatureMax: n(row.temperature_max),
    temperatureAvg: n(row.temperature_avg),
    humidityMin: n(row.humidity_min),
    humidityMax: n(row.humidity_max),
    humidityAvg: n(row.humidity_avg),
    anyOutOfLimits: row.any_out_of_limits === true,
    outOfLimitCount: n(row.out_of_limit_count) ?? 0,
    firstReadingAt: (row.first_reading_at as string | null) ?? null,
    lastReadingAt: (row.last_reading_at as string | null) ?? null,
    currentLimits: {
      temp_min: n(limits.temp_min),
      temp_max: n(limits.temp_max),
      rh_min: n(limits.rh_min),
      rh_max: n(limits.rh_max),
      other_limits: (limits.other_limits as Record<string, unknown>) ?? {},
    },
    lastBefore: row.last_before_at
      ? {
          at: String(row.last_before_at),
          temperature: n(row.last_before_temperature),
          humidity: n(row.last_before_humidity),
          withinLimits: typeof row.last_before_within_limits === 'boolean' ? row.last_before_within_limits : null,
        }
      : null,
  }
}

function span(min: number | null, max: number | null, unit: string): string | null {
  const lo = min ?? max
  const hi = max ?? min
  if (lo === null || hi === null) return null
  if (lo === hi) return `${lo.toFixed(1)} ${unit}`
  return `${lo.toFixed(1)}–${hi.toFixed(1)} ${unit}`
}

/**
 * One line for a result / report, e.g.
 * "Temperature 22.0–31.5 °C, RH 50.0–65.0 % (6 readings; 3 outside limits)".
 * Empty string when there is nothing to show.
 */
export function formatConditionsSummary(c: EnvironmentConditions | null): string {
  if (!c) return ''
  if (c.readingCount === 0) {
    if (!c.lastBefore) return 'No environmental readings recorded'
    const parts = [
      c.lastBefore.temperature !== null ? `${c.lastBefore.temperature.toFixed(1)} °C` : null,
      c.lastBefore.humidity !== null ? `${c.lastBefore.humidity.toFixed(1)} % RH` : null,
    ].filter(Boolean)
    return `No reading in the period; last reading before it: ${parts.join(', ')}`
  }
  const parts = [
    span(c.temperatureMin, c.temperatureMax, '°C') && `Temperature ${span(c.temperatureMin, c.temperatureMax, '°C')}`,
    span(c.humidityMin, c.humidityMax, '%') && `RH ${span(c.humidityMin, c.humidityMax, '%')}`,
  ].filter(Boolean)
  const tail = `${c.readingCount} reading${c.readingCount === 1 ? '' : 's'}${
    c.anyOutOfLimits ? `; ${c.outOfLimitCount} outside limits` : ''
  }`
  return `${parts.join(', ')} (${tail})`
}
