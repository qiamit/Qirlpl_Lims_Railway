import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarBtnClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import {
  Chip,
  Field,
  KeyValue,
  MessageLine,
  MissingRegistersNotice,
  NativeSelect,
  RegisterHeader,
  RegisterPanel,
  type ChipTone,
} from './ValidationUi'
import {
  INCIDENT_CATEGORY_LABEL,
  INCIDENT_STATUS_LABEL,
  NC_RECORDS_PATH,
  blankToNull,
  canWriteValidationRegisters,
  errorText,
  inputClass,
  isValidationMissingError,
  localInputToIso,
  tdClass,
  textareaClass,
  thClass,
  toLocalInput,
  type IncidentCategory,
  type IncidentStatus,
  type ItIncident,
  type NcOption,
} from './validationShared'

type Form = {
  occurredAt: string
  detectedAt: string
  detectedBy: string
  category: IncidentCategory
  description: string
  dataImpact: string
  affectedRecords: string
  immediateAction: string
  rootCause: string
  correctiveAction: string
  ncRecordId: string
  status: IncidentStatus
  remarks: string
}

const STATUS_TONE: Record<IncidentStatus, ChipTone> = { open: 'red', investigating: 'amber', closed: 'green' }

/** Categories whose closure needs the effect on data written down (same rule as the database). */
const NEEDS_IMPACT: IncidentCategory[] = ['data_integrity', 'security', 'backup']

function formFrom(i: ItIncident | null, profileName: string): Form {
  if (!i) {
    return {
      occurredAt: toLocalInput(new Date()),
      detectedAt: '',
      detectedBy: profileName,
      category: 'outage',
      description: '',
      dataImpact: '',
      affectedRecords: '',
      immediateAction: '',
      rootCause: '',
      correctiveAction: '',
      ncRecordId: '',
      status: 'open',
      remarks: '',
    }
  }
  return {
    occurredAt: toLocalInput(i.occurred_at),
    detectedAt: toLocalInput(i.detected_at),
    detectedBy: i.detected_by ?? '',
    category: i.category,
    description: i.description,
    dataImpact: i.data_impact ?? '',
    affectedRecords: i.affected_records ?? '',
    immediateAction: i.immediate_action ?? '',
    rootCause: i.root_cause ?? '',
    correctiveAction: i.corrective_action ?? '',
    ncRecordId: i.nc_record_id ?? '',
    status: i.status,
    remarks: i.remarks ?? '',
  }
}

export default function ItIncidentsPage() {
  const { designation, departmentName, profileName } = useAuth()
  const canWrite = canWriteValidationRegisters(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [rows, setRows] = useState<ItIncident[]>([])
  const [ncs, setNcs] = useState<NcOption[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'ok' } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'' | 'not_closed' | IncidentStatus>('not_closed')
  const [categoryFilter, setCategoryFilter] = useState<'' | IncidentCategory>('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ItIncident | null>(null)
  const [form, setForm] = useState<Form>(() => formFrom(null, ''))
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase.from('it_incidents').select('*').order('occurred_at', { ascending: false }).limit(500)
      if (statusFilter === 'not_closed') q = q.neq('status', 'closed')
      else if (statusFilter) q = q.eq('status', statusFilter)
      if (categoryFilter) q = q.eq('category', categoryFilter)
      const res = await q
      if (res.error) {
        if (isValidationMissingError(res.error)) {
          setMissing(true)
          return
        }
        throw res.error
      }
      setMissing(false)
      setRows((res.data ?? []) as ItIncident[])
      const ncRes = await supabase
        .from('nc_work_records')
        .select('id, nc_id, status, description')
        .order('detected_at', { ascending: false })
        .limit(300)
      // The NC list is optional: a failure only hides the picker.
      setNcs(ncRes.error ? [] : ((ncRes.data ?? []) as NcOption[]))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [statusFilter, categoryFilter])

  useEffect(() => {
    void load()
  }, [load])

  const ncById = useMemo(() => new Map(ncs.map((n) => [n.id, n])), [ncs])
  const openCount = rows.filter((r) => r.status !== 'closed').length

  const openForm = (i: ItIncident | null, closeIt = false) => {
    setEditing(i)
    const f = formFrom(i, profileName)
    setForm(closeIt ? { ...f, status: 'closed' } : f)
    setFormOpen(true)
    setMessage(null)
  }

  const save = async () => {
    const occurred = localInputToIso(form.occurredAt)
    if (!occurred || !form.description.trim()) {
      setMessage({ text: 'Enter when it happened and what happened.', tone: 'error' })
      return
    }
    if (form.status === 'closed') {
      if (!form.correctiveAction.trim()) {
        setMessage({ text: 'Write the corrective action before closing the incident.', tone: 'error' })
        return
      }
      if (NEEDS_IMPACT.includes(form.category) && !form.dataImpact.trim()) {
        setMessage({ text: 'State the effect on data (records, results, reports) before closing this incident.', tone: 'error' })
        return
      }
    }
    let reason: string | null = null
    if (editing && editing.status === 'closed') {
      reason = await askReason({
        title: 'Reason for changing a closed incident',
        recordLabel: `${editing.incident_no} · ${INCIDENT_CATEGORY_LABEL[editing.category]}`,
        confirmLabel: 'Save',
      })
      if (!reason) return
    }
    setSaving(true)
    setMessage(null)
    const payload = {
      occurred_at: occurred,
      detected_at: localInputToIso(form.detectedAt),
      detected_by: blankToNull(form.detectedBy),
      category: form.category,
      description: form.description.trim(),
      data_impact: blankToNull(form.dataImpact),
      affected_records: blankToNull(form.affectedRecords),
      immediate_action: blankToNull(form.immediateAction),
      root_cause: blankToNull(form.rootCause),
      corrective_action: blankToNull(form.correctiveAction),
      nc_record_id: form.ncRecordId || null,
      status: form.status,
      remarks: blankToNull(form.remarks),
    }
    try {
      if (editing) {
        const { data, error: err } = await supabase.from('it_incidents').update(payload).eq('id', editing.id).select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director or Quality Manager only).')
        if (reason) await recordReason('it_incidents', editing.id, reason)
        setMessage({ text: `${editing.incident_no} saved.`, tone: 'ok' })
      } else {
        const { data, error: err } = await supabase.from('it_incidents').insert(payload).select('incident_no').single()
        if (err) throw err
        setMessage({ text: `Incident ${String(data?.incident_no ?? '')} recorded.`, tone: 'ok' })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setMessage({ text: errorText(err), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (i: ItIncident) => {
    const reason = await askReason({
      title: 'Reason for deleting an IT incident',
      recordLabel: `${i.incident_no} · ${INCIDENT_CATEGORY_LABEL[i.category]}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('it_incidents').delete().eq('id', i.id).select('id')
    if (err || !data?.length) {
      setMessage({ text: err ? errorText(err) : 'Not deleted (Laboratory Director only).', tone: 'error' })
      return
    }
    await recordReason('it_incidents', i.id, reason)
    await load()
  }

  const ncLabel = (id: string | null) => {
    if (!id) return null
    const nc = ncById.get(id)
    return (
      <Link to={NC_RECORDS_PATH} className="inline-flex items-center gap-0.5 font-mono text-amber-800 hover:underline">
        {nc ? nc.nc_id : 'NC record'} <ExternalLink className="h-3 w-3" />
      </Link>
    )
  }

  const rowActions = (i: ItIncident, lg: boolean) =>
    canWrite ? (
      <div className="flex flex-wrap justify-end gap-1">
        {i.status !== 'closed' ? (
          <Button className={cn(limsPrimaryBtnClass, lg ? 'h-10' : 'h-7 px-2 text-[12px]')} onClick={() => openForm(i, true)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Close
          </Button>
        ) : null}
        <Button variant="outline" className={cn(limsOutlineBtnClass, lg ? 'h-10' : 'h-7 px-2 text-[12px]')} onClick={() => openForm(i)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        {isDirector ? (
          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, lg ? 'h-10 w-10' : 'h-7 w-7')}
            onClick={() => void remove(i)} aria-label={`Delete ${i.incident_no}`}>
            <Trash2 className="h-4 w-4 text-red-700" />
          </Button>
        ) : null}
      </div>
    ) : null

  const ta = (id: string, label: string, key: keyof Form, className = 'sm:col-span-2', placeholder?: string) => (
    <Field label={label} htmlFor={id} className={className}>
      <Textarea id={id} value={String(form[key])} placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={textareaClass} />
    </Field>
  )

  return (
    <div className={limsPageShellClass}>
      <RegisterHeader
        title="LIMS Failures & IT Incidents"
        clause="7.11.3 (c)–(e)"
        subtitle="Outages, data integrity, security and backup failures: immediate action, cause and corrective action."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canWrite && !missing ? (
              <Button className={limsPrimaryBtnClass} onClick={() => openForm(null)}>
                <Plus className="h-4 w-4" /> Record incident
              </Button>
            ) : null}
          </>
        }
      />
      {missing ? <MissingRegistersNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine tone={message?.tone} text={message?.text ?? null} />

      {formOpen ? (
        <RegisterPanel
          title={editing ? `${form.status === 'closed' && editing.status !== 'closed' ? 'Close' : 'Edit'} ${editing.incident_no}` : 'Record an IT incident'}
          right={
            <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" /> Close form
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Occurred at *" htmlFor="it-occ">
              <Input id="it-occ" type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Detected at" htmlFor="it-det">
              <Input id="it-det" type="datetime-local" value={form.detectedAt} onChange={(e) => setForm({ ...form, detectedAt: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Detected by" htmlFor="it-by">
              <Input id="it-by" value={form.detectedBy} onChange={(e) => setForm({ ...form, detectedBy: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Category *" htmlFor="it-cat">
              <NativeSelect id="it-cat" value={form.category} onChange={(v) => setForm({ ...form, category: v as IncidentCategory })}>
                {(Object.keys(INCIDENT_CATEGORY_LABEL) as IncidentCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {INCIDENT_CATEGORY_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {ta('it-desc', 'What happened *', 'description', 'sm:col-span-2 lg:col-span-4')}
            {ta('it-impact', NEEDS_IMPACT.includes(form.category) ? 'Effect on data * (to close)' : 'Effect on data', 'dataImpact', 'sm:col-span-2',
              'Were any records, results or reports lost, changed or wrong? “None” if checked and none.')}
            {ta('it-recs', 'Records affected', 'affectedRecords', 'sm:col-span-2', 'SRF / report / certificate numbers')}
            {ta('it-imm', 'Immediate action (correction)', 'immediateAction')}
            {ta('it-root', 'Root cause', 'rootCause')}
            {ta('it-ca', form.status === 'closed' ? 'Corrective action *' : 'Corrective action', 'correctiveAction')}
            <div className="grid grid-cols-1 gap-2 sm:col-span-2">
              <Field label="Nonconforming work record" htmlFor="it-nc" hint="Raise one first on the NC Records page when results may be affected (7.10).">
                <NativeSelect id="it-nc" value={form.ncRecordId} onChange={(v) => setForm({ ...form, ncRecordId: v })}>
                  <option value="">— None —</option>
                  {ncs.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nc_id} · {n.status} · {n.description.slice(0, 60)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Status *" htmlFor="it-status">
                <NativeSelect id="it-status" value={form.status} onChange={(v) => setForm({ ...form, status: v as IncidentStatus })}>
                  {(Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {INCIDENT_STATUS_LABEL[k]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Remarks" htmlFor="it-rem" className="sm:col-span-2 lg:col-span-4">
              <Input id="it-rem" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <div className="mt-2 flex justify-end">
            <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </RegisterPanel>
      ) : null}

      {!missing ? (
        <RegisterPanel title={`Incidents (${rows.length}) · ${openCount} not closed`}>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Status" htmlFor="it-f-status">
              <NativeSelect id="it-f-status" value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <option value="not_closed">Open / investigating</option>
                <option value="">All</option>
                {(Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {INCIDENT_STATUS_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Category" htmlFor="it-f-cat">
              <NativeSelect id="it-f-cat" value={categoryFilter} onChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
                <option value="">All categories</option>
                {(Object.keys(INCIDENT_CATEGORY_LABEL) as IncidentCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {INCIDENT_CATEGORY_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="space-y-1.5 md:hidden">
            {rows.map((i) => (
              <div key={i.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-semibold text-amber-800">{i.incident_no}</span>
                  <Chip tone={STATUS_TONE[i.status]}>{INCIDENT_STATUS_LABEL[i.status]}</Chip>
                  <Chip tone="grey">{INCIDENT_CATEGORY_LABEL[i.category]}</Chip>
                </div>
                <p>{i.description}</p>
                <KeyValue label="Occurred" value={`${formatDateTime(i.occurred_at)} · ${i.detected_by || '—'}`} />
                {i.data_impact ? <KeyValue label="Effect on data" value={i.data_impact} /> : null}
                {i.corrective_action ? <KeyValue label="Corrective action" value={i.corrective_action} /> : null}
                {i.nc_record_id ? <KeyValue label="NC" value={ncLabel(i.nc_record_id)} /> : null}
                {i.closed_at ? <KeyValue label="Closed" value={`${formatDateTime(i.closed_at)} · ${i.closed_by || '—'}`} /> : null}
                <div className="mt-1">{rowActions(i, true)}</div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={thClass}>No.</th>
                  <th className={thClass}>Occurred</th>
                  <th className={thClass}>Category</th>
                  <th className={thClass}>What happened</th>
                  <th className={thClass}>Effect on data</th>
                  <th className={thClass}>Actions taken</th>
                  <th className={thClass}>NC</th>
                  <th className={thClass}>Status</th>
                  {canWrite ? <th className={thClass}> </th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((i, idx) => (
                  <tr key={i.id} className={idx % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                    <td className={cn(tdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>{i.incident_no}</td>
                    <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>
                      {formatDateTime(i.occurred_at)}
                      <div className="text-stone-600">{i.detected_by || '—'}</div>
                    </td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>{INCIDENT_CATEGORY_LABEL[i.category]}</td>
                    <td className={tdClass}>
                      {i.description}
                      {i.affected_records ? <p className="text-[11px] text-stone-600">Records: {i.affected_records}</p> : null}
                    </td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>{i.data_impact || '—'}</td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>
                      {i.immediate_action ? <p>Correction: {i.immediate_action}</p> : null}
                      {i.root_cause ? <p>Cause: {i.root_cause}</p> : null}
                      {i.corrective_action ? <p>CA: {i.corrective_action}</p> : null}
                      {!i.immediate_action && !i.root_cause && !i.corrective_action ? '—' : null}
                    </td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>{ncLabel(i.nc_record_id) ?? '—'}</td>
                    <td className={cn(tdClass, 'text-center')}>
                      <Chip tone={STATUS_TONE[i.status]}>{INCIDENT_STATUS_LABEL[i.status]}</Chip>
                      {i.closed_at ? <div className="mt-0.5 whitespace-nowrap text-[11px] text-stone-600">{formatDateTime(i.closed_at)}</div> : null}
                    </td>
                    {canWrite ? <td className={tdClass}>{rowActions(i, false)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No incidents for these filters.</p> : null}
          {!canWrite ? (
            <p className="mt-2 text-[12px] text-stone-600">
              Report a LIMS failure to the Quality Manager or the Laboratory Director; they record it here.
            </p>
          ) : null}
        </RegisterPanel>
      ) : null}
    </div>
  )
}
