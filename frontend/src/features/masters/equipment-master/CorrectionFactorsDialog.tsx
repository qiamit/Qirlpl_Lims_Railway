import { useEffect, useState } from 'react'
import { Pencil, Plus, Ruler, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { authorizeErrorText, isMissingTableError } from './equipmentAcceptance'

type FactorRow = {
  id: string
  equipment_id: string
  quantity: string
  range_from: number | null
  range_to: number | null
  correction: number
  unit: string | null
  source_certificate: string | null
  effective_from: string
  effective_to: string | null
  remarks: string | null
}

type FactorForm = {
  id: string | null
  quantity: string
  rangeFrom: string
  rangeTo: string
  correction: string
  unit: string
  sourceCertificate: string
  effectiveFrom: string
  effectiveTo: string
  remarks: string
}

const todayIso = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const fieldClass = cn(limsFieldClass, 'h-9 w-full rounded-none px-2.5 text-sm')
const labelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'

const numOrNull = (v: string): number | null => {
  const t = v.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

function rangeText(r: FactorRow): string {
  if (r.range_from === null && r.range_to === null) return 'Whole range'
  if (r.range_from !== null && r.range_to !== null) {
    return r.range_from === r.range_to ? `at ${r.range_from}` : `${r.range_from} to ${r.range_to}`
  }
  return r.range_from !== null ? `≥ ${r.range_from}` : `≤ ${r.range_to}`
}

function isCurrent(r: FactorRow, today: string): boolean {
  return r.effective_from <= today && (!r.effective_to || r.effective_to >= today)
}

/**
 * ISO/IEC 17025 6.4.11: correction factors per quantity and range, from the
 * calibration certificate, with the period they apply to. A replaced factor
 * is ended (effective_to) rather than overwritten so earlier results can be
 * traced to the correction that applied then.
 */
export function CorrectionFactorsDialog({
  open,
  onOpenChange,
  equipment,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment: EquipmentRow | null
}) {
  const [rows, setRows] = useState<FactorRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState<FactorForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showEnded, setShowEnded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const equipmentId = equipment?.id ?? null
  const today = todayIso()

  useEffect(() => {
    if (!open || !equipmentId) return
    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setLoading(true)
        setLoadError(null)
        return supabase
          .from('equipment_correction_factors')
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('quantity')
          .order('range_from', { ascending: true, nullsFirst: true })
          .order('effective_from', { ascending: false })
      })
      .then((res) => {
        if (cancelled || !res) return
        if (res.error) {
          if (isMissingTableError(res.error, 'equipment_correction_factors')) {
            setMissing(true)
            setRows([])
            return
          }
          throw res.error
        }
        setMissing(false)
        setRows((res.data ?? []) as FactorRow[])
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
      setForm(null)
      setFormError(null)
    }
    onOpenChange(next)
  }

  const set = <K extends keyof FactorForm>(key: K, value: FactorForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const startNew = () => {
    setFormError(null)
    setForm({
      id: null,
      quantity: '',
      rangeFrom: '',
      rangeTo: '',
      correction: '',
      unit: '',
      sourceCertificate: equipment?.calibration_certificate_number ?? '',
      effectiveFrom: equipment?.last_calibration_date || today,
      effectiveTo: '',
      remarks: '',
    })
  }

  const startEdit = (r: FactorRow) => {
    setFormError(null)
    setForm({
      id: r.id,
      quantity: r.quantity,
      rangeFrom: r.range_from === null ? '' : String(r.range_from),
      rangeTo: r.range_to === null ? '' : String(r.range_to),
      correction: String(r.correction),
      unit: r.unit ?? '',
      sourceCertificate: r.source_certificate ?? '',
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to ?? '',
      remarks: r.remarks ?? '',
    })
  }

  const save = async () => {
    if (!equipment || !form) return
    setFormError(null)
    const from = numOrNull(form.rangeFrom)
    const to = numOrNull(form.rangeTo)
    const corr = numOrNull(form.correction)
    if (!form.quantity.trim()) return setFormError('Enter the quantity (e.g. Temperature, Mass, Force).')
    if (corr === null || Number.isNaN(corr)) return setFormError('Enter the correction as a number (e.g. -0.3).')
    if (Number.isNaN(from as number) || Number.isNaN(to as number)) return setFormError('Range limits must be numbers.')
    if (from !== null && to !== null && from > to) return setFormError('Range "from" is above "to".')
    if (!form.effectiveFrom) return setFormError('Enter the date the correction applies from.')
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) return setFormError('"Effective to" is before "effective from".')
    const payload = {
      equipment_id: equipment.id,
      quantity: form.quantity.trim(),
      range_from: from,
      range_to: to,
      correction: corr,
      unit: form.unit.trim() || null,
      source_certificate: form.sourceCertificate.trim() || null,
      effective_from: form.effectiveFrom,
      effective_to: form.effectiveTo || null,
      remarks: form.remarks.trim() || null,
    }
    setSaving(true)
    try {
      const { error } = form.id
        ? await supabase.from('equipment_correction_factors').update(payload).eq('id', form.id)
        : await supabase.from('equipment_correction_factors').insert(payload)
      if (error) throw error
      setForm(null)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setFormError(authorizeErrorText(err, 'maintain correction factors'))
    } finally {
      setSaving(false)
    }
  }

  const endFactor = async (r: FactorRow) => {
    if (!window.confirm(`End the ${r.quantity} correction (${rangeText(r)}) today?`)) return
    const end = today < r.effective_from ? r.effective_from : today
    const { error } = await supabase.from('equipment_correction_factors').update({ effective_to: end }).eq('id', r.id)
    if (error) setLoadError(authorizeErrorText(error, 'maintain correction factors'))
    else setReloadKey((k) => k + 1)
  }

  const removeFactor = async (r: FactorRow) => {
    if (!window.confirm(`Delete the ${r.quantity} correction (${rangeText(r)})? Use "End" instead when it was used for results.`)) return
    const { error } = await supabase.from('equipment_correction_factors').delete().eq('id', r.id)
    if (error) setLoadError(authorizeErrorText(error, 'maintain correction factors'))
    else setReloadKey((k) => k + 1)
  }

  const visible = showEnded ? rows : rows.filter((r) => !r.effective_to || r.effective_to >= today)
  const endedCount = rows.length - rows.filter((r) => !r.effective_to || r.effective_to >= today).length
  const title = [equipment?.asset_code, equipment?.equipment_name].filter(Boolean).join(' · ')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent persistOnFocusLoss className={cn(limsDialogClass, '!flex !max-h-[92dvh] !max-w-5xl !flex-col !gap-0 !p-0')}>
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-8 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <Ruler size={16} aria-hidden />
              Correction factors (6.4.11)
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-300">{title || '—'}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          {missing ? (
            <p className="rounded-none border-2 border-amber-700/40 bg-[#fff7ed] px-3 py-3 text-sm text-amber-950">
              Correction factors need database update 20261028100200. Until it is applied, record corrections in the calibration history.
            </p>
          ) : null}
          {loadError ? <p className="text-sm text-red-700" role="alert">{loadError}</p> : null}

          {!missing ? (
            <>
              <p className="text-[12px] text-stone-700">
                Corrected value = reading + correction. The narrowest range that contains the reading applies, for the period it is
                effective.
              </p>
              <div className="overflow-x-auto border-2 border-stone-500 bg-white">
                <table className="w-full min-w-[820px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-800">
                      {['Quantity', 'Range', 'Correction', 'Source certificate', 'Effective', 'Remarks', ''].map((h) => (
                        <th key={h} className={cn(limsTableHeadClass, 'border-r border-stone-700 !p-2 text-left last:border-r-0')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-stone-600">Loading…</td>
                      </tr>
                    ) : visible.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-stone-600">No correction factors recorded.</td>
                      </tr>
                    ) : (
                      visible.map((r, i) => (
                        <tr key={r.id} className={cn(i % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]', !isCurrent(r, today) && 'text-stone-500')}>
                          <td className="border-b border-[#e7e0d4] px-2 py-1.5 font-semibold">{r.quantity}</td>
                          <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                            {rangeText(r)}
                            {r.unit && (r.range_from !== null || r.range_to !== null) ? ` ${r.unit}` : ''}
                          </td>
                          <td className="border-b border-[#e7e0d4] px-2 py-1.5 font-semibold">
                            {r.correction > 0 ? '+' : ''}
                            {r.correction}
                            {r.unit ? ` ${r.unit}` : ''}
                          </td>
                          <td className="border-b border-[#e7e0d4] px-2 py-1.5">{r.source_certificate || '—'}</td>
                          <td className="border-b border-[#e7e0d4] px-2 py-1.5">
                            {formatDate(r.effective_from)} – {r.effective_to ? formatDate(r.effective_to) : 'open'}
                            {isCurrent(r, today) ? <span className="ml-1 font-semibold text-emerald-800">current</span> : null}
                          </td>
                          <td className="border-b border-[#e7e0d4] px-2 py-1.5">{r.remarks || '—'}</td>
                          <td className="whitespace-nowrap border-b border-[#e7e0d4] px-1 py-1">
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-none" aria-label={`Edit ${r.quantity} correction`} onClick={() => startEdit(r)}>
                              <Pencil size={13} />
                            </Button>
                            {!r.effective_to || r.effective_to > today ? (
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-none" aria-label={`End ${r.quantity} correction today`} title="End today" onClick={() => void endFactor(r)}>
                                <Square size={13} />
                              </Button>
                            ) : null}
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-none text-red-700" aria-label={`Delete ${r.quantity} correction`} onClick={() => void removeFactor(r)}>
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {endedCount > 0 ? (
                <label className="flex items-center gap-2 text-[12px] text-stone-700">
                  <input type="checkbox" className="accent-amber-600" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
                  Show {endedCount} ended factor(s)
                </label>
              ) : null}
            </>
          ) : null}

          {!missing && !form ? (
            <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={startNew} disabled={!equipment || loading}>
              <Plus size={14} /> Add correction factor
            </Button>
          ) : null}

          {!missing && form ? (
            <div className="space-y-3 border-2 border-stone-500 bg-white p-4">
              <p className="text-sm font-semibold text-stone-900">{form.id ? 'Edit correction factor' : 'New correction factor'}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="cf-q" className={labelClass}>Quantity *</Label>
                  <Input id="cf-q" className={fieldClass} placeholder="e.g. Temperature" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-from" className={labelClass}>Range from</Label>
                  <Input id="cf-from" inputMode="decimal" className={fieldClass} placeholder="blank = open" value={form.rangeFrom} onChange={(e) => set('rangeFrom', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-to" className={labelClass}>Range to</Label>
                  <Input id="cf-to" inputMode="decimal" className={fieldClass} placeholder="blank = open" value={form.rangeTo} onChange={(e) => set('rangeTo', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-c" className={labelClass}>Correction *</Label>
                  <Input id="cf-c" inputMode="decimal" className={fieldClass} placeholder="e.g. -0.3" value={form.correction} onChange={(e) => set('correction', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-u" className={labelClass}>Unit</Label>
                  <Input id="cf-u" className={fieldClass} placeholder="°C, g, kN…" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="cf-cert" className={labelClass}>Source certificate</Label>
                  <Input id="cf-cert" className={fieldClass} value={form.sourceCertificate} onChange={(e) => set('sourceCertificate', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-ef" className={labelClass}>Effective from *</Label>
                  <Input id="cf-ef" type="date" className={fieldClass} value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-et" className={labelClass}>Effective to</Label>
                  <Input id="cf-et" type="date" className={fieldClass} value={form.effectiveTo} onChange={(e) => set('effectiveTo', e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="cf-rem" className={labelClass}>Remarks</Label>
                  <Input id="cf-rem" className={fieldClass} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
                </div>
              </div>
              {formError ? <p className="text-sm text-red-700" role="alert">{formError}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => setForm(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
