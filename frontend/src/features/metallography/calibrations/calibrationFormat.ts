import type { EquipmentOption } from '@/lib/equipmentTraceability'
import { CALIBRATION_EXPIRY_WARNING_DAYS, type ScaleCalibration } from '../types'

/**
 * S4 Microscope Calibration: small pure helpers shared by the page, table,
 * form and footer (validity state, labels, number text). No React here.
 */

/** Validity as the screens show it. Only 'valid' and 'expiring' can be used by an analysis. */
export type CalibrationValidityState = 'draft' | 'withdrawn' | 'not_yet_valid' | 'valid' | 'expiring' | 'expired'

export type CalibrationValidity = {
  state: CalibrationValidityState
  /** Days from `today` to valid_until (negative once expired). */
  daysLeft: number | null
}

/** Whole days from a to b (yyyy-mm-dd), time zone free. */
export function daysBetween(a: string, b: string): number | null {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(a)
  const pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(b)
  if (!pa || !pb) return null
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]))
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]))
  return Math.round((tb - ta) / 86_400_000)
}

/** Same date one year later (29 Feb -> 28 Feb). */
export function addOneYear(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!m) return ''
  const y = Number(m[1]) + 1
  const day = m[2] === '02' && m[3] === '29' ? '28' : m[3]
  return `${y}-${m[2]}-${day}`
}

/** First day of validity: valid_from, else the reading date (same rule as the database). */
export function effectiveValidFrom(c: Pick<ScaleCalibration, 'validFrom' | 'performedAt'>): string {
  return c.validFrom ?? c.performedAt.slice(0, 10)
}

export function calibrationValidity(c: ScaleCalibration, today: string): CalibrationValidity {
  if (c.status === 'draft') return { state: 'draft', daysLeft: daysBetween(today, c.validUntil) }
  if (c.status === 'withdrawn') return { state: 'withdrawn', daysLeft: null }
  const daysLeft = daysBetween(today, c.validUntil)
  if (daysLeft !== null && daysLeft < 0) return { state: 'expired', daysLeft }
  if (effectiveValidFrom(c) > today) return { state: 'not_yet_valid', daysLeft }
  if (daysLeft !== null && daysLeft <= CALIBRATION_EXPIRY_WARNING_DAYS) return { state: 'expiring', daysLeft }
  return { state: 'valid', daysLeft }
}

/** Short text for the expiry badge, or null when there is nothing to warn about. */
export function validityWarningText(v: CalibrationValidity): string | null {
  if (v.state === 'expired') return 'Expired'
  if (v.state === 'expiring' && v.daysLeft !== null) {
    return v.daysLeft === 0 ? 'Expires today' : `Expires in ${v.daysLeft} day${v.daysLeft === 1 ? '' : 's'}`
  }
  if (v.state === 'not_yet_valid') return 'Not yet valid'
  return null
}

/** Register filter (header bar, ?filter= in the URL). */
export type CalibrationFilter = 'all' | 'draft' | 'in_use' | 'expiring' | 'expired' | 'withdrawn'

export const CALIBRATION_FILTERS: ReadonlyArray<{ value: CalibrationFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Awaiting verification' },
  { value: 'in_use', label: 'Verified, in date' },
  { value: 'expiring', label: `Expiring in ${CALIBRATION_EXPIRY_WARNING_DAYS} days` },
  { value: 'expired', label: 'Expired' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

export function isCalibrationFilter(v: string | null): v is CalibrationFilter {
  return CALIBRATION_FILTERS.some((f) => f.value === v)
}

export function matchesFilter(c: ScaleCalibration, filter: CalibrationFilter, today: string): boolean {
  if (filter === 'all') return true
  const v = calibrationValidity(c, today)
  if (filter === 'draft') return v.state === 'draft'
  if (filter === 'withdrawn') return v.state === 'withdrawn'
  if (filter === 'expired') return v.state === 'expired'
  if (filter === 'expiring') return v.state === 'expiring'
  return v.state === 'valid' || v.state === 'expiring' || v.state === 'not_yet_valid'
}

/** Testing equipment only (CRMs are never a microscope, camera or micrometer). */
export function instrumentOptions(options: EquipmentOption[]): EquipmentOption[] {
  return options.filter((o) => o.kind === 'equipment')
}

export function equipmentText(id: string | null, byId: ReadonlyMap<string, EquipmentOption>): string {
  if (!id) return '—'
  const e = byId.get(id)
  if (!e) return 'Equipment not found'
  return [e.assetCode, e.name].filter((x) => x && x.trim()).join(' · ') || 'Equipment'
}

/** Fixed decimals, or a dash. */
export function fixed(v: number | null | undefined, decimals: number): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(decimals)
}

/** µm/px as stored (6 decimals). */
export function umPerPxText(v: number | null | undefined): string {
  return fixed(v, 6)
}

export function resolutionText(w: number | null | undefined, h: number | null | undefined): string {
  return w && h ? `${w} × ${h} px` : '—'
}

/** Plain number from a text box; null when empty or not a number. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
