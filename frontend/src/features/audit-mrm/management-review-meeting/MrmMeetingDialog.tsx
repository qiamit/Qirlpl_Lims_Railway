import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Plus, Printer, RefreshCw, Save, Send, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmLoginPasswordDialog } from '@/features/sample-handling/shared/ConfirmLoginPasswordDialog'
import {
  limsDarkBarBtnClass,
  limsDeleteBtnClass,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { buildMrmMinutesPrintHtml, openPrintWindow } from './buildMrmMinutesPrintHtml'
import { MrmActionFollowUpDialog } from './MrmActionFollowUpDialog'
import { MrmInputCard } from './MrmInputCard'
import { pullAllMrmInputs, pullMrmInput, type MrmPullContext } from './mrmAutoPull'
import { deleteMeeting, errorText, loadMeetingForm, saveMeeting, setMeetingStatus } from './mrmMeetingDb'
import {
  MRM_INPUT_CODES,
  MRM_OUTPUT_TYPES,
  actionStatusClass,
  actionStatusLabel,
  effectiveActionStatus,
  emptyAction,
  meetingStatusClass,
  meetingStatusLabel,
  uiKey,
  type MrmActionForm,
  type MrmActionStatus,
  type MrmInputForm,
  type MrmMeetingForm,
  type MrmMeetingRow,
  type MrmOutputType,
  type MrmUser,
} from './types'

const labelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'
const sectionTitle = 'border-b-2 border-stone-400 pb-1 text-xs font-bold uppercase tracking-[0.12em] text-stone-700'

type PendingSign = 'circulate' | 'close' | null

/** Problems that stop a meeting from being closed (mirrors the database check). */
function closeProblems(form: MrmMeetingForm): string[] {
  const out: string[] = []
  if (!form.attendance.some((a) => a.present && a.name.trim())) out.push('mark at least one attendee present')
  const missing = form.inputs.filter((i) => !i.conclusion.trim()).map((i) => i.code)
  if (missing.length) out.push(`record a conclusion for input(s) ${missing.join(', ')}`)
  if (!form.outputs.some((o) => o.decision.trim())) out.push('record at least one output decision (8.9.3)')
  return out
}

export function MrmMeetingDialog({
  meeting,
  labName,
  users,
  canWrite,
  isDirector,
  currentUserId,
  onOpenChange,
  onChanged,
}: {
  meeting: MrmMeetingRow
  labName: string
  users: MrmUser[]
  canWrite: boolean
  isDirector: boolean
  currentUserId: string
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void> | void
}) {
  const [form, setForm] = useState<MrmMeetingForm | null>(null)
  const [savedActionIds, setSavedActionIds] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pulling, setPulling] = useState<Set<string>>(() => new Set())
  const [pendingSign, setPendingSign] = useState<PendingSign>(null)
  const [followUp, setFollowUp] = useState<MrmActionForm | null>(null)
  const [addUserId, setAddUserId] = useState('')

  const closed = meeting.status === 'closed'
  const readOnly = closed || !canWrite

  const reload = useCallback(async () => {
    try {
      const f = await loadMeetingForm(meeting)
      setForm(f)
      setSavedActionIds(f.actions.map((a) => a.id).filter(Boolean))
      setLoadError(null)
    } catch (err) {
      setLoadError(errorText(err))
    }
    // Reload when the meeting row (status / header) changes.
  }, [meeting])

  useEffect(() => {
    void reload()
  }, [reload])

  const patch = (p: Partial<MrmMeetingForm>) => setForm((prev) => (prev ? { ...prev, ...p } : prev))
  const patchInput = (code: string, p: Partial<MrmInputForm>) =>
    setForm((prev) => (prev ? { ...prev, inputs: prev.inputs.map((i) => (i.code === code ? { ...i, ...p } : i)) } : prev))

  const pullCtx = (): MrmPullContext | null => {
    if (!form) return null
    if (!form.periodFrom || !form.periodTo || form.periodFrom > form.periodTo) {
      setMessage({ text: 'Set a valid review period before pulling figures.', error: true })
      return null
    }
    return { from: form.periodFrom, to: form.periodTo, meetingId: meeting.id, heldOn: form.heldOn }
  }

  const pullOne = async (code: string) => {
    const ctx = pullCtx()
    if (!ctx) return
    setPulling((prev) => new Set(prev).add(code))
    const summary = await pullMrmInput(code, ctx)
    patchInput(code, { summary, pulledAt: summary.pulledAt ?? new Date().toISOString() })
    setPulling((prev) => {
      const next = new Set(prev)
      next.delete(code)
      return next
    })
  }

  const pullAll = async () => {
    const ctx = pullCtx()
    if (!ctx) return
    setPulling(new Set(MRM_INPUT_CODES))
    const all = await pullAllMrmInputs(MRM_INPUT_CODES, ctx)
    setForm((prev) =>
      prev
        ? {
            ...prev,
            inputs: prev.inputs.map((i) =>
              all[i.code] ? { ...i, summary: all[i.code], pulledAt: all[i.code].pulledAt ?? null } : i,
            ),
          }
        : prev,
    )
    setPulling(new Set())
    setMessage({ text: 'Figures pulled for the review period. Save to keep the snapshot.', error: false })
  }

  const doSave = async (): Promise<boolean> => {
    if (!form) return false
    if (!form.meetingNo.trim() || !form.heldOn) {
      setMessage({ text: 'Meeting no. and date are required.', error: true })
      return false
    }
    if (form.periodFrom && form.periodTo && form.periodFrom > form.periodTo) {
      setMessage({ text: 'Review period: "from" must not be after "to".', error: true })
      return false
    }
    const badDone = form.actions.find((a) => a.action.trim() && a.status === 'done' && !a.closureEvidence.trim())
    if (badDone) {
      setMessage({ text: `Closure evidence is required for done action "${badDone.action.slice(0, 40)}".`, error: true })
      return false
    }
    try {
      await saveMeeting(meeting.id, form, savedActionIds)
      await reload()
      await onChanged()
      return true
    } catch (err) {
      setMessage({ text: errorText(err), error: true })
      return false
    }
  }

  const handleSave = async () => {
    setBusy(true)
    setMessage(null)
    try {
      if (await doSave()) setMessage({ text: 'Minutes saved.', error: false })
    } finally {
      setBusy(false)
    }
  }

  const askSign = (kind: Exclude<PendingSign, null>) => {
    if (!form) return
    if (kind === 'close') {
      const problems = closeProblems(form)
      if (problems.length) {
        setMessage({ text: `Before closing: ${problems.join('; ')}.`, error: true })
        return
      }
    }
    setPendingSign(kind)
  }

  const handleSigned = async (kind: Exclude<PendingSign, null>, reauthenticatedAt: string) => {
    if (!form) return
    setBusy(true)
    setMessage(null)
    try {
      if (!(await doSave())) return
      if (kind === 'circulate') {
        await setMeetingStatus(meeting.id, 'minutes_circulated')
        setMessage({ text: 'Minutes circulated.', error: false })
      } else {
        await setMeetingStatus(meeting.id, 'closed', { closingRemarks: form.closingRemarks, reauthenticatedAt })
        setMessage({ text: 'Meeting closed. The minutes are now read-only.', error: false })
      }
      await onChanged()
    } catch (err) {
      setMessage({ text: errorText(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  const handleBackToDraft = async () => {
    if (!window.confirm('Take the circulated minutes back to draft for correction?')) return
    setBusy(true)
    try {
      await setMeetingStatus(meeting.id, 'draft')
      await onChanged()
      setMessage({ text: 'Minutes are a draft again.', error: false })
    } catch (err) {
      setMessage({ text: errorText(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete draft meeting ${meeting.meetingNo}? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteMeeting(meeting.id)
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      setMessage({ text: errorText(err), error: true })
      setBusy(false)
    }
  }

  const handlePrint = () => {
    if (!form) return
    try {
      openPrintWindow(buildMrmMinutesPrintHtml({ labName, meeting, form }))
    } catch (err) {
      setMessage({ text: errorText(err), error: true })
    }
  }

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const presentCount = form?.attendance.filter((a) => a.present).length ?? 0
  const concludedCount = form?.inputs.filter((i) => i.conclusion.trim()).length ?? 0

  const setAction = (key: string, p: Partial<MrmActionForm>) =>
    setForm((prev) => (prev ? { ...prev, actions: prev.actions.map((a) => (a.key === key ? { ...a, ...p } : a)) } : prev))

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="!items-stretch !justify-start md:pl-0"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 flex-col',
          'left-0 top-0',
          'lg:!left-[268px] lg:!right-0 lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-white sm:text-lg">
              Management Review — {meeting.meetingNo}
              <span className={cn('border px-2 py-0.5 text-[11px] font-semibold', meetingStatusClass(meeting.status))}>
                {meetingStatusLabel(meeting.status)}
              </span>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4">
          {message ? (
            <p
              className={cn(
                'mb-3 border-l-2 px-3 py-2 text-sm',
                message.error
                  ? 'border-destructive bg-destructive/5 text-destructive'
                  : 'border-emerald-600 bg-emerald-50 text-emerald-900',
              )}
              role="status"
            >
              {message.text}
            </p>
          ) : null}
          {loadError ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>
          ) : null}
          {!form && !loadError ? (
            <p className="flex items-center gap-2 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading minutes…
            </p>
          ) : null}

          {form ? (
            <div className="mx-auto max-w-6xl space-y-6 pb-24">
              {closed ? (
                <p className="border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Closed by {meeting.approvedByName || '—'} on {formatDateTime(meeting.approvedAt)}
                  {meeting.approvedReauthenticatedAt ? ' (password confirmed)' : ''}. Minutes are read-only; actions can
                  still be followed up.
                </p>
              ) : !canWrite ? (
                <p className="border-l-4 border-stone-500 bg-stone-100 px-3 py-2 text-sm text-stone-700">
                  Read-only: only the Laboratory Director or Quality Manager can edit management review minutes.
                </p>
              ) : null}

              {/* Meeting details */}
              <section className="space-y-3">
                <h2 className={sectionTitle}>Meeting</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="mrm-no" className={labelClass}>Meeting no.</Label>
                    <Input id="mrm-no" className={limsFieldClass} value={form.meetingNo} disabled={readOnly} onChange={(e) => patch({ meetingNo: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mrm-held" className={labelClass}>Held on</Label>
                    <Input id="mrm-held" type="date" className={limsFieldClass} value={form.heldOn} disabled={readOnly} onChange={(e) => patch({ heldOn: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>MRM plan</Label>
                    <p className="flex h-8 items-center border border-stone-300 bg-stone-100 px-2 text-sm">{meeting.planCode || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mrm-venue" className={labelClass}>Venue</Label>
                    <Input id="mrm-venue" className={limsFieldClass} value={form.venue} disabled={readOnly} onChange={(e) => patch({ venue: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mrm-chair" className={labelClass}>Chaired by</Label>
                    <Input id="mrm-chair" className={limsFieldClass} value={form.chairedBy} disabled={readOnly} onChange={(e) => patch({ chairedBy: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="mrm-pfrom" className={labelClass}>Period from</Label>
                      <Input id="mrm-pfrom" type="date" className={limsFieldClass} value={form.periodFrom} disabled={readOnly} onChange={(e) => patch({ periodFrom: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mrm-pto" className={labelClass}>Period to</Label>
                      <Input id="mrm-pto" type="date" className={limsFieldClass} value={form.periodTo} disabled={readOnly} onChange={(e) => patch({ periodTo: e.target.value })} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Attendance */}
              <section className="space-y-3">
                <h2 className={sectionTitle}>
                  Attendance <span className="font-normal normal-case tracking-normal text-stone-500">({presentCount} present)</span>
                </h2>
                <div className="space-y-2">
                  {form.attendance.length === 0 ? <p className="text-sm text-stone-500">No attendees yet.</p> : null}
                  {form.attendance.map((a) => (
                    <div key={a.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border border-stone-300 bg-white p-2 sm:grid-cols-[auto_1fr_1fr_auto]">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={a.present}
                          disabled={readOnly}
                          onChange={(e) => patch({ attendance: form.attendance.map((x) => (x.key === a.key ? { ...x, present: e.target.checked } : x)) })}
                          aria-label={`${a.name} present`}
                        />
                        Present
                      </label>
                      <Input
                        className={limsFieldClass}
                        value={a.name}
                        disabled={readOnly || Boolean(a.userId)}
                        placeholder="Name"
                        aria-label="Attendee name"
                        onChange={(e) => patch({ attendance: form.attendance.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)) })}
                      />
                      <Input
                        className={cn(limsFieldClass, 'col-span-3 sm:col-span-1')}
                        value={a.designation}
                        disabled={readOnly}
                        placeholder="Designation"
                        aria-label="Attendee designation"
                        onChange={(e) => patch({ attendance: form.attendance.map((x) => (x.key === a.key ? { ...x, designation: e.target.value } : x)) })}
                      />
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="row-start-1 col-start-3 h-8 w-8 text-red-700 sm:col-start-4"
                          onClick={() => patch({ attendance: form.attendance.filter((x) => x.key !== a.key) })}
                          aria-label={`Remove ${a.name || 'attendee'}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {!readOnly ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={cn(limsFieldClass, 'min-w-0 flex-1 px-2 text-sm sm:max-w-xs')}
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      aria-label="Staff member to add"
                    >
                      <option value="">Select staff member…</option>
                      {users
                        .filter((u) => !form.attendance.some((a) => a.userId === u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}{u.designation ? ` — ${u.designation}` : ''}
                          </option>
                        ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'gap-1')}
                      disabled={!addUserId}
                      onClick={() => {
                        const u = userById.get(addUserId)
                        if (!u) return
                        patch({ attendance: [...form.attendance, { key: uiKey('att'), userId: u.id, name: u.name, designation: u.designation, present: true }] })
                        setAddUserId('')
                      }}
                    >
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'gap-1')}
                      onClick={() => patch({ attendance: [...form.attendance, { key: uiKey('att'), userId: '', name: '', designation: '', present: true }] })}
                    >
                      <Plus className="h-4 w-4" /> Add guest
                    </Button>
                  </div>
                ) : null}
              </section>

              {/* Inputs a - o */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-stone-400 pb-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-700">
                    Review inputs (8.9.2 a–o){' '}
                    <span className="font-normal normal-case tracking-normal text-stone-500">
                      ({concludedCount}/15 concluded)
                    </span>
                  </h2>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      className={cn(limsPrimaryBtnClass, 'h-8 gap-1')}
                      onClick={() => void pullAll()}
                      disabled={pulling.size > 0}
                    >
                      {pulling.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Auto-pull all for period
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {form.inputs.map((input) => (
                    <MrmInputCard
                      key={input.code}
                      input={input}
                      readOnly={readOnly}
                      pulling={pulling.has(input.code)}
                      onPull={() => void pullOne(input.code)}
                      onChange={(p) => patchInput(input.code, p)}
                    />
                  ))}
                </div>
              </section>

              {/* Outputs */}
              <section className="space-y-3">
                <h2 className={sectionTitle}>Outputs — decisions and actions (8.9.3)</h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {MRM_OUTPUT_TYPES.map((t) => {
                    const list = form.outputs.filter((o) => o.outputType === t.value)
                    return (
                      <div key={t.value} className="space-y-2 border border-stone-300 bg-white p-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">{t.label}</p>
                          {t.hint ? <p className="text-[11px] text-stone-500">{t.hint}</p> : null}
                        </div>
                        {list.length === 0 ? <p className="text-xs text-stone-500">No decision recorded.</p> : null}
                        {list.map((o) => (
                          <div key={o.key} className="flex items-start gap-2">
                            <Textarea
                              rows={2}
                              className="min-h-[56px] border-stone-500 text-sm"
                              value={o.decision}
                              disabled={readOnly}
                              aria-label={`${t.label} decision`}
                              onChange={(e) => patch({ outputs: form.outputs.map((x) => (x.key === o.key ? { ...x, decision: e.target.value } : x)) })}
                            />
                            {!readOnly ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-red-700"
                                aria-label="Remove decision"
                                onClick={() => patch({ outputs: form.outputs.filter((x) => x.key !== o.key) })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        ))}
                        {!readOnly ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(limsOutlineBtnClass, 'h-7 gap-1 text-xs')}
                            onClick={() => patch({ outputs: [...form.outputs, { key: uiKey('out'), outputType: t.value as MrmOutputType, decision: '' }] })}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add decision
                          </Button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Actions */}
              <section className="space-y-3">
                <h2 className={sectionTitle}>Action items</h2>
                {form.actions.length === 0 ? <p className="text-sm text-stone-500">No actions recorded.</p> : null}
                <div className="space-y-2">
                  {form.actions.map((a, idx) => {
                    const st = effectiveActionStatus(a)
                    const canFollowUp = Boolean(a.id) && (canWrite || (Boolean(currentUserId) && a.ownerUserId === currentUserId))
                    if (readOnly) {
                      return (
                        <div key={a.key} className="grid gap-1 border border-stone-300 bg-white p-2 text-sm sm:grid-cols-[2rem_1fr_auto] sm:items-start sm:gap-3">
                          <span className="font-semibold text-stone-500">{idx + 1}.</span>
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-medium text-stone-900">{a.action}</p>
                            <p className="text-xs text-stone-600">
                              Owner {a.ownerName || '—'} · Due {a.dueOn ? formatDate(a.dueOn) : '—'}
                              {a.closedOn ? ` · Closed ${formatDate(a.closedOn)}` : ''}
                              {a.capaRef ? ` · CAPA ${a.capaRef}` : ''}
                            </p>
                            {a.closureEvidence ? <p className="text-xs text-stone-700">Evidence: {a.closureEvidence}</p> : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('border px-2 py-0.5 text-[11px] font-semibold', actionStatusClass(st))}>{actionStatusLabel(st)}</span>
                            {canFollowUp ? (
                              <Button type="button" variant="outline" size="sm" className={cn(limsOutlineBtnClass, 'h-7 text-xs')} onClick={() => setFollowUp(a)}>
                                Follow up
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={a.key} className="space-y-2 border border-stone-300 bg-white p-2">
                        <div className="flex items-start gap-2">
                          <span className="pt-1.5 text-sm font-semibold text-stone-500">{idx + 1}.</span>
                          <Textarea
                            rows={2}
                            className="min-h-[52px] border-stone-500 text-sm"
                            value={a.action}
                            placeholder="Action to be taken"
                            aria-label={`Action ${idx + 1}`}
                            onChange={(e) => setAction(a.key, { action: e.target.value })}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-red-700"
                            aria-label={`Remove action ${idx + 1}`}
                            onClick={() => patch({ actions: form.actions.filter((x) => x.key !== a.key) })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <select
                            className={cn(limsFieldClass, 'w-full px-2 text-sm lg:col-span-2')}
                            value={a.ownerUserId}
                            aria-label="Owner"
                            onChange={(e) => {
                              const u = userById.get(e.target.value)
                              setAction(a.key, { ownerUserId: e.target.value, ownerName: u?.name ?? a.ownerName })
                            }}
                          >
                            <option value="">{a.ownerName && !a.ownerUserId ? a.ownerName : 'Owner…'}</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                          <Input
                            type="date"
                            className={limsFieldClass}
                            value={a.dueOn}
                            aria-label="Due date"
                            onChange={(e) => setAction(a.key, { dueOn: e.target.value })}
                          />
                          <select
                            className={cn(limsFieldClass, 'w-full px-2 text-sm')}
                            value={a.status}
                            aria-label="Status"
                            onChange={(e) => setAction(a.key, { status: e.target.value as MrmActionStatus })}
                          >
                            <option value="open">Open</option>
                            <option value="overdue">Overdue</option>
                            <option value="done">Done</option>
                          </select>
                          <Input
                            className={limsFieldClass}
                            value={a.capaRef}
                            placeholder="CAPA ref"
                            aria-label="CAPA reference"
                            onChange={(e) => setAction(a.key, { capaRef: e.target.value })}
                          />
                        </div>
                        {a.status === 'done' || a.closureEvidence ? (
                          <Input
                            className={limsFieldClass}
                            value={a.closureEvidence}
                            placeholder="Closure evidence (required when done)"
                            aria-label="Closure evidence"
                            onChange={(e) => setAction(a.key, { closureEvidence: e.target.value })}
                          />
                        ) : null}
                        {st === 'overdue' ? <p className="text-xs font-semibold text-red-700">Overdue</p> : null}
                      </div>
                    )
                  })}
                </div>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(limsOutlineBtnClass, 'gap-1')}
                    onClick={() => patch({ actions: [...form.actions, emptyAction(meeting.id)] })}
                  >
                    <Plus className="h-4 w-4" /> Add action
                  </Button>
                ) : null}
              </section>

              {/* Closing remarks */}
              <section className="space-y-2">
                <h2 className={sectionTitle}>Closing remarks</h2>
                <Textarea
                  rows={3}
                  className="border-stone-500 text-sm"
                  value={form.closingRemarks}
                  disabled={readOnly}
                  aria-label="Closing remarks"
                  onChange={(e) => patch({ closingRemarks: e.target.value })}
                />
                {meeting.minutesCirculatedAt ? (
                  <p className="text-xs text-stone-600">Minutes circulated {formatDateTime(meeting.minutesCirculatedAt)}.</p>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 sm:px-5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isDirector && meeting.status === 'draft' ? (
              <Button type="button" className={cn(limsDeleteBtnClass, 'mr-auto')} onClick={() => void handleDelete()} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Delete draft
              </Button>
            ) : null}
            <Button type="button" variant="outline" className={cn(limsDarkBarBtnClass, 'gap-1.5')} onClick={handlePrint} disabled={!form}>
              <Printer className="h-4 w-4" /> Print minutes
            </Button>
            {!readOnly ? (
              <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={() => void handleSave()} disabled={busy || !form}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            ) : null}
            {isDirector && meeting.status === 'draft' ? (
              <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={() => askSign('circulate')} disabled={busy || !form}>
                <Send className="h-4 w-4" /> Circulate minutes
              </Button>
            ) : null}
            {isDirector && meeting.status === 'minutes_circulated' ? (
              <>
                <Button type="button" variant="outline" className={cn(limsDarkBarBtnClass, 'gap-1.5')} onClick={() => void handleBackToDraft()} disabled={busy}>
                  <Undo2 className="h-4 w-4" /> Back to draft
                </Button>
                <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5 bg-emerald-700 hover:bg-emerald-800')} onClick={() => askSign('close')} disabled={busy || !form}>
                  <CheckCircle2 className="h-4 w-4" /> Close meeting
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <ConfirmLoginPasswordDialog
          open={pendingSign !== null}
          onOpenChange={(open) => {
            if (!open) setPendingSign(null)
          }}
          title={pendingSign === 'close' ? 'Close management review' : 'Circulate minutes'}
          confirmLabel={pendingSign === 'close' ? 'Close meeting' : 'Circulate'}
          statement={
            pendingSign === 'close'
              ? 'I approve these management review minutes and close the meeting. The minutes become read-only.'
              : 'I release these management review minutes for circulation to the attendees.'
          }
          onConfirmed={({ reauthenticatedAt }) => {
            const kind = pendingSign
            setPendingSign(null)
            if (kind) void handleSigned(kind, reauthenticatedAt)
          }}
        >
          <p className="text-sm text-stone-700">
            Meeting <b>{meeting.meetingNo}</b> held {formatDate(meeting.heldOn)}
          </p>
        </ConfirmLoginPasswordDialog>

        {followUp ? (
          <MrmActionFollowUpDialog
            key={followUp.id}
            action={followUp}
            meetingNo={meeting.meetingNo}
            onOpenChange={(open) => {
              if (!open) setFollowUp(null)
            }}
            onSaved={() => {
              void reload()
              void onChanged()
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
