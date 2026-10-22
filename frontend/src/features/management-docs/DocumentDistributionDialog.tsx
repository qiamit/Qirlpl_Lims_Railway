import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { limsDarkBarGlowStyle, limsDialogClass, limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  docControlErrorText,
  fetchAcknowledgements,
  formatDateTime,
  versionLabel,
  type DocumentAcknowledgement,
} from './documentControl'
import type { ManagementDocumentRow } from './types'

export type DistributionUser = { id: string; name: string; designation?: string }

/**
 * Distribution list (8.3.2 c) and read acknowledgements of the current version.
 * Draft documents: anyone who can edit them. Active documents: Director / QM
 * (the database refuses others).
 */
export function DocumentDistributionDialog({
  open,
  row,
  users,
  canEdit,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  row: ManagementDocumentRow | null
  users: DistributionUser[]
  canEdit: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (row: ManagementDocumentRow) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && row ? (
        <DistributionBody
          key={`${row.id}:${versionLabel(row)}`}
          row={row}
          users={users}
          canEdit={canEdit}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  )
}

function DistributionBody({
  row,
  users,
  canEdit,
  onSaved,
}: {
  row: ManagementDocumentRow
  users: DistributionUser[]
  canEdit: boolean
  onSaved: (row: ManagementDocumentRow) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(row.distribution_user_ids ?? []))
  const [toAll, setToAll] = useState(() => Boolean(row.distribute_to_all))
  const [period, setPeriod] = useState(() => String(row.review_period_months ?? 12))
  const [filter, setFilter] = useState('')
  const [acks, setAcks] = useState<DocumentAcknowledgement[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAcknowledgements(row.id, versionLabel(row))
      .then((a) => {
        if (!cancelled) setAcks(a)
      })
      .catch(() => {
        if (!cancelled) setAcks([])
      })
    return () => {
      cancelled = true
    }
  }, [row])

  const ackByUser = useMemo(() => new Map(acks.map((a) => [a.user_id, a])), [acks])
  const recipients = useMemo(
    () => (toAll ? users : users.filter((u) => selected.has(u.id))),
    [toAll, users, selected],
  )
  const readCount = recipients.filter((u) => ackByUser.has(u.id)).length
  const visibleUsers = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? users.filter((u) => `${u.name} ${u.designation ?? ''}`.toLowerCase().includes(q)) : users
  }, [users, filter])

  const save = async () => {
    const months = Number(period)
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      setError('Review period must be 1 to 120 months.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('management_documents')
      .update({
        distribution_user_ids: Array.from(selected),
        distribute_to_all: toAll,
        review_period_months: months,
      })
      .eq('id', row.id)
      .select('*')
      .single()
    setSaving(false)
    if (e) {
      setError(docControlErrorText(e))
      return
    }
    onSaved(data as ManagementDocumentRow)
  }

  return (
    <DialogContent
      showCloseButton={false}
      aria-describedby={undefined}
      className={cn(limsDialogClass, 'max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl gap-0 p-0')}
    >
      <div className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <DialogHeader className="relative min-w-0 flex-1 text-left">
          <DialogTitle className="truncate text-base font-semibold text-white">
            Distribution · {row.doc_number}
          </DialogTitle>
          {row ? <p className="text-[11px] text-stone-300">{versionLabel(row)}</p> : null}
        </DialogHeader>
        <DialogClose
          className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center border !border-red-600 !bg-red-600 !text-white"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
        </DialogClose>
      </div>

      <div className="max-h-[70vh] space-y-3 overflow-y-auto bg-stone-50 px-4 py-3">
        {row.status === 'active' ? (
          <p className="text-[13px] text-stone-700">
            Read and understood: <strong>{readCount}</strong> of <strong>{recipients.length}</strong> recipients
            for this version.
          </p>
        ) : (
          <p className="text-[13px] text-stone-600">
            Recipients are asked to acknowledge the document once it is approved and active.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={toAll}
              disabled={!canEdit}
              onChange={(e) => setToAll(e.target.checked)}
            />
            Distribute to all staff
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            Periodic review every
            <Input
              type="number"
              min={1}
              max={120}
              className={cn(limsFieldClass, 'h-8 w-20')}
              value={period}
              disabled={!canEdit}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Review period in months"
            />
            months
          </label>
        </div>

        <Input
          className={cn(limsFieldClass, 'h-9')}
          placeholder="Filter people"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter people"
        />

        <ul className="divide-y divide-stone-200 border border-stone-300 bg-white">
          {visibleUsers.map((u) => {
            const ack = ackByUser.get(u.id)
            const isRecipient = toAll || selected.has(u.id)
            return (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <label className="inline-flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isRecipient}
                    disabled={!canEdit || toAll}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(u.id)
                        else next.delete(u.id)
                        return next
                      })
                    }
                  />
                  <span className="truncate">
                    {u.name}
                    {u.designation ? <span className="text-stone-500"> · {u.designation}</span> : null}
                  </span>
                </label>
                {row.status === 'active' && isRecipient ? (
                  ack ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Read {formatDateTime(ack.acknowledged_at)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12px] text-amber-800">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> Not yet read
                    </span>
                  )
                ) : null}
              </li>
            )
          })}
        </ul>

        {error ? (
          <p role="alert" className="border border-red-600/50 bg-red-50 px-3 py-2 text-[13px] text-red-900">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 border-t-2 border-stone-500 bg-stone-50 px-4 py-3">
        {canEdit ? (
          <Button type="button" className={cn('h-9', limsPrimaryBtnClass)} disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save distribution
          </Button>
        ) : (
          <p className="text-[12px] text-stone-600">Only the Laboratory Director or Quality Manager can change it.</p>
        )}
      </div>
    </DialogContent>
  )
}
