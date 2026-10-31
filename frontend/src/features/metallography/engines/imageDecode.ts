/**
 * Decode an image file (Blob) into original-resolution pixels for the
 * engines: RGBA (as ImageData) and the GrayImage every engine takes.
 *
 * Browser only (createImageBitmap + OffscreenCanvas, or a detached canvas on
 * the main thread). Engines never import this file, so they stay DOM-free and
 * bundle for Node; the workbench / ring panel decode once and pass the
 * GrayImage on.
 *
 * Pixels are the original image size: no resize, no stretch. Orientation is
 * the browser default for images (EXIF orientation applied, as an <img>
 * shows it), so marks drawn on the displayed image line up with the pixels.
 * Images above MAX_ENGINE_PIXELS (25 MP) are refused before drawing.
 */
import { MAX_ENGINE_PIXELS, rgbaToGray, type GrayImage, type RgbaImage } from './types'

export type DecodedImage = {
  width: number
  height: number
  rgba: RgbaImage
  gray: GrayImage
}

type Canvas2D = {
  getContext(id: '2d', options?: { willReadFrequently?: boolean }): {
    drawImage(image: ImageBitmap, dx: number, dy: number): void
    getImageData(sx: number, sy: number, sw: number, sh: number): ImageData
  } | null
}

function makeCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height) as unknown as Canvas2D
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    return c as unknown as Canvas2D
  }
  throw new Error('This browser cannot read image pixels.')
}

/** Width × height check against the 25 MP engine limit (plain-English error). */
export function assertEngineImageSize(width: number, height: number): void {
  if (!(width > 0 && height > 0)) throw new Error('The image has no size.')
  if (width * height > MAX_ENGINE_PIXELS) {
    const mp = ((width * height) / 1_000_000).toFixed(1)
    throw new Error(`The image is ${mp} megapixels; the limit for analysis is 25 megapixels.`)
  }
}

/**
 * Decodes the Blob (PNG, JPEG, BMP, WebP) to original pixels. Throws an Error
 * with a plain message when the file cannot be decoded or is too large.
 */
export async function decodeImageBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'undefined') throw new Error('This browser cannot decode images for analysis.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('The image could not be read. Check that the file is a PNG, JPEG, BMP or WebP image.')
  }
  try {
    const { width, height } = bitmap
    assertEngineImageSize(width, height)
    const ctx = makeCanvas(width, height).getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('This browser cannot read image pixels.')
    ctx.drawImage(bitmap, 0, 0)
    const data = ctx.getImageData(0, 0, width, height).data
    const rgba: RgbaImage = { width, height, data }
    return { width, height, rgba, gray: rgbaToGray(rgba) }
  } finally {
    bitmap.close()
  }
}
