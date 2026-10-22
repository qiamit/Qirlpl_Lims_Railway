/**
 * Control charts for internal quality control (ISO/IEC 17025 7.7.1 d, 7.7.3).
 *
 * Pure functions only (no imports at run time) so they can be unit tested
 * with plain Node. Three parts:
 *   1. number / criterion / limit parsing from free text,
 *   2. X-chart limits (statistical mean ± 2SD / 3SD, or fixed from a reference
 *      value ± acceptance criterion, or from UCL / LCL) and Westgard rules,
 *   3. extracting chartable values from result_validity_checks.check_data.
 *
 * check_data shapes supported (keys written by ResultValidityCheckFormFields):
 *   7_7_a reference material   observed_value  (reference: expected_value)
 *   7_7_b alternate instrument result_alternate − result_primary, else difference (reference 0)
 *   7_7_d control chart         reading         (limits: control_limits "UCL x / LCL y",
 *                                                "x - y", "c ± h"; reference: reference_value)
 *   7_7_e intermediate check    observed_value  (reference: reference_value)
 *   7_7_f replicates            mean_value, else mean of replicate_values "1.2, 1.3; 1.4"
 *   7_7_g retest                retest_parameters[]: one point per parameter,
 *                                                newResult (reference: oldResult)
 *   7_7_h correlation           result_set_b (reference: result_set_a), single numbers only
 *   7_7_j intralab              z_score (fixed limits ±2 / ±3), else result_b − result_a
 *   7_7_k blind sample          reported_result (reference: revealed_expected)
 *   any type (fallback)         value / result / reading / observed_value / observed /
 *                                measured_value / mean_value; arrays of numbers -> mean;
 *                                reference_value / expected_value / assigned_value / target / nominal
 * Values are parsed from strings with units ("225.4 m²/kg"), decimal commas
 * ("1,25") and thousands separators ("1,250.5"). Text that holds no number
 * ("Pass", "OK") is skipped.
 */

// ---------------------------------------------------------------------------
// 1. Parsing
// ---------------------------------------------------------------------------

const NUMBER_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/

/** First number in a value ("225.4 g" -> 225.4, "1,25" -> 1.25, "1,250.5" -> 1250.5). */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[−–]/g, '-')
  if (!s) return null
  if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.')
  else s = s.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1')
  const m = s.match(NUMBER_RE)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** All numbers in a list such as "1.2, 1.3; 1.4" or [1.2, "1.3"]. */
export function parseNumberList(v: unknown): number[] {
  if (Array.isArray(v)) {
    return v.map(parseNumber).filter((n): n is number => n !== null)
  }
  if (typeof v === 'number') return Number.isFinite(v) ? [v] : []
  if (typeof v !== 'string') return []
  return v
    .split(/[;,\s\n]+/)
    .map((p) => parseNumber(p))
    .filter((n): n is number => n !== null)
}

export type AcceptanceCriterion = { value: number; percent: boolean }

/** "± 0.5 g", "+/- 2 %", "0.5", "within ±2%" -> half-width; "Within uncertainty limit" -> null. */
export function parseAcceptanceCriterion(text: unknown): AcceptanceCriterion | null {
  if (typeof text === 'number') return Number.isFinite(text) && text !== 0 ? { value: Math.abs(text), percent: false } : null
  if (typeof text !== 'string') return null
  const s = text.trim()
  if (!s) return null
  const m = s.match(/(?:±|\+\s*\/\s*-|\+-)\s*(\d+(?:[.,]\d+)?)\s*(%)?/) ?? s.match(/^\s*(\d+(?:[.,]\d+)?)\s*(%)?\s*[a-zA-Z°µ/²³%]*\s*$/)
  if (!m) return null
  const value = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(value) || value === 0) return null
  return { value: Math.abs(value), percent: m[2] === '%' }
}

export type UclLcl = { ucl: number; lcl: number }

/** "UCL 1.02 / LCL 0.98", "LCL 0.98, UCL 1.02", "0.98 - 1.02", "0.98 to 1.02", "1.00 ± 0.02". */
export function parseControlLimits(text: unknown): UclLcl | null {
  if (typeof text !== 'string') return null
  const s = text.replace(/[−–]/g, '-').trim()
  if (!s) return null
  const num = String.raw`([-+]?(?:\d+\.?\d*|\.\d+))`
  const ucl = s.match(new RegExp(String.raw`UCL\s*[:=]?\s*` + num, 'i'))
  const lcl = s.match(new RegExp(String.raw`LCL\s*[:=]?\s*` + num, 'i'))
  if (ucl && lcl) {
    const u = Number(ucl[1])
    const l = Number(lcl[1])
    if (Number.isFinite(u) && Number.isFinite(l) && u !== l) return { ucl: Math.max(u, l), lcl: Math.min(u, l) }
  }
  const pm = s.match(new RegExp(num + String.raw`\s*(?:±|\+\s*\/\s*-|\+-)\s*` + num))
  if (pm) {
    const c = Number(pm[1])
    const h = Math.abs(Number(pm[2]))
    if (Number.isFinite(c) && Number.isFinite(h) && h > 0) return { ucl: c + h, lcl: c - h }
  }
  const range = s.match(new RegExp(num + String.raw`\s*(?:-|to)\s*` + num, 'i'))
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return { ucl: Math.max(a, b), lcl: Math.min(a, b) }
  }
  return null
}

// ---------------------------------------------------------------------------
// 2. Limits and Westgard rules
// ---------------------------------------------------------------------------

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Sample standard deviation (n − 1). */
export function sampleSd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs) as number
  const ss = xs.reduce((a, x) => a + (x - m) * (x - m), 0)
  return Math.sqrt(ss / (xs.length - 1))
}

export type LimitMode = 'statistical' | 'fixed'

export type ChartLimits = {
  mode: LimitMode
  center: number
  /** SD used for zones and Westgard rules (fixed limits: half-width / 3). */
  sd: number
  warnLow: number
  warnHigh: number
  actionLow: number
  actionHigh: number
  /** Points used to compute statistical limits. */
  baselineCount?: number
}

function build(mode: LimitMode, center: number, sd: number, baselineCount?: number): ChartLimits {
  return {
    mode,
    center,
    sd,
    warnLow: center - 2 * sd,
    warnHigh: center + 2 * sd,
    actionLow: center - 3 * sd,
    actionHigh: center + 3 * sd,
    ...(baselineCount !== undefined ? { baselineCount } : {}),
  }
}

/**
 * Mean ± 2SD (warning) and ± 3SD (action) from the first `baselineCount`
 * values (all when omitted / larger than the data). Null with fewer than two
 * values or no spread.
 */
export function statisticalLimits(values: number[], baselineCount?: number): ChartLimits | null {
  const n = baselineCount && baselineCount > 0 ? Math.min(Math.floor(baselineCount), values.length) : values.length
  const base = values.slice(0, n)
  const m = mean(base)
  const sd = sampleSd(base)
  if (m === null || sd === null || !(sd > 0)) return null
  return build('statistical', m, sd, base.length)
}

/**
 * Fixed limits from a reference value ± acceptance criterion: the criterion is
 * the action limit (±3 "SD"), the warning limit is two thirds of it (±2 "SD").
 */
export function fixedLimits(reference: number, criterion: AcceptanceCriterion): ChartLimits | null {
  if (!Number.isFinite(reference)) return null
  const half = criterion.percent ? Math.abs(reference) * (criterion.value / 100) : criterion.value
  if (!(half > 0)) return null
  return build('fixed', reference, half / 3)
}

/** Fixed limits from UCL / LCL (taken as the ±3SD action limits). */
export function limitsFromUclLcl(limits: UclLcl): ChartLimits | null {
  const half = (limits.ucl - limits.lcl) / 2
  if (!(half > 0)) return null
  return build('fixed', (limits.ucl + limits.lcl) / 2, half / 3)
}

export type WestgardRule = '1-2s' | '1-3s' | '2-2s' | 'R-4s' | '4-1s' | '10-x'

/** Rules that reject a run. 1-2s is a warning only. */
export const REJECTION_RULES: readonly WestgardRule[] = ['1-3s', '2-2s', 'R-4s', '4-1s', '10-x']

export const WESTGARD_RULE_TEXT: Record<WestgardRule, string> = {
  '1-2s': 'One point beyond ±2SD (warning)',
  '1-3s': 'One point beyond ±3SD (action limit)',
  '2-2s': 'Two consecutive points beyond 2SD on the same side',
  'R-4s': 'Two consecutive points, one beyond +2SD and the other beyond −2SD',
  '4-1s': 'Four consecutive points beyond 1SD on the same side',
  '10-x': 'Ten consecutive points on the same side of the mean',
}

export type Zone = 'in' | 'warning' | 'action'

export type PointEvaluation = {
  z: number
  zone: Zone
  /** Rules completed at this point (the point that makes the rule true). */
  rules: WestgardRule[]
  /** Any rejection rule (not only 1-2s). */
  rejected: boolean
}

function zOf(x: number, limits: ChartLimits): number {
  const z = (x - limits.center) / limits.sd
  // Avoid 2.0000000000004 deciding a rule.
  return Math.round(z * 1e9) / 1e9
}

/** Westgard multirule evaluation of a time-ordered series. */
export function evaluateWestgard(values: number[], limits: ChartLimits): PointEvaluation[] {
  const z = values.map((x) => zOf(x, limits))
  return z.map((zi, i) => {
    const rules: WestgardRule[] = []
    const az = Math.abs(zi)
    if (az > 2) rules.push('1-2s')
    if (az > 3) rules.push('1-3s')
    if (i >= 1) {
      const zp = z[i - 1]
      if ((zi > 2 && zp > 2) || (zi < -2 && zp < -2)) rules.push('2-2s')
      if ((zi > 2 && zp < -2) || (zi < -2 && zp > 2)) rules.push('R-4s')
    }
    if (i >= 3) {
      const w = z.slice(i - 3, i + 1)
      if (w.every((v) => v > 1) || w.every((v) => v < -1)) rules.push('4-1s')
    }
    if (i >= 9) {
      const w = z.slice(i - 9, i + 1)
      if (w.every((v) => v > 0) || w.every((v) => v < 0)) rules.push('10-x')
    }
    const zone: Zone = az > 3 ? 'action' : az > 2 ? 'warning' : 'in'
    return { z: zi, zone, rules, rejected: rules.some((r) => r !== '1-2s') }
  })
}

export type ChartSummary = {
  n: number
  mean: number | null
  sd: number | null
  cvPercent: number | null
  min: number | null
  max: number | null
  last: number | null
  beyondWarning: number
  beyondAction: number
  rejectedPoints: number
  ruleCounts: Record<WestgardRule, number>
}

export function summarize(values: number[], evals: PointEvaluation[]): ChartSummary {
  const m = mean(values)
  const sd = sampleSd(values)
  const ruleCounts: Record<WestgardRule, number> = { '1-2s': 0, '1-3s': 0, '2-2s': 0, 'R-4s': 0, '4-1s': 0, '10-x': 0 }
  for (const e of evals) for (const r of e.rules) ruleCounts[r] += 1
  return {
    n: values.length,
    mean: m,
    sd,
    cvPercent: m !== null && sd !== null && m !== 0 ? (sd / Math.abs(m)) * 100 : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    last: values.length ? values[values.length - 1] : null,
    beyondWarning: evals.filter((e) => e.zone !== 'in').length,
    beyondAction: evals.filter((e) => e.zone === 'action').length,
    rejectedPoints: evals.filter((e) => e.rejected).length,
    ruleCounts,
  }
}

// ---------------------------------------------------------------------------
// 3. Extracting values from result_validity_checks
// ---------------------------------------------------------------------------

export type CheckRowLike = {
  id: string
  checkType: string
  testParameterName?: string | null
  checkData: Record<string, unknown> | null | undefined
}

export type ExtractedPoint = {
  rowId: string
  /** Parameter / measurand the value belongs to. */
  parameter: string
  value: number
  reference: number | null
  /** UCL / LCL written on the check (7_7_d). */
  limits: UclLcl | null
  /** check_data key(s) the value came from. */
  source: string
  /** Value is a z-score / En number (fixed limits ±2 / ±3 apply). */
  isScore?: boolean
}

const VALUE_KEYS = ['value', 'result', 'reading', 'observed_value', 'observed', 'measured_value', 'mean_value']
const REFERENCE_KEYS = ['reference_value', 'expected_value', 'assigned_value', 'target', 'nominal']

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function text(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

function firstNumber(data: Record<string, unknown>, keys: string[]): { value: number; key: string } | null {
  for (const key of keys) {
    const raw = data[key]
    if (Array.isArray(raw)) {
      const m = mean(parseNumberList(raw))
      if (m !== null) return { value: m, key }
      continue
    }
    const n = parseNumber(raw)
    if (n !== null) return { value: n, key }
  }
  return null
}

/** Chartable values of one validity check (usually one; 7_7_g: one per retested parameter). */
export function extractCheckPoints(row: CheckRowLike): ExtractedPoint[] {
  const d = rec(row.checkData)
  const param =
    text(row.testParameterName) ||
    text(d.parameter) ||
    text(d.test_parameter) ||
    text(d.working_standard) ||
    text(d.control_chart_ref) ||
    text(d.material_batch) ||
    '(no parameter)'
  const point = (value: number, reference: number | null, source: string, extra?: Partial<ExtractedPoint>): ExtractedPoint => ({
    rowId: row.id,
    parameter: param,
    value,
    reference,
    limits: null,
    source,
    ...extra,
  })
  const ref = (keys: string[]) => firstNumber(d, keys)?.value ?? null

  switch (row.checkType) {
    case '7_7_a': {
      const v = firstNumber(d, ['observed_value', ...VALUE_KEYS])
      if (v) return [point(v.value, ref(['expected_value', ...REFERENCE_KEYS]), v.key)]
      break
    }
    case '7_7_b': {
      const p = parseNumber(d.result_primary)
      const a = parseNumber(d.result_alternate)
      if (p !== null && a !== null) return [point(a - p, 0, 'result_alternate − result_primary')]
      const diff = parseNumber(d.difference)
      if (diff !== null) return [point(diff, 0, 'difference')]
      break
    }
    case '7_7_d': {
      const v = firstNumber(d, ['reading', ...VALUE_KEYS])
      if (v) {
        return [point(v.value, ref(REFERENCE_KEYS), v.key, { limits: parseControlLimits(d.control_limits) })]
      }
      break
    }
    case '7_7_e': {
      const v = firstNumber(d, ['observed_value', ...VALUE_KEYS])
      if (v) return [point(v.value, ref(['reference_value', ...REFERENCE_KEYS]), v.key)]
      break
    }
    case '7_7_f': {
      const m = parseNumber(d.mean_value)
      if (m !== null) return [point(m, ref(REFERENCE_KEYS), 'mean_value')]
      const reps = mean(parseNumberList(d.replicate_values))
      if (reps !== null) return [point(reps, ref(REFERENCE_KEYS), 'mean of replicate_values')]
      break
    }
    case '7_7_g': {
      const list = Array.isArray(d.retest_parameters) ? d.retest_parameters : []
      const out: ExtractedPoint[] = []
      for (const raw of list) {
        const e = rec(raw)
        const nv = parseNumber(e.newResult ?? e.new_result)
        if (nv === null) continue
        out.push({
          rowId: row.id,
          parameter: text(e.testName) || text(e.test_name) || param,
          value: nv,
          reference: parseNumber(e.oldResult ?? e.old_result),
          limits: null,
          source: 'retest_parameters.newResult',
        })
      }
      if (out.length) return out
      break
    }
    case '7_7_h': {
      const a = parseNumberList(d.result_set_a)
      const b = parseNumberList(d.result_set_b)
      if (a.length === 1 && b.length === 1) return [point(b[0], a[0], 'result_set_b')]
      break
    }
    case '7_7_j': {
      const z = parseNumber(d.z_score)
      if (z !== null) return [point(z, 0, 'z_score', { isScore: true, limits: { ucl: 3, lcl: -3 } })]
      const a = parseNumber(d.result_a)
      const b = parseNumber(d.result_b)
      if (a !== null && b !== null) return [point(b - a, 0, 'result_b − result_a')]
      break
    }
    case '7_7_k': {
      const v = firstNumber(d, ['reported_result', ...VALUE_KEYS])
      if (v) return [point(v.value, ref(['revealed_expected', ...REFERENCE_KEYS]), v.key)]
      break
    }
    default:
      break
  }
  const v = firstNumber(d, VALUE_KEYS)
  if (v) return [point(v.value, ref(REFERENCE_KEYS), v.key, { limits: parseControlLimits(d.control_limits) })]
  return []
}

/** Most frequent non-null number (ties: the latest), for prefilling the reference value. */
export function modeOf(values: Array<number | null | undefined>): number | null {
  const counts = new Map<number, number>()
  let best: number | null = null
  let bestCount = 0
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    const c = (counts.get(v) ?? 0) + 1
    counts.set(v, c)
    if (c >= bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

/** Compact number for chart labels and tables (6 significant digits, exponent for extremes). */
export function formatChartNumber(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(3)
  return String(Number(v.toPrecision(digits + 2)))
}
