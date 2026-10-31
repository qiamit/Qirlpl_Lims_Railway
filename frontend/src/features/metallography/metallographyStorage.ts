import { supabase } from '@/lib/supabaseClient'
import { assertAllowedUpload, fileExtension } from '@/lib/validateUpload'

/**
 * Private bucket metallography-images (migration 20261102101700, design 3.2
 * "Bucket"). Originals are SHA-256 hashed in the browser, uploaded once
 * (no upsert, and the bucket has no update policy) and never changed.
 *
 * Paths (the database checks them in app_metallography_can_upload):
 *   analyses/<analysis_id>/fields/<field_no>_<sha16>.<ext>      original image
 *   analyses/<analysis_id>/overlay_<field_no>_<sha16>.png       rendered marks
 *   analyses/<analysis_id>/features_<field_no>_<sha16>.json     particle / intercept lists
 *   calibrations/<cal_id>/micrometer_<sha16>.<ext>              stage micrometer image
 * Overlay and features carry the hash too, so a re-run writes a new object
 * instead of overwriting the old one; the old object is removed once no row
 * references it (app_metallography_object_deletable).
 *
 * Pattern: features/sample-handling/sample-under-testing/resultObservationRecords.ts.
 */

export const METALLOGRAPHY_BUCKET = 'metallography-images'

/** Upload only in Phase 1 (no TIFF until a decoder is approved). */
export const METALLOGRAPHY_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'bmp', 'webp'])

/** Same as the bucket file_size_limit and validateUpload.ts. */
export const METALLOGRAPHY_MAX_BYTES = 25 * 1024 * 1024

/** Images above 25 MP are refused (browser memory). */
export const METALLOGRAPHY_MAX_PIXELS = 25_000_000

/** Signed URLs live 10 minutes, like the other private buckets. */
export const METALLOGRAPHY_SIGNED_URL_SECONDS = 600

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
  webp: 'image/webp',
}

/** Throws a readable Error when the file is not an accepted metallography image. */
export function assertMetallographyImage(file: File): void {
  assertAllowedUpload(file, { extensions: METALLOGRAPHY_IMAGE_EXTENSIONS, maxBytes: METALLOGRAPHY_MAX_BYTES })
}

/** Throws when width × height exceeds METALLOGRAPHY_MAX_PIXELS. */
export function assertImagePixels(width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) throw new Error('The image could not be read.')
  if (width * height > METALLOGRAPHY_MAX_PIXELS) {
    throw new Error(
      `The image is ${(width * height / 1_000_000).toFixed(1)} MP. Images above ${METALLOGRAPHY_MAX_PIXELS / 1_000_000} MP are not accepted.`,
    )
  }
}

/** Lower-case extension used in the stored path ('jpeg' stays 'jpeg'). */
export function imageExtension(file: File): string {
  return fileExtension(file)
}

export function imageContentType(file: File): string {
  return IMAGE_CONTENT_TYPES[fileExtension(file)] || file.type || 'application/octet-stream'
}

/** SHA-256 of the bytes as 64 lower-case hex characters (crypto.subtle). */
export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const sha16 = (sha256: string) => sha256.slice(0, 16)

export function fieldImagePath(analysisId: string, fieldNo: number, sha256: string, ext: string): string {
  return `analyses/${analysisId}/fields/${fieldNo}_${sha16(sha256)}.${ext.toLowerCase()}`
}

export function overlayPath(analysisId: string, fieldNo: number, sha256: string): string {
  return `analyses/${analysisId}/overlay_${fieldNo}_${sha16(sha256)}.png`
}

export function featuresPath(analysisId: string, fieldNo: number, sha256: string): string {
  return `analyses/${analysisId}/features_${fieldNo}_${sha16(sha256)}.json`
}

export function calibrationImagePath(calibrationId: string, sha256: string, ext: string): string {
  return `calibrations/${calibrationId}/micrometer_${sha16(sha256)}.${ext.toLowerCase()}`
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { message?: string; statusCode?: string | number; error?: string } | null
  const text = `${e?.message ?? ''} ${e?.error ?? ''}`.toLowerCase()
  return String(e?.statusCode ?? '') === '409' || text.includes('already exists') || text.includes('duplicate')
}

/**
 * Uploads bytes to `path` without upsert. When an object already sits at that
 * path (a retry after a failed record insert) it is kept: the path carries the
 * hash prefix of the same bytes. Returns whether it already existed.
 */
export async function uploadObject(
  path: string,
  body: Blob,
  contentType: string,
): Promise<{ path: string; alreadyExisted: boolean }> {
  const { error } = await supabase.storage.from(METALLOGRAPHY_BUCKET).upload(path, body, { upsert: false, contentType })
  if (error) {
    if (isAlreadyExists(error)) return { path, alreadyExisted: true }
    throw error
  }
  return { path, alreadyExisted: false }
}

/**
 * Original field image: checks the file, hashes it and uploads it to
 * analyses/<id>/fields/<field_no>_<sha16>.<ext>. The field row is inserted
 * afterwards (metallographyApi.addFieldFromFile); remove the object if that fails.
 */
export async function uploadFieldOriginal(input: {
  analysisId: string
  fieldNo: number
  file: File
  /** Pass when already computed. */
  sha256?: string
}): Promise<{ path: string; sha256: string; contentType: string; bytes: number; alreadyExisted: boolean }> {
  assertMetallographyImage(input.file)
  const sha256 = input.sha256 ?? (await sha256Hex(input.file))
  const contentType = imageContentType(input.file)
  const path = fieldImagePath(input.analysisId, input.fieldNo, sha256, imageExtension(input.file))
  const { alreadyExisted } = await uploadObject(path, input.file, contentType)
  return { path, sha256, contentType, bytes: input.file.size, alreadyExisted }
}

/**
 * Stage micrometer image of a draft calibration. The calibration row (with
 * this path and hash) must exist first: the bucket accepts it only for a
 * draft the caller performs.
 */
export async function uploadCalibrationImage(input: {
  calibrationId: string
  file: File
  sha256?: string
}): Promise<{ path: string; sha256: string; contentType: string; alreadyExisted: boolean }> {
  assertMetallographyImage(input.file)
  const sha256 = input.sha256 ?? (await sha256Hex(input.file))
  const contentType = imageContentType(input.file)
  const path = calibrationImagePath(input.calibrationId, sha256, imageExtension(input.file))
  const { alreadyExisted } = await uploadObject(path, input.file, contentType)
  return { path, sha256, contentType, alreadyExisted }
}

/** Rendered overlay PNG of a field (marks drawn on the original). */
export async function uploadOverlayPng(
  analysisId: string,
  fieldNo: number,
  png: Blob,
): Promise<{ path: string; sha256: string }> {
  const sha256 = await sha256Hex(png)
  const path = overlayPath(analysisId, fieldNo, sha256)
  await uploadObject(path, png, 'image/png')
  return { path, sha256 }
}

/** Large engine outputs (particles, intercepts) as JSON, kept out of audit_log. */
export async function uploadFeaturesJson(
  analysisId: string,
  fieldNo: number,
  features: unknown,
): Promise<{ path: string; sha256: string }> {
  const blob = new Blob([JSON.stringify(features)], { type: 'application/json' })
  const sha256 = await sha256Hex(blob)
  const path = featuresPath(analysisId, fieldNo, sha256)
  await uploadObject(path, blob, 'application/json')
  return { path, sha256 }
}

/**
 * Downloads an object as a Blob. Use this (not a signed URL) for images drawn
 * on a canvas, so the canvas is not tainted and the bytes can be re-hashed.
 */
export async function downloadObject(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(METALLOGRAPHY_BUCKET).download(path)
  if (error || !data) throw error ?? new Error('Could not download the image.')
  return data
}

/** Downloads and parses a features JSON file. */
export async function downloadJson<T = unknown>(path: string): Promise<T> {
  const blob = await downloadObject(path)
  return JSON.parse(await blob.text()) as T
}

/** Signed URL valid for METALLOGRAPHY_SIGNED_URL_SECONDS (600 s). */
export async function signedObjectUrl(path: string, seconds = METALLOGRAPHY_SIGNED_URL_SECONDS): Promise<string> {
  const { data, error } = await supabase.storage.from(METALLOGRAPHY_BUCKET).createSignedUrl(path, seconds)
  if (error || !data?.signedUrl) throw error ?? new Error('Could not open the image.')
  return data.signedUrl
}

/**
 * Re-hashes a stored original (done on every open and by the re-check).
 * ok = false when the bytes no longer match the recorded hash or the object is gone.
 */
export async function verifyStoredHash(
  path: string,
  expectedSha256: string,
): Promise<{ ok: boolean; actual: string | null; blob: Blob | null; error?: string }> {
  try {
    const blob = await downloadObject(path)
    const actual = await sha256Hex(blob)
    return { ok: actual === expectedSha256.toLowerCase(), actual, blob }
  } catch (e) {
    return { ok: false, actual: null, blob: null, error: e instanceof Error ? e.message : 'Could not download the image.' }
  }
}

/**
 * Removes objects. The bucket allows it only for the uploader when no row
 * references the path (or for the Director). Failures are logged, not thrown:
 * this is clean-up.
 */
export async function removeObjects(paths: ReadonlyArray<string | null | undefined>): Promise<void> {
  const list = [...new Set(paths.map((p) => String(p ?? '').trim()).filter(Boolean))]
  if (list.length === 0) return
  const { error } = await supabase.storage.from(METALLOGRAPHY_BUCKET).remove(list)
  if (error) console.warn('[metallography] storage clean-up failed', error)
}
