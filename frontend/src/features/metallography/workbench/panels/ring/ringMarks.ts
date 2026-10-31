/**
 * Ring geometry <-> field marks (metallography_fields.marks.items), design 3.6
 * "raw image and full geometry saved".
 *
 * Marks written for a ring test:
 *  - ring_inner / ring_outer: circle or polygon geometry; meta.cx / meta.cy
 *    hold the ray centre of a polygon. ring_outer.meta also carries the
 *    geometry-wide values (thickness_applied, angular_correction_deg,
 *    outer_gap_px, inner_gap_px) because Mark.meta holds scalars only.
 *  - ring_diameter_line: one line per measured diameter, labels D1, D2, ...
 *    (informative; d for the limits is the nominal d).
 *  - ring_thickness_point: t1..t8 once the points are applied, a line from
 *    the inner to the outer edge; meta holds thickness_mm, angle_deg and the
 *    operator's fine adjustment (angle_offset_deg, delta_px).
 *
 * restoreRingState() reads them back, so the editor (and a reviewer's
 * re-check) rebuilds exactly the geometry that produced result_summary.
 */
import {
  RING_THICKNESS_LABELS,
  type Geometry,
  type Mark,
  type MarkOrigin,
  type RingGeometry,
  type RingPointOffset,
  type RingShape,
  type RingThicknessPoint,
} from '@/features/metallography/engines/types'
import type { Line } from './ringGeometry'

export type RingMarkState = {
  inner: RingShape | null
  outer: RingShape | null
  innerOrigin: MarkOrigin
  outerOrigin: MarkOrigin
  diameterLines: Line[]
  thicknessApplied: boolean
  /** 8 entries in t1..t8 order. */
  pointOffsets: RingPointOffset[]
  angularCorrectionDeg: number
  outerGapPx: number
  innerGapPx: number
}

export type RingStateDefaults = Pick<RingMarkState, 'angularCorrectionDeg' | 'outerGapPx' | 'innerGapPx'>

/**
 * Stand-in for an edge that is not placed. RingGeometry needs both edges, so a
 * partly drawn ring is reported with r = 0; the marks (not this geometry) are
 * what restores the editor, and they simply leave the missing edge out.
 */
export const RING_SHAPE_NOT_PLACED: RingShape = { type: 'circle', cx: 0, cy: 0, r: 0 }

export function zeroPointOffsets(): RingPointOffset[] {
  return RING_THICKNESS_LABELS.map(() => ({ angleOffsetDeg: 0, deltaPx: 0 }))
}

function isPlaced(shape: RingShape | null | undefined): shape is RingShape {
  if (!shape) return false
  return shape.type === 'circle' ? shape.r > 0 : shape.points.length >= 3
}

export function geometryFromState(s: RingMarkState): RingGeometry {
  return {
    inner: s.inner ?? RING_SHAPE_NOT_PLACED,
    outer: s.outer ?? RING_SHAPE_NOT_PLACED,
    diameterLines: s.diameterLines.map((l) => ({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })),
    thicknessApplied: s.thicknessApplied && isPlaced(s.inner) && isPlaced(s.outer),
    pointOffsets: s.pointOffsets.map((p) => ({ angleOffsetDeg: p.angleOffsetDeg, deltaPx: p.deltaPx })),
    angularCorrectionDeg: s.angularCorrectionDeg,
    outerGapPx: s.outerGapPx,
    innerGapPx: s.innerGapPx,
  }
}

function shapeGeometry(shape: RingShape): Geometry {
  return shape.type === 'circle'
    ? { type: 'circle', cx: shape.cx, cy: shape.cy, r: shape.r }
    : { type: 'polygon', points: shape.points.map((p) => ({ x: p.x, y: p.y })) }
}

/** Marks for field.marks.items. `thickness` is the summary's (or the display) t1..t8, when known. */
export function buildRingMarks(s: RingMarkState, thickness: RingThicknessPoint[] | null): Mark[] {
  const marks: Mark[] = []
  if (isPlaced(s.inner)) {
    marks.push({
      id: 'ring_inner',
      kind: 'ring_inner',
      origin: s.innerOrigin,
      geometry: shapeGeometry(s.inner),
      label: 'Inner',
      meta: { cx: s.inner.cx, cy: s.inner.cy },
    })
  }
  if (isPlaced(s.outer)) {
    marks.push({
      id: 'ring_outer',
      kind: 'ring_outer',
      origin: s.outerOrigin,
      geometry: shapeGeometry(s.outer),
      label: 'Outer',
      meta: {
        cx: s.outer.cx,
        cy: s.outer.cy,
        thickness_applied: s.thicknessApplied && isPlaced(s.inner),
        angular_correction_deg: s.angularCorrectionDeg,
        outer_gap_px: s.outerGapPx,
        inner_gap_px: s.innerGapPx,
      },
    })
  }
  s.diameterLines.forEach((l, i) => {
    marks.push({
      id: `ring_d${i + 1}`,
      kind: 'ring_diameter_line',
      origin: 'operator',
      geometry: { type: 'line', x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 },
      label: `D${i + 1}`,
    })
  })
  if (s.thicknessApplied && isPlaced(s.inner) && isPlaced(s.outer)) {
    const centre = { x: s.outer.cx, y: s.outer.cy }
    RING_THICKNESS_LABELS.forEach((label, i) => {
      const off = s.pointOffsets[i] ?? { angleOffsetDeg: 0, deltaPx: 0 }
      const p = thickness?.find((t) => t.label === label) ?? null
      const geometry: Geometry =
        p?.inner_xy && p.outer_xy
          ? { type: 'line', x1: p.inner_xy[0], y1: p.inner_xy[1], x2: p.outer_xy[0], y2: p.outer_xy[1] }
          : { type: 'point', x: centre.x, y: centre.y }
      marks.push({
        id: `ring_${label}`,
        kind: 'ring_thickness_point',
        origin: off.angleOffsetDeg !== 0 || off.deltaPx !== 0 ? 'operator' : 'engine',
        geometry,
        label,
        meta: {
          angle_deg: p?.angle_deg ?? null,
          thickness_mm: p?.thickness_mm ?? null,
          valid: Boolean(p && p.thickness_mm !== null),
          angle_offset_deg: off.angleOffsetDeg,
          delta_px: off.deltaPx,
        },
      })
    })
  }
  return marks
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function shapeFromMark(m: Mark | undefined): RingShape | null {
  if (!m) return null
  const g = m.geometry
  if (g.type === 'circle') return g.r > 0 ? { type: 'circle', cx: g.cx, cy: g.cy, r: g.r } : null
  if (g.type === 'polygon' && g.points.length >= 3) {
    const meanX = g.points.reduce((s, p) => s + p.x, 0) / g.points.length
    const meanY = g.points.reduce((s, p) => s + p.y, 0) / g.points.length
    return {
      type: 'polygon',
      cx: num(m.meta?.cx, meanX),
      cy: num(m.meta?.cy, meanY),
      points: g.points.map((p) => ({ x: p.x, y: p.y })),
    }
  }
  return null
}

/** Editor state from stored marks; null when the field has no ring marks yet. */
export function restoreRingState(items: ReadonlyArray<Mark> | null | undefined, defaults: RingStateDefaults): RingMarkState | null {
  const list = items ?? []
  const innerMark = list.find((m) => m.kind === 'ring_inner')
  const outerMark = list.find((m) => m.kind === 'ring_outer')
  const diam = list.filter((m) => m.kind === 'ring_diameter_line')
  const thick = list.filter((m) => m.kind === 'ring_thickness_point')
  if (!innerMark && !outerMark && diam.length === 0 && thick.length === 0) return null

  const meta = outerMark?.meta ?? {}
  const pointOffsets = zeroPointOffsets()
  RING_THICKNESS_LABELS.forEach((label, i) => {
    const m = thick.find((t) => t.label === label)
    if (m) pointOffsets[i] = { angleOffsetDeg: num(m.meta?.angle_offset_deg, 0), deltaPx: num(m.meta?.delta_px, 0) }
  })
  return {
    inner: shapeFromMark(innerMark),
    outer: shapeFromMark(outerMark),
    innerOrigin: innerMark?.origin ?? 'operator',
    outerOrigin: outerMark?.origin ?? 'operator',
    diameterLines: diam.flatMap((m) =>
      m.geometry.type === 'line' ? [{ x1: m.geometry.x1, y1: m.geometry.y1, x2: m.geometry.x2, y2: m.geometry.y2 }] : [],
    ),
    thicknessApplied: typeof meta.thickness_applied === 'boolean' ? meta.thickness_applied : thick.length > 0,
    pointOffsets,
    angularCorrectionDeg: num(meta.angular_correction_deg, defaults.angularCorrectionDeg),
    outerGapPx: num(meta.outer_gap_px, defaults.outerGapPx),
    innerGapPx: num(meta.inner_gap_px, defaults.innerGapPx),
  }
}

/** Editor state from a RingGeometry (r = 0 edges count as not placed). */
export function ringStateFromGeometry(g: RingGeometry, origin: MarkOrigin = 'operator'): RingMarkState {
  const offsets = zeroPointOffsets().map((z, i) => g.pointOffsets[i] ?? z)
  return {
    inner: isPlaced(g.inner) ? g.inner : null,
    outer: isPlaced(g.outer) ? g.outer : null,
    innerOrigin: origin,
    outerOrigin: origin,
    diameterLines: g.diameterLines.map((l) => ({ ...l })),
    thicknessApplied: g.thicknessApplied,
    pointOffsets: offsets,
    angularCorrectionDeg: g.angularCorrectionDeg,
    outerGapPx: g.outerGapPx,
    innerGapPx: g.innerGapPx,
  }
}

/**
 * The RingGeometry stored in a field's marks (for the S3 re-check and the
 * worksheet); null unless both edges are placed.
 */
export function ringGeometryFromMarks(items: ReadonlyArray<Mark> | null | undefined, defaults: RingStateDefaults): RingGeometry | null {
  const s = restoreRingState(items, defaults)
  if (!s || !s.inner || !s.outer) return null
  return geometryFromState(s)
}
