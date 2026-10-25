import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { CalibrationJobRow } from '../types'
import {
  parseCertificateDraft,
  type CertificateAmendmentType,
} from '../certificate-preparation/certificateDraftTypes'
import {
  CERTIFICATE_AMENDMENT_TYPE_OPTIONS,
  certificateAmendmentErrorMessage,
  fetchCertificateAmendments,
  previewAmendedCertificateNumber,
  startCertificateAmendment,
} from './certificateAmendmentApi'

/**
 * Amend an issued calibration certificate (ISO/IEC 17025 7.8.8): the issued
 * certificate is kept as a read-only snapshot and the job returns to
 * Certificate Preparation with the new certificate number pre-set.
 */
export function CertificateAmendmentDialog({
  open,
  onOpenChange,
  job,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: CalibrationJobRow | null
  onStarted: (job: CalibrationJobRow) => void
}) {
  const handleOpenChange = useFormDialogOpenChange(onOpenChange)
  const [type, setType] = useState<CertificateAmendmentType>('amendment')
  const [reason, setReason] = useState('')
  const [nextNo, setNextNo] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draft = useMemo(() => parseCertificateDraft(job?.certificate_draft), [job?.certificate_draft])
  const originalNo = draft.certificateNumber.trim()

  useEffect(() => {
    setType('amendment')
    setReason('')
    setError(null)
    setNextNo(1)
    if (!open || !job) return
    let cancelled = false
    void fetchCertificateAmendments(job.id)
      .then((rows) => {
        if (cancelled) return
        const max = rows.reduce((m, r) => Math.max(m, r.amendment_no), 0)
        setNextNo(max + 1)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, job])

  const newNumber = originalNo ? previewAmendedCertificateNumber(originalNo, type, nextNo) : '—'
  const typeHint = CERTIFICATE_AMENDMENT_TYPE_OPTIONS.find((o) => o.value === type)?.hint ?? ''
  const canSubmit = Boolean(job && originalNo && reason.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!job || !canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await startCertificateAmendment({ jobId: job.id, type, reason })
      onStarted(job)
      onOpenChange(false)
    } catch (err) {
      setError(certificateAmendmentErrorMessage(err, 'Unable to start the amendment'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        layer="nested"
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:left-[268px]"
        className={cn(
          limsDialogClass,
          'flex w-[min(96vw,48rem)] max-w-[48rem] flex-col',
          'lg:!relative lg:!left-auto lg:!right-auto lg:!top-auto lg:!mx-0 lg:!translate-x-0 lg:!translate-y-0',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Amend Certificate — {job?.equipment_label?.trim() || '—'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <form
          className={cn(limsRegistryFormClass, 'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5')}
          onSubmit={(e) => void handleSubmit(e)}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="cert-amend-type">Issue type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CertificateAmendmentType)}>
                <SelectTrigger id="cert-amend-type" aria-label="Issue type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CERTIFICATE_AMENDMENT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="cert-amend-original">Issued certificate No</Label>
              <Input id="cert-amend-original" value={originalNo || '—'} readOnly />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="cert-amend-issued">Issued on</Label>
              <Input
                id="cert-amend-issued"
                value={formatDate(draft.issueDate || job?.stage_entered_at || null)}
                readOnly
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="cert-amend-srf">SRF Number</Label>
              <Input id="cert-amend-srf" value={job?.srf_number?.trim() || '—'} readOnly />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="cert-amend-ulr">ULR Number</Label>
              <Input id="cert-amend-ulr" value={draft.ulrNumber.trim() || '—'} readOnly />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="cert-amend-new">New certificate No</Label>
              <Input id="cert-amend-new" value={newNumber} readOnly />
            </div>
          </div>
          {typeHint ? <p className="text-xs text-stone-600">{typeHint}</p> : null}

          <div className="space-y-2">
            <Label htmlFor="cert-amend-reason">
              Reason for amendment <span className="text-red-700">*</span>
            </Label>
            <Textarea
              id="cert-amend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What is wrong or missing on the issued certificate"
              rows={3}
              required
              className="min-h-20 resize-y"
            />
            <p className="text-xs text-stone-600">
              The issued certificate is kept unchanged in the amendment history. The job returns to
              Certificate Preparation; issue it from there to release the amended certificate.
            </p>
          </div>

          {!originalNo ? (
            <p className="text-sm text-red-700">This certificate has no certificate number to amend.</p>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-stone-300 pt-3">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" className={limsPrimaryBtnClass} disabled={!canSubmit || submitting}>
              {submitting ? 'Reopening…' : 'Amend certificate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
