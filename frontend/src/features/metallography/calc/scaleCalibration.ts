/**
 * Microscope scale (µm per pixel) from stage micrometer readings
 * (ISO/IEC 17025 6.4, 6.5; design 3.2 metallography_scale_calibrations).
 *
 * This is the browser preview of the calibration guard in migration
 * 20261102101700 (tap_metallography_calibration_guard). The database
 * recomputes and overwrites every value below on save, so the two must agree:
 *   length_px  = round(√(dx² + dy²), 4)            per reading
 *   mean, s    = mean and sample standard deviation (n − 1) of length_px per axis
 *   µm/px      = round(reference_length_um / mean, 6)   per axis
 *   u_rel      = s / mean × 100 per axis; stored round(max(x, y), 4)
 *   ≥ 3 readings per axis; an x reading has |dx| ≥ |dy|, a y reading |dy| ≥ |dx|;
 *   a reading of less than one pixel is refused.
 *
 * Rounding is PostgreSQL numeric round(): half away from zero, judged on the
 * decimal digits (not IS 2 half-even, which is only for reported results).
 *
 * DOM-free: bundled for Node by `npm run validate:calculations` (mgScale, MC-01).
 */
import { toDecimalString } from '@/lib/is2Rounding'
import type { CalibrationReading, ScaleFromReadings } from '../types'

export const MIN_READINGS_PER_AXIS = 3

/**
 * PostgreSQL round(numeric, d): half away from zero on the decimal digits.
 * The number is read through toDecimalString (12 significant digits), so
 * binary noise such as 0.30000000000000004 does not move a half.
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return Number.NaN
  const d = Math.max(0, Math.min(15, Math.round(decimals)))
  const text = toDecimalString(Math.abs(value))
  const [intPart, fracPart = ''] = text.split('.')
  if (fracPart.length <= d) return value < 0 ? -Number(text) : Number(text)
  const kept = BigInt(`${intPart}${fracPart.slice(0, d)}`)
  const up = fracPart.charCodeAt(d) - 48 >= 5
  const digits = (up ? kept + 1n : kept).toString().padStart(d + 1, '0')
  const out = d === 0 ? Number(digits) : Number(`${digits.slice(0, digits.length - d)}.${digits.slice(digits.length - d)}`)
  return value < 0 && out !== 0 ? -out : out
}

/** Length of one reading in pixels, round(√(dx² + dy²), 4); NaN when a coordinate is missing. */
export function readingLengthPx(r: Pick<CalibrationReading, 'x1' | 'y1' | 'x2' | 'y2'>): number {
  const { x1, y1, x2, y2 } = r
  if (![x1, y1, x2, y2].every((v) => typeof v === 'number' && Number.isFinite(v))) return Number.NaN
  return roundHalfAwayFromZero(Math.hypot(x2 - x1, y2 - y1), 4)
}

type AxisStats = { n: number; mean: number | null; s: number | null }

function axisStats(lengths: number[]): AxisStats {
  const n = lengths.length
  if (n === 0) return { n, mean: null, s: null }
  const mean = lengths.reduce((a, b) => a + b, 0) / n
  if (n < 2) return { n, mean, s: null }
  const ss = lengths.reduce((a, v) => a + (v - mean) * (v - mean), 0)
  return { n, mean, s: Math.sqrt(ss / (n - 1)) }
}

/**
 * µm/px, standard deviation and relative uncertainty from the readings.
 * Values are given for an axis as soon as it has one usable reading (s from
 * two), so the form can show a live preview; `errors` lists everything the
 * database would refuse (empty = the calibration can be saved).
 */
export function computeScaleFromReadings(readings: CalibrationReading[], referenceLengthUm: number): ScaleFromReadings {
  const errors: string[] = []
  const refOk = typeof referenceLengthUm === 'number' && Number.isFinite(referenceLengthUm) && referenceLengthUm > 0
  if (!refOk) errors.push('Enter the stage micrometer reference length in µm.')

  const out: CalibrationReading[] = []
  const xs: number[] = []
  const ys: number[] = []
  let missingCoords = 0
  let wrongAxis = 0
  let tooShort = 0

  for (const r of readings) {
    const len = readingLengthPx(r)
    if (!Number.isFinite(len)) {
      missingCoords += 1
      out.push({ ...r })
      continue
    }
    out.push({ ...r, length_px: len })
    const adx = Math.abs(r.x2 - r.x1)
    const ady = Math.abs(r.y2 - r.y1)
    if ((r.axis === 'x' && adx < ady) || (r.axis === 'y' && ady < adx)) wrongAxis += 1
    // The guard tests the unrounded length; √ ≥ 1 is the same test on dx² + dy².
    if ((r.x2 - r.x1) ** 2 + (r.y2 - r.y1) ** 2 < 1) tooShort += 1
    if (r.axis === 'x') xs.push(len)
    else if (r.axis === 'y') ys.push(len)
  }

  if (missingCoords > 0) errors.push('Each reading needs x1, y1, x2, y2 (pixels on the micrometer image).')
  if (wrongAxis > 0) errors.push('An x reading must be drawn along the horizontal axis, a y reading along the vertical axis.')
  if (tooShort > 0) errors.push('A reading is shorter than one pixel.')

  const sx = axisStats(xs)
  const sy = axisStats(ys)
  if (sx.n < MIN_READINGS_PER_AXIS || sy.n < MIN_READINGS_PER_AXIS) {
    errors.push(`At least ${MIN_READINGS_PER_AXIS} readings per axis are needed (x: ${sx.n}, y: ${sy.n}).`)
  }

  const umPerPx = (mean: number | null) =>
    refOk && mean !== null && mean > 0 ? roundHalfAwayFromZero(referenceLengthUm / mean, 6) : null
  const uRel = (st: AxisStats) => (st.mean !== null && st.mean > 0 && st.s !== null ? (st.s / st.mean) * 100 : null)

  const uRelPctX = uRel(sx)
  const uRelPctY = uRel(sy)
  // SQL: round(greatest(coalesce(sx / mx, 0), coalesce(sy / my, 0)) * 100, 4)
  const uRelScalePct =
    sx.mean !== null && sy.mean !== null
      ? roundHalfAwayFromZero(Math.max(uRelPctX ?? 0, uRelPctY ?? 0), 4)
      : null

  return {
    readings: out,
    nX: sx.n,
    nY: sy.n,
    meanPxX: sx.mean,
    meanPxY: sy.mean,
    sPxX: sx.s,
    sPxY: sy.s,
    umPerPxX: umPerPx(sx.mean),
    umPerPxY: umPerPx(sy.mean),
    uRelPctX,
    uRelPctY,
    uRelScalePct,
    errors,
  }
}
