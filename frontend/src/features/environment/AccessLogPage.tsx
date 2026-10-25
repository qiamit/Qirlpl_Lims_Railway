import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, LogOut, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { fetchTeamUsers, type TeamUserRecord } from '@/lib/fetchTeamUsers'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
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
  dayBoundIso,
  envErrorText,
  isEnvMissingError,
  localDateKey,
  localInputToIso,
  toLocalInput,
  type AccessLogRow,
  type LabArea,
} from './shared'

type Draft = {
  areaId: string
  personName: string
  purpose: string
  escortedBy: string
  timeIn: string
  timeOut: string
  remarks: string
}

const PURPOSES = ['Testing', 'Calibration', 'Maintenance / repair', 'Cleaning', 'Audit / assessment', 'Visitor', 'Delivery']

function emptyDraft(areaId = ''): Draft {
  return { areaId, personName: '', purpose: '', escortedBy: '', timeIn: '', timeOut: '', remarks: '' }
}

function durationText(a: string, b: string | null): string {
  if (!b) return ''
  const mins = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 0) return ''
  const h = Math.floor(mins / 60)
  return h ? `${h} h ${mins % 60} min` : `${mins} min`
}

export default function AccessLogPage() {
  const { designation, profileName } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [areas, setAreas] = useState<LabArea[]>([])
  const [staff, setStaff] = useState<TeamUserRecord[]>([])
  const [rows, setRows] = useState<AccessLogRow[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<AccessLogRow | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft())

  const [areaFilter, setAreaFilter] = useState('')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return localDateKey(d)
  })
  const [to, setTo] = useState(() => localDateKey(new Date()))
  const [insideOnly, setInsideOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const aRes = await supabase.from('lab_areas').select('*').eq('active', true).order('code')
      if (aRes.error) {
        if (isEnvMissingError(aRes.error)) {
          setMissing(true)
          return
        }
        throw aRes.error
      }
      setMissing(false)
      const list = ((aRes.data ?? []) as LabArea[]).sort(
        (x, y) => Number(y.access_restricted) - Number(x.access_restricted) || x.code.localeCompare(y.code),
      )
      setAreas(list)
      let q = supabase.from('area_access_log').select('*').order('time_in', { ascending: false }).limit(1000)
      const f = dayBoundIso(from)
      const t = dayBoundIso(to, true)
      if (f) q = q.gte('time_in', f)
      if (t) q = q.lte('time_in', t)
      if (areaFilter) q = q.eq('area_id', areaFilter)
      if (insideOnly) q = q.is('time_out', null)
      const { data, error: err } = await q
      if (err) throw err
      setRows((data ?? []) as AccessLogRow[])
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [from, to, areaFilter, insideOnly])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void fetchTeamUsers()
      .then((u) => setStaff(u.filter((x) => x.status.toLowerCase() !== 'inactive' && x.full_name)))
      .catch(() => setStaff([]))
  }, [])

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas])
  const staffByName = useMemo(() => new Map(staff.map((s) => [s.full_name.trim().toLowerCase(), s])), [staff])
  const inside = rows.filter((r) => !r.time_out).length

  const toPayload = (d: Draft, forInsert: boolean) => {
    const timeIn = d.timeIn ? localInputToIso(d.timeIn) : forInsert ? new Date().toISOString() : null
    const timeOut = d.timeOut ? localInputToIso(d.timeOut) : null
    const match = staffByName.get(d.personName.trim().toLowerCase())
    return {
      area_id: d.areaId,
      person_name: d.personName.trim(),
      user_id: match?.id ?? null,
      purpose: d.purpose.trim() || null,
      escorted_by: d.escortedBy.trim() || null,
      remarks: d.remarks.trim() || null,
      ...(timeIn ? { time_in: timeIn } : {}),
      time_out: timeOut,
    }
  }

  const check = (d: Draft): string | null => {
    if (!d.areaId) return 'Choose the area.'
    if (!d.personName.trim()) return 'Enter the name of the person.'
    if (d.timeIn && d.timeOut && new Date(d.timeOut) < new Date(d.timeIn)) return 'Time out is before time in.'
    return null
  }

  const add = async () => {
    const problem = check(draft)
    if (problem) {
      setMessage(problem)
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const { error: err } = await supabase.from('area_access_log').insert(toPayload(draft, true))
      if (err) throw err
      setMessage(`Entry recorded for ${draft.personName.trim()}.`)
      setDraft(emptyDraft(draft.areaId))
      await load()
    } catch (err) {
      setMessage(envErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const markOut = async (r: AccessLogRow) => {
    const { error: err } = await supabase.from('area_access_log').update({ time_out: new Date().toISOString() }).eq('id', r.id)
    if (err) {
      setMessage(envErrorText(err))
      return
    }
    await load()
  }

  const openEdit = (r: AccessLogRow) => {
    setEditing(r)
    setEditDraft({
      areaId: r.area_id,
      personName: r.person_name,
      purpose: r.purpose ?? '',
      escortedBy: r.escorted_by ?? '',
      timeIn: toLocalInput(new Date(r.time_in)),
      timeOut: r.time_out ? toLocalInput(new Date(r.time_out)) : '',
      remarks: r.remarks ?? '',
    })
  }

  const saveEdit = async () => {
    if (!editing) return
    const problem = check(editDraft)
    if (problem) {
      setMessage(problem)
      return
    }
    setSaving(true)
    try {
      const { error: err } = await supabase.from('area_access_log').update(toPayload(editDraft, false)).eq('id', editing.id)
      if (err) throw err
      setEditing(null)
      await load()
    } catch (err) {
      setMessage(envErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: AccessLogRow) => {
    const reason = await askReason({
      title: 'Reason for deleting an access log entry',
      recordLabel: `${r.person_name} · ${formatDateTime(r.time_in)}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered against the wrong area'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('area_access_log').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? envErrorText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('area_access_log', r.id, reason)
    await load()
  }

  const fields = (d: Draft, set: (d: Draft) => void, idp: string) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Area *" htmlFor={`${idp}-area`}>
        <EnvSelect id={`${idp}-area`} value={d.areaId} onChange={(v) => set({ ...d, areaId: v })}>
          <option value="">— Choose —</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
              {a.access_restricted ? ' (restricted)' : ''}
            </option>
          ))}
        </EnvSelect>
      </Field>
      <Field label="Person *" htmlFor={`${idp}-person`}>
        <Input id={`${idp}-person`} list="env-staff" value={d.personName} placeholder="Staff or visitor name"
          onChange={(e) => set({ ...d, personName: e.target.value })} className={envInputClass} />
      </Field>
      <Field label="Purpose" htmlFor={`${idp}-purpose`}>
        <Input id={`${idp}-purpose`} list="env-purposes" value={d.purpose} onChange={(e) => set({ ...d, purpose: e.target.value })} className={envInputClass} />
      </Field>
      <Field label="Escorted by" htmlFor={`${idp}-escort`}>
        <Input id={`${idp}-escort`} list="env-staff" value={d.escortedBy} onChange={(e) => set({ ...d, escortedBy: e.target.value })} className={envInputClass} />
      </Field>
      <Field label="Time in (blank = now)" htmlFor={`${idp}-in`}>
        <Input id={`${idp}-in`} type="datetime-local" value={d.timeIn} onChange={(e) => set({ ...d, timeIn: e.target.value })} className={envInputClass} />
      </Field>
      <Field label="Time out" htmlFor={`${idp}-out`}>
        <Input id={`${idp}-out`} type="datetime-local" value={d.timeOut} onChange={(e) => set({ ...d, timeOut: e.target.value })} className={envInputClass} />
      </Field>
      <Field label="Remarks" htmlFor={`${idp}-rem`} className="sm:col-span-2">
        <Input id={`${idp}-rem`} value={d.remarks} onChange={(e) => set({ ...d, remarks: e.target.value })} className={envInputClass} />
      </Field>
    </div>
  )

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Area Access Log"
        clause="6.3.4 (a)"
        subtitle="Entry to and use of areas that affect laboratory activities."
        actions={
          <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />
      {missing ? <MissingMigrationNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />
      <datalist id="env-staff">
        {staff.map((s) => (
          <option key={s.id} value={s.full_name} />
        ))}
      </datalist>
      <datalist id="env-purposes">
        {PURPOSES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {!missing ? (
        <>
          <EnvPanel title="Record entry">
            {fields(draft, setDraft, 'new')}
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              {profileName ? (
                <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-8')} onClick={() => setDraft({ ...draft, personName: profileName })}>
                  Me
                </Button>
              ) : null}
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void add()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Record entry
              </Button>
            </div>
          </EnvPanel>

          <EnvPanel title={`Entries (${rows.length}) · ${inside} inside now`}>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Area" htmlFor="af-area" className="col-span-2 sm:col-span-1">
                <EnvSelect id="af-area" value={areaFilter} onChange={setAreaFilter}>
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="From" htmlFor="af-from">
                <Input id="af-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={envInputClass} />
              </Field>
              <Field label="To" htmlFor="af-to">
                <Input id="af-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={envInputClass} />
              </Field>
              <label className="flex min-h-10 items-end gap-2 pb-1.5 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={insideOnly} onChange={(e) => setInsideOnly(e.target.checked)} />
                Still inside
              </label>
            </div>

            <div className="space-y-1.5 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className={cn('border bg-white p-2 text-[13px]', !r.time_out ? 'border-l-4 border-amber-500' : 'border-stone-300')}>
                  <p className="font-semibold">{r.person_name}</p>
                  <p className="text-[12px] text-stone-600">
                    <span className="font-mono text-amber-800">{areaById.get(r.area_id)?.code ?? '—'}</span> · {r.purpose || '—'}
                    {r.escorted_by ? ` · escorted by ${r.escorted_by}` : ''}
                  </p>
                  <p className="text-[12px]">
                    In {formatDateTime(r.time_in)}
                    {r.time_out ? ` · Out ${formatDateTime(r.time_out)} (${durationText(r.time_in, r.time_out)})` : ''}
                  </p>
                  <div className="mt-1 flex justify-end gap-1">
                    {!r.time_out ? (
                      <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void markOut(r)}>
                        <LogOut className="h-4 w-4" /> Mark out
                      </Button>
                    ) : null}
                    <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10')} onClick={() => openEdit(r)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isDirector ? (
                      <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10')} onClick={() => void remove(r)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-red-700" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={envThClass}>Area</th>
                    <th className={envThClass}>Person</th>
                    <th className={envThClass}>Purpose</th>
                    <th className={envThClass}>Time in</th>
                    <th className={envThClass}>Time out</th>
                    <th className={envThClass}>Duration</th>
                    <th className={envThClass}>Escorted by</th>
                    <th className={envThClass}>Remarks</th>
                    <th className={envThClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={!r.time_out ? 'bg-amber-50' : i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(envTdClass, 'font-mono font-semibold text-amber-800')}>{areaById.get(r.area_id)?.code ?? '—'}</td>
                      <td className={cn(envTdClass, 'font-semibold')}>{r.person_name}</td>
                      <td className={envTdClass}>{r.purpose || '—'}</td>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>{formatDateTime(r.time_in)}</td>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>
                        {r.time_out ? (
                          formatDateTime(r.time_out)
                        ) : (
                          <Button className={cn(limsPrimaryBtnClass, 'h-7 px-2 text-[12px]')} onClick={() => void markOut(r)}>
                            <LogOut className="h-3.5 w-3.5" /> Mark out
                          </Button>
                        )}
                      </td>
                      <td className={envTdClass}>{durationText(r.time_in, r.time_out) || '—'}</td>
                      <td className={envTdClass}>{r.escorted_by || '—'}</td>
                      <td className={cn(envTdClass, 'text-[11.5px]')}>{r.remarks || '—'}</td>
                      <td className={envTdClass}>
                        <div className="flex justify-center gap-1">
                          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} onClick={() => openEdit(r)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isDirector ? (
                            <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} onClick={() => void remove(r)} aria-label="Delete">
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
            {!loading && rows.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No entries for these filters.</p> : null}
          </EnvPanel>
        </>
      ) : null}

      <Dialog open={editing !== null} onOpenChange={(o) => (!o && !saving ? setEditing(null) : undefined)}>
        <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-3xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">Edit access entry</DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            {fields(editDraft, setEditDraft, 'edit')}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className={limsOutlineBtnClass} onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button className={limsPrimaryBtnClass} onClick={() => void saveEdit()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
