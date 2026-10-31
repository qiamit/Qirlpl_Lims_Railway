import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Grid3x3,
  Loader2,
  Maximize,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Sparkles,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { RING_THICKNESS_LABELS, type MarkOrigin } from '@/features/metallography/engines/types'
import { cn } from '@/lib/utils'
import { IMAGE_FILTER_ROWS, isDefaultFilter, type ImageFilter } from './ringImageFilter'
import {
  RING_LAYER_LABEL,
  RING_LINE_WIDTH_MAX,
  RING_LINE_WIDTH_MIN,
  type RingDisplayColours,
  type RingLayer,
} from './ringDisplayColours'
import {
  MAX_POLYGON_SIDES,
  MIN_POLYGON_SIDES,
  lineLengthPx,
  type EdgeCircle,
  type EdgeShapeConfig,
  type Line,
  type RefLine,
} from './ringGeometry'
import {
  ringCardClass,
  ringCardTitleClass,
  ringChoiceBtnClass,
  ringDangerBtnClass,
  ringHintClass,
  ringInputClass,
  ringSectionLabelClass,
  ringSmallBtnClass,
  ringWideBtnClass,
} from './ringUi'

/** Tool side panels of the ring editor (old RingEditor right-hand "Adjust …" cards), in LIMS chrome. */

function PanelFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={cn(ringCardClass, 'space-y-3')}>
      <div className="flex items-center justify-between gap-2 border-b border-stone-300 pb-1.5">
        <h3 className={ringCardTitleClass}>{title}</h3>
        <button type="button" onClick={onClose} className={ringSmallBtnClass} aria-label="Close panel" title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={ringSectionLabelClass}>{label}</p>
      {children}
    </div>
  )
}

/** Arrow pad that moves the selected item by `step` image pixels. */
export function NudgePad({
  onNudge,
  disabled,
  step = 5,
}: {
  onNudge: (dx: number, dy: number) => void
  disabled?: boolean
  step?: number
}) {
  return (
    <div className="grid w-fit grid-cols-3 gap-1">
      <span />
      <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onNudge(0, -step)} aria-label="Move up">
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <span />
      <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onNudge(-step, 0)} aria-label="Move left">
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onNudge(0, step)} aria-label="Move down">
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onNudge(step, 0)} aria-label="Move right">
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function RotatePair({
  onRotate,
  disabled,
  step = 5,
  suffix,
}: {
  onRotate: (deltaDeg: number) => void
  disabled?: boolean
  step?: number
  suffix?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onRotate(-step)}>
        <RotateCcw className="h-3.5 w-3.5" /> {step}°
      </button>
      <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onRotate(step)}>
        <RotateCw className="h-3.5 w-3.5" /> {step}°
      </button>
      {suffix}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inner / outer ring
// ---------------------------------------------------------------------------

export function EdgeAdjustPanel({
  ring,
  circle,
  shape,
  origin,
  readOnly,
  detecting,
  onDetect,
  onShapeMode,
  onSides,
  onRadius,
  onRotate,
  onMove,
  onDelete,
  onClose,
}: {
  ring: 'inner' | 'outer'
  circle: EdgeCircle | null
  shape: EdgeShapeConfig
  origin: MarkOrigin
  readOnly: boolean
  detecting: boolean
  onDetect: () => void
  onShapeMode: (mode: EdgeShapeConfig['mode']) => void
  onSides: (sides: number) => void
  onRadius: (deltaPx: number) => void
  onRotate: (deltaDeg: number) => void
  onMove: (dx: number, dy: number) => void
  onDelete: () => void
  onClose: () => void
}) {
  const disabled = readOnly || !circle
  return (
    <PanelFrame title={ring === 'inner' ? 'Inner ring (hole edge)' : 'Outer ring (skin)'} onClose={onClose}>
      {!readOnly ? (
        <button type="button" onClick={onDetect} disabled={detecting} className={ringWideBtnClass}>
          {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
          {detecting ? 'Scanning…' : ring === 'inner' ? 'Auto detect inner ring' : 'Auto detect outer ring'}
        </button>
      ) : null}
      {circle ? (
        <p className={ringHintClass}>
          Centre {circle.cx.toFixed(1)}, {circle.cy.toFixed(1)} px · radius {circle.r.toFixed(1)} px ·{' '}
          {origin === 'engine' ? 'as detected' : 'placed / edited by you'}
        </p>
      ) : (
        <p className={ringHintClass}>Not placed yet.</p>
      )}
      <Section label="Shape">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['circle', 'polygon'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onShapeMode(m)}
              className={ringChoiceBtnClass(shape.mode === m)}
            >
              {m === 'circle' ? 'Circle' : 'Polygon'}
            </button>
          ))}
          <label className="inline-flex items-center gap-1.5 text-xs text-stone-600">
            Sides
            <input
              type="number"
              min={MIN_POLYGON_SIDES}
              max={MAX_POLYGON_SIDES}
              disabled={disabled || shape.mode !== 'polygon'}
              value={Math.round(shape.sides)}
              onChange={(e) => onSides(Number(e.target.value))}
              className={cn(ringInputClass, 'w-16 text-right')}
            />
          </label>
        </div>
        {shape.mode === 'polygon' && !readOnly ? (
          <p className={ringHintClass}>
            Drag a corner, or drag an edge (Ctrl / Cmd-click to pick several edges). Arrow keys move the picked corner.
          </p>
        ) : null}
      </Section>
      <Section label="Size">
        <div className="flex gap-1.5">
          <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onRadius(-5)} aria-label="Smaller">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={disabled} className={ringSmallBtnClass} onClick={() => onRadius(5)} aria-label="Larger">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </Section>
      <Section label="Rotate polygon">
        <RotatePair
          onRotate={onRotate}
          disabled={disabled || shape.mode !== 'polygon'}
          suffix={<span className="text-xs text-stone-600">{shape.rotationDeg.toFixed(0)}°</span>}
        />
      </Section>
      <Section label="Move">
        <NudgePad onNudge={onMove} disabled={disabled} />
      </Section>
      {!readOnly ? (
        <div className="flex justify-end border-t border-stone-300 pt-2">
          <button type="button" disabled={!circle} onClick={onDelete} className={ringDangerBtnClass}>
            <Trash2 className="h-3.5 w-3.5" /> Remove ring
          </button>
        </div>
      ) : null}
    </PanelFrame>
  )
}

// ---------------------------------------------------------------------------
// Diameter lines
// ---------------------------------------------------------------------------

export function DiameterPanel({
  lines,
  selected,
  lengthMm,
  readOnly,
  canAuto,
  onSelect,
  onAuto,
  onNudge,
  onRotate,
  onDelete,
  onClose,
}: {
  lines: Line[]
  selected: number | null
  /** Length in mm of each line, null without a scale. */
  lengthMm: Array<number | null>
  readOnly: boolean
  canAuto: boolean
  onSelect: (index: number) => void
  onAuto: () => void
  onNudge: (dx: number, dy: number) => void
  onRotate: (deltaDeg: number) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <PanelFrame title="Diameter lines" onClose={onClose}>
      {!readOnly ? (
        <>
          <button type="button" onClick={onAuto} disabled={!canAuto} className={ringWideBtnClass}>
            Draw two diameters through the centre
          </button>
          <p className={ringHintClass}>Or drag on the photo to draw a line. Informative only: the limits use the nominal d.</p>
        </>
      ) : null}
      <Section label="Lines">
        <div className="max-h-32 space-y-1 overflow-auto">
          {lines.length === 0 ? (
            <p className={ringHintClass}>No line drawn.</p>
          ) : (
            lines.map((l, i) => (
              <button
                key={`d-${i}`}
                type="button"
                onClick={() => onSelect(i)}
                className={cn(ringChoiceBtnClass(selected === i), 'w-full justify-start font-mono')}
              >
                D{i + 1} · {lineLengthPx(l).toFixed(1)} px
                {lengthMm[i] !== null && lengthMm[i] !== undefined ? ` · ${(lengthMm[i] as number).toFixed(3)} mm` : ''}
              </button>
            ))
          )}
        </div>
      </Section>
      {!readOnly ? (
        <>
          <Section label="Move picked line">
            <NudgePad onNudge={onNudge} disabled={selected === null} />
          </Section>
          <Section label="Rotate all lines">
            <RotatePair onRotate={onRotate} disabled={lines.length === 0} />
          </Section>
          <div className="flex justify-end border-t border-stone-300 pt-2">
            <button type="button" disabled={selected === null} onClick={onDelete} className={ringDangerBtnClass}>
              <Trash2 className="h-3.5 w-3.5" /> Remove line
            </button>
          </div>
        </>
      ) : null}
    </PanelFrame>
  )
}

// ---------------------------------------------------------------------------
// In-image scale (reference line of known length)
// ---------------------------------------------------------------------------

export function ScaleLinePanel({
  lines,
  selected,
  lengthText,
  mmPerPx,
  readOnly,
  onSelect,
  onLengthText,
  onNudge,
  onDelete,
  onClose,
}: {
  lines: RefLine[]
  selected: number | null
  lengthText: string
  /** mm per pixel from the valid lines (same rule as the database), null when none. */
  mmPerPx: number | null
  readOnly: boolean
  onSelect: (index: number) => void
  onLengthText: (text: string) => void
  onNudge: (dx: number, dy: number) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <PanelFrame title="Scale line (known length)" onClose={onClose}>
      <Section label="Known length (mm)">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={lengthText}
          disabled={readOnly}
          onChange={(e) => onLengthText(e.target.value)}
          placeholder="e.g. 10"
          className={cn(ringInputClass, 'font-mono')}
        />
        {!readOnly ? (
          <p className={ringHintClass}>
            Enter the length of a ruler division or other known distance, then drag along it on the photo. The value
            applies to the picked line and to new lines.
          </p>
        ) : null}
      </Section>
      <div className="border border-amber-600/40 bg-amber-50 px-2 py-1.5 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Scale from lines</p>
        <p className="font-mono text-sm font-semibold text-amber-950">
          {mmPerPx !== null ? `${mmPerPx.toFixed(6)} mm/px` : '—'}
        </p>
      </div>
      <Section label="Lines">
        <div className="max-h-32 space-y-1 overflow-auto">
          {lines.length === 0 ? (
            <p className={ringHintClass}>No line drawn.</p>
          ) : (
            lines.map((l, i) => {
              const px = lineLengthPx(l)
              const ok = l.length_mm !== null && l.length_mm > 0 && px >= 1
              return (
                <button
                  key={`s-${i}`}
                  type="button"
                  onClick={() => onSelect(i)}
                  className={cn(ringChoiceBtnClass(selected === i), 'w-full justify-start font-mono')}
                >
                  S{i + 1} · {px.toFixed(1)} px · {l.length_mm !== null ? `${l.length_mm} mm` : 'length?'}
                  {ok ? ` · ${((l.length_mm as number) / px).toFixed(6)}` : ''}
                </button>
              )
            })
          )}
        </div>
      </Section>
      {!readOnly ? (
        <>
          <Section label="Move picked line">
            <NudgePad onNudge={onNudge} disabled={selected === null} />
          </Section>
          <div className="flex justify-end border-t border-stone-300 pt-2">
            <button type="button" disabled={selected === null} onClick={onDelete} className={ringDangerBtnClass}>
              <Trash2 className="h-3.5 w-3.5" /> Remove line
            </button>
          </div>
        </>
      ) : null}
    </PanelFrame>
  )
}

// ---------------------------------------------------------------------------
// Thickness points t1..t8
// ---------------------------------------------------------------------------

export type ThicknessSelection = 'none' | 'all' | number

export function ThicknessPanel({
  selection,
  validCount,
  readOnly,
  onSelect,
  onResize,
  onMove,
  onResetPoint,
  onClear,
  onClose,
}: {
  selection: ThicknessSelection
  validCount: number | null
  readOnly: boolean
  onSelect: (s: ThicknessSelection) => void
  onResize: (deltaPx: number) => void
  onMove: (deltaDeg: number) => void
  onResetPoint: () => void
  onClear: () => void
  onClose: () => void
}) {
  const keys: ThicknessSelection[] = ['none', ...RING_THICKNESS_LABELS.map((_, i) => i), 'all']
  const nothing = selection === 'none'
  return (
    <PanelFrame title="Thickness points t1–t8" onClose={onClose}>
      <p className={ringHintClass}>
        {validCount === null
          ? 'Points are applied. Set the scale and d to get values.'
          : `${validCount} of 8 points meet both edges.`}
      </p>
      <Section label="Pick point">
        <div className="grid grid-cols-5 gap-1">
          {keys.map((k) => (
            <button
              key={String(k)}
              type="button"
              onClick={() => onSelect(k)}
              className={ringChoiceBtnClass(selection === k)}
            >
              {k === 'none' ? 'None' : k === 'all' ? 'All' : RING_THICKNESS_LABELS[k]}
            </button>
          ))}
        </div>
        <p className={ringHintClass}>You can also click a point on the photo.</p>
      </Section>
      {!readOnly ? (
        <>
          <Section label="Outer end in / out (2 px)">
            <div className="flex gap-1.5">
              <button type="button" disabled={nothing} className={ringSmallBtnClass} onClick={() => onResize(-2)} aria-label="Shorter">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={nothing} className={ringSmallBtnClass} onClick={() => onResize(2)} aria-label="Longer">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </Section>
          <Section label="Move along the ring">
            <RotatePair onRotate={onMove} disabled={nothing} />
          </Section>
          <div className="flex flex-wrap justify-between gap-1.5 border-t border-stone-300 pt-2">
            <button type="button" disabled={nothing} onClick={onResetPoint} className={ringSmallBtnClass}>
              Undo adjustment
            </button>
            <button type="button" onClick={onClear} className={ringDangerBtnClass}>
              <Trash2 className="h-3.5 w-3.5" /> Remove points
            </button>
          </div>
        </>
      ) : null}
    </PanelFrame>
  )
}

// ---------------------------------------------------------------------------
// View: image adjust, zoom, grid
// ---------------------------------------------------------------------------

export function ImageAdjustPanel({
  filter,
  canUndo,
  canRedo,
  showGrid,
  onFilter,
  onAuto,
  onUndo,
  onRedo,
  onReset,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleGrid,
  onClose,
}: {
  filter: ImageFilter
  canUndo: boolean
  canRedo: boolean
  showGrid: boolean
  onFilter: (key: keyof ImageFilter, value: number) => void
  onAuto: () => void
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onToggleGrid: () => void
  onClose: () => void
}) {
  return (
    <PanelFrame title="View" onClose={onClose}>
      <p className={ringHintClass}>View only: the original photo and the analysis are not changed.</p>
      <button type="button" onClick={onAuto} className={ringWideBtnClass}>
        <Sparkles className="h-3.5 w-3.5" /> Auto brightness / contrast
      </button>
      <div className="space-y-1">
        {IMAGE_FILTER_ROWS.map((row) => (
          <label key={row.key} className="flex items-center gap-2">
            <span className="w-[4.5rem] shrink-0 text-[11px] text-stone-700">{row.label}</span>
            <input
              type="range"
              min={row.min}
              max={row.max}
              value={filter[row.key]}
              onChange={(e) => onFilter(row.key, Number(e.target.value))}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-amber-700"
              aria-label={row.label}
            />
            <span className="w-8 shrink-0 text-right font-mono text-[11px] text-stone-600">{filter[row.key]}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button type="button" disabled={!canUndo} onClick={onUndo} className={ringSmallBtnClass}>
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo} className={ringSmallBtnClass}>
          <Redo2 className="h-3.5 w-3.5" /> Redo
        </button>
        <button type="button" disabled={isDefaultFilter(filter)} onClick={onReset} className={ringSmallBtnClass}>
          Reset
        </button>
      </div>
      <Section label="Zoom">
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={onZoomOut} className={ringSmallBtnClass} aria-label="Zoom out" title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onFit} className={ringSmallBtnClass} title="Fit to window">
            <Maximize className="h-3.5 w-3.5" /> Fit
          </button>
          <button type="button" onClick={onZoomIn} className={ringSmallBtnClass} aria-label="Zoom in" title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onToggleGrid} className={ringChoiceBtnClass(showGrid)} aria-pressed={showGrid}>
            <Grid3x3 className="mr-1 h-3.5 w-3.5" /> Grid
          </button>
        </div>
      </Section>
    </PanelFrame>
  )
}

export function ColoursPanel({
  colours,
  onChange,
  onReset,
  onClose,
}: {
  colours: RingDisplayColours
  onChange: (layer: RingLayer, patch: Partial<{ color: string; width: number }>) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <PanelFrame title="Display colours" onClose={onClose}>
      <p className={ringHintClass}>Saved in this browser only. Not part of the analysis.</p>
      <div className="space-y-1.5">
        {(Object.keys(RING_LAYER_LABEL) as RingLayer[]).map((layer) => (
          <div key={layer} className="flex items-center gap-2">
            <input
              type="color"
              value={colours[layer].color}
              onChange={(e) => onChange(layer, { color: e.target.value })}
              className="h-7 w-9 shrink-0 cursor-pointer rounded-none border border-stone-400 bg-stone-50 p-0.5"
              aria-label={`${RING_LAYER_LABEL[layer]} colour`}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-stone-700">{RING_LAYER_LABEL[layer]}</span>
            <input
              type="number"
              min={RING_LINE_WIDTH_MIN}
              max={RING_LINE_WIDTH_MAX}
              value={colours[layer].width}
              onChange={(e) => onChange(layer, { width: Number(e.target.value) })}
              className={cn(ringInputClass, 'w-14 text-right')}
              aria-label={`${RING_LAYER_LABEL[layer]} line width`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-stone-300 pt-2">
        <button type="button" onClick={onReset} className={ringSmallBtnClass}>
          Default colours
        </button>
      </div>
    </PanelFrame>
  )
}

export function ResetPanel({
  hasInner,
  hasOuter,
  diameterCount,
  thicknessApplied,
  onReset,
  onClose,
}: {
  hasInner: boolean
  hasOuter: boolean
  diameterCount: number
  thicknessApplied: boolean
  onReset: () => void
  onClose: () => void
}) {
  const any = hasInner || hasOuter || diameterCount > 0 || thicknessApplied
  const row = (on: boolean, text: string) => (
    <li className={on ? 'text-stone-900' : 'text-stone-400'}>• {text}</li>
  )
  return (
    <PanelFrame title="Clear drawing" onClose={onClose}>
      <p className={ringHintClass}>Removes the rings, diameter lines and thickness points. The photo and the scale stay.</p>
      <ul className="space-y-0.5 border border-stone-300 bg-stone-50 px-2 py-1.5 text-[11px]">
        {row(hasInner, `Inner ring ${hasInner ? '(placed)' : '(empty)'}`)}
        {row(hasOuter, `Outer ring ${hasOuter ? '(placed)' : '(empty)'}`)}
        {row(diameterCount > 0, `Diameter lines ${diameterCount > 0 ? `(${diameterCount})` : '(empty)'}`)}
        {row(thicknessApplied, `Thickness points ${thicknessApplied ? '(applied)' : '(not applied)'}`)}
      </ul>
      <button type="button" disabled={!any} onClick={onReset} className={cn(ringDangerBtnClass, 'w-full')}>
        <Trash2 className="h-3.5 w-3.5" /> Clear all drawing
      </button>
    </PanelFrame>
  )
}
