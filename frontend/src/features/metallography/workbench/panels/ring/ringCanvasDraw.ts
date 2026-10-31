/**
 * Canvas drawing for the ring editor (old RingEditor drawInnerShape,
 * drawHandle, drawCenter, drawGridAndRulers and the line / thickness blocks
 * of its render effect).
 *
 * The canvas is the size of its box (not of the image), so a 25 MP photo can
 * be zoomed without a giant canvas. A ViewTransform maps original image
 * pixels to CSS pixels on the canvas: screen = pan + image × zoom. Line widths
 * and handle sizes are screen pixels, so they stay readable at any zoom.
 */
import type { RingThicknessPoint } from '@/features/metallography/engines/types'
import { getPolygonPoints, type EdgeCircle, type EdgeShapeConfig, type Line } from './ringGeometry'

export type ViewTransform = { zoom: number; panX: number; panY: number }

export const HANDLE_RADIUS_PX = 6
export const SELECTED_EDGE_COLOR = '#22d3ee'
export const SELECTED_LINE_COLOR = '#facc15'

const LABEL_FONT = '600 12px "Plus Jakarta Sans", Inter, system-ui, sans-serif'

export function toScreen(v: ViewTransform, x: number, y: number): { x: number; y: number } {
  return { x: v.panX + x * v.zoom, y: v.panY + y * v.zoom }
}

export function toImage(v: ViewTransform, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom }
}

export function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.fillStyle = '#1c1917'
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, HANDLE_RADIUS_PX, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export function drawCentre(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** White text with a dark outline, readable on any photo. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save()
  ctx.font = LABEL_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'
  ctx.fillStyle = '#ffffff'
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** Circle or polygon edge; in its own tool also the resize and centre handles. */
export function drawEdge(
  ctx: CanvasRenderingContext2D,
  v: ViewTransform,
  circle: EdgeCircle,
  shape: EdgeShapeConfig,
  style: { color: string; width: number },
  opts: { active: boolean; selectedPoint: number | null; selectedEdges: number[] },
) {
  const c = toScreen(v, circle.cx, circle.cy)
  ctx.save()
  ctx.strokeStyle = style.color
  ctx.fillStyle = style.color
  ctx.lineWidth = style.width
  if (shape.mode === 'circle') {
    ctx.beginPath()
    ctx.arc(c.x, c.y, circle.r * v.zoom, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    const pts = getPolygonPoints(circle, shape).map((p) => toScreen(v, p.x, p.y))
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      ctx.beginPath()
      ctx.strokeStyle = opts.active && opts.selectedEdges.includes(i) ? SELECTED_EDGE_COLOR : style.color
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    for (let i = 0; i < pts.length; i += 1) {
      const selected = opts.active && i === opts.selectedPoint
      ctx.beginPath()
      ctx.fillStyle = selected ? SELECTED_EDGE_COLOR : style.color
      ctx.arc(pts[i].x, pts[i].y, selected ? 5 : opts.active ? 3.5 : 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
  drawCentre(ctx, c.x, c.y, style.color)
  if (opts.active) {
    drawHandle(ctx, c.x, c.y, style.color)
    const r = toScreen(v, circle.cx + circle.r, circle.cy)
    drawHandle(ctx, r.x, r.y, style.color)
  }
}

/** Measured line with end handles and a length label at its middle. */
export function drawMeasureLine(
  ctx: CanvasRenderingContext2D,
  v: ViewTransform,
  line: Line,
  style: { color: string; width: number },
  opts: { selected: boolean; dashed: boolean; label: string; handles: boolean },
) {
  const a = toScreen(v, line.x1, line.y1)
  const b = toScreen(v, line.x2, line.y2)
  const color = opts.selected ? SELECTED_LINE_COLOR : style.color
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = style.width
  if (opts.dashed) ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.restore()
  if (opts.handles) {
    drawHandle(ctx, a.x, a.y, color)
    drawHandle(ctx, b.x, b.y, color)
  }
  if (opts.label) drawLabel(ctx, opts.label, (a.x + b.x) / 2 + 8, (a.y + b.y) / 2 - 8)
}

/** t1..t8 rays with end dots; the label sits outside the ring. */
export function drawThicknessPoints(
  ctx: CanvasRenderingContext2D,
  v: ViewTransform,
  points: ReadonlyArray<RingThicknessPoint>,
  centre: { x: number; y: number },
  style: { color: string; width: number },
  opts: { selected: ReadonlySet<number>; showValues: boolean },
) {
  const c = toScreen(v, centre.x, centre.y)
  points.forEach((p, idx) => {
    if (!p.inner_xy || !p.outer_xy) return
    const i = toScreen(v, p.inner_xy[0], p.inner_xy[1])
    const o = toScreen(v, p.outer_xy[0], p.outer_xy[1])
    const color = opts.selected.has(idx) ? SELECTED_LINE_COLOR : style.color
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = style.width
    ctx.beginPath()
    ctx.moveTo(i.x, i.y)
    ctx.lineTo(o.x, o.y)
    ctx.stroke()
    const r = Math.max(3, style.width + 2)
    ctx.beginPath()
    ctx.arc(i.x, i.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    const mx = (i.x + o.x) / 2
    const my = (i.y + o.y) / 2
    const dx = mx - c.x
    const dy = my - c.y
    const norm = Math.max(1, Math.hypot(dx, dy))
    const text =
      opts.showValues && p.thickness_mm !== null ? `${p.label}  ${p.thickness_mm.toFixed(3)} mm` : p.label
    drawLabel(ctx, text, mx + (dx / norm) * 18 + 4, my + (dy / norm) * 18)
  })
}

const NICE_STEPS = [1, 2, 5]

/** Smallest 1-2-5 step in image pixels that is at least `minScreenPx` apart on screen. */
function gridStep(zoom: number, minScreenPx: number): number {
  for (let exp = 0; exp < 9; exp += 1) {
    for (const s of NICE_STEPS) {
      const step = s * 10 ** exp
      if (step * zoom >= minScreenPx) return step
    }
  }
  return 10 ** 9
}

const RULER = 18

/** Pixel grid and rulers in image coordinates (labels are original pixels). */
export function drawGridAndRulers(
  ctx: CanvasRenderingContext2D,
  v: ViewTransform,
  cssW: number,
  cssH: number,
  imgW: number,
  imgH: number,
) {
  const step = gridStep(v.zoom, 24)
  const major = step * 5
  const left = Math.max(0, v.panX)
  const top = Math.max(0, v.panY)
  const right = Math.min(cssW, v.panX + imgW * v.zoom)
  const bottom = Math.min(cssH, v.panY + imgH * v.zoom)
  if (right <= left || bottom <= top) return

  const firstX = Math.max(0, Math.ceil(toImage(v, left, 0).x / step) * step)
  const firstY = Math.max(0, Math.ceil(toImage(v, 0, top).y / step) * step)

  ctx.save()
  ctx.lineWidth = 1
  for (let x = firstX; x <= imgW; x += step) {
    const sx = Math.round(v.panX + x * v.zoom) + 0.5
    if (sx > right) break
    ctx.strokeStyle = x % major === 0 ? 'rgba(245,245,244,0.32)' : 'rgba(245,245,244,0.14)'
    ctx.beginPath()
    ctx.moveTo(sx, top)
    ctx.lineTo(sx, bottom)
    ctx.stroke()
  }
  for (let y = firstY; y <= imgH; y += step) {
    const sy = Math.round(v.panY + y * v.zoom) + 0.5
    if (sy > bottom) break
    ctx.strokeStyle = y % major === 0 ? 'rgba(245,245,244,0.32)' : 'rgba(245,245,244,0.14)'
    ctx.beginPath()
    ctx.moveTo(left, sy)
    ctx.lineTo(right, sy)
    ctx.stroke()
  }

  // Ruler bands (top and left of the viewport).
  ctx.fillStyle = 'rgba(250,250,249,0.88)'
  ctx.fillRect(0, 0, cssW, RULER)
  ctx.fillRect(0, 0, RULER, cssH)
  ctx.strokeStyle = 'rgba(68,64,60,0.7)'
  ctx.fillStyle = '#44403c'
  ctx.font = '10px "Plus Jakarta Sans", Inter, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (let x = firstX; x <= imgW; x += step) {
    const sx = Math.round(v.panX + x * v.zoom) + 0.5
    if (sx > right) break
    if (sx < RULER) continue
    const isMajor = x % major === 0
    ctx.beginPath()
    ctx.moveTo(sx, RULER)
    ctx.lineTo(sx, RULER - (isMajor ? 10 : 5))
    ctx.stroke()
    if (isMajor) ctx.fillText(String(x), sx + 2, 2)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let y = firstY; y <= imgH; y += step) {
    const sy = Math.round(v.panY + y * v.zoom) + 0.5
    if (sy > bottom) break
    if (sy < RULER) continue
    const isMajor = y % major === 0
    ctx.beginPath()
    ctx.moveTo(RULER, sy)
    ctx.lineTo(RULER - (isMajor ? 10 : 5), sy)
    ctx.stroke()
    if (isMajor) {
      ctx.save()
      ctx.translate(9, sy)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillText(String(y), 0, 0)
      ctx.restore()
    }
  }
  ctx.fillStyle = 'rgba(231,229,228,0.95)'
  ctx.fillRect(0, 0, RULER, RULER)
  ctx.restore()
}
