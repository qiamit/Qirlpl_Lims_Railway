/**
 * Metallography engines: shared input / output shapes (design 3.1 item 2-4, 3.6).
 *
 * Engines are DOM-free TypeScript. They run in a Vite Web Worker
 * (engines/analysis.worker.ts) and, bundled by esbuild, in Node for
 * `npm run validate:calculations`. They must NOT import '@/lib/supabaseClient',
 * React, or anything that touches `document` / `window`.
 *
 * Every engine is versioned (`<kind>@<semver>`). A released version is never
 * edited in place: a change becomes a new version, so a reviewer re-check can
 * re-run exactly the version stored on the analysis.
 *
 * Coordinates are ORIGINAL image pixels (x to the right, y down), never screen
 * or canvas pixels. Crop / rotation / exclusion areas are vectors applied by the
 * engine on every run; the original bytes are never changed.
 */

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** 8-bit grey image, row-major, data.length === width * height. */
export type GrayImage = { width: number; height: number; data: Uint8Array }

/** RGBA image as in ImageData (data.length === width * height * 4). */
export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

/** Largest image the browser engines accept (design 3.1 trade-offs: 25 MP). */
export const MAX_ENGINE_PIXELS = 25_000_000

/** Luma weights used by every engine (same as the old detect-ring.ts: 0.299 R + 0.587 G + 0.114 B). */
export const LUMA_WEIGHTS = { r: 0.299, g: 0.587, b: 0.114 } as const

/** RGBA -> grey with LUMA_WEIGHTS, rounded to the nearest integer. Alpha is ignored. */
export function rgbaToGray(img: RgbaImage): GrayImage {
  const { width, height, data } = img
  const out = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    const v = LUMA_WEIGHTS.r * data[p] + LUMA_WEIGHTS.g * data[p + 1] + LUMA_WEIGHTS.b * data[p + 2]
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
  }
  return { width, height, data: out }
}

/** Grey value at integer pixel (x, y); 0 outside the image. */
export function grayAt(img: GrayImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0
  return img.data[y * img.width + x]
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/**
 * Scale of the original image.
 *  - calibration: µm per pixel along x and y from a verified
 *    metallography_scale_calibrations row (valid only at its resolution);
 *  - in_image: mm per pixel from a reference line of known length drawn on the
 *    photo (ring test and macro only), recomputed by the database from the line.
 * There is NO default scale: an engine refuses to run without one (the old
 * software silently used 1 µm/px).
 */
export type ScaleInput =
  | { kind: 'calibration'; umPerPxX: number; umPerPxY: number }
  | { kind: 'in_image'; mmPerPx: number }

/** mm per pixel along x and y for either kind of scale. */
export function scaleToMmPerPx(scale: ScaleInput): { x: number; y: number } {
  if (scale.kind === 'in_image') return { x: scale.mmPerPx, y: scale.mmPerPx }
  return { x: scale.umPerPxX / 1000, y: scale.umPerPxY / 1000 }
}

// ---------------------------------------------------------------------------
// Vector marks (stored in metallography_fields.marks.items)
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number }

export type Geometry =
  | { type: 'point'; x: number; y: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'polyline'; points: Point[] }
  | { type: 'polygon'; points: Point[] }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number }

/** What a mark means. Engines and the operator share the same kinds. */
export type MarkKind =
  // ring test
  | 'ring_inner'
  | 'ring_outer'
  | 'ring_diameter_line'
  | 'ring_thickness_point'
  // scale and measurement
  | 'scale_line'
  | 'measure_line'
  // areas
  | 'field_roi'
  | 'exclusion'
  // later engines (Phase 2+); kept here so the shape does not change
  | 'intercept_hit'
  | 'test_line'
  | 'grain'
  | 'particle'
  | 'surface_polyline'
  | 'depth_marker'
  | 'grid_point'

export type MarkOrigin = 'engine' | 'operator'

/**
 * One vector mark on the ORIGINAL image. `origin` records whether the engine
 * proposed it or the operator drew / moved it (an engine mark the operator
 * moves becomes origin 'operator'). Reported values are computed from the
 * confirmed marks only.
 */
export type Mark = {
  id: string
  kind: MarkKind
  origin: MarkOrigin
  geometry: Geometry
  /** e.g. 't1' for a thickness point, 'D1' for a diameter line. */
  label?: string
  /** Kind-specific numbers (e.g. {thickness_mm: 1.46}); never the source of a reported value. */
  meta?: Record<string, number | string | boolean | null>
}

/** metallography_fields.marks */
export type FieldMarks = { items: Mark[] }

/** Text and arrows: a separate layer, never analysed. metallography_fields.annotations */
export type Annotation =
  | { id: string; type: 'text'; x: number; y: number; text: string; color?: string }
  | { id: string; type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color?: string }

/** metallography_fields.operator_adjustments (vectors, re-applied on every engine run). */
export type OperatorAdjustments = {
  /** Field ROI on the original image; null = whole image. */
  roi?: { x: number; y: number; width: number; height: number } | null
  /** Rotation in degrees applied before analysis (positive = clockwise). */
  rotationDeg?: number
  /** Areas not analysed. */
  exclusions?: Array<{ id: string; points: Point[]; reason?: string }>
}

/** metallography_fields.display_settings (view only, never analysed). */
export type DisplaySettings = { brightness?: number; contrast?: number; zoom?: number; panX?: number; panY?: number }

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

/**
 * What every engine returns. `summary` goes to metallography_analyses.result_summary,
 * `marks` to the field's marks (proposals until confirmed), `features` (large
 * lists) to the bucket as JSON (features_<field_no>_<sha16>.json).
 */
export type EngineResult<TSummary> = {
  /** e.g. 'ring_test@1.0.0' */
  engineVersion: string
  summary: TSummary
  marks: Mark[]
  features?: unknown
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Ring test (IS 1786) — Phase 1
// ---------------------------------------------------------------------------

export const RING_TEST_ENGINE_VERSION = 'ring_test@1.0.0'

export const RING_THICKNESS_LABELS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'] as const
export type RingThicknessLabel = (typeof RING_THICKNESS_LABELS)[number]

/**
 * Nominal ray angles in degrees, image convention (y down, 0° = 3 o'clock,
 * 90° = 6 o'clock): t1 at 12 o'clock, then clockwise every 45°
 * (old analysis/index.ts:29-38).
 */
export const RING_NOMINAL_ANGLES_DEG: Record<RingThicknessLabel, number> = {
  t1: 270,
  t2: 315,
  t3: 0,
  t4: 45,
  t5: 90,
  t6: 135,
  t7: 180,
  t8: 225,
}

/** Stored rounding; the SQL recompute uses half a unit of these as its tolerance. */
export const RING_THICKNESS_DECIMALS = 3
export const RING_SHARE_DECIMALS = 2

/**
 * Pass / fail limits. Same key names in Method Setup settings
 * (metallography_parameter_methods.settings) and in RingTestSummary.limits;
 * the database refuses a summary whose limits differ from the method's.
 * Defaults are the old code's values, flagged "verify against IS 1786".
 */
export type RingTestLimits = {
  thickness_min_factor: number
  thickness_max_factor: number
  tm_share_min_pct: number
  tm_share_max_pct: number
  /** true: a value equal to a limit passes (confirm against IS 1786, case RT-04). */
  limits_inclusive: boolean
}

export const RING_TEST_DEFAULT_LIMITS: RingTestLimits = {
  thickness_min_factor: 0.07,
  thickness_max_factor: 0.15,
  tm_share_min_pct: 30,
  tm_share_max_pct: 50,
  limits_inclusive: true,
}

/** A ring edge: a circle, or a polygon around a centre (areas by shoelace). */
export type RingShape =
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'polygon'; cx: number; cy: number; points: Point[] }

/** Per-point fine adjustment (old RingEditor ±5° shift / ±2 px shrink-expand). */
export type RingPointOffset = { angleOffsetDeg: number; deltaPx: number }

/**
 * Full ring geometry, saved with the field (marks) so the analysis can be
 * re-checked. Original image pixels.
 */
export type RingGeometry = {
  /** Hole edge (inside of the core / F&P). */
  inner: RingShape
  /** Outer skin. */
  outer: RingShape
  /** Optional measured diameter lines (informative; d for the limits is RingTestSummary.d_mm). */
  diameterLines: Array<{ x1: number; y1: number; x2: number; y2: number }>
  /** Thickness points are measured only once applied (Use result is blocked until then). */
  thicknessApplied: boolean
  /** 8 entries in t1..t8 order. */
  pointOffsets: RingPointOffset[]
  /** From Method Setup settings (angular_correction_deg, outer_gap_px, inner_gap_px). */
  angularCorrectionDeg: number
  outerGapPx: number
  innerGapPx: number
}

/** One thickness point as stored in result_summary. */
export type RingThicknessPoint = {
  label: RingThicknessLabel
  /** Nominal angle + angular correction + the point's own offset. */
  angle_deg: number
  /** null when the ray did not meet both edges (point not valid). */
  thickness_mm: number | null
  inner_xy: [number, number] | null
  outer_xy: [number, number] | null
}

/**
 * metallography_analyses.result_summary for analysis_kind 'ring_test'.
 * snake_case because it is stored as JSON and read by the SQL recompute
 * (app_metallography_ring_check in migration 20261102101700). Keys the SQL
 * reads: d_mm, thickness[].label / thickness_mm, valid_point_count,
 * area_tm_mm2, area_fp_mm2, tm_share_pct, limits, thickness_decimals,
 * share_decimals, overall_pass. Values are stored rounded to
 * thickness_decimals / share_decimals.
 */
export type RingTestSummary = {
  kind: 'ring_test'
  engine_version: string
  scale_source: 'calibration' | 'in_image'
  mm_per_px_x: number
  mm_per_px_y: number
  /** The single d used for the limits (one source; design 3.6). */
  d_mm: number
  d_source: 'nominal' | 'measured'
  d_nominal_mm: number | null
  d_measured_mm: number | null
  /** Exactly 8 entries, t1..t8. */
  thickness: RingThicknessPoint[]
  valid_point_count: number
  thickness_min_mm: number | null
  thickness_max_mm: number | null
  thickness_mean_mm: number | null
  /** limits.thickness_min_factor × d_mm */
  thickness_range_low_mm: number
  /** limits.thickness_max_factor × d_mm */
  thickness_range_high_mm: number
  thickness_in_range: boolean
  /** Polygon areas by shoelace (circles when the edge is a circle). */
  area_tm_mm2: number
  area_fp_mm2: number
  /** area_tm / (area_tm + area_fp) × 100 */
  tm_share_pct: number
  tm_share_in_range: boolean
  limits: RingTestLimits
  thickness_decimals: number
  share_decimals: number
  /** Engine verdict: shown, never written as the conformity statement. */
  overall_pass: boolean
}

/** Options for detectRing. */
export type DetectRingOptions = {
  /** Which edge(s) to detect. Detecting the outer ring also detects the inner one when none is given. */
  which: 'inner' | 'outer' | 'both'
  /** Seed centre (original pixels); default: existing ring centre, else the image centre. */
  seed?: Point
  /** Expected inner radius in px, narrows the search band. */
  expectedRadiusPx?: number
  /** Rings already placed; the outer ring is kept concentric with the inner one. */
  existing?: { inner?: RingShape | null; outer?: RingShape | null }
}

export type DetectRingResult = {
  /** Proposed edges (marks with origin 'engine' once placed); null when not found. */
  inner: RingShape | null
  outer: RingShape | null
  warnings: string[]
}

/**
 * Edge scans of the old detect-ring.ts, on a GrayImage at original
 * resolution and aspect ratio (no 590×590 stretch, no canvas).
 * Implemented in engines/ringTest/detectRing.ts as `export const detectRing: DetectRingFn`.
 */
export type DetectRingFn = (image: GrayImage, opts: DetectRingOptions) => DetectRingResult

/**
 * IS 1786 ring maths: 8 thickness rays, polygon areas (shoelace), TM share,
 * limits × d, verdict. Pure; rounding to RING_THICKNESS_DECIMALS /
 * RING_SHARE_DECIMALS with lib/is2Rounding. Must agree with the SQL recompute.
 * Implemented in engines/ringTest/ringMaths.ts as `export const computeRing: ComputeRingFn`.
 *
 * @param geometry  confirmed ring geometry (original pixels)
 * @param scale     calibration or in-image scale (no default)
 * @param dMm       nominal bar diameter d in mm (> 0)
 * @param limits    from the method snapshot settings (RING_TEST_DEFAULT_LIMITS when unset)
 */
export type ComputeRingFn = (
  geometry: RingGeometry,
  scale: ScaleInput,
  dMm: number,
  limits: RingTestLimits,
) => RingTestSummary

// ---------------------------------------------------------------------------
// Worker protocol (engines/analysis.worker.ts <-> engines/runEngine.ts)
// ---------------------------------------------------------------------------

/** Requests the worker understands. Phase 1: ring detection only (ring maths is cheap and runs inline). */
export type EngineRequest = { id: string; type: 'detectRing'; image: GrayImage; opts: DetectRingOptions }

export type EngineResponse =
  | { id: string; ok: true; type: 'detectRing'; result: DetectRingResult }
  | { id: string; ok: false; error: string }
