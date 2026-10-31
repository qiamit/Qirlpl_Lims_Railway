import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  Circle,
  CircleDot,
  Diameter,
  Eraser,
  Maximize,
  Palette,
  Ruler,
  SlidersHorizontal,
  Target,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { MessageLine } from '@/features/environment/EnvironmentUi'
import { computeRing } from '@/features/metallography/engines/ringTest/ringMaths'
import { runEngine } from '@/features/metallography/engines/runEngine'
import {
  RING_THICKNESS_LABELS,
  type GrayImage,
  type Mark,
  type MarkOrigin,
  type RingGeometry,
  type RingPointOffset,
  type RingTestLimits,
  type RingTestSummary,
  type RingThicknessPoint,
  type ScaleInput,
} from '@/features/metallography/engines/types'
import { cn } from '@/lib/utils'
import {
  DEFAULT_IMAGE_FILTER,
  autoEnhanceFilter,
  imageFilterCss,
  type ImageFilter,
} from './ringImageFilter'
import {
  loadRingDisplayColours,
  resetRingDisplayColours,
  saveRingDisplayColours,
  RING_LINE_WIDTH_MAX,
  RING_LINE_WIDTH_MIN,
  type RingDisplayColours,
  type RingLayer,
} from './ringDisplayColours'
import {
  DEFAULT_EDGE_SHAPE,
  MAX_POLYGON_SIDES,
  MIN_POLYGON_SIDES,
  MIN_RING_RADIUS,
  clampNum,
  diameterLineThroughRing,
  distanceToSegment,
  edgeSelectionToVertexIndexes,
  edgeToRingShape,
  ensurePointOffsets,
  findLineHit,
  findPolygonEdgeNearPoint,
  getPolygonPoints,
  lineLengthMm,
  lineLengthPx,
  mmPerPxFromRefLines,
  normalizeDeg,
  polygonBasePoint,
  ringShapeToEdge,
  rotateDiameterLine,
  rotateLinesAboutCentre,
  suggestInitialCircles,
  type EdgeCircle,
  type EdgeShapeConfig,
  type Line,
  type RefLine,
} from './ringGeometry'
import { buildRingMarks, geometryFromState, zeroPointOffsets, type RingMarkState } from './ringMarks'
import {
  drawEdge,
  drawGridAndRulers,
  drawMeasureLine,
  drawThicknessPoints,
  toImage,
  type ViewTransform,
} from './ringCanvasDraw'
import {
  ColoursPanel,
  DiameterPanel,
  EdgeAdjustPanel,
  ImageAdjustPanel,
  ResetPanel,
  ScaleLinePanel,
  ThicknessPanel,
  type ThicknessSelection,
} from './RingToolPanels'
import { RingResultTable, RingVerdictBadge } from './RingResultTable'
import { ringToolBtnClass } from './ringUi'

/**
 * Ring test editor (IS 1786): port of the Metallurgy Software
 * components/ring-test/RingEditor.tsx into the LIMS (design 3.3 / 3.8).
 *
 * What changed in the port:
 *  - Original pixels in and out: the photo is shown from the workbench's
 *    downloaded, hash-checked blob at its own size and aspect ratio (no
 *    590 × 590 resize); every coordinate is an original image pixel.
 *  - The canvas is the size of its box and the photo is drawn through a
 *    zoom / pan transform, so large photos zoom without a huge canvas.
 *  - Edge detection runs in the engine worker (runEngine 'detectRing'); the
 *    thicknesses, areas and verdict come from computeRing, the same maths the
 *    validation runner checks and the database recomputes.
 *  - No AI call (the old /api/ai/analyze-ring route never existed), no
 *    destructive image tools (rotate / flip / crop / sharpen / delete), no
 *    image or draft in sessionStorage. Display colours stay in localStorage.
 *  - The scale is never a silent default: without a calibration or a
 *    reference line of known length there is no result.
 *  - Light LIMS stone / amber chrome instead of the old dark theme.
 */

type RingSide = 'inner' | 'outer'
type PanelKey = 'inner' | 'outer' | 'diam' | 'scale' | 'thick' | 'image' | 'colours' | 'reset'
type EdgeState = { circle: EdgeCircle; config: EdgeShapeConfig; origin: MarkOrigin }
type PolySelection = { point: number | null; edges: number[] }
type FilterState = { current: ImageFilter; past: ImageFilter[]; future: ImageFilter[] }

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'draw'; target: 'diam' | 'scale' }
  | { kind: 'line-end'; target: 'diam' | 'scale'; index: number; end: 'start' | 'end' }
  | { kind: 'move'; ring: RingSide; x0: number; y0: number; circle: EdgeCircle }
  | { kind: 'resize'; ring: RingSide; circle: EdgeCircle }
  | { kind: 'poly-point'; ring: RingSide; index: number; baseX: number; baseY: number }
  | { kind: 'poly-edge'; ring: RingSide; vertices: number[]; x0: number; y0: number; offsets: Array<{ dx: number; dy: number }> }

export type RingEditorChange = {
  /** Edges not placed are reported with r = 0 (see RING_SHAPE_NOT_PLACED); `bothEdgesPlaced` says so. */
  geometry: RingGeometry
  marks: Mark[]
  /** null until both edges, the scale, d and the applied t1–t8 are all there. */
  summary: RingTestSummary | null
  bothEdgesPlaced: boolean
}

export type RingEditorProps = {
  /** Original photo: blob for display, grey pixels for detection (same size). */
  image: { blob: Blob; width: number; height: number; gray: GrayImage }
  /** Scale used for the result (calibration or in-image); null = no result yet. */
  scale: ScaleInput | null
  /** Nominal bar diameter d (mm). */
  dMm: number | null
  limits: RingTestLimits
  limitsVerified: boolean
  angularCorrectionDeg: number
  outerGapPx: number
  innerGapPx: number
  readOnly: boolean
  /** Restored drawing (from the field's marks); null on a new field. */
  initialState: RingMarkState | null
  /** In-image reference lines. Leave undefined when the method uses a microscope calibration (no Scale line tool). */
  scaleLines?: RefLine[]
  onScaleLinesChange?: (lines: RefLine[]) => void
  /** Shown in the "still needed" list while there is no scale. */
  scaleHint?: string
  /** Every committed edit (not while dragging); never called on open or when read-only. */
  onChange?: (next: RingEditorChange) => void
  className?: string
}

const MIN_ZOOM = 0.01
const MAX_ZOOM = 40
const ZOOM_STEP = 1.25
/** Hit tolerances in screen pixels. */
const HANDLE_TOL = 10
const VERTEX_TOL = 9
const EDGE_TOL = 10
const LINE_TOL = 8
const RING_MOVE_MARGIN = 24
const UNIT_SCALE: ScaleInput = { kind: 'in_image', mmPerPx: 1 }

function zoomAround(v: ViewTransform, sx: number, sy: number, factor: number): ViewTransform {
  const zoom = clampNum(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const k = zoom / v.zoom
  return { zoom, panX: sx - (sx - v.panX) * k, panY: sy - (sy - v.panY) * k }
}

function fitView(w: number, h: number, iw: number, ih: number): ViewTransform {
  const zoom = clampNum(Math.min(w / Math.max(1, iw), h / Math.max(1, ih)) * 0.96, MIN_ZOOM, MAX_ZOOM)
  return { zoom, panX: (w - iw * zoom) / 2, panY: (h - ih * zoom) / 2 }
}

function parseLength(text: string): number | null {
  const n = Number(text.trim())
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

function edgeFromShape(shape: RingMarkState['inner'], origin: MarkOrigin): EdgeState | null {
  if (!shape) return null
  const e = ringShapeToEdge(shape)
  return { circle: e.circle, config: e.config, origin }
}

function selectedThicknessIndexes(sel: ThicknessSelection): number[] {
  if (sel === 'all') return RING_THICKNESS_LABELS.map((_, i) => i)
  if (sel === 'none') return []
  return [sel]
}

const TOOL_HINT: Record<'view' | 'inner' | 'outer' | 'diam' | 'scale' | 'thick', string> = {
  view: 'Drag to pan · wheel to zoom',
  inner: 'Drag the ring or its centre to move · right handle to resize',
  outer: 'Drag the ring or its centre to move · right handle to resize',
  diam: 'Drag to draw a diameter · drag an end to adjust',
  scale: 'Drag along the known length · drag an end to adjust',
  thick: 'Click a thickness point to pick it',
}

export function RingEditor({
  image,
  scale,
  dMm,
  limits,
  limitsVerified,
  angularCorrectionDeg,
  outerGapPx,
  innerGapPx,
  readOnly,
  initialState,
  scaleLines,
  onScaleLinesChange,
  scaleHint,
  onChange,
  className,
}: RingEditorProps) {
  const editable = !readOnly
  const scaleToolOn = scaleLines !== undefined
  const refLines = useMemo(() => scaleLines ?? [], [scaleLines])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const fittedRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)

  // Drawing (original pixels)
  const [inner, setInner] = useState<EdgeState | null>(() => edgeFromShape(initialState?.inner ?? null, initialState?.innerOrigin ?? 'operator'))
  const [outer, setOuter] = useState<EdgeState | null>(() => edgeFromShape(initialState?.outer ?? null, initialState?.outerOrigin ?? 'operator'))
  const [diamLines, setDiamLines] = useState<Line[]>(() => initialState?.diameterLines ?? [])
  const [thicknessApplied, setThicknessApplied] = useState(() => Boolean(initialState?.thicknessApplied))
  const [pointOffsets, setPointOffsets] = useState<RingPointOffset[]>(() => initialState?.pointOffsets ?? zeroPointOffsets())

  // UI
  const [panel, setPanel] = useState<PanelKey | null>(null)
  const [polySel, setPolySel] = useState<PolySelection>({ point: null, edges: [] })
  const [selDiam, setSelDiam] = useState<number | null>(null)
  const [selScale, setSelScale] = useState<number | null>(null)
  const [scaleLengthText, setScaleLengthText] = useState(() => {
    const first = scaleLines?.find((l) => l.length_mm !== null)
    return first?.length_mm ? String(first.length_mm) : ''
  })
  const [thickSel, setThickSel] = useState<ThicknessSelection>('none')
  const [draft, setDraft] = useState<{ target: 'diam' | 'scale'; line: Line } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [detecting, setDetecting] = useState<RingSide | null>(null)
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  // View (never saved with the analysis)
  const [view, setView] = useState<ViewTransform>({ zoom: 1, panX: 0, panY: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [showGrid, setShowGrid] = useState(true)
  const [filterState, setFilterState] = useState<FilterState>({ current: DEFAULT_IMAGE_FILTER, past: [], future: [] })
  const [colours, setColours] = useState<RingDisplayColours>(() => loadRingDisplayColours())
  const [loaded, setLoaded] = useState<{ blob: Blob; bmp: ImageBitmap } | null>(null)
  const [loadError, setLoadError] = useState<{ blob: Blob; text: string } | null>(null)

  const tool: keyof typeof TOOL_HINT =
    panel === 'inner' || panel === 'outer' || panel === 'diam' || panel === 'thick' || (panel === 'scale' && scaleToolOn)
      ? panel
      : 'view'
  const bitmap = loaded && loaded.blob === image.blob ? loaded.bmp : null
  const photoError = loadError && loadError.blob === image.blob ? loadError.text : null

  // ---------------------------------------------------------------------------
  // Derived geometry, result and marks
  // ---------------------------------------------------------------------------

  const markState = useMemo<RingMarkState>(
    () => ({
      inner: inner ? edgeToRingShape(inner.circle, inner.config) : null,
      outer: outer ? edgeToRingShape(outer.circle, outer.config) : null,
      innerOrigin: inner?.origin ?? 'operator',
      outerOrigin: outer?.origin ?? 'operator',
      diameterLines: diamLines,
      thicknessApplied: thicknessApplied && Boolean(inner && outer),
      pointOffsets,
      angularCorrectionDeg,
      outerGapPx,
      innerGapPx,
    }),
    [inner, outer, diamLines, thicknessApplied, pointOffsets, angularCorrectionDeg, outerGapPx, innerGapPx],
  )
  const bothPlaced = Boolean(inner && outer)
  const geometry = useMemo(() => geometryFromState(markState), [markState])

  const calc = useMemo<{ display: RingThicknessPoint[] | null; summary: RingTestSummary | null; error: string | null }>(() => {
    if (!bothPlaced || !geometry.thicknessApplied) return { display: null, summary: null, error: null }
    try {
      if (scale && dMm !== null && dMm > 0) {
        const summary = computeRing(geometry, scale, dMm, limits)
        return { display: summary.thickness, summary, error: null }
      }
      // No scale or d yet: place the points only (values need the real scale and d).
      const placed = computeRing(geometry, UNIT_SCALE, 1, limits)
      return { display: placed.thickness.map((p) => ({ ...p, thickness_mm: null })), summary: null, error: null }
    } catch (e) {
      return { display: null, summary: null, error: e instanceof Error ? e.message : 'The ring could not be measured.' }
    }
  }, [bothPlaced, geometry, scale, dMm, limits])

  const marks = useMemo(
    () => buildRingMarks(markState, calc.summary?.thickness ?? calc.display),
    [markState, calc.summary, calc.display],
  )

  const missing = useMemo(() => {
    const out: string[] = []
    if (!inner) out.push('Place the inner ring (hole edge).')
    if (!outer) out.push('Place the outer ring (skin).')
    if (!scale) out.push(scaleHint ?? 'Set the scale.')
    if (dMm === null || !(dMm > 0)) out.push('Enter the nominal diameter d (mm).')
    if (inner && outer && !thicknessApplied) out.push('Apply the thickness points t1–t8 (Thickness tool).')
    if (calc.summary && calc.summary.valid_point_count < RING_THICKNESS_LABELS.length) {
      out.push(
        `Only ${calc.summary.valid_point_count} of 8 thickness points meet both edges: adjust the rings or the points.`,
      )
    }
    return out
  }, [inner, outer, scale, scaleHint, dMm, thicknessApplied, calc.summary])

  const measuredDiameterMm = useMemo(() => {
    if (!scale || diamLines.length === 0) return null
    const lengths = diamLines.map((l) => lineLengthMm(l, scale) ?? 0)
    return lengths.reduce((s, v) => s + v, 0) / lengths.length
  }, [scale, diamLines])

  const refMmPerPx = useMemo(() => mmPerPxFromRefLines(refLines), [refLines])

  // Report committed edits (not on open, not while dragging, never read-only).
  // d is part of the key so a changed d reaches the parent even before there is a result.
  useEffect(() => {
    if (readOnly || !onChange || dragging) return
    const payload: RingEditorChange = { geometry, marks, summary: calc.summary, bothEdgesPlaced: bothPlaced }
    const key = JSON.stringify([geometry, marks, calc.summary, dMm])
    if (lastKeyRef.current === null) {
      lastKeyRef.current = key
      return
    }
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    onChange(payload)
  }, [readOnly, onChange, dragging, geometry, marks, calc.summary, bothPlaced, dMm])

  // ---------------------------------------------------------------------------
  // Photo, size, zoom
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    let made: ImageBitmap | null = null
    createImageBitmap(image.blob)
      .then((bmp) => {
        if (cancelled) {
          bmp.close()
          return
        }
        made = bmp
        setLoaded({ blob: image.blob, bmp })
      })
      .catch(() => {
        if (!cancelled) setLoadError({ blob: image.blob, text: 'This browser could not show the photo.' })
      })
    return () => {
      cancelled = true
      made?.close()
    }
  }, [image.blob])

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w < 8 || h < 8) return
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
      if (!fittedRef.current) {
        fittedRef.current = true
        setView(fitView(w, h, image.width, image.height))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [image.width, image.height])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-ev.deltaY * 0.0015)
      setView((v) => zoomAround(v, ev.clientX - rect.left, ev.clientY - rect.top, factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (factor: number) => setView((v) => zoomAround(v, size.w / 2, size.h / 2, factor))
  const fit = () => {
    if (size.w > 0) setView(fitView(size.w, size.h, image.width, image.height))
  }

  // ---------------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    const dpr = window.devicePixelRatio || 1
    const bw = Math.round(size.w * dpr)
    const bh = Math.round(size.h * dpr)
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.fillStyle = '#292524'
    ctx.fillRect(0, 0, size.w, size.h)

    if (bitmap) {
      ctx.save()
      ctx.filter = imageFilterCss(filterState.current)
      ctx.imageSmoothingEnabled = view.zoom < 3
      ctx.drawImage(bitmap, view.panX, view.panY, image.width * view.zoom, image.height * view.zoom)
      ctx.restore()
    } else {
      ctx.save()
      ctx.fillStyle = '#d6d3d1'
      ctx.font = '14px "Plus Jakarta Sans", Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(photoError ?? 'Loading photo…', size.w / 2, size.h / 2)
      ctx.restore()
    }
    if (showGrid) drawGridAndRulers(ctx, view, size.w, size.h, image.width, image.height)

    if (outer) {
      drawEdge(ctx, view, outer.circle, outer.config, colours.outer, {
        active: editable && tool === 'outer',
        selectedPoint: polySel.point,
        selectedEdges: polySel.edges,
      })
    }
    if (inner) {
      drawEdge(ctx, view, inner.circle, inner.config, colours.inner, {
        active: editable && tool === 'inner',
        selectedPoint: polySel.point,
        selectedEdges: polySel.edges,
      })
    }

    const diamToDraw = draft?.target === 'diam' ? [...diamLines, draft.line] : diamLines
    diamToDraw.forEach((l, i) => {
      const mm = lineLengthMm(l, scale)
      drawMeasureLine(ctx, view, l, colours.diam, {
        selected: tool === 'diam' && (i === selDiam || (draft?.target === 'diam' && i === diamToDraw.length - 1)),
        dashed: false,
        label: `D${i + 1} ${lineLengthPx(l).toFixed(1)} px${mm !== null ? ` · ${mm.toFixed(3)} mm` : ''}`,
        handles: tool === 'diam',
      })
    })

    if (scaleToolOn) {
      const scaleToDraw: RefLine[] =
        draft?.target === 'scale' ? [...refLines, { ...draft.line, length_mm: parseLength(scaleLengthText) }] : refLines
      scaleToDraw.forEach((l, i) => {
        drawMeasureLine(ctx, view, l, colours.scale, {
          selected: tool === 'scale' && (i === selScale || (draft?.target === 'scale' && i === scaleToDraw.length - 1)),
          dashed: true,
          label: `S${i + 1} ${lineLengthPx(l).toFixed(1)} px${l.length_mm !== null ? ` = ${l.length_mm} mm` : ''}`,
          handles: tool === 'scale',
        })
      })
    }

    if (geometry.thicknessApplied && calc.display && outer) {
      drawThicknessPoints(ctx, view, calc.display, { x: outer.circle.cx, y: outer.circle.cy }, colours.thick, {
        selected: new Set(tool === 'thick' ? selectedThicknessIndexes(thickSel) : []),
        showValues: Boolean(calc.summary),
      })
    }
  }, [
    size,
    view,
    bitmap,
    photoError,
    filterState,
    showGrid,
    image.width,
    image.height,
    inner,
    outer,
    polySel,
    tool,
    editable,
    colours,
    diamLines,
    draft,
    selDiam,
    scale,
    scaleToolOn,
    refLines,
    scaleLengthText,
    selScale,
    geometry.thicknessApplied,
    calc.display,
    calc.summary,
    thickSel,
  ])

  // ---------------------------------------------------------------------------
  // Edit helpers
  // ---------------------------------------------------------------------------

  const setEdge = (ring: RingSide, update: (s: EdgeState) => EdgeState) => {
    const apply = (prev: EdgeState | null) => (prev ? { ...update(prev), origin: 'operator' as const } : prev)
    if (ring === 'inner') setInner(apply)
    else setOuter(apply)
  }
  const edgeOf = (ring: RingSide) => (ring === 'inner' ? inner : outer)

  const updateScaleLines = (next: RefLine[]) => onScaleLinesChange?.(next)

  const pointFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const sx = e.clientX - (rect?.left ?? 0)
    const sy = e.clientY - (rect?.top ?? 0)
    const p = toImage(view, sx, sy)
    return { sx, sy, x: p.x, y: p.y }
  }

  const startPan = (sx: number, sy: number) => {
    dragRef.current = { kind: 'pan', sx, sy, panX: view.panX, panY: view.panY }
  }

  const beginEdit = (d: Drag) => {
    dragRef.current = d
    setDragging(true)
  }

  // ---------------------------------------------------------------------------
  // Pointer and keyboard
  // ---------------------------------------------------------------------------

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    canvas.focus()
    const p = pointFromEvent(e)
    const tol = 1 / view.zoom
    if (e.button === 1 || !editable) {
      startPan(p.sx, p.sy)
      return
    }

    if (tool === 'diam' || tool === 'scale') {
      const lines: Line[] = tool === 'diam' ? diamLines : refLines
      const hit = findLineHit(p.x, p.y, lines, HANDLE_TOL * tol, LINE_TOL * tol)
      if (hit) {
        if (tool === 'diam') setSelDiam(hit.index)
        else {
          setSelScale(hit.index)
          const len = refLines[hit.index]?.length_mm
          setScaleLengthText(len ? String(len) : '')
        }
        if (hit.end) beginEdit({ kind: 'line-end', target: tool, index: hit.index, end: hit.end })
        return
      }
      setDraft({ target: tool, line: { x1: p.x, y1: p.y, x2: p.x, y2: p.y } })
      beginEdit({ kind: 'draw', target: tool })
      return
    }

    if (tool === 'inner' || tool === 'outer') {
      const edge = edgeOf(tool)
      if (edge) {
        const { circle, config } = edge
        if (config.mode === 'polygon') {
          const poly = getPolygonPoints(circle, config)
          const vi = poly.findIndex((pt) => Math.hypot(p.x - pt.x, p.y - pt.y) <= VERTEX_TOL * tol)
          if (vi >= 0) {
            const base = polygonBasePoint(circle, config, vi)
            setPolySel({ point: vi, edges: [] })
            beginEdit({ kind: 'poly-point', ring: tool, index: vi, baseX: base.x, baseY: base.y })
            return
          }
          const ei = findPolygonEdgeNearPoint(p.x, p.y, poly, EDGE_TOL * tol)
          if (ei >= 0) {
            if (e.ctrlKey || e.metaKey) {
              setPolySel((prev) => ({
                point: null,
                edges: prev.edges.includes(ei) ? prev.edges.filter((v) => v !== ei) : [...prev.edges, ei],
              }))
              return
            }
            const edges = polySel.edges.includes(ei) && polySel.edges.length > 1 ? polySel.edges : [ei]
            setPolySel({ point: null, edges })
            const sides = Math.max(MIN_POLYGON_SIDES, Math.round(config.sides))
            beginEdit({
              kind: 'poly-edge',
              ring: tool,
              vertices: edgeSelectionToVertexIndexes(edges, sides),
              x0: p.x,
              y0: p.y,
              offsets: ensurePointOffsets(config).pointOffsets.map((o) => ({ ...o })),
            })
            return
          }
        }
        if (Math.hypot(p.x - (circle.cx + circle.r), p.y - circle.cy) <= HANDLE_TOL * tol) {
          beginEdit({ kind: 'resize', ring: tool, circle: { ...circle } })
          return
        }
        const dist = Math.hypot(p.x - circle.cx, p.y - circle.cy)
        if (dist <= HANDLE_TOL * tol || (config.mode === 'circle' && dist <= circle.r + RING_MOVE_MARGIN * tol)) {
          beginEdit({ kind: 'move', ring: tool, x0: p.x, y0: p.y, circle: { ...circle } })
          return
        }
      }
    }

    if (tool === 'thick' && calc.display) {
      let best = -1
      let bestDist = LINE_TOL * tol
      calc.display.forEach((t, i) => {
        if (!t.inner_xy || !t.outer_xy) return
        const dd = distanceToSegment(p.x, p.y, t.inner_xy[0], t.inner_xy[1], t.outer_xy[0], t.outer_xy[1])
        if (dd <= bestDist) {
          best = i
          bestDist = dd
        }
      })
      if (best >= 0) {
        setThickSel(best)
        return
      }
    }
    startPan(p.sx, p.sy)
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current
    if (!d) return
    const p = pointFromEvent(e)
    switch (d.kind) {
      case 'pan':
        setView((v) => ({ ...v, panX: d.panX + (p.sx - d.sx), panY: d.panY + (p.sy - d.sy) }))
        return
      case 'draw':
        setDraft((prev) => (prev ? { ...prev, line: { ...prev.line, x2: p.x, y2: p.y } } : prev))
        return
      case 'line-end': {
        const patch = d.end === 'start' ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y }
        if (d.target === 'diam') setDiamLines((prev) => prev.map((l, i) => (i === d.index ? { ...l, ...patch } : l)))
        else updateScaleLines(refLines.map((l, i) => (i === d.index ? { ...l, ...patch } : l)))
        return
      }
      case 'move':
        setEdge(d.ring, (s) => ({ ...s, circle: { ...d.circle, cx: d.circle.cx + p.x - d.x0, cy: d.circle.cy + p.y - d.y0 } }))
        return
      case 'resize':
        setEdge(d.ring, (s) => ({
          ...s,
          circle: { ...d.circle, r: Math.max(MIN_RING_RADIUS, Math.hypot(p.x - d.circle.cx, p.y - d.circle.cy)) },
        }))
        return
      case 'poly-point':
        setEdge(d.ring, (s) => {
          const cfg = ensurePointOffsets(s.config)
          const offsets = cfg.pointOffsets.map((o, i) => (i === d.index ? { dx: p.x - d.baseX, dy: p.y - d.baseY } : o))
          return { ...s, config: { ...cfg, pointOffsets: offsets } }
        })
        return
      case 'poly-edge':
        setEdge(d.ring, (s) => {
          const offsets = d.offsets.map((o, i) =>
            d.vertices.includes(i) ? { dx: o.dx + p.x - d.x0, dy: o.dy + p.y - d.y0 } : o,
          )
          return { ...s, config: { ...ensurePointOffsets(s.config), pointOffsets: offsets } }
        })
        return
    }
  }

  const onPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d?.kind === 'draw' && draft) {
      // Ignore clicks: a line must be at least 3 screen pixels long.
      if (lineLengthPx(draft.line) * view.zoom >= 3) {
        if (draft.target === 'diam') {
          setDiamLines((prev) => [...prev, draft.line])
          setSelDiam(diamLines.length)
        } else {
          updateScaleLines([...refLines, { ...draft.line, length_mm: parseLength(scaleLengthText) }])
          setSelScale(refLines.length)
        }
      }
      setDraft(null)
    }
    if (d && d.kind !== 'pan') setDragging(false)
  }

  const nudgeLine = (target: 'diam' | 'scale', dx: number, dy: number) => {
    const shift = <T extends Line>(l: T): T => ({ ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy })
    if (target === 'diam' && selDiam !== null) setDiamLines((prev) => prev.map((l, i) => (i === selDiam ? shift(l) : l)))
    if (target === 'scale' && selScale !== null) updateScaleLines(refLines.map((l, i) => (i === selScale ? shift(l) : l)))
  }

  const nudgeVertex = (ring: RingSide, dx: number, dy: number) => {
    const idx = polySel.point
    if (idx === null) return
    setEdge(ring, (s) => {
      if (s.config.mode !== 'polygon') return s
      const cfg = ensurePointOffsets(s.config)
      return {
        ...s,
        config: { ...cfg, pointOffsets: cfg.pointOffsets.map((o, i) => (i === idx ? { dx: o.dx + dx, dy: o.dy + dy } : o)) },
      }
    })
  }

  const deleteLine = (target: 'diam' | 'scale') => {
    if (target === 'diam' && selDiam !== null) {
      const next = diamLines.filter((_, i) => i !== selDiam)
      setDiamLines(next)
      setSelDiam(next.length ? Math.min(selDiam, next.length - 1) : null)
    }
    if (target === 'scale' && selScale !== null) {
      const next = refLines.filter((_, i) => i !== selScale)
      updateScaleLines(next)
      setSelScale(next.length ? Math.min(selScale, next.length - 1) : null)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomBy(ZOOM_STEP)
      return
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoomBy(1 / ZOOM_STEP)
      return
    }
    if (e.key === '0') {
      e.preventDefault()
      fit()
      return
    }
    if (!editable) return
    if ((e.key === 'Delete' || e.key === 'Backspace') && (tool === 'diam' || tool === 'scale')) {
      e.preventDefault()
      deleteLine(tool)
      return
    }
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const dir = arrows[e.key]
    if (!dir) return
    const step = e.shiftKey ? 5 : 1
    if ((tool === 'inner' || tool === 'outer') && polySel.point !== null) {
      e.preventDefault()
      nudgeVertex(tool, dir[0] * step, dir[1] * step)
    } else if (tool === 'diam' || tool === 'scale') {
      e.preventDefault()
      nudgeLine(tool, dir[0] * step, dir[1] * step)
    }
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  const togglePanel = (key: PanelKey) => {
    setPolySel({ point: null, edges: [] })
    setPanel((prev) => (prev === key ? null : key))
  }

  const openRing = (ring: RingSide) => {
    if (editable && !edgeOf(ring)) {
      const s = suggestInitialCircles(image.width, image.height)
      const fresh: EdgeState = { circle: s[ring], config: { ...DEFAULT_EDGE_SHAPE }, origin: 'operator' }
      if (ring === 'inner') setInner(fresh)
      else setOuter(fresh)
    }
    togglePanel(ring)
  }

  const detect = async (which: RingSide) => {
    setDetecting(which)
    setMessage(null)
    try {
      const innerShape = inner ? edgeToRingShape(inner.circle, inner.config) : null
      const outerShape = outer ? edgeToRingShape(outer.circle, outer.config) : null
      const seedEdge = which === 'inner' ? outer : inner
      const res = await runEngine({
        type: 'detectRing',
        image: image.gray,
        opts: {
          which,
          seed: seedEdge ? { x: seedEdge.circle.cx, y: seedEdge.circle.cy } : undefined,
          existing: which === 'inner' ? { outer: outerShape } : { inner: innerShape },
        },
      })
      const r = res.result
      const found = which === 'inner' ? r.inner : r.outer
      if (which === 'inner' && r.inner) setInner(edgeFromShape(r.inner, 'engine'))
      if (which === 'outer') {
        if (r.outer) setOuter(edgeFromShape(r.outer, 'engine'))
        if (r.inner && !inner) setInner(edgeFromShape(r.inner, 'engine'))
      }
      setPolySel({ point: null, edges: [] })
      const notes = [...(found ? [] : [`No ${which} ring found. Place it by hand.`]), ...r.warnings]
      if (notes.length) setMessage({ tone: found ? 'info' : 'error', text: notes.join(' ') })
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Ring detection failed.' })
    } finally {
      setDetecting(null)
    }
  }

  const deleteRing = (ring: RingSide) => {
    if (ring === 'inner') setInner(null)
    else setOuter(null)
    setThicknessApplied(false)
    setPolySel({ point: null, edges: [] })
    setPanel(null)
  }

  const autoDiameters = () => {
    const ring = outer ?? inner
    if (!ring) return
    setDiamLines([
      diameterLineThroughRing(ring.circle, ring.config, 0),
      diameterLineThroughRing(ring.circle, ring.config, 90),
    ])
    setSelDiam(0)
  }

  const rotateDiameters = (deltaDeg: number) => {
    const ring = outer ?? inner
    setDiamLines((prev) =>
      ring ? prev.map((l) => rotateDiameterLine(l, ring.circle, ring.config, deltaDeg)) : rotateLinesAboutCentre(prev, deltaDeg),
    )
  }

  const openThickness = () => {
    if (!inner || !outer) return
    // Opening the tool applies t1–t8 (old editor behaviour); Use result stays blocked until then.
    if (editable) setThicknessApplied(true)
    togglePanel('thick')
  }

  const changeOffsets = (update: (o: RingPointOffset) => RingPointOffset) => {
    const idx = selectedThicknessIndexes(thickSel)
    if (idx.length === 0) return
    setPointOffsets((prev) => prev.map((o, i) => (idx.includes(i) ? update(o) : o)))
  }

  const clearThickness = () => {
    setThicknessApplied(false)
    setPointOffsets(zeroPointOffsets())
    setThickSel('none')
    setPanel(null)
  }

  const resetDrawing = () => {
    setInner(null)
    setOuter(null)
    setDiamLines([])
    setSelDiam(null)
    setThicknessApplied(false)
    setPointOffsets(zeroPointOffsets())
    setThickSel('none')
    setPolySel({ point: null, edges: [] })
    setPanel(null)
    setMessage(null)
  }

  const changeFilter = (next: ImageFilter) =>
    setFilterState((s) => ({ current: next, past: [...s.past, s.current].slice(-100), future: [] }))

  const changeColour = (layer: RingLayer, patch: Partial<{ color: string; width: number }>) => {
    const width = patch.width !== undefined ? clampNum(Math.round(patch.width) || RING_LINE_WIDTH_MIN, RING_LINE_WIDTH_MIN, RING_LINE_WIDTH_MAX) : undefined
    const next: RingDisplayColours = {
      ...colours,
      [layer]: { ...colours[layer], ...patch, ...(width !== undefined ? { width } : {}) },
    }
    setColours(next)
    saveRingDisplayColours(next)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const colourDot = (color: string) => (
    <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-stone-500/40" style={{ backgroundColor: color }} />
  )

  const panelContent = (() => {
    switch (panel) {
      case 'inner':
      case 'outer': {
        const edge = edgeOf(panel)
        const ring = panel
        return (
          <EdgeAdjustPanel
            ring={ring}
            circle={edge?.circle ?? null}
            shape={edge?.config ?? DEFAULT_EDGE_SHAPE}
            origin={edge?.origin ?? 'operator'}
            readOnly={!editable}
            detecting={detecting === ring}
            onDetect={() => void detect(ring)}
            onShapeMode={(mode) => setEdge(ring, (s) => ({ ...s, config: ensurePointOffsets({ ...s.config, mode }) }))}
            onSides={(n) =>
              Number.isFinite(n) &&
              setEdge(ring, (s) => ({
                ...s,
                config: ensurePointOffsets({ ...s.config, sides: clampNum(Math.round(n), MIN_POLYGON_SIDES, MAX_POLYGON_SIDES) }),
              }))
            }
            onRadius={(delta) => setEdge(ring, (s) => ({ ...s, circle: { ...s.circle, r: Math.max(MIN_RING_RADIUS, s.circle.r + delta) } }))}
            onRotate={(delta) => setEdge(ring, (s) => ({ ...s, config: { ...s.config, rotationDeg: normalizeDeg(s.config.rotationDeg + delta) } }))}
            onMove={(dx, dy) => setEdge(ring, (s) => ({ ...s, circle: { ...s.circle, cx: s.circle.cx + dx, cy: s.circle.cy + dy } }))}
            onDelete={() => deleteRing(ring)}
            onClose={() => setPanel(null)}
          />
        )
      }
      case 'diam':
        return (
          <DiameterPanel
            lines={diamLines}
            selected={selDiam}
            lengthMm={diamLines.map((l) => lineLengthMm(l, scale))}
            readOnly={!editable}
            canAuto={Boolean(inner || outer)}
            onSelect={setSelDiam}
            onAuto={autoDiameters}
            onNudge={(dx, dy) => nudgeLine('diam', dx, dy)}
            onRotate={rotateDiameters}
            onDelete={() => deleteLine('diam')}
            onClose={() => setPanel(null)}
          />
        )
      case 'scale':
        return scaleToolOn ? (
          <ScaleLinePanel
            lines={refLines}
            selected={selScale}
            lengthText={scaleLengthText}
            mmPerPx={refMmPerPx}
            readOnly={!editable}
            onSelect={(i) => {
              setSelScale(i)
              const len = refLines[i]?.length_mm
              setScaleLengthText(len ? String(len) : '')
            }}
            onLengthText={(text) => {
              setScaleLengthText(text)
              if (selScale !== null) {
                const length_mm = parseLength(text)
                updateScaleLines(refLines.map((l, i) => (i === selScale ? { ...l, length_mm } : l)))
              }
            }}
            onNudge={(dx, dy) => nudgeLine('scale', dx, dy)}
            onDelete={() => deleteLine('scale')}
            onClose={() => setPanel(null)}
          />
        ) : null
      case 'thick':
        return (
          <ThicknessPanel
            selection={thickSel}
            validCount={calc.summary ? calc.summary.valid_point_count : null}
            readOnly={!editable}
            onSelect={setThickSel}
            onResize={(delta) => changeOffsets((o) => ({ ...o, deltaPx: o.deltaPx + delta }))}
            onMove={(delta) => changeOffsets((o) => ({ ...o, angleOffsetDeg: o.angleOffsetDeg + delta }))}
            onResetPoint={() => changeOffsets(() => ({ angleOffsetDeg: 0, deltaPx: 0 }))}
            onClear={clearThickness}
            onClose={() => setPanel(null)}
          />
        )
      case 'image':
        return (
          <ImageAdjustPanel
            filter={filterState.current}
            canUndo={filterState.past.length > 0}
            canRedo={filterState.future.length > 0}
            showGrid={showGrid}
            onFilter={(key, value) => changeFilter({ ...filterState.current, [key]: value })}
            onAuto={() => changeFilter(autoEnhanceFilter(image.gray, filterState.current))}
            onUndo={() =>
              setFilterState((s) =>
                s.past.length === 0
                  ? s
                  : { current: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.current, ...s.future] },
              )
            }
            onRedo={() =>
              setFilterState((s) =>
                s.future.length === 0 ? s : { current: s.future[0], past: [...s.past, s.current], future: s.future.slice(1) },
              )
            }
            onReset={() => changeFilter(DEFAULT_IMAGE_FILTER)}
            onZoomIn={() => zoomBy(ZOOM_STEP)}
            onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
            onFit={fit}
            onToggleGrid={() => setShowGrid((v) => !v)}
            onClose={() => setPanel(null)}
          />
        )
      case 'colours':
        return (
          <ColoursPanel
            colours={colours}
            onChange={changeColour}
            onReset={() => setColours(resetRingDisplayColours())}
            onClose={() => setPanel(null)}
          />
        )
      case 'reset':
        return (
          <ResetPanel
            hasInner={Boolean(inner)}
            hasOuter={Boolean(outer)}
            diameterCount={diamLines.length}
            thicknessApplied={thicknessApplied}
            onReset={resetDrawing}
            onClose={() => setPanel(null)}
          />
        )
      default:
        return null
    }
  })()

  const cursor =
    tool === 'diam' || tool === 'scale' ? 'cursor-crosshair' : tool === 'view' || !editable ? 'cursor-grab' : 'cursor-default'

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col gap-2', className)}>
      <div role="toolbar" aria-label="Ring test tools" className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => openRing('inner')} className={ringToolBtnClass(panel === 'inner')} disabled={!editable && !inner}>
          <CircleDot className="h-3.5 w-3.5" /> Inner ring {colourDot(colours.inner.color)}
        </button>
        <button type="button" onClick={() => openRing('outer')} className={ringToolBtnClass(panel === 'outer')} disabled={!editable && !outer}>
          <Circle className="h-3.5 w-3.5" /> Outer ring {colourDot(colours.outer.color)}
        </button>
        <button type="button" onClick={() => togglePanel('diam')} className={ringToolBtnClass(panel === 'diam')}>
          <Diameter className="h-3.5 w-3.5" /> Diameter {colourDot(colours.diam.color)}
        </button>
        {scaleToolOn ? (
          <button type="button" onClick={() => togglePanel('scale')} className={ringToolBtnClass(panel === 'scale')}>
            <Ruler className="h-3.5 w-3.5" /> Scale line {colourDot(colours.scale.color)}
          </button>
        ) : null}
        <button
          type="button"
          onClick={openThickness}
          disabled={!inner || !outer || (!editable && !thicknessApplied)}
          className={ringToolBtnClass(panel === 'thick')}
          title={!inner || !outer ? 'Place both rings first' : undefined}
        >
          <Target className="h-3.5 w-3.5" /> Thickness t1–t8 {colourDot(colours.thick.color)}
        </button>
        <span className="mx-0.5 hidden h-6 w-px bg-stone-300 sm:inline-block" aria-hidden />
        <button type="button" onClick={() => togglePanel('image')} className={ringToolBtnClass(panel === 'image')}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> View
        </button>
        <button type="button" onClick={() => togglePanel('colours')} className={ringToolBtnClass(panel === 'colours')}>
          <Palette className="h-3.5 w-3.5" /> Colours
        </button>
        {editable ? (
          <button type="button" onClick={() => togglePanel('reset')} className={ringToolBtnClass(panel === 'reset')}>
            <Eraser className="h-3.5 w-3.5" /> Clear
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} className={ringToolBtnClass(false)} aria-label="Zoom out" title="Zoom out (-)">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={fit} className={ringToolBtnClass(false)} title="Fit to window (0)">
            <Maximize className="h-3.5 w-3.5" /> Fit
          </button>
          <button type="button" onClick={() => zoomBy(ZOOM_STEP)} className={ringToolBtnClass(false)} aria-label="Zoom in" title="Zoom in (+)">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-right font-mono text-[11px] text-stone-600">{Math.round(view.zoom * 100)}%</span>
        </div>
      </div>

      {message ? <MessageLine text={message.text} tone={message.tone === 'error' ? 'error' : 'info'} /> : null}

      <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:flex-row">
        <div
          ref={wrapRef}
          className="relative h-[55vh] min-h-[320px] min-w-0 flex-1 overflow-hidden border-2 border-stone-500 bg-stone-800 lg:h-[62vh] lg:min-h-[420px]"
        >
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="Ring test photo with the rings, diameter lines and thickness points"
            className={cn('absolute inset-0 block h-full w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500', cursor)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            onContextMenu={(e) => e.preventDefault()}
          />
          <span className="pointer-events-none absolute bottom-2 left-2 max-w-[70%] bg-stone-900/75 px-1.5 py-0.5 text-[10px] text-stone-100">
            {editable ? TOOL_HINT[tool] : TOOL_HINT.view}
          </span>
          <div className="pointer-events-none absolute bottom-2 right-2">
            <RingVerdictBadge summary={calc.summary} className="shadow" />
          </div>
        </div>
        {panelContent ? <aside className="w-full shrink-0 lg:max-h-[62vh] lg:w-72 lg:overflow-y-auto">{panelContent}</aside> : null}
      </div>

      <RingResultTable
        summary={calc.summary}
        missing={missing}
        limits={limits}
        limitsVerified={limitsVerified}
        scale={scale}
        dMm={dMm}
        measuredDiameterMm={measuredDiameterMm}
        error={calc.error}
      />
    </div>
  )
}
