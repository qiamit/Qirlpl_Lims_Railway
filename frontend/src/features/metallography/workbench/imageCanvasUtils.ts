import {
  MAX_ENGINE_PIXELS,
  rgbaToGray,
  type Annotation,
  type FieldMarks,
  type GrayImage,
  type Mark,
  type OperatorAdjustments,
  type Point,
  type ScaleInput,
} from '../engines/types'
import { verifyStoredHash } from '../metallographyStorage'
import type { Analysis, AnalysisField, InImageScale } from '../types'

/**
 * Canvas and geometry helpers for the workbench (port of the old
 * lib/imageCanvasUtils.ts; floodFillCanvas and drawDiamond dropped, design 3.8).
 *
 * Everything that is stored is in ORIGINAL image pixels. These helpers only
 * convert between screen and image pixels, decode the downloaded original
 * (never a signed URL, so the canvas is not tainted) and draw the vector layers
 * for the overlay PNG and the worksheet.
 */

// ---------------------------------------------------------------------------
// Layout (ported)
// ---------------------------------------------------------------------------

/** object-fit: contain maths: where an image of imageWidth × imageHeight sits in the container. */
export function getContainedImageRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (!(containerWidth > 0) || !(containerHeight > 0) || !(imageWidth > 0) || !(imageHeight > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const containerAspect = containerWidth / containerHeight
  const imageAspect = imageWidth / imageHeight
  if (imageAspect > containerAspect) {
    const width = containerWidth
    const height = containerWidth / imageAspect
    return { x: 0, y: (containerHeight - height) / 2, width, height }
  }
  const height = containerHeight
  const width = containerHeight * imageAspect
  return { x: (containerWidth - width) / 2, y: 0, width, height }
}

/**
 * Pointer to original image pixels, from the on-screen box of the image layer
 * (getBoundingClientRect already includes the zoom / pan transform).
 * Returns null outside the image unless `clampToImage`.
 */
export function clientToImagePoint(
  clientX: number,
  clientY: number,
  layer: Element,
  imageWidth: number,
  imageHeight: number,
  clampToImage = false,
): Point | null {
  const r = layer.getBoundingClientRect()
  if (!(r.width > 0) || !(r.height > 0)) return null
  let x = ((clientX - r.left) / r.width) * imageWidth
  let y = ((clientY - r.top) / r.height) * imageHeight
  if (x < 0 || y < 0 || x > imageWidth || y > imageHeight) {
    if (!clampToImage) return null
    x = Math.min(imageWidth, Math.max(0, x))
    y = Math.min(imageHeight, Math.max(0, y))
  }
  return { x: round2(x), y: round2(y) }
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function normalizeRect(x0: number, y0: number, x1: number, y1: number) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  }
}

export function hexToRgba(hex: string, alpha = 1) {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const value = Number.parseInt(full, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    a: Math.round(alpha * 255),
  }
}

export function lineLengthPx(l: { x1: number; y1: number; x2: number; y2: number }): number {
  return Math.hypot(l.x2 - l.x1, l.y2 - l.y1)
}

/** mm per pixel of an in-image scale: mean(length_mm / length_px), as the database computes it (rounded to 8 decimals). */
export function inImageMmPerPx(s: InImageScale | null | undefined): number | null {
  const lines = (s?.lines ?? []).filter((l) => l.length_mm > 0 && lineLengthPx(l) >= 1)
  if (lines.length === 0) return null
  const mean = lines.reduce((sum, l) => sum + l.length_mm / lineLengthPx(l), 0) / lines.length
  return Math.round(mean * 1e8) / 1e8
}

export function drawArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lineWidth: number) {
  const head = Math.max(10, lineWidth * 3.5)
  const angle = Math.atan2(y1 - y0, x1 - x0)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - head * Math.cos(angle - Math.PI / 6), y1 - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x1 - head * Math.cos(angle + Math.PI / 6), y1 - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle
  ctx.fill()
}

/** Arrow head points (SVG polygon) for an arrow ending at (x1, y1). */
export function arrowHeadPoints(x0: number, y0: number, x1: number, y1: number, head: number): string {
  const angle = Math.atan2(y1 - y0, x1 - x0)
  const a = [x1 - head * Math.cos(angle - Math.PI / 6), y1 - head * Math.sin(angle - Math.PI / 6)]
  const b = [x1 - head * Math.cos(angle + Math.PI / 6), y1 - head * Math.sin(angle + Math.PI / 6)]
  return `${x1},${y1} ${a[0]},${a[1]} ${b[0]},${b[1]}`
}

// ---------------------------------------------------------------------------
// Colours of the vector layers (same on screen, overlay PNG and worksheet)
// ---------------------------------------------------------------------------

export const LAYER_COLORS = {
  /** Engine proposals. */
  engine: '#f59e0b',
  /** Operator marks (drawn or moved by the analyst). */
  operator: '#22d3ee',
  roi: '#fde047',
  exclusion: '#ef4444',
  scaleLine: '#e879f9',
  annotation: '#facc15',
} as const

export function markColor(m: Pick<Mark, 'origin'>): string {
  return m.origin === 'engine' ? LAYER_COLORS.engine : LAYER_COLORS.operator
}

// ---------------------------------------------------------------------------
// Lengths and the scale bar
// ---------------------------------------------------------------------------

/** "1.234 mm" or "56.7 µm". */
export function formatLengthMm(mm: number | null | undefined): string {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return '—'
  if (Math.abs(mm) < 1) return `${(mm * 1000).toFixed(mm * 1000 < 10 ? 2 : 1)} µm`
  return `${mm.toFixed(3)} mm`
}

const NICE_STEPS = [1, 2, 5]

/**
 * Round scale-bar length (mm) whose on-screen size is close to `targetPx`.
 * `screenPxPerMm` = on-screen pixels for one millimetre.
 */
export function niceScaleBar(screenPxPerMm: number, targetPx = 120): { mm: number; px: number } | null {
  if (!(screenPxPerMm > 0) || !Number.isFinite(screenPxPerMm)) return null
  const raw = targetPx / screenPxPerMm
  const exp = Math.floor(Math.log10(raw))
  let best = NICE_STEPS[0] * 10 ** exp
  for (let e = exp - 1; e <= exp + 1; e += 1) {
    for (const s of NICE_STEPS) {
      const v = s * 10 ** e
      if (Math.abs(v - raw) < Math.abs(best - raw)) best = v
    }
  }
  return { mm: best, px: best * screenPxPerMm }
}

// ---------------------------------------------------------------------------
// Decoding the original
// ---------------------------------------------------------------------------

export type DecodedImage = { width: number; height: number; gray: GrayImage }

function canvasOf(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

function context2d(c: OffscreenCanvas | HTMLCanvasElement): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('This browser cannot draw images (no 2D canvas).')
  return ctx
}

/** Width and height of an image file; throws a readable error when the browser cannot decode it. */
export async function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  let bmp: ImageBitmap | null = null
  try {
    bmp = await createImageBitmap(blob)
    return { width: bmp.width, height: bmp.height }
  } catch {
    throw new Error('The image could not be read. Use PNG, JPEG, BMP or WebP.')
  } finally {
    bmp?.close()
  }
}

/**
 * Original pixels as an 8-bit grey image (engines/types LUMA_WEIGHTS), at full
 * resolution and aspect ratio (no 590 × 590 resize).
 */
export async function decodeToGray(blob: Blob): Promise<DecodedImage> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(blob)
  } catch {
    throw new Error('The image could not be read. Use PNG, JPEG, BMP or WebP.')
  }
  try {
    const { width, height } = bmp
    if (width * height > MAX_ENGINE_PIXELS) {
      throw new Error(`The image is ${((width * height) / 1_000_000).toFixed(1)} MP; the limit is ${MAX_ENGINE_PIXELS / 1_000_000} MP.`)
    }
    const canvas = canvasOf(width, height)
    const ctx = context2d(canvas)
    ctx.drawImage(bmp, 0, 0)
    const data = ctx.getImageData(0, 0, width, height)
    return { width, height, gray: rgbaToGray({ width, height, data: data.data }) }
  } finally {
    bmp.close()
  }
}

// ---------------------------------------------------------------------------
// Stored originals: download once, re-hash on every open
// ---------------------------------------------------------------------------

/** Result of re-hashing a stored original on open. */
export type FieldMedia = {
  status: 'checking' | 'ok' | 'mismatch' | 'error'
  blob: Blob | null
  actual: string | null
  error?: string
}

/**
 * Downloads every original (as a Blob: the canvas is not tainted) and
 * compares its SHA-256 with the recorded one. `onResult` is called per field
 * as soon as it is known; the same blob is then shown and analysed.
 */
export async function checkFieldOriginals(
  fields: ReadonlyArray<Pick<AnalysisField, 'id' | 'rawImagePath' | 'rawImageSha256'>>,
  onResult: (fieldId: string, media: FieldMedia) => void,
): Promise<void> {
  await Promise.all(
    fields.map(async (f) => {
      const r = await verifyStoredHash(f.rawImagePath, f.rawImageSha256)
      onResult(f.id, {
        status: r.blob === null ? 'error' : r.ok ? 'ok' : 'mismatch',
        blob: r.blob,
        actual: r.actual,
        error: r.error,
      })
    }),
  )
}

/** Scale stored on an analysis (calibration snapshot, else the in-image line); null when none. */
export function scaleInputFromAnalysis(a: Pick<Analysis, 'scaleSnapshot' | 'inImageScale'>): ScaleInput | null {
  const s = a.scaleSnapshot
  if (s && s.um_per_px_x > 0 && s.um_per_px_y > 0) return { kind: 'calibration', umPerPxX: s.um_per_px_x, umPerPxY: s.um_per_px_y }
  const mm = a.inImageScale?.mm_per_px ?? inImageMmPerPx(a.inImageScale)
  return mm && mm > 0 ? { kind: 'in_image', mmPerPx: mm } : null
}

// ---------------------------------------------------------------------------
// Object URLs for downloaded blobs
// ---------------------------------------------------------------------------

const objectUrls = new WeakMap<Blob, string>()

/** One object URL per blob (cached), for <img> on the stage and the thumbnails. */
export function objectUrlFor(blob: Blob): string {
  let url = objectUrls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    objectUrls.set(blob, url)
  }
  return url
}

/** Frees the object URLs of these blobs (call when the screen that downloaded them closes). */
export function releaseObjectUrls(blobs: Iterable<Blob | null | undefined>): void {
  for (const b of blobs) {
    if (!b) continue
    const url = objectUrls.get(b)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.delete(b)
    }
  }
}

// ---------------------------------------------------------------------------
// Vector layers on a canvas (overlay PNG, worksheet thumbnails)
// ---------------------------------------------------------------------------

export type FieldVectors = {
  marks: Mark[]
  adjustments?: OperatorAdjustments | null
  annotations?: Annotation[] | null
  scaleLines?: InImageScale['lines'] | null
}

type Ctx2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function polygonPath(ctx: Ctx2d, pts: Point[], k: number, close: boolean) {
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * k, p.y * k) : ctx.lineTo(p.x * k, p.y * k)))
  if (close) ctx.closePath()
}

function drawMark(ctx: Ctx2d, m: Mark, k: number, lw: number) {
  const g = m.geometry
  ctx.strokeStyle = markColor(m)
  ctx.fillStyle = markColor(m)
  ctx.lineWidth = lw
  switch (g.type) {
    case 'point':
      ctx.beginPath()
      ctx.arc(g.x * k, g.y * k, lw * 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'line':
      ctx.beginPath()
      ctx.moveTo(g.x1 * k, g.y1 * k)
      ctx.lineTo(g.x2 * k, g.y2 * k)
      ctx.stroke()
      break
    case 'polyline':
      polygonPath(ctx, g.points, k, false)
      ctx.stroke()
      break
    case 'polygon':
      polygonPath(ctx, g.points, k, true)
      ctx.stroke()
      break
    case 'circle':
      ctx.beginPath()
      ctx.arc(g.cx * k, g.cy * k, g.r * k, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'rect':
      ctx.strokeRect(g.x * k, g.y * k, g.width * k, g.height * k)
      break
  }
  if (m.label) {
    const at = labelAnchor(m)
    if (at) {
      ctx.font = `${Math.max(12, lw * 6)}px sans-serif`
      ctx.fillText(m.label, at.x * k + lw * 2, at.y * k - lw * 2)
    }
  }
}

/** Where a mark's label is written (image pixels). */
export function labelAnchor(m: Mark): Point | null {
  const g = m.geometry
  switch (g.type) {
    case 'point':
      return { x: g.x, y: g.y }
    case 'line':
      return { x: g.x2, y: g.y2 }
    case 'polyline':
    case 'polygon':
      return g.points[0] ?? null
    case 'circle':
      return { x: g.cx + g.r, y: g.cy }
    case 'rect':
      return { x: g.x, y: g.y }
  }
}

/** Draws ROI, exclusions, marks, scale lines and annotations; `k` = canvas px per image px. */
export function drawFieldVectors(ctx: Ctx2d, v: FieldVectors, k: number, longSidePx: number) {
  const lw = Math.max(2, longSidePx / 500)
  const roi = v.adjustments?.roi
  if (roi) {
    ctx.save()
    ctx.setLineDash([lw * 4, lw * 3])
    ctx.strokeStyle = LAYER_COLORS.roi
    ctx.lineWidth = lw
    ctx.strokeRect(roi.x * k, roi.y * k, roi.width * k, roi.height * k)
    ctx.restore()
  }
  for (const ex of v.adjustments?.exclusions ?? []) {
    if (ex.points.length < 3) continue
    const c = hexToRgba(LAYER_COLORS.exclusion, 0.25)
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.25)`
    ctx.strokeStyle = LAYER_COLORS.exclusion
    ctx.lineWidth = lw
    polygonPath(ctx, ex.points, k, true)
    ctx.fill()
    ctx.stroke()
  }
  for (const m of v.marks) drawMark(ctx, m, k, lw)
  for (const l of v.scaleLines ?? []) {
    ctx.strokeStyle = LAYER_COLORS.scaleLine
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(l.x1 * k, l.y1 * k)
    ctx.lineTo(l.x2 * k, l.y2 * k)
    ctx.stroke()
  }
  for (const a of v.annotations ?? []) {
    const color = a.color || LAYER_COLORS.annotation
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = lw
    if (a.type === 'arrow') {
      drawArrow(ctx as CanvasRenderingContext2D, a.x1 * k, a.y1 * k, a.x2 * k, a.y2 * k, lw)
    } else {
      ctx.font = `bold ${Math.max(14, lw * 8)}px sans-serif`
      ctx.fillText(a.text, a.x * k, a.y * k)
    }
  }
}

async function canvasToBlob(c: OffscreenCanvas | HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality })
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the image.'))), type, quality)
  })
}

/** Long side of the rendered overlay; the overlay is an illustration, the original stays the record. */
export const OVERLAY_MAX_SIDE = 2400

/** Original + vector layers as a PNG (scaled to OVERLAY_MAX_SIDE), for the bucket overlay and prints. */
export async function renderOverlayPng(original: Blob, v: FieldVectors, maxSide = OVERLAY_MAX_SIDE): Promise<Blob> {
  const bmp = await createImageBitmap(original)
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k))
    const h = Math.max(1, Math.round(bmp.height * k))
    const canvas = canvasOf(w, h)
    const ctx = context2d(canvas)
    ctx.drawImage(bmp, 0, 0, w, h)
    drawFieldVectors(ctx, v, k, Math.max(w, h))
    return await canvasToBlob(canvas, 'image/png')
  } finally {
    bmp.close()
  }
}

/** Shrinks an image data URL for print (JPEG); returns the input when it is already small or cannot be read. */
export async function downscaleDataUrl(dataUrl: string, maxSide = 1400, quality = 0.85): Promise<string> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const bmp = await createImageBitmap(blob)
    try {
      const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
      if (k >= 1 && blob.size < 1_500_000) return dataUrl
      const w = Math.max(1, Math.round(bmp.width * k))
      const h = Math.max(1, Math.round(bmp.height * k))
      const canvas = canvasOf(w, h)
      const ctx = context2d(canvas)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bmp, 0, 0, w, h)
      const out = await canvasToBlob(canvas, 'image/jpeg', quality)
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'))
        reader.readAsDataURL(out)
      })
    } finally {
      bmp.close()
    }
  } catch {
    return dataUrl
  }
}

// ---------------------------------------------------------------------------
// Ring marks stored with the field (metallography_fields.marks.items)
// ---------------------------------------------------------------------------

/**
 * Mark kinds written by the ring-test panel. They encode the full ring
 * geometry (panels/ring/ringMarks.ts) and are replaced as a set on every ring
 * edit; operator marks of other kinds (measure lines) are kept.
 */
export const RING_MARK_KINDS: ReadonlySet<Mark['kind']> = new Set<Mark['kind']>([
  'ring_inner',
  'ring_outer',
  'ring_diameter_line',
  'ring_thickness_point',
])

/** Field marks with the ring marks replaced. */
export function withRingMarks(marks: FieldMarks | null | undefined, ringMarks: Mark[]): FieldMarks {
  const others = (marks?.items ?? []).filter((m) => !RING_MARK_KINDS.has(m.kind))
  return { ...(marks ?? {}), items: [...others, ...ringMarks] }
}

/** Marks of the field other than the ring set (operator measure lines etc.). */
export function nonRingMarks(marks: FieldMarks | null | undefined): Mark[] {
  return (marks?.items ?? []).filter((m) => !RING_MARK_KINDS.has(m.kind))
}

/** Replaces the non-ring marks, keeping the ring marks. */
export function withNonRingMarks(marks: FieldMarks | null | undefined, items: Mark[]): FieldMarks {
  const ringItems = (marks?.items ?? []).filter((m) => RING_MARK_KINDS.has(m.kind))
  return { ...(marks ?? {}), items: [...items, ...ringItems] }
}

/** Short random id for marks, annotations and exclusions. */
export function newVectorId(prefix = 'm'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rnd}`
}
