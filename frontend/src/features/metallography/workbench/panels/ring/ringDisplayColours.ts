/**
 * Display colours and line widths of the ring editor overlays (old ring-test
 * settings.ts colour fields). A per-viewer preference only: kept in this
 * browser's localStorage, never saved with the analysis and never analysed.
 * Every storage access is wrapped in try/catch (private windows, blocked
 * storage).
 */

export type RingLayer = 'inner' | 'outer' | 'diam' | 'thick' | 'scale'

export type RingDisplayColours = Record<RingLayer, { color: string; width: number }>

export const RING_LAYER_LABEL: Record<RingLayer, string> = {
  inner: 'Inner ring',
  outer: 'Outer ring',
  diam: 'Diameter lines',
  thick: 'Thickness points',
  scale: 'Scale line',
}

export const DEFAULT_RING_DISPLAY_COLOURS: RingDisplayColours = {
  inner: { color: '#fde047', width: 2 },
  outer: { color: '#f472b6', width: 2 },
  diam: { color: '#fb923c', width: 2 },
  thick: { color: '#4ade80', width: 2 },
  scale: { color: '#22d3ee', width: 2 },
}

export const RING_LINE_WIDTH_MIN = 1
export const RING_LINE_WIDTH_MAX = 6

const STORAGE_KEY = 'lims.metallography.ringDisplayColours.v1'

const HEX = /^#[0-9a-f]{6}$/i

function clean(raw: unknown): RingDisplayColours {
  const out: RingDisplayColours = {
    inner: { ...DEFAULT_RING_DISPLAY_COLOURS.inner },
    outer: { ...DEFAULT_RING_DISPLAY_COLOURS.outer },
    diam: { ...DEFAULT_RING_DISPLAY_COLOURS.diam },
    thick: { ...DEFAULT_RING_DISPLAY_COLOURS.thick },
    scale: { ...DEFAULT_RING_DISPLAY_COLOURS.scale },
  }
  if (!raw || typeof raw !== 'object') return out
  for (const layer of Object.keys(out) as RingLayer[]) {
    const v = (raw as Record<string, unknown>)[layer] as { color?: unknown; width?: unknown } | undefined
    if (!v || typeof v !== 'object') continue
    if (typeof v.color === 'string' && HEX.test(v.color)) out[layer].color = v.color
    const w = Number(v.width)
    if (Number.isFinite(w)) out[layer].width = Math.min(RING_LINE_WIDTH_MAX, Math.max(RING_LINE_WIDTH_MIN, Math.round(w)))
  }
  return out
}

export function loadRingDisplayColours(): RingDisplayColours {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return clean(raw ? JSON.parse(raw) : null)
  } catch {
    return clean(null)
  }
}

export function saveRingDisplayColours(colours: RingDisplayColours): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colours))
  } catch {
    // Storage blocked: the colours still apply until the page is closed.
  }
}

export function resetRingDisplayColours(): RingDisplayColours {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  return clean(null)
}
