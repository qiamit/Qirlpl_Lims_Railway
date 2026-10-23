/**
 * Rounding of reported values per IS 2:1960 "Rules for rounding off numerical
 * values" (lab decision, 23 Oct 2026).
 *
 *   - The digits dropped are looked at as written in decimal, never through
 *     binary floating point: 1.015 → 1.02 and 0.0125 → 0.012 (not 1.01 / 0.013
 *     as Number.prototype.toFixed gives).
 *   - Dropped part greater than half a unit of the last kept place → round up;
 *     less than half → leave the kept digits unchanged.
 *   - Dropped part exactly half (a 5 followed by nothing or only zeros) → round
 *     to the even digit: 2.25 → 2.2, 2.35 → 2.4, 2.5 → 2, 3.5 → 4.
 *     A 5 followed by any non-zero digit is more than half: 2.251 → 2.3.
 *   - Negative values are rounded by magnitude: −2.25 → −2.2.
 *   - The rounded value keeps the declared number of decimals; trailing zeros
 *     are significant (10.2 to 2 decimals is "10.20").
 *   - Rounding to an interval (e.g. 0.5 or 5 units) picks the nearest
 *     multiple, and the even multiple when the value lies exactly half way.
 *
 * Use these helpers only where a value is reported or displayed. Calculations
 * that feed further calculations keep full precision.
 *
 * Numbers are read through their 12-significant-digit decimal form, so the
 * noise of binary arithmetic (including the digits lost when two close values
 * are subtracted) is removed before rounding: 5 − 4.9865 is
 * 0.013499999999999623 in binary and is rounded as 0.0135 → 0.014. Twelve
 * significant digits is far more than any reported value carries; a number
 * rounded to more than about 11 significant digits should be passed as a
 * string. Numeric strings are read exactly as written.
 */

type ParsedDecimal = {
  negative: boolean
  /** Integer digits without leading zeros ("0" when none). */
  int: string
  /** Fraction digits as written (may have trailing zeros). */
  frac: string
}

const MAX_DECIMALS = 20
/** Significant digits a binary number is read with (removes floating-point noise). */
const NUMBER_SIGNIFICANT_DIGITS = 12
const MAX_EXPONENT = 400
const DECIMAL_RE = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

function clampDecimals(decimals: number): number {
  if (!Number.isFinite(decimals)) return 0
  return Math.min(MAX_DECIMALS, Math.max(0, Math.round(decimals)))
}

function parseDecimalText(text: string): ParsedDecimal | null {
  const m = DECIMAL_RE.exec(text.trim())
  if (!m) return null
  const intRaw = m[2] ?? ''
  const fracRaw = m[3] ?? ''
  if (!intRaw && !fracRaw) return null
  const exp = m[4] ? Number.parseInt(m[4], 10) : 0
  if (!Number.isFinite(exp) || Math.abs(exp) > MAX_EXPONENT) return null
  let digits = intRaw + fracRaw
  let point = intRaw.length + exp
  if (point < 0) {
    digits = '0'.repeat(-point) + digits
    point = 0
  }
  if (point > digits.length) digits += '0'.repeat(point - digits.length)
  const int = digits.slice(0, point).replace(/^0+/, '') || '0'
  return { negative: m[1] === '-', int, frac: digits.slice(point) }
}

function parseInput(value: number | string): ParsedDecimal | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    if (value === 0) return { negative: false, int: '0', frac: '' }
    return parseDecimalText(value.toPrecision(NUMBER_SIGNIFICANT_DIGITS))
  }
  if (typeof value !== 'string') return null
  return parseDecimalText(value)
}

/** Add one to a string of decimal digits ("199" → "200", "99" → "100"). */
function incrementDigits(digits: string): string {
  const out = digits.split('')
  let i = out.length - 1
  while (i >= 0) {
    if (out[i] === '9') {
      out[i] = '0'
      i -= 1
    } else {
      out[i] = String(Number(out[i]) + 1)
      return out.join('')
    }
  }
  return `1${out.join('')}`
}

function assemble(negative: boolean, int: string, frac: string): string {
  const intClean = int.replace(/^0+(?=\d)/, '') || '0'
  const isZero = /^0*$/.test(intClean) && /^0*$/.test(frac)
  const sign = negative && !isZero ? '-' : ''
  return frac ? `${sign}${intClean}.${frac}` : `${sign}${intClean}`
}

function roundParsed(p: ParsedDecimal, decimals: number): string {
  const d = clampDecimals(decimals)
  if (p.frac.length <= d) return assemble(p.negative, p.int, p.frac.padEnd(d, '0'))

  const kept = p.int + p.frac.slice(0, d)
  const first = p.frac.charCodeAt(d) - 48
  const restNonZero = /[1-9]/.test(p.frac.slice(d + 1))
  const lastKeptOdd = (kept.charCodeAt(kept.length - 1) - 48) % 2 === 1
  const up = first > 5 || (first === 5 && (restNonZero || lastKeptOdd))

  const digits = up ? incrementDigits(kept) : kept
  const intLen = digits.length - d
  return assemble(p.negative, digits.slice(0, intLen), digits.slice(intLen))
}

/**
 * Shortest plain decimal text of a number (no exponent), with binary noise
 * removed: 0.1 + 0.2 → "0.3", 1e-7 → "0.0000001". Use it where a value is
 * shown or carried at full precision (e.g. a reading put back into an input).
 */
export function toDecimalString(value: number): string {
  const p = parseInput(value)
  if (!p) return ''
  return assemble(p.negative, p.int, p.frac.replace(/0+$/, ''))
}

/**
 * IS 2 rounding to `decimals` places, keeping trailing zeros:
 * is2RoundFixed(10.2, 2) → "10.20"; is2RoundFixed(2.25, 1) → "2.2".
 * Returns "" for a value that is not a finite number.
 */
export function is2RoundFixed(value: number | string, decimals: number): string {
  const p = parseInput(value)
  if (!p) return ''
  return roundParsed(p, decimals)
}

/** IS 2 rounding to `decimals` places as a number (NaN when not a number). */
export function is2Round(value: number | string, decimals: number): number {
  const s = is2RoundFixed(value, decimals)
  return s ? Number(s) : Number.NaN
}

/**
 * IS 2 rounding to `decimals` places without trailing zeros (10.2 → "10.2").
 * Only for places that never declared a number of decimals (e.g. an automatic
 * precision); reported results use is2RoundFixed.
 */
export function is2RoundCompact(value: number | string, decimals: number): string {
  const s = is2RoundFixed(value, decimals)
  if (!s.includes('.')) return s
  const trimmed = s.replace(/\.?0+$/, '')
  return trimmed === '-0' ? '0' : trimmed
}

/**
 * IS 2 rounding to a multiple of `interval` (e.g. 0.5, 0.02, 5): the nearest
 * multiple, the even multiple when exactly half way. The result has as many
 * decimals as the interval: is2RoundToInterval(2.25, 0.5) → "2.0",
 * is2RoundToInterval(2.75, 0.5) → "3.0". Returns "" when the value or the
 * interval is not a finite number, or the interval is not positive.
 */
export function is2RoundToInterval(value: number | string, interval: number | string): string {
  const v = parseInput(value)
  const step = parseInput(interval)
  if (!v || !step || step.negative) return ''
  const stepFrac = step.frac.replace(/0+$/, '')
  const scale = Math.max(v.frac.length, stepFrac.length)
  const toUnits = (p: ParsedDecimal, frac: string) => BigInt(p.int + frac.padEnd(scale, '0'))
  const stepUnits = toUnits(step, stepFrac)
  if (stepUnits === 0n) return ''
  const valueUnits = toUnits(v, v.frac)
  let q = valueUnits / stepUnits
  const twiceRest = (valueUnits % stepUnits) * 2n
  if (twiceRest > stepUnits || (twiceRest === stepUnits && q % 2n === 1n)) q += 1n
  const units = (q * stepUnits).toString().padStart(scale + 1, '0')
  const int = units.slice(0, units.length - scale)
  const frac = units.slice(units.length - scale).slice(0, stepFrac.length)
  return assemble(v.negative, int, frac)
}
