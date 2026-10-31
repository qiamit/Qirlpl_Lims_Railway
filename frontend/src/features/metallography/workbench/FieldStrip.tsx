import { useRef, useState } from 'react'
import { Ban, CheckCircle2, ImagePlus, Loader2, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn, formatDateTime } from '@/lib/utils'
import { envInputClass } from '@/features/environment/EnvironmentUi'
import { limsDeleteBtnClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { METALLOGRAPHY_IMAGE_EXTENSIONS } from '../metallographyStorage'
import type { AnalysisField } from '../types'
import { objectUrlFor, type FieldMedia } from './imageCanvasUtils'

/**
 * Left column of the workbench (design 3.3 S2 "fields"): one card per image
 * field with size, pixels, captured-at, location, the hash check of the
 * stored original (re-hashed on every open) and exclude-with-reason. Upload
 * hashes the file in the browser (SHA-256) before it is stored; the original is
 * never changed afterwards.
 */

export type FieldStripProps = {
  fields: AnalysisField[]
  media: Record<string, FieldMedia | undefined>
  activeFieldId: string | null
  onSelect: (fieldId: string) => void
  /** Read-only: no upload, exclude or remove. */
  readOnly: boolean
  busy?: boolean
  minFields: number
  onUpload?: (file: File, location: string) => Promise<void>
  onExclude?: (field: AnalysisField) => void
  onInclude?: (field: AnalysisField) => void
  onRemove?: (field: AnalysisField) => void
}

const ACCEPT = [...METALLOGRAPHY_IMAGE_EXTENSIONS].map((e) => `.${e}`).join(',')

function fileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function HashBadge({ media }: { media: FieldMedia | undefined }) {
  if (!media || media.status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 border border-stone-400 bg-stone-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-stone-700">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking hash
      </span>
    )
  }
  if (media.status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 border border-emerald-700/40 bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800">
        <CheckCircle2 className="h-3 w-3" /> Hash OK
      </span>
    )
  }
  return (
    <span
      title={media.error ?? undefined}
      className="inline-flex items-center gap-1 border border-red-700/50 bg-red-100 px-1.5 py-0.5 text-[10.5px] font-bold text-red-800"
    >
      <ShieldAlert className="h-3 w-3" /> {media.status === 'mismatch' ? 'Hash mismatch' : 'Not readable'}
    </span>
  )
}

export function FieldStrip(props: FieldStripProps) {
  const { fields, media, activeFieldId, onSelect, readOnly, busy, minFields, onUpload, onExclude, onInclude, onRemove } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [location, setLocation] = useState('')
  const [uploading, setUploading] = useState(false)
  const included = fields.filter((f) => !f.excluded).length

  const pick = async (file: File | undefined) => {
    if (!file || !onUpload) return
    setUploading(true)
    try {
      await onUpload(file, location)
      setLocation('')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11.5px] text-stone-600">
        {included} of at least {minFields} field{minFields === 1 ? '' : 's'} in use.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {fields.map((f) => {
          const m = media[f.id]
          const active = f.id === activeFieldId
          return (
            <div
              key={f.id}
              className={cn(
                'w-56 shrink-0 border-2 bg-[#fffcf7] lg:w-auto',
                active ? 'border-amber-600' : 'border-stone-300',
                f.excluded && 'opacity-70',
              )}
            >
              <button type="button" className="block w-full text-left" onClick={() => onSelect(f.id)} aria-pressed={active}>
                <div className="relative h-28 bg-stone-900">
                  {m?.blob ? (
                    <img src={objectUrlFor(m.blob)} alt={`Field ${f.fieldNo}`} className="h-full w-full object-contain" draggable={false} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-stone-400">
                      {m?.status === 'checking' || !m ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldAlert className="h-5 w-5 text-red-400" />}
                    </div>
                  )}
                  <span className="absolute left-1 top-1 bg-stone-900/80 px-1.5 py-0.5 text-[11px] font-bold text-amber-200">Field {f.fieldNo}</span>
                  {f.excluded ? (
                    <span className="absolute right-1 top-1 bg-red-700 px-1.5 py-0.5 text-[10.5px] font-bold text-white">Excluded</span>
                  ) : null}
                </div>
                <div className="space-y-0.5 px-2 py-1.5 text-[11.5px] text-stone-700">
                  <div className="truncate font-semibold text-stone-900" title={f.originalFileName ?? undefined}>
                    {f.originalFileName || 'Image'}
                  </div>
                  <div>
                    {f.imageWidthPx ?? '?'} × {f.imageHeightPx ?? '?'} px · {fileSize(f.rawImageBytes)}
                  </div>
                  {f.capturedAt ? <div>Captured {formatDateTime(f.capturedAt)}</div> : null}
                  {f.locationOnSpecimen ? <div className="truncate">At: {f.locationOnSpecimen}</div> : null}
                  {f.excluded && f.excludeReason ? <div className="text-red-800">Reason: {f.excludeReason}</div> : null}
                  <div className="pt-0.5">
                    <HashBadge media={m} />
                  </div>
                </div>
              </button>
              {!readOnly ? (
                <div className="flex flex-wrap gap-1 border-t border-stone-200 px-2 py-1.5">
                  {f.excluded ? (
                    <button type="button" disabled={busy} className={cn(limsOutlineBtnClass, 'h-7 border px-2 text-[11px]')} onClick={() => onInclude?.(f)}>
                      <RotateCcw className="mr-1 inline h-3 w-3" /> Use again
                    </button>
                  ) : (
                    <button type="button" disabled={busy} className={cn(limsOutlineBtnClass, 'h-7 border px-2 text-[11px]')} onClick={() => onExclude?.(f)}>
                      <Ban className="mr-1 inline h-3 w-3" /> Exclude
                    </button>
                  )}
                  <button type="button" disabled={busy} className={cn(limsDeleteBtnClass, 'h-7 px-2 text-[11px]')} onClick={() => onRemove?.(f)}>
                    <Trash2 className="mr-1 inline h-3 w-3" /> Remove
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
        {fields.length === 0 ? (
          <p className="w-56 shrink-0 border border-dashed border-stone-400 p-3 text-[12px] text-stone-600 lg:w-auto">No image yet.</p>
        ) : null}
      </div>

      {!readOnly && onUpload ? (
        <div className="space-y-1.5 border border-stone-300 bg-stone-50 p-2">
          <label htmlFor="mg-field-location" className="block text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Location on specimen (optional)
          </label>
          <Input
            id="mg-field-location"
            className={envInputClass}
            value={location}
            maxLength={120}
            placeholder="e.g. mid-radius"
            onChange={(e) => setLocation(e.target.value)}
          />
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void pick(file)
            }}
          />
          <button
            type="button"
            disabled={busy || uploading}
            className={cn(limsPrimaryBtnClass, 'inline-flex w-full items-center justify-center gap-1.5 text-[12.5px]')}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? 'Hashing and uploading…' : 'Add image (original)'}
          </button>
          <p className="text-[11px] text-stone-500">PNG, JPEG, BMP or WebP, up to 25 MB and 25 MP. The file is stored unchanged.</p>
        </div>
      ) : null}
    </div>
  )
}
