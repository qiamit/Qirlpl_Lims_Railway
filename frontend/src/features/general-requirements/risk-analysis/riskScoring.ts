/** Likelihood x severity scoring shared by the risk register and its heat map (1-5 each, score 1-25). */

export type RiskBand = 'High' | 'Medium' | 'Low'

export const RISK_SCALE = ['1', '2', '3', '4', '5']

export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: 'Rare',
  2: 'Unlikely',
  3: 'Possible',
  4: 'Likely',
  5: 'Almost certain',
}

export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Negligible',
  2: 'Minor',
  3: 'Moderate',
  4: 'Major',
  5: 'Severe',
}

/** Same bands as the impartiality register: >= 15 High, >= 8 Medium, else Low. */
export function riskBand(score: number | null | undefined): RiskBand | '' {
  if (score == null || !Number.isFinite(score) || score <= 0) return ''
  if (score >= 15) return 'High'
  if (score >= 8) return 'Medium'
  return 'Low'
}

/** 1-5 or null from a stored value / form value. */
export function scaleValue(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

export function scoreOf(likelihood: unknown, severity: unknown): number | null {
  const l = scaleValue(likelihood)
  const s = scaleValue(severity)
  return l == null || s == null ? null : l * s
}

export const riskBandClass: Record<RiskBand, string> = {
  High: 'border-red-700/40 bg-red-100 text-red-800',
  Medium: 'border-amber-700/40 bg-amber-100 text-amber-900',
  Low: 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
}

/** Heat map cell background by band. */
export const riskCellClass: Record<RiskBand, string> = {
  High: 'bg-red-200/90 hover:bg-red-300 text-red-950',
  Medium: 'bg-amber-200/90 hover:bg-amber-300 text-amber-950',
  Low: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950',
}

export const REVIEW_FREQUENCIES = ['Monthly', 'Quarterly', 'Half-yearly', 'Annually']

export const RISK_SOURCE_TYPES = [
  'Process',
  'Complaint',
  'Nonconformity',
  'Internal audit',
  'Impartiality',
  'Management review',
  'External issue',
  'Other',
]

const FREQUENCY_MONTHS: Record<string, number> = {
  Monthly: 1,
  Quarterly: 3,
  'Half-yearly': 6,
  Annually: 12,
}

function addMonthsIso(iso: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, Number(m[3])))
  // Postgres date + interval clamps to the month end (31 Jan + 1 month = 28/29 Feb).
  const wantMonth = (Number(m[2]) - 1 + months) % 12
  if (d.getUTCMonth() !== (wantMonth + 12) % 12) d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

/** Next review the database will set when the field is left blank (same rule as the trigger). */
export function suggestedNextReview(form: Record<string, string | boolean>): string {
  const months = FREQUENCY_MONTHS[String(form.review_frequency ?? '')]
  if (!months) return ''
  const base = String(form.last_reviewed_on || form.identified_at || '').slice(0, 10)
  return base ? addMonthsIso(base, months) : ''
}

export function isReviewOverdue(nextReview: unknown, status: unknown): boolean {
  const d = String(nextReview ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  if (String(status ?? '') === 'Closed') return false
  return d < new Date().toISOString().slice(0, 10)
}

export type HeatMapMode = 'inherent' | 'residual'

export type HeatCell = { likelihood: number; severity: number }

/** L / S of a risk register row for the chosen mode, or null when not scored. */
export function riskRowCell(row: Record<string, unknown>, mode: HeatMapMode): HeatCell | null {
  const l = scaleValue(mode === 'inherent' ? row.likelihood : row.residual_likelihood)
  const s = scaleValue(mode === 'inherent' ? row.severity : row.residual_severity)
  return l == null || s == null ? null : { likelihood: l, severity: s }
}

/** Rows that belong on the heat map: risks (not opportunities), optionally open only. */
export function isHeatMapRow(row: Record<string, unknown>, openOnly: boolean): boolean {
  if (String(row.item_type ?? 'Risk') !== 'Risk') return false
  if (openOnly && String(row.status ?? '') === 'Closed') return false
  return true
}

