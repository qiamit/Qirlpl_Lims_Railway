import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Hand, Maximize2, PenLine, Undo2, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { readingLengthPx } from '../calc/scaleCalibration'
import type { CalibrationReading } from '../types'

/**
 * S4: the stage micrometer image with the readings drawn on it. Each reading
 * is a line between two micrometer divisions that are `reference_length_um`
 * apart. Coordinates are in ORIGINAL image pixels (the SVG viewBox is the
 * natural image size), so zoom never changes the numbers the database
 * recomputes. Shift keeps the line exactly horizontal (x) or vertical (y).
 */

type Zoom = 'fit' | 1 | 2 | 4

type Line = { x1: number; y1: number; x2: number; y2: number }

/** Clicks shorter than this (image px) are ignored rather than saved as a reading. */
const MIN_DRAW_PX = 3

const AXIS_STROKE: Record<'x' | 'y', string> = { x: '#f59e0b', y: '#0ea5e9' }

const round2 = (v: number) => Math.round(v * 100) / 100

export type MicrometerReadingsCanvasProps = {
  /** Object URL of the micrometer image (blob, so nothing is fetched cross-origin). */
  imageUrl: string
  /** Natural size of the image in pixels. */
  width: number
  height: number
  readings: CalibrationReading[]
  /** Omitted or readOnly: view only. */
  onChange?: (next: CalibrationReading[]) => void
  readOnly: boolean
  /** Highlighted reading (index into readings). */
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  /** A drawn line was refused (wrong direction). */
  onRejected?: (message: string) => void
}

export function MicrometerReadingsCanvas({
  imageUrl,
  width,
  height,
  readings,
  onChange,
  readOnly,
  selectedIndex,
  onSelect,
  onRejected,
}: MicrometerReadingsCanvasProps) {
  const canDraw = !readOnly && Boolean(onChange)
  const [axis, setAxis] = useState<'x' | 'y'>('x')
  const [tool, setTool] = useState<'draw' | 'pan'>('draw')
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [draft, setDraft] = useState<Line | null>(null)
  const [renderWidth, setRenderWidth] = useState(0)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Screen size of the image, so markers and labels keep a constant size on screen.
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setRenderWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const drawing = canDraw && tool === 'draw'
  const scale = renderWidth > 0 ? renderWidth / width : 1
  const px = (screenPx: number) => screenPx / scale

  const toImage = (e: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const x = ((e.clientX - rect.left) * width) / rect.width
    const y = ((e.clientY - rect.top) * height) / rect.height
    return { x: Math.min(width, Math.max(0, x)), y: Math.min(height, Math.max(0, y)) }
  }

  const straighten = (line: Line, lock: boolean): Line => {
    if (!lock) return line
    return axis === 'x' ? { ...line, y2: line.y1 } : { ...line, x2: line.x1 }
  }

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing || e.button !== 0) return
    const p = toImage(e)
    if (!p) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return
    const p = toImage(e)
    if (!p) return
    setDraft(straighten({ ...draft, x2: p.x, y2: p.y }, e.shiftKey))
  }

  const finish = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return
    const p = toImage(e)
    const line = straighten(p ? { ...draft, x2: p.x, y2: p.y } : draft, e.shiftKey)
    setDraft(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const dx = Math.abs(line.x2 - line.x1)
    const dy = Math.abs(line.y2 - line.y1)
    if (Math.hypot(dx, dy) < MIN_DRAW_PX) return
    if (axis === 'x' && dx < dy) {
      onRejected?.('An x reading must be drawn along the horizontal axis. Choose "Y readings" for a vertical line.')
      return
    }
    if (axis === 'y' && dy < dx) {
      onRejected?.('A y reading must be drawn along the vertical axis. Choose "X readings" for a horizontal line.')
      return
    }
    const next: CalibrationReading = {
      axis,
      x1: round2(line.x1),
      y1: round2(line.y1),
      x2: round2(line.x2),
      y2: round2(line.y2),
    }
    onChange?.([...readings, next])
    onSelect(readings.length)
  }

  const cancelDraft = () => setDraft(null)

  const undoLast = () => {
    if (!onChange || readings.length === 0) return
    onChange(readings.slice(0, -1))
    onSelect(null)
  }

  const stageStyle = zoom === 'fit' ? { width: '100%' } : { width: `${width * zoom}px` }
  const draftLength = draft ? readingLengthPx(draft) : null

  const toolBtn = (active: boolean) =>
    cn(
      limsOutlineBtnClass,
      'h-8 gap-1 px-2 text-[12px]',
      active && 'border-amber-700 bg-amber-700 text-white hover:bg-amber-800 hover:text-white',
    )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {canDraw ? (
          <>
            <div className="inline-flex" role="group" aria-label="Reading axis">
              <Button type="button" variant="outline" className={toolBtn(axis === 'x')} aria-pressed={axis === 'x'} onClick={() => setAxis('x')}>
                <span className="inline-block h-0.5 w-3 bg-amber-500" aria-hidden /> X readings
              </Button>
              <Button type="button" variant="outline" className={toolBtn(axis === 'y')} aria-pressed={axis === 'y'} onClick={() => setAxis('y')}>
                <span className="inline-block h-3 w-0.5 bg-sky-500" aria-hidden /> Y readings
              </Button>
            </div>
            <div className="inline-flex" role="group" aria-label="Tool">
              <Button type="button" variant="outline" className={toolBtn(tool === 'draw')} aria-pressed={tool === 'draw'} onClick={() => setTool('draw')}>
                <PenLine size={14} /> Draw
              </Button>
              <Button type="button" variant="outline" className={toolBtn(tool === 'pan')} aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>
                <Hand size={14} /> Scroll
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'h-8 gap-1 px-2 text-[12px]')}
              onClick={undoLast}
              disabled={readings.length === 0}
            >
              <Undo2 size={14} /> Undo last
            </Button>
          </>
        ) : null}
        <div className="inline-flex" role="group" aria-label="Zoom">
          <Button type="button" variant="outline" className={toolBtn(zoom === 'fit')} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
            <Maximize2 size={14} /> Fit
          </Button>
          {([1, 2, 4] as const).map((z) => (
            <Button key={z} type="button" variant="outline" className={toolBtn(zoom === z)} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {z === 1 ? <ZoomIn size={14} /> : null}
              {z * 100}%
            </Button>
          ))}
        </div>
        {draftLength !== null ? (
          <span className="font-mono text-[12px] tabular-nums text-stone-700">{draftLength.toFixed(2)} px</span>
        ) : null}
      </div>

      <div className="max-h-[60vh] overflow-auto border border-stone-500 bg-stone-900">
        <div ref={stageRef} className="relative" style={stageStyle}>
          <img
            src={imageUrl}
            alt="Stage micrometer"
            draggable={false}
            className="block h-auto w-full select-none"
          />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={cn('absolute inset-0 h-full w-full', drawing ? 'cursor-crosshair touch-none' : 'cursor-default')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finish}
            onPointerCancel={cancelDraft}
          >
            {readings.map((r, i) => {
              const selected = i === selectedIndex
              const stroke = AXIS_STROKE[r.axis]
              const sameAxisNo = readings.slice(0, i + 1).filter((o) => o.axis === r.axis).length
              const tick = px(6)
              const ticks =
                r.axis === 'x'
                  ? [
                      { x1: r.x1, y1: r.y1 - tick, x2: r.x1, y2: r.y1 + tick },
                      { x1: r.x2, y1: r.y2 - tick, x2: r.x2, y2: r.y2 + tick },
                    ]
                  : [
                      { x1: r.x1 - tick, y1: r.y1, x2: r.x1 + tick, y2: r.y1 },
                      { x1: r.x2 - tick, y1: r.y2, x2: r.x2 + tick, y2: r.y2 },
                    ]
              return (
                <g
                  key={i}
                  onPointerDown={drawing ? undefined : () => onSelect(selected ? null : i)}
                  className={drawing ? undefined : 'cursor-pointer'}
                >
                  <line
                    x1={r.x1}
                    y1={r.y1}
                    x2={r.x2}
                    y2={r.y2}
                    stroke={selected ? '#ffffff' : stroke}
                    strokeWidth={selected ? 3 : 2}
                    vectorEffect="non-scaling-stroke"
                  />
                  {ticks.map((t, k) => (
                    <line key={k} {...t} stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  ))}
                  <text
                    x={(r.x1 + r.x2) / 2 + (r.axis === 'y' ? px(8) : 0)}
                    y={(r.y1 + r.y2) / 2 - (r.axis === 'x' ? px(8) : 0)}
                    fontSize={px(12)}
                    fontWeight={700}
                    fill={stroke}
                    stroke="#1c1917"
                    strokeWidth={px(3)}
                    paintOrder="stroke"
                    textAnchor={r.axis === 'x' ? 'middle' : 'start'}
                  >
                    {r.axis}
                    {sameAxisNo}
                  </text>
                </g>
              )
            })}
            {draft ? (
              <line
                x1={draft.x1}
                y1={draft.y1}
                x2={draft.x2}
                y2={draft.y2}
                stroke={AXIS_STROKE[axis]}
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        </div>
      </div>
      {canDraw ? (
        <p className="text-[11.5px] text-stone-600">
          Drag from one micrometer division to the division one reference length away. Hold Shift for a straight line.
          Zoom in for accuracy; use Scroll to move around the zoomed image.
        </p>
      ) : null}
    </div>
  )
}
