import { useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmLoginPasswordDialog } from '@/features/sample-handling/shared/ConfirmLoginPasswordDialog'
import { limsFieldClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  approveDocument,
  docControlErrorText,
  formatDateTime,
  formatDay,
  recordPeriodicReview,
  reviewDocument,
  reviewDueState,
  submitForReview,
  versionLabel,
  workflowStage,
  type WorkflowStage,
} from './documentControl'
import type { ManagementDocumentRow } from './types'

const STEPS: Array<{ id: WorkflowStage; label: string }> = [
  { id: 'prepare', label: 'Prepare' },
  { id: 'review', label: 'Review' },
  { id: 'approve', label: 'Approve' },
  { id: 'active', label: 'Active' },
]

export function ReviewDueBadge({ row }: { row: ManagementDocumentRow }) {
  const state = reviewDueState(row)
  if (state === 'none' || state === 'ok') return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        state === 'overdue'
          ? 'border-red-700/50 bg-red-100 text-red-800'
          : 'border-amber-700/40 bg-amber-100 text-amber-900',
      )}
      title={`Periodic review due ${formatDay(row.next_review_due)}`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {state === 'overdue' ? 'Review overdue' : 'Review due soon'}
    </span>
  )
}

function SignatureLine({
  label,
  name,
  at,
  comment,
}: {
  label: string
  name: string | null | undefined
  at: string | null | undefined
  comment?: string | null
}) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 border-b border-stone-200 py-1.5 text-[13px] last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</span>
      <div className="min-w-0">
        <p className="font-medium text-stone-900">{name?.trim() || '—'}</p>
        {at ? <p className="text-[11px] text-stone-500">{formatDateTime(at)}</p> : null}
        {comment ? <p className="mt-0.5 text-[12px] italic text-stone-600">{comment}</p> : null}
      </div>
    </div>
  )
}

type PendingSignature = { kind: 'review' | 'approve'; title: string; statement: string }

export function DocumentWorkflowPanel({
  row,
  currentUserId,
  isApprover,
  onChanged,
}: {
  row: ManagementDocumentRow
  currentUserId: string | null
  isApprover: boolean
  onChanged: (row: ManagementDocumentRow, message: string) => void
}) {
  const [comment, setComment] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [nextDue, setNextDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingSignature | null>(null)

  const stage = workflowStage(row)
  const stageIndex = STEPS.findIndex((s) => s.id === stage)
  const isAuthor = Boolean(row.prepared_by_id && currentUserId && row.prepared_by_id === currentUserId)

  const run = async (fn: () => Promise<ManagementDocumentRow>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await fn()
      setComment('')
      setNextDue('')
      onChanged(updated, message)
    } catch (err) {
      setError(docControlErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  const needComment = (what: string) => {
    if (comment.trim()) return true
    setError(`Write the reason in the comment box before you ${what}.`)
    return false
  }

  const withdraw = async () => {
    if (!window.confirm(`Withdraw ${row.doc_number} and mark it OBSOLETE? Prints will carry an OBSOLETE watermark.`)) return
    await run(async () => {
      const { data, error: e } = await supabase
        .from('management_documents')
        .update({ status: 'obsolete' })
        .eq('id', row.id)
        .select('*')
        .single()
      if (e) throw e
      return data as ManagementDocumentRow
    }, `${row.doc_number} withdrawn (obsolete).`)
  }

  return (
    <section className="space-y-3 border-2 border-stone-400 bg-white p-3" aria-label="Document control workflow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
            ISO/IEC 17025 8.3 · Document control
          </p>
          <p className="text-sm font-semibold text-stone-900">{versionLabel(row)}</p>
        </div>
        <ReviewDueBadge row={row} />
      </div>

      <ol className="flex flex-wrap items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
        {STEPS.map((s, i) => {
          const done = stage === 'obsolete' ? true : i < stageIndex
          const current = s.id === stage
          return (
            <li
              key={s.id}
              className={cn(
                'inline-flex items-center gap-1 border px-2 py-1',
                current && 'border-amber-600 bg-amber-50 text-amber-900',
                done && !current && 'border-emerald-600/50 bg-emerald-50 text-emerald-800',
                !done && !current && 'border-stone-300 text-stone-500',
              )}
            >
              {done && !current ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <CircleDot className="h-3 w-3" aria-hidden />}
              {s.label}
            </li>
          )
        })}
        {stage === 'obsolete' ? (
          <li className="inline-flex items-center gap-1 border border-red-600/50 bg-red-50 px-2 py-1 text-red-800">Obsolete</li>
        ) : null}
      </ol>

      <div className="border border-stone-200 bg-stone-50/60 px-3 py-1">
        <SignatureLine label="Prepared" name={row.prepared_by} at={row.prepared_at} />
        <SignatureLine label="Reviewed" name={row.reviewed_by} at={row.reviewed_at} comment={row.review_comment} />
        <SignatureLine label="Approved" name={row.approved_by} at={row.approved_at} comment={row.approval_comment} />
        {row.status === 'active' || row.status === 'obsolete' ? (
          <SignatureLine
            label="Periodic review"
            name={`Next due ${formatDay(row.next_review_due)} (every ${row.review_period_months ?? 12} months)`}
            at={row.last_periodic_review_at}
            comment={row.last_periodic_review_note}
          />
        ) : null}
        {row.status === 'obsolete' ? (
          <SignatureLine label="Withdrawn" name={formatDay(row.obsoleted_at)} at={null} />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="border border-red-600/50 bg-red-50 px-3 py-2 text-[13px] text-red-900">
          {error}
        </p>
      ) : null}

      {stage !== 'obsolete' ? (
        <div className="space-y-2">
          <Label htmlFor="doc-workflow-comment" className="text-[11px] uppercase tracking-wide text-stone-600">
            Comment {stage === 'active' ? '/ periodic review outcome' : ''}
          </Label>
          <Textarea
            id="doc-workflow-comment"
            className={cn(limsFieldClass, 'min-h-[64px]')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              stage === 'active'
                ? 'e.g. Reviewed, still suitable - no change needed'
                : 'Optional when accepting; required when returning or rejecting'
            }
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        {stage === 'prepare' ? (
          <Button
            type="button"
            className={cn('h-9', limsPrimaryBtnClass)}
            disabled={busy}
            onClick={() => void run(() => submitForReview(row.id), `${row.doc_number} submitted for review.`)}
          >
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Submit for review
          </Button>
        ) : null}

        {stage === 'review' ? (
          isAuthor ? (
            <p className="text-[13px] text-stone-600">Waiting for review by another authorised person (not the author).</p>
          ) : (
            <>
              <Button
                type="button"
                className={cn('h-9', limsPrimaryBtnClass)}
                disabled={busy}
                onClick={() =>
                  setPending({
                    kind: 'review',
                    title: 'Sign review',
                    statement: `I have reviewed ${row.doc_number} (${versionLabel(row)}) and find it adequate.`,
                  })
                }
              >
                Reviewed - send for approval
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn('h-9', limsOutlineBtnClass)}
                disabled={busy}
                onClick={() => {
                  if (needComment('return it')) {
                    void run(() => reviewDocument(row.id, false, comment.trim()), `${row.doc_number} returned to the author.`)
                  }
                }}
              >
                Return to author
              </Button>
            </>
          )
        ) : null}

        {stage === 'approve' ? (
          isApprover ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="doc-effective-date" className="text-[11px] uppercase tracking-wide text-stone-600">
                  Effective / issue date
                </Label>
                <Input
                  id="doc-effective-date"
                  type="date"
                  className={cn(limsFieldClass, 'h-9 w-[160px]')}
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                className={cn('h-9', limsPrimaryBtnClass)}
                disabled={busy}
                onClick={() =>
                  setPending({
                    kind: 'approve',
                    title: 'Sign approval',
                    statement: `I approve ${row.doc_number} (${versionLabel(row)}) for issue and use (ISO/IEC 17025 8.3.2 a).`,
                  })
                }
              >
                Approve &amp; make active
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn('h-9', limsOutlineBtnClass)}
                disabled={busy}
                onClick={() => {
                  if (needComment('reject it')) {
                    void run(
                      () => approveDocument(row.id, false, comment.trim(), null),
                      `${row.doc_number} rejected and returned to Draft.`,
                    )
                  }
                }}
              >
                Reject
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-stone-600">Reviewed. Waiting for approval by the Laboratory Director or Quality Manager.</p>
          )
        ) : null}

        {stage === 'active' && isApprover ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="doc-next-due" className="text-[11px] uppercase tracking-wide text-stone-600">
                Next review (optional)
              </Label>
              <Input
                id="doc-next-due"
                type="date"
                className={cn(limsFieldClass, 'h-9 w-[160px]')}
                value={nextDue}
                onChange={(e) => setNextDue(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className={cn('h-9', limsPrimaryBtnClass)}
              disabled={busy}
              onClick={() => {
                if (needComment('record the periodic review')) {
                  void run(
                    () => recordPeriodicReview(row.id, comment.trim(), nextDue || null),
                    `Periodic review of ${row.doc_number} recorded.`,
                  )
                }
              }}
            >
              Record periodic review
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn('h-9', limsOutlineBtnClass)}
              disabled={busy}
              onClick={() => void withdraw()}
            >
              Withdraw (obsolete)
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmLoginPasswordDialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={pending?.title ?? 'Confirm Password'}
        confirmLabel={pending?.kind === 'approve' ? 'Approve' : 'Sign review'}
        statement={pending?.statement}
        onConfirmed={() => {
          const p = pending
          setPending(null)
          if (!p) return
          if (p.kind === 'review') {
            void run(() => reviewDocument(row.id, true, comment.trim()), `${row.doc_number} reviewed; waiting for approval.`)
          } else {
            void run(
              () => approveDocument(row.id, true, comment.trim(), effectiveDate || null),
              `${row.doc_number} approved and active.`,
            )
          }
        }}
      >
        <p className="text-sm text-stone-700">
          {row.doc_number} - {row.title}
        </p>
      </ConfirmLoginPasswordDialog>
    </section>
  )
}
