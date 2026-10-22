/**
 * Facilities and environmental conditions (ISO/IEC 17025 6.3).
 * Types and pure helpers shared by the environment pages.
 * Tables: migration 20261026100200_environmental_monitoring.sql.
 */

export type OtherLimit = { label?: string; unit?: string; min?: number | null; max?: number | null }

export type LabArea = {
  id: string
  code: string
  name: string
  department: string | null
  description: string | null
  temp_min: number | null
  temp_max: number | null
  rh_min: number | null
  rh_max: number | null
  other_limits: Record<string, OtherLimit> | null
  readings_per_day: number
  logger_equipment_id: string | null
  access_restricted: boolean
  active: boolean
  created_at?: string
  updated_at?: string
}

export type EnvironmentSource = 'manual' | 'csv' | 'logger'

export type EnvironmentReading = {
  id: string
  area_id: string
  recorded_at: string
  temperature: number | null
  humidity: number | null
  other: Record<string, unknown> | null
  recorded_by: string | null
  recorded_by_name: string | null
  source: EnvironmentSource
  within_limits: boolean | null
  limit_snapshot: {
    area_code?: string
    area_name?: string
    temp_min?: number | null
    temp_max?: number | null
    rh_min?: number | null
    rh_max?: number | null
    other_limits?: Record<string, OtherLimit>
  } | null
  remarks: string | null
  nc_record_id: string | null
  created_at: string
  /** PostgREST embed of nc_work_records (hidden when the NC was deleted). */
  nc?: { nc_id: string; status: string } | null
}

export type AccessLogRow = {
  id: string
  area_id: string
  person_name: string
  user_id: string | null
  purpose: string | null
  time_in: string
  time_out: string | null
  escorted_by: string | null
  remarks: string | null
  created_at: string
}

export type HousekeepingRow = {
  id: string
  area_id: string
  done_on: string
  activity: string
  done_by: string | null
  verified_by: string | null
  remarks: string | null
  created_at: string
}

export const ENV_SOURCE_LABEL: Record<EnvironmentSource, string> = {
  manual: 'Manual',
  csv: 'CSV import',
  logger: 'Data logger',
}

export const NC_RECORDS_PATH = '/nonconforming-work/records'

/** True when the environment tables / RPC are not on this database yet. */
export function isEnvMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /(lab_areas|environment_readings|area_access_log|housekeeping_log|environment_conditions_for)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function envErrorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  const n = num(v)
  return n === null ? '—' : n.toFixed(digits)
}

export function rangeText(min: number | null | undefined, max: number | null | undefined, unit: string): string {
  const a = num(min)
  const b = num(max)
  if (a === null && b === null) return 'No limit'
  if (a !== null && b !== null) return `${a}–${b} ${unit}`
  if (a !== null) return `≥ ${a} ${unit}`
  return `≤ ${b} ${unit}`
}

export function otherLimitEntries(limits: Record<string, OtherLimit> | null | undefined): Array<[string, OtherLimit]> {
  if (!limits || typeof limits !== 'object') return []
  return Object.entries(limits).filter(([, v]) => v && typeof v === 'object')
}

export function areaLimitsText(area: Pick<LabArea, 'temp_min' | 'temp_max' | 'rh_min' | 'rh_max' | 'other_limits'>): string {
  const parts = [
    `T ${rangeText(area.temp_min, area.temp_max, '°C')}`,
    `RH ${rangeText(area.rh_min, area.rh_max, '%')}`,
  ]
  for (const [key, lim] of otherLimitEntries(area.other_limits)) {
    parts.push(`${lim.label || key} ${rangeText(lim.min ?? null, lim.max ?? null, lim.unit ?? '')}`.trim())
  }
  return parts.join(' · ')
}

function outside(v: number | null, min: number | null | undefined, max: number | null | undefined): boolean | null {
  const lo = num(min)
  const hi = num(max)
  if (v === null || (lo === null && hi === null)) return null
  return (lo !== null && v < lo) || (hi !== null && v > hi)
}

/**
 * Same rule as the database trigger (used for the live preview while typing
 * and in the CSV preview): false when any value is outside its limit, true
 * when at least one value was checked, null when nothing could be checked.
 */
export function evaluateReading(
  area: Pick<LabArea, 'temp_min' | 'temp_max' | 'rh_min' | 'rh_max' | 'other_limits'>,
  temperature: number | null,
  humidity: number | null,
  other: Record<string, unknown> = {},
): boolean | null {
  const checks: Array<boolean | null> = [
    outside(temperature, area.temp_min, area.temp_max),
    outside(humidity, area.rh_min, area.rh_max),
  ]
  for (const [key, lim] of otherLimitEntries(area.other_limits)) {
    checks.push(outside(num(other[key]), lim.min, lim.max))
  }
  if (checks.some((c) => c === true)) return false
  if (checks.some((c) => c === false)) return true
  return null
}

/** Which values of a reading broke which limit, for NC descriptions. */
export function limitBreaches(reading: Pick<EnvironmentReading, 'temperature' | 'humidity' | 'other' | 'limit_snapshot'>): string[] {
  const snap = reading.limit_snapshot ?? {}
  const out: string[] = []
  if (outside(num(reading.temperature), snap.temp_min, snap.temp_max)) {
    out.push(`Temperature ${fmtNum(reading.temperature)} °C (limit ${rangeText(snap.temp_min, snap.temp_max, '°C')})`)
  }
  if (outside(num(reading.humidity), snap.rh_min, snap.rh_max)) {
    out.push(`Relative humidity ${fmtNum(reading.humidity)} % (limit ${rangeText(snap.rh_min, snap.rh_max, '%')})`)
  }
  const other = reading.other ?? {}
  for (const [key, lim] of otherLimitEntries(snap.other_limits)) {
    const v = num(other[key])
    if (outside(v, lim.min, lim.max)) {
      out.push(`${lim.label || key} ${v} ${lim.unit ?? ''} (limit ${rangeText(lim.min ?? null, lim.max ?? null, lim.unit ?? '')})`.replace(/\s+/g, ' '))
    }
  }
  return out
}

/**
 * Times of day at which readings are expected: spread over the working day
 * (09:00–17:00). 1 → 10:00; 2 → 09:00, 17:00; 3 → 09:00, 13:00, 17:00.
 */
export function dueSlots(readingsPerDay: number): string[] {
  const n = Math.max(0, Math.min(48, Math.floor(readingsPerDay || 0)))
  if (n === 0) return []
  if (n === 1) return ['10:00']
  const start = 9 * 60
  const span = 8 * 60
  return Array.from({ length: n }, (_, i) => {
    const m = Math.round(start + (span * i) / (n - 1))
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  })
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** yyyy-mm-dd of a local date. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  return `${localDateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function localInputToIso(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Start of a local yyyy-mm-dd day as ISO; end=true gives the last millisecond. */
export function dayBoundIso(day: string, end = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const [y, m, d] = day.split('-').map(Number)
  const dt = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0)
  return dt.toISOString()
}

export type DailyRange = { day: string; min: number; max: number; count: number }

/** Daily min / max of one measurand, for the trend chart. */
export function dailyMinMax(
  readings: Array<Pick<EnvironmentReading, 'recorded_at' | 'temperature' | 'humidity'>>,
  field: 'temperature' | 'humidity',
): DailyRange[] {
  const map = new Map<string, DailyRange>()
  for (const r of readings) {
    const v = num(r[field])
    if (v === null) continue
    const day = localDateKey(new Date(r.recorded_at))
    const cur = map.get(day)
    if (!cur) map.set(day, { day, min: v, max: v, count: 1 })
    else {
      cur.min = Math.min(cur.min, v)
      cur.max = Math.max(cur.max, v)
      cur.count += 1
    }
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
}

export function ncDescriptionFor(
  reading: Pick<EnvironmentReading, 'recorded_at' | 'temperature' | 'humidity' | 'other' | 'limit_snapshot' | 'recorded_by_name' | 'remarks'>,
  area: Pick<LabArea, 'code' | 'name'> | null,
  when: string,
): string {
  const where = area ? `${area.code} — ${area.name}` : reading.limit_snapshot?.area_code ?? 'the area'
  const breaches = limitBreaches(reading)
  const lines = [
    `Environmental conditions out of limits in ${where} on ${when} (ISO/IEC 17025 6.3.3).`,
    breaches.length ? breaches.join('; ') + '.' : 'Reading outside the area limits.',
  ]
  if (reading.recorded_by_name) lines.push(`Recorded by ${reading.recorded_by_name}.`)
  if (reading.remarks) lines.push(`Remarks: ${reading.remarks}`)
  lines.push('Check tests / calibrations performed in this area during the period for impact on results.')
  return lines.join('\n')
}
