import { useCallback, useState, type CSSProperties } from 'react'
import type {
  PageNumberPosition,
  TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'

function pageNumberPreviewPlacement(
  position: PageNumberPosition,
  marginLeftPx: number,
  marginRightPx: number,
): CSSProperties {
  const inset = 4
  switch (position) {
    case 'top-left':
      return { top: inset, left: marginLeftPx + inset }
    case 'top-center':
      return { top: inset, left: '50%', transform: 'translateX(-50%)' }
    case 'top-right':
      return { top: inset, right: marginRightPx + inset }
    case 'bottom-left':
      return { bottom: inset, left: marginLeftPx + inset }
    case 'bottom-center':
      return { bottom: inset, left: '50%', transform: 'translateX(-50%)' }
    case 'bottom-right':
      return { bottom: inset, right: marginRightPx + inset }
    default:
      return { bottom: inset, left: '50%', transform: 'translateX(-50%)' }
  }
}

const PAGE_MM = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
} as const

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

type DragEdge = 'top' | 'bottom' | 'left' | 'right'

export function TestReportPageMarginPreview({
  settings,
  onPatch,
  disabled,
}: {
  settings: TestReportPrintSettings
  onPatch: (partial: Partial<TestReportPrintSettings>) => void
  disabled?: boolean
}) {
  const page = PAGE_MM[settings.pageSize]
  const previewWidth = 220
  const previewHeight = Math.round((page.height / page.width) * previewWidth)
  const pxPerMm = previewWidth / page.width

  const marginTopPx = settings.bodyPaddingTopMm * pxPerMm
  const marginBottomPx = settings.bodyPaddingBottomMm * pxPerMm
  const marginLeftPx = settings.bodyPaddingLeftMm * pxPerMm
  const marginRightPx = settings.bodyPaddingRightMm * pxPerMm
  const headerPx = Math.min(settings.headerMaxHeightMm, settings.bodyPaddingTopMm - 2) * pxPerMm
  const footerPx = Math.min(settings.footerMaxHeightMm, settings.bodyPaddingBottomMm - 2) * pxPerMm

  const [dragging, setDragging] = useState<DragEdge | null>(null)

  const applyEdgeValue = useCallback(
    (edge: DragEdge, mm: number) => {
      if (edge === 'top') {
        onPatch({ bodyPaddingTopMm: clamp(Math.round(mm), 18, 50) })
        return
      }
      if (edge === 'bottom') {
        onPatch({ bodyPaddingBottomMm: clamp(Math.round(mm), 16, 45) })
        return
      }
      if (edge === 'left') {
        onPatch({ bodyPaddingLeftMm: clamp(Math.round(mm), 8, 25) })
        return
      }
      onPatch({ bodyPaddingRightMm: clamp(Math.round(mm), 8, 25) })
    },
    [onPatch],
  )

  const onPointerDown = (edge: DragEdge) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    const startValue =
      edge === 'top'
        ? settings.bodyPaddingTopMm
        : edge === 'bottom'
          ? settings.bodyPaddingBottomMm
          : edge === 'left'
            ? settings.bodyPaddingLeftMm
            : settings.bodyPaddingRightMm
    const startClient = edge === 'top' || edge === 'bottom' ? e.clientY : e.clientX
    setDragging(edge)

    const onMove = (ev: PointerEvent) => {
      const deltaPx =
        edge === 'top'
          ? ev.clientY - startClient
          : edge === 'bottom'
            ? startClient - ev.clientY
            : edge === 'left'
              ? ev.clientX - startClient
              : startClient - ev.clientX
      applyEdgeValue(edge, startValue + deltaPx / pxPerMm)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const contentTop = marginTopPx
  const contentBottom = previewHeight - marginBottomPx
  const contentLeft = marginLeftPx
  const contentRight = previewWidth - marginRightPx
  const contentHeight = contentBottom - contentTop
  const contentWidth = contentRight - contentLeft

  const handleClass =
    'absolute z-20 bg-primary/80 hover:bg-primary shadow-sm touch-none select-none'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Report page preview</p>
        <p className="text-[11px] text-muted-foreground">
          Drag edges to adjust margins · {settings.pageSize}
        </p>
      </div>
      <div
        className="relative mx-auto rounded-md border-2 border-border bg-white shadow-inner overflow-hidden"
        style={{ width: previewWidth, height: previewHeight }}
      >
        <div
          className="absolute inset-x-0 top-0 bg-amber-100/70 border-b border-amber-300/60"
          style={{ height: marginTopPx }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-amber-100/70 border-t border-amber-300/60"
          style={{ height: marginBottomPx }}
        />
        <div
          className="absolute left-0 bg-sky-100/60 border-r border-sky-300/50"
          style={{ top: marginTopPx, bottom: marginBottomPx, width: marginLeftPx }}
        />
        <div
          className="absolute right-0 bg-sky-100/60 border-l border-sky-300/50"
          style={{ top: marginTopPx, bottom: marginBottomPx, width: marginRightPx }}
        />

        {headerPx > 4 ? (
          <div
            className="absolute left-0 right-0 border-b border-dashed border-primary/40 bg-primary/5"
            style={{ top: 2, height: headerPx, marginLeft: marginLeftPx, marginRight: marginRightPx }}
          >
            <span className="absolute left-1 top-0.5 text-[8px] text-primary/70 font-medium">Header</span>
          </div>
        ) : null}
        {footerPx > 4 ? (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-primary/40 bg-primary/5"
            style={{
              bottom: 2,
              height: footerPx,
              marginLeft: marginLeftPx,
              marginRight: marginRightPx,
            }}
          >
            <span className="absolute left-1 bottom-0.5 text-[8px] text-primary/70 font-medium">Footer</span>
          </div>
        ) : null}

        {settings.showPageNumbers ? (
          <span
            className="absolute z-10 rounded bg-violet-100/90 px-1 py-0.5 text-[7px] font-medium text-violet-800 pointer-events-none"
            style={pageNumberPreviewPlacement(
              settings.pageNumberPosition,
              marginLeftPx,
              marginRightPx,
            )}
          >
            Page 01 of 05
          </span>
        ) : null}

        <div
          className="absolute border border-dashed border-emerald-500/50 bg-emerald-50/30 flex flex-col items-center justify-center text-center px-1"
          style={{
            top: contentTop,
            left: contentLeft,
            width: contentWidth,
            height: contentHeight,
          }}
        >
          <span className="text-[9px] font-semibold text-emerald-800/80 leading-tight">Report body</span>
          <span className="text-[8px] text-muted-foreground mt-0.5 leading-tight">
            Part A · B · C · D
          </span>
        </div>

        <span
          className="absolute left-1/2 -translate-x-1/2 text-[8px] font-medium text-amber-800/90 pointer-events-none"
          style={{ top: Math.max(2, marginTopPx / 2 - 5) }}
        >
          {settings.bodyPaddingTopMm} mm
        </span>
        <span
          className="absolute left-1/2 -translate-x-1/2 text-[8px] font-medium text-amber-800/90 pointer-events-none"
          style={{ bottom: Math.max(2, marginBottomPx / 2 - 5) }}
        >
          {settings.bodyPaddingBottomMm} mm
        </span>
        <span
          className="absolute top-1/2 -translate-y-1/2 text-[8px] font-medium text-sky-800/90 pointer-events-none"
          style={{ left: Math.max(2, marginLeftPx / 2 - 10) }}
        >
          {settings.bodyPaddingLeftMm}
        </span>
        <span
          className="absolute top-1/2 -translate-y-1/2 text-[8px] font-medium text-sky-800/90 pointer-events-none"
          style={{ right: Math.max(2, marginRightPx / 2 - 10) }}
        >
          {settings.bodyPaddingRightMm}
        </span>

        {!disabled ? (
          <>
            <div
              role="slider"
              aria-label="Adjust top margin"
              aria-valuenow={settings.bodyPaddingTopMm}
              className={`${handleClass} left-2 right-2 h-1.5 rounded-full cursor-ns-resize ${dragging === 'top' ? 'ring-2 ring-primary' : ''}`}
              style={{ top: contentTop - 3 }}
              onPointerDown={onPointerDown('top')}
            />
            <div
              role="slider"
              aria-label="Adjust bottom margin"
              aria-valuenow={settings.bodyPaddingBottomMm}
              className={`${handleClass} left-2 right-2 h-1.5 rounded-full cursor-ns-resize ${dragging === 'bottom' ? 'ring-2 ring-primary' : ''}`}
              style={{ top: contentBottom - 3 }}
              onPointerDown={onPointerDown('bottom')}
            />
            <div
              role="slider"
              aria-label="Adjust left margin"
              aria-valuenow={settings.bodyPaddingLeftMm}
              className={`${handleClass} top-8 bottom-8 w-1.5 rounded-full cursor-ew-resize ${dragging === 'left' ? 'ring-2 ring-primary' : ''}`}
              style={{ left: contentLeft - 3 }}
              onPointerDown={onPointerDown('left')}
            />
            <div
              role="slider"
              aria-label="Adjust right margin"
              aria-valuenow={settings.bodyPaddingRightMm}
              className={`${handleClass} top-8 bottom-8 w-1.5 rounded-full cursor-ew-resize ${dragging === 'right' ? 'ring-2 ring-primary' : ''}`}
              style={{ left: contentRight - 3 }}
              onPointerDown={onPointerDown('right')}
            />
          </>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground text-center">
        Amber = top/bottom · Blue = left/right (independent) · Dashed = letterhead bounds
      </p>
    </div>
  )
}
