import type { DisplaySettings } from '../engines/types'

/**
 * View-only display of a field image (port of the old lib/imageEditor.ts,
 * design 3.8). Brightness, contrast, zoom and pan change only how the image is
 * SHOWN, through CSS filter / transform. They are never baked into the pixels:
 * engines always read the original bytes. Saved as
 * metallography_fields.display_settings so the field reopens as it was left.
 *
 * Dropped from the old editor: saturation, black / white point, rotation, flip,
 * grayscale, invert and the JPEG re-encode on every slider tick.
 */

export type Display = Required<DisplaySettings>

export const DEFAULT_DISPLAY: Display = { brightness: 100, contrast: 100, zoom: 1, panX: 0, panY: 0 }

export const BRIGHTNESS_RANGE = { min: 50, max: 150 } as const
export const CONTRAST_RANGE = { min: 50, max: 200 } as const
export const ZOOM_RANGE = { min: 0.25, max: 16 } as const

/** One zoom step (buttons, keyboard, one wheel notch). */
export const ZOOM_STEP = 1.25

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Saved settings (any shape) to a complete, clamped Display. */
export function normalizeDisplay(d: DisplaySettings | null | undefined): Display {
  return {
    brightness: clamp(finite(d?.brightness, 100), BRIGHTNESS_RANGE.min, BRIGHTNESS_RANGE.max),
    contrast: clamp(finite(d?.contrast, 100), CONTRAST_RANGE.min, CONTRAST_RANGE.max),
    zoom: clamp(finite(d?.zoom, 1), ZOOM_RANGE.min, ZOOM_RANGE.max),
    panX: finite(d?.panX, 0),
    panY: finite(d?.panY, 0),
  }
}

export function sameDisplay(a: DisplaySettings | null | undefined, b: DisplaySettings | null | undefined): boolean {
  const x = normalizeDisplay(a)
  const y = normalizeDisplay(b)
  return (
    x.brightness === y.brightness && x.contrast === y.contrast && x.zoom === y.zoom && x.panX === y.panX && x.panY === y.panY
  )
}

/** CSS filter for the <img> (view only). */
export function displayFilterCss(d: Display): string | undefined {
  if (d.brightness === 100 && d.contrast === 100) return undefined
  return `brightness(${d.brightness}%) contrast(${d.contrast}%)`
}

/** CSS transform of the image layer; transform-origin is the centre of the fitted box. */
export function displayTransformCss(d: Display): string {
  return `translate(${d.panX}px, ${d.panY}px) scale(${d.zoom})`
}

/**
 * Zoom by `factor` keeping the screen point (ax, ay) still. (ax, ay) and the
 * box centre (cx, cy) are in the fitted box's own (untransformed) pixels.
 */
export function zoomAt(d: Display, factor: number, ax: number, ay: number, cx: number, cy: number): Display {
  const zoom = clamp(d.zoom * factor, ZOOM_RANGE.min, ZOOM_RANGE.max)
  const k = zoom / d.zoom
  if (k === 1) return d
  return {
    ...d,
    zoom,
    panX: ax - cx - k * (ax - cx - d.panX),
    panY: ay - cy - k * (ay - cy - d.panY),
  }
}

/** Fit to the stage (zoom 1, centred); brightness and contrast are kept. */
export function fitDisplay(d: Display): Display {
  return { ...d, zoom: 1, panX: 0, panY: 0 }
}

/** Back to the original look (fit, 100 % brightness and contrast). */
export function resetDisplay(): Display {
  return { ...DEFAULT_DISPLAY }
}

/** Rounded copy for saving (pan in whole screen pixels, zoom to 4 decimals). */
export function displayForSave(d: Display): DisplaySettings {
  return {
    brightness: Math.round(d.brightness),
    contrast: Math.round(d.contrast),
    zoom: Math.round(d.zoom * 10000) / 10000,
    panX: Math.round(d.panX),
    panY: Math.round(d.panY),
  }
}
