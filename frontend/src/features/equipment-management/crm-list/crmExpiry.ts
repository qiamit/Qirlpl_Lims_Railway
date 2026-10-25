/**
 * CRM expiry after opening, storage and stock (ISO/IEC 17025 6.4 / 6.5,
 * gap P3-5). Columns from 20261031100000_p3_good_practice.sql; the same rule
 * is in the SQL function crm_expiry_alerts().
 *
 * Effective expiry = the earlier of the certificate validity (valid_upto)
 * and opened_on + post_opening_validity_days.
 */

export type CrmExpiryStatus = 'expired' | 'expiring' | 'ok' | 'none'

export type CrmUseFields = {
  valid_upto?: string | null
  opened_on?: string | null
  post_opening_validity_days?: number | string | null
  stock_quantity?: number | string | null
  reorder_level?: number | string | null
}

export type CrmExpiryInfo = {
  openExpiry: string | null
  effectiveExpiry: string | null
  daysLeft: number | null
  status: CrmExpiryStatus
  lowStock: boolean
}

/** Days before expiry when a CRM counts as "expiring". */
export const CRM_EXPIRY_WARN_DAYS = 30

function dateOnly(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)))
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function crmExpiryInfo(
  row: CrmUseFields,
  today: string = localToday(),
  warnDays: number = CRM_EXPIRY_WARN_DAYS,
): CrmExpiryInfo {
  const valid = dateOnly(row.valid_upto)
  const opened = dateOnly(row.opened_on)
  const days = num(row.post_opening_validity_days)
  const openExpiry = opened && days !== null ? addDays(opened, Math.trunc(days)) : null
  const effectiveExpiry =
    valid && openExpiry ? (valid < openExpiry ? valid : openExpiry) : (valid ?? openExpiry)
  const daysLeft = effectiveExpiry ? daysBetween(today, effectiveExpiry) : null
  const status: CrmExpiryStatus =
    daysLeft === null ? 'none' : daysLeft < 0 ? 'expired' : daysLeft <= warnDays ? 'expiring' : 'ok'
  const stock = num(row.stock_quantity)
  const reorder = num(row.reorder_level)
  return {
    openExpiry,
    effectiveExpiry,
    daysLeft,
    status,
    lowStock: stock !== null && reorder !== null && stock <= reorder,
  }
}

/** True for rows the "Expiring / expired" filter keeps (also low stock). */
export function needsCrmAttention(info: CrmExpiryInfo): boolean {
  return info.status === 'expired' || info.status === 'expiring' || info.lowStock
}
