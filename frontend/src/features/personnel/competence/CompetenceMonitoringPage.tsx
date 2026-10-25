import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { fetchTeamUsers, type TeamUserRecord } from '@/lib/fetchTeamUsers'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarBtnClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
import {
  Badge,
  CompHeader,
  CompPanel,
  CompSelect,
  Field,
  MessageLine,
  MissingMigrationNotice,
  compCardClass,
  compInputClass,
  compTdClass,
  compThClass,
} from './CompetenceUi'
import {
  MONITORING_METHODS,
  MONITORING_RESULTS,
  canManageCompetence,
  errText,
  isCompetenceMissingError,
  labelOf,
  loadScopeOptions,
  loadTestParameterOptions,
  parameterLabel,
  scopeLabel,
  todayKey,
  type MonitoringMethod,
  type MonitoringRecord,
  type MonitoringResult,
  type ScopeOption,
  type TestParameterOption,
} from './competenceShared'

type Draft = {
  userId: string
  method: MonitoringMethod
  targetKind: 'none' | 'parameter' | 'scope'
  testParameterId: string
  scopeId: string
  performedOn: string
  result: MonitoringResult
  reference: string
  ptParticipationId: string
  remarks: string
  followUp: string
}

const emptyDraft = (): Draft => ({
  userId: '',
  method: 'witnessing',
  targetKind: 'parameter',
  testParameterId: '',
  scopeId: '',
  performedOn: todayKey(),
  result: 'satisfactory',
  reference: '',
  ptParticipationId: '',
  remarks: '',
  followUp: '',
})

type PtOption = { id: string; parameter: string; round_code: string | null; performance: string | null; reported_on: string | null }

const RESULT_TONE: Record<MonitoringResult, string> = {
  satisfactory: 'green',
  needs_training: 'amber',
  unsatisfactory: 'red',
}

/** Monitoring older than this is shown as due. */
const MONITORING_INTERVAL_DAYS = 365

export default function CompetenceMonitoringPage() {
  const { designation, departmentName } = useAuth()
  const canManage = canManageCompetence(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [rows, setRows] = useState<MonitoringRecord[]>([])
  const [users, setUsers] = useState<TeamUserRecord[]>([])
  const [params, setParams] = useState<TestParameterOption[]>([])
  const [scopes, setScopes] = useState<ScopeOption[]>([])
  const [authorizedUserIds, setAuthorizedUserIds] = useState<Set<string>>(new Set())
  const [ptOptions, setPtOptions] = useState<PtOption[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  const [personFilter, setPersonFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 2)
    return d.toISOString().slice(0, 10)
  })

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const paramById = useMemo(() => new Map(params.map((p) => [p.id, p])), [params])
  const scopeById = useMemo(() => new Map(scopes.map((s) => [s.id, s])), [scopes])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase.from('competence_monitoring').select('*').order('performed_on', { ascending: false }).limit(1000)
      if (from) q = q.gte('performed_on', from)
      if (personFilter) q = q.eq('user_id', personFilter)
      if (resultFilter) q = q.eq('result', resultFilter)
      const { data, error: err } = await q
      if (err) {
        if (isCompetenceMissingError(err)) {
          setMissing(true)
          return
        }
        throw err
      }
      setMissing(false)
      setRows((data ?? []) as MonitoringRecord[])
      // People who hold a technical authorization: they are the ones to monitor (6.2.5 e).
      const { data: auth } = await supabase
        .from('personnel_authorizations')
        .select('user_id, activity')
        .eq('status', 'active')
        .in('activity', ['perform_test', 'calibrate', 'review_results'])
      setAuthorizedUserIds(new Set(((auth ?? []) as Array<{ user_id: string }>).map((a) => a.user_id)))
    } catch (err) {
      setError(errText(err))
    } finally {
      setLoading(false)
    }
  }, [from, personFilter, resultFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void fetchTeamUsers().then(setUsers).catch(() => setUsers([]))
    void loadTestParameterOptions().then(setParams).catch(() => setParams([]))
    void loadScopeOptions().then(setScopes)
  }, [])

  // PT participations of the chosen person (table from the PT module; may not exist yet).
  useEffect(() => {
    if (draft.method !== 'pt_ilc' || !draft.userId) {
      setPtOptions([])
      return
    }
    void supabase
      .from('pt_participations')
      .select('id, parameter, round_code, performance, reported_on')
      .eq('analyst_user_id', draft.userId)
      .order('reported_on', { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => setPtOptions(err ? [] : ((data ?? []) as PtOption[])))
  }, [draft.method, draft.userId])

  /** Last monitoring per person (from the loaded window) for the coverage list. */
  const coverage = useMemo(() => {
    const last = new Map<string, MonitoringRecord>()
    for (const r of rows) {
      const cur = last.get(r.user_id)
      if (!cur || r.performed_on > cur.performed_on) last.set(r.user_id, r)
    }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - MONITORING_INTERVAL_DAYS)
    const cutoffKey = cutoff.toISOString().slice(0, 10)
    const people = [...new Set([...authorizedUserIds, ...last.keys()])]
    return people
      .map((id) => {
        const r = last.get(id) ?? null
        return { id, last: r, due: !r || r.performed_on < cutoffKey }
      })
      .sort((a, b) => Number(b.due) - Number(a.due) || (userById.get(a.id)?.full_name ?? '').localeCompare(userById.get(b.id)?.full_name ?? ''))
  }, [rows, authorizedUserIds, userById])

  const save = async () => {
    if (!draft.userId || !draft.performedOn) {
      setMessage('Choose the person and the date.')
      return
    }
    if (draft.result !== 'satisfactory' && !draft.followUp.trim()) {
      setMessage('Enter the follow-up action (training, supervision, suspension of authorization).')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const pt = ptOptions.find((p) => p.id === draft.ptParticipationId)
      const { error: err } = await supabase.from('competence_monitoring').insert({
        user_id: draft.userId,
        method: draft.method,
        test_parameter_id: draft.targetKind === 'parameter' ? draft.testParameterId || null : null,
        calibration_scope_id: draft.targetKind === 'scope' ? draft.scopeId || null : null,
        performed_on: draft.performedOn,
        result: draft.result,
        reference: draft.reference.trim() || (pt ? `PT ${pt.round_code ?? ''} ${pt.parameter}`.trim() : null),
        pt_participation_id: draft.method === 'pt_ilc' ? draft.ptParticipationId || null : null,
        remarks: draft.remarks.trim() || null,
        follow_up: draft.followUp.trim() || null,
      })
      if (err) throw err
      setMessage(
        draft.result === 'satisfactory'
          ? 'Monitoring recorded.'
          : 'Monitoring recorded. Consider suspending the related authorization in the Authorization Matrix.',
      )
      setDraft((d) => ({ ...emptyDraft(), method: d.method, targetKind: d.targetKind }))
      await load()
    } catch (err) {
      setMessage(errText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: MonitoringRecord) => {
    const reason = await askReason({
      title: 'Reason for deleting a monitoring record',
      recordLabel: `${formatDate(r.performed_on)} · ${userById.get(r.user_id)?.full_name ?? ''}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered against the wrong person'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('competence_monitoring').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? errText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('competence_monitoring', r.id, reason)
    await load()
  }

  const targetText = (r: MonitoringRecord) =>
    r.test_parameter_id
      ? parameterLabel(paramById.get(r.test_parameter_id))
      : r.calibration_scope_id
        ? scopeLabel(scopeById.get(r.calibration_scope_id))
        : '—'

  const activeUsers = users.filter((u) => u.status.toLowerCase() !== 'inactive')

  return (
    <div className={limsPageShellClass}>
      <CompHeader
        title="Competence Monitoring"
        clause="6.2.5 (d, e)"
        subtitle="Supervision and ongoing monitoring of competence: witnessing, replicate / retained / blind samples, PT and record review."
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

      {!missing && canManage ? (
        <CompPanel title="Record monitoring">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Person *" htmlFor="cm-user">
              <CompSelect id="cm-user" value={draft.userId} onChange={(v) => setDraft({ ...draft, userId: v, ptParticipationId: '' })}>
                <option value="">— Choose —</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email} · {u.designation}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Method *" htmlFor="cm-method">
              <CompSelect id="cm-method" value={draft.method} onChange={(v) => setDraft({ ...draft, method: v as MonitoringMethod })}>
                {MONITORING_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Date *" htmlFor="cm-date">
              <Input id="cm-date" type="date" value={draft.performedOn} max={todayKey()} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, performedOn: e.target.value })} />
            </Field>
            <Field label="Result *" htmlFor="cm-result">
              <CompSelect id="cm-result" value={draft.result} onChange={(v) => setDraft({ ...draft, result: v as MonitoringResult })}>
                {MONITORING_RESULTS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Covers" htmlFor="cm-kind">
              <CompSelect id="cm-kind" value={draft.targetKind} onChange={(v) => setDraft({ ...draft, targetKind: v as Draft['targetKind'] })}>
                <option value="parameter">A test parameter</option>
                <option value="scope">A calibration scope line</option>
                <option value="none">General (no specific scope)</option>
              </CompSelect>
            </Field>
            {draft.targetKind === 'parameter' ? (
              <Field label="Test parameter" htmlFor="cm-param" className="sm:col-span-2 lg:col-span-3">
                <CompSelect id="cm-param" value={draft.testParameterId} onChange={(v) => setDraft({ ...draft, testParameterId: v })}>
                  <option value="">—</option>
                  {params.map((p) => (
                    <option key={p.id} value={p.id}>{parameterLabel(p)}</option>
                  ))}
                </CompSelect>
              </Field>
            ) : draft.targetKind === 'scope' ? (
              <Field label="Calibration scope line" htmlFor="cm-scope" className="sm:col-span-2 lg:col-span-3">
                <CompSelect id="cm-scope" value={draft.scopeId} onChange={(v) => setDraft({ ...draft, scopeId: v })}>
                  <option value="">—</option>
                  {scopes.map((s) => (
                    <option key={s.id} value={s.id}>{scopeLabel(s)}</option>
                  ))}
                </CompSelect>
              </Field>
            ) : (
              <div className="hidden lg:col-span-3 lg:block" />
            )}
            {draft.method === 'pt_ilc' ? (
              <Field label="PT participation" htmlFor="cm-pt" className="sm:col-span-2">
                <CompSelect id="cm-pt" value={draft.ptParticipationId} onChange={(v) => setDraft({ ...draft, ptParticipationId: v })}>
                  <option value="">{ptOptions.length ? '— Choose —' : 'No PT rounds recorded for this person'}</option>
                  {ptOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.round_code ?? ''} {p.parameter} · {p.performance ?? 'pending'} {p.reported_on ? `· ${formatDate(p.reported_on)}` : ''}
                    </option>
                  ))}
                </CompSelect>
              </Field>
            ) : null}
            <Field label="Reference (sample / SRF / report no.)" htmlFor="cm-ref" className="sm:col-span-2">
              <Input id="cm-ref" value={draft.reference} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
            </Field>
            <Field label="Observations" htmlFor="cm-rem" className="sm:col-span-2">
              <Input id="cm-rem" value={draft.remarks} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
            </Field>
            <Field label={draft.result === 'satisfactory' ? 'Follow-up' : 'Follow-up *'} htmlFor="cm-fu" className="sm:col-span-2">
              <Input id="cm-fu" value={draft.followUp} className={compInputClass}
                placeholder={draft.result === 'satisfactory' ? '' : 'Retraining, supervision, suspension…'}
                onChange={(e) => setDraft({ ...draft, followUp: e.target.value })} />
            </Field>
          </div>
          <div className="mt-2 flex justify-end">
            <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </CompPanel>
      ) : null}

      {!missing && coverage.length ? (
        <CompPanel title={`Coverage · ${coverage.filter((c) => c.due).length} due (no monitoring in ${MONITORING_INTERVAL_DAYS} days)`}>
          <div className="flex flex-wrap gap-1.5">
            {coverage.map((c) => (
              <button key={c.id} type="button" onClick={() => setPersonFilter(c.id)}
                className={cn('border px-2 py-1 text-left text-[12px]', c.due ? 'border-red-600/50 bg-red-50' : 'border-emerald-600/40 bg-emerald-50')}>
                <span className="font-semibold">{userById.get(c.id)?.full_name ?? 'Unknown'}</span>
                <span className="block text-[11px] text-stone-600">
                  {c.last ? `${formatDate(c.last.performed_on)} · ${labelOf(MONITORING_RESULTS, c.last.result)}` : 'Not monitored'}
                </span>
              </button>
            ))}
          </div>
        </CompPanel>
      ) : null}

      {!missing ? (
        <CompPanel title={`Monitoring records (${rows.length})`}>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Person" htmlFor="cf-user" className="col-span-2 sm:col-span-1">
              <CompSelect id="cf-user" value={personFilter} onChange={setPersonFilter}>
                <option value="">Everyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Result" htmlFor="cf-result">
              <CompSelect id="cf-result" value={resultFilter} onChange={setResultFilter}>
                <option value="">All</option>
                {MONITORING_RESULTS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="From" htmlFor="cf-from">
              <Input id="cf-from" type="date" value={from} className={compInputClass} onChange={(e) => setFrom(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-1.5 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className={compCardClass}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{userById.get(r.user_id)?.full_name ?? '—'}</p>
                  <Badge tone={RESULT_TONE[r.result]}>{labelOf(MONITORING_RESULTS, r.result)}</Badge>
                </div>
                <p className="text-[12px] text-stone-600">{formatDate(r.performed_on)} · {labelOf(MONITORING_METHODS, r.method)}</p>
                <p className="text-[12px]">{targetText(r)}</p>
                {r.remarks ? <p className="text-[12px] italic">{r.remarks}</p> : null}
                {r.follow_up ? <p className="text-[12px] text-amber-900">Follow-up: {r.follow_up}</p> : null}
                <p className="text-[11px] text-stone-500">Observed by {r.observed_by_name ?? '—'}</p>
                {isDirector ? (
                  <div className="mt-1 flex justify-end">
                    <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10')} aria-label="Delete" onClick={() => void remove(r)}>
                      <Trash2 className="h-4 w-4 text-red-700" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={compThClass}>Date</th>
                  <th className={compThClass}>Person</th>
                  <th className={compThClass}>Method</th>
                  <th className={compThClass}>Parameter / scope</th>
                  <th className={compThClass}>Result</th>
                  <th className={compThClass}>Reference / observations</th>
                  <th className={compThClass}>Follow-up</th>
                  <th className={compThClass}>Observed by</th>
                  {isDirector ? <th className={compThClass} /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                    <td className={cn(compTdClass, 'whitespace-nowrap')}>{formatDate(r.performed_on)}</td>
                    <td className={compTdClass}>{userById.get(r.user_id)?.full_name ?? '—'}</td>
                    <td className={compTdClass}>{labelOf(MONITORING_METHODS, r.method)}</td>
                    <td className={compTdClass}>{targetText(r)}</td>
                    <td className={cn(compTdClass, 'text-center')}><Badge tone={RESULT_TONE[r.result]}>{labelOf(MONITORING_RESULTS, r.result)}</Badge></td>
                    <td className={cn(compTdClass, 'text-[11.5px]')}>
                      {r.reference ? <div className="font-mono text-amber-800">{r.reference}</div> : null}
                      {r.remarks || (r.reference ? null : '—')}
                    </td>
                    <td className={cn(compTdClass, 'text-[11.5px]')}>{r.follow_up || '—'}</td>
                    <td className={compTdClass}>{r.observed_by_name || '—'}</td>
                    {isDirector ? (
                      <td className={cn(compTdClass, 'text-center')}>
                        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} aria-label="Delete" onClick={() => void remove(r)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-700" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No monitoring records for these filters.</p> : null}
        </CompPanel>
      ) : null}
    </div>
  )
}
