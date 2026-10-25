import { Fragment, useEffect, useState } from 'react'
import { BadgeCheck, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { EquipmentRow } from './types'
import {
  ACCEPTANCE_STATE_UI,
  authorizeErrorText,
  DEFAULT_ACCEPTANCE_CHECKS,
  isMissingTableError,
  type AcceptanceCheck,
  type AcceptanceRecord,
  type AcceptanceResult,
} from './equipmentAcceptance'

type CertOption = { id: string; label: string }

type AccForm = {
  acceptedOn: string
  checks: AcceptanceCheck[]
  initialCalibrationRef: string
  initialCalibrationId: string
  result: '' | AcceptanceResult
  conditions: string
  remarks: string
}

const todayIso = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const fieldClass = cn(limsFieldClass, 'h-9 w-full rounded-none px-2.5 text-sm')
const labelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'

const okText = (v: boolean | null) => (v === true ? 'OK' : v === false ? 'Not OK' : 'N/A')

function checksSummary(checks: AcceptanceCheck[] | null): string {
  const list = Array.isArray(checks) ? checks : []
  if (!list.length) return '—'
  const ok = list.filter((c) => c.ok === true).length
  const bad = list.filter((c) => c.ok === false).length
  return `${ok} OK${bad ? `, ${bad} not OK` : ''} of ${list.length}`
}

/**
 * ISO/IEC 17025 6.4.1 - 6.4.4: acceptance / commissioning of an equipment
 * before it is placed in service. Records are append-only; a later record
 * supersedes an earlier one (e.g. a rejection after a failed re-check).
 */
export function EquipmentAcceptanceDialog({
  open,
  onOpenChange,
  equipment,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment: EquipmentRow | null
  onSaved: () => void | Promise<void>
}) {
  const [records, setRecords] = useState<AcceptanceRecord[]>([])
  const [certs, setCerts] = useState<CertOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<AccForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const equipmentId = equipment?.id ?? null

  useEffect(() => {
    if (!open || !equipmentId) return
    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setLoading(true)
        setLoadError(null)
        return Promise.all([
          supabase
            .from('equipment_acceptance')
            .select('*')
            .eq('equipment_id', equipmentId)
            .order('accepted_on', { ascending: false })
            .order('created_at', { ascending: false }),
          supabase
            .from('equipment_calibration_history')
            .select('id, certificate_no, calibrated_on, accepted')
            .eq('equipment_id', equipmentId)
            .order('calibrated_on', { ascending: false }),
        ])
      })
      .then((res) => {
        if (cancelled || !res) return
        const [acc, cal] = res
        if (acc.error) {
          if (isMissingTableError(acc.error, 'equipment_acceptance')) {
            setMissing(true)
            setRecords([])
            return
          }
          throw acc.error
        }
        setMissing(false)
        setRecords((acc.data ?? []) as AcceptanceRecord[])
        // Calibration history is optional (20261026100100).
        setCerts(
          cal.error
            ? []
            : ((cal.data ?? []) as Array<{ id: string; certificate_no: string; calibrated_on: string; accepted: boolean }>)
                .filter((c) => c.accepted)
                .map((c) => ({ id: c.id, label: `${c.certificate_no} (${formatDate(c.calibrated_on)})` })),
        )
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError((err as { message?: string })?.message ?? 'Load failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, equipmentId, reloadKey])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFormOpen(false)
      setForm(null)
      setFormError(null)
      setExpanded(null)
    }
    onOpenChange(next)
  }

  const startNew = () => {
    setForm({
      acceptedOn: todayIso(),
      checks: DEFAULT_ACCEPTANCE_CHECKS.map((c) => ({ ...c })),
      initialCalibrationRef: equipment?.calibration_certificate_number ?? '',
      initialCalibrationId: '',
      result: '',
      conditions: '',
      remarks: '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const set = <K extends keyof AccForm>(key: K, value: AccForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const setCheck = (i: number, patch: Partial<AcceptanceCheck>) =>
    setForm((prev) => (prev ? { ...prev, checks: prev.checks.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : prev))

  const save = async () => {
    if (!equipment || !form) return
    setFormError(null)
    const checks = form.checks
      .map((c) => ({ ...c, item: c.item.trim(), expected: c.expected.trim(), observed: c.observed.trim() }))
      .filter((c) => c.item)
    if (!form.acceptedOn) return setFormError('Enter the acceptance date.')
    if (form.acceptedOn > todayIso()) return setFormError('The acceptance date cannot be in the future.')
    if (!form.result) return setFormError('Select the result.')
    if (form.result !== 'rejected') {
      if (!checks.length) return setFormError('Record the checks carried out.')
      if (form.result === 'accepted' && checks.some((c) => c.ok === false)) {
        return setFormError('A check is "Not OK": reject, or accept with conditions and state them.')
      }
      if (!form.initialCalibrationRef.trim() && !form.initialCalibrationId) {
        return setFormError('Give the initial calibration / verification reference (or "N/A — not a measuring instrument").')
      }
    }
    if (form.result === 'conditional' && !form.conditions.trim()) return setFormError('State the conditions of use.')
    if (form.result === 'rejected' && !form.remarks.trim()) return setFormError('Give the reason for rejecting in Remarks.')

    setSaving(true)
    try {
      const certLabel = certs.find((c) => c.id === form.initialCalibrationId)?.label ?? ''
      const { error } = await supabase.from('equipment_acceptance').insert({
        equipment_id: equipment.id,
        accepted_on: form.acceptedOn,
        checks,
        initial_calibration_ref: form.initialCalibrationRef.trim() || certLabel || null,
        initial_calibration_id: form.initialCalibrationId || null,
        result: form.result,
        conditions: form.conditions.trim() || null,
        remarks: form.remarks.trim() || null,
      })
      if (error) throw error
      setFormOpen(false)
      setForm(null)
      setReloadKey((k) => k + 1)
      await onSaved()
    } catch (err) {
      setFormError(authorizeErrorText(err, 'record equipment acceptance'))
    } finally {
      setSaving(false)
    }
  }

  const title = [equipment?.asset_code, equipment?.equipment_name].filter(Boolean).join(' · ')
  const latest = records[0]
  const state = latest ? latest.result : equipment?.acceptance_required ? 'pending' : 'legacy'
  const ui = ACCEPTANCE_STATE_UI[state]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent persistOnFocusLoss className={cn(limsDialogClass, '!flex !max-h-[92dvh] !max-w-5xl !flex-col !gap-0 !p-0')}>
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-8 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <BadgeCheck size={16} aria-hidden />
              Acceptance / commissioning (6.4.1 – 6.4.4)
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-300">{title || '—'}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          {missing ? (
            <p className="rounded-none border-2 border-amber-700/40 bg-[#fff7ed] px-3 py-3 text-sm text-amber-950">
              Acceptance records need database update 20261028100200. Until it is applied, record acceptance in the equipment file.
            </p>
          ) : null}
          {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}

          {!missing ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={cn('inline-flex items-center border px-2 py-0.5 text-[11px] font-bold', ui.className)} title={ui.title}>
                {ui.text}
              </span>
              <span className="text-[12px] text-stone-700">
                {latest
                  ? `Latest record ${formatDate(latest.accepted_on)} by ${latest.accepted_by_name || '—'}`
                  : equipment?.acceptance_required
                    ? 'This equipment is not usable for results until it is accepted.'
                    : 'Registered before acceptance records were kept; a record can still be added.'}
              </span>
            </div>
          ) : null}

          {!missing ? (
            <div className="overflow-x-auto border-2 border-stone-500 bg-white">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-800">
                    {['Date', 'Result', 'Checks', 'Initial calibration', 'Conditions / remarks', 'By'].map((h) => (
                      <th key={h} className={cn(limsTableHeadClass, 'border-r border-stone-700 !p-2 text-left last:border-r-0')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-stone-600">Loading…</td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-stone-600">No acceptance record yet.</td>
                    </tr>
                  ) : (
                    records.map((r, i) => {
                      const rUi = ACCEPTANCE_STATE_UI[r.result]
                      const list = Array.isArray(r.checks) ? r.checks : []
                      return (
                        <Fragment key={r.id}>
                          <tr className={i % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                            <td className="border-b border-[#e7e0d4] px-2 py-1.5">{formatDate(r.accepted_on)}</td>
                            <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                              <span className={cn('inline-flex border px-1.5 py-0.5 text-[11px] font-bold', rUi.className)}>{rUi.text}</span>
                            </td>
                            <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                              {list.length ? (
                                <button
                                  type="button"
                                  className="text-amber-800 underline-offset-2 hover:underline"
                                  onClick={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                                  aria-expanded={expanded === r.id}
                                >
                                  {checksSummary(list)}
                                </button>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="border-b border-[#e7e0d4] px-2 py-1.5">{r.initial_calibration_ref || '—'}</td>
                            <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                              {r.conditions ? <span className="block">Conditions: {r.conditions}</span> : null}
                              {r.remarks ? <span className="block text-stone-600">{r.remarks}</span> : null}
                              {!r.conditions && !r.remarks ? '—' : null}
                            </td>
                            <td className="border-b border-[#e7e0d4] px-2 py-1.5">{r.accepted_by_name || '—'}</td>
                          </tr>
                          {expanded === r.id ? (
                            <tr className="bg-white">
                              <td colSpan={6} className="border-b border-[#e7e0d4] px-3 py-2">
                                <ul className="space-y-0.5">
                                  {list.map((c, j) => (
                                    <li key={j} className="flex flex-wrap gap-x-2">
                                      <span className={cn('w-14 font-semibold', c.ok === false ? 'text-red-700' : c.ok ? 'text-emerald-800' : 'text-stone-500')}>
                                        {okText(c.ok)}
                                      </span>
                                      <span className="font-medium">{c.item}</span>
                                      {c.observed ? <span className="text-stone-600">— {c.observed}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {!missing && !formOpen ? (
            <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={startNew} disabled={!equipment || loading}>
              <Plus size={14} />
              {latest ? 'Record new acceptance / re-commissioning' : 'Accept / commission'}
            </Button>
          ) : null}

          {!missing && formOpen && form ? (
            <div className="space-y-3 border-2 border-stone-500 bg-white p-4">
              <p className="text-sm font-semibold text-stone-900">Acceptance / commissioning record</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-800">
                      {['Check', 'Expected', 'Observed', 'Result', ''].map((h) => (
                        <th key={h} className={cn(limsTableHeadClass, '!p-2 text-left')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.checks.map((c, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                        <td className="p-1">
                          <Input aria-label={`Check ${i + 1}`} className={fieldClass} value={c.item} onChange={(e) => setCheck(i, { item: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <Input aria-label={`Expected ${i + 1}`} className={fieldClass} value={c.expected} onChange={(e) => setCheck(i, { expected: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <Input aria-label={`Observed ${i + 1}`} className={fieldClass} value={c.observed} onChange={(e) => setCheck(i, { observed: e.target.value })} />
                        </td>
                        <td className="w-28 p-1">
                          <select
                            aria-label={`Result of check ${i + 1}`}
                            className={fieldClass}
                            value={c.ok === true ? 'ok' : c.ok === false ? 'no' : ''}
                            onChange={(e) => setCheck(i, { ok: e.target.value === 'ok' ? true : e.target.value === 'no' ? false : null })}
                          >
                            <option value="">N/A</option>
                            <option value="ok">OK</option>
                            <option value="no">Not OK</option>
                          </select>
                        </td>
                        <td className="w-10 p-1 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-none text-stone-600"
                            aria-label={`Remove check ${i + 1}`}
                            onClick={() => set('checks', form.checks.filter((_, j) => j !== i))}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'gap-1')}
                onClick={() => set('checks', [...form.checks, { item: '', expected: '', observed: '', ok: null }])}
              >
                <Plus size={13} /> Add check
              </Button>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="acc-date" className={labelClass}>Accepted on *</Label>
                  <Input id="acc-date" type="date" className={fieldClass} value={form.acceptedOn} max={todayIso()} onChange={(e) => set('acceptedOn', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="acc-cal" className={labelClass}>Initial calibration / verification ref.</Label>
                  {certs.length ? (
                    <select
                      id="acc-cal-pick"
                      aria-label="Pick from calibration history"
                      className={cn(fieldClass, 'mb-1')}
                      value={form.initialCalibrationId}
                      onChange={(e) => set('initialCalibrationId', e.target.value)}
                    >
                      <option value="">Pick from calibration history (optional)</option>
                      {certs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Input
                    id="acc-cal"
                    className={fieldClass}
                    placeholder="Certificate no. or N/A"
                    value={form.initialCalibrationRef}
                    onChange={(e) => set('initialCalibrationRef', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="acc-result" className={labelClass}>Result *</Label>
                  <select id="acc-result" className={fieldClass} value={form.result} onChange={(e) => set('result', e.target.value as AccForm['result'])}>
                    <option value="">Select…</option>
                    <option value="accepted">Accepted — place in service</option>
                    <option value="conditional">Accepted with conditions</option>
                    <option value="rejected">Rejected — do not use</option>
                  </select>
                </div>
                {form.result === 'conditional' ? (
                  <div className="space-y-1 sm:col-span-3">
                    <Label htmlFor="acc-cond" className={labelClass}>Conditions of use *</Label>
                    <Textarea id="acc-cond" rows={2} className="rounded-none border-stone-500 bg-stone-50 text-sm" value={form.conditions} onChange={(e) => set('conditions', e.target.value)} />
                  </div>
                ) : null}
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="acc-rem" className={labelClass}>Remarks{form.result === 'rejected' ? ' *' : ''}</Label>
                  <Textarea id="acc-rem" rows={2} className="rounded-none border-stone-500 bg-stone-50 text-sm" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
                </div>
              </div>
              <p className="text-[12px] text-stone-600">
                Recorded as you, with the date and time. Records cannot be edited afterwards; add a new record to change the decision.
              </p>
              {formError ? <p className="text-sm text-red-700" role="alert">{formError}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => setFormOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save acceptance record'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
