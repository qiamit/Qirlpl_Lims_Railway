import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Rocket, Save, Trash2, Undo2, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { APP_VERSION, appCommitSha } from '@/lib/appVersion'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarBtnClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
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
  CHANGE_STATUS_LABEL,
  RESULT_LABEL,
  RISK_LABEL,
  blankToNull,
  canWriteValidationRegisters,
  errorText,
  inputClass,
  isValidationMissingError,
  localDateKey,
  tdClass,
  textareaClass,
  thClass,
  type ChangeRisk,
  type ChangeStatus,
  type RunResult,
  type SoftwareChange,
} from './validationShared'

type LinkedRun = { id: string; run_no: string; result: RunResult; linked_change_id: string }

type Form = {
  title: string
  description: string
  reason: string
  modulesAffected: string
  appVersion: string
  commitSha: string
  risk: ChangeRisk
  validationRequired: boolean
  validationRef: string
  requestedBy: string
  requestedOn: string
  rollbackPlan: string
  remarks: string
}

function emptyForm(): Form {
  return {
    title: '',
    description: '',
    reason: '',
    modulesAffected: '',
    appVersion: '',
    commitSha: '',
    risk: 'medium',
    validationRequired: true,
    validationRef: '',
    requestedBy: '',
    requestedOn: localDateKey(new Date()),
    rollbackPlan: '',
    remarks: '',
  }
}

function formFrom(c: SoftwareChange): Form {
  return {
    title: c.title,
    description: c.description ?? '',
    reason: c.reason ?? '',
    modulesAffected: c.modules_affected ?? '',
    appVersion: c.app_version ?? '',
    commitSha: c.commit_sha ?? '',
    risk: c.risk,
    validationRequired: c.validation_required,
    validationRef: c.validation_ref ?? '',
    requestedBy: c.requested_by ?? '',
    requestedOn: c.requested_on.slice(0, 10),
    rollbackPlan: c.rollback_plan ?? '',
    remarks: c.remarks ?? '',
  }
}

const STATUS_TONE: Record<ChangeStatus, ChipTone> = {
  requested: 'amber',
  approved: 'blue',
  rejected: 'red',
  deployed: 'green',
  rolled_back: 'red',
  cancelled: 'grey',
}

const RISK_TONE: Record<ChangeRisk, ChipTone> = { low: 'green', medium: 'amber', high: 'red' }

export default function SoftwareChangesPage() {
  const { designation, departmentName, profileName } = useAuth()
  const canWrite = canWriteValidationRegisters(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [rows, setRows] = useState<SoftwareChange[]>([])
  const [runs, setRuns] = useState<LinkedRun[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'ok' } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'' | 'open' | ChangeStatus>('open')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SoftwareChange | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await supabase
        .from('software_changes')
        .select('*')
        .order('requested_on', { ascending: false })
        .order('change_no', { ascending: false })
        .limit(500)
      if (res.error) {
        if (isValidationMissingError(res.error)) {
          setMissing(true)
          return
        }
        throw res.error
      }
      setMissing(false)
      setRows((res.data ?? []) as SoftwareChange[])
      const runRes = await supabase
        .from('validation_test_runs')
        .select('id, run_no, result, linked_change_id')
        .not('linked_change_id', 'is', null)
        .order('executed_at', { ascending: false })
        .limit(1000)
      if (runRes.error) throw runRes.error
      setRuns((runRes.data ?? []) as LinkedRun[])
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runsByChange = useMemo(() => {
    const map = new Map<string, LinkedRun[]>()
    for (const r of runs) {
      const list = map.get(r.linked_change_id) ?? []
      list.push(r)
      map.set(r.linked_change_id, list)
    }
    return map
  }, [runs])

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter === 'open' && !['requested', 'approved'].includes(r.status)) return false
      if (statusFilter && statusFilter !== 'open' && r.status !== statusFilter) return false
      if (!s) return true
      return [r.change_no, r.title, r.description, r.modules_affected, r.app_version, r.commit_sha]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    })
  }, [rows, search, statusFilter])

  const openNew = () => {
    setEditing(null)
    setForm({
      ...emptyForm(),
      requestedBy: profileName,
      appVersion: APP_VERSION === 'unknown' ? '' : APP_VERSION,
      commitSha: appCommitSha() ?? '',
    })
    setFormOpen(true)
    setMessage(null)
  }

  const openEdit = (c: SoftwareChange) => {
    setEditing(c)
    setForm(formFrom(c))
    setFormOpen(true)
    setMessage(null)
  }

  const save = async () => {
    if (!form.title.trim()) {
      setMessage({ text: 'Enter a title for the change.', tone: 'error' })
      return
    }
    const sha = form.commitSha.trim().toLowerCase()
    if (sha && !/^[0-9a-f]{7,40}$/.test(sha)) {
      setMessage({ text: 'The commit must be a git hash (7–40 characters, 0–9 and a–f).', tone: 'error' })
      return
    }
    let reason: string | null = null
    if (editing && editing.status !== 'requested') {
      reason = await askReason({
        title: 'Reason for changing an approved change record',
        recordLabel: `${editing.change_no} · ${editing.title}`,
        confirmLabel: 'Save',
      })
      if (!reason) return
    }
    setSaving(true)
    setMessage(null)
    const payload = {
      title: form.title.trim(),
      description: blankToNull(form.description),
      reason: blankToNull(form.reason),
      modules_affected: blankToNull(form.modulesAffected),
      app_version: blankToNull(form.appVersion),
      commit_sha: sha || null,
      risk: form.risk,
      validation_required: form.validationRequired,
      validation_ref: blankToNull(form.validationRef),
      requested_by: blankToNull(form.requestedBy),
      requested_on: form.requestedOn || localDateKey(new Date()),
      rollback_plan: blankToNull(form.rollbackPlan),
      remarks: blankToNull(form.remarks),
    }
    try {
      if (editing) {
        const { data, error: err } = await supabase
          .from('software_changes')
          .update(payload)
          .eq('id', editing.id)
          .select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director or Quality Manager only).')
        if (reason) await recordReason('software_changes', editing.id, reason)
        setMessage({ text: `${editing.change_no} saved.`, tone: 'ok' })
      } else {
        const { data, error: err } = await supabase.from('software_changes').insert(payload).select('change_no').single()
        if (err) throw err
        setMessage({ text: `Change ${String(data?.change_no ?? '')} recorded.`, tone: 'ok' })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setMessage({ text: errorText(err), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (c: SoftwareChange, status: ChangeStatus) => {
    const verbs: Record<ChangeStatus, string> = {
      requested: 'Re-open',
      approved: 'Approve',
      rejected: 'Reject',
      deployed: 'Mark as deployed',
      rolled_back: 'Mark as rolled back',
      cancelled: 'Cancel',
    }
    let reason: string | null = null
    if (status === 'rejected' || status === 'rolled_back' || status === 'cancelled') {
      reason = await askReason({
        title: `Reason: ${verbs[status].toLowerCase()}`,
        recordLabel: `${c.change_no} · ${c.title}`,
        confirmLabel: verbs[status],
      })
      if (!reason) return
    } else if (!window.confirm(`${verbs[status]} ${c.change_no}?`)) {
      return
    }
    setMessage(null)
    const patch: Record<string, unknown> = { status }
    if (status === 'deployed') patch.deployed_at = new Date().toISOString()
    const { data, error: err } = await supabase.from('software_changes').update(patch).eq('id', c.id).select('id')
    if (err || !data?.length) {
      setMessage({ text: err ? errorText(err) : 'Not changed (Laboratory Director or Quality Manager only).', tone: 'error' })
      return
    }
    if (reason) await recordReason('software_changes', c.id, reason)
    setMessage({ text: `${c.change_no}: ${CHANGE_STATUS_LABEL[status]}.`, tone: 'ok' })
    await load()
  }

  const remove = async (c: SoftwareChange) => {
    const reason = await askReason({
      title: 'Reason for deleting a change record',
      recordLabel: `${c.change_no} · ${c.title}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('software_changes').delete().eq('id', c.id).select('id')
    if (err || !data?.length) {
      setMessage({ text: err ? errorText(err) : 'Not deleted (Laboratory Director only).', tone: 'error' })
      return
    }
    await recordReason('software_changes', c.id, reason)
    await load()
  }

  const validationCell = (c: SoftwareChange) => {
    const linked = runsByChange.get(c.id) ?? []
    if (!c.validation_required) return <span className="text-stone-500">Not required</span>
    return (
      <div className="space-y-0.5">
        {linked.map((r) => (
          <div key={r.id}>
            <span className="font-mono">{r.run_no}</span>{' '}
            <Chip tone={r.result === 'pass' ? 'green' : r.result === 'fail' ? 'red' : 'amber'}>{RESULT_LABEL[r.result]}</Chip>
          </div>
        ))}
        {c.validation_ref ? <div className="text-[11.5px]">Ref: {c.validation_ref}</div> : null}
        {!linked.some((r) => r.result === 'pass') && !c.validation_ref ? <Chip tone="amber">Pending</Chip> : null}
      </div>
    )
  }

  const actions = (c: SoftwareChange, size: 'sm' | 'lg') => {
    if (!canWrite) return null
    const h = size === 'lg' ? 'h-10' : 'h-7 px-2 text-[12px]'
    const btn = (label: string, icon: ReactNode, onClick: () => void, primary = false) => (
      <Button
        key={label}
        variant={primary ? 'default' : 'outline'}
        className={cn(primary ? limsPrimaryBtnClass : limsOutlineBtnClass, h)}
        onClick={onClick}
      >
        {icon} {label}
      </Button>
    )
    const out: ReactNode[] = []
    if (c.status === 'requested') {
      out.push(btn('Approve', <CheckCircle2 className="h-3.5 w-3.5" />, () => void setStatus(c, 'approved'), true))
      out.push(btn('Reject', <XCircle className="h-3.5 w-3.5" />, () => void setStatus(c, 'rejected')))
    }
    if (c.status === 'approved') {
      out.push(btn('Deployed', <Rocket className="h-3.5 w-3.5" />, () => void setStatus(c, 'deployed'), true))
      out.push(btn('Cancel', <X className="h-3.5 w-3.5" />, () => void setStatus(c, 'cancelled')))
    }
    if (c.status === 'deployed') {
      out.push(btn('Rolled back', <Undo2 className="h-3.5 w-3.5" />, () => void setStatus(c, 'rolled_back')))
    }
    if (c.status === 'rejected' || c.status === 'cancelled') {
      out.push(btn('Re-open', <Undo2 className="h-3.5 w-3.5" />, () => void setStatus(c, 'requested')))
    }
    out.push(btn('Edit', <Pencil className="h-3.5 w-3.5" />, () => openEdit(c)))
    if (isDirector) {
      out.push(
        <Button
          key="del"
          size="icon"
          variant="outline"
          className={cn(limsOutlineBtnClass, size === 'lg' ? 'h-10 w-10' : 'h-7 w-7')}
          onClick={() => void remove(c)}
          aria-label={`Delete ${c.change_no}`}
        >
          <Trash2 className="h-4 w-4 text-red-700" />
        </Button>,
      )
    }
    return <div className="flex flex-wrap justify-end gap-1">{out}</div>
  }

  return (
    <div className={limsPageShellClass}>
      <RegisterHeader
        title="Software Change Control"
        clause="7.11.2"
        subtitle="Every change to the LIMS: risk, approval, validation before use, deployment and rollback."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canWrite && !missing ? (
              <Button className={limsPrimaryBtnClass} onClick={openNew}>
                <Plus className="h-4 w-4" /> New change
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
          title={editing ? `Edit ${editing.change_no}` : 'New change request'}
          right={
            <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" /> Close
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Title *" htmlFor="sc-title" className="sm:col-span-2">
              <Input id="sc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Risk to results *" htmlFor="sc-risk" hint="High: calculations, numbering, report content, data loss.">
              <NativeSelect id="sc-risk" value={form.risk} onChange={(v) => setForm({ ...form, risk: v as ChangeRisk })}>
                {(Object.keys(RISK_LABEL) as ChangeRisk[]).map((k) => (
                  <option key={k} value={k}>
                    {RISK_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Requested on" htmlFor="sc-on">
              <Input id="sc-on" type="date" value={form.requestedOn} onChange={(e) => setForm({ ...form, requestedOn: e.target.value })} className={inputClass} />
            </Field>
            <Field label="What changes" htmlFor="sc-desc" className="sm:col-span-2">
              <Textarea id="sc-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={textareaClass} />
            </Field>
            <Field label="Why" htmlFor="sc-reason" className="sm:col-span-2">
              <Textarea id="sc-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={textareaClass} />
            </Field>
            <Field label="Modules affected" htmlFor="sc-mod" className="sm:col-span-2">
              <Input id="sc-mod" value={form.modulesAffected} placeholder="e.g. Report preparation, Decision rules"
                onChange={(e) => setForm({ ...form, modulesAffected: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Version" htmlFor="sc-ver">
              <Input id="sc-ver" value={form.appVersion} onChange={(e) => setForm({ ...form, appVersion: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Commit" htmlFor="sc-sha">
              <Input id="sc-sha" value={form.commitSha} placeholder="a46340b" onChange={(e) => setForm({ ...form, commitSha: e.target.value })} className={cn(inputClass, 'font-mono')} />
            </Field>
            <Field label="Requested by" htmlFor="sc-by">
              <Input id="sc-by" value={form.requestedBy} onChange={(e) => setForm({ ...form, requestedBy: e.target.value })} className={inputClass} />
            </Field>
            <label className="flex min-h-10 items-end gap-2 pb-1.5 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={form.validationRequired}
                onChange={(e) => setForm({ ...form, validationRequired: e.target.checked })} />
              Validation required before use
            </label>
            <Field label="Validation reference" htmlFor="sc-vref" className="sm:col-span-2"
              hint="Or link a validation run to this change on the Validation Runs page.">
              <Input id="sc-vref" value={form.validationRef} onChange={(e) => setForm({ ...form, validationRef: e.target.value })} className={inputClass} />
            </Field>
            <Field label={form.risk === 'high' ? 'Rollback plan * (high risk)' : 'Rollback plan'} htmlFor="sc-rb" className="sm:col-span-2">
              <Textarea id="sc-rb" value={form.rollbackPlan} placeholder="e.g. Redeploy the previous Railway deployment; restore last night's backup"
                onChange={(e) => setForm({ ...form, rollbackPlan: e.target.value })} className={textareaClass} />
            </Field>
            <Field label="Remarks" htmlFor="sc-rem" className="sm:col-span-2 lg:col-span-4">
              <Input id="sc-rem" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={inputClass} />
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
        <RegisterPanel title={`Changes (${visible.length})`}>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Status" htmlFor="sc-f-status">
              <NativeSelect id="sc-f-status" value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <option value="open">Open (requested / approved)</option>
                <option value="">All</option>
                {(Object.keys(CHANGE_STATUS_LABEL) as ChangeStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {CHANGE_STATUS_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Search" htmlFor="sc-f-search" className="sm:col-span-2">
              <Input id="sc-f-search" value={search} placeholder="Number, title, module, commit"
                onChange={(e) => setSearch(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="space-y-1.5 md:hidden">
            {visible.map((c) => (
              <div key={c.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-semibold text-amber-800">{c.change_no}</span>
                  <Chip tone={STATUS_TONE[c.status]}>{CHANGE_STATUS_LABEL[c.status]}</Chip>
                  <Chip tone={RISK_TONE[c.risk]}>{RISK_LABEL[c.risk]} risk</Chip>
                </div>
                <p className="font-semibold">{c.title}</p>
                {c.description ? <p className="text-[12px]">{c.description}</p> : null}
                <KeyValue label="Version" value={[c.app_version, c.commit_sha].filter(Boolean).join(' · ') || '—'} />
                <KeyValue label="Requested" value={`${formatDate(c.requested_on)} · ${c.requested_by || '—'}`} />
                {c.approved_at ? <KeyValue label="Approved" value={`${formatDateTime(c.approved_at)} · ${c.approved_by}`} /> : null}
                {c.deployed_at ? <KeyValue label="Deployed" value={`${formatDateTime(c.deployed_at)} · ${c.deployed_by || '—'}`} /> : null}
                <div className="mt-1 text-[12px]">{validationCell(c)}</div>
                <div className="mt-1">{actions(c, 'lg')}</div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={thClass}>No.</th>
                  <th className={thClass}>Change</th>
                  <th className={thClass}>Risk</th>
                  <th className={thClass}>Version</th>
                  <th className={thClass}>Requested</th>
                  <th className={thClass}>Approved</th>
                  <th className={thClass}>Validation</th>
                  <th className={thClass}>Status</th>
                  {canWrite ? <th className={thClass}>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => (
                  <tr key={c.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                    <td className={cn(tdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>{c.change_no}</td>
                    <td className={tdClass}>
                      <p className="font-semibold">{c.title}</p>
                      {c.description ? <p className="text-[11.5px] text-stone-700">{c.description}</p> : null}
                      {c.modules_affected ? <p className="text-[11px] text-stone-500">Modules: {c.modules_affected}</p> : null}
                      {c.rollback_plan ? <p className="text-[11px] text-stone-500">Rollback: {c.rollback_plan}</p> : null}
                    </td>
                    <td className={cn(tdClass, 'text-center')}>
                      <Chip tone={RISK_TONE[c.risk]}>{RISK_LABEL[c.risk]}</Chip>
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>
                      {c.app_version || '—'}
                      {c.commit_sha ? <div className="font-mono text-stone-600">{c.commit_sha}</div> : null}
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>
                      {formatDate(c.requested_on)}
                      <div className="text-stone-600">{c.requested_by || '—'}</div>
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>
                      {c.approved_at ? (
                        <>
                          {formatDateTime(c.approved_at)}
                          <div className="text-stone-600">{c.approved_by}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>{validationCell(c)}</td>
                    <td className={cn(tdClass, 'text-center')}>
                      <Chip tone={STATUS_TONE[c.status]}>{CHANGE_STATUS_LABEL[c.status]}</Chip>
                      {c.deployed_at ? <div className="mt-0.5 text-[11px] text-stone-600">{formatDateTime(c.deployed_at)}</div> : null}
                    </td>
                    {canWrite ? <td className={tdClass}>{actions(c, 'sm')}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && visible.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No changes for these filters.</p> : null}
          {!canWrite ? (
            <p className="mt-2 text-[12px] text-stone-600">
              Changes are recorded and approved by the Laboratory Director or the Quality Manager.
            </p>
          ) : null}
        </RegisterPanel>
      ) : null}
    </div>
  )
}
