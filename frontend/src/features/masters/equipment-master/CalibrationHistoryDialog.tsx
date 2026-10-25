import { useEffect, useState } from 'react'
import { FileText, History, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabaseClient'
import { recordReason } from '@/lib/auditReason'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { calculateNextDueDate, type EquipmentRow, type Frequency } from './types'

/** Row of public.equipment_calibration_history (ISO 17025 6.4 certificate review). */
type CalibrationHistoryRow = {
  id: string
  equipment_id: string
  certificate_no: string
  calibrated_on: string
  due_on: string | null
  agency: string | null
  agency_id: string | null
  agency_nabl_accredited: boolean | null
  agency_scope_ok: boolean | null
  uncertainty: string | null
  uncertainty_unit: string | null
  coverage_factor: string | null
  errors_within_acceptance: boolean | null
  corrections_applied: string | null
  certificate_path: string | null
  accepted: boolean
  reviewed_by_name: string | null
  reviewed_at: string | null
  remarks: string | null
  created_at: string
}

type YesNo = '' | 'yes' | 'no'

type CertForm = {
  certificateNo: string
  calibratedOn: string
  dueOn: string
  agencyId: string
  agencyText: string
  nabl: YesNo
  scopeOk: YesNo
  uncertainty: string
  uncertaintyUnit: string
  coverageFactor: string
  errorsOk: YesNo
  corrections: string
  decision: '' | 'accept' | 'reject'
  remarks: string
  file: File | null
}

const emptyCertForm = (): CertForm => ({
  certificateNo: '',
  calibratedOn: '',
  dueOn: '',
  agencyId: '',
  agencyText: '',
  nabl: '',
  scopeOk: '',
  uncertainty: '',
  uncertaintyUnit: '',
  coverageFactor: '',
  errorsOk: '',
  corrections: '',
  decision: '',
  remarks: '',
  file: null,
})

const yesNo = (v: YesNo): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null)
const showBool = (v: boolean | null) => (v === true ? 'Yes' : v === false ? 'No' : '—')

const isMissingTable = (err: unknown) => {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes('equipment_calibration_history') && (msg.includes('does not exist') || msg.includes('schema cache'))
}

const fieldClass = cn(limsFieldClass, 'h-9 w-full rounded-none px-2.5 text-sm')
const labelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'

function YesNoSelect({ id, value, onChange }: { id: string; value: YesNo; onChange: (v: YesNo) => void }) {
  return (
    <select id={id} className={fieldClass} value={value} onChange={(e) => onChange(e.target.value as YesNo)}>
      <option value="">Select…</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )
}

/**
 * ISO/IEC 17025 6.4.8–6.4.13: every calibration certificate received for an
 * equipment, its review (agency accreditation / scope, uncertainty, errors
 * within acceptance, corrections) and the accept / reject decision. Rows are
 * append-only. Accepting a certificate updates the equipment's current
 * calibration fields; each certificate file is kept at its own storage path.
 */
export function CalibrationHistoryDialog({
  open,
  onOpenChange,
  equipment,
  clients,
  uploadCertificate,
  onViewFile,
  onEquipmentUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment: EquipmentRow | null
  clients: Array<{ id: string; company_name: string }>
  /** Uploads to the equipment-files bucket at a new path; returns the storage path. */
  uploadCertificate: (equipmentId: string, file: File) => Promise<string>
  onViewFile: (path: string, fileName: string) => void
  onEquipmentUpdated: () => void | Promise<void>
}) {
  const [rows, setRows] = useState<CalibrationHistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<CertForm>(() => emptyCertForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
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
        return supabase
          .from('equipment_calibration_history')
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('calibrated_on', { ascending: false })
          .order('created_at', { ascending: false })
      })
      .then((res) => {
        if (cancelled || !res) return
        if (res.error) {
          if (isMissingTable(res.error)) {
            setMissing(true)
            setRows([])
            return
          }
          throw res.error
        }
        setMissing(false)
        setRows((res.data ?? []) as CalibrationHistoryRow[])
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Load failed')
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
      setForm(emptyCertForm())
      setFormError(null)
    }
    onOpenChange(next)
  }

  const set = <K extends keyof CertForm>(key: K, value: CertForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const startNew = () => {
    const f = emptyCertForm()
    f.agencyId = equipment?.external_calibration_agency ?? ''
    f.uncertaintyUnit = equipment?.calibration_uncertainty_unit ?? ''
    f.coverageFactor = equipment?.calibration_coverage_factor ?? ''
    setForm(f)
    setFormError(null)
    setFormOpen(true)
  }

  const onCalibratedOnChange = (value: string) => {
    setForm((prev) => {
      const computed = value
        ? calculateNextDueDate(value, (equipment?.calibration_frequency ?? '') as Frequency)
        : ''
      return { ...prev, calibratedOn: value, dueOn: prev.dueOn && prev.dueOn !== '' ? prev.dueOn : computed }
    })
  }

  const save = async () => {
    if (!equipment) return
    setFormError(null)
    const certNo = form.certificateNo.trim()
    if (!certNo) return setFormError('Certificate number is required.')
    if (!form.calibratedOn) return setFormError('Calibration date is required.')
    if (form.dueOn && form.dueOn < form.calibratedOn) return setFormError('Due date cannot be before the calibration date.')
    if (!form.decision) return setFormError('Accept or reject the certificate.')
    if (form.decision === 'accept') {
      if (!form.nabl || !form.scopeOk || !form.errorsOk) {
        return setFormError('Answer the review checks (agency accreditation, scope, errors within acceptance) before accepting.')
      }
      if (form.errorsOk === 'no') {
        return setFormError('Errors are outside acceptance: reject the certificate (or record the corrections and re-assess).')
      }
      if (!form.dueOn) return setFormError('Next due date is required when accepting.')
    }
    if (form.decision === 'reject' && !form.remarks.trim()) {
      return setFormError('Give the reason for rejecting in Remarks.')
    }

    setSaving(true)
    try {
      const certPath = form.file ? await uploadCertificate(equipment.id, form.file) : null
      const agencyName =
        clients.find((c) => c.id === form.agencyId)?.company_name ?? form.agencyText.trim()
      const accepted = form.decision === 'accept'
      const { error } = await supabase.from('equipment_calibration_history').insert({
        equipment_id: equipment.id,
        certificate_no: certNo,
        calibrated_on: form.calibratedOn,
        due_on: form.dueOn || null,
        agency: agencyName || null,
        agency_id: form.agencyId || null,
        agency_nabl_accredited: yesNo(form.nabl),
        agency_scope_ok: yesNo(form.scopeOk),
        uncertainty: form.uncertainty.trim() || null,
        uncertainty_unit: form.uncertaintyUnit.trim() || null,
        coverage_factor: form.coverageFactor.trim() || null,
        errors_within_acceptance: yesNo(form.errorsOk),
        corrections_applied: form.corrections.trim() || null,
        certificate_path: certPath,
        accepted,
        remarks: form.remarks.trim() || null,
      })
      if (error) throw error

      if (accepted) {
        const patch: Record<string, string | null> = {
          last_calibration_date: form.calibratedOn,
          next_calibration_due: form.dueOn || null,
          calibration_certificate_number: certNo,
          calibration_certificate_uncertainty: form.uncertainty.trim() || null,
          calibration_uncertainty_unit: form.uncertaintyUnit.trim() || null,
          calibration_coverage_factor: form.coverageFactor.trim() || null,
        }
        if (form.agencyId) patch.external_calibration_agency = form.agencyId
        if (certPath) patch.upload_certificate_path = certPath
        const { error: updErr } = await supabase.from('equipment_master').update(patch).eq('id', equipment.id)
        if (updErr) throw updErr
        await recordReason(
          'equipment_master',
          equipment.id,
          `Calibration certificate ${certNo} reviewed and accepted (calibration history)`,
        )
        await onEquipmentUpdated()
      }

      setFormOpen(false)
      setForm(emptyCertForm())
      setReloadKey((k) => k + 1)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const title = [equipment?.asset_code, equipment?.equipment_name].filter(Boolean).join(' · ')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        persistOnFocusLoss
        className={cn(limsDialogClass, '!flex !max-h-[92dvh] !max-w-5xl !flex-col !gap-0 !p-0')}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-8 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <History size={16} aria-hidden />
              Calibration history
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-300">{title || '—'}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          {missing ? (
            <p className="rounded-none border-2 border-amber-700/40 bg-[#fff7ed] px-3 py-3 text-sm text-amber-950">
              Calibration history needs the database update for equipment traceability (20261026100100).
              Until it is applied, keep using the certificate fields in Edit Equipment.
            </p>
          ) : null}
          {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}

          {!missing ? (
            <div className="overflow-x-auto border-2 border-stone-500 bg-white">
              <table className="w-full min-w-[860px] border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-800">
                    {['Calibrated on', 'Due on', 'Certificate', 'Agency', 'NABL / Scope', 'U (k)', 'Errors OK', 'Decision', 'Reviewed', 'File'].map((h) => (
                      <th key={h} className={cn(limsTableHeadClass, 'border-r border-stone-700 !p-2 text-left last:border-r-0')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-stone-600">Loading…</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-stone-600">
                        No certificates recorded yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">{formatDate(r.calibrated_on)}</td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">{r.due_on ? formatDate(r.due_on) : '—'}</td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5 font-semibold">{r.certificate_no}</td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">{r.agency || '—'}</td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                          {showBool(r.agency_nabl_accredited)} / {showBool(r.agency_scope_ok)}
                        </td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                          {r.uncertainty ? `${r.uncertainty}${r.uncertainty_unit ? ` ${r.uncertainty_unit}` : ''}` : '—'}
                          {r.coverage_factor ? ` (k=${r.coverage_factor})` : ''}
                        </td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                          {showBool(r.errors_within_acceptance)}
                          {r.corrections_applied ? (
                            <span className="block text-[11px] text-stone-600">Corr.: {r.corrections_applied}</span>
                          ) : null}
                        </td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                          <span className={cn('font-semibold', r.accepted ? 'text-emerald-800' : 'text-red-700')}>
                            {r.accepted ? 'Accepted' : 'Rejected'}
                          </span>
                          {r.remarks ? <span className="block text-[11px] text-stone-600">{r.remarks}</span> : null}
                        </td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                          {r.reviewed_by_name || '—'}
                          {r.reviewed_at ? (
                            <span className="block text-[11px] text-stone-600">{formatDate(r.reviewed_at)}</span>
                          ) : null}
                        </td>
                        <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                          {r.certificate_path ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 rounded-none text-amber-800"
                              aria-label={`View certificate ${r.certificate_no}`}
                              onClick={() => onViewFile(r.certificate_path as string, r.certificate_no)}
                            >
                              <FileText size={14} />
                            </Button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {!missing && !formOpen ? (
            <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={startNew} disabled={!equipment}>
              <Plus size={14} />
              Record new calibration certificate
            </Button>
          ) : null}

          {!missing && formOpen ? (
            <div className="space-y-3 border-2 border-stone-500 bg-white p-4">
              <p className="text-sm font-semibold text-stone-900">New calibration certificate — review and acceptance</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="ch-cert" className={labelClass}>Certificate no. *</Label>
                  <Input id="ch-cert" className={fieldClass} value={form.certificateNo} onChange={(e) => set('certificateNo', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-cal" className={labelClass}>Calibrated on *</Label>
                  <Input id="ch-cal" type="date" className={fieldClass} value={form.calibratedOn} onChange={(e) => onCalibratedOnChange(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-due" className={labelClass}>Next due</Label>
                  <Input id="ch-due" type="date" className={fieldClass} value={form.dueOn} onChange={(e) => set('dueOn', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-agency" className={labelClass}>Calibration agency</Label>
                  <select id="ch-agency" className={fieldClass} value={form.agencyId} onChange={(e) => set('agencyId', e.target.value)}>
                    <option value="">Other (type below)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                  {!form.agencyId ? (
                    <Input className={cn(fieldClass, 'mt-1')} placeholder="Agency name" value={form.agencyText} onChange={(e) => set('agencyText', e.target.value)} />
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-nabl" className={labelClass}>Agency accredited (NABL / ILAC MRA)?</Label>
                  <YesNoSelect id="ch-nabl" value={form.nabl} onChange={(v) => set('nabl', v)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-scope" className={labelClass}>Within agency's accredited scope?</Label>
                  <YesNoSelect id="ch-scope" value={form.scopeOk} onChange={(v) => set('scopeOk', v)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-u" className={labelClass}>Uncertainty (U)</Label>
                  <div className="flex gap-2">
                    <Input id="ch-u" className={fieldClass} value={form.uncertainty} onChange={(e) => set('uncertainty', e.target.value)} />
                    <Input aria-label="Uncertainty unit" placeholder="Unit" className={cn(fieldClass, 'max-w-[6rem]')} value={form.uncertaintyUnit} onChange={(e) => set('uncertaintyUnit', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-k" className={labelClass}>Coverage factor (k)</Label>
                  <Input id="ch-k" className={fieldClass} value={form.coverageFactor} onChange={(e) => set('coverageFactor', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-err" className={labelClass}>Errors within acceptance criteria?</Label>
                  <YesNoSelect id="ch-err" value={form.errorsOk} onChange={(v) => set('errorsOk', v)} />
                  {equipment?.accuracy_acceptance_criteria ? (
                    <p className="text-[11px] text-stone-600">Criteria: {equipment.accuracy_acceptance_criteria}</p>
                  ) : null}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="ch-corr" className={labelClass}>Corrections / correction factors applied (6.4.11)</Label>
                  <Textarea id="ch-corr" rows={2} className="rounded-none border-stone-500 bg-stone-50 text-sm" value={form.corrections} onChange={(e) => set('corrections', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-file" className={labelClass}>Certificate file</Label>
                  <Input id="ch-file" type="file" accept=".pdf,image/*" className={fieldClass} onChange={(e) => set('file', e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-dec" className={labelClass}>Decision *</Label>
                  <select id="ch-dec" className={fieldClass} value={form.decision} onChange={(e) => set('decision', e.target.value as CertForm['decision'])}>
                    <option value="">Select…</option>
                    <option value="accept">Accept — update equipment calibration</option>
                    <option value="reject">Reject — keep current calibration</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="ch-rem" className={labelClass}>Remarks{form.decision === 'reject' ? ' *' : ''}</Label>
                  <Textarea id="ch-rem" rows={2} className="rounded-none border-stone-500 bg-stone-50 text-sm" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
                </div>
              </div>
              {form.decision === 'accept' && (form.nabl === 'no' || form.scopeOk === 'no') ? (
                <p className="text-[12px] text-amber-800">
                  Agency not accredited or outside scope: make sure metrological traceability is
                  demonstrated another way (ISO 17025 6.5) and say how in Remarks.
                </p>
              ) : null}
              {formError ? <p className="text-sm text-red-700" role="alert">{formError}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => setFormOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save certificate'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
