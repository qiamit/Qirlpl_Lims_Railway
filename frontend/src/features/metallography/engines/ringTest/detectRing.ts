/**
 * Ring test edge detection (proposals only; the analyst confirms or moves
 * every edge before anything is measured).
 *
 * Port of the Metallurgy Software `lib/ring-test/analysis/detect-ring.ts`
 * (radial light→dark scans for the hole edge, dark→light scans for the outer
 * skin, outlier rejection, peak-preserving smoothing, circle-or-polygon
 * decision). Changes in the port (design 3.6):
 *   - input is a GrayImage at ORIGINAL resolution and aspect ratio, not a
 *     canvas drawn with document.createElement('canvas'); DOM-free, so it runs
 *     in the Web Worker and in Node;
 *   - the working copy is an area-average downscale with the same factor on
 *     both axes (the old code drew the image into a canvas; the editor itself
 *     stretched it to 590×590);
 *   - results come back as RingShape in original pixels (a polygon carries its
 *     points, not offsets from a circle);
 *   - detecting the outer edge also detects the inner one when none is given,
 *     and the outer edge stays concentric with the inner one (old behaviour);
 *   - the hole centre is refined by a least-squares circle fit of the edge
 *     points (the old median-of-coordinates step always returned the seed).
 * Grey values use LUMA_WEIGHTS (same as the old 0.299 R + 0.587 G + 0.114 B),
 * here already applied by rgbaToGray.
 *
 * The scan thresholds are the old code's, unchanged.
 */
import {
  MAX_ENGINE_PIXELS,
  type DetectRingFn,
  type DetectRingOptions,
  type DetectRingResult,
  type GrayImage,
  type Point,
  type RingShape,
} from '../types'
import { shapeMeanRadiusPx } from './ringMaths'

type Circle = { cx: number; cy: number; r: number }

/** Working image (downscaled, smoothed) and its factors to original pixels. */
type Working = {
  gray: Float32Array
  w: number
  h: number
  /** working px per original px along x / y, and their mean for radii. */
  sx: number
  sy: number
  s: number
}

type EdgeFinder = (
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
) => number | null

type Detected = { ok: true; shape: RingShape } | { ok: false; reason: string }

/** Old defaults: inner scan at most 420 px, outer at most 520 px; 36 / 48 polygon points. */
const INNER_WORKING_SIZE = 420
const OUTER_WORKING_SIZE = 520
const INNER_SIDES = 36
const OUTER_SIDES = 48
/** Relative spread of the radii below which the edge is kept as a circle. */
const INNER_CIRCLE_TOLERANCE = 0.035
const OUTER_CIRCLE_TOLERANCE = 0.025
const MIN_IMAGE_SIDE = 48

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const detectRing: DetectRingFn = (image: GrayImage, opts: DetectRingOptions): DetectRingResult => {
  const warnings: string[] = []
  const problem = checkImage(image)
  if (problem) return { inner: null, outer: null, warnings: [problem] }

  const existingInner = opts.existing?.inner ?? null
  const existingOuter = opts.existing?.outer ?? null
  let inner: RingShape | null = null
  let outer: RingShape | null = null

  const wantInner = opts.which === 'inner' || opts.which === 'both' || (opts.which === 'outer' && !existingInner)
  if (wantInner) {
    const res = detectInner(image, {
      seed: opts.seed ?? centreOf(existingInner) ?? centreOf(existingOuter) ?? undefined,
      outer: existingOuter ? toCircle(existingOuter) : null,
      expectedRadiusPx: opts.expectedRadiusPx,
    })
    if (res.ok) inner = res.shape
    else warnings.push(`Inner edge: ${res.reason}`)
  }

  if (opts.which === 'outer' || opts.which === 'both') {
    const innerForOuter = inner ?? existingInner
    const res = detectOuter(image, {
      seed: opts.seed ?? centreOf(innerForOuter) ?? centreOf(existingOuter) ?? undefined,
      inner: innerForOuter ? toCircle(innerForOuter) : null,
    })
    if (res.ok) outer = res.shape
    else warnings.push(`Outer edge: ${res.reason}`)
  }

  return { inner, outer, warnings }
}

function checkImage(image: GrayImage): string | null {
  const { width, height, data } = image
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) return 'The image has no size.'
  if (width * height > MAX_ENGINE_PIXELS) return 'The image is larger than 25 megapixels.'
  if (!data || data.length !== width * height) return 'The image data does not match its size.'
  if (Math.min(width, height) < MIN_IMAGE_SIDE) return `The image is too small (at least ${MIN_IMAGE_SIDE} px a side).`
  return null
}

function centreOf(shape: RingShape | null): Point | null {
  return shape ? { x: shape.cx, y: shape.cy } : null
}

function toCircle(shape: RingShape): Circle {
  return { cx: shape.cx, cy: shape.cy, r: shapeMeanRadiusPx(shape) }
}

// ---------------------------------------------------------------------------
// Working image
// ---------------------------------------------------------------------------

/** Area-average downscale to at most `maxSide` px (same factor both axes), then a 3×3 box blur. */
function makeWorking(image: GrayImage, maxSide: number): Working {
  const { width: fw, height: fh, data } = image
  const scale = Math.min(1, maxSide / Math.max(fw, fh))
  const w = Math.max(1, Math.round(fw * scale))
  const h = Math.max(1, Math.round(fh * scale))
  const sx = w / fw
  const sy = h / fh
  const gray = new Float32Array(w * h)
  if (w === fw && h === fh) {
    for (let i = 0; i < gray.length; i += 1) gray[i] = data[i]
  } else {
    const count = new Float32Array(w * h)
    for (let y = 0; y < fh; y += 1) {
      const ty = Math.min(h - 1, Math.floor(y * sy))
      const row = y * fw
      const trow = ty * w
      for (let x = 0; x < fw; x += 1) {
        const t = trow + Math.min(w - 1, Math.floor(x * sx))
        gray[t] += data[row + x]
        count[t] += 1
      }
    }
    for (let i = 0; i < gray.length; i += 1) gray[i] = count[i] > 0 ? gray[i] / count[i] : 0
  }
  return { gray: boxBlur(gray, w, h, 1), w, h, sx, sy, s: (sx + sy) / 2 }
}

/** Working-image shape back to original pixels. */
function toShape(
  wk: Working,
  centreW: { cx: number; cy: number },
  radiusW: number,
  contourW: number[] | null,
  fullW: number,
  fullH: number,
  edgeMargin: number,
): RingShape | null {
  const r = radiusW / wk.s
  const cx = clamp(centreW.cx / wk.sx, r * edgeMargin, fullW - r * edgeMargin)
  const cy = clamp(centreW.cy / wk.sy, r * edgeMargin, fullH - r * edgeMargin)
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return null
  if (!contourW) return { type: 'circle', cx, cy, r }
  const n = contourW.length
  const points: Point[] = []
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2
    points.push({ x: cx + (Math.cos(t) * contourW[i]) / wk.sx, y: cy + (Math.sin(t) * contourW[i]) / wk.sy })
  }
  return { type: 'polygon', cx, cy, points }
}

// ---------------------------------------------------------------------------
// Inner edge (hole: first strong light→dark step from the centre)
// ---------------------------------------------------------------------------

function detectInner(
  image: GrayImage,
  options: { seed?: Point; outer: Circle | null; expectedRadiusPx?: number },
): Detected {
  const wk = makeWorking(image, INNER_WORKING_SIZE)
  const { gray: smooth, w, h } = wk

  let seedCx = (options.seed?.x ?? image.width / 2) * wk.sx
  let seedCy = (options.seed?.y ?? image.height / 2) * wk.sy
  if (options.outer) {
    seedCx = options.outer.cx * wk.sx
    seedCy = options.outer.cy * wk.sy
  }

  const halfMin = Math.min(w, h) / 2
  let minR = Math.max(4, halfMin * 0.06)
  let maxR = halfMin * 0.85
  if (options.expectedRadiusPx && options.expectedRadiusPx > 0) {
    const expectedR = options.expectedRadiusPx * wk.s
    // A generous band around the expected radius, so a weak hole edge does
    // not fall through to the much farther outer edge.
    minR = Math.max(minR, expectedR * 0.58)
    maxR = Math.min(maxR, expectedR * 1.42)
  }
  if (options.outer && options.outer.r > 0) {
    const outerR = options.outer.r * wk.s
    maxR = Math.min(maxR, outerR * 0.94)
    minR = Math.max(minR, Math.min(outerR * 0.08, maxR * 0.4))
  }
  if (maxR - minR < 8) return { ok: false, reason: 'Search range too small. Check the ring sizes.' }

  const denseRays = 120
  let pass1 = sampleEdgeRadii(smooth, w, h, seedCx, seedCy, minR, maxR, denseRays, findInnerEdgeAlongRay)
  pass1 = rejectRadialOutliers(pass1, 0.22)
  if (pass1.radii.length < 20) {
    return { ok: false, reason: `Too few edge hits (${pass1.radii.length} of ${denseRays}).` }
  }

  const center1 = fitCircleCentre(pass1.points, seedCx, seedCy)
  seedCx = center1.cx
  seedCy = center1.cy
  const pass2 = rejectRadialOutliers(
    sampleEdgeRadii(smooth, w, h, seedCx, seedCy, minR, maxR, denseRays, findInnerEdgeAlongRay),
    0.2,
  )
  if (pass2.radii.length >= 20) {
    pass1 = pass2
    const center2 = fitCircleCentre(pass2.points, seedCx, seedCy)
    seedCx = center2.cx
    seedCy = center2.cy
  }

  const passMedian = medianNumber(pass1.radii)
  const passMad = medianNumber(pass1.radii.map((r) => Math.abs(r - passMedian)))
  const maxRadialError = Math.max(passMedian * 0.18, passMad * 4.5, 3)

  const sides = INNER_SIDES
  const contourR = new Array<number>(sides).fill(0)
  const contourHits = new Array<number>(sides).fill(0)

  for (let i = 0; i < denseRays; i += 1) {
    const ang = (i / denseRays) * Math.PI * 2
    const hit = findInnerEdgeAlongRay(smooth, w, h, seedCx, seedCy, Math.cos(ang), Math.sin(ang), minR, maxR)
    if (hit === null || Math.abs(hit - passMedian) > maxRadialError) continue
    const bucket = Math.round((i / denseRays) * sides) % sides
    contourR[bucket] += hit
    contourHits[bucket] += 1
  }

  for (let i = 0; i < sides; i += 1) {
    if (contourHits[i] > 0) {
      contourR[i] /= contourHits[i]
      continue
    }
    const ang = (i / sides) * Math.PI * 2
    const hit = findInnerEdgeAlongRay(smooth, w, h, seedCx, seedCy, Math.cos(ang), Math.sin(ang), minR, maxR)
    if (hit !== null && Math.abs(hit - passMedian) <= maxRadialError) {
      contourR[i] = hit
      contourHits[i] = 1
    }
  }

  // Gaps: mean of the nearest traced neighbours.
  for (let i = 0; i < sides; i += 1) {
    if (contourHits[i] > 0) continue
    const { prev, next } = nearestHits(contourHits, i)
    if (prev >= 0 && next >= 0) contourR[i] = (contourR[prev] + contourR[next]) / 2
    else if (prev >= 0) contourR[i] = contourR[prev]
    else if (next >= 0) contourR[i] = contourR[next]
    else continue
    contourHits[i] = 1
  }
  // Old check, kept as it was: counted after the gaps are filled.
  if (contourHits.filter((c) => c > 0).length < Math.max(8, Math.floor(sides * 0.6))) {
    return { ok: false, reason: 'Could not trace a full inner edge.' }
  }

  // Remove isolated radial jumps, then smooth.
  const working = smoothClosedSeries(stabilizeInnerContour(contourR), 2)
  const medianR = [...working].sort((a, b) => a - b)[Math.floor(working.length / 2)]
  if (!(medianR > 2)) return { ok: false, reason: 'The detected radius is too small.' }

  const relStd = relativeSpread(working, medianR)
  let radiusW = medianR
  if (options.outer && options.outer.r > 0) {
    const outerR = options.outer.r * wk.s
    if (radiusW >= outerR * 0.98) radiusW = outerR * 0.85
  }

  const shape = toShape(
    wk,
    { cx: seedCx, cy: seedCy },
    radiusW,
    relStd <= INNER_CIRCLE_TOLERANCE ? null : working,
    image.width,
    image.height,
    0.15,
  )
  return shape ? { ok: true, shape } : { ok: false, reason: 'The circle fit gave invalid values.' }
}

// ---------------------------------------------------------------------------
// Outer edge (skin: dark→light, centre locked to the inner edge)
// ---------------------------------------------------------------------------

function detectOuter(image: GrayImage, options: { seed?: Point; inner: Circle | null }): Detected {
  const wk = makeWorking(image, OUTER_WORKING_SIZE)
  const { gray: smooth, w, h } = wk

  // Lock the centre to the inner edge so the outer edge stays concentric.
  let seedCx = (options.seed?.x ?? image.width / 2) * wk.sx
  let seedCy = (options.seed?.y ?? image.height / 2) * wk.sy
  if (options.inner && options.inner.r > 0) {
    seedCx = options.inner.cx * wk.sx
    seedCy = options.inner.cy * wk.sy
  }

  const halfMin = Math.min(w, h) / 2
  let minR = Math.max(4, halfMin * 0.15)
  if (options.inner && options.inner.r > 0) {
    minR = Math.max(minR, options.inner.r * wk.s * 1.08)
  } else {
    // No inner edge: estimate the hole radius from 48 quick rays.
    const boot: number[] = []
    for (let i = 0; i < 48; i += 1) {
      const ang = (i / 48) * Math.PI * 2
      const hit = findInnerEdgeAlongRay(smooth, w, h, seedCx, seedCy, Math.cos(ang), Math.sin(ang), halfMin * 0.05, halfMin * 0.65)
      if (hit !== null) boot.push(hit)
    }
    if (boot.length >= 12) {
      boot.sort((a, b) => a - b)
      minR = Math.max(minR, boot[Math.floor(boot.length / 2)] * 1.08)
    }
  }
  const maxR = halfMin * 0.995
  if (maxR - minR < 8) return { ok: false, reason: 'Search range too small. Check the ring sizes.' }

  const sides = OUTER_SIDES
  const contourR = new Array<number>(sides).fill(0)
  let hitCount = 0
  for (let i = 0; i < sides; i += 1) {
    const ang = (i / sides) * Math.PI * 2
    let best: number | null = null
    // Sub-rays: the outermost valid edge in the sector keeps rib / lug tips.
    for (let sub = -2; sub <= 2; sub += 1) {
      const a2 = ang + (sub * (Math.PI * 2)) / sides / 5
      const hit = findOuterEdgeAlongRay(smooth, w, h, seedCx, seedCy, Math.cos(a2), Math.sin(a2), minR, maxR)
      if (hit !== null && (best === null || hit > best)) best = hit
    }
    if (best !== null) {
      contourR[i] = best
      hitCount += 1
    }
  }
  if (hitCount < Math.max(12, Math.floor(sides * 0.55))) return { ok: false, reason: 'Could not trace the outer edge.' }

  // Gaps: linear interpolation between the nearest traced neighbours.
  const hits = contourR.map((r) => (r > 0 ? 1 : 0))
  for (let i = 0; i < sides; i += 1) {
    if (hits[i] > 0) continue
    const { prev, next } = nearestHits(hits, i)
    if (prev >= 0 && next >= 0) {
      const span = (next - prev + sides) % sides || 1
      const t = ((i - prev + sides) % sides) / span
      contourR[i] = contourR[prev] * (1 - t) + contourR[next] * t
    } else if (prev >= 0) contourR[i] = contourR[prev]
    else if (next >= 0) contourR[i] = contourR[next]
  }

  // Outliers more than 18 % from the local median, then a peak-preserving smooth.
  let working = contourR.slice()
  {
    const cleaned = working.slice()
    for (let i = 0; i < sides; i += 1) {
      const neigh = [
        working[(i - 2 + sides) % sides],
        working[(i - 1 + sides) % sides],
        working[(i + 1) % sides],
        working[(i + 2) % sides],
      ].sort((a, b) => a - b)
      const localMed = (neigh[1] + neigh[2]) / 2
      if (working[i] > localMed * 1.18 || working[i] < localMed * 0.82) cleaned[i] = localMed
    }
    working = cleaned
  }
  {
    const next = new Array<number>(sides)
    for (let i = 0; i < sides; i += 1) {
      const a = working[(i - 1 + sides) % sides]
      const b = working[i]
      const c = working[(i + 1) % sides]
      const avg = (a + 2 * b + c) / 4
      next[i] = b >= a && b >= c ? Math.max(avg, b) : avg
    }
    working = next
  }
  // Small outward bias so the guide sits on the outer skin.
  working = working.map((r) => r + 0.5)

  const sorted = working.filter((r) => r > 0).sort((a, b) => a - b)
  if (sorted.length < 8) return { ok: false, reason: 'The outer contour is too sparse.' }
  const medianR = sorted[Math.floor(sorted.length / 2)]
  const relStd = relativeSpread(working, medianR)

  let radiusW = medianR
  if (options.inner && options.inner.r > 0) {
    const innerR = options.inner.r * wk.s
    if (radiusW <= innerR * 1.05) radiusW = innerR * 1.25
  }

  const shape = toShape(
    wk,
    { cx: seedCx, cy: seedCy },
    radiusW,
    relStd <= OUTER_CIRCLE_TOLERANCE ? null : working,
    image.width,
    image.height,
    0.1,
  )
  return shape ? { ok: true, shape } : { ok: false, reason: 'The outer circle has invalid values.' }
}

// ---------------------------------------------------------------------------
// Scans (old code, unchanged thresholds)
// ---------------------------------------------------------------------------

function nearestHits(hits: number[], i: number): { prev: number; next: number } {
  const n = hits.length
  let prev = -1
  let next = -1
  for (let d = 1; d < n; d += 1) {
    if (prev < 0 && hits[(i - d + n) % n] > 0) prev = (i - d + n) % n
    if (next < 0 && hits[(i + d) % n] > 0) next = (i + d) % n
    if (prev >= 0 && next >= 0) break
  }
  return { prev, next }
}

function relativeSpread(values: number[], median: number): number {
  let variance = 0
  for (const r of values) variance += (r - median) * (r - median)
  variance /= values.length
  return Math.sqrt(variance) / median
}

function sampleEdgeRadii(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  minR: number,
  maxR: number,
  rayCount: number,
  findEdge: EdgeFinder,
): { radii: number[]; points: Point[] } {
  const radii: number[] = []
  const points: Point[] = []
  for (let i = 0; i < rayCount; i += 1) {
    const ang = (i / rayCount) * Math.PI * 2
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    const hit = findEdge(gray, w, h, cx, cy, cos, sin, minR, maxR)
    if (hit === null) continue
    radii.push(hit)
    points.push({ x: cx + cos * hit, y: cy + sin * hit })
  }
  return { radii, points }
}

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function rejectRadialOutliers(
  samples: { radii: number[]; points: Point[] },
  maxRelativeDeviation: number,
): { radii: number[]; points: Point[] } {
  if (samples.radii.length < 8) return samples
  const med = medianNumber(samples.radii)
  const spread = medianNumber(samples.radii.map((r) => Math.abs(r - med)))
  const tolerance = Math.max(3, med * maxRelativeDeviation, spread * 4.5)
  const radii: number[] = []
  const points: Point[] = []
  for (let i = 0; i < samples.radii.length; i += 1) {
    if (Math.abs(samples.radii[i] - med) > tolerance) continue
    radii.push(samples.radii[i])
    points.push(samples.points[i])
  }
  return { radii, points }
}

/** A hole may be mildly irregular, but it cannot jump towards the outer edge for a few rays. */
function stabilizeInnerContour(values: number[]): number[] {
  if (values.length < 5) return values.slice()
  const n = values.length
  const globalMedian = medianNumber(values)
  const globalMad = medianNumber(values.map((r) => Math.abs(r - globalMedian)))
  const globalTolerance = Math.max(3, globalMedian * 0.16, globalMad * 4)
  const cleaned = values.slice()
  for (let i = 0; i < n; i += 1) {
    const localMedian = medianNumber([
      values[(i - 2 + n) % n],
      values[(i - 1 + n) % n],
      values[(i + 1) % n],
      values[(i + 2) % n],
    ])
    const radius = values[i]
    const localTolerance = Math.max(3, localMedian * 0.12)
    if (Math.abs(radius - globalMedian) > globalTolerance || Math.abs(radius - localMedian) > localTolerance) {
      cleaned[i] = localMedian
    }
  }
  return cleaned
}

/**
 * Centre of the edge points by a least-squares circle fit (Kasa: minimise
 * sum of (x^2 + y^2 + Dx + Ey + F)^2, centre = (-D/2, -E/2)), on coordinates
 * taken relative to the points' mean. Falls back to the current centre when
 * there are too few points or the fit is not sound.
 *
 * Fix in the port: the old step took the median x and median y of the points.
 * With rays at equal angles from the seed, the rays at 90° and 270° always sit
 * in the middle of the sorted x values, so the "refined" centre was always the
 * seed itself and an off-centre seed was never corrected.
 */
function fitCircleCentre(points: Point[], fallbackCx: number, fallbackCy: number): { cx: number; cy: number } {
  const n = points.length
  if (n < 8) return { cx: fallbackCx, cy: fallbackCy }
  let mx = 0
  let my = 0
  for (const p of points) {
    mx += p.x
    my += p.y
  }
  mx /= n
  my /= n
  // Normal equations of [u v 1]·[D E F] = -(u^2 + v^2).
  let suu = 0
  let suv = 0
  let svv = 0
  let su = 0
  let sv = 0
  let suz = 0
  let svz = 0
  let sz = 0
  for (const p of points) {
    const u = p.x - mx
    const v = p.y - my
    const z = u * u + v * v
    suu += u * u
    suv += u * v
    svv += v * v
    su += u
    sv += v
    suz += u * z
    svz += v * z
    sz += z
  }
  const a = [
    [suu, suv, su],
    [suv, svv, sv],
    [su, sv, n],
  ]
  const b = [-suz, -svz, -sz]
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const det = det3(a)
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return { cx: fallbackCx, cy: fallbackCy }
  const withCol = (col: number) => a.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)))
  const d = det3(withCol(0)) / det
  const e = det3(withCol(1)) / det
  const cx = mx - d / 2
  const cy = my - e / 2
  // A sound fit stays near the points: refuse a centre farther from the seed
  // than the mean distance of the points from it.
  const spread = points.reduce((acc, p) => acc + Math.hypot(p.x - fallbackCx, p.y - fallbackCy), 0) / n
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || Math.hypot(cx - fallbackCx, cy - fallbackCy) > spread) {
    return { cx: fallbackCx, cy: fallbackCy }
  }
  return { cx, cy }
}

function smoothClosedSeries(values: number[], passes: number): number[] {
  let cur = values.slice()
  const n = cur.length
  for (let p = 0; p < passes; p += 1) {
    const next = new Array<number>(n)
    for (let i = 0; i < n; i += 1) next[i] = (cur[(i - 1 + n) % n] + 2 * cur[i] + cur[(i + 1) % n]) / 4
    cur = next
  }
  return cur
}

type RaySample = { r: number; g: number }

function sampleRay(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
  step: number,
): RaySample[] {
  const list: RaySample[] = []
  for (let r = minR; r <= maxR; r += step) {
    const x = cx + cos * r
    const y = cy + sin * r
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break
    list.push({ r, g: sampleBilinear(gray, w, h, x, y) })
  }
  return list
}

function greyRange(list: RaySample[]): { gMin: number; gMax: number; range: number } {
  let gMin = Infinity
  let gMax = -Infinity
  for (const s of list) {
    if (s.g < gMin) gMin = s.g
    if (s.g > gMax) gMax = s.g
  }
  return { gMin, gMax, range: gMax - gMin }
}

/** First strong light→dark step (inner hole edge). */
function findInnerEdgeAlongRay(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
): number | null {
  const list = sampleRay(gray, w, h, cx, cy, cos, sin, minR, maxR, 1)
  if (list.length < 10) return null
  const { gMin, gMax, range } = greyRange(list)
  if (range < 12) return null

  const dropThresh = Math.max(10, range * 0.12)
  const gradThresh = Math.max(6, range * 0.08)
  for (let i = 2; i < list.length - 2; i += 1) {
    const before = (list[i - 2].g + list[i - 1].g) / 2
    const after = (list[i + 1].g + list[i + 2].g) / 2
    if (before - after >= dropThresh && before > (gMin + gMax) / 2 - range * 0.1) return list[i].r
  }
  return firstGradientPeak(list, gradThresh)
}

/**
 * Outer metal→background edge: strongest dark→light rise, outermost dark
 * metal pixel and the first crossing from outside; the outermost valid hit
 * wins so rib tips are not clipped.
 */
function findOuterEdgeAlongRay(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
): number | null {
  const list = sampleRay(gray, w, h, cx, cy, cos, sin, minR, maxR, 0.5)
  if (list.length < 12) return null
  const { gMin, gMax, range } = greyRange(list)
  if (range < 10) return null

  const mid = (gMin + gMax) / 2
  const darkCut = gMin + range * 0.32
  const brightCut = gMin + range * 0.58

  // 1) Strongest dark→light rise, biased slightly outward.
  let riseR: number | null = null
  let bestScore = -1
  for (let i = 4; i < list.length - 4; i += 1) {
    const before = (list[i - 4].g + list[i - 3].g + list[i - 2].g + list[i - 1].g) / 4
    const after = (list[i + 1].g + list[i + 2].g + list[i + 3].g + list[i + 4].g) / 4
    const rise = after - before
    if (rise < range * 0.1) continue
    if (before > mid + range * 0.12) continue
    if (before > darkCut + range * 0.15) continue
    const radiusBias = 1 + 0.2 * ((list[i].r - minR) / Math.max(1, maxR - minR))
    const score = rise * radiusBias
    if (score > bestScore) {
      bestScore = score
      riseR = list[i].r
    }
  }

  // 2) Outermost dark metal pixel (soft or protruding lobes).
  let darkExtent: number | null = null
  let darkStreak = 0
  let lastDark: number | null = null
  for (const s of list) {
    if (s.g <= darkCut) {
      darkStreak += 1
      lastDark = s.r
    } else if (darkStreak >= 2) {
      darkExtent = lastDark
      darkStreak = 0
    } else {
      darkStreak = 0
    }
  }
  if (darkStreak >= 2 && lastDark !== null) darkExtent = lastDark

  // 3) From outside inwards: first crossing into dark metal.
  let fromOutside: number | null = null
  for (let i = list.length - 2; i >= 1; i -= 1) {
    if (list[i + 1].g >= brightCut && list[i].g < brightCut) {
      fromOutside = list[i].r
      break
    }
  }

  const candidates = [riseR, darkExtent, fromOutside].filter((v): v is number => v !== null && Number.isFinite(v))
  if (candidates.length === 0) return null
  // Prefer the rise when the dark extent is only noise-farther (< 4 % beyond it).
  if (riseR !== null && darkExtent !== null) {
    if (darkExtent > riseR * 1.04) return darkExtent
    return Math.max(riseR, Math.min(darkExtent, riseR * 1.02))
  }
  return Math.max(...candidates)
}

/** First gradient peak (innermost), as the old 'inner' preference. */
function firstGradientPeak(list: RaySample[], gradThresh: number): number | null {
  let bestI = -1
  for (let i = 2; i < list.length - 2; i += 1) {
    const grad = Math.abs(list[i + 1].g - list[i - 1].g)
    const isPeak = grad >= Math.abs(list[i].g - list[i - 2].g) && grad >= Math.abs(list[i + 2].g - list[i].g)
    if (!isPeak || grad < gradThresh) continue
    if (bestI < 0 || list[i].r < list[bestI].r + 4) {
      bestI = i
      if (grad >= gradThresh * 1.4) return list[i].r
    }
  }
  return bestI >= 0 ? list[bestI].r : null
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const span = radius * 2 + 1
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0
      for (let k = -radius; k <= radius; k += 1) sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))]
      tmp[y * w + x] = sum / span
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0
      for (let k = -radius; k <= radius; k += 1) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]
      out[y * w + x] = sum / span
    }
  }
  return out
}

function sampleBilinear(map: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const v00 = map[y0 * w + x0] ?? 0
  const v10 = map[y0 * w + x1] ?? 0
  const v01 = map[y1 * w + x0] ?? 0
  const v11 = map[y1 * w + x1] ?? 0
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return (lo + hi) / 2
  return Math.min(hi, Math.max(lo, v))
}
