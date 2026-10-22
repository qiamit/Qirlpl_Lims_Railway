import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Loader2, PauseCircle, PlayCircle, Printer, RefreshCw, Save, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { printViaIframe } from '@/features/general-requirements/shared'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { AUTHORIZATION_ACTIVITIES, authorizationActivityLabel, type AuthorizationActivity } from '@/lib/authorizationCheck'
import { fetchTeamUsers, type TeamUserRecord } from '@/lib/fetchTeamUsers'
import { escapeHtml } from '@/lib/htmlText'
import { limsDarkBarBtnClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
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
  compTextareaClass,
  compThClass,
} from './CompetenceUi'
import {
  authorizationScopeText,
  authorizationState,
  canAuthorize,
  errText,
  isAuthorizationCurrent,
  isCompetenceMissingError,
  loadScopeOptions,
  loadTestParameterOptions,
  parameterLabel,
  scopeLabel,
  todayKey,
  type AuthorizationException,
  type AuthorizationRow,
  type AuthorizationState,
  type ScopeOption,
  type TestParameterOption,
} from './competenceShared'

type ScopeMode = 'whole' | 'parameter' | 'scope' | 'group'
type View = 'matrix' | 'list' | 'exceptions'

type Draft = {
  userId: string
  activities: AuthorizationActivity[]
  scopeMode: ScopeMode
  parameterIds: string[]
  scopeIds: string[]
  groupKind: '' | 'testing' | 'calibration'
  discipline: string
  groupName: string
  validFrom: string
  validTo: string
  basis: string
  remarks: string
}

const emptyDraft = (): Draft => ({
  userId: '',
  activities: [],
  scopeMode: 'parameter',
  parameterIds: [],
  scopeIds: [],
  groupKind: 'testing',
  discipline: '',
  groupName: '',
  validFrom: todayKey(),
  validTo: '',
  basis: '',
  remarks: '',
})

const STATE_BADGE: Record<AuthorizationState, { tone: string; label: string }> = {
  current: { tone: 'green', label: 'Active' },
  future: { tone: 'blue', label: 'Not yet valid' },
  expired: { tone: 'grey', label: 'Expired' },
  suspended: { tone: 'amber', label: 'Suspended' },
  withdrawn: { tone: 'red', label: 'Withdrawn' },
}

function targetKey(a: AuthorizationRow): string {
  if (a.test_parameter_id) return `p:${a.test_parameter_id}`
  if (a.calibration_scope_id) return `s:${a.calibration_scope_id}`
  if (a.discipline || a.group_name) return `g:${a.scope_kind ?? ''}:${(a.discipline ?? '').toLowerCase()}:${(a.group_name ?? '').toLowerCase()}`
  return 'w'
}

export default function AuthorizationMatrixPage() {
  const { designation, departmentName } = useAuth()
  const mayAuthorize = canAuthorize(designation, departmentName)
  const askReason = useReasonForChange()

  const [grants, setGrants] = useState<AuthorizationRow[]>([])
  const [exceptions, setExceptions] = useState<AuthorizationException[]>([])
  const [users, setUsers] = useState<TeamUserRecord[]>([])
  const [params, setParams] = useState<TestParameterOption[]>([])
  const [scopes, setScopes] = useState<ScopeOption[]>([])
  const [basisHints, setBasisHints] = useState<string[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [paramSearch, setParamSearch] = useState('')

  const [view, setView] = useState<View>('matrix')
  const [activityFilter, setActivityFilter] = useState<'' | AuthorizationActivity>('')
  const [personFilter, setPersonFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editValidTo, setEditValidTo] = useState('')
  const [editBasis, setEditBasis] = useState('')

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const paramById = useMemo(() => new Map(params.map((p) => [p.id, p])), [params])
  const scopeById = useMemo(() => new Map(scopes.map((s) => [s.id, s])), [scopes])
  const today = todayKey()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('personnel_authorizations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000)
      if (err) {
        if (isCompetenceMissingError(err)) {
          setMissing(true)
          return
        }
        throw err
      }
      setMissing(false)
      setGrants((data ?? []) as AuthorizationRow[])
      const ex = await supabase
        .from('authorization_exceptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      setExceptions(ex.error ? [] : ((ex.data ?? []) as AuthorizationException[]))
    } catch (err) {
      setError(errText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void fetchTeamUsers().then(setUsers).catch(() => setUsers([]))
    void loadTestParameterOptions().then(setParams).catch(() => setParams([]))
    void loadScopeOptions().then(setScopes)
  }, [])

  // Basis suggestions: the person's trainings (passed) and satisfactory monitoring.
  useEffect(() => {
    if (!draft.userId) {
      setBasisHints([])
      return
    }
    void (async () => {
      const hints: string[] = []
      const tr = await supabase
        .from('training_attendees')
        .select('passed, training_records(record_no, title)')
        .eq('user_id', draft.userId)
      for (const r of (tr.data ?? []) as unknown as Array<{ passed: boolean | null; training_records: { record_no: string | null; title: string } | null }>) {
        if (r.training_records && r.passed !== false) hints.push(`Training ${r.training_records.record_no ?? ''} ${r.training_records.title}`.trim())
      }
      const mon = await supabase
        .from('competence_monitoring')
        .select('method, performed_on, result')
        .eq('user_id', draft.userId)
        .eq('result', 'satisfactory')
        .order('performed_on', { ascending: false })
        .limit(10)
      for (const m of (mon.data ?? []) as Array<{ method: string; performed_on: string }>) {
        hints.push(`${m.method.replace(/_/g, ' ')} ${formatDate(m.performed_on)} satisfactory`)
      }
      setBasisHints(hints)
    })()
  }, [draft.userId])

  const disciplineOptions = useMemo(() => {
    const set = new Set<string>()
    if (draft.groupKind !== 'calibration') params.forEach((p) => p.department && set.add(p.department.trim()))
    if (draft.groupKind !== 'testing') scopes.forEach((s) => s.discipline_name && set.add(s.discipline_name.trim()))
    return [...set].filter(Boolean).sort()
  }, [params, scopes, draft.groupKind])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    if (draft.groupKind !== 'calibration') params.forEach((p) => p.is_code_label && set.add(p.is_code_label.trim()))
    if (draft.groupKind !== 'testing') scopes.forEach((s) => s.group_name && set.add(s.group_name.trim()))
    return [...set].filter(Boolean).sort()
  }, [params, scopes, draft.groupKind])

  const filteredParams = useMemo(() => {
    const s = paramSearch.trim().toLowerCase()
    const list = s
      ? params.filter((p) => [p.item_name, p.is_code_label, p.department, p.test_method].some((v) => (v ?? '').toLowerCase().includes(s)))
      : params
    return list.slice(0, 200)
  }, [params, paramSearch])

  const visibleGrants = useMemo(
    () =>
      grants.filter(
        (g) =>
          (showAll || isAuthorizationCurrent(g, today)) &&
          (!activityFilter || g.activity === activityFilter) &&
          (!personFilter || g.user_id === personFilter),
      ),
    [grants, showAll, activityFilter, personFilter, today],
  )

  /** Matrix: targets (rows) x people (columns) -> activities. */
  const matrix = useMemo(() => {
    const people = [...new Set(visibleGrants.map((g) => g.user_id))].sort((a, b) =>
      (userById.get(a)?.full_name ?? '').localeCompare(userById.get(b)?.full_name ?? ''),
    )
    const targets = new Map<string, { label: string; sort: string; cells: Map<string, AuthorizationRow[]> }>()
    for (const g of visibleGrants) {
      const key = targetKey(g)
      let t = targets.get(key)
      if (!t) {
        const label = authorizationScopeText(g, paramById, scopeById)
        t = { label, sort: `${key === 'w' ? '0' : key.startsWith('g') ? '1' : '2'}${label.toLowerCase()}`, cells: new Map() }
        targets.set(key, t)
      }
      t.cells.set(g.user_id, [...(t.cells.get(g.user_id) ?? []), g])
    }
    return { people, targets: [...targets.values()].sort((a, b) => a.sort.localeCompare(b.sort)) }
  }, [visibleGrants, userById, paramById, scopeById])

  const toggleActivity = (a: AuthorizationActivity) =>
    setDraft((d) => ({
      ...d,
      activities: d.activities.includes(a) ? d.activities.filter((x) => x !== a) : [...d.activities, a],
    }))

  const grant = async () => {
    if (!draft.userId || draft.activities.length === 0) {
      setMessage('Choose the person and at least one activity.')
      return
    }
    if (draft.scopeMode === 'parameter' && draft.parameterIds.length === 0) {
      setMessage('Choose at least one test parameter.')
      return
    }
    if (draft.scopeMode === 'scope' && draft.scopeIds.length === 0) {
      setMessage('Choose at least one calibration scope line.')
      return
    }
    if (draft.scopeMode === 'group' && !draft.discipline.trim() && !draft.groupName.trim()) {
      setMessage('Enter a discipline or a group.')
      return
    }
    if (draft.validTo && draft.validTo < draft.validFrom) {
      setMessage('"Valid to" is before "Valid from".')
      return
    }
    if (!draft.basis.trim()) {
      setMessage('Enter the basis (training, monitoring, PT) for the authorization.')
      return
    }
    const base = {
      user_id: draft.userId,
      valid_from: draft.validFrom,
      valid_to: draft.validTo || null,
      basis: draft.basis.trim(),
      remarks: draft.remarks.trim() || null,
    }
    type TargetFields = Pick<AuthorizationRow, 'test_parameter_id' | 'calibration_scope_id' | 'scope_kind' | 'discipline' | 'group_name'>
    const none: TargetFields = { test_parameter_id: null, calibration_scope_id: null, scope_kind: null, discipline: null, group_name: null }
    const targets: TargetFields[] =
      draft.scopeMode === 'parameter'
        ? draft.parameterIds.map((id) => ({ ...none, test_parameter_id: id, scope_kind: 'testing' }))
        : draft.scopeMode === 'scope'
          ? draft.scopeIds.map((id) => ({ ...none, calibration_scope_id: id, scope_kind: 'calibration' }))
          : draft.scopeMode === 'group'
            ? [{ ...none, scope_kind: draft.groupKind || null, discipline: draft.discipline.trim() || null, group_name: draft.groupName.trim() || null }]
            : [none]
    const rows = draft.activities.flatMap((activity) => targets.map((t) => ({ ...base, ...t, activity })))
    // Skip grants the person already holds (same activity and target, active).
    const existing = new Set(
      grants.filter((g) => g.user_id === draft.userId && g.status === 'active').map((g) => `${g.activity}|${targetKey(g)}`),
    )
    const fresh = rows.filter((r) => !existing.has(`${r.activity}|${targetKey(r as AuthorizationRow)}`))
    if (fresh.length === 0) {
      setMessage('These authorizations already exist and are active.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const { error: err } = await supabase.from('personnel_authorizations').insert(fresh)
      if (err) throw err
      setMessage(
        `${fresh.length} authorization(s) granted to ${userById.get(draft.userId)?.full_name ?? 'the person'}` +
          (fresh.length < rows.length ? ` (${rows.length - fresh.length} already held).` : '.'),
      )
      setDraft((d) => ({ ...emptyDraft(), userId: d.userId }))
      setFormOpen(false)
      await load()
    } catch (err) {
      setMessage(errText(err))
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (g: AuthorizationRow, status: 'active' | 'suspended' | 'withdrawn') => {
    const who = userById.get(g.user_id)?.full_name ?? ''
    const reason = await askReason({
      title:
        status === 'withdrawn'
          ? 'Withdraw authorization'
          : status === 'suspended'
            ? 'Suspend authorization'
            : 'Reactivate authorization',
      recordLabel: `${who} · ${authorizationActivityLabel(g.activity)} · ${authorizationScopeText(g, paramById, scopeById)}`,
      description: status === 'withdrawn' ? 'A withdrawn authorization cannot be reactivated; grant a new one if needed.' : undefined,
      confirmLabel: status === 'withdrawn' ? 'Withdraw' : status === 'suspended' ? 'Suspend' : 'Reactivate',
      quickPicks:
        status === 'active'
          ? ['Retraining completed', 'Satisfactory witnessing after suspension']
          : ['Unsatisfactory monitoring result', 'Unsatisfactory PT / ILC', 'Left the section', 'Long absence from the activity'],
    })
    if (!reason) return
    const { error: err } = await supabase
      .from('personnel_authorizations')
      .update(status === 'active' ? { status } : { status, withdrawn_reason: reason })
      .eq('id', g.id)
    if (err) {
      setMessage(errText(err))
      return
    }
    await recordReason('personnel_authorizations', g.id, reason)
    await load()
  }

  const saveEdit = async (g: AuthorizationRow) => {
    if (editValidTo && editValidTo < g.valid_from) {
      setMessage('"Valid to" is before "Valid from".')
      return
    }
    const reason = await askReason({
      title: 'Reason for changing an authorization',
      recordLabel: `${userById.get(g.user_id)?.full_name ?? ''} · ${authorizationActivityLabel(g.activity)}`,
      quickPicks: ['Renewed after re-evaluation', 'Basis updated', 'Validity corrected'],
    })
    if (!reason) return
    const { error: err } = await supabase
      .from('personnel_authorizations')
      .update({ valid_to: editValidTo || null, basis: editBasis.trim() || null })
      .eq('id', g.id)
    if (err) {
      setMessage(errText(err))
      return
    }
    await recordReason('personnel_authorizations', g.id, reason)
    setEditId(null)
    await load()
  }

  const printList = () => {
    const current = grants.filter((g) => isAuthorizationCurrent(g, today))
    const byPerson = new Map<string, AuthorizationRow[]>()
    for (const g of current) byPerson.set(g.user_id, [...(byPerson.get(g.user_id) ?? []), g])
    const people = [...byPerson.keys()].sort((a, b) => (userById.get(a)?.full_name ?? '').localeCompare(userById.get(b)?.full_name ?? ''))
    let n = 0
    const body = people
      .map((uid) => {
        const u = userById.get(uid)
        const list = (byPerson.get(uid) ?? []).sort(
          (a, b) =>
            AUTHORIZATION_ACTIVITIES.findIndex((x) => x.value === a.activity) - AUTHORIZATION_ACTIVITIES.findIndex((x) => x.value === b.activity),
        )
        return list
          .map((g, i) => {
            n += 1
            const person =
              i === 0
                ? `<td rowspan="${list.length}">${n}</td><td rowspan="${list.length}"><b>${escapeHtml(u?.full_name ?? uid)}</b><br>${escapeHtml(u?.designation ?? '')}<br>${escapeHtml(u?.department_name ?? '')}</td>`
                : ''
            return `<tr>${person}<td>${escapeHtml(authorizationActivityLabel(g.activity))}</td><td>${escapeHtml(authorizationScopeText(g, paramById, scopeById))}</td><td>${escapeHtml(formatDate(g.valid_from))} – ${g.valid_to ? escapeHtml(formatDate(g.valid_to)) : 'until withdrawn'}</td><td>${escapeHtml(g.authorized_by_name ?? '')}<br>${escapeHtml(formatDate(g.authorized_on))}</td><td>${escapeHtml(g.basis ?? '')}</td></tr>`
          })
          .join('')
      })
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Authorization list</title>
<style>@page{size:A4 landscape;margin:12mm}body{font-family:sans-serif;font-size:10.5px}h1{font-size:15px;margin:0}p.sub{margin:2px 0 8px;color:#444}table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}.sign{margin-top:36px;display:flex;justify-content:space-between}</style>
</head><body><h1>List of authorized personnel (ISO/IEC 17025 6.2.5 f, 6.2.6)</h1>
<p class="sub">Authorizations in force on ${escapeHtml(formatDate(today))}. Printed ${escapeHtml(formatDateTime(new Date().toISOString()))}.</p>
<table><thead><tr><th>#</th><th>Name / designation</th><th>Authorized for</th><th>Scope (parameter / group)</th><th>Valid</th><th>Authorized by / on</th><th>Basis</th></tr></thead><tbody>${body || '<tr><td colspan="7">No authorizations in force.</td></tr>'}</tbody></table>
<div class="sign"><span>Quality Manager: ______________________</span><span>Laboratory Director: ______________________</span></div>
</body></html>`)
  }

  const activeUsers = users.filter((u) => u.status.toLowerCase() !== 'inactive')
  const exceptionCount30 = exceptions.filter((e) => Date.now() - new Date(e.created_at).getTime() < 30 * 86400000).length

  return (
    <div className={limsPageShellClass}>
      <CompHeader
        title="Authorization Matrix"
        clause="6.2.5 (f), 6.2.6"
        subtitle="Who is authorized to test, review, sign reports, give opinions, calibrate, sign certificates, and develop or validate methods."
        actions={
          <>
            {mayAuthorize && !missing ? (
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => setFormOpen((v) => !v)}>
                <ShieldCheck className="h-4 w-4" /> Grant
              </Button>
            ) : null}
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={printList} disabled={missing}>
              <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print list</span>
            </Button>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />
      {missing ? <MissingMigrationNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />
      {!missing ? (
        <MessageLine
          text={
            'Enforcement: an activity with no active authorizations only warns (with a reason) when an unlisted person is assigned. ' +
            'Once an activity has at least one active authorization, unlisted people are blocked; only the Laboratory Director can override, with a reason.'
          }
        />
      ) : null}
      <datalist id="am-disciplines">
        {disciplineOptions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id="am-groups">
        {groupOptions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id="am-basis">
        {basisHints.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {formOpen && mayAuthorize && !missing ? (
        <CompPanel
          title="Grant authorization"
          right={
            <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => setFormOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Person *" htmlFor="am-user" className="sm:col-span-2">
              <CompSelect id="am-user" value={draft.userId} onChange={(v) => setDraft({ ...draft, userId: v })}>
                <option value="">— Choose —</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email} · {u.designation} · {u.department_name}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Valid from *" htmlFor="am-from">
              <Input id="am-from" type="date" value={draft.validFrom} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} />
            </Field>
            <Field label="Valid to (blank = until withdrawn)" htmlFor="am-to">
              <Input id="am-to" type="date" value={draft.validTo} min={draft.validFrom} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, validTo: e.target.value })} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Activities *</p>
              <div className="flex flex-wrap gap-1.5">
                {AUTHORIZATION_ACTIVITIES.map((a) => (
                  <label key={a.value}
                    className={cn('flex min-h-10 cursor-pointer items-center gap-2 border px-2 text-[13px] sm:min-h-8',
                      draft.activities.includes(a.value) ? 'border-amber-600 bg-amber-50' : 'border-stone-400 bg-white')}>
                    <input type="checkbox" className="h-4 w-4" checked={draft.activities.includes(a.value)} onChange={() => toggleActivity(a.value)} />
                    {a.label}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Scope" htmlFor="am-mode">
              <CompSelect id="am-mode" value={draft.scopeMode} onChange={(v) => setDraft({ ...draft, scopeMode: v as ScopeMode })}>
                <option value="parameter">Test parameters</option>
                <option value="scope">Calibration scope lines</option>
                <option value="group">Discipline / group</option>
                <option value="whole">Whole activity (all scope)</option>
              </CompSelect>
            </Field>
            {draft.scopeMode === 'group' ? (
              <>
                <Field label="Applies to" htmlFor="am-gkind">
                  <CompSelect id="am-gkind" value={draft.groupKind} onChange={(v) => setDraft({ ...draft, groupKind: v as Draft['groupKind'] })}>
                    <option value="testing">Testing</option>
                    <option value="calibration">Calibration</option>
                    <option value="">Both</option>
                  </CompSelect>
                </Field>
                <Field label="Discipline (dept.)" htmlFor="am-disc">
                  <Input id="am-disc" list="am-disciplines" value={draft.discipline} className={compInputClass}
                    onChange={(e) => setDraft({ ...draft, discipline: e.target.value })} />
                </Field>
                <Field label={draft.groupKind === 'calibration' ? 'Group' : 'Group (IS code)'} htmlFor="am-group">
                  <Input id="am-group" list="am-groups" value={draft.groupName} className={compInputClass}
                    onChange={(e) => setDraft({ ...draft, groupName: e.target.value })} />
                </Field>
              </>
            ) : (
              <div className="hidden lg:col-span-3 lg:block" />
            )}
            {draft.scopeMode === 'parameter' ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Input value={paramSearch} placeholder="Search parameter, IS code, department" aria-label="Search parameters"
                    className={cn(compInputClass, 'max-w-sm')} onChange={(e) => setParamSearch(e.target.value)} />
                  <span className="text-[12px] text-stone-600">{draft.parameterIds.length} selected</span>
                  {draft.parameterIds.length ? (
                    <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-8 px-2 text-[12px]')} onClick={() => setDraft({ ...draft, parameterIds: [] })}>
                      Clear
                    </Button>
                  ) : null}
                </div>
                <div className="max-h-64 overflow-y-auto border border-stone-400 bg-white">
                  {filteredParams.map((p) => (
                    <label key={p.id} className="flex min-h-10 cursor-pointer items-center gap-2 border-b border-stone-200 px-2 text-[13px] sm:min-h-8">
                      <input type="checkbox" className="h-4 w-4" checked={draft.parameterIds.includes(p.id)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            parameterIds: e.target.checked ? [...d.parameterIds, p.id] : d.parameterIds.filter((x) => x !== p.id),
                          }))
                        } />
                      <span className="min-w-0 flex-1">{parameterLabel(p)}</span>
                      <span className="text-[11px] text-stone-500">{p.department}</span>
                    </label>
                  ))}
                  {filteredParams.length === 0 ? <p className="p-2 text-[12px] text-stone-500">No parameters match.</p> : null}
                </div>
              </div>
            ) : null}
            {draft.scopeMode === 'scope' ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="max-h-64 overflow-y-auto border border-stone-400 bg-white">
                  {scopes.map((s) => (
                    <label key={s.id} className="flex min-h-10 cursor-pointer items-center gap-2 border-b border-stone-200 px-2 text-[13px] sm:min-h-8">
                      <input type="checkbox" className="h-4 w-4" checked={draft.scopeIds.includes(s.id)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            scopeIds: e.target.checked ? [...d.scopeIds, s.id] : d.scopeIds.filter((x) => x !== s.id),
                          }))
                        } />
                      <span className="min-w-0 flex-1">{scopeLabel(s)}</span>
                      <span className="text-[11px] text-stone-500">{s.discipline_name}</span>
                    </label>
                  ))}
                  {scopes.length === 0 ? <p className="p-2 text-[12px] text-stone-500">No calibration scope lines.</p> : null}
                </div>
              </div>
            ) : null}
            <Field label="Basis * (training, monitoring, PT)" htmlFor="am-basis-in" className="sm:col-span-2">
              <Input id="am-basis-in" list="am-basis" value={draft.basis} className={compInputClass}
                placeholder="e.g. TR-2026-004; witnessing 12-03-2026 satisfactory"
                onChange={(e) => setDraft({ ...draft, basis: e.target.value })} />
            </Field>
            <Field label="Remarks" htmlFor="am-rem" className="sm:col-span-2">
              <Textarea id="am-rem" value={draft.remarks} className={cn(compTextareaClass, 'min-h-10')}
                onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
            </Field>
          </div>
          <div className="mt-2 flex justify-end">
            <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void grant()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Grant
            </Button>
          </div>
        </CompPanel>
      ) : null}

      {!missing ? (
        <CompPanel
          title={
            view === 'exceptions'
              ? `Exceptions (${exceptions.length}) · ${exceptionCount30} in the last 30 days`
              : `${showAll ? 'All' : 'Current'} authorizations (${visibleGrants.length})`
          }
          right={
            <div className="flex flex-wrap gap-1">
              {(['matrix', 'list', 'exceptions'] as View[]).map((v) => (
                <Button key={v} variant="outline" className={cn(limsDarkBarBtnClass, 'h-7 px-2 text-[12px]', view === v && 'bg-amber-500/30 text-white')}
                  onClick={() => setView(v)}>
                  {v === 'matrix' ? 'Matrix' : v === 'list' ? 'List' : 'Exceptions'}
                </Button>
              ))}
            </div>
          }
        >
          {view !== 'exceptions' ? (
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Activity" htmlFor="af-act">
                <CompSelect id="af-act" value={activityFilter} onChange={(v) => setActivityFilter(v as '' | AuthorizationActivity)}>
                  <option value="">All activities</option>
                  {AUTHORIZATION_ACTIVITIES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </CompSelect>
              </Field>
              <Field label="Person" htmlFor="af-user">
                <CompSelect id="af-user" value={personFilter} onChange={setPersonFilter}>
                  <option value="">Everyone</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </CompSelect>
              </Field>
              <label className="col-span-2 flex min-h-10 items-end gap-2 pb-1.5 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                Include suspended, withdrawn and expired
              </label>
            </div>
          ) : null}

          {view === 'matrix' ? (
            <>
              <p className="mb-2 text-[11.5px] text-stone-600">
                Codes: {AUTHORIZATION_ACTIVITIES.map((a) => `${a.short} = ${a.label}`).join(' · ')}
              </p>
              {/* Phones: one card per person */}
              <div className="space-y-1.5 md:hidden">
                {matrix.people.map((uid) => (
                  <div key={uid} className={compCardClass}>
                    <p className="font-semibold">{userById.get(uid)?.full_name ?? 'Unknown'} <span className="font-normal text-stone-600">· {userById.get(uid)?.designation}</span></p>
                    <ul className="mt-1 space-y-0.5">
                      {matrix.targets
                        .filter((t) => t.cells.has(uid))
                        .map((t) => (
                          <li key={t.label} className="text-[12.5px]">
                            <span className="font-semibold text-amber-900">
                              {(t.cells.get(uid) ?? []).map((g) => AUTHORIZATION_ACTIVITIES.find((a) => a.value === g.activity)?.short ?? g.activity).join(', ')}
                            </span>{' '}
                            · {t.label}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="border-collapse font-jakarta">
                  <thead>
                    <tr>
                      <th className={cn(compThClass, 'sticky left-0 z-10 min-w-[260px] text-left')}>Parameter / scope group</th>
                      {matrix.people.map((uid) => (
                        <th key={uid} className={cn(compThClass, 'min-w-[110px] normal-case tracking-normal')}>
                          {userById.get(uid)?.full_name ?? 'Unknown'}
                          <div className="text-[10px] font-normal text-stone-300">{userById.get(uid)?.designation}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.targets.map((t, i) => (
                      <tr key={t.label + i} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                        <td className={cn(compTdClass, 'sticky left-0 z-[1] bg-inherit font-semibold')}>{t.label}</td>
                        {matrix.people.map((uid) => {
                          const cell = t.cells.get(uid) ?? []
                          return (
                            <td key={uid} className={cn(compTdClass, 'text-center')}>
                              <div className="flex flex-wrap justify-center gap-0.5">
                                {cell.map((g) => {
                                  const st = authorizationState(g, today)
                                  return (
                                    <span key={g.id} title={`${authorizationActivityLabel(g.activity)} · ${STATE_BADGE[st].label} · ${formatDate(g.valid_from)}${g.valid_to ? ` – ${formatDate(g.valid_to)}` : ''}`}
                                      className={cn('border px-1 text-[10.5px] font-bold',
                                        st === 'current' ? 'border-emerald-700/40 bg-emerald-100 text-emerald-800'
                                          : st === 'suspended' ? 'border-amber-700/40 bg-amber-100 text-amber-900'
                                            : 'border-stone-400 bg-stone-100 text-stone-500 line-through')}>
                                      {AUTHORIZATION_ACTIVITIES.find((a) => a.value === g.activity)?.short ?? g.activity}
                                    </span>
                                  )
                                })}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {matrix.targets.length === 0 && !loading ? (
                <p className="p-4 text-center text-[13px] text-stone-600">
                  No authorizations yet. Until an activity has at least one, assignments to it only warn.
                </p>
              ) : null}
            </>
          ) : null}

          {view === 'list' ? (
            <div className="space-y-1.5">
              {visibleGrants.map((g) => {
                const st = authorizationState(g, today)
                const u = userById.get(g.user_id)
                return (
                  <div key={g.id} className={cn(compCardClass, st !== 'current' && 'bg-stone-50')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {u?.full_name ?? 'Unknown'} · <span className="text-amber-900">{authorizationActivityLabel(g.activity)}</span>
                        </p>
                        <p className="text-[12.5px]">{authorizationScopeText(g, paramById, scopeById)}</p>
                        <p className="text-[11.5px] text-stone-600">
                          {formatDate(g.valid_from)} – {g.valid_to ? formatDate(g.valid_to) : 'until withdrawn'} · by {g.authorized_by_name ?? '—'} on {formatDate(g.authorized_on)}
                        </p>
                        {g.basis ? <p className="text-[11.5px] text-stone-600">Basis: {g.basis}</p> : null}
                        {g.withdrawn_reason ? <p className="text-[11.5px] text-red-800">Reason: {g.withdrawn_reason}</p> : null}
                      </div>
                      <Badge tone={STATE_BADGE[st].tone}>{STATE_BADGE[st].label}</Badge>
                    </div>
                    {editId === g.id ? (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Field label="Valid to" htmlFor={`ed-to-${g.id}`}>
                          <Input id={`ed-to-${g.id}`} type="date" value={editValidTo} min={g.valid_from} className={compInputClass}
                            onChange={(e) => setEditValidTo(e.target.value)} />
                        </Field>
                        <Field label="Basis" htmlFor={`ed-basis-${g.id}`} className="sm:col-span-2">
                          <Input id={`ed-basis-${g.id}`} value={editBasis} className={compInputClass} onChange={(e) => setEditBasis(e.target.value)} />
                        </Field>
                        <div className="flex justify-end gap-1 sm:col-span-3">
                          <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-8')} onClick={() => setEditId(null)}>Cancel</Button>
                          <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void saveEdit(g)}>
                            <Save className="h-4 w-4" /> Save
                          </Button>
                        </div>
                      </div>
                    ) : mayAuthorize && g.status !== 'withdrawn' ? (
                      <div className="mt-1 flex flex-wrap justify-end gap-1">
                        <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 px-2 text-[12px] sm:h-7')}
                          onClick={() => { setEditId(g.id); setEditValidTo(g.valid_to ?? ''); setEditBasis(g.basis ?? '') }}>
                          Renew / edit
                        </Button>
                        {g.status === 'active' ? (
                          <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 px-2 text-[12px] sm:h-7')} onClick={() => void changeStatus(g, 'suspended')}>
                            <PauseCircle className="h-3.5 w-3.5" /> Suspend
                          </Button>
                        ) : (
                          <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 px-2 text-[12px] sm:h-7')} onClick={() => void changeStatus(g, 'active')}>
                            <PlayCircle className="h-3.5 w-3.5" /> Reactivate
                          </Button>
                        )}
                        <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 px-2 text-[12px] text-red-800 sm:h-7')} onClick={() => void changeStatus(g, 'withdrawn')}>
                          <Ban className="h-3.5 w-3.5" /> Withdraw
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {visibleGrants.length === 0 && !loading ? <p className="p-4 text-center text-[13px] text-stone-600">No authorizations for these filters.</p> : null}
            </div>
          ) : null}

          {view === 'exceptions' ? (
            <>
              <p className="mb-2 text-[12px] text-stone-600">
                Assignments made without a matching authorization: “Warned” while the matrix was not in use for that activity,
                “Override” by the Laboratory Director while it was. Review these when updating the matrix.
              </p>
              <div className="space-y-1.5 md:hidden">
                {exceptions.map((e) => (
                  <div key={e.id} className={compCardClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{e.user_name ?? '—'} · {authorizationActivityLabel(e.activity)}</p>
                      <Badge tone={e.mode === 'override' ? 'red' : 'amber'}>{e.mode === 'override' ? 'Override' : 'Warned'}</Badge>
                    </div>
                    <p className="text-[12px] text-stone-600">{formatDateTime(e.created_at)} · by {e.created_by_name ?? '—'}{e.record_label ? ` · ${e.record_label}` : ''}</p>
                    <p className="text-[12.5px]">{e.reason}</p>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] border-collapse font-jakarta">
                  <thead>
                    <tr>
                      <th className={compThClass}>When</th>
                      <th className={compThClass}>Person assigned</th>
                      <th className={compThClass}>Activity</th>
                      <th className={compThClass}>Not covered</th>
                      <th className={compThClass}>Record</th>
                      <th className={compThClass}>Type</th>
                      <th className={compThClass}>Reason</th>
                      <th className={compThClass}>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((e, i) => (
                      <tr key={e.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                        <td className={cn(compTdClass, 'whitespace-nowrap')}>{formatDateTime(e.created_at)}</td>
                        <td className={compTdClass}>{e.user_name ?? '—'}</td>
                        <td className={compTdClass}>{authorizationActivityLabel(e.activity)}</td>
                        <td className={cn(compTdClass, 'text-[11.5px]')}>
                          {[
                            ...e.test_parameter_ids.map((id) => parameterLabel(paramById.get(id))),
                            ...e.calibration_scope_ids.map((id) => scopeLabel(scopeById.get(id))),
                          ].join(', ') || 'Activity'}
                        </td>
                        <td className={cn(compTdClass, 'text-[11.5px]')}>{e.record_label || e.record_table || '—'}</td>
                        <td className={cn(compTdClass, 'text-center')}>
                          <Badge tone={e.mode === 'override' ? 'red' : 'amber'}>{e.mode === 'override' ? 'Override' : 'Warned'}</Badge>
                        </td>
                        <td className={compTdClass}>{e.reason}</td>
                        <td className={compTdClass}>{e.created_by_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {exceptions.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No exceptions recorded.</p> : null}
            </>
          ) : null}
        </CompPanel>
      ) : null}
    </div>
  )
}
