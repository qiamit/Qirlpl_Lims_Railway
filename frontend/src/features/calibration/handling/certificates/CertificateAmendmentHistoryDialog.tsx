import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import type { CalibrationJobRow } from '../types'
import { CertificateDraftDialog } from '../certificate-preparation/CertificateDraftDialog'
import { CERTIFICATE_AMENDMENT_TYPE_LABELS } from '../certificate-preparation/certificateDraftTypes'
import type { CalibrationRawDataSheetRow } from '../jobs/calibrationJobApi'
import {
  cancelCertificateAmendment,
  certificateAmendmentErrorMessage,
  fetchCertificateAmendments,
  fetchUserNames,
  type CertificateAmendmentRow,
} from './certificateAmendmentApi'

const STATUS_CLASS: Record<CertificateAmendmentRow['status'], string> = {
  open: 'border-amber-600/50 bg-amber-50 text-amber-900',
  issued: 'border-emerald-600/40 bg-emerald-50 text-emerald-900',
  cancelled: 'border-stone-400 bg-stone-100 text-stone-600',
}

const STATUS_LABEL: Record<CertificateAmendmentRow['status'], string> = {
  open: 'In progress',
  issued: 'Issued',
  cancelled: 'Cancelled',
}

const iconBtnClass =
  'h-8 w-8 rounded-none border border-stone-500 bg-stone-50 text-stone-700 shadow-none transition-colors hover:border-stone-800 hover:bg-stone-800 hover:text-amber-100 disabled:opacity-45'

/** Snapshot of the certificate as issued, shaped for CertificateDraftDialog. */
function snapshotForViewer(row: CertificateAmendmentRow) {
  const snap = row.original_snapshot ?? {}
  const sheet = snap.raw_data_sheet
  const rawDataSheet: CalibrationRawDataSheetRow | null =
    sheet && typeof sheet === 'object'
      ? {
          id: String(sheet.id ?? ''),
          calibration_job_id: row.calibration_job_id,
          sheet_status: sheet.sheet_status ?? 'approved',
          payload: (sheet.payload ?? {}) as Record<string, unknown>,
          reviewed_at: sheet.reviewed_at ?? null,
          reviewed_by: sheet.reviewed_by ?? null,
        }
      : null
  return {
    certificateDraft: (snap.certificate_draft ?? {}) as Record<string, unknown>,
    rawDataSheet,
    label: `${row.original_certificate_number} (superseded by amendment No. ${row.amendment_no})`,
  }
}

function jobFromSnapshot(row: CertificateAmendmentRow, fallback: CalibrationJobRow): CalibrationJobRow {
  const snapJob = row.original_snapshot?.job
  if (!snapJob || typeof snapJob !== 'object') return fallback
  return { ...fallback, ...(snapJob as Partial<CalibrationJobRow>), id: fallback.id, stage: 'certificates' }
}

/** Amendment history of one calibration job; the original of each amendment stays viewable. */
export function CertificateAmendmentHistoryDialog({
  open,
  onOpenChange,
  job,
  canAmend,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: CalibrationJobRow | null
  canAmend: boolean
  /** After cancelling an amendment (job state changed). */
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<CertificateAmendmentRow[]>([])
  const [names, setNames] = useState<Map<string, string>>(() => new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [viewRow, setViewRow] = useState<CertificateAmendmentRow | null>(null)

  const load = useCallback(async (jobId: string) => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchCertificateAmendments(jobId)
      setRows(list)
      setNames(
        await fetchUserNames(list.flatMap((r) => [r.requested_by, r.approved_by, r.cancelled_by])),
      )
    } catch (err) {
      setRows([])
      setError(certificateAmendmentErrorMessage(err, 'Unable to load amendment history'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !job) {
      setRows([])
      setViewRow(null)
      return
    }
    void load(job.id)
  }, [open, job, load])

  const person = (id: string | null) => (id ? names.get(id) ?? '—' : '—')

  const handleCancel = async (row: CertificateAmendmentRow) => {
    if (
      !window.confirm(
        `Cancel amendment No. ${row.amendment_no}? Certificate ${row.original_certificate_number} becomes the issued certificate again.`,
      )
    ) {
      return
    }
    setBusyId(row.id)
    setError(null)
    try {
      await cancelCertificateAmendment(row.id)
      if (job) await load(job.id)
      onChanged?.()
    } catch (err) {
      setError(certificateAmendmentErrorMessage(err, 'Unable to cancel the amendment'))
    } finally {
      setBusyId(null)
    }
  }

  // Stable references: CertificateDraftDialog reloads whenever `job` changes identity.
  const viewer = useMemo(() => (viewRow && job ? snapshotForViewer(viewRow) : null), [viewRow, job])
  const viewerJob = useMemo(
    () => (viewRow && job ? jobFromSnapshot(viewRow, job) : null),
    [viewRow, job],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          layer="stacked"
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="lg:left-[268px]"
          className={cn(
            limsDialogClass,
            'flex max-h-[90dvh] w-[min(96vw,72rem)] max-w-[72rem] flex-col overflow-hidden p-0',
            'lg:!relative lg:!left-auto lg:!right-auto lg:!top-auto lg:!mx-0 lg:!translate-x-0 lg:!translate-y-0',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
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
                Amendment History — {job?.equipment_label?.trim() || '—'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
            <div className="overflow-x-auto rounded-none border-2 border-stone-700 bg-white">
              <Table className="w-full min-w-[960px] table-fixed border-collapse [&_td]:border [&_td]:border-[#e7e0d4] [&_th]:border [&_th]:border-stone-700">
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[19%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[6%]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="bg-stone-800 hover:bg-stone-800">
                    <TableHead className="text-center text-xs">No.</TableHead>
                    <TableHead className="text-center text-xs">Type</TableHead>
                    <TableHead className="text-center text-xs">Status</TableHead>
                    <TableHead className="text-left text-xs">Replaces (issued)</TableHead>
                    <TableHead className="text-left text-xs">New certificate No</TableHead>
                    <TableHead className="text-left text-xs">Reason</TableHead>
                    <TableHead className="text-left text-xs">Requested</TableHead>
                    <TableHead className="text-left text-xs">Issued / cancelled</TableHead>
                    <TableHead className="text-center text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                        Loading amendment history…
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                        This certificate has not been amended.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-center align-middle text-sm font-semibold">
                          {row.amendment_no}
                        </TableCell>
                        <TableCell className="text-center align-middle text-sm">
                          {CERTIFICATE_AMENDMENT_TYPE_LABELS[row.amendment_type] ?? row.amendment_type}
                        </TableCell>
                        <TableCell className="text-center align-middle">
                          <span
                            className={cn(
                              'inline-block border px-1.5 py-0.5 text-[11px] font-medium',
                              STATUS_CLASS[row.status],
                            )}
                          >
                            {STATUS_LABEL[row.status] ?? row.status}
                          </span>
                        </TableCell>
                        <TableCell className="align-middle text-sm">
                          <div className="truncate font-medium" title={row.original_certificate_number}>
                            {row.original_certificate_number}
                          </div>
                          <div className="text-xs text-stone-600">
                            dated {formatDate(row.original_issue_date ?? row.original_issued_at)}
                          </div>
                        </TableCell>
                        <TableCell className="truncate align-middle text-sm" title={row.new_certificate_number}>
                          {row.new_certificate_number}
                        </TableCell>
                        <TableCell className="align-middle text-sm">
                          <p className="line-clamp-3 whitespace-pre-wrap break-words" title={row.reason}>
                            {row.reason}
                          </p>
                        </TableCell>
                        <TableCell className="align-middle text-xs">
                          <div className="truncate">{person(row.requested_by)}</div>
                          <div className="text-stone-600">{formatDateTime(row.requested_at)}</div>
                        </TableCell>
                        <TableCell className="align-middle text-xs">
                          {row.status === 'issued' ? (
                            <>
                              <div className="truncate">{person(row.approved_by)}</div>
                              <div className="text-stone-600">{formatDateTime(row.approved_at)}</div>
                            </>
                          ) : row.status === 'cancelled' ? (
                            <>
                              <div className="truncate">{person(row.cancelled_by)}</div>
                              <div className="text-stone-600">{formatDateTime(row.cancelled_at)}</div>
                            </>
                          ) : (
                            <span className="text-stone-500">Pending</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center align-middle">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className={iconBtnClass}
                              onClick={() => setViewRow(row)}
                              aria-label={`View original certificate ${row.original_certificate_number}`}
                              title="View original (read-only)"
                            >
                              <Eye size={15} aria-hidden />
                            </Button>
                            {row.status === 'open' && canAmend ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className={iconBtnClass}
                                disabled={busyId === row.id}
                                onClick={() => void handleCancel(row)}
                                aria-label={`Cancel amendment ${row.amendment_no}`}
                                title="Cancel amendment (restore original)"
                              >
                                <XCircle size={15} aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CertificateDraftDialog
        job={viewerJob}
        open={Boolean(viewerJob)}
        onOpenChange={(next) => {
          if (!next) setViewRow(null)
        }}
        snapshot={viewer}
        layer="top"
      />
    </>
  )
}
