import { useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Annotation, Mark, OperatorAdjustments, Point } from '../engines/types'
import type { InImageScale } from '../types'
import { displayFilterCss, displayTransformCss, zoomAt, ZOOM_STEP, type Display } from './displayAdjustments'
import {
  arrowHeadPoints,
  clientToImagePoint,
  formatLengthMm,
  getContainedImageRect,
  labelAnchor,
  LAYER_COLORS,
  lineLengthPx,
  markColor,
  newVectorId,
  niceScaleBar,
  normalizeRect,
} from './imageCanvasUtils'
import type { StageTool } from './ImageEditToolbar'

/**
 * Centre of the workbench (design 3.3 S2 "image stage"). Shows the ORIGINAL
 * image (object URL of the downloaded blob) with zoom / pan as a CSS
 * transform and view-only brightness / contrast, and an SVG layer in original
 * pixel coordinates (viewBox = image size) for ROI, exclusion polygons, marks
 * (engine proposals amber, operator marks cyan), reference lines and
 * annotations. Nothing here changes the image bytes.
 */

type Line = { x1: number; y1: number; x2: number; y2: number }

export type ImageStageProps = {
  imageUrl: string | null
  /** Original pixel size. */
  width: number
  height: number
  display: Display
  onDisplayChange: (next: Display) => void
  tool: StageTool
  /** Drawing tools are ignored when true (select / pan / zoom still work). */
  readOnly: boolean
  marks: Mark[]
  adjustments: OperatorAdjustments | null
  annotations: Annotation[]
  scaleLines?: InImageScale['lines'] | null
  /** mm per original pixel (x, y) for lengths and the scale bar; null = no scale yet. */
  mmPerPx: { x: number; y: number } | null
  annotationColor?: string
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onAdjustmentsChange?: (next: OperatorAdjustments) => void
  onAnnotationsChange?: (next: Annotation[]) => void
  onMarkAdded?: (mark: Mark) => void
  onScaleLineDrawn?: (line: Line) => void
  /** Delete / Backspace on the focused stage. */
  onDeleteSelected?: () => void
  loading?: boolean
  /** Shown instead of the image (no field yet, decode error). */
  emptyText?: ReactNode
  className?: string
}

type Draft =
  | { kind: 'rect' | 'measure' | 'scale' | 'arrow'; a: Point; b: Point }
  | { kind: 'poly'; points: Point[]; hover: Point | null }

/** Length text of a line in original pixels, in mm when the scale is known. */
function lineLabel(l: Line, mmPerPx: { x: number; y: number } | null): { px: number; mm: number | null; text: string } {
  const px = lineLengthPx(l)
  const mm = mmPerPx ? Math.hypot((l.x2 - l.x1) * mmPerPx.x, (l.y2 - l.y1) * mmPerPx.y) : null
  return { px, mm, text: mm !== null ? formatLengthMm(mm) : `${px.toFixed(1)} px` }
}

export function ImageStage(props: ImageStageProps) {
  const {
    imageUrl,
    width: W,
    height: H,
    display,
    onDisplayChange,
    tool,
    readOnly,
    marks,
    adjustments,
    annotations,
    scaleLines,
    mmPerPx,
    annotationColor = LAYER_COLORS.annotation,
    selectedId = null,
    onSelect,
    onAdjustmentsChange,
    onAnnotationsChange,
    onMarkAdded,
    onScaleLineDrawn,
    onDeleteSelected,
    loading,
    emptyText,
    className,
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{ x: number; y: number; panX: number; panY: number; id: number } | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [textAt, setTextAt] = useState<{ img: Point; sx: number; sy: number; value: string } | null>(null)

  const hasImage = Boolean(imageUrl) && W > 0 && H > 0
  const fit = getContainedImageRect(box.w, box.h, W, H)
  /** Original pixels per screen pixel (keeps strokes and labels a constant screen size). */
  const k = fit.width > 0 ? W / (fit.width * display.zoom) : 1
  const drawing = !readOnly

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onWheel = useEffectEvent((e: WheelEvent) => {
    if (!hasImage) return
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const ax = e.clientX - r.left - fit.x
    const ay = e.clientY - r.top - fit.y
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    onDisplayChange(zoomAt(display, factor, ax, ay, fit.width / 2, fit.height / 2))
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => onWheel(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const toImage = (e: { clientX: number; clientY: number }, clamp = true) =>
    layerRef.current ? clientToImagePoint(e.clientX, e.clientY, layerRef.current, W, H, clamp) : null

  const startPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    panRef.current = { x: e.clientX, y: e.clientY, panX: display.panX, panY: display.panY, id: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const commitPolygon = (points: Point[]) => {
    setDraft(null)
    if (points.length < 3 || !onAdjustmentsChange) return
    const prev = adjustments ?? {}
    onAdjustmentsChange({ ...prev, exclusions: [...(prev.exclusions ?? []), { id: newVectorId('ex'), points }] })
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasImage) return
    containerRef.current?.focus({ preventScroll: true })
    if (tool === 'pan' || e.button === 1) {
      startPan(e)
      return
    }
    if (e.button !== 0) return
    if (tool === 'select' || !drawing) {
      onSelect?.(null)
      if (tool === 'select') startPan(e)
      return
    }
    const p = toImage(e)
    if (!p) return
    if (tool === 'text') {
      const r = containerRef.current?.getBoundingClientRect()
      setTextAt({ img: p, sx: e.clientX - (r?.left ?? 0), sy: e.clientY - (r?.top ?? 0), value: '' })
      return
    }
    if (tool === 'exclusion') {
      const pts = draft?.kind === 'poly' ? draft.points : []
      const first = pts[0]
      if (first && pts.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) < 8 * k) {
        commitPolygon(pts)
      } else {
        setDraft({ kind: 'poly', points: [...pts, p], hover: p })
      }
      return
    }
    const kind = tool === 'roi' ? 'rect' : tool === 'measure' ? 'measure' : tool === 'scale_line' ? 'scale' : 'arrow'
    setDraft({ kind, a: p, b: p })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (pan && pan.id === e.pointerId) {
      onDisplayChange({ ...display, panX: pan.panX + e.clientX - pan.x, panY: pan.panY + e.clientY - pan.y })
      return
    }
    if (!draft) return
    const p = toImage(e)
    if (!p) return
    if (draft.kind === 'poly') setDraft({ ...draft, hover: p })
    else setDraft({ ...draft, b: p })
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current && panRef.current.id === e.pointerId) {
      panRef.current = null
      return
    }
    if (!draft || draft.kind === 'poly') return
    setDraft(null)
    const { a, b } = draft
    const line = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    const len = lineLengthPx(line)
    if (draft.kind === 'rect') {
      const r = normalizeRect(a.x, a.y, b.x, b.y)
      if (r.width < 4 || r.height < 4 || !onAdjustmentsChange) return
      onAdjustmentsChange({ ...(adjustments ?? {}), roi: { x: r.x, y: r.y, width: r.width, height: r.height } })
      return
    }
    if (len < 2) return
    if (draft.kind === 'measure') {
      const lab = lineLabel(line, mmPerPx)
      onMarkAdded?.({
        id: newVectorId('ml'),
        kind: 'measure_line',
        origin: 'operator',
        geometry: { type: 'line', ...line },
        label: lab.text,
        meta: { length_px: Math.round(lab.px * 100) / 100, length_mm: lab.mm === null ? null : Math.round(lab.mm * 10000) / 10000 },
      })
    } else if (draft.kind === 'scale') {
      onScaleLineDrawn?.(line)
    } else if (draft.kind === 'arrow' && onAnnotationsChange) {
      onAnnotationsChange([...annotations, { id: newVectorId('an'), type: 'arrow', ...line, color: annotationColor }])
    }
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDraft(null)
      setTextAt(null)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && drawing) {
      e.preventDefault()
      onDeleteSelected?.()
    } else if (e.key === 'Enter' && draft?.kind === 'poly') {
      commitPolygon(draft.points)
    }
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      onKeyDown(e)
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [])

  const commitText = () => {
    if (!textAt) return
    const text = textAt.value.trim()
    setTextAt(null)
    if (!text || !onAnnotationsChange) return
    onAnnotationsChange([...annotations, { id: newVectorId('an'), type: 'text', x: textAt.img.x, y: textAt.img.y, text, color: annotationColor }])
  }

  // ---- SVG helpers (sizes in original pixels, scaled by k to stay constant on screen)
  const sw = 2 * k
  const selectable = tool === 'select'
  const hit = (id: string) =>
    selectable
      ? {
          style: { pointerEvents: 'stroke' as const, cursor: 'pointer' },
          onPointerDown: (e: ReactPointerEvent<SVGElement>) => {
            e.stopPropagation()
            onSelect?.(id)
          },
        }
      : { style: { pointerEvents: 'none' as const } }
  const sel = (id: string) => (id === selectedId ? { filter: 'drop-shadow(0 0 2px #fff)' } : undefined)

  const renderLine = (id: string, l: Line, color: string, extra?: ReactNode) => (
    <g key={id} style={sel(id)}>
      <line {...l} stroke="transparent" strokeWidth={12 * k} {...hit(id)} />
      <line {...l} stroke={color} strokeWidth={id === selectedId ? sw * 1.8 : sw} style={{ pointerEvents: 'none' }} />
      {extra}
    </g>
  )

  const renderMark = (m: Mark) => {
    const g = m.geometry
    const color = markColor(m)
    const label = m.label ? labelAnchor(m) : null
    const text = label ? (
      <text x={label.x + 4 * k} y={label.y - 4 * k} fontSize={13 * k} fill={color} stroke="#000" strokeWidth={3 * k} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
        {m.label}
      </text>
    ) : null
    switch (g.type) {
      case 'line':
        return renderLine(m.id, g, color, text)
      case 'point':
        return (
          <g key={m.id} style={sel(m.id)}>
            <circle cx={g.x} cy={g.y} r={4 * k} fill={color} {...hit(m.id)} style={{ ...hit(m.id).style, pointerEvents: selectable ? 'all' : 'none' }} />
            {text}
          </g>
        )
      case 'circle':
        return (
          <g key={m.id} style={sel(m.id)}>
            <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke={color} strokeWidth={sw} {...hit(m.id)} />
            {text}
          </g>
        )
      case 'rect':
        return (
          <g key={m.id} style={sel(m.id)}>
            <rect x={g.x} y={g.y} width={g.width} height={g.height} fill="none" stroke={color} strokeWidth={sw} {...hit(m.id)} />
            {text}
          </g>
        )
      case 'polyline':
      case 'polygon': {
        const pts = g.points.map((p) => `${p.x},${p.y}`).join(' ')
        const El = g.type === 'polygon' ? 'polygon' : 'polyline'
        return (
          <g key={m.id} style={sel(m.id)}>
            <El points={pts} fill="none" stroke={color} strokeWidth={sw} {...hit(m.id)} />
            {text}
          </g>
        )
      }
    }
  }

  const roi = adjustments?.roi ?? null
  const scaleBar = hasImage && mmPerPx && fit.width > 0 ? niceScaleBar((fit.width * display.zoom) / W / mmPerPx.x) : null

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label="Image stage"
      className={cn(
        'relative h-[55vh] min-h-[280px] select-none overflow-hidden bg-stone-950 outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
        tool === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : drawing ? 'cursor-crosshair' : 'cursor-default',
        className,
      )}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        panRef.current = null
        setDraft((d) => (d?.kind === 'poly' ? d : null))
      }}
      onDoubleClick={() => {
        if (draft?.kind === 'poly') commitPolygon(draft.points)
      }}
    >
      {hasImage ? (
        <div
          ref={layerRef}
          className="absolute"
          style={{
            left: fit.x,
            top: fit.y,
            width: fit.width,
            height: fit.height,
            transform: displayTransformCss(display),
            transformOrigin: 'center center',
          }}
        >
          <img
            src={imageUrl ?? undefined}
            alt="Field image"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ filter: displayFilterCss(display), imageRendering: display.zoom * (fit.width / W) > 2 ? 'pixelated' : undefined }}
          />
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {roi ? (
              <rect
                x={roi.x}
                y={roi.y}
                width={roi.width}
                height={roi.height}
                fill="none"
                stroke={LAYER_COLORS.roi}
                strokeWidth={sw}
                strokeDasharray={`${8 * k} ${6 * k}`}
                {...hit('roi')}
                style={{ ...hit('roi').style, ...sel('roi') }}
              />
            ) : null}
            {(adjustments?.exclusions ?? []).map((ex) => (
              <polygon
                key={ex.id}
                points={ex.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={LAYER_COLORS.exclusion}
                fillOpacity={0.22}
                stroke={LAYER_COLORS.exclusion}
                strokeWidth={ex.id === selectedId ? sw * 1.8 : sw}
                {...hit(ex.id)}
                style={{ ...hit(ex.id).style, pointerEvents: selectable ? 'all' : 'none', ...sel(ex.id) }}
              />
            ))}
            {marks.map(renderMark)}
            {(scaleLines ?? []).map((l, i) =>
              renderLine(
                `scale_${i}`,
                l,
                LAYER_COLORS.scaleLine,
                <text x={l.x2 + 4 * k} y={l.y2 - 4 * k} fontSize={13 * k} fill={LAYER_COLORS.scaleLine} stroke="#000" strokeWidth={3 * k} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                  {l.length_mm ? `${l.length_mm} mm` : 'reference'}
                </text>,
              ),
            )}
            {annotations.map((a) => {
              const color = a.color || LAYER_COLORS.annotation
              if (a.type === 'arrow') {
                return renderLine(
                  a.id,
                  a,
                  color,
                  <polygon points={arrowHeadPoints(a.x1, a.y1, a.x2, a.y2, 12 * k)} fill={color} style={{ pointerEvents: 'none' }} />,
                )
              }
              return (
                <text
                  key={a.id}
                  x={a.x}
                  y={a.y}
                  fontSize={16 * k}
                  fontWeight={700}
                  fill={color}
                  stroke="#000"
                  strokeWidth={3 * k}
                  paintOrder="stroke"
                  {...hit(a.id)}
                  style={{ ...hit(a.id).style, pointerEvents: selectable ? 'all' : 'none', ...sel(a.id) }}
                >
                  {a.text}
                </text>
              )
            })}
            {draft && draft.kind !== 'poly' ? (
              draft.kind === 'rect' ? (
                <rect
                  {...normalizeRect(draft.a.x, draft.a.y, draft.b.x, draft.b.y)}
                  fill="none"
                  stroke={LAYER_COLORS.roi}
                  strokeWidth={sw}
                  strokeDasharray={`${8 * k} ${6 * k}`}
                />
              ) : (
                <g style={{ pointerEvents: 'none' }}>
                  <line
                    x1={draft.a.x}
                    y1={draft.a.y}
                    x2={draft.b.x}
                    y2={draft.b.y}
                    stroke={draft.kind === 'scale' ? LAYER_COLORS.scaleLine : draft.kind === 'arrow' ? annotationColor : LAYER_COLORS.operator}
                    strokeWidth={sw}
                  />
                  {draft.kind !== 'arrow' ? (
                    <text x={draft.b.x + 6 * k} y={draft.b.y - 6 * k} fontSize={13 * k} fill="#fff" stroke="#000" strokeWidth={3 * k} paintOrder="stroke">
                      {lineLabel({ x1: draft.a.x, y1: draft.a.y, x2: draft.b.x, y2: draft.b.y }, draft.kind === 'scale' ? null : mmPerPx).text}
                    </text>
                  ) : null}
                </g>
              )
            ) : null}
            {draft?.kind === 'poly' ? (
              <g style={{ pointerEvents: 'none' }}>
                <polyline
                  points={[...draft.points, ...(draft.hover ? [draft.hover] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={LAYER_COLORS.exclusion}
                  strokeWidth={sw}
                  strokeDasharray={`${6 * k} ${4 * k}`}
                />
                {draft.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={(i === 0 ? 5 : 3) * k} fill={LAYER_COLORS.exclusion} />
                ))}
              </g>
            ) : null}
          </svg>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-[13px] text-stone-300">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-amber-400" /> : <ImageOff className="h-6 w-6 text-stone-500" />}
          <div>{loading ? 'Loading the original image…' : (emptyText ?? 'No image yet. Add an image in the fields list.')}</div>
        </div>
      )}

      {scaleBar ? (
        <div className="pointer-events-none absolute bottom-2 left-2 bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
          <div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: scaleBar.px }} />
          <div className="mt-0.5">{formatLengthMm(scaleBar.mm)}</div>
        </div>
      ) : hasImage ? (
        <div className="pointer-events-none absolute bottom-2 left-2 bg-black/60 px-2 py-1 text-[11px] text-amber-200">No scale set</div>
      ) : null}

      {draft?.kind === 'poly' ? (
        <div className="pointer-events-none absolute right-2 top-2 bg-black/70 px-2 py-1 text-[11px] text-white">
          Click to add points · double-click or Enter to close · Esc to cancel
        </div>
      ) : null}

      {textAt ? (
        <div
          className="absolute z-10 flex items-center gap-1 border border-amber-500 bg-stone-900 p-1"
          style={{ left: Math.min(textAt.sx, Math.max(0, box.w - 220)), top: Math.min(textAt.sy, Math.max(0, box.h - 40)) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            aria-label="Annotation text"
            value={textAt.value}
            maxLength={120}
            placeholder="Label text"
            onChange={(e) => setTextAt({ ...textAt, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText()
              if (e.key === 'Escape') setTextAt(null)
            }}
            className="h-8 w-40 border border-stone-500 bg-stone-50 px-2 text-sm text-stone-900"
          />
          <button type="button" className="h-8 bg-amber-700 px-2 text-xs font-semibold text-white" onClick={commitText}>
            Add
          </button>
        </div>
      ) : null}
    </div>
  )
}
