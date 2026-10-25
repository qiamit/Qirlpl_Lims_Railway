/**
 * Measurement uncertainty by range band (ISO/IEC 17025 7.6, gap P3-2).
 *
 * Pure helpers (no Supabase, no '@/...' imports) so they can be unit tested
 * with plain Node. Table: test_parameter_mu_bands
 * (20261031100000_p3_good_practice.sql). The same selection rule is in the
 * SQL function mu_for_result().
 *
 * Selection rule for a result value:
 *   - only active bands whose valid_from is on or before the date;
 *   - the value must lie inside [range_from, range_to] (both inclusive,
 *     NULL = open end);
 *   - when several bands match (shared boundary, overlap, a catch-all band)
 *     the most specific wins: highest range_from (open lower end last), then
 *     the narrowest band (open-ended last), then the latest valid_from, then
 *     the latest created_at.
 */

export type MuUUnit = 'abs' | '%'

export type MuBand = {
  id: string
  test_parameter_id: string
  range_from: number | null
  range_to: number | null
  unit: string | null
  expanded_u: number
  u_unit: MuUUnit
  k: number
  confidence_level?: string | null
  valid_from: string
  review_due: string | null
  basis?: string | null
  active: boolean
  remarks?: string | null
  created_at?: string | null
}

export type MuForResult = {
  band: MuBand
  /** Expanded uncertainty U in the unit of the result (absolute). Null when U is relative and the value is unknown. */
  expandedU: number | null
  /** U as a percentage of the value, when it can be worked out. */
  relativePercent: number | null
  k: number
  unit: string | null
  reviewOverdue: boolean
}

export type MuReviewStatus = 'none' | 'ok' | 'due_soon' | 'overdue'

/** Days before review_due when a band counts as "due soon". */
export const MU_REVIEW_SOON_DAYS = 30

/** Number from a PostgREST numeric (number or numeric string); null otherwise. */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (!s || !/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateOnly(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

/** Normalise one database row (numeric strings, missing fields). */
export function normalizeMuBand(row: Record<string, unknown>): MuBand {
  const uUnit = String(row.u_unit ?? 'abs').trim() === '%' ? '%' : 'abs'
  return {
    id: String(row.id ?? ''),
    test_parameter_id: String(row.test_parameter_id ?? ''),
    range_from: toNum(row.range_from),
    range_to: toNum(row.range_to),
    unit: row.unit == null ? null : String(row.unit),
    expanded_u: toNum(row.expanded_u) ?? 0,
    u_unit: uUnit,
    k: toNum(row.k) ?? 2,
    confidence_level: row.confidence_level == null ? null : String(row.confidence_level),
    valid_from: dateOnly(row.valid_from as string) ?? '1900-01-01',
    review_due: dateOnly(row.review_due as string),
    basis: row.basis == null ? null : String(row.basis),
    active: row.active !== false,
    remarks: row.remarks == null ? null : String(row.remarks),
    created_at: row.created_at == null ? null : String(row.created_at),
  }
}

function bandMatches(b: MuBand, value: number | null): boolean {
  if (value === null || !Number.isFinite(value)) return b.range_from === null && b.range_to === null
  if (b.range_from !== null && value < b.range_from) return false
  if (b.range_to !== null && value > b.range_to) return false
  return true
}

/** Compare two matching bands: negative when a is more specific than b. */
function compareSpecificity(a: MuBand, b: MuBand): number {
  // range_from DESC NULLS LAST
  if (a.range_from !== b.range_from) {
    if (a.range_from === null) return 1
    if (b.range_from === null) return -1
    return b.range_from - a.range_from
  }
  // width ASC NULLS LAST
  const wa = a.range_from !== null && a.range_to !== null ? a.range_to - a.range_from : null
  const wb = b.range_from !== null && b.range_to !== null ? b.range_to - b.range_from : null
  if (wa !== wb) {
    if (wa === null) return 1
    if (wb === null) return -1
    return wa - wb
  }
  // valid_from DESC, created_at DESC
  if (a.valid_from !== b.valid_from) return a.valid_from < b.valid_from ? 1 : -1
  const ca = a.created_at ?? ''
  const cb = b.created_at ?? ''
  if (ca !== cb) return ca < cb ? 1 : -1
  return 0
}

/** The band that applies to a result value on a date (default today), or null. */
export function selectMuBand(
  bands: readonly MuBand[],
  value: number | null,
  onDate: string = isoDate(),
): MuBand | null {
  const day = dateOnly(onDate) ?? isoDate()
  const candidates = bands.filter((b) => b.active && b.valid_from <= day && bandMatches(b, value))
  if (candidates.length === 0) return null
  return [...candidates].sort(compareSpecificity)[0] ?? null
}

/** U for a value from a chosen band (absolute and relative). */
export function muFromBand(band: MuBand, value: number | null, onDate: string = isoDate()): MuForResult {
  const v = value !== null && Number.isFinite(value) ? value : null
  let expandedU: number | null
  let relativePercent: number | null
  if (band.u_unit === '%') {
    relativePercent = band.expanded_u
    expandedU = v === null ? null : (Math.abs(v) * band.expanded_u) / 100
  } else {
    expandedU = band.expanded_u
    relativePercent = v === null || v === 0 ? null : (band.expanded_u / Math.abs(v)) * 100
  }
  const day = dateOnly(onDate) ?? isoDate()
  return {
    band,
    expandedU,
    relativePercent,
    k: band.k,
    unit: band.unit,
    reviewOverdue: band.review_due !== null && band.review_due < day,
  }
}

/** selectMuBand + muFromBand; null when no band applies. */
export function muForValue(
  bands: readonly MuBand[],
  value: number | null,
  onDate: string = isoDate(),
): MuForResult | null {
  const band = selectMuBand(bands, value, onDate)
  return band ? muFromBand(band, value, onDate) : null
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function muReviewStatus(
  reviewDue: string | null | undefined,
  today: string = isoDate(),
  soonDays: number = MU_REVIEW_SOON_DAYS,
): MuReviewStatus {
  const due = dateOnly(reviewDue)
  if (!due) return 'none'
  if (due < today) return 'overdue'
  if (due <= addDays(today, soonDays)) return 'due_soon'
  return 'ok'
}

/** Worst review status over the active bands of one parameter, and the next review date. */
export function summarizeMuReview(
  bands: readonly MuBand[],
  today: string = isoDate(),
): { status: MuReviewStatus; nextDue: string | null; count: number } {
  const active = bands.filter((b) => b.active)
  const rank: Record<MuReviewStatus, number> = { none: 0, ok: 1, due_soon: 2, overdue: 3 }
  let status: MuReviewStatus = 'none'
  let nextDue: string | null = null
  for (const b of active) {
    const s = muReviewStatus(b.review_due, today)
    if (rank[s] > rank[status]) status = s
    if (b.review_due && (nextDue === null || b.review_due < nextDue)) nextDue = b.review_due
  }
  return { status, nextDue, count: active.length }
}

function fmtNum(n: number | null): string {
  if (n === null) return ''
  return String(Number(n.toPrecision(10)))
}

export function formatMuRange(band: Pick<MuBand, 'range_from' | 'range_to' | 'unit'>): string {
  const u = band.unit?.trim() ? ` ${band.unit.trim()}` : ''
  if (band.range_from === null && band.range_to === null) return 'All values'
  if (band.range_from === null) return `≤ ${fmtNum(band.range_to)}${u}`
  if (band.range_to === null) return `≥ ${fmtNum(band.range_from)}${u}`
  return `${fmtNum(band.range_from)} – ${fmtNum(band.range_to)}${u}`
}

export function formatMuU(band: Pick<MuBand, 'expanded_u' | 'u_unit' | 'unit' | 'k'>): string {
  const u = band.u_unit === '%' ? ' %' : band.unit?.trim() ? ` ${band.unit.trim()}` : ''
  return `± ${fmtNum(band.expanded_u)}${u} (k = ${fmtNum(band.k)})`
}

export type MuBandDraft = {
  rangeFrom: string
  rangeTo: string
  unit: string
  expandedU: string
  uUnit: MuUUnit
  k: string
  confidenceLevel: string
  validFrom: string
  reviewDue: string
  basis: string
  active: boolean
  remarks: string
}

export function emptyMuBandDraft(today: string = isoDate()): MuBandDraft {
  return {
    rangeFrom: '',
    rangeTo: '',
    unit: '',
    expandedU: '',
    uUnit: 'abs',
    k: '2',
    confidenceLevel: '95%',
    validFrom: today,
    reviewDue: addDays(today, 365),
    basis: '',
    active: true,
    remarks: '',
  }
}

export function bandToDraft(b: MuBand): MuBandDraft {
  return {
    rangeFrom: b.range_from === null ? '' : fmtNum(b.range_from),
    rangeTo: b.range_to === null ? '' : fmtNum(b.range_to),
    unit: b.unit ?? '',
    expandedU: fmtNum(b.expanded_u),
    uUnit: b.u_unit,
    k: fmtNum(b.k),
    confidenceLevel: b.confidence_level ?? '',
    validFrom: b.valid_from,
    reviewDue: b.review_due ?? '',
    basis: b.basis ?? '',
    active: b.active,
    remarks: b.remarks ?? '',
  }
}

/** Error message for an invalid draft, or null. Mirrors the table CHECKs. */
export function validateMuBandDraft(d: MuBandDraft): string | null {
  const from = d.rangeFrom.trim() ? toNum(d.rangeFrom) : null
  const to = d.rangeTo.trim() ? toNum(d.rangeTo) : null
  if (d.rangeFrom.trim() && from === null) return 'Range from must be a number.'
  if (d.rangeTo.trim() && to === null) return 'Range to must be a number.'
  if (from !== null && to !== null && from > to) return 'Range from must not be greater than range to.'
  const u = toNum(d.expandedU)
  if (u === null || u < 0) return 'Expanded uncertainty U must be a number ≥ 0.'
  if (d.uUnit === '%' && u > 100) return 'A relative U cannot exceed 100 %.'
  const k = toNum(d.k)
  if (k === null || k <= 0 || k > 10) return 'Coverage factor k must be between 0 and 10.'
  if (!dateOnly(d.validFrom)) return 'Valid from is required.'
  if (d.reviewDue.trim() && !dateOnly(d.reviewDue)) return 'Review due must be a date.'
  if (dateOnly(d.reviewDue) && (dateOnly(d.reviewDue) as string) < (dateOnly(d.validFrom) as string)) {
    return 'Review due cannot be before valid from.'
  }
  return null
}

export function draftToPayload(d: MuBandDraft, testParameterId: string): Record<string, unknown> {
  return {
    test_parameter_id: testParameterId,
    range_from: d.rangeFrom.trim() ? toNum(d.rangeFrom) : null,
    range_to: d.rangeTo.trim() ? toNum(d.rangeTo) : null,
    unit: d.unit.trim() || null,
    expanded_u: toNum(d.expandedU),
    u_unit: d.uUnit,
    k: toNum(d.k) ?? 2,
    confidence_level: d.confidenceLevel.trim() || null,
    valid_from: dateOnly(d.validFrom),
    review_due: dateOnly(d.reviewDue),
    basis: d.basis.trim() || null,
    active: d.active,
    remarks: d.remarks.trim() || null,
  }
}
