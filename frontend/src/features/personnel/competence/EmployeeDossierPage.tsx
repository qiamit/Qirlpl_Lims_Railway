import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, FileText, Loader2, Printer, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { printViaIframe } from '@/features/general-requirements/shared'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { authorizationActivityLabel } from '@/lib/authorizationCheck'
import { fetchTeamUsers, type TeamUserRecord } from '@/lib/fetchTeamUsers'
import { escapeHtml } from '@/lib/htmlText'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
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
} from './CompetenceUi'
import {
  MONITORING_METHODS,
  MONITORING_RESULTS,
  REQUIREMENT_TYPES,
  TRAINING_TYPES,
  authorizationScopeText,
  authorizationState,
  canManageCompetence,
  errText,
  isCompetenceMissingError,
  labelOf,
  loadScopeOptions,
  loadTestParameterOptions,
  norm,
  openPersonnelFile,
  parameterLabel,
  scopeLabel,
  todayKey,
  uploadPersonnelFile,
  type AuthorizationException,
  type AuthorizationRow,
  type CompetenceRequirement,
  type MonitoringRecord,
  type Qualification,
  type RequirementType,
  type ScopeOption,
  type TestParameterOption,
  type TrainingAttendee,
  type TrainingRecord,
} from './competenceShared'

type AttendedTraining = TrainingAttendee & { training: TrainingRecord | null }

type PtRow = {
  id: string
  parameter: string
  round_code: string | null
  scheme_name: string | null
  performance: string | null
  z_score: number | null
  en_score: number | null
  reported_on: string | null
}

type GapStatus = 'met' | 'unverified' | 'gap'
type GapRow = { req: CompetenceRequirement; status: GapStatus; evidence: string[] }

type QualDraft = {
  type: RequirementType
  title: string
  institution: string
  year: string
  requirementId: string
  verified: boolean
}

const emptyQual = (): QualDraft => ({ type: 'education', title: '', institution: '', year: '', requirementId: '', verified: false })

const GAP_BADGE: Record<GapStatus, { tone: string; label: string }> = {
  met: { tone: 'green', label: 'Met' },
  unverified: { tone: 'amber', label: 'Evidence not verified' },
  gap: { tone: 'red', label: 'Gap' },
}

export default function EmployeeDossierPage() {
  const { user, designation, departmentName } = useAuth()
  const canManage = canManageCompetence(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()
  const [searchParams, setSearchParams] = useSearchParams()

  const [users, setUsers] = useState<TeamUserRecord[]>([])
  const [params, setParams] = useState<TestParameterOption[]>([])
  const [scopes, setScopes] = useState<ScopeOption[]>([])
  const [userId, setUserId] = useState(() => searchParams.get('user') ?? '')

  const [requirements, setRequirements] = useState<CompetenceRequirement[]>([])
  const [quals, setQuals] = useState<Qualification[]>([])
  const [trainings, setTrainings] = useState<AttendedTraining[]>([])
  const [monitoring, setMonitoring] = useState<MonitoringRecord[]>([])
  const [auths, setAuths] = useState<AuthorizationRow[]>([])
  const [exceptions, setExceptions] = useState<AuthorizationException[]>([])
  const [pt, setPt] = useState<PtRow[] | null>(null)

  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [qualDraft, setQualDraft] = useState<QualDraft>(emptyQual)
  const [qualFile, setQualFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const paramById = useMemo(() => new Map(params.map((p) => [p.id, p])), [params])
  const scopeById = useMemo(() => new Map(scopes.map((s) => [s.id, s])), [scopes])
  const person = users.find((u) => u.id === userId) ?? null
  const today = todayKey()

  useEffect(() => {
    void fetchTeamUsers().then(setUsers).catch(() => setUsers([]))
    void loadTestParameterOptions().then(setParams).catch(() => setParams([]))
    void loadScopeOptions().then(setScopes)
  }, [])

  useEffect(() => {
    if (!userId && user?.id) setUserId(user.id)
  }, [user?.id, userId])

  const choosePerson = (id: string) => {
    setUserId(id)
    const next = new URLSearchParams(searchParams)
    if (id) next.set('user', id)
    else next.delete('user')
    setSearchParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const [rq, ql, at, mo, au, ex] = await Promise.all([
        supabase.from('competence_requirements').select('*').eq('active', true).order('sort_order'),
        supabase.from('personnel_qualifications').select('*').eq('user_id', userId).order('year', { ascending: false }),
        supabase.from('training_attendees').select('*, training:training_records(*)').eq('user_id', userId),
        supabase.from('competence_monitoring').select('*').eq('user_id', userId).order('performed_on', { ascending: false }),
        supabase.from('personnel_authorizations').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('authorization_exceptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      ])
      const firstErr = [rq, ql, at, mo, au].find((r) => r.error)?.error
      if (firstErr) {
        if (isCompetenceMissingError(firstErr)) {
          setMissing(true)
          return
        }
        throw firstErr
      }
      setMissing(false)
      setRequirements((rq.data ?? []) as CompetenceRequirement[])
      setQuals((ql.data ?? []) as Qualification[])
      setTrainings(
        ((at.data ?? []) as AttendedTraining[]).sort((a, b) => (b.training?.held_from ?? '').localeCompare(a.training?.held_from ?? '')),
      )
      setMonitoring((mo.data ?? []) as MonitoringRecord[])
      setAuths((au.data ?? []) as AuthorizationRow[])
      setExceptions(ex.error ? [] : ((ex.data ?? []) as AuthorizationException[]))
      // PT module (P1-5) may not be installed: read defensively.
      const ptRes = await supabase
        .from('pt_participations')
        .select('id, parameter, round_code, scheme_name, performance, z_score, en_score, reported_on')
        .eq('analyst_user_id', userId)
        .order('reported_on', { ascending: false })
        .limit(50)
      setPt(ptRes.error ? null : ((ptRes.data ?? []) as PtRow[]))
    } catch (err) {
      setError(errText(err))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  /** Requirements of the person's role (and department, when the requirement names one) vs evidence. */
  const gaps = useMemo<GapRow[]>(() => {
    if (!person) return []
    const mine = requirements.filter(
      (r) => norm(r.role) === norm(person.designation) && (!r.department || norm(r.department) === norm(person.department_name)),
    )
    return mine.map((req) => {
      const evidence: string[] = []
      let verified = false
      for (const q of quals.filter((x) => x.requirement_id === req.id)) {
        evidence.push(`${q.title}${q.verified_on ? ' (verified)' : ''}`)
        if (q.verified_on) verified = true
      }
      for (const t of trainings.filter((x) => x.training?.requirement_id === req.id && x.attended && x.passed !== false)) {
        evidence.push(`Training ${t.training?.record_no ?? ''} ${t.training?.title ?? ''}`.trim())
        verified = true
      }
      const status: GapStatus = verified ? 'met' : evidence.length ? 'unverified' : 'gap'
      return { req, status, evidence }
    })
  }, [person, requirements, quals, trainings])

  const mandatoryGaps = gaps.filter((g) => g.req.mandatory && g.status !== 'met').length

  const saveQualification = async () => {
    if (!userId || !qualDraft.title.trim()) {
      setMessage('Enter the qualification title.')
      return
    }
    const year = qualDraft.year.trim() ? Number(qualDraft.year) : null
    if (year !== null && (!Number.isInteger(year) || year < 1940 || year > 2100)) {
      setMessage('Year must be a 4-digit year.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const documentPath = qualFile ? await uploadPersonnelFile(`qualifications/${userId}`, qualFile) : null
      const { error: err } = await supabase.from('personnel_qualifications').insert({
        user_id: userId,
        qualification_type: qualDraft.type,
        title: qualDraft.title.trim(),
        institution: qualDraft.institution.trim() || null,
        year,
        requirement_id: qualDraft.requirementId || null,
        document_path: documentPath,
        verified_on: qualDraft.verified ? today : null,
      })
      if (err) throw err
      setQualDraft(emptyQual())
      setQualFile(null)
      setMessage('Qualification added.')
      await load()
    } catch (err) {
      setMessage(errText(err))
    } finally {
      setSaving(false)
    }
  }

  const verifyQualification = async (q: Qualification) => {
    const { error: err } = await supabase.from('personnel_qualifications').update({ verified_on: today }).eq('id', q.id)
    if (err) setMessage(errText(err))
    else await load()
  }

  const removeQualification = async (q: Qualification) => {
    const reason = await askReason({
      title: 'Reason for deleting a qualification record',
      recordLabel: q.title,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered against the wrong person'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('personnel_qualifications').delete().eq('id', q.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? errText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('personnel_qualifications', q.id, reason)
    await load()
  }

  const openFile = (path: string | null) => {
    if (path) void openPersonnelFile(path).catch((err) => setMessage(errText(err)))
  }

  const targetOf = (r: { test_parameter_id: string | null; calibration_scope_id: string | null }) =>
    r.test_parameter_id
      ? parameterLabel(paramById.get(r.test_parameter_id))
      : r.calibration_scope_id
        ? scopeLabel(scopeById.get(r.calibration_scope_id))
        : '—'

  const printDossier = () => {
    if (!person) return
    const e = escapeHtml
    const table = (head: string[], rows: string[][]) =>
      `<table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${
        rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">None</td></tr>`
      }</tbody></table>`
    printViaIframe(`<!doctype html><html><head><title>Competence record ${e(person.full_name)}</title>
<style>body{font-family:sans-serif;font-size:10.5px;margin:14px}h1{font-size:15px;margin:0}h2{font-size:12px;margin:14px 0 4px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}</style>
</head><body><h1>Personnel competence record — ${e(person.full_name)}</h1>
<p>${e(person.designation)} · ${e(person.department_name)} · printed ${e(formatDateTime(new Date().toISOString()))}</p>
<h2>Requirements of the role (6.2.2)</h2>${table(['Type', 'Requirement', 'Minimum', 'Status', 'Evidence'], gaps.map((g) => [labelOf(REQUIREMENT_TYPES, g.req.requirement_type), g.req.description, g.req.minimum_level ?? '', GAP_BADGE[g.status].label + (g.req.mandatory ? '' : ' (desirable)'), g.evidence.join('; ')]))}
<h2>Education, qualifications and experience</h2>${table(['Type', 'Title', 'Institution', 'Year', 'Verified'], quals.map((q) => [labelOf(REQUIREMENT_TYPES, q.qualification_type), q.title, q.institution ?? '', q.year ? String(q.year) : '', q.verified_on ? `${formatDate(q.verified_on)} ${q.verified_by_name ?? ''}` : 'No']))}
<h2>Training (6.2.5 b)</h2>${table(['Record', 'Date', 'Title', 'Type', 'Result', 'Effectiveness'], trainings.map((t) => [t.training?.record_no ?? '', formatDate(t.training?.held_from), t.training?.title ?? '', labelOf(TRAINING_TYPES, t.training?.training_type), t.attended ? (t.passed === null ? 'Attended' : t.passed ? 'Pass' : 'Fail') : 'Absent', t.effectiveness_review ? `${t.effectiveness_review}${t.effectiveness_rating ? ` (${t.effectiveness_rating}/5)` : ''}` : '']))}
<h2>Monitoring of competence (6.2.5 d, e)</h2>${table(['Date', 'Method', 'Parameter / scope', 'Result', 'Observed by'], monitoring.map((m) => [formatDate(m.performed_on), labelOf(MONITORING_METHODS, m.method), targetOf(m), labelOf(MONITORING_RESULTS, m.result), m.observed_by_name ?? '']))}
${pt && pt.length ? `<h2>PT / ILC</h2>${table(['Round', 'Parameter', 'Reported', 'Performance'], pt.map((p) => [p.round_code ?? '', p.parameter, formatDate(p.reported_on), p.performance ?? '']))}` : ''}
<h2>Authorizations (6.2.5 f, 6.2.6)</h2>${table(['Activity', 'Scope', 'Valid', 'Status', 'Authorized by / on', 'Basis'], auths.map((a) => [authorizationActivityLabel(a.activity), authorizationScopeText(a, paramById, scopeById), `${formatDate(a.valid_from)} – ${a.valid_to ? formatDate(a.valid_to) : 'until withdrawn'}`, authorizationState(a, today), `${a.authorized_by_name ?? ''} ${formatDate(a.authorized_on)}`, a.basis ?? '']))}
</body></html>`)
  }

  const activeUsers = users.filter((u) => u.status.toLowerCase() !== 'inactive' || u.id === userId)
  const currentAuths = auths.filter((a) => authorizationState(a, today) === 'current')

  return (
    <div className={limsPageShellClass}>
      <CompHeader
        title="Employee Competence Dossier"
        clause="6.2.2 – 6.2.6"
        subtitle="Qualifications, training, monitoring and authorizations of one person, against the requirements of the role."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={printDossier} disabled={!person || missing}>
              <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading || !userId}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />
      {missing ? <MissingMigrationNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      <CompPanel title="Person">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Employee" htmlFor="dz-user" className="sm:col-span-1">
            <CompSelect id="dz-user" value={userId} onChange={choosePerson}>
              <option value="">— Choose —</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </CompSelect>
          </Field>
          {person ? (
            <div className="flex flex-wrap items-end gap-2 text-[13px] sm:col-span-2">
              <span><b>{person.designation || '—'}</b> · {person.department_name || '—'}</span>
              {person.status.toLowerCase() === 'inactive' ? <Badge tone="grey">Inactive</Badge> : null}
              {!missing ? (
                <>
                  <Badge tone={mandatoryGaps ? 'red' : 'green'}>{mandatoryGaps ? `${mandatoryGaps} mandatory gap(s)` : 'No mandatory gaps'}</Badge>
                  <Badge tone="blue">{currentAuths.length} current authorization(s)</Badge>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </CompPanel>

      {person && !missing ? (
        <>
          <CompPanel title={`Requirements of the role · ${person.designation || 'no designation'}`}>
            {gaps.length === 0 ? (
              <p className="text-[13px] text-stone-600">No competence requirements are defined for this role yet (Competence Requirements page).</p>
            ) : (
              <div className="space-y-1.5">
                {gaps.map((g) => (
                  <div key={g.req.id} className={cn(compCardClass, 'flex flex-wrap items-start justify-between gap-2')}>
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {labelOf(REQUIREMENT_TYPES, g.req.requirement_type)}
                        {g.req.mandatory ? '' : <span className="font-normal text-stone-500"> · desirable</span>}
                      </p>
                      <p>{g.req.description}{g.req.minimum_level ? ` · min. ${g.req.minimum_level}` : ''}</p>
                      {g.evidence.length ? <p className="text-[12px] text-stone-600">Evidence: {g.evidence.join('; ')}</p> : null}
                    </div>
                    <Badge tone={GAP_BADGE[g.status].tone}>{GAP_BADGE[g.status].label}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CompPanel>

          <CompPanel title={`Education, qualifications, experience (${quals.length})`}>
            <div className="space-y-1.5">
              {quals.map((q) => (
                <div key={q.id} className={cn(compCardClass, 'flex flex-wrap items-start justify-between gap-2')}>
                  <div className="min-w-0">
                    <p className="font-semibold">{q.title}</p>
                    <p className="text-[12px] text-stone-600">
                      {labelOf(REQUIREMENT_TYPES, q.qualification_type)}{q.institution ? ` · ${q.institution}` : ''}{q.year ? ` · ${q.year}` : ''}
                    </p>
                    {q.requirement_id ? (
                      <p className="text-[11.5px] text-stone-500">Meets: {requirements.find((r) => r.id === q.requirement_id)?.description ?? '—'}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {q.verified_on ? (
                      <Badge tone="green">Verified {formatDate(q.verified_on)}{q.verified_by_name ? ` · ${q.verified_by_name}` : ''}</Badge>
                    ) : canManage ? (
                      <Button className={cn(limsPrimaryBtnClass, 'h-10 px-2 text-[12px] sm:h-7')} onClick={() => void verifyQualification(q)}>
                        <BadgeCheck className="h-3.5 w-3.5" /> Verify
                      </Button>
                    ) : (
                      <Badge tone="amber">Not verified</Badge>
                    )}
                    {q.document_path ? (
                      <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 px-2 text-[12px] sm:h-7')} onClick={() => openFile(q.document_path)}>
                        <FileText className="h-3.5 w-3.5" /> Document
                      </Button>
                    ) : null}
                    {isDirector ? (
                      <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10 sm:h-7 sm:w-7')} aria-label="Delete" onClick={() => void removeQualification(q)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-700" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {quals.length === 0 ? <p className="text-[13px] text-stone-600">No qualifications recorded.</p> : null}
            </div>
            {canManage ? (
              <div className="mt-3 border-t border-stone-300 pt-2">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">Add qualification / experience</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <Field label="Type" htmlFor="dq-type">
                    <CompSelect id="dq-type" value={qualDraft.type} onChange={(v) => setQualDraft({ ...qualDraft, type: v as RequirementType })}>
                      {REQUIREMENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </CompSelect>
                  </Field>
                  <Field label="Title *" htmlFor="dq-title" className="lg:col-span-2">
                    <Input id="dq-title" value={qualDraft.title} placeholder="e.g. B.Sc Chemistry; 3 years cement testing" className={compInputClass}
                      onChange={(e) => setQualDraft({ ...qualDraft, title: e.target.value })} />
                  </Field>
                  <Field label="Institution / employer" htmlFor="dq-inst">
                    <Input id="dq-inst" value={qualDraft.institution} className={compInputClass}
                      onChange={(e) => setQualDraft({ ...qualDraft, institution: e.target.value })} />
                  </Field>
                  <Field label="Year" htmlFor="dq-year">
                    <Input id="dq-year" inputMode="numeric" value={qualDraft.year} className={compInputClass}
                      onChange={(e) => setQualDraft({ ...qualDraft, year: e.target.value })} />
                  </Field>
                  <Field label="Meets requirement" htmlFor="dq-req">
                    <CompSelect id="dq-req" value={qualDraft.requirementId} onChange={(v) => setQualDraft({ ...qualDraft, requirementId: v })}>
                      <option value="">—</option>
                      {gaps.map((g) => (
                        <option key={g.req.id} value={g.req.id}>{g.req.description.slice(0, 60)}</option>
                      ))}
                    </CompSelect>
                  </Field>
                  <Field label="Document (certificate, letter)" htmlFor="dq-file" className="sm:col-span-2 lg:col-span-3">
                    <Input id="dq-file" type="file" className={cn(compInputClass, 'pt-1.5')} onChange={(e) => setQualFile(e.target.files?.[0] ?? null)} />
                  </Field>
                  <label className="flex min-h-10 items-end gap-2 pb-1.5 text-sm lg:col-span-2">
                    <input type="checkbox" className="h-5 w-5" checked={qualDraft.verified}
                      onChange={(e) => setQualDraft({ ...qualDraft, verified: e.target.checked })} />
                    Original seen and verified by me
                  </label>
                  <div className="flex items-end justify-end">
                    <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void saveQualification()} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Add
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </CompPanel>

          <CompPanel title={`Training (${trainings.length})`}>
            <div className="space-y-1.5">
              {trainings.map((t) => (
                <div key={t.id} className={cn(compCardClass, 'flex flex-wrap items-start justify-between gap-2')}>
                  <div className="min-w-0">
                    <p className="font-semibold"><span className="font-mono text-amber-800">{t.training?.record_no}</span> · {t.training?.title}</p>
                    <p className="text-[12px] text-stone-600">
                      {formatDate(t.training?.held_from)} · {labelOf(TRAINING_TYPES, t.training?.training_type)}
                      {t.score !== null ? ` · score ${t.score}` : ''}
                    </p>
                    {t.effectiveness_review ? (
                      <p className="text-[12px]">Effectiveness: {t.effectiveness_review}{t.effectiveness_rating ? ` (${t.effectiveness_rating}/5)` : ''}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {!t.attended ? <Badge tone="grey">Absent</Badge> : t.passed === true ? <Badge tone="green">Pass</Badge> : t.passed === false ? <Badge tone="red">Fail</Badge> : <Badge tone="blue">Attended</Badge>}
                    {t.attended && !t.reviewed_on ? <Badge tone="amber">Effectiveness pending</Badge> : null}
                  </div>
                </div>
              ))}
              {trainings.length === 0 ? <p className="text-[13px] text-stone-600">No training recorded (Training Records page).</p> : null}
            </div>
          </CompPanel>

          <CompPanel title={`Monitoring of competence (${monitoring.length})`}>
            <div className="space-y-1.5">
              {monitoring.map((m) => (
                <div key={m.id} className={cn(compCardClass, 'flex flex-wrap items-start justify-between gap-2')}>
                  <div className="min-w-0">
                    <p className="font-semibold">{formatDate(m.performed_on)} · {labelOf(MONITORING_METHODS, m.method)}</p>
                    <p className="text-[12px]">{targetOf(m)}{m.reference ? ` · ${m.reference}` : ''}</p>
                    {m.follow_up ? <p className="text-[12px] text-amber-900">Follow-up: {m.follow_up}</p> : null}
                    <p className="text-[11px] text-stone-500">Observed by {m.observed_by_name ?? '—'}</p>
                  </div>
                  <Badge tone={m.result === 'satisfactory' ? 'green' : m.result === 'needs_training' ? 'amber' : 'red'}>
                    {labelOf(MONITORING_RESULTS, m.result)}
                  </Badge>
                </div>
              ))}
              {monitoring.length === 0 ? <p className="text-[13px] text-stone-600">No monitoring recorded (Competence Monitoring page).</p> : null}
            </div>
          </CompPanel>

          {pt !== null ? (
            <CompPanel title={`PT / ILC results as analyst (${pt.length})`}>
              <div className="space-y-1.5">
                {pt.map((p) => (
                  <div key={p.id} className={cn(compCardClass, 'flex flex-wrap items-start justify-between gap-2')}>
                    <div>
                      <p className="font-semibold">{p.parameter} · {p.round_code ?? ''}</p>
                      <p className="text-[12px] text-stone-600">
                        {p.scheme_name ?? ''} {p.reported_on ? `· ${formatDate(p.reported_on)}` : ''}
                        {p.z_score !== null ? ` · z ${p.z_score}` : ''}{p.en_score !== null ? ` · En ${p.en_score}` : ''}
                      </p>
                    </div>
                    <Badge tone={p.performance === 'satisfactory' ? 'green' : p.performance === 'questionable' ? 'amber' : p.performance ? 'red' : 'grey'}>
                      {p.performance ?? 'Pending'}
                    </Badge>
                  </div>
                ))}
                {pt.length === 0 ? <p className="text-[13px] text-stone-600">No PT rounds with this person as analyst.</p> : null}
              </div>
            </CompPanel>
          ) : null}

          <CompPanel title={`Authorizations (${currentAuths.length} current of ${auths.length})`}>
            <div className="space-y-1.5">
              {auths.map((a) => {
                const st = authorizationState(a, today)
                return (
                  <div key={a.id} className={cn(compCardClass, 'flex flex-wrap items-start justify-between gap-2', st !== 'current' && 'bg-stone-50')}>
                    <div className="min-w-0">
                      <p className="font-semibold">{authorizationActivityLabel(a.activity)} · <span className="font-normal">{authorizationScopeText(a, paramById, scopeById)}</span></p>
                      <p className="text-[12px] text-stone-600">
                        {formatDate(a.valid_from)} – {a.valid_to ? formatDate(a.valid_to) : 'until withdrawn'} · by {a.authorized_by_name ?? '—'}
                        {a.basis ? ` · ${a.basis}` : ''}
                      </p>
                      {a.withdrawn_reason ? <p className="text-[12px] text-red-800">{a.withdrawn_reason}</p> : null}
                    </div>
                    <Badge tone={st === 'current' ? 'green' : st === 'suspended' ? 'amber' : st === 'withdrawn' ? 'red' : 'grey'}>{st}</Badge>
                  </div>
                )
              })}
              {auths.length === 0 ? <p className="text-[13px] text-stone-600">No authorizations (Authorization Matrix page).</p> : null}
            </div>
            {exceptions.length ? (
              <div className="mt-3 border-t border-stone-300 pt-2">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">Assigned without authorization ({exceptions.length})</p>
                <ul className="space-y-0.5 text-[12px]">
                  {exceptions.map((e) => (
                    <li key={e.id}>
                      {formatDateTime(e.created_at)} · {authorizationActivityLabel(e.activity)} · {e.mode === 'override' ? 'Director override' : 'warned'}
                      {e.record_label ? ` · ${e.record_label}` : ''} — {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CompPanel>
        </>
      ) : null}
    </div>
  )
}
