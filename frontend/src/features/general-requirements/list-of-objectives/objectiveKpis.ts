/**
 * Measured values of quality objectives (ISO/IEC 17025 8.2, gap P3-7).
 * Table objective_measurements (20261031100000_p3_good_practice.sql).
 */

export type ObjectiveStatus = 'Met' | 'Partly met' | 'Not met' | 'Not measured'

export const OBJECTIVE_STATUSES: ObjectiveStatus[] = ['Met', 'Partly met', 'Not met', 'Not measured']

export type ObjectiveMeasurement = {
  id: string
  objective_id: string
  period: string
  period_end: string | null
  target: number | null
  actual: number | null
  unit: string | null
  higher_is_better: boolean
  status: ObjectiveStatus
  remarks: string | null
  created_at: string | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function normalizeMeasurement(r: Record<string, unknown>): ObjectiveMeasurement {
  const status = String(r.status ?? 'Not measured') as ObjectiveStatus
  return {
    id: String(r.id ?? ''),
    objective_id: String(r.objective_id ?? ''),
    period: String(r.period ?? ''),
    period_end: r.period_end ? String(r.period_end).slice(0, 10) : null,
    target: num(r.target),
    actual: num(r.actual),
    unit: r.unit == null || String(r.unit).trim() === '' ? null : String(r.unit),
    higher_is_better: r.higher_is_better !== false,
    status: OBJECTIVE_STATUSES.includes(status) ? status : 'Not measured',
    remarks: r.remarks == null ? null : String(r.remarks),
    created_at: r.created_at == null ? null : String(r.created_at),
  }
}

/**
 * Suggested status: met when the actual reaches the target in the right
 * direction; partly met within 10 % of the target; otherwise not met.
 */
export function suggestObjectiveStatus(
  target: number | null,
  actual: number | null,
  higherIsBetter: boolean,
  tolerance = 0.1,
): ObjectiveStatus {
  if (actual === null) return 'Not measured'
  if (target === null) return 'Not measured'
  const met = higherIsBetter ? actual >= target : actual <= target
  if (met) return 'Met'
  const gap = Math.abs(actual - target)
  const scale = Math.abs(target) || 1
  return gap / scale <= tolerance ? 'Partly met' : 'Not met'
}

/** Chronological order: period_end, then period text, then created_at. */
export function sortMeasurements(list: ObjectiveMeasurement[]): ObjectiveMeasurement[] {
  return [...list].sort((a, b) => {
    const ea = a.period_end ?? ''
    const eb = b.period_end ?? ''
    if (ea !== eb) return ea < eb ? -1 : 1
    if (a.period !== b.period) return a.period.localeCompare(b.period, undefined, { numeric: true })
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })
}

/** Direction of the last change of the actual value, in "good / bad" terms. */
export function objectiveTrend(list: ObjectiveMeasurement[]): 'improving' | 'worsening' | 'steady' | null {
  const vals = sortMeasurements(list).filter((m) => m.actual !== null)
  if (vals.length < 2) return null
  const last = vals[vals.length - 1]
  const prev = vals[vals.length - 2]
  const d = (last.actual as number) - (prev.actual as number)
  if (d === 0) return 'steady'
  return (d > 0) === last.higher_is_better ? 'improving' : 'worsening'
}
