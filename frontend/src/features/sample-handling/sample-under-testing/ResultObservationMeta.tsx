import { useRef, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDialogClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDateTime } from '@/lib/utils'
import {
  deleteResultAttachment,
  formatFileSize,
  openResultAttachment,
  uploadResultAttachment,
  type ResultAttachment,
  type ResultEntryStamp,
} from './resultObservationRecords'

const errText = (err: unknown) => (err as { message?: string })?.message || 'Something went wrong.'

/**
 * Under a parameter result: the raw printouts / photos attached to it. Who
 * entered it (ISO/IEC 17025 7.5.1) is kept by the database and shown only on
 * hover (lab, 29 Oct 2026: the line made the cell crowded). Renders nothing
 * when attachments are not available (migration 20261029100300 not applied,
 * or row not saved yet).
 */
export function ResultObservationMeta({
  sampleId,
  paramRowId,
  testLabel,
  stamp,
  attachments,
  attachmentsAvailable,
  canAttach,
  onAttachmentsChange,
  className,
}: {
  sampleId: string | null
  paramRowId: string | null
  testLabel: string
  stamp?: ResultEntryStamp | null
  attachments: ResultAttachment[]
  attachmentsAvailable: boolean
  /** Adding files (entry mode, report not issued). Viewing is always allowed. */
  canAttach: boolean
  onAttachmentsChange: (next: ResultAttachment[]) => void
  className?: string
}) {
  const { user, designation } = useAuth()
  const director = isLaboratoryDirector(designation)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const stampText =
    stamp?.byName || stamp?.at
      ? `Entered by ${stamp?.byName || '—'}${stamp?.at ? ` · ${formatDateTime(stamp.at)}` : ''}`
      : ''
  const showAttachments = attachmentsAvailable && Boolean(paramRowId) && Boolean(sampleId)
  if (!showAttachments) return null

  const onFiles = async (files: FileList | null) => {
    const list = files ? [...files] : []
    if (fileRef.current) fileRef.current.value = ''
    if (!sampleId || !paramRowId || list.length === 0) return
    setBusy(true)
    setError(null)
    let next = attachments
    try {
      for (const file of list) {
        const added = await uploadResultAttachment({ sampleId, paramRowId, file })
        next = [...next, added]
        onAttachmentsChange(next)
      }
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (a: ResultAttachment) => {
    if (!window.confirm(`Remove "${a.fileName}"? The removal stays in the audit trail.`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteResultAttachment(a)
      onAttachmentsChange(attachments.filter((x) => x.id !== a.id))
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  const view = async (a: ResultAttachment) => {
    setError(null)
    try {
      await openResultAttachment(a)
    } catch (err) {
      setError(errText(err))
    }
  }

  return (
    <div
      className={cn(
        'mt-1 flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10.5px] leading-tight text-stone-600',
        className,
      )}
    >
      {showAttachments ? (
        <button
          type="button"
          className="inline-flex items-center gap-0.5 font-semibold text-amber-800 hover:text-amber-950 hover:underline"
          onClick={() => {
            setError(null)
            setOpen(true)
          }}
          aria-label={`Raw data files for ${testLabel}`}
          title={['Raw printouts / photos for this result', stampText].filter(Boolean).join('\n')}
        >
          {attachments.length > 0 ? `${attachments.length} file${attachments.length === 1 ? '' : 's'}` : canAttach ? 'Attach' : 'No files'}
        </button>
      ) : null}

      {showAttachments ? (
        <Dialog open={open} onOpenChange={(o) => (!busy ? setOpen(o) : undefined)}>
          <DialogContent layer="top" className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-lg flex-col p-0')}>
            <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
              <DialogHeader className="pr-10 text-left">
                <DialogTitle className="text-base font-semibold text-white">Raw data · {testLabel}</DialogTitle>
                <DialogDescription className="text-[12px] text-stone-300">
                  Instrument printouts, photos or data files behind this result (ISO/IEC 17025 7.5.1).
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="space-y-3 bg-[#f7f3eb] p-3 sm:p-4">
              {attachments.length === 0 ? (
                <p className="text-sm text-stone-600">No files attached.</p>
              ) : (
                <ul className="divide-y divide-stone-300 border border-stone-300 bg-white">
                  {attachments.map((a) => {
                    const mayRemove = director || (canAttach && a.uploadedBy === user?.id)
                    return (
                      <li key={a.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left font-medium text-amber-900 hover:underline"
                          onClick={() => void view(a)}
                          title={a.fileName}
                        >
                          {a.fileName}
                        </button>
                        <span className="shrink-0 text-[11px] text-stone-500">
                          {[formatFileSize(a.sizeBytes), a.uploadedByName, a.uploadedAt ? formatDateTime(a.uploadedAt) : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {mayRemove ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 rounded-none text-red-700"
                            aria-label={`Remove ${a.fileName}`}
                            disabled={busy}
                            onClick={() => void remove(a)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-stone-500">PDF, images, CSV, TXT, Excel · max 25 MB each.</p>
                {canAttach ? (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xls,.xlsx"
                      onChange={(e) => void onFiles(e.target.files)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className={limsOutlineBtnClass}
                      disabled={busy}
                      onClick={() => fileRef.current?.click()}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Add files
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
