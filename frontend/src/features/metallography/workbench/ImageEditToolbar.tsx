import type { ReactNode } from 'react'
import {
  ArrowUpRight,
  Contrast,
  Hand,
  Maximize,
  MousePointer2,
  PenLine,
  Pentagon,
  RotateCcw,
  Ruler,
  Scan,
  Sun,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRIGHTNESS_RANGE, CONTRAST_RANGE, ZOOM_STEP, type Display } from './displayAdjustments'

/**
 * Tool bar above the image stage (port of the old components/ImageEditToolbar.tsx,
 * design 3.8): one horizontal bar that wraps on phones instead of three bars.
 * Tools are the S2 set that Phase 1 needs; ring tools live in the ring-test
 * panel. Freehand pencil / highlighter / eraser / fill / crop are not carried
 * over: marks are vectors on the original, and the original is never edited.
 */

export type StageTool = 'select' | 'pan' | 'roi' | 'exclusion' | 'measure' | 'scale_line' | 'text' | 'arrow'

export type ImageEditToolbarProps = {
  tool: StageTool
  onToolChange: (tool: StageTool) => void
  display: Display
  onDisplayChange: (next: Display) => void
  /** Zoom around the stage centre by this factor. */
  onZoom: (factor: number) => void
  onFit: () => void
  onResetView: () => void
  /** Read-only, view-only module access or no edit right: drawing tools off. */
  drawingDisabled: boolean
  /** In-image reference line (ring / macro methods with scale mode "in image"). */
  allowScaleLine: boolean
  annotationColor: string
  onAnnotationColorChange: (color: string) => void
  onDeleteSelected?: () => void
  canDeleteSelected?: boolean
  /** No image yet. */
  disabled?: boolean
}

function ToolButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center border text-stone-100 transition-colors disabled:opacity-40 sm:h-8 sm:w-8',
        active ? 'border-amber-400 bg-amber-600 text-white' : 'border-stone-600 bg-stone-800 hover:bg-stone-700',
      )}
    >
      {children}
    </button>
  )
}

function Group({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 border-r border-stone-700 pr-2 last:border-r-0">
      {children}
    </div>
  )
}

export function ImageEditToolbar(props: ImageEditToolbarProps) {
  const {
    tool,
    onToolChange,
    display,
    onDisplayChange,
    onZoom,
    onFit,
    onResetView,
    drawingDisabled,
    allowScaleLine,
    annotationColor,
    onAnnotationColorChange,
    onDeleteSelected,
    canDeleteSelected,
    disabled,
  } = props
  const draw = (t: StageTool, label: string, icon: ReactNode) => (
    <ToolButton active={tool === t} disabled={disabled || drawingDisabled} label={label} onClick={() => onToolChange(t)}>
      {icon}
    </ToolButton>
  )

  return (
    <div className="flex flex-wrap items-center gap-2 border-b-2 border-stone-600 bg-stone-900 px-2 py-1.5 text-stone-100">
      <Group label="View">
        <ToolButton active={tool === 'select'} disabled={disabled} label="Select" onClick={() => onToolChange('select')}>
          <MousePointer2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton active={tool === 'pan'} disabled={disabled} label="Pan" onClick={() => onToolChange('pan')}>
          <Hand className="h-4 w-4" />
        </ToolButton>
        <ToolButton disabled={disabled} label="Zoom out" onClick={() => onZoom(1 / ZOOM_STEP)}>
          <ZoomOut className="h-4 w-4" />
        </ToolButton>
        <span className="w-12 text-center text-[11px] tabular-nums text-stone-300">{Math.round(display.zoom * 100)}%</span>
        <ToolButton disabled={disabled} label="Zoom in" onClick={() => onZoom(ZOOM_STEP)}>
          <ZoomIn className="h-4 w-4" />
        </ToolButton>
        <ToolButton disabled={disabled} label="Fit to window" onClick={onFit}>
          <Maximize className="h-4 w-4" />
        </ToolButton>
      </Group>
      <Group label="Areas">
        {draw('roi', 'Field area (ROI): drag a rectangle', <Scan className="h-4 w-4" />)}
        {draw('exclusion', 'Exclusion area: click points, double-click to close', <Pentagon className="h-4 w-4" />)}
      </Group>
      <Group label="Measure">
        {draw('measure', 'Measure line: drag', <PenLine className="h-4 w-4" />)}
        {allowScaleLine ? draw('scale_line', 'Reference line of known length: drag', <Ruler className="h-4 w-4" />) : null}
      </Group>
      <Group label="Annotate">
        {draw('text', 'Text: click where it goes', <Type className="h-4 w-4" />)}
        {draw('arrow', 'Arrow: drag', <ArrowUpRight className="h-4 w-4" />)}
        <label className="inline-flex items-center" title="Annotation colour">
          <span className="sr-only">Annotation colour</span>
          <input
            type="color"
            value={annotationColor}
            disabled={disabled || drawingDisabled}
            onChange={(e) => onAnnotationColorChange(e.target.value)}
            className="h-8 w-8 cursor-pointer border border-stone-600 bg-stone-800 p-0.5 disabled:opacity-40"
          />
        </label>
        {onDeleteSelected ? (
          <ToolButton disabled={disabled || drawingDisabled || !canDeleteSelected} label="Delete selected (Del)" onClick={onDeleteSelected}>
            <Trash2 className="h-4 w-4" />
          </ToolButton>
        ) : null}
      </Group>
      <Group label="Display (view only)">
        <label className="flex items-center gap-1 text-[11px] text-stone-300" title="Brightness (view only, not analysed)">
          <Sun className="h-3.5 w-3.5" />
          <input
            type="range"
            aria-label="Brightness"
            min={BRIGHTNESS_RANGE.min}
            max={BRIGHTNESS_RANGE.max}
            value={display.brightness}
            disabled={disabled}
            onChange={(e) => onDisplayChange({ ...display, brightness: Number(e.target.value) })}
            className="w-20 accent-amber-500"
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-stone-300" title="Contrast (view only, not analysed)">
          <Contrast className="h-3.5 w-3.5" />
          <input
            type="range"
            aria-label="Contrast"
            min={CONTRAST_RANGE.min}
            max={CONTRAST_RANGE.max}
            value={display.contrast}
            disabled={disabled}
            onChange={(e) => onDisplayChange({ ...display, contrast: Number(e.target.value) })}
            className="w-20 accent-amber-500"
          />
        </label>
        <ToolButton disabled={disabled} label="Reset view" onClick={onResetView}>
          <RotateCcw className="h-4 w-4" />
        </ToolButton>
      </Group>
    </div>
  )
}
