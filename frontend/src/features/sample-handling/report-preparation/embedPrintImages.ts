import { supabase } from '@/lib/supabaseClient'

/** Default bucket: letterhead, footer and seal images. */
const LETTERHEAD_BUCKET = 'laboratory-files'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'))
    reader.readAsDataURL(blob)
  })
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Object path inside `bucket` from a storage-api sign / public URL; null when the URL is for another bucket. */
function storagePathFromUrl(url: string, bucket: string): string | null {
  const re = new RegExp(`/object/(?:sign|public)/${escapeRegExp(bucket)}/([^?]+)`, 'i')
  const encoded = url.match(re)
  if (encoded?.[1]) return decodeURIComponent(encoded[1])
  return null
}

/**
 * Embed an image so Playwright PDF does not need to fetch remote images.
 * `pathOrUrl` is an object path in `bucket` (default laboratory-files, the
 * letterhead / footer bucket) or a URL; private buckets such as
 * metallography-images are read with the signed-in user's token.
 */
export async function embedPrintImageAsDataUrl(
  pathOrUrl: string | null | undefined,
  bucket: string = LETTERHEAD_BUCKET,
): Promise<string | null> {
  const raw = (pathOrUrl ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('data:')) return raw

  const storagePath = /^https?:\/\//i.test(raw) ? storagePathFromUrl(raw, bucket) : raw
  let blob: Blob | null = null

  if (storagePath) {
    const { data, error } = await supabase.storage.from(bucket).download(storagePath)
    if (!error && data) blob = data
  }

  if (!blob && /^https?:\/\//i.test(raw)) {
    try {
      const res = await fetch(raw)
      if (res.ok) blob = await res.blob()
    } catch {
      blob = null
    }
  }

  if (!blob) return /^https?:\/\//i.test(raw) ? raw : null
  try {
    return await blobToDataUrl(blob)
  } catch {
    return /^https?:\/\//i.test(raw) ? raw : null
  }
}

/** Blob (already downloaded) to a data URL for print HTML. */
export async function embedBlobAsDataUrl(blob: Blob | null | undefined): Promise<string | null> {
  if (!blob) return null
  try {
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

/** After images paint in a print iframe, bake src into data URLs for Playwright. */
export async function inlineDocumentImagesAsDataUrls(doc: Document): Promise<void> {
  const images = Array.from(doc.images)
  await Promise.all(
    images.map(async (img) => {
      img.removeAttribute('crossorigin')
      const src = img.getAttribute('src') || img.currentSrc || img.src
      if (!src || src.startsWith('data:')) return
      const embedded = await embedPrintImageAsDataUrl(src)
      if (embedded && embedded !== src) img.setAttribute('src', embedded)
    }),
  )
}
