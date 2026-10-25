import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Lock, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  EnvHeader,
  EnvPanel,
  EnvSelect,
  Field,
  MessageLine,
  MissingMigrationNotice,
  envInputClass,
  envTdClass,
  envThClass,
} from './EnvironmentUi'
import {
  dueSlots,
  envErrorText,
  isEnvMissingError,
  num,
  otherLimitEntries,
  rangeText,
  type LabArea,
  type OtherLimit,
} from './shared'

type EquipmentOption = { id: string; asset_code: string | null; equipment_name: string | null }

type OtherLimitDraft = { key: string; label: string; unit: string; min: string; max: string }

type AreaForm = {
  code: string
  name: string
  department: string
  description: string
  tempMin: string
  tempMax: string
  rhMin: string
  rhMax: string
  readingsPerDay: string
  loggerId: string
  accessRestricted: boolean
  active: boolean
  others: OtherLimitDraft[]
}

const EMPTY_FORM: AreaForm = {
  code: '',
  name: '',
  department: '',
  description: '',
  tempMin: '',
  tempMax: '',
  rhMin: '',
  rhMax: '',
  readingsPerDay: '2',
  loggerId: '',
  accessRestricted: false,
  active: true,
  others: [],
}

const DEPARTMENTS = ['Chemical', 'Mechanical', 'Calibration', 'Sample Cell', 'Quality Assurance', 'Store']

function str(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v)
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'value'
  )
}

function areaToForm(a: LabArea): AreaForm {
  return {
    code: a.code,
    name: a.name,
    department: a.department ?? '',
    description: a.description ?? '',
    tempMin: str(a.temp_min),
    tempMax: str(a.temp_max),
    rhMin: str(a.rh_min),
    rhMax: str(a.rh_max),
    readingsPerDay: String(a.readings_per_day ?? 2),
    loggerId: a.logger_equipment_id ?? '',
    accessRestricted: a.access_restricted,
    active: a.active,
    others: otherLimitEntries(a.other_limits).map(([key, l]) => ({
      key,
      label: l.label ?? key,
      unit: l.unit ?? '',
      min: str(l.min ?? null),
      max: str(l.max ?? null),
    })),
  }
}

function formToPayload(f: AreaForm) {
  const other: Record<string, OtherLimit> = {}
  for (const o of f.others) {
    const label = o.label.trim()
    if (!label) continue
    const key = o.key || slug(label)
    other[key] = { label, unit: o.unit.trim(), min: num(o.min), max: num(o.max) }
  }
  return {
    code: f.code.trim().toUpperCase(),
    name: f.name.trim(),
    department: f.department.trim() || null,
    description: f.description.trim() || null,
    temp_min: num(f.tempMin),
    temp_max: num(f.tempMax),
    rh_min: num(f.rhMin),
    rh_max: num(f.rhMax),
    other_limits: other,
    readings_per_day: Math.max(0, Math.min(48, Math.round(num(f.readingsPerDay) ?? 0))),
    logger_equipment_id: f.loggerId || null,
    access_restricted: f.accessRestricted,
    active: f.active,
  }
}

function validate(f: AreaForm): string | null {
  if (!f.code.trim() || !f.name.trim()) return 'Code and name are required.'
  const nums: Array<[string, string]> = [
    ['Temperature min', f.tempMin],
    ['Temperature max', f.tempMax],
    ['RH min', f.rhMin],
    ['RH max', f.rhMax],
    ['Readings per day', f.readingsPerDay],
  ]
  for (const [label, v] of nums) if (v.trim() && num(v) === null) return `${label} must be a number.`
  const tMin = num(f.tempMin)
  const tMax = num(f.tempMax)
  if (tMin !== null && tMax !== null && tMin > tMax) return 'Temperature min is above max.'
  const rMin = num(f.rhMin)
  const rMax = num(f.rhMax)
  for (const v of [rMin, rMax]) if (v !== null && (v < 0 || v > 100)) return 'RH limits must be between 0 and 100 %.'
  if (rMin !== null && rMax !== null && rMin > rMax) return 'RH min is above max.'
  for (const o of f.others) {
    if (!o.label.trim()) continue
    if ((o.min.trim() && num(o.min) === null) || (o.max.trim() && num(o.max) === null)) {
      return `Limits of ${o.label} must be numbers.`
    }
  }
  return null
}

function limitsChanged(a: LabArea, f: AreaForm): boolean {
  const p = formToPayload(f)
  const same = (x: number | null | undefined, y: number | null) => (x ?? null) === y
  return (
    !same(num(a.temp_min), p.temp_min) ||
    !same(num(a.temp_max), p.temp_max) ||
    !same(num(a.rh_min), p.rh_min) ||
    !same(num(a.rh_max), p.rh_max) ||
    canonOther(a.other_limits) !== canonOther(p.other_limits)
  )
}

/** Key-order independent text of other_limits (jsonb reorders keys). */
function canonOther(o: Record<string, OtherLimit> | null | undefined): string {
  return JSON.stringify(
    otherLimitEntries(o)
      .map(([k, l]) => [k, l.label ?? '', l.unit ?? '', num(l.min), num(l.max)])
      .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
  )
}

export default function AreasPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const des = designation.trim().toLowerCase()
  const isDirector = isLaboratoryDirector(designation)
  const canManage =
    isDirector ||
    des === 'technical manager' ||
    (des === 'quality manager' && departmentName.trim().toLowerCase() === 'quality assurance')

  const [areas, setAreas] = useState<LabArea[]>([])
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<LabArea | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<AreaForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [aRes, eRes] = await Promise.all([
        supabase.from('lab_areas').select('*').order('code'),
        supabase.from('equipment_master').select('id, asset_code, equipment_name').order('asset_code'),
      ])
      if (aRes.error) {
        if (isEnvMissingError(aRes.error)) {
          setMissing(true)
          return
        }
        throw aRes.error
      }
      setMissing(false)
      setAreas((aRes.data ?? []) as LabArea[])
      setEquipment((eRes.data ?? []) as EquipmentOption[])
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const equipmentLabel = (id: string | null) => {
    if (!id) return '—'
    const e = equipmentById.get(id)
    return e ? [e.asset_code, e.equipment_name].filter(Boolean).join(' · ') : 'Removed equipment'
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return areas.filter(
      (a) =>
        (showInactive || a.active) &&
        (!q || `${a.code} ${a.name} ${a.department ?? ''} ${a.description ?? ''}`.toLowerCase().includes(q)),
    )
  }, [areas, search, showInactive])

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (a: LabArea) => {
    setEditing(a)
    setForm(areaToForm(a))
    setFormError(null)
    setFormOpen(true)
  }

  const save = async () => {
    const problem = validate(form)
    if (problem) {
      setFormError(problem)
      return
    }
    let reason: string | null = null
    if (editing && limitsChanged(editing, form)) {
      reason = await askReason({
        title: 'Reason for changing the area limits',
        recordLabel: `${editing.code} — ${editing.name}`,
        description: 'Readings already recorded keep the limits that applied when they were taken.',
        confirmLabel: 'Save limits',
        quickPicks: ['Limits revised as per test method', 'Limits revised as per equipment requirement', 'Entry error corrected'],
      })
      if (!reason) return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = formToPayload(form)
      if (editing) {
        const { error: err } = await supabase.from('lab_areas').update(payload).eq('id', editing.id)
        if (err) throw err
        if (reason) await recordReason('lab_areas', editing.id, reason)
      } else {
        const { error: err } = await supabase.from('lab_areas').insert(payload)
        if (err) throw err
      }
      setFormOpen(false)
      setMessage(`Area ${payload.code} saved.`)
      await load()
    } catch (err) {
      const e = err as { code?: string }
      setFormError(e?.code === '23505' ? 'This area code is already used.' : envErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a: LabArea) => {
    const reason = await askReason({
      title: `Reason for deleting area ${a.code}`,
      recordLabel: `${a.code} — ${a.name}`,
      description: 'Only an area without readings or log entries can be deleted. Otherwise set it inactive.',
      confirmLabel: 'Delete',
      quickPicks: ['Created by mistake', 'Duplicate area'],
    })
    if (!reason) return
    const { error: err } = await supabase.from('lab_areas').delete().eq('id', a.id)
    if (err) {
      setMessage(
        err.code === '23503'
          ? `${a.code} has readings or log entries and cannot be deleted. Edit it and clear "Active" instead.`
          : envErrorText(err),
      )
      return
    }
    await recordReason('lab_areas', a.id, reason)
    setMessage(`Area ${a.code} deleted.`)
    await load()
  }

  const setOther = (i: number, patch: Partial<OtherLimitDraft>) =>
    setForm((f) => ({ ...f, others: f.others.map((o, j) => (j === i ? { ...o, ...patch } : o)) }))

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Lab Areas & Environmental Limits"
        clause="6.3.1 – 6.3.4"
        subtitle="Rooms, the conditions they must meet, how often they are checked and who may enter."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canManage && !missing ? (
              <Button className={limsPrimaryBtnClass} onClick={openNew}>
                <Plus className="h-4 w-4" /> New area
              </Button>
            ) : null}
          </>
        }
      />

      {missing ? <MissingMigrationNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <EnvPanel
          title={`Areas (${visible.length})`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12px] text-amber-100">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="h-4 w-4"
                />
                Show inactive
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search areas"
                className={cn(limsDarkBarSearchClass, 'h-8 w-40 sm:w-56')}
              />
            </div>
          }
        >
          {!canManage ? (
            <p className="mb-2 text-[12px] text-stone-600">
              Limits are maintained by the Laboratory Director, Quality Manager or a Technical Manager.
            </p>
          ) : null}

          {/* Phone: cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((a) => (
              <div key={a.id} className={cn('border border-stone-400 bg-white p-2.5', !a.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-semibold text-amber-800">{a.code}</p>
                    <p className="font-semibold text-stone-900">{a.name}</p>
                    <p className="text-[12px] text-stone-600">{a.department || '—'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {canManage ? (
                      <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => openEdit(a)} aria-label={`Edit ${a.code}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {isDirector ? (
                      <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => void remove(a)} aria-label={`Delete ${a.code}`}>
                        <Trash2 className="h-4 w-4 text-red-700" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[12.5px]">
                  <dt className="text-stone-500">Temperature</dt>
                  <dd>{rangeText(a.temp_min, a.temp_max, '°C')}</dd>
                  <dt className="text-stone-500">RH</dt>
                  <dd>{rangeText(a.rh_min, a.rh_max, '%')}</dd>
                  {otherLimitEntries(a.other_limits).map(([k, l]) => (
                    <div key={k} className="contents">
                      <dt className="text-stone-500">{l.label || k}</dt>
                      <dd>{rangeText(l.min ?? null, l.max ?? null, l.unit ?? '')}</dd>
                    </div>
                  ))}
                  <dt className="text-stone-500">Readings / day</dt>
                  <dd>{a.readings_per_day}</dd>
                  <dt className="text-stone-500">Logger</dt>
                  <dd className="break-words">{equipmentLabel(a.logger_equipment_id)}</dd>
                </dl>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {a.access_restricted ? <RestrictedBadge /> : null}
                  {!a.active ? <InactiveBadge /> : null}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={envThClass}>Code</th>
                  <th className={envThClass}>Area</th>
                  <th className={envThClass}>Department</th>
                  <th className={envThClass}>Temperature</th>
                  <th className={envThClass}>RH</th>
                  <th className={envThClass}>Other limits</th>
                  <th className={envThClass}>Readings / day</th>
                  <th className={envThClass}>Logger / hygrometer</th>
                  <th className={envThClass}>Access</th>
                  <th className={cn(envThClass, 'w-24')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a, i) => (
                  <tr key={a.id} className={cn(i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]', !a.active && 'opacity-60')}>
                    <td className={cn(envTdClass, 'font-mono font-semibold text-amber-800')}>{a.code}</td>
                    <td className={envTdClass}>
                      <p className="font-semibold">{a.name}</p>
                      {a.description ? <p className="text-[11px] text-stone-600">{a.description}</p> : null}
                      {!a.active ? <InactiveBadge /> : null}
                    </td>
                    <td className={envTdClass}>{a.department || '—'}</td>
                    <td className={cn(envTdClass, 'whitespace-nowrap')}>{rangeText(a.temp_min, a.temp_max, '°C')}</td>
                    <td className={cn(envTdClass, 'whitespace-nowrap')}>{rangeText(a.rh_min, a.rh_max, '%')}</td>
                    <td className={envTdClass}>
                      {otherLimitEntries(a.other_limits).length === 0
                        ? '—'
                        : otherLimitEntries(a.other_limits).map(([k, l]) => (
                            <p key={k}>
                              {l.label || k}: {rangeText(l.min ?? null, l.max ?? null, l.unit ?? '')}
                            </p>
                          ))}
                    </td>
                    <td className={cn(envTdClass, 'text-center')}>
                      {a.readings_per_day}
                      {a.readings_per_day > 0 ? (
                        <p className="text-[10.5px] text-stone-500">{dueSlots(a.readings_per_day).join(', ')}</p>
                      ) : null}
                    </td>
                    <td className={envTdClass}>{equipmentLabel(a.logger_equipment_id)}</td>
                    <td className={cn(envTdClass, 'text-center')}>{a.access_restricted ? <RestrictedBadge /> : 'Open'}</td>
                    <td className={cn(envTdClass, 'text-center')}>
                      <div className="flex justify-center gap-1">
                        {canManage ? (
                          <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => openEdit(a)} aria-label={`Edit ${a.code}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {isDirector ? (
                          <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => void remove(a)} aria-label={`Delete ${a.code}`}>
                            <Trash2 className="h-4 w-4 text-red-700" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && visible.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-stone-600">
              No areas yet{canManage ? ' — add the rooms whose conditions you monitor.' : '.'}
            </p>
          ) : null}
        </EnvPanel>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(o) => (!o && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-2xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                {editing ? `Edit area ${editing.code}` : 'New area'}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                Leave a limit empty when it does not apply.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Code *" htmlFor="area-code">
                <Input id="area-code" className={envInputClass} value={form.code} placeholder="CHEM-LAB"
                  onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </Field>
              <Field label="Name *" htmlFor="area-name" className="sm:col-span-2">
                <Input id="area-name" className={envInputClass} value={form.name} placeholder="Chemical testing lab"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Department" htmlFor="area-dept">
                <Input id="area-dept" list="env-departments" className={envInputClass} value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })} />
                <datalist id="env-departments">
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>
              <Field label="Description" htmlFor="area-desc" className="sm:col-span-2">
                <Input id="area-desc" className={envInputClass} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>

            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Limits</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Temp min °C" htmlFor="t-min">
                  <Input id="t-min" inputMode="decimal" className={envInputClass} value={form.tempMin}
                    onChange={(e) => setForm({ ...form, tempMin: e.target.value })} />
                </Field>
                <Field label="Temp max °C" htmlFor="t-max">
                  <Input id="t-max" inputMode="decimal" className={envInputClass} value={form.tempMax}
                    onChange={(e) => setForm({ ...form, tempMax: e.target.value })} />
                </Field>
                <Field label="RH min %" htmlFor="rh-min">
                  <Input id="rh-min" inputMode="decimal" className={envInputClass} value={form.rhMin}
                    onChange={(e) => setForm({ ...form, rhMin: e.target.value })} />
                </Field>
                <Field label="RH max %" htmlFor="rh-max">
                  <Input id="rh-max" inputMode="decimal" className={envInputClass} value={form.rhMax}
                    onChange={(e) => setForm({ ...form, rhMax: e.target.value })} />
                </Field>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Other conditions (e.g. differential pressure, light, vibration)
                </p>
                {form.others.map((o, i) => (
                  <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_5rem_5rem_5rem_auto]">
                    <Field label="Name" className="col-span-2 sm:col-span-1">
                      <Input className={envInputClass} value={o.label} placeholder="Differential pressure"
                        onChange={(e) => setOther(i, { label: e.target.value })} />
                    </Field>
                    <Field label="Unit">
                      <Input className={envInputClass} value={o.unit} placeholder="Pa" onChange={(e) => setOther(i, { unit: e.target.value })} />
                    </Field>
                    <Field label="Min">
                      <Input inputMode="decimal" className={envInputClass} value={o.min} onChange={(e) => setOther(i, { min: e.target.value })} />
                    </Field>
                    <Field label="Max">
                      <Input inputMode="decimal" className={envInputClass} value={o.max} onChange={(e) => setOther(i, { max: e.target.value })} />
                    </Field>
                    <Button type="button" size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10 sm:h-8 sm:w-8')}
                      aria-label="Remove condition"
                      onClick={() => setForm((f) => ({ ...f, others: f.others.filter((_, j) => j !== i) }))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" className={limsOutlineBtnClass}
                  onClick={() => setForm((f) => ({ ...f, others: [...f.others, { key: '', label: '', unit: '', min: '', max: '' }] }))}>
                  <Plus className="h-4 w-4" /> Add condition
                </Button>
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Readings per day" htmlFor="rpd">
                <Input id="rpd" inputMode="numeric" className={envInputClass} value={form.readingsPerDay}
                  onChange={(e) => setForm({ ...form, readingsPerDay: e.target.value })} />
              </Field>
              <Field label="Data logger / hygrometer" htmlFor="logger" className="sm:col-span-2">
                <EnvSelect id="logger" value={form.loggerId} onChange={(v) => setForm({ ...form, loggerId: v })}>
                  <option value="">— None —</option>
                  {equipment.map((e) => (
                    <option key={e.id} value={e.id}>
                      {[e.asset_code, e.equipment_name].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={form.accessRestricted}
                  onChange={(e) => setForm({ ...form, accessRestricted: e.target.checked })} />
                Restricted entry (keep an access log)
              </label>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active
              </label>
            </div>
            <MessageLine tone="error" text={formError} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className={limsOutlineBtnClass} onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RestrictedBadge() {
  return (
    <span className="inline-flex items-center gap-1 border border-amber-700/50 bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
      <Lock className="h-3 w-3" /> Restricted
    </span>
  )
}

function InactiveBadge() {
  return (
    <span className="inline-block border border-stone-400 bg-stone-200 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700">
      Inactive
    </span>
  )
}
