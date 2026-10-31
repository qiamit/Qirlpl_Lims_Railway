/**
 * Multi-field statistics for metallography results (ASTM E112 / ISO 643
 * practice: report the mean of the fields with its 95 % confidence interval
 * and % relative accuracy).
 *
 *   mean = Σx / n
 *   s    = √(Σ(x − mean)² / (n − 1))
 *   CI95 = t95(n − 1) × s / √n
 *   %RA  = CI95 / mean × 100
 *
 * Full precision is returned; rounding is for display only (case MC-02:
 * 10, 12, 11, 13, 9 → mean 11.000, s 1.581, CI95 1.963, %RA 17.8).
 *
 * DOM-free: bundled for Node by `npm run validate:calculations` (mgStats).
 */
import type { FieldStatistics } from '../types'

/**
 * Two-sided 95 % Student t (p = 0.975), 3 decimals, df 1–30 as printed in
 * statistics tables (and ASTM E112 / E1382).
 */
const T95_TABLE: readonly number[] = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]

/**
 * Beyond df 30 the printed tables give 40, 60 and 120. Between two printed
 * rows the value of the LOWER df is used (a slightly wider, conservative
 * interval); above 120 the normal value 1.96 is used. The difference from the
 * exact t is below 0.03 everywhere above df 30.
 */
const T95_LARGE_DF: ReadonlyArray<readonly [number, number]> = [
  [120, 1.98],
  [60, 2.0],
  [40, 2.021],
  [30, 2.042],
]

/** Two-sided 95 % Student t for df ≥ 1 (NaN for df < 1 or not a whole number). */
export function studentT95(df: number): number {
  if (!Number.isInteger(df) || df < 1) return Number.NaN
  if (df <= T95_TABLE.length) return T95_TABLE[df - 1]
  if (df > 120) return 1.96
  for (const [rowDf, t] of T95_LARGE_DF) {
    if (df >= rowDf) return t
  }
  return T95_TABLE[T95_TABLE.length - 1]
}

/**
 * n, mean, s, t95, CI95 and %RA of the field values. Non-finite values are
 * ignored. With one value only the mean is given; with none, everything is null.
 * %RA is null when the mean is 0.
 */
export function fieldStatistics(values: number[]): FieldStatistics {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  const n = xs.length
  if (n === 0) return { n, mean: null, s: null, t95: null, ci95: null, relativeAccuracyPct: null }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  if (n < 2) return { n, mean, s: null, t95: null, ci95: null, relativeAccuracyPct: null }
  const ss = xs.reduce((a, v) => a + (v - mean) * (v - mean), 0)
  const s = Math.sqrt(ss / (n - 1))
  const t95 = studentT95(n - 1)
  const ci95 = (t95 * s) / Math.sqrt(n)
  const relativeAccuracyPct = mean !== 0 ? (ci95 / Math.abs(mean)) * 100 : null
  return { n, mean, s, t95, ci95, relativeAccuracyPct }
}
