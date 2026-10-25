/**
 * Complaint and satisfaction KPIs (ISO/IEC 17025 7.9, 8.6, 8.9.2; gap P3-6).
 * Pure helpers: computed in the browser from customer_complaints and
 * customer_feedback, so they work before and after the P3 migration.
 */

export type ComplaintKpiInput = {
  received_at: string | null
  acknowledged_at: string | null
  closed_at: string | null
  status: string | null
}

export type FeedbackKpiInput = {
  received_at: string | null
  feedback_type: string | null
  /** 1 - 5, from 20261031100000; absent before it. */
  satisfaction_rating?: number | null
}

export type MonthBucket = { key: string; label: string }

export type ComplaintKpis = {
  months: MonthBucket[]
  complaintsPerMonth: number[]
  total: number
  open: number
  avgDaysToAcknowledge: number | null
  avgDaysToClose: number | null
  acknowledgedCount: number
  closedCount: number
}

export type SatisfactionKpis = {
  /** 'rating' = average satisfaction_rating (1 - 5); 'praise_ratio' = % Praise of Praise + Concern. */
  basis: 'rating' | 'praise_ratio' | 'none'
  perMonth: Array<number | null>
  counts: number[]
  overall: number | null
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The last `count` calendar months up to and including `now` (local time). */
export function lastMonths(count: number, now: Date = new Date()): MonthBucket[] {
  const out: MonthBucket[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    })
  }
  return out
}

function monthKey(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const x = new Date(a).getTime()
  const y = new Date(b).getTime()
  if (Number.isNaN(x) || Number.isNaN(y) || y < x) return null
  return (y - x) / 86_400_000
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

export function computeComplaintKpis(rows: ComplaintKpiInput[], months: MonthBucket[]): ComplaintKpis {
  const index = new Map(months.map((m, i) => [m.key, i]))
  const perMonth = months.map(() => 0)
  const ack: number[] = []
  const close: number[] = []
  let total = 0
  let open = 0
  const inWindow = (k: string | null) => k !== null && index.has(k)
  for (const r of rows) {
    const k = monthKey(r.received_at)
    const status = String(r.status ?? '').trim()
    if (status !== 'Closed' && status !== 'Not Related') open += 1
    if (!inWindow(k)) continue
    total += 1
    perMonth[index.get(k as string) as number] += 1
    const a = daysBetween(r.received_at, r.acknowledged_at)
    if (a !== null) ack.push(a)
    const c = daysBetween(r.received_at, r.closed_at)
    if (c !== null) close.push(c)
  }
  return {
    months,
    complaintsPerMonth: perMonth,
    total,
    open,
    avgDaysToAcknowledge: mean(ack),
    avgDaysToClose: mean(close),
    acknowledgedCount: ack.length,
    closedCount: close.length,
  }
}

export function computeSatisfactionKpis(rows: FeedbackKpiInput[], months: MonthBucket[]): SatisfactionKpis {
  const index = new Map(months.map((m, i) => [m.key, i]))
  const rated = rows.filter(
    (r) => typeof r.satisfaction_rating === 'number' && r.satisfaction_rating >= 1 && r.satisfaction_rating <= 5,
  )
  if (rated.length > 0) {
    const sums = months.map(() => 0)
    const counts = months.map(() => 0)
    const all: number[] = []
    for (const r of rated) {
      const k = monthKey(r.received_at)
      if (k === null || !index.has(k)) continue
      const i = index.get(k) as number
      sums[i] += r.satisfaction_rating as number
      counts[i] += 1
      all.push(r.satisfaction_rating as number)
    }
    return {
      basis: 'rating',
      perMonth: sums.map((s, i) => (counts[i] ? s / counts[i] : null)),
      counts,
      overall: mean(all),
    }
  }
  const praise = months.map(() => 0)
  const concern = months.map(() => 0)
  for (const r of rows) {
    const k = monthKey(r.received_at)
    if (k === null || !index.has(k)) continue
    const i = index.get(k) as number
    const t = String(r.feedback_type ?? '').trim()
    if (t === 'Praise') praise[i] += 1
    else if (t === 'Concern') concern[i] += 1
  }
  const counts = praise.map((p, i) => p + concern[i])
  const totalP = praise.reduce((s, v) => s + v, 0)
  const totalC = concern.reduce((s, v) => s + v, 0)
  if (totalP + totalC === 0) return { basis: 'none', perMonth: months.map(() => null), counts, overall: null }
  return {
    basis: 'praise_ratio',
    perMonth: praise.map((p, i) => (counts[i] ? (p / counts[i]) * 100 : null)),
    counts,
    overall: (totalP / (totalP + totalC)) * 100,
  }
}
