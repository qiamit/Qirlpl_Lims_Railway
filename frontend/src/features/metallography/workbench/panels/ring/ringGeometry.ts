/**
 * Ring editor geometry helpers (port of the helper functions at the end of the
 * old RingEditor.tsx, Metallurgy Software commit d1f9745).
 *
 * Everything here is in ORIGINAL image pixels (x to the right, y down). The
 * editor keeps a ring edge as a circle plus a shape config (circle, or an
 * N-sided polygon whose vertices can be moved one by one), exactly as the old
 * editor did, and converts it to the stored RingShape only when it reports a
 * change. No DOM, no React.
 */
import type { Point, RingShape, ScaleInput } from '@/features/metallography/engines/types'
import { scaleToMmPerPx } from '@/features/metallography/engines/types'

export type EdgeCircle = { cx: number; cy: number; r: number }

export type EdgeShapeMode = 'circle' | 'polygon'

/** Circle, or polygon of `sides` vertices on the circle, each with its own offset. */
export type EdgeShapeConfig = {
  mode: EdgeShapeMode
  sides: number
  rotationDeg: number
  pointOffsets: Array<{ dx: number; dy: number }>
}

export type Line = { x1: number; y1: number; x2: number; y2: number }

/** In-image reference line; length_mm null until the operator enters it. */
export type RefLine = Line & { length_mm: number | null }

export const DEFAULT_EDGE_SHAPE: EdgeShapeConfig = { mode: 'circle', sides: 25, rotationDeg: 0, pointOffsets: [] }

export const MIN_RING_RADIUS = 4
export const MIN_POLYGON_SIDES = 3
export const MAX_POLYGON_SIDES = 64

export function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function normalizeDeg(deg: number): number {
  const next = deg % 360
  return next < 0 ? next + 360 : next
}

/** Pads / trims the vertex offsets to the number of sides. */
export function ensurePointOffsets(shape: EdgeShapeConfig): EdgeShapeConfig {
  const points = Math.max(MIN_POLYGON_SIDES, Math.round(shape.sides))
  const current = shape.pointOffsets ?? []
  if (current.length === points) return shape
  return { ...shape, pointOffsets: Array.from({ length: points }, (_, i) => current[i] ?? { dx: 0, dy: 0 }) }
}

/** Vertex i without its own offset. */
export function polygonBasePoint(c: EdgeCircle, shape: EdgeShapeConfig, i: number): Point {
  const points = Math.max(MIN_POLYGON_SIDES, Math.round(shape.sides))
  const t = (shape.rotationDeg * Math.PI) / 180 + (i / points) * Math.PI * 2
  return { x: c.cx + Math.cos(t) * c.r, y: c.cy + Math.sin(t) * c.r }
}

export function getPolygonPoints(c: EdgeCircle, shape: EdgeShapeConfig): Point[] {
  const fixed = ensurePointOffsets(shape)
  const points = Math.max(MIN_POLYGON_SIDES, Math.round(fixed.sides))
  const out: Point[] = []
  for (let i = 0; i < points; i += 1) {
    const base = polygonBasePoint(c, fixed, i)
    const off = fixed.pointOffsets[i] ?? { dx: 0, dy: 0 }
    out.push({ x: base.x + off.dx, y: base.y + off.dy })
  }
  return out
}

/** Editor edge -> stored RingShape (polygon vertices are absolute image pixels). */
export function edgeToRingShape(c: EdgeCircle, shape: EdgeShapeConfig): RingShape {
  if (shape.mode === 'polygon') return { type: 'polygon', cx: c.cx, cy: c.cy, points: getPolygonPoints(c, shape) }
  return { type: 'circle', cx: c.cx, cy: c.cy, r: c.r }
}

/**
 * Stored / detected RingShape -> editor edge. A polygon becomes a circle of the
 * mean vertex distance, rotated to the first vertex, with per-vertex offsets,
 * so the vertices come back exactly where they were.
 */
export function ringShapeToEdge(shape: RingShape): { circle: EdgeCircle; config: EdgeShapeConfig } {
  if (shape.type === 'circle' || shape.points.length < MIN_POLYGON_SIDES) {
    const r = shape.type === 'circle' ? shape.r : 0
    return { circle: { cx: shape.cx, cy: shape.cy, r: Math.max(MIN_RING_RADIUS, r) }, config: { ...DEFAULT_EDGE_SHAPE } }
  }
  const { cx, cy, points } = shape
  const r = Math.max(MIN_RING_RADIUS, points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length)
  const rotationDeg = (Math.atan2(points[0].y - cy, points[0].x - cx) * 180) / Math.PI
  const circle = { cx, cy, r }
  const config: EdgeShapeConfig = { mode: 'polygon', sides: points.length, rotationDeg, pointOffsets: [] }
  config.pointOffsets = points.map((p, i) => {
    const base = polygonBasePoint(circle, config, i)
    return { dx: p.x - base.x, dy: p.y - base.y }
  })
  return { circle, config }
}

/** Starting circles when the operator opens a ring tool on an empty image (old suggestInitialCircles). */
export function suggestInitialCircles(width: number, height: number): { inner: EdgeCircle; outer: EdgeCircle } {
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) * 0.45
  return { outer: { cx, cy, r }, inner: { cx, cy, r: r * 0.5 } }
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1)
  const t = clampNum(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1)
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export function findPolygonEdgeNearPoint(px: number, py: number, points: Point[], tolerance: number): number {
  if (points.length < 2) return -1
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (distanceToSegment(px, py, a.x, a.y, b.x, b.y) <= tolerance) return i
  }
  return -1
}

/** Line under the pointer: an end handle (`end` set) or the segment itself. Last drawn wins. */
export function findLineHit(
  px: number,
  py: number,
  lines: ReadonlyArray<Line>,
  handleTol: number,
  segmentTol: number,
): { index: number; end: 'start' | 'end' | null } | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const l = lines[i]
    if (Math.hypot(px - l.x1, py - l.y1) <= handleTol) return { index: i, end: 'start' }
    if (Math.hypot(px - l.x2, py - l.y2) <= handleTol) return { index: i, end: 'end' }
    if (distanceToSegment(px, py, l.x1, l.y1, l.x2, l.y2) <= segmentTol) return { index: i, end: null }
  }
  return null
}

/** Selected polygon edges -> the vertices they move. */
export function edgeSelectionToVertexIndexes(edgeIndexes: number[], sideCount: number): number[] {
  const set = new Set<number>()
  edgeIndexes.forEach((idx) => {
    if (idx < 0 || idx >= sideCount) return
    set.add(idx)
    set.add((idx + 1) % sideCount)
  })
  return [...set]
}

// ---------------------------------------------------------------------------
// Rays (diameter lines through a ring)
// ---------------------------------------------------------------------------

function solveRayCircle(px: number, py: number, cos: number, sin: number, c: EdgeCircle): number | null {
  const dx = px - c.cx
  const dy = py - c.cy
  const b = 2 * (dx * cos + dy * sin)
  const cc = dx * dx + dy * dy - c.r * c.r
  const disc = b * b - 4 * cc
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  const t1 = (-b - sq) / 2
  const t2 = (-b + sq) / 2
  if (t1 > 1e-3) return t1
  if (t2 > 1e-3) return t2
  return null
}

function raySegmentIntersectionT(
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
  if (t <= 1e-3) return null
  if (u < -1e-6 || u > 1 + 1e-6) return null
  return t
}

function solveRayShape(px: number, py: number, cos: number, sin: number, c: EdgeCircle, poly: Point[] | null): number | null {
  if (poly && poly.length >= MIN_POLYGON_SIDES) {
    let best: number | null = null
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const t = raySegmentIntersectionT(px, py, cos, sin, a.x, a.y, b.x, b.y)
      if (t !== null && (best === null || t < best)) best = t
    }
    if (best !== null) return best
  }
  return solveRayCircle(px, py, cos, sin, c)
}

/** Diameter chord through the ring centre at angleDeg, clamped to the circle / polygon edge. */
export function diameterLineThroughRing(ring: EdgeCircle, shape: EdgeShapeConfig, angleDeg: number): Line {
  const poly = shape.mode === 'polygon' ? getPolygonPoints(ring, shape) : null
  const edgeDist = (deg: number) => {
    const a = (deg * Math.PI) / 180
    const t = solveRayShape(ring.cx, ring.cy, Math.cos(a), Math.sin(a), ring, poly)
    return t !== null && t > 1 ? t : ring.r
  }
  const a1 = angleDeg
  const a2 = angleDeg + 180
  const r1 = edgeDist(a1)
  const r2 = edgeDist(a2)
  return {
    x1: ring.cx + Math.cos((a2 * Math.PI) / 180) * r2,
    y1: ring.cy + Math.sin((a2 * Math.PI) / 180) * r2,
    x2: ring.cx + Math.cos((a1 * Math.PI) / 180) * r1,
    y2: ring.cy + Math.sin((a1 * Math.PI) / 180) * r1,
  }
}

/** Rotates a diameter line about the ring centre and re-clamps it to the edge (old rotateDiameterLines). */
export function rotateDiameterLine(line: Line, ring: EdgeCircle, shape: EdgeShapeConfig, deltaDeg: number): Line {
  const midX = (line.x1 + line.x2) / 2
  const midY = (line.y1 + line.y2) / 2
  let angleDeg = (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI
  if (Math.hypot(midX - ring.cx, midY - ring.cy) > 2) {
    angleDeg = (Math.atan2(midY - ring.cy, midX - ring.cx) * 180) / Math.PI
  }
  return diameterLineThroughRing(ring, shape, angleDeg + deltaDeg)
}

/** Pure rotation of lines about their common mid point (no ring placed). */
export function rotateLinesAboutCentre(lines: Line[], deltaDeg: number): Line[] {
  if (lines.length === 0) return lines
  const cx = lines.reduce((s, l) => s + (l.x1 + l.x2) / 2, 0) / lines.length
  const cy = lines.reduce((s, l) => s + (l.y1 + l.y2) / 2, 0) / lines.length
  const rad = (deltaDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rot = (x: number, y: number) => ({ x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos })
  return lines.map((l) => {
    const p1 = rot(l.x1, l.y1)
    const p2 = rot(l.x2, l.y2)
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
  })
}

// ---------------------------------------------------------------------------
// Lengths and scale
// ---------------------------------------------------------------------------

export function lineLengthPx(l: Line): number {
  return Math.hypot(l.x2 - l.x1, l.y2 - l.y1)
}

/** Length in mm with the x and y scale applied separately; null without a scale. */
export function lineLengthMm(l: Line, scale: ScaleInput | null): number | null {
  if (!scale) return null
  const s = scaleToMmPerPx(scale)
  return Math.hypot((l.x2 - l.x1) * s.x, (l.y2 - l.y1) * s.y)
}

/** Reference lines the database accepts: known length > 0 and at least 1 px long. */
export function validRefLines(lines: ReadonlyArray<RefLine>): Array<Line & { length_mm: number }> {
  return lines.filter((l): l is Line & { length_mm: number } =>
    l.length_mm !== null && Number.isFinite(l.length_mm) && l.length_mm > 0 && lineLengthPx(l) >= 1,
  )
}

/**
 * mm per pixel from reference lines, the same rule as the database
 * (app_metallography_in_image_scale): mean(length_mm / length_px), rounded to 8 decimals.
 */
export function mmPerPxFromRefLines(lines: ReadonlyArray<RefLine>): number | null {
  const valid = validRefLines(lines)
  if (valid.length === 0) return null
  const sum = valid.reduce((s, l) => s + l.length_mm / lineLengthPx(l), 0)
  return Math.round((sum / valid.length) * 1e8) / 1e8
}
