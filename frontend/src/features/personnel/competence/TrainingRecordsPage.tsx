import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, Plus, Printer, RefreshCw, Save, Trash2, Upload, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { printViaIframe } from '@/features/general-requirements/shared'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { fetchTeamUsers, type TeamUserRecord } from '@/lib/fetchTeamUsers'
import { escapeHtml } from '@/lib/htmlText'
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
  compTextareaClass,
  compThClass,
} from './CompetenceUi'
import {
  TRAINING_TYPES,
  canManageCompetence,
  errText,
  isCompetenceMissingError,
  labelOf,
  loadTestParameterOptions,
  openPersonnelFile,
  parameterLabel,
  todayKey,
  uploadPersonnelFile,
  type CompetenceRequirement,
  type TestParameterOption,
  type TrainingAttendee,
  type TrainingRecord,
  type TrainingType,
} from './competenceShared'

type Draft = {
  id: string | null
  record_no: string
  title: string
  topic: string
  training_type: TrainingType
  trainer: string
  held_from: string
  held_to: string
  duration_hours: string
  evaluation_method: string
  requirement_id: string
  test_parameter_id: string
  remarks: string
  material_path: string | null
}

const emptyDraft = (): Draft => ({
  id: null,
  record_no: '',
  title: '',
  topic: '',
  training_type: 'internal',
  trainer: '',
  held_from: todayKey(),
  held_to: '',
  duration_hours: '',
  evaluation_method: '',
  requirement_id: '',
  test_parameter_id: '',
  remarks: '',
  material_path: null,
})

type AttendeeEdit = {
  attended: boolean
  score: string
  passed: '' | 'yes' | 'no'
  effectiveness_review: string
  effectiveness_rating: string
}

const EVALUATION_METHODS = ['Written test', 'Oral questioning', 'Practical demonstration', 'Witnessing', 'Replicate testing', 'Feedback form']

function toEdit(a: TrainingAttendee): AttendeeEdit {
  return {
    attended: a.attended,
    score: a.score === null || a.score === undefined ? '' : String(a.score),
    passed: a.passed === null || a.passed === undefined ? '' : a.passed ? 'yes' : 'no',
    effectiveness_review: a.effectiveness_review ?? '',
    effectiveness_rating: a.effectiveness_rating ? String(a.effectiveness_rating) : '',
  }
}

export default function TrainingRecordsPage() {
  const { designation, departmentName } = useAuth()
  const canManage = canManageCompetence(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [trainings, setTrainings] = useState<TrainingRecord[]>([])
  const [attendeeCounts, setAttendeeCounts] = useState<Map<string, { n: number; reviewed: number }>>(new Map())
  const [users, setUsers] = useState<TeamUserRecord[]>([])
  const [params, setParams] = useState<TestParameterOption[]>([])
  const [requirements, setRequirements] = useState<CompetenceRequirement[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [materialFile, setMaterialFile] = useState<File | null>(null)

  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attendees, setAttendees] = useState<TrainingAttendee[]>([])
  const [edits, setEdits] = useState<Record<string, AttendeeEdit>>({})
  const [addUserId, setAddUserId] = useState('')

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const paramById = useMemo(() => new Map(params.map((p) => [p.id, p])), [params])
  const reqById = useMemo(() => new Map(requirements.map((r) => [r.id, r])), [requirements])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase.from('training_records').select('*').order('held_from', { ascending: false }).limit(500)
      if (year) q = q.gte('held_from', `${year}-01-01`).lte('held_from', `${year}-12-31`)
      if (typeFilter) q = q.eq('training_type', typeFilter)
      const { data, error: err } = await q
      if (err) {
        if (isCompetenceMissingError(err)) {
          setMissing(true)
          return
        }
        throw err
      }
      setMissing(false)
      const list = (data ?? []) as TrainingRecord[]
      setTrainings(list)
      const ids = list.map((t) => t.id)
      const counts = new Map<string, { n: number; reviewed: number }>()
      if (ids.length) {
        const { data: att } = await supabase
          .from('training_attendees')
          .select('training_id, reviewed_on')
          .in('training_id', ids)
        for (const a of (att ?? []) as Array<{ training_id: string; reviewed_on: string | null }>) {
          const c = counts.get(a.training_id) ?? { n: 0, reviewed: 0 }
          c.n += 1
          if (a.reviewed_on) c.reviewed += 1
          counts.set(a.training_id, c)
        }
      }
      setAttendeeCounts(counts)
    } catch (err) {
      setError(errText(err))
    } finally {
      setLoading(false)
    }
  }, [year, typeFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void fetchTeamUsers().then(setUsers).catch(() => setUsers([]))
    void loadTestParameterOptions().then(setParams).catch(() => setParams([]))
    void supabase
      .from('competence_requirements')
      .select('*')
      .eq('active', true)
      .order('role')
      .then(({ data }) => setRequirements((data ?? []) as CompetenceRequirement[]))
  }, [])

  const loadAttendees = useCallback(async (trainingId: string) => {
    const { data, error: err } = await supabase.from('training_attendees').select('*').eq('training_id', trainingId)
    if (err) {
      setMessage(errText(err))
      return
    }
    const list = (data ?? []) as TrainingAttendee[]
    setAttendees(list)
    setEdits(Object.fromEntries(list.map((a) => [a.id, toEdit(a)])))
  }, [])

  useEffect(() => {
    if (selectedId) void loadAttendees(selectedId)
    else setAttendees([])
  }, [selectedId, loadAttendees])

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return trainings
    return trainings.filter((t) =>
      [t.record_no, t.title, t.topic, t.trainer].some((v) => (v ?? '').toLowerCase().includes(s)),
    )
  }, [trainings, search])

  const selected = trainings.find((t) => t.id === selectedId) ?? null

  const openNew = () => {
    setDraft(emptyDraft())
    setMaterialFile(null)
    setFormOpen(true)
  }

  const openEdit = (t: TrainingRecord) => {
    setDraft({
      id: t.id,
      record_no: t.record_no ?? '',
      title: t.title,
      topic: t.topic ?? '',
      training_type: t.training_type,
      trainer: t.trainer ?? '',
      held_from: t.held_from,
      held_to: t.held_to ?? '',
      duration_hours: t.duration_hours === null ? '' : String(t.duration_hours),
      evaluation_method: t.evaluation_method ?? '',
      requirement_id: t.requirement_id ?? '',
      test_parameter_id: t.test_parameter_id ?? '',
      remarks: t.remarks ?? '',
      material_path: t.material_path,
    })
    setMaterialFile(null)
    setFormOpen(true)
  }

  const save = async () => {
    if (!draft.title.trim() || !draft.held_from) {
      setMessage('Enter the training title and the date.')
      return
    }
    const hours = draft.duration_hours.trim() ? Number(draft.duration_hours) : null
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      setMessage('Duration must be a number of hours.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      let materialPath = draft.material_path
      if (materialFile) materialPath = await uploadPersonnelFile('training', materialFile)
      const payload = {
        record_no: draft.record_no.trim() || null,
        title: draft.title.trim(),
        topic: draft.topic.trim() || null,
        training_type: draft.training_type,
        trainer: draft.trainer.trim() || null,
        held_from: draft.held_from,
        held_to: draft.held_to || null,
        duration_hours: hours,
        evaluation_method: draft.evaluation_method.trim() || null,
        requirement_id: draft.requirement_id || null,
        test_parameter_id: draft.test_parameter_id || null,
        remarks: draft.remarks.trim() || null,
        material_path: materialPath,
      }
      if (draft.id) {
        const reason = await askReason({
          title: 'Reason for changing a training record',
          recordLabel: `${draft.record_no} · ${payload.title}`,
          quickPicks: ['Corrected details', 'Material added', 'Dates corrected'],
        })
        if (!reason) return
        const { error: err } = await supabase.from('training_records').update(payload).eq('id', draft.id)
        if (err) throw err
        await recordReason('training_records', draft.id, reason)
        setMessage('Training updated.')
      } else {
        const { data, error: err } = await supabase.from('training_records').insert(payload).select('id, record_no').single()
        if (err) throw err
        const row = data as { id: string; record_no: string }
        setMessage(`Training ${row.record_no} recorded. Add the attendees below.`)
        setSelectedId(row.id)
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setMessage(errText(err))
    } finally {
      setSaving(false)
    }
  }

  const removeTraining = async (t: TrainingRecord) => {
    const reason = await askReason({
      title: 'Reason for deleting a training record',
      recordLabel: `${t.record_no} · ${t.title}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('training_records').delete().eq('id', t.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? errText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('training_records', t.id, reason)
    if (selectedId === t.id) setSelectedId(null)
    await load()
  }

  const addAttendee = async () => {
    if (!selectedId || !addUserId) return
    const { error: err } = await supabase.from('training_attendees').insert({ training_id: selectedId, user_id: addUserId })
    if (err) {
      setMessage(/duplicate|unique/i.test(err.message) ? 'Already an attendee.' : errText(err))
      return
    }
    setAddUserId('')
    await loadAttendees(selectedId)
    await load()
  }

  const saveAttendee = async (a: TrainingAttendee) => {
    const e = edits[a.id]
    if (!e) return
    const score = e.score.trim() ? Number(e.score) : null
    if (score !== null && !Number.isFinite(score)) {
      setMessage('Score must be a number.')
      return
    }
    const { error: err } = await supabase
      .from('training_attendees')
      .update({
        attended: e.attended,
        score,
        passed: e.passed === '' ? null : e.passed === 'yes',
        effectiveness_review: e.effectiveness_review.trim() || null,
        effectiveness_rating: e.effectiveness_rating ? Number(e.effectiveness_rating) : null,
      })
      .eq('id', a.id)
    if (err) {
      setMessage(errText(err))
      return
    }
    setMessage(`Saved for ${userById.get(a.user_id)?.full_name ?? 'attendee'}.`)
    if (selectedId) await loadAttendees(selectedId)
    await load()
  }

  const removeAttendee = async (a: TrainingAttendee) => {
    const reason = await askReason({
      title: 'Reason for removing an attendee',
      recordLabel: `${selected?.record_no ?? ''} · ${userById.get(a.user_id)?.full_name ?? ''}`,
      confirmLabel: 'Remove',
      quickPicks: ['Added by mistake', 'Did not attend'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('training_attendees').delete().eq('id', a.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? errText(err) : 'Not removed (Laboratory Director only). Untick "Attended" instead.')
      return
    }
    await recordReason('training_attendees', a.id, reason)
    if (selectedId) await loadAttendees(selectedId)
    await load()
  }

  const printSheet = () => {
    if (!selected) return
    const rows = attendees
      .map((a, i) => {
        const u = userById.get(a.user_id)
        return `<tr><td>${i + 1}</td><td>${escapeHtml(u?.full_name ?? a.user_id)}</td><td>${escapeHtml(u?.designation ?? '')}</td><td>${a.attended ? 'Yes' : 'No'}</td><td>${a.score ?? ''}</td><td>${a.passed === null ? '' : a.passed ? 'Pass' : 'Fail'}</td><td>${escapeHtml(a.effectiveness_review ?? '')}${a.effectiveness_rating ? ` (${a.effectiveness_rating}/5)` : ''}</td><td>${escapeHtml(a.reviewed_by_name ?? '')} ${a.reviewed_on ? escapeHtml(formatDate(a.reviewed_on)) : ''}</td><td style="width:90px"></td></tr>`
      })
      .join('')
    printViaIframe(`<!doctype html><html><head><title>${escapeHtml(selected.record_no ?? 'Training')}</title>
<style>body{font-family:sans-serif;font-size:11px;margin:16px}h1{font-size:15px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #444;padding:4px;text-align:left;vertical-align:top}th{background:#eee}.meta td{border:none;padding:2px 8px 2px 0}</style>
</head><body><h1>Training record ${escapeHtml(selected.record_no ?? '')} — attendance and evaluation</h1>
<table class="meta"><tr><td><b>Title</b></td><td>${escapeHtml(selected.title)}</td><td><b>Type</b></td><td>${escapeHtml(labelOf(TRAINING_TYPES, selected.training_type))}</td></tr>
<tr><td><b>Topic</b></td><td>${escapeHtml(selected.topic ?? '')}</td><td><b>Trainer</b></td><td>${escapeHtml(selected.trainer ?? '')}</td></tr>
<tr><td><b>Date</b></td><td>${escapeHtml(formatDate(selected.held_from))}${selected.held_to ? ' – ' + escapeHtml(formatDate(selected.held_to)) : ''}</td><td><b>Duration</b></td><td>${selected.duration_hours ?? ''} h</td></tr>
<tr><td><b>Evaluation</b></td><td>${escapeHtml(selected.evaluation_method ?? '')}</td><td><b>Parameter</b></td><td>${escapeHtml(selected.test_parameter_id ? parameterLabel(paramById.get(selected.test_parameter_id)) : '')}</td></tr></table>
<table><thead><tr><th>#</th><th>Name</th><th>Designation</th><th>Attended</th><th>Score</th><th>Result</th><th>Effectiveness review</th><th>Reviewed by / on</th><th>Signature</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:28px">Trainer: ____________________ &nbsp;&nbsp;&nbsp; Technical Manager / Quality Manager: ____________________</p>
</body></html>`)
  }

  const years = useMemo(() => {
    const y = new Date().getFullYear()
    return Array.from({ length: 8 }, (_, i) => String(y - i))
  }, [])

  return (
    <div className={limsPageShellClass}>
      <CompHeader
        title="Training Records"
        clause="6.2.5 (b)"
        subtitle="Trainings held, attendees, evaluation and effectiveness review."
        actions={
          <>
            {canManage && !missing ? (
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={openNew}>
                <Plus className="h-4 w-4" /> New training
              </Button>
            ) : null}
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
      <datalist id="tr-eval-methods">
        {EVALUATION_METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {formOpen && canManage ? (
        <CompPanel
          title={draft.id ? `Edit training ${draft.record_no}` : 'New training'}
          right={
            <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Title *" htmlFor="tr-title" className="sm:col-span-2">
              <Input id="tr-title" value={draft.title} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="tr-type">
              <CompSelect id="tr-type" value={draft.training_type} onChange={(v) => setDraft({ ...draft, training_type: v as TrainingType })}>
                {TRAINING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Record no. (blank = auto)" htmlFor="tr-no">
              <Input id="tr-no" value={draft.record_no} placeholder="TR-YYYY-NNN" className={compInputClass}
                onChange={(e) => setDraft({ ...draft, record_no: e.target.value })} />
            </Field>
            <Field label="Topic / content" htmlFor="tr-topic" className="sm:col-span-2">
              <Input id="tr-topic" value={draft.topic} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
            </Field>
            <Field label="Trainer / provider" htmlFor="tr-trainer">
              <Input id="tr-trainer" value={draft.trainer} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, trainer: e.target.value })} />
            </Field>
            <Field label="Duration (hours)" htmlFor="tr-hours">
              <Input id="tr-hours" inputMode="decimal" value={draft.duration_hours} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, duration_hours: e.target.value })} />
            </Field>
            <Field label="From *" htmlFor="tr-from">
              <Input id="tr-from" type="date" value={draft.held_from} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, held_from: e.target.value })} />
            </Field>
            <Field label="To" htmlFor="tr-to">
              <Input id="tr-to" type="date" value={draft.held_to} min={draft.held_from} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, held_to: e.target.value })} />
            </Field>
            <Field label="Evaluation method" htmlFor="tr-eval">
              <Input id="tr-eval" list="tr-eval-methods" value={draft.evaluation_method} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, evaluation_method: e.target.value })} />
            </Field>
            <Field label="Meets requirement" htmlFor="tr-req">
              <CompSelect id="tr-req" value={draft.requirement_id} onChange={(v) => setDraft({ ...draft, requirement_id: v })}>
                <option value="">—</option>
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>{r.role}: {r.description.slice(0, 60)}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Test parameter / method (if specific)" htmlFor="tr-param" className="sm:col-span-2">
              <CompSelect id="tr-param" value={draft.test_parameter_id} onChange={(v) => setDraft({ ...draft, test_parameter_id: v })}>
                <option value="">—</option>
                {params.map((p) => (
                  <option key={p.id} value={p.id}>{parameterLabel(p)}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Training material" htmlFor="tr-file" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input id="tr-file" type="file" className={cn(compInputClass, 'pt-1.5')}
                  onChange={(e) => setMaterialFile(e.target.files?.[0] ?? null)} />
                {draft.material_path ? (
                  <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-8')}
                    onClick={() => void openPersonnelFile(draft.material_path ?? '').catch((err) => setMessage(errText(err)))}>
                    <FileText className="h-4 w-4" /> Current file
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field label="Remarks" htmlFor="tr-rem" className="sm:col-span-2 lg:col-span-4">
              <Textarea id="tr-rem" value={draft.remarks} className={compTextareaClass}
                onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
            </Field>
          </div>
          <div className="mt-2 flex justify-end">
            <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : materialFile ? <Upload className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </CompPanel>
      ) : null}

      {!missing ? (
        <CompPanel title={`Trainings (${visible.length})`}>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Year" htmlFor="tf-year">
              <CompSelect id="tf-year" value={year} onChange={setYear}>
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Type" htmlFor="tf-type">
              <CompSelect id="tf-type" value={typeFilter} onChange={setTypeFilter}>
                <option value="">All types</option>
                {TRAINING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Search" htmlFor="tf-search" className="col-span-2">
              <Input id="tf-search" value={search} placeholder="Record no., title, trainer" className={compInputClass}
                onChange={(e) => setSearch(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-1.5 md:hidden">
            {visible.map((t) => {
              const c = attendeeCounts.get(t.id)
              return (
                <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
                  className={cn(compCardClass, 'block w-full text-left', selectedId === t.id && 'border-amber-600 bg-amber-50')}>
                  <p className="font-semibold"><span className="font-mono text-amber-800">{t.record_no}</span> · {t.title}</p>
                  <p className="text-[12px] text-stone-600">
                    {formatDate(t.held_from)} · {labelOf(TRAINING_TYPES, t.training_type)} · {c?.n ?? 0} attendee(s), {c?.reviewed ?? 0} reviewed
                  </p>
                </button>
              )
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={compThClass}>Record no.</th>
                  <th className={compThClass}>Date</th>
                  <th className={compThClass}>Title / topic</th>
                  <th className={compThClass}>Type</th>
                  <th className={compThClass}>Trainer</th>
                  <th className={compThClass}>Hours</th>
                  <th className={compThClass}>Attendees</th>
                  <th className={compThClass}>Effectiveness</th>
                  {canManage ? <th className={compThClass}>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((t, i) => {
                  const c = attendeeCounts.get(t.id)
                  return (
                    <tr key={t.id} onClick={() => setSelectedId(t.id)}
                      className={cn('cursor-pointer', selectedId === t.id ? 'bg-[#fde68a]/80' : i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]', 'hover:bg-[#f3e9d8]')}>
                      <td className={cn(compTdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>{t.record_no}</td>
                      <td className={cn(compTdClass, 'whitespace-nowrap')}>{formatDate(t.held_from)}{t.held_to && t.held_to !== t.held_from ? ` – ${formatDate(t.held_to)}` : ''}</td>
                      <td className={compTdClass}>
                        <div className="font-semibold">{t.title}</div>
                        {t.topic ? <div className="text-[11.5px] text-stone-600">{t.topic}</div> : null}
                        {t.test_parameter_id ? <div className="text-[11px] text-amber-900">{parameterLabel(paramById.get(t.test_parameter_id))}</div> : null}
                        {t.requirement_id && reqById.get(t.requirement_id) ? <div className="text-[11px] text-stone-500">Meets: {reqById.get(t.requirement_id)?.description}</div> : null}
                      </td>
                      <td className={compTdClass}>{labelOf(TRAINING_TYPES, t.training_type)}</td>
                      <td className={compTdClass}>{t.trainer || '—'}</td>
                      <td className={cn(compTdClass, 'text-center')}>{t.duration_hours ?? '—'}</td>
                      <td className={cn(compTdClass, 'text-center')}>{c?.n ?? 0}</td>
                      <td className={cn(compTdClass, 'text-center')}>
                        {!c?.n ? '—' : c.reviewed === c.n ? <Badge tone="green">Reviewed</Badge> : <Badge tone="amber">{c.n - c.reviewed} pending</Badge>}
                      </td>
                      {canManage ? (
                        <td className={cn(compTdClass, 'whitespace-nowrap text-center')} onClick={(e) => e.stopPropagation()}>
                          <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-7 px-2 text-[12px]')} onClick={() => openEdit(t)}>Edit</Button>{' '}
                          {isDirector ? (
                            <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} aria-label="Delete" onClick={() => void removeTraining(t)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-700" />
                            </Button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!loading && visible.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No trainings for these filters.</p> : null}
        </CompPanel>
      ) : null}

      {selected && !missing ? (
        <CompPanel
          title={`${selected.record_no} · Attendees and effectiveness`}
          right={
            <div className="flex gap-1">
              {canManage ? (
                <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => openEdit(selected)}>Edit</Button>
              ) : null}
              {selected.material_path ? (
                <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')}
                  onClick={() => void openPersonnelFile(selected.material_path ?? '').catch((err) => setMessage(errText(err)))}>
                  <FileText className="h-4 w-4" /> Material
                </Button>
              ) : null}
              <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={printSheet}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => setSelectedId(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          }
        >
          <p className="mb-2 text-[12.5px] text-stone-700">
            {selected.title} · {formatDate(selected.held_from)} · {labelOf(TRAINING_TYPES, selected.training_type)}
            {selected.evaluation_method ? ` · Evaluation: ${selected.evaluation_method}` : ''}
          </p>
          {canManage ? (
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <Field label="Add attendee" htmlFor="ta-user" className="w-full sm:w-72">
                <CompSelect id="ta-user" value={addUserId} onChange={setAddUserId}>
                  <option value="">— Choose person —</option>
                  {users
                    .filter((u) => u.status.toLowerCase() !== 'inactive' && !attendees.some((a) => a.user_id === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email} · {u.designation}</option>
                    ))}
                </CompSelect>
              </Field>
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void addAttendee()} disabled={!addUserId}>
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            </div>
          ) : null}
          {attendees.length === 0 ? <p className="p-2 text-[13px] text-stone-600">No attendees yet.</p> : null}
          <div className="space-y-2">
            {attendees.map((a) => {
              const u = userById.get(a.user_id)
              const e = edits[a.id] ?? toEdit(a)
              const set = (patch: Partial<AttendeeEdit>) => setEdits((prev) => ({ ...prev, [a.id]: { ...e, ...patch } }))
              return (
                <div key={a.id} className={compCardClass}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{u?.full_name ?? a.user_id} <span className="font-normal text-stone-600">· {u?.designation}</span></p>
                    <div className="flex items-center gap-1">
                      {a.passed === true ? <Badge tone="green">Pass</Badge> : a.passed === false ? <Badge tone="red">Fail</Badge> : null}
                      {a.reviewed_on ? <Badge tone="blue">Reviewed {formatDate(a.reviewed_on)}{a.reviewed_by_name ? ` · ${a.reviewed_by_name}` : ''}</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-5 w-5" checked={e.attended} disabled={!canManage}
                        onChange={(ev) => set({ attended: ev.target.checked })} />
                      Attended
                    </label>
                    <Field label="Score" htmlFor={`ta-score-${a.id}`}>
                      <Input id={`ta-score-${a.id}`} inputMode="decimal" value={e.score} disabled={!canManage} className={compInputClass}
                        onChange={(ev) => set({ score: ev.target.value })} />
                    </Field>
                    <Field label="Result" htmlFor={`ta-pass-${a.id}`}>
                      <CompSelect id={`ta-pass-${a.id}`} value={e.passed} disabled={!canManage} onChange={(v) => set({ passed: v as AttendeeEdit['passed'] })}>
                        <option value="">—</option>
                        <option value="yes">Pass</option>
                        <option value="no">Fail</option>
                      </CompSelect>
                    </Field>
                    <Field label="Effectiveness (1-5)" htmlFor={`ta-rate-${a.id}`}>
                      <CompSelect id={`ta-rate-${a.id}`} value={e.effectiveness_rating} disabled={!canManage} onChange={(v) => set({ effectiveness_rating: v })}>
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={String(n)}>{n}</option>
                        ))}
                      </CompSelect>
                    </Field>
                    <Field label="Effectiveness review" htmlFor={`ta-rev-${a.id}`} className="col-span-2">
                      <Input id={`ta-rev-${a.id}`} value={e.effectiveness_review} disabled={!canManage} className={compInputClass}
                        placeholder="e.g. Performs the test independently; results within limits"
                        onChange={(ev) => set({ effectiveness_review: ev.target.value })} />
                    </Field>
                  </div>
                  {canManage ? (
                    <div className="mt-1 flex justify-end gap-1">
                      <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void saveAttendee(a)}>
                        <Save className="h-4 w-4" /> Save
                      </Button>
                      {isDirector ? (
                        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10 sm:h-8 sm:w-8')} aria-label="Remove attendee" onClick={() => void removeAttendee(a)}>
                          <Trash2 className="h-4 w-4 text-red-700" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </CompPanel>
      ) : null}
    </div>
  )
}
