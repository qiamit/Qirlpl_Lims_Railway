import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarBtnClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
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
import { envErrorText, isEnvMissingError, localDateKey, type HousekeepingRow, type LabArea } from './shared'

const ACTIVITIES = [
  'Floor cleaning',
  'Bench / work surface cleaning',
  'Fume hood cleaning',
  'Equipment exterior cleaning',
  'Waste segregation and disposal',
  'Sample store tidying',
  'Pest control',
  'AC filter cleaning',
  'Spill cleaned',
]

type Draft = { areaId: string; doneOn: string; activity: string; doneBy: string; remarks: string }

export default function HousekeepingLogPage() {
  const { designation, profileName } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [areas, setAreas] = useState<LabArea[]>([])
  const [rows, setRows] = useState<HousekeepingRow[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => ({
    areaId: '',
    doneOn: localDateKey(new Date()),
    activity: '',
    doneBy: '',
    remarks: '',
  }))

  const [areaFilter, setAreaFilter] = useState('')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return localDateKey(d)
  })
  const [to, setTo] = useState(() => localDateKey(new Date()))
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)

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
      setAreas((aRes.data ?? []) as LabArea[])
      let q = supabase
        .from('housekeeping_log')
        .select('*')
        .order('done_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000)
      if (from) q = q.gte('done_on', from)
      if (to) q = q.lte('done_on', to)
      if (areaFilter) q = q.eq('area_id', areaFilter)
      if (unverifiedOnly) q = q.is('verified_by', null)
      const { data, error: err } = await q
      if (err) throw err
      setRows((data ?? []) as HousekeepingRow[])
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [from, to, areaFilter, unverifiedOnly])

  useEffect(() => {
    void load()
  }, [load])

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas])
  const pending = rows.filter((r) => !r.verified_by).length

  const add = async () => {
    if (!draft.areaId || !draft.activity.trim() || !draft.doneOn) {
      setMessage('Choose the area, the date and the activity.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const { error: err } = await supabase.from('housekeeping_log').insert({
        area_id: draft.areaId,
        done_on: draft.doneOn,
        activity: draft.activity.trim(),
        done_by: draft.doneBy.trim() || profileName || null,
        remarks: draft.remarks.trim() || null,
      })
      if (err) throw err
      setMessage('Housekeeping recorded.')
      setDraft((d) => ({ ...d, activity: '', remarks: '' }))
      await load()
    } catch (err) {
      setMessage(envErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const verify = async (r: HousekeepingRow) => {
    if (!profileName) {
      setMessage('Your profile has no name; ask the administrator to add it.')
      return
    }
    const { error: err } = await supabase.from('housekeeping_log').update({ verified_by: profileName }).eq('id', r.id)
    if (err) {
      setMessage(envErrorText(err))
      return
    }
    await load()
  }

  const remove = async (r: HousekeepingRow) => {
    const reason = await askReason({
      title: 'Reason for deleting a housekeeping entry',
      recordLabel: `${formatDate(r.done_on)} · ${r.activity}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered against the wrong area'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('housekeeping_log').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? envErrorText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('housekeeping_log', r.id, reason)
    await load()
  }

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Housekeeping Log"
        clause="6.3.4 (c)"
        subtitle="Cleaning and housekeeping of laboratory areas, with verification."
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
      <datalist id="env-activities">
        {ACTIVITIES.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      {!missing ? (
        <>
          <EnvPanel title="Record housekeeping">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Area *" htmlFor="hk-area">
                <EnvSelect id="hk-area" value={draft.areaId} onChange={(v) => setDraft({ ...draft, areaId: v })}>
                  <option value="">— Choose —</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Date *" htmlFor="hk-date">
                <Input id="hk-date" type="date" value={draft.doneOn} max={localDateKey(new Date())}
                  onChange={(e) => setDraft({ ...draft, doneOn: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Activity *" htmlFor="hk-act">
                <Input id="hk-act" list="env-activities" value={draft.activity}
                  onChange={(e) => setDraft({ ...draft, activity: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Done by" htmlFor="hk-by">
                <Input id="hk-by" value={draft.doneBy} placeholder={profileName || 'Name'}
                  onChange={(e) => setDraft({ ...draft, doneBy: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Remarks" htmlFor="hk-rem">
                <Input id="hk-rem" value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} className={envInputClass} />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void add()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            </div>
          </EnvPanel>

          <EnvPanel title={`Entries (${rows.length}) · ${pending} awaiting verification`}>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Area" htmlFor="hf-area" className="col-span-2 sm:col-span-1">
                <EnvSelect id="hf-area" value={areaFilter} onChange={setAreaFilter}>
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="From" htmlFor="hf-from">
                <Input id="hf-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={envInputClass} />
              </Field>
              <Field label="To" htmlFor="hf-to">
                <Input id="hf-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={envInputClass} />
              </Field>
              <label className="flex min-h-10 items-end gap-2 pb-1.5 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={unverifiedOnly} onChange={(e) => setUnverifiedOnly(e.target.checked)} />
                Not verified
              </label>
            </div>

            <div className="space-y-1.5 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                  <p className="font-semibold">
                    {formatDate(r.done_on)} · <span className="font-mono text-amber-800">{areaById.get(r.area_id)?.code ?? '—'}</span>
                  </p>
                  <p>{r.activity}</p>
                  <p className="text-[12px] text-stone-600">
                    Done by {r.done_by || '—'} · {r.verified_by ? `Verified by ${r.verified_by}` : 'Not verified'}
                  </p>
                  {r.remarks ? <p className="text-[12px] italic">{r.remarks}</p> : null}
                  <div className="mt-1 flex justify-end gap-1">
                    {!r.verified_by ? (
                      <Button className={cn(limsPrimaryBtnClass, 'h-10')} onClick={() => void verify(r)}>
                        <BadgeCheck className="h-4 w-4" /> Verify
                      </Button>
                    ) : null}
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
              <table className="w-full min-w-[820px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={envThClass}>Date</th>
                    <th className={envThClass}>Area</th>
                    <th className={envThClass}>Activity</th>
                    <th className={envThClass}>Done by</th>
                    <th className={envThClass}>Verified by</th>
                    <th className={envThClass}>Remarks</th>
                    {isDirector ? <th className={envThClass}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>{formatDate(r.done_on)}</td>
                      <td className={cn(envTdClass, 'font-mono font-semibold text-amber-800')}>{areaById.get(r.area_id)?.code ?? '—'}</td>
                      <td className={envTdClass}>{r.activity}</td>
                      <td className={envTdClass}>{r.done_by || '—'}</td>
                      <td className={envTdClass}>
                        {r.verified_by || (
                          <Button className={cn(limsPrimaryBtnClass, 'h-7 px-2 text-[12px]')} onClick={() => void verify(r)}>
                            <BadgeCheck className="h-3.5 w-3.5" /> Verify
                          </Button>
                        )}
                      </td>
                      <td className={cn(envTdClass, 'text-[11.5px]')}>{r.remarks || '—'}</td>
                      {isDirector ? (
                        <td className={cn(envTdClass, 'text-center')}>
                          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} onClick={() => void remove(r)} aria-label="Delete">
                            <Trash2 className="h-4 w-4 text-red-700" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && rows.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No entries for these filters.</p> : null}
          </EnvPanel>
        </>
      ) : null}
    </div>
  )
}
