import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Eye, FileUp, Loader2, Lock, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
import { assertAllowedUpload, uploadContentType } from '@/lib/validateUpload'
import { EnvHeader, EnvPanel, EnvSelect, Field, MessageLine, envInputClass, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { PerformanceBadge, PtMissingNotice } from './PtUi'
import { RaisePtNcDialog } from './RaisePtNcDialog'
import { summarizePt } from './ptSummary'
import {
  NC_RECORDS_PATH,
  PT_PERFORMANCES,
  PT_PERFORMANCE_LABEL,
  PT_PLAN_PATH,
  PT_REPORTS_BUCKET,
  buildScopeUnits,
  closeBlocker,
  computePtScores,
  fmtScore,
  fmtValue,
  isPtMissingError,
  num,
  participationDate,
  ptErrorText,
  yearsAgoIso,
  todayIso,
  type CalibrationScopeRow,
  type ProviderOption,
  type PtParticipation,
  type PtParticipationStatus,
  type PtPerformance,
  type PtPlan,
  type PtScopeKind,
  type StaffOption,
  type TestingScopeRow,
} from './ptShared'

const SELECT = '*, nc:nc_work_records(nc_id, status)'
const REPORT_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx'])

type Form = {
  planId: string
  scopeKind: PtScopeKind
  discipline: string
  subDiscipline: string
  providerId: string
  iso17043: boolean
  schemeName: string
  roundCode: string
  sampleDescription: string
  parameter: string
  unit: string
  method: string
  receivedOn: string
  reportedOn: string
  analystId: string
  labResult: string
  assignedValue: string
  sdForPt: string
  labU: string
  refU: string
  k: string
  providerZ: string
  providerEn: string
  manualPerformance: '' | PtPerformance
  monitorNote: string
  remarks: string
  status: PtParticipationStatus
}

const EMPTY_FORM: Form = {
  planId: '',
  scopeKind: 'testing',
  discipline: '',
  subDiscipline: '',
  providerId: '',
  iso17043: false,
  schemeName: '',
  roundCode: '',
  sampleDescription: '',
  parameter: '',
  unit: '',
  method: '',
  receivedOn: '',
  reportedOn: '',
  analystId: '',
  labResult: '',
  assignedValue: '',
  sdForPt: '',
  labU: '',
  refU: '',
  k: '2',
  providerZ: '',
  providerEn: '',
  manualPerformance: '',
  monitorNote: '',
  remarks: '',
  status: 'open',
}

const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

function rowToForm(r: PtParticipation): Form {
  return {
    planId: r.plan_id ?? '',
    scopeKind: r.scope_kind,
    discipline: r.discipline ?? '',
    subDiscipline: r.sub_discipline ?? '',
    providerId: r.provider_id ?? '',
    iso17043: r.provider_iso17043_accredited,
    schemeName: r.scheme_name ?? '',
    roundCode: r.round_code ?? '',
    sampleDescription: r.sample_description ?? '',
    parameter: r.parameter,
    unit: r.unit ?? '',
    method: r.method ?? '',
    receivedOn: r.received_on ?? '',
    reportedOn: r.reported_on ?? '',
    analystId: r.analyst_user_id ?? '',
    labResult: s(r.lab_result),
    assignedValue: s(r.assigned_value),
    sdForPt: s(r.sd_for_pt),
    labU: s(r.lab_uncertainty),
    refU: s(r.ref_uncertainty),
    k: s(r.coverage_factor) || '2',
    providerZ: s(r.provider_z_score),
    providerEn: s(r.provider_en_score),
    manualPerformance: r.manual_performance ?? '',
    monitorNote: r.monitor_note ?? '',
    remarks: r.remarks ?? '',
    status: r.status,
  }
}

function scoreInput(f: Form) {
  return {
    lab_result: num(f.labResult),
    assigned_value: num(f.assignedValue),
    sd_for_pt: num(f.sdForPt),
    lab_uncertainty: num(f.labU),
    ref_uncertainty: num(f.refU),
    coverage_factor: num(f.k),
    provider_z_score: num(f.providerZ),
    provider_en_score: num(f.providerEn),
    manual_performance: f.manualPerformance || null,
  }
}

/** Fields whose change after evaluation needs a reason (7.5.2). */
const RESULT_KEYS: Array<keyof Form> = [
  'labResult',
  'assignedValue',
  'sdForPt',
  'labU',
  'refU',
  'k',
  'providerZ',
  'providerEn',
  'manualPerformance',
  'parameter',
  'unit',
]

function normalise(rows: unknown[]): PtParticipation[] {
  return rows.map((r) => {
    const row = r as PtParticipation & { nc?: unknown }
    const nc = Array.isArray(row.nc) ? row.nc[0] ?? null : row.nc ?? null
    return { ...row, nc: nc as PtParticipation['nc'] }
  })
}

function ScoreCell({ label, value, provider }: { label: string; value: number | null; provider?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[10px] font-bold uppercase text-stone-500">{label}</span>{' '}
      <span className="font-mono">{fmtScore(value)}</span>
      {provider ? <span className="text-[10px] text-stone-500"> (provider)</span> : null}
    </span>
  )
}

export default function PtParticipationsPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const des = designation.trim().toLowerCase()
  const isDirector = isLaboratoryDirector(designation)
  const canManage =
    isDirector ||
    des === 'technical manager' ||
    (des === 'quality manager' && departmentName.trim().toLowerCase() === 'quality assurance')

  const [rows, setRows] = useState<PtParticipation[]>([])
  const [plans, setPlans] = useState<PtPlan[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [testing, setTesting] = useState<TestingScopeRow[]>([])
  const [calibration, setCalibration] = useState<CalibrationScopeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [from, setFrom] = useState(() => yearsAgoIso(4))
  const [to, setTo] = useState(() => todayIso())
  const [perfFilter, setPerfFilter] = useState<'' | PtPerformance | 'pending' | 'action'>('')
  const [kindFilter, setKindFilter] = useState<'' | PtScopeKind>('')
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PtParticipation | null>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [ncFor, setNcFor] = useState<PtParticipation | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const uploadTarget = useRef<PtParticipation | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, pRes, cRes, uRes, tRes, kRes] = await Promise.all([
        supabase.from('pt_participations').select(SELECT).order('reported_on', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).limit(2000),
        supabase.from('pt_plans').select('*').order('planned_year', { ascending: false }),
        supabase.from('clients').select('id, company_name, company_type').order('company_name').limit(5000),
        supabase.from('user_profiles').select('id, full_name').order('full_name', { ascending: true }),
        supabase.from('nabl_scope').select('id, discipline_group, materials_products, component_parameter').limit(5000),
        supabase.from('calibration_nabl_scope').select('id, discipline_name, group_name, measurand').limit(5000),
      ])
      if (rRes.error) {
        if (isPtMissingError(rRes.error)) {
          setMissing(true)
          return
        }
        throw rRes.error
      }
      setMissing(false)
      setRows(normalise(rRes.data ?? []))
      setPlans(pRes.error ? [] : ((pRes.data ?? []) as PtPlan[]))
      setProviders(cRes.error ? [] : ((cRes.data ?? []) as ProviderOption[]))
      setStaff(uRes.error ? [] : ((uRes.data ?? []) as StaffOption[]))
      setTesting(tRes.error ? [] : ((tRes.data ?? []) as TestingScopeRow[]))
      setCalibration(kRes.error ? [] : ((kRes.data ?? []) as CalibrationScopeRow[]))
    } catch (err) {
      setError(ptErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const units = useMemo(() => buildScopeUnits(testing, calibration, false), [testing, calibration])
  const disciplineOptions = useMemo(
    () => [...new Set(units.filter((u) => u.kind === form.scopeKind).map((u) => u.discipline))].sort(),
    [units, form.scopeKind],
  )
  const ptProviders = useMemo(() => {
    const isPt = (p: ProviderOption) => (p.company_type ?? '').toLowerCase() === 'pt provider'
    return [...providers.filter(isPt), ...providers.filter((p) => !isPt(p))]
  }, [providers])

  const inPeriod = useMemo(
    () =>
      rows.filter((r) => {
        const d = participationDate(r)
        return (!from || d >= from) && (!to || d <= to)
      }),
    [rows, from, to],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inPeriod.filter((r) => {
      if (kindFilter && r.scope_kind !== kindFilter) return false
      if (perfFilter === 'pending' && r.performance) return false
      if (perfFilter === 'action' && r.status === 'closed') return false
      if (perfFilter && perfFilter !== 'pending' && perfFilter !== 'action' && r.performance !== perfFilter) return false
      if (!q) return true
      return [r.parameter, r.scheme_name, r.round_code, r.provider_name, r.discipline, r.sub_discipline, r.analyst_name, r.sample_description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [inPeriod, search, kindFilter, perfFilter])

  const summary = useMemo(() => summarizePt(rows, from || null, to || null), [rows, from, to])

  const analystSummary = useMemo(() => {
    const map = new Map<string, { name: string; total: number; s: number; q: number; u: number; pending: number; last: string }>()
    for (const r of inPeriod) {
      const key = r.analyst_user_id || r.analyst_name || '—'
      const cur = map.get(key) ?? { name: r.analyst_name || 'Not recorded', total: 0, s: 0, q: 0, u: 0, pending: 0, last: '' }
      cur.total += 1
      if (r.performance === 'satisfactory') cur.s += 1
      else if (r.performance === 'questionable') cur.q += 1
      else if (r.performance === 'unsatisfactory') cur.u += 1
      else cur.pending += 1
      const d = participationDate(r)
      if (d > cur.last) cur.last = d
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.u - a.u || b.q - a.q || a.name.localeCompare(b.name))
  }, [inPeriod])

  const preview = useMemo(() => computePtScores(scoreInput(form)), [form])

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (r: PtParticipation) => {
    setEditing(r)
    setForm(rowToForm(r))
    setFormError(null)
    setFormOpen(true)
  }

  const pickPlan = (planId: string) => {
    const p = plans.find((x) => x.id === planId)
    if (!p) {
      setForm((f) => ({ ...f, planId: '' }))
      return
    }
    setForm((f) => ({
      ...f,
      planId,
      scopeKind: p.scope_kind,
      discipline: p.discipline,
      subDiscipline: p.sub_discipline ?? '',
      providerId: f.providerId || p.planned_provider_id || '',
      schemeName: f.schemeName || p.scheme || '',
    }))
  }

  const save = async () => {
    if (!form.parameter.trim()) {
      setFormError('Enter the parameter / measurand.')
      return
    }
    if (!form.discipline.trim()) {
      setFormError('Enter the discipline / group (used for the 4-year coverage check).')
      return
    }
    const sd = num(form.sdForPt)
    if (form.sdForPt.trim() && (sd === null || sd <= 0)) {
      setFormError('SD for PT must be a number above 0.')
      return
    }
    const k = num(form.k)
    if (k === null || k <= 0) {
      setFormError('Coverage factor k must be above 0 (usually 2).')
      return
    }
    for (const [label, v] of [
      ['Lab result', form.labResult],
      ['Assigned value', form.assignedValue],
      ['U lab', form.labU],
      ['U ref', form.refU],
      ['Provider z', form.providerZ],
      ['Provider En', form.providerEn],
    ] as const) {
      if (v.trim() && num(v) === null) {
        setFormError(`${label} must be a number.`)
        return
      }
    }
    if (form.receivedOn && form.reportedOn && form.reportedOn < form.receivedOn) {
      setFormError('Reported date cannot be before the received date.')
      return
    }
    if (form.status === 'closed') {
      const blocker = closeBlocker({
        performance: preview.performance,
        nc_record_id: editing?.nc_record_id ?? null,
        monitor_note: form.monitorNote,
      })
      if (blocker) {
        setFormError(`Cannot close: ${blocker}`)
        return
      }
    }

    let reason: string | null = null
    if (editing && editing.performance) {
      const before = rowToForm(editing)
      if (RESULT_KEYS.some((key) => String(before[key]).trim() !== String(form[key]).trim())) {
        reason = await askReason({
          title: 'Reason for changing an evaluated PT result',
          recordLabel: `${editing.round_code || editing.scheme_name || 'PT'} · ${editing.parameter}`,
          description: 'Scores and performance are recomputed by the database.',
          confirmLabel: 'Save change',
          quickPicks: ['Transcription error corrected', 'Final report values differ from interim report', 'Assigned value revised by provider'],
        })
        if (!reason) return
      }
    }

    const payload = {
      plan_id: form.planId || null,
      scope_kind: form.scopeKind,
      discipline: form.discipline.trim(),
      sub_discipline: form.subDiscipline.trim() || null,
      provider_id: form.providerId || null,
      provider_iso17043_accredited: form.iso17043,
      scheme_name: form.schemeName.trim() || null,
      round_code: form.roundCode.trim() || null,
      sample_description: form.sampleDescription.trim() || null,
      parameter: form.parameter.trim(),
      unit: form.unit.trim() || null,
      method: form.method.trim() || null,
      received_on: form.receivedOn || null,
      reported_on: form.reportedOn || null,
      analyst_user_id: form.analystId || null,
      analyst_name: staff.find((x) => x.id === form.analystId)?.full_name ?? null,
      lab_result: num(form.labResult),
      assigned_value: num(form.assignedValue),
      sd_for_pt: sd,
      lab_uncertainty: num(form.labU),
      ref_uncertainty: num(form.refU),
      coverage_factor: k,
      provider_z_score: num(form.providerZ),
      provider_en_score: num(form.providerEn),
      manual_performance: form.manualPerformance || null,
      monitor_note: form.monitorNote.trim() || null,
      remarks: form.remarks.trim() || null,
      status: form.status,
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        const { data, error: err } = await supabase.from('pt_participations').update(payload).eq('id', editing.id).select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director, Quality Manager or Technical Manager only).')
        if (reason) await recordReason('pt_participations', editing.id, reason)
      } else {
        const { error: err } = await supabase.from('pt_participations').insert(payload)
        if (err) throw err
      }
      setFormOpen(false)
      setMessage(editing ? 'PT participation updated.' : 'PT participation recorded.')
      await load()
    } catch (err) {
      setFormError(ptErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const closeRow = async (r: PtParticipation) => {
    const blocker = closeBlocker(r)
    if (blocker) {
      setMessage(`Cannot close: ${blocker}`)
      return
    }
    const { error: err } = await supabase.from('pt_participations').update({ status: 'closed' }).eq('id', r.id)
    if (err) {
      setMessage(ptErrorText(err))
      return
    }
    setMessage(`${r.parameter} closed.`)
    await load()
  }

  const remove = async (r: PtParticipation) => {
    const reason = await askReason({
      title: 'Reason for deleting a PT participation',
      recordLabel: `${r.round_code || r.scheme_name || 'PT'} · ${r.parameter}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('pt_participations').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? ptErrorText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('pt_participations', r.id, reason)
    await load()
  }

  const startUpload = (r: PtParticipation) => {
    uploadTarget.current = r
    fileRef.current?.click()
  }

  const onFile = async (files: FileList | null) => {
    const r = uploadTarget.current
    const file = files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!r || !file) return
    setUploadingId(r.id)
    setMessage(null)
    try {
      assertAllowedUpload(file, { extensions: REPORT_EXTENSIONS })
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${r.id}/${crypto.randomUUID()}_${safe}`
      const { error: upErr } = await supabase.storage
        .from(PT_REPORTS_BUCKET)
        .upload(path, file, { upsert: false, contentType: uploadContentType(file) })
      if (upErr) throw upErr
      const { error: updErr } = await supabase.from('pt_participations').update({ report_path: path }).eq('id', r.id)
      if (updErr) {
        await supabase.storage.from(PT_REPORTS_BUCKET).remove([path])
        throw updErr
      }
      // The previous file stays in storage: the audit trail still points at it.
      setMessage(`Provider report uploaded for ${r.parameter}.`)
      await load()
    } catch (err) {
      setMessage(ptErrorText(err))
    } finally {
      setUploadingId(null)
    }
  }

  const viewReport = async (r: PtParticipation) => {
    if (!r.report_path) return
    const { data, error: err } = await supabase.storage.from(PT_REPORTS_BUCKET).createSignedUrl(r.report_path, 600)
    if (err || !data?.signedUrl) {
      setMessage(err ? ptErrorText(err) : 'Could not open the report.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const onLinked = (id: string, nc: { id: string; nc_id: string }) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, nc_record_id: nc.id, nc: { nc_id: nc.nc_id, status: 'Open' } } : r)))
  }

  const actionNote = (r: PtParticipation) => {
    if (r.performance === 'unsatisfactory') {
      return r.nc_record_id ? (
        <Link to={NC_RECORDS_PATH} className="font-semibold text-red-800 underline">
          NC {r.nc?.nc_id ?? 'linked'}
          {r.nc?.status ? ` · ${r.nc.status}` : ''}
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 font-bold text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" /> NC required
        </span>
      )
    }
    if (r.performance === 'questionable') {
      return r.monitor_note ? (
        <span className="text-amber-900">Monitor: {r.monitor_note}</span>
      ) : (
        <span className="font-semibold text-amber-800">Monitor — add a note</span>
      )
    }
    return null
  }

  const rowActions = (r: PtParticipation, phone: boolean) => {
    const h = phone ? 'h-10' : 'h-7'
    const w = phone ? 'h-10 w-10' : 'h-7 w-7'
    return (
      <div className={cn('flex flex-wrap gap-1', phone ? 'justify-end' : 'justify-center')}>
        {canManage && r.performance === 'unsatisfactory' && !r.nc_record_id ? (
          <Button className={cn('rounded-none bg-red-700 px-2 text-[12px] text-white hover:bg-red-800', h)} onClick={() => setNcFor(r)}>
            <AlertTriangle className="h-3.5 w-3.5" /> Raise NC
          </Button>
        ) : null}
        {canManage && r.performance === 'questionable' && !r.nc_record_id ? (
          <Button variant="outline" className={cn(limsOutlineBtnClass, 'px-2 text-[12px]', h)} onClick={() => setNcFor(r)}>
            Raise NC
          </Button>
        ) : null}
        {canManage && r.status === 'open' && !closeBlocker(r) ? (
          <Button variant="outline" className={cn(limsOutlineBtnClass, 'px-2 text-[12px]', h)} onClick={() => void closeRow(r)}>
            <Lock className="h-3.5 w-3.5" /> Close
          </Button>
        ) : null}
        {r.report_path ? (
          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, w)} onClick={() => void viewReport(r)} aria-label="View provider report" title="View provider report">
            <Eye className="h-4 w-4" />
          </Button>
        ) : null}
        {canManage ? (
          <Button
            size="icon"
            variant="outline"
            className={cn(limsOutlineBtnClass, w)}
            onClick={() => startUpload(r)}
            disabled={uploadingId === r.id}
            aria-label="Upload provider report"
            title={r.report_path ? 'Replace provider report' : 'Upload provider report'}
          >
            {uploadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          </Button>
        ) : null}
        {canManage ? (
          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, w)} onClick={() => openEdit(r)} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
        {isDirector ? (
          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, w)} onClick={() => void remove(r)} aria-label="Delete">
            <Trash2 className="h-4 w-4 text-red-700" />
          </Button>
        ) : null}
      </div>
    )
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="PT / ILC Participation"
        clause="7.7.2"
        subtitle="Rounds, results and z / En / zeta scores. Unsatisfactory results need a nonconforming work record."
        actions={
          <>
            {canManage && !missing ? (
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={openNew}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add round</span>
              </Button>
            ) : null}
            <Button asChild variant="outline" className={limsDarkBarBtnClass}>
              <Link to={PT_PLAN_PATH}>4-year plan</Link>
            </Button>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />
      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => void onFile(e.target.files)} />
      {missing ? <PtMissingNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: 'Rounds', value: summary.total, tone: 'border-stone-400 bg-white text-stone-800' },
              { label: 'Satisfactory', value: summary.satisfactory, tone: 'border-emerald-600/50 bg-emerald-50 text-emerald-900' },
              { label: 'Questionable', value: summary.questionable, tone: 'border-amber-600/60 bg-amber-50 text-amber-900' },
              { label: 'Unsatisfactory', value: summary.unsatisfactory, tone: 'border-red-600/50 bg-red-50 text-red-900' },
              { label: 'Pending', value: summary.pending, tone: 'border-stone-400 bg-stone-50 text-stone-700' },
            ].map((c) => (
              <div key={c.label} className={cn('border-2 px-3 py-2', c.tone)}>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]">{c.label}</p>
                <p className="text-xl font-bold">{c.value}</p>
              </div>
            ))}
          </div>
          {summary.unsatisfactoryWithoutNc > 0 ? (
            <MessageLine tone="error" text={`${summary.unsatisfactoryWithoutNc} unsatisfactory result(s) without a nonconforming work record — raise the NC.`} />
          ) : null}

          <EnvPanel title={`PT rounds (${visible.length})`}>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Field label="From" htmlFor="pp-from">
                <Input id="pp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={envInputClass} />
              </Field>
              <Field label="To" htmlFor="pp-to">
                <Input id="pp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Performance" htmlFor="pp-perf">
                <EnvSelect id="pp-perf" value={perfFilter} onChange={(v) => setPerfFilter(v as typeof perfFilter)}>
                  <option value="">All</option>
                  {PT_PERFORMANCES.map((p) => (
                    <option key={p} value={p}>
                      {PT_PERFORMANCE_LABEL[p]}
                    </option>
                  ))}
                  <option value="pending">Pending evaluation</option>
                  <option value="action">Open</option>
                </EnvSelect>
              </Field>
              <Field label="Scope" htmlFor="pp-kind">
                <EnvSelect id="pp-kind" value={kindFilter} onChange={(v) => setKindFilter(v as '' | PtScopeKind)}>
                  <option value="">All</option>
                  <option value="testing">Testing</option>
                  <option value="calibration">Calibration</option>
                </EnvSelect>
              </Field>
              <Field label="Search" htmlFor="pp-q" className="col-span-2 sm:col-span-1">
                <Input id="pp-q" value={search} placeholder="Parameter, scheme, analyst…" onChange={(e) => setSearch(e.target.value)} className={envInputClass} />
              </Field>
            </div>

            <div className="space-y-1.5 lg:hidden">
              {visible.map((r) => (
                <div key={r.id} className={cn('border bg-white p-2 text-[13px]', r.performance === 'unsatisfactory' && !r.nc_record_id ? 'border-red-500' : 'border-stone-300')}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">
                      {r.parameter}
                      {r.unit ? <span className="font-normal text-stone-500"> ({r.unit})</span> : null}
                    </p>
                    <PerformanceBadge value={r.performance} />
                  </div>
                  <p className="text-[12px] text-stone-600">
                    {[r.discipline, r.sub_discipline].filter(Boolean).join(' › ') || '—'} · {r.scheme_name || '—'} {r.round_code ? `· ${r.round_code}` : ''}
                  </p>
                  <p className="text-[12px] text-stone-600">
                    {r.provider_name || '—'}
                    {r.provider_iso17043_accredited ? ' · ISO/IEC 17043' : ''} · {formatDate(participationDate(r))}
                    {r.analyst_name ? ` · ${r.analyst_name}` : ''}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
                    <span>
                      Lab <span className="font-mono">{fmtValue(r.lab_result)}</span> / X <span className="font-mono">{fmtValue(r.assigned_value)}</span>
                    </span>
                    <ScoreCell label="z" value={r.z_score} />
                    <ScoreCell label="En" value={r.en_score} />
                    <ScoreCell label="ζ" value={r.zeta_score} />
                  </p>
                  <div className="mt-1 text-[12px]">{actionNote(r)}</div>
                  <p className="text-[11px] uppercase text-stone-500">{r.status}</p>
                  <div className="mt-1">{rowActions(r, true)}</div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1180px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={envThClass}>Date</th>
                    <th className={envThClass}>Sub-discipline</th>
                    <th className={envThClass}>Scheme · round · provider</th>
                    <th className={envThClass}>Parameter</th>
                    <th className={envThClass}>Lab</th>
                    <th className={envThClass}>Assigned</th>
                    <th className={envThClass}>z</th>
                    <th className={envThClass}>En</th>
                    <th className={envThClass}>ζ</th>
                    <th className={envThClass}>Performance</th>
                    <th className={envThClass}>Follow-up</th>
                    <th className={envThClass}>Analyst</th>
                    <th className={envThClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>
                        {formatDate(participationDate(r))}
                        <span className="block text-[10px] uppercase text-stone-500">{r.status}</span>
                      </td>
                      <td className={cn(envTdClass, 'text-[12px]')}>
                        {[r.discipline, r.sub_discipline].filter(Boolean).join(' › ') || '—'}
                        <span className="block text-[10px] uppercase text-stone-500">{r.scope_kind}</span>
                      </td>
                      <td className={cn(envTdClass, 'text-[12px]')}>
                        {r.scheme_name || '—'}
                        {r.round_code ? ` · ${r.round_code}` : ''}
                        <span className="block text-stone-600">
                          {r.provider_name || '—'}
                          {r.provider_iso17043_accredited ? ' · 17043' : ''}
                        </span>
                      </td>
                      <td className={envTdClass}>
                        <span className="font-semibold">{r.parameter}</span>
                        {r.unit ? <span className="text-stone-500"> ({r.unit})</span> : null}
                      </td>
                      <td className={cn(envTdClass, 'text-right font-mono')}>{fmtValue(r.lab_result)}</td>
                      <td className={cn(envTdClass, 'text-right font-mono')}>
                        {fmtValue(r.assigned_value)}
                        {r.sd_for_pt !== null ? <span className="block text-[10px] text-stone-500">σ {fmtValue(r.sd_for_pt)}</span> : null}
                      </td>
                      <td className={cn(envTdClass, 'text-right font-mono')}>{fmtScore(r.z_score)}</td>
                      <td className={cn(envTdClass, 'text-right font-mono')}>{fmtScore(r.en_score)}</td>
                      <td className={cn(envTdClass, 'text-right font-mono')}>{fmtScore(r.zeta_score)}</td>
                      <td className={cn(envTdClass, 'text-center')}>
                        <PerformanceBadge value={r.performance} />
                      </td>
                      <td className={cn(envTdClass, 'max-w-[200px] text-[12px]')}>{actionNote(r) ?? '—'}</td>
                      <td className={cn(envTdClass, 'text-[12px]')}>{r.analyst_name || '—'}</td>
                      <td className={envTdClass}>{rowActions(r, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && visible.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No PT rounds for these filters.</p> : null}
          </EnvPanel>

          <EnvPanel title="Per-analyst summary (period)">
            {analystSummary.length === 0 ? (
              <p className="p-2 text-[13px] text-stone-600">No rounds in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse font-jakarta">
                  <thead>
                    <tr>
                      <th className={cn(envThClass, 'text-left')}>Analyst</th>
                      <th className={envThClass}>Rounds</th>
                      <th className={envThClass}>S</th>
                      <th className={envThClass}>Q</th>
                      <th className={envThClass}>U</th>
                      <th className={envThClass}>Pending</th>
                      <th className={envThClass}>Last PT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analystSummary.map((a, i) => (
                      <tr key={`${a.name}-${i}`} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                        <td className={cn(envTdClass, 'font-semibold')}>{a.name}</td>
                        <td className={cn(envTdClass, 'text-center')}>{a.total}</td>
                        <td className={cn(envTdClass, 'text-center text-emerald-800')}>{a.s}</td>
                        <td className={cn(envTdClass, 'text-center', a.q ? 'font-bold text-amber-800' : '')}>{a.q}</td>
                        <td className={cn(envTdClass, 'text-center', a.u ? 'font-bold text-red-700' : '')}>{a.u}</td>
                        <td className={cn(envTdClass, 'text-center')}>{a.pending}</td>
                        <td className={cn(envTdClass, 'whitespace-nowrap text-center')}>{a.last ? formatDate(a.last) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EnvPanel>
        </>
      ) : null}

      <RaisePtNcDialog participation={ncFor} onClose={() => setNcFor(null)} onLinked={onLinked} />

      <Dialog open={formOpen} onOpenChange={(open) => (!open && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-3xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">{editing ? 'Edit PT participation' : 'Add PT participation'}</DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                z = (x − X) / σpt · En = (x − X) / √(U²lab + U²ref) · ζ uses u = U / k. Scores are computed by the database.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[78vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <datalist id="pt-part-disciplines">
              {disciplineOptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">Round</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="From plan row" htmlFor="pf-plan" className="sm:col-span-3">
                <EnvSelect id="pf-plan" value={form.planId} onChange={pickPlan}>
                  <option value="">— Not from the plan —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.planned_year} · {p.discipline}
                      {p.sub_discipline ? ` › ${p.sub_discipline}` : ''}
                      {p.scheme ? ` · ${p.scheme}` : ''}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Scope" htmlFor="pf-kind">
                <EnvSelect id="pf-kind" value={form.scopeKind} onChange={(v) => set('scopeKind', v as PtScopeKind)}>
                  <option value="testing">Testing</option>
                  <option value="calibration">Calibration</option>
                </EnvSelect>
              </Field>
              <Field label={form.scopeKind === 'testing' ? 'Discipline / group *' : 'Discipline *'} htmlFor="pf-disc">
                <Input id="pf-disc" list="pt-part-disciplines" value={form.discipline} onChange={(e) => set('discipline', e.target.value)} className={envInputClass} />
              </Field>
              <Field label={form.scopeKind === 'testing' ? 'Material / product' : 'Group'} htmlFor="pf-sub">
                <Input id="pf-sub" value={form.subDiscipline} onChange={(e) => set('subDiscipline', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Provider" htmlFor="pf-prov">
                <EnvSelect id="pf-prov" value={form.providerId} onChange={(v) => set('providerId', v)}>
                  <option value="">— Choose —</option>
                  {ptProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.company_name}
                      {p.company_type ? ` (${p.company_type})` : ''}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Scheme" htmlFor="pf-scheme">
                <Input id="pf-scheme" value={form.schemeName} onChange={(e) => set('schemeName', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Round code" htmlFor="pf-round">
                <Input id="pf-round" value={form.roundCode} onChange={(e) => set('roundCode', e.target.value)} className={envInputClass} />
              </Field>
              <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" className="h-5 w-5" checked={form.iso17043} onChange={(e) => set('iso17043', e.target.checked)} />
                Provider accredited to ISO/IEC 17043 for this scheme
              </label>
              <Field label="Sample description" htmlFor="pf-sample" className="sm:col-span-3">
                <Input id="pf-sample" value={form.sampleDescription} onChange={(e) => set('sampleDescription', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Parameter / measurand *" htmlFor="pf-param">
                <Input id="pf-param" value={form.parameter} onChange={(e) => set('parameter', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Unit" htmlFor="pf-unit">
                <Input id="pf-unit" value={form.unit} onChange={(e) => set('unit', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Method" htmlFor="pf-method">
                <Input id="pf-method" value={form.method} onChange={(e) => set('method', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Received on" htmlFor="pf-recv">
                <Input id="pf-recv" type="date" value={form.receivedOn} onChange={(e) => set('receivedOn', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Reported on" htmlFor="pf-rep">
                <Input id="pf-rep" type="date" value={form.reportedOn} onChange={(e) => set('reportedOn', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Analyst" htmlFor="pf-analyst">
                <EnvSelect id="pf-analyst" value={form.analystId} onChange={(v) => set('analystId', v)}>
                  <option value="">— Choose —</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.id.slice(0, 8)}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
            </div>

            <p className="pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">Results</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Lab result (x)" htmlFor="pf-x">
                <Input id="pf-x" inputMode="decimal" value={form.labResult} onChange={(e) => set('labResult', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Assigned value (X)" htmlFor="pf-X">
                <Input id="pf-X" inputMode="decimal" value={form.assignedValue} onChange={(e) => set('assignedValue', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="SD for PT (σpt)" htmlFor="pf-sd">
                <Input id="pf-sd" inputMode="decimal" value={form.sdForPt} onChange={(e) => set('sdForPt', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Coverage factor k" htmlFor="pf-k">
                <Input id="pf-k" inputMode="decimal" value={form.k} onChange={(e) => set('k', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="U lab (expanded)" htmlFor="pf-ul">
                <Input id="pf-ul" inputMode="decimal" value={form.labU} onChange={(e) => set('labU', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="U ref (expanded)" htmlFor="pf-ur">
                <Input id="pf-ur" inputMode="decimal" value={form.refU} onChange={(e) => set('refU', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Provider z (if no σpt)" htmlFor="pf-pz">
                <Input id="pf-pz" inputMode="decimal" value={form.providerZ} onChange={(e) => set('providerZ', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Provider En (if no U)" htmlFor="pf-pen">
                <Input id="pf-pen" inputMode="decimal" value={form.providerEn} onChange={(e) => set('providerEn', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Qualitative result" htmlFor="pf-manual" className="col-span-2">
                <EnvSelect id="pf-manual" value={form.manualPerformance} onChange={(v) => set('manualPerformance', v as Form['manualPerformance'])}>
                  <option value="">— Use scores —</option>
                  {PT_PERFORMANCES.map((p) => (
                    <option key={p} value={p}>
                      {PT_PERFORMANCE_LABEL[p]} (only when there is no score)
                    </option>
                  ))}
                </EnvSelect>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-stone-400 bg-white px-3 py-2 text-[13px]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Preview</span>
              <ScoreCell label="z" value={preview.z} provider={preview.zFromProvider} />
              <ScoreCell label="En" value={preview.en} provider={preview.enFromProvider} />
              <ScoreCell label="ζ" value={preview.zeta} />
              <PerformanceBadge value={preview.performance} />
              <span className="w-full text-[11px] text-stone-500">|z| ≤ 2 satisfactory · 2 &lt; |z| &lt; 3 questionable · |z| ≥ 3 unsatisfactory · |En| ≤ 1 satisfactory</span>
            </div>
            {preview.performance === 'unsatisfactory' ? (
              <MessageLine tone="error" text="Unsatisfactory: after saving, use Raise NC — the round cannot be closed without a nonconforming work record (7.10)." />
            ) : null}

            <p className="pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">Follow-up</p>
            <Field label={preview.performance === 'questionable' ? 'Monitoring note (required to close)' : 'Monitoring note'} htmlFor="pf-mon">
              <Textarea
                id="pf-mon"
                rows={2}
                value={form.monitorNote}
                placeholder="e.g. Trend SiO2 on IQC control chart for the next 3 months; repeat with CRM"
                onChange={(e) => set('monitorNote', e.target.value)}
                className="rounded-none border-stone-500 bg-white text-base sm:text-sm"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Remarks" htmlFor="pf-rem" className="sm:col-span-2">
                <Input id="pf-rem" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Status" htmlFor="pf-status">
                <EnvSelect id="pf-status" value={form.status} onChange={(v) => set('status', v as PtParticipationStatus)}>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </EnvSelect>
              </Field>
            </div>
            <MessageLine tone="error" text={formError} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className={limsOutlineBtnClass} onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
