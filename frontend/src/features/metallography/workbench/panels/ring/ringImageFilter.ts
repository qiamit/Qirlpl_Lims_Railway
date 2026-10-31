/**
 * View-only image filters of the ring editor (old RingEditor "Image Adjust").
 * They change how the photo is shown, never the original pixels and never
 * what the engines analyse. The old destructive tools (rotate, flip, crop,
 * "pixel update" sharpen, delete image) are not carried over: the original
 * stays exactly as uploaded and hashed.
 */
import type { GrayImage } from '@/features/metallography/engines/types'
import { clampNum } from './ringGeometry'

export type ImageFilter = {
  brightness: number
  contrast: number
  saturation: number
  grayscale: number
  sepia: number
  invert: number
}

export const DEFAULT_IMAGE_FILTER: ImageFilter = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  invert: 0,
}

export const IMAGE_FILTER_ROWS: Array<{ key: keyof ImageFilter; label: string; min: number; max: number }> = [
  { key: 'brightness', label: 'Brightness', min: 50, max: 150 },
  { key: 'contrast', label: 'Contrast', min: 50, max: 150 },
  { key: 'saturation', label: 'Colour', min: 50, max: 150 },
  { key: 'grayscale', label: 'B/W', min: 0, max: 100 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
  { key: 'invert', label: 'Invert', min: 0, max: 100 },
]

export function isDefaultFilter(f: ImageFilter): boolean {
  return (Object.keys(DEFAULT_IMAGE_FILTER) as Array<keyof ImageFilter>).every((k) => f[k] === DEFAULT_IMAGE_FILTER[k])
}

/** CSS / canvas filter string. */
export function imageFilterCss(f: ImageFilter): string {
  if (isDefaultFilter(f)) return 'none'
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) invert(${f.invert}%)`
}

/**
 * Auto-levels (old autoEnhanceImage): black / white points at the 1.5 %
 * percentiles of the grey histogram, contrast stretched to about 225 levels,
 * brightness brought to a mean of about 138. Reads the grey image the
 * workbench already decoded, sampled to about 250 000 pixels.
 */
export function autoEnhanceFilter(gray: GrayImage, prev: ImageFilter): ImageFilter {
  const { data } = gray
  const total = data.length
  if (total < 1) return prev
  const step = Math.max(1, Math.floor(total / 250_000))
  const hist = new Array<number>(256).fill(0)
  let n = 0
  for (let i = 0; i < total; i += step) {
    hist[data[i]] += 1
    n += 1
  }
  const cut = n * 0.015
  let acc = 0
  let pLow = 0
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v]
    if (acc >= cut) {
      pLow = v
      break
    }
  }
  acc = 0
  let pHigh = 255
  for (let v = 255; v >= 0; v -= 1) {
    acc += hist[v]
    if (acc >= cut) {
      pHigh = v
      break
    }
  }
  const spread = Math.max(1, pHigh - pLow)
  let meanSum = 0
  for (let v = 0; v < 256; v += 1) meanSum += v * hist[v]
  const mean = meanSum / n

  // CSS contrast(c): v' = (v - 128) * c + 128 -> stretch the spread to ~225.
  const contrast = Math.round(clampNum((225 / spread) * 100, 60, 150))
  const meanAfterContrast = (mean - 128) * (contrast / 100) + 128
  const brightness = Math.round(clampNum((138 / Math.max(1, meanAfterContrast)) * 100, 60, 150))
  return { ...prev, brightness, contrast, sepia: 0, invert: 0 }
}
