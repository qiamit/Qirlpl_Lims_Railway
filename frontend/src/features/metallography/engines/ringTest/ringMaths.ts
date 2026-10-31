/**
 * Ring test (IS 1786 TMT bar cross-section) maths: engine ring_test@1.0.0.
 *
 * Port of the Metallurgy Software `lib/ring-test/analysis/index.ts` and the
 * thickness helpers of `components/ring-test/RingEditor.tsx`
 * (computeAdjustedThicknessPairs, ray / circle and ray / polygon solvers), with
 * the fixes of design 3.6:
 *   - original image pixels in, separate x / y scale (no 590×590 stretch);
 *   - TM and F&P areas from the drawn shapes: shoelace for polygons, π r² for
 *     circles (the old code always used circles, even for polygon edges);
 *   - one source for d: the nominal diameter passed in (the old code silently
 *     switched the limits to the measured diameter when lines were drawn);
 *     measured diameter lines are recorded for information only;
 *   - thickness points are required: no verdict can pass until t1–t8 are
 *     applied and all 8 are valid;
 *   - no default scale (the caller must pass one).
 *
 * The decision is recomputed by app_metallography_ring_check() in migration
 * 20261102101700 from the stored (rounded) values, so the verdict here is
 * also taken on the stored values:
 *   thickness_mm  IS 2 rounded to RING_THICKNESS_DECIMALS;
 *   areas         IS 2 rounded to AREA_DECIMALS (mm²);
 *   tm_share_pct  area_tm / (area_tm + area_fp) × 100 of the stored areas,
 *                 IS 2 rounded to RING_SHARE_DECIMALS;
 *   limits        thickness_min_factor × d … thickness_max_factor × d and
 *                 tm_share_min_pct … tm_share_max_pct, inclusive unless
 *                 limits_inclusive is false.
 *
 * Thickness rays (old code): origin at the outer ring centre; t1 at 12 o'clock
 * then clockwise every 45° (RING_NOMINAL_ANGLES_DEG), plus the method's angular
 * correction and the point's own offset. Along each ray the inner edge is moved
 * out by inner_gap_px and the outer edge in by outer_gap_px (the drawn lines
 * sit on the edges), then the point's own ±px adjustment is added to the outer
 * end. A ray that does not meet both edges, or meets them less than 1 px apart,
 * gives no thickness (point not valid).
 *
 * Pure and DOM-free: runs in the worker, on the main thread and in Node
 * (`npm run validate:calculations`, module mgRing, cases RT-01…RT-09).
 */
import { is2Round, toDecimalString } from '@/lib/is2Rounding'
import {
  RING_NOMINAL_ANGLES_DEG,
  RING_SHARE_DECIMALS,
  RING_TEST_ENGINE_VERSION,
  RING_THICKNESS_DECIMALS,
  RING_THICKNESS_LABELS,
  scaleToMmPerPx,
  type ComputeRingFn,
  type Point,
  type RingGeometry,
  type RingShape,
  type RingTestLimits,
  type RingTestSummary,
  type RingThicknessPoint,
  type ScaleInput,
} from '../types'

/** Stored rounding of area_tm_mm2 / area_fp_mm2 (mm²). */
export const RING_AREA_DECIMALS = 4

/** Pixel coordinates of the thickness end points are stored to 2 decimals. */
const XY_DECIMALS = 2

/** The old code's minimum ray hit distance (px). */
const RAY_EPS = 1e-3

// ---------------------------------------------------------------------------
// Geometry helpers (exported for the ring editor and the validation cases)
// ---------------------------------------------------------------------------

/** Smallest positive distance from (px, py) along the unit vector (cos, sin) to a circle; null if none. */
export function rayCircleDistance(
  px: number,
  py: number,
  cos: number,
  sin: number,
  c: { cx: number; cy: number; r: number },
): number | null {
  const dx = px - c.cx
  const dy = py - c.cy
  const b = 2 * (dx * cos + dy * sin)
  const cc = dx * dx + dy * dy - c.r * c.r
  const disc = b * b - 4 * cc
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  const t1 = (-b - sq) / 2
  const t2 = (-b + sq) / 2
  if (t1 > RAY_EPS) return t1
  if (t2 > RAY_EPS) return t2
  return null
}

/** Ray parameter t where the ray meets segment (x1,y1)-(x2,y2); null if it does not. */
function raySegmentT(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number | null {
  const ex = x2 - x1
  const ey = y2 - y1
  const den = dx * ey - dy * ex
  if (Math.abs(den) < 1e-9) return null
  const qx = x1 - ox
  const qy = y1 - oy
  const t = (qx * ey - qy * ex) / den
  const u = (qx * dy - qy * dx) / den
  if (t <= RAY_EPS) return null
  if (u < -1e-6 || u > 1 + 1e-6) return null
  return t
}

/** Nearest positive distance from (px, py) along (cos, sin) to a closed polygon; null if none. */
export function rayPolygonDistance(px: number, py: number, cos: number, sin: number, points: Point[]): number | null {
  if (points.length < 3) return null
  let best: number | null = null
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const t = raySegmentT(px, py, cos, sin, a.x, a.y, b.x, b.y)
    if (t !== null && (best === null || t < best)) best = t
  }
  return best
}

/** Distance along a ray to a ring edge of either shape. */
export function rayShapeDistance(px: number, py: number, cos: number, sin: number, shape: RingShape): number | null {
  if (shape.type === 'circle') return rayCircleDistance(px, py, cos, sin, shape)
  return rayPolygonDistance(px, py, cos, sin, shape.points)
}

/** Shoelace area of a closed polygon in px² (always ≥ 0). */
export function shoelaceAreaPx(points: Point[]): number {
  if (points.length < 3) return 0
  let twice = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}

/**
 * Area enclosed by a ring edge in mm². A circle of radius r px is an ellipse
 * of semi-axes r·sx, r·sy mm when the x and y scales differ; a polygon's
 * shoelace area in px² scales by sx·sy.
 */
export function shapeAreaMm2(shape: RingShape, mmPerPx: { x: number; y: number }): number {
  const px2 = shape.type === 'circle' ? Math.PI * shape.r * shape.r : shoelaceAreaPx(shape.points)
  return px2 * mmPerPx.x * mmPerPx.y
}

/** Length of a pixel vector in mm with separate x / y scales. */
export function vectorLengthMm(dxPx: number, dyPx: number, mmPerPx: { x: number; y: number }): number {
  return Math.hypot(dxPx * mmPerPx.x, dyPx * mmPerPx.y)
}

/** Centre of a ring edge (the ray origin when it is the outer edge). */
export function shapeCentre(shape: RingShape): Point {
  return { x: shape.cx, y: shape.cy }
}

/** Mean radius of a ring edge in px (circle radius, or mean distance of the polygon points from its centre). */
export function shapeMeanRadiusPx(shape: RingShape): number {
  if (shape.type === 'circle') return shape.r
  if (shape.points.length === 0) return 0
  return shape.points.reduce((a, p) => a + Math.hypot(p.x - shape.cx, p.y - shape.cy), 0) / shape.points.length
}

/** Value with binary noise removed (0.07 × 12 = 0.84, not 0.8400000000000001), as PostgreSQL numeric gives. */
function clean(value: number): number {
  return Number(toDecimalString(value))
}

function roundXy(v: number): number {
  return is2Round(v, XY_DECIMALS)
}

function inRange(value: number, low: number, high: number, inclusive: boolean): boolean {
  return inclusive ? value >= low && value <= high : value > low && value < high
}

// ---------------------------------------------------------------------------
// Thickness points
// ---------------------------------------------------------------------------

/**
 * The 8 thickness rays (t1…t8) in px and mm. thickness_mm is IS 2 rounded to
 * `thicknessDecimals`; it is null when the ray does not meet both edges, or
 * when the thickness points have not been applied.
 */
export function computeThicknessPoints(
  geometry: RingGeometry,
  mmPerPx: { x: number; y: number },
  thicknessDecimals = RING_THICKNESS_DECIMALS,
): RingThicknessPoint[] {
  const { x: cx, y: cy } = shapeCentre(geometry.outer)
  const innerGap = Math.max(0, geometry.innerGapPx || 0)
  const outerGap = Math.max(0, geometry.outerGapPx || 0)

  return RING_THICKNESS_LABELS.map((label, idx) => {
    const offset = geometry.pointOffsets[idx] ?? { angleOffsetDeg: 0, deltaPx: 0 }
    const angleDeg = RING_NOMINAL_ANGLES_DEG[label] + (geometry.angularCorrectionDeg || 0) + (offset.angleOffsetDeg || 0)
    const empty: RingThicknessPoint = { label, angle_deg: angleDeg, thickness_mm: null, inner_xy: null, outer_xy: null }
    if (!geometry.thicknessApplied) return empty

    const a = (angleDeg * Math.PI) / 180
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const innerR = rayShapeDistance(cx, cy, cos, sin, geometry.inner)
    const outerR = rayShapeDistance(cx, cy, cos, sin, geometry.outer)
    if (innerR === null || outerR === null || outerR <= innerR + 1) return empty

    const adjInner = Math.min(outerR - 1, Math.max(0, innerR + innerGap))
    const adjOuter = Math.max(adjInner + 1, outerR - outerGap + (offset.deltaPx || 0))
    const ix = cx + cos * adjInner
    const iy = cy + sin * adjInner
    const ox = cx + cos * adjOuter
    const oy = cy + sin * adjOuter
    const mm = is2Round(vectorLengthMm(ox - ix, oy - iy, mmPerPx), thicknessDecimals)
    if (!Number.isFinite(mm) || mm <= 0) return empty
    return {
      label,
      angle_deg: angleDeg,
      thickness_mm: mm,
      inner_xy: [roundXy(ix), roundXy(iy)],
      outer_xy: [roundXy(ox), roundXy(oy)],
    }
  })
}

/** Mean length of the measured diameter lines in mm (information only; null when none). */
export function measuredDiameterMm(geometry: RingGeometry, mmPerPx: { x: number; y: number }): number | null {
  const lines = geometry.diameterLines ?? []
  if (lines.length === 0) return null
  const sum = lines.reduce((a, l) => a + vectorLengthMm(l.x2 - l.x1, l.y2 - l.y1, mmPerPx), 0)
  return is2Round(sum / lines.length, RING_THICKNESS_DECIMALS)
}

// ---------------------------------------------------------------------------
// Full ring computation
// ---------------------------------------------------------------------------

function checkScale(scale: ScaleInput): { x: number; y: number } {
  const mm = scaleToMmPerPx(scale)
  if (!(Number.isFinite(mm.x) && mm.x > 0 && Number.isFinite(mm.y) && mm.y > 0)) {
    throw new Error('Ring test: set the image scale first (microscope calibration or in-image reference line).')
  }
  return mm
}

function checkLimits(limits: RingTestLimits): RingTestLimits {
  const l: RingTestLimits = {
    thickness_min_factor: Number(limits.thickness_min_factor),
    thickness_max_factor: Number(limits.thickness_max_factor),
    tm_share_min_pct: Number(limits.tm_share_min_pct),
    tm_share_max_pct: Number(limits.tm_share_max_pct),
    limits_inclusive: limits.limits_inclusive !== false,
  }
  // Same test as app_metallography_ring_check.
  if (
    !(l.thickness_min_factor > 0) ||
    !(l.thickness_max_factor > l.thickness_min_factor) ||
    !(l.tm_share_min_pct >= 0) ||
    !(l.tm_share_max_pct > l.tm_share_min_pct) ||
    l.tm_share_max_pct > 100
  ) {
    throw new Error('Ring test: the limits in Method Setup are not valid.')
  }
  return l
}

/**
 * IS 1786 ring result from the confirmed geometry. Throws an Error with a
 * plain message when the scale, d or the limits are missing or not valid;
 * call it only once the scale and d are set.
 */
export const computeRing: ComputeRingFn = (geometry, scale, dMm, limits) => {
  const mm = checkScale(scale)
  if (!(typeof dMm === 'number' && Number.isFinite(dMm) && dMm > 0)) {
    throw new Error('Ring test: enter the nominal bar diameter d (mm).')
  }
  const lim = checkLimits(limits)
  const tDec = RING_THICKNESS_DECIMALS
  const sDec = RING_SHARE_DECIMALS

  // Thickness t1–t8 (stored values).
  const thickness = computeThicknessPoints(geometry, mm, tDec)
  const valid = thickness.map((p) => p.thickness_mm).filter((v): v is number => v !== null)
  const low = clean(lim.thickness_min_factor * dMm)
  const high = clean(lim.thickness_max_factor * dMm)
  const thicknessInRange =
    geometry.thicknessApplied &&
    valid.length === RING_THICKNESS_LABELS.length &&
    valid.every((v) => inRange(v, low, high, lim.limits_inclusive))

  // Areas: F&P = inside the inner edge; TM = between the edges.
  const outerArea = shapeAreaMm2(geometry.outer, mm)
  const innerArea = shapeAreaMm2(geometry.inner, mm)
  const areaFp = is2Round(innerArea, RING_AREA_DECIMALS)
  const areaTm = is2Round(Math.max(0, outerArea - innerArea), RING_AREA_DECIMALS)
  const total = areaTm + areaFp
  const share = total > 0 ? is2Round((areaTm / total) * 100, sDec) : 0
  const shareInRange = areaTm > 0 && inRange(share, lim.tm_share_min_pct, lim.tm_share_max_pct, lim.limits_inclusive)

  const dMeasured = measuredDiameterMm(geometry, mm)

  const summary: RingTestSummary = {
    kind: 'ring_test',
    engine_version: RING_TEST_ENGINE_VERSION,
    scale_source: scale.kind === 'in_image' ? 'in_image' : 'calibration',
    mm_per_px_x: mm.x,
    mm_per_px_y: mm.y,
    d_mm: dMm,
    d_source: 'nominal',
    d_nominal_mm: dMm,
    d_measured_mm: dMeasured,
    thickness,
    valid_point_count: valid.length,
    thickness_min_mm: valid.length ? Math.min(...valid) : null,
    thickness_max_mm: valid.length ? Math.max(...valid) : null,
    thickness_mean_mm: valid.length ? is2Round(valid.reduce((a, b) => a + b, 0) / valid.length, tDec) : null,
    thickness_range_low_mm: low,
    thickness_range_high_mm: high,
    thickness_in_range: thicknessInRange,
    area_tm_mm2: areaTm,
    area_fp_mm2: areaFp,
    tm_share_pct: share,
    tm_share_in_range: shareInRange,
    limits: lim,
    thickness_decimals: tDec,
    share_decimals: sDec,
    overall_pass: thicknessInRange && shareInRange,
  }
  return summary
}

/** True when the summary has all 8 thickness points (Use result / Complete may proceed). */
export function ringSummaryComplete(summary: RingTestSummary | null | undefined): boolean {
  return Boolean(summary && summary.valid_point_count === RING_THICKNESS_LABELS.length)
}
