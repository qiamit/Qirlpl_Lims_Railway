import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, ChevronDown, ChevronRight, FileJson, Link2, Loader2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { APP_VERSION, appCommitSha } from '@/lib/appVersion'
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
  ENVIRONMENT_LABEL,
  RESULT_LABEL,
  SCOPE_LABEL,
  blankToNull,
  canWriteValidationRegisters,
  errorText,
  inputClass,
  intOrNull,
  isValidationMissingError,
  localInputToIso,
  runFieldsFromCalculationEvidence,
  tdClass,
  textareaClass,
  thClass,
  toLocalInput,
  type RunResult,
  type SoftwareChange,
  type ValidationEnvironment,
  type ValidationRun,
  type ValidationScope,
} from './validationShared'

type ChangeOption = Pick<SoftwareChange, 'id' | 'change_no' | 'title' | 'status'>

type Form = {
  title: string
  scope: ValidationScope
  appVersion: string
  commitSha: string
  environment: ValidationEnvironment
  executedBy: string
  executedAt: string
  result: RunResult
  total: string
  passed: string
  failed: string
  deviations: string
  evidencePaths: string
  linkedChangeId: string
  remarks: string
  evidence: unknown
  evidenceName: string
}

const RESULT_TONE: Record<RunResult, ChipTone> = { pass: 'green', fail: 'red', partial: 'amber' }

type EvidenceCase = { id?: unknown; title?: unknown; module?: unknown; status?: unknown; expected?: unknown; actual?: unknown }

function evidenceCases(evidence: unknown): EvidenceCase[] {
  if (!evidence || typeof evidence !== 'object') return []
  const cases = (evidence as { cases?: unknown }).cases
  return Array.isArray(cases) ? (cases as EvidenceCase[]) : []
}

function show(v: unknown): string {
  if (v === null || v === undefined) return '—'
  return typeof v === 'string' ? v : JSON.stringify(v)
}

export default function ValidationRunsPage() {
  const { designation, departmentName, profileName } = useAuth()
  const canWrite = canWriteValidationRegisters(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()
  const fileRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<ValidationRun[]>([])
  const [changes, setChanges] = useState<ChangeOption[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'ok' } | null>(null)
  const [scopeFilter, setScopeFilter] = useState<'' | ValidationScope>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [linking, setLinking] = useState<{ run: ValidationRun; changeId: string; remarks: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase.from('validation_test_runs').select('*').order('executed_at', { ascending: false }).limit(500)
      if (scopeFilter) q = q.eq('scope', scopeFilter)
      const res = await q
      if (res.error) {
        if (isValidationMissingError(res.error)) {
          setMissing(true)
          return
        }
        throw res.error
      }
      setMissing(false)
      setRows((res.data ?? []) as ValidationRun[])
      const cRes = await supabase
        .from('software_changes')
        .select('id, change_no, title, status')
        .order('change_no', { ascending: false })
        .limit(300)
      if (cRes.error) throw cRes.error
      setChanges((cRes.data ?? []) as ChangeOption[])
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [scopeFilter])

  useEffect(() => {
    void load()
  }, [load])

  const changeById = useMemo(() => new Map(changes.map((c) => [c.id, c])), [changes])

  const openNew = () => {
    setForm({
      title: '',
      scope: 'OQ',
      appVersion: APP_VERSION === 'unknown' ? '' : APP_VERSION,
      commitSha: appCommitSha() ?? '',
      environment: 'staging',
      executedBy: profileName,
      executedAt: toLocalInput(new Date()),
      result: 'pass',
      total: '',
      passed: '',
      failed: '',
      deviations: '',
      evidencePaths: '',
      linkedChangeId: '',
      remarks: '',
      evidence: {},
      evidenceName: '',
    })
    setFormOpen(true)
    setMessage(null)
  }

  const importEvidence = async (file: File | undefined) => {
    if (!file || !form) return
    try {
      const json = JSON.parse(await file.text()) as unknown
      const fields = runFieldsFromCalculationEvidence(json)
      if (!fields) {
        setForm({ ...form, evidence: json, evidenceName: file.name })
        setMessage({ text: `${file.name} attached as evidence (not a calculation-suite file, fields not filled).`, tone: 'info' })
        return
      }
      setForm({
        ...form,
        title: fields.title,
        scope: fields.scope,
        appVersion: fields.appVersion,
        commitSha: fields.commitSha ?? '',
        environment: 'local',
        executedAt: fields.executedAt ? toLocalInput(fields.executedAt) : form.executedAt,
        result: fields.result,
        total: String(fields.total),
        passed: String(fields.passed),
        failed: String(fields.failed),
        deviations: fields.deviations,
        evidencePaths: form.evidencePaths || `frontend/scripts/validation/out/${file.name}`,
        evidence: json,
        evidenceName: file.name,
      })
      setMessage({ text: `Filled from ${file.name}. Check the fields, then save.`, tone: 'ok' })
    } catch (err) {
      setMessage({ text: `Could not read ${file.name}: ${errorText(err)}`, tone: 'error' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    if (!form) return
    if (!form.title.trim() || !form.appVersion.trim() || !form.executedBy.trim()) {
      setMessage({ text: 'Enter the title, the app version and who executed the run.', tone: 'error' })
      return
    }
    if (form.result !== 'pass' && !form.deviations.trim()) {
      setMessage({ text: 'A failed or partial run needs the deviations written down.', tone: 'error' })
      return
    }
    const sha = form.commitSha.trim().toLowerCase()
    if (sha && !/^[0-9a-f]{7,40}$/.test(sha)) {
      setMessage({ text: 'The commit must be a git hash (7–40 characters, 0–9 and a–f).', tone: 'error' })
      return
    }
    if (!window.confirm('The result and evidence cannot be changed after saving. Save this run?')) return
    setSaving(true)
    setMessage(null)
    try {
      const { data, error: err } = await supabase
        .from('validation_test_runs')
        .insert({
          title: form.title.trim(),
          scope: form.scope,
          app_version: form.appVersion.trim(),
          commit_sha: sha || null,
          environment: form.environment,
          executed_by: form.executedBy.trim(),
          executed_at: localInputToIso(form.executedAt) ?? new Date().toISOString(),
          result: form.result,
          cases_total: intOrNull(form.total),
          cases_passed: intOrNull(form.passed),
          cases_failed: intOrNull(form.failed),
          deviations: blankToNull(form.deviations),
          evidence: form.evidence ?? {},
          evidence_paths: form.evidencePaths.split('\n').map((s) => s.trim()).filter(Boolean),
          linked_change_id: form.linkedChangeId || null,
          remarks: blankToNull(form.remarks),
        })
        .select('run_no')
        .single()
      if (err) throw err
      setMessage({ text: `Run ${String(data?.run_no ?? '')} recorded.`, tone: 'ok' })
      setFormOpen(false)
      await load()
    } catch (err) {
      setMessage({ text: errorText(err), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const review = async (r: ValidationRun) => {
    if (!window.confirm(`Mark ${r.run_no} as reviewed by you?`)) return
    const { data, error: err } = await supabase
      .from('validation_test_runs')
      .update({ reviewed_at: new Date().toISOString() })
      .eq('id', r.id)
      .select('id')
    if (err || !data?.length) {
      setMessage({ text: err ? errorText(err) : 'Not changed (Laboratory Director or Quality Manager only).', tone: 'error' })
      return
    }
    await load()
  }

  const saveLink = async () => {
    if (!linking) return
    const { run, changeId, remarks } = linking
    const { data, error: err } = await supabase
      .from('validation_test_runs')
      .update({ linked_change_id: changeId || null, remarks: blankToNull(remarks) })
      .eq('id', run.id)
      .select('id')
    if (err || !data?.length) {
      setMessage({ text: err ? errorText(err) : 'Not changed (Laboratory Director or Quality Manager only).', tone: 'error' })
      return
    }
    setLinking(null)
    await load()
  }

  const remove = async (r: ValidationRun) => {
    const reason = await askReason({
      title: 'Reason for deleting a validation run',
      recordLabel: `${r.run_no} · ${r.title}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Recorded against the wrong version'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('validation_test_runs').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage({ text: err ? errorText(err) : 'Not deleted (Laboratory Director only).', tone: 'error' })
      return
    }
    await recordReason('validation_test_runs', r.id, reason)
    await load()
  }

  const counts = (r: ValidationRun) =>
    r.cases_total === null ? '—' : `${r.cases_passed ?? 0}/${r.cases_total} passed${r.cases_failed ? `, ${r.cases_failed} failed` : ''}`

  const evidenceBlock = (r: ValidationRun) => {
    const cases = evidenceCases(r.evidence)
    return (
      <div className="space-y-1 border-t border-stone-300 bg-white p-2 text-[12px]">
        {r.deviations ? <KeyValue label="Deviations" value={<span className="whitespace-pre-line">{r.deviations}</span>} /> : null}
        {r.evidence_paths.length ? <KeyValue label="Evidence files" value={r.evidence_paths.join(', ')} /> : null}
        {r.remarks ? <KeyValue label="Remarks" value={r.remarks} /> : null}
        {cases.length ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Case</th>
                  <th className={thClass}>Check</th>
                  <th className={thClass}>Expected</th>
                  <th className={thClass}>Actual</th>
                  <th className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c, i) => (
                  <tr key={`${show(c.id)}-${i}`}>
                    <td className={cn(tdClass, 'whitespace-nowrap font-mono')}>{show(c.id)}</td>
                    <td className={tdClass}>{show(c.title)}</td>
                    <td className={cn(tdClass, 'font-mono text-[11px]')}>{show(c.expected)}</td>
                    <td className={cn(tdClass, 'font-mono text-[11px]')}>{show(c.actual)}</td>
                    <td className={cn(tdClass, 'text-center')}>
                      <Chip tone={c.status === 'pass' ? 'green' : c.status === 'fail' ? 'red' : 'amber'}>{show(c.status)}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    )
  }

  const rowActions = (r: ValidationRun, lg: boolean) => (
    <div className="flex flex-wrap justify-end gap-1">
      <Button variant="outline" className={cn(limsOutlineBtnClass, lg ? 'h-10' : 'h-7 px-2 text-[12px]')}
        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
        {expanded === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Evidence
      </Button>
      {canWrite && !r.reviewed_at ? (
        <Button className={cn(limsPrimaryBtnClass, lg ? 'h-10' : 'h-7 px-2 text-[12px]')} onClick={() => void review(r)}>
          <BadgeCheck className="h-3.5 w-3.5" /> Reviewed
        </Button>
      ) : null}
      {canWrite ? (
        <Button variant="outline" className={cn(limsOutlineBtnClass, lg ? 'h-10' : 'h-7 px-2 text-[12px]')}
          onClick={() => setLinking({ run: r, changeId: r.linked_change_id ?? '', remarks: r.remarks ?? '' })}>
          <Link2 className="h-3.5 w-3.5" /> Link
        </Button>
      ) : null}
      {isDirector ? (
        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, lg ? 'h-10 w-10' : 'h-7 w-7')}
          onClick={() => void remove(r)} aria-label={`Delete ${r.run_no}`}>
          <Trash2 className="h-4 w-4 text-red-700" />
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className={limsPageShellClass}>
      <RegisterHeader
        title="LIMS Validation Runs"
        clause="7.11.2 · 7.11.6"
        subtitle="IQ / OQ / PQ, regression and calculation checks, with the version tested and the evidence."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canWrite && !missing ? (
              <Button className={limsPrimaryBtnClass} onClick={openNew}>
                <Plus className="h-4 w-4" /> Record run
              </Button>
            ) : null}
          </>
        }
      />
      {missing ? <MissingRegistersNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine tone={message?.tone} text={message?.text ?? null} />

      {formOpen && form ? (
        <RegisterPanel
          title="Record a validation run"
          right={
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => void importEvidence(e.target.files?.[0])} />
              <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => fileRef.current?.click()}>
                <FileJson className="h-4 w-4" /> Import evidence JSON
              </Button>
              <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => setFormOpen(false)}>
                <X className="h-4 w-4" /> Close
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Title *" htmlFor="vr-title" className="sm:col-span-2">
              <Input id="vr-title" value={form.title} placeholder="e.g. OQ — sample receiving to report issue"
                onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Scope *" htmlFor="vr-scope">
              <NativeSelect id="vr-scope" value={form.scope} onChange={(v) => setForm({ ...form, scope: v as ValidationScope })}>
                {(Object.keys(SCOPE_LABEL) as ValidationScope[]).map((k) => (
                  <option key={k} value={k}>
                    {SCOPE_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Environment *" htmlFor="vr-env">
              <NativeSelect id="vr-env" value={form.environment} onChange={(v) => setForm({ ...form, environment: v as ValidationEnvironment })}>
                {(Object.keys(ENVIRONMENT_LABEL) as ValidationEnvironment[]).map((k) => (
                  <option key={k} value={k}>
                    {ENVIRONMENT_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="App version tested *" htmlFor="vr-ver">
              <Input id="vr-ver" value={form.appVersion} onChange={(e) => setForm({ ...form, appVersion: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Commit" htmlFor="vr-sha">
              <Input id="vr-sha" value={form.commitSha} onChange={(e) => setForm({ ...form, commitSha: e.target.value })} className={cn(inputClass, 'font-mono')} />
            </Field>
            <Field label="Executed by *" htmlFor="vr-by">
              <Input id="vr-by" value={form.executedBy} onChange={(e) => setForm({ ...form, executedBy: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Executed at *" htmlFor="vr-at">
              <Input id="vr-at" type="datetime-local" value={form.executedAt} onChange={(e) => setForm({ ...form, executedAt: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Result *" htmlFor="vr-res">
              <NativeSelect id="vr-res" value={form.result} onChange={(v) => setForm({ ...form, result: v as RunResult })}>
                {(Object.keys(RESULT_LABEL) as RunResult[]).map((k) => (
                  <option key={k} value={k}>
                    {RESULT_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-3 gap-2 sm:col-span-1">
              <Field label="Cases" htmlFor="vr-total">
                <Input id="vr-total" inputMode="numeric" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Passed" htmlFor="vr-pass">
                <Input id="vr-pass" inputMode="numeric" value={form.passed} onChange={(e) => setForm({ ...form, passed: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Failed" htmlFor="vr-fail">
                <Input id="vr-fail" inputMode="numeric" value={form.failed} onChange={(e) => setForm({ ...form, failed: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <Field label="Change validated" htmlFor="vr-chg" className="sm:col-span-2">
              <NativeSelect id="vr-chg" value={form.linkedChangeId} onChange={(v) => setForm({ ...form, linkedChangeId: v })}>
                <option value="">— None —</option>
                {changes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.change_no} — {c.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={form.result === 'pass' ? 'Deviations / known issues' : 'Deviations *'} htmlFor="vr-dev" className="sm:col-span-2">
              <Textarea id="vr-dev" value={form.deviations} onChange={(e) => setForm({ ...form, deviations: e.target.value })} className={textareaClass} />
            </Field>
            <Field label="Evidence files (one per line)" htmlFor="vr-paths" className="sm:col-span-2"
              hint={form.evidenceName ? `Evidence JSON attached: ${form.evidenceName}` : 'Screenshots, PDFs, test script sheets (path or link).'}>
              <Textarea id="vr-paths" value={form.evidencePaths} onChange={(e) => setForm({ ...form, evidencePaths: e.target.value })} className={textareaClass} />
            </Field>
            <Field label="Remarks" htmlFor="vr-rem" className="sm:col-span-2 lg:col-span-4">
              <Input id="vr-rem" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <div className="mt-2 flex justify-end">
            <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </RegisterPanel>
      ) : null}

      {linking ? (
        <RegisterPanel title={`Link ${linking.run.run_no} to a change`}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Change" htmlFor="vr-link-chg">
              <NativeSelect id="vr-link-chg" value={linking.changeId} onChange={(v) => setLinking({ ...linking, changeId: v })}>
                <option value="">— None —</option>
                {changes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.change_no} — {c.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Remarks" htmlFor="vr-link-rem">
              <Input id="vr-link-rem" value={linking.remarks} onChange={(e) => setLinking({ ...linking, remarks: e.target.value })} className={inputClass} />
            </Field>
            <div className="flex items-end justify-end gap-1">
              <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-8')} onClick={() => setLinking(null)}>
                Cancel
              </Button>
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void saveLink()}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        </RegisterPanel>
      ) : null}

      {!missing ? (
        <RegisterPanel
          title={`Runs (${rows.length})`}
          right={
            <NativeSelect ariaLabel="Scope filter" value={scopeFilter} onChange={(v) => setScopeFilter(v as typeof scopeFilter)}
              className="h-7 w-auto text-[12px] sm:h-7">
              <option value="">All scopes</option>
              {(Object.keys(SCOPE_LABEL) as ValidationScope[]).map((k) => (
                <option key={k} value={k}>
                  {SCOPE_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
          }
        >
          <div className="space-y-1.5 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-semibold text-amber-800">{r.run_no}</span>
                  <Chip tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Chip>
                  <Chip tone="grey">{r.scope}</Chip>
                </div>
                <p className="font-semibold">{r.title}</p>
                <KeyValue label="Version" value={[r.app_version, r.commit_sha].filter(Boolean).join(' · ')} />
                <KeyValue label="Run" value={`${formatDateTime(r.executed_at)} · ${r.executed_by} · ${ENVIRONMENT_LABEL[r.environment]}`} />
                <KeyValue label="Cases" value={counts(r)} />
                {r.linked_change_id ? <KeyValue label="Change" value={changeById.get(r.linked_change_id)?.change_no ?? '—'} /> : null}
                <KeyValue label="Reviewed" value={r.reviewed_at ? `${formatDateTime(r.reviewed_at)} · ${r.reviewed_by}` : 'Not yet'} />
                <div className="mt-1">{rowActions(r, true)}</div>
                {expanded === r.id ? evidenceBlock(r) : null}
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={thClass}>No.</th>
                  <th className={thClass}>Run</th>
                  <th className={thClass}>Scope</th>
                  <th className={thClass}>Version</th>
                  <th className={thClass}>Executed</th>
                  <th className={thClass}>Cases</th>
                  <th className={thClass}>Result</th>
                  <th className={thClass}>Change</th>
                  <th className={thClass}>Reviewed</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.id}>
                    <tr className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(tdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>{r.run_no}</td>
                      <td className={tdClass}>
                        <p className="font-semibold">{r.title}</p>
                        {r.deviations ? <p className="line-clamp-2 whitespace-pre-line text-[11px] text-stone-600">{r.deviations}</p> : null}
                      </td>
                      <td className={cn(tdClass, 'text-center')}>{r.scope}</td>
                      <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>
                        {r.app_version}
                        {r.commit_sha && r.commit_sha !== r.app_version ? <div className="font-mono text-stone-600">{r.commit_sha}</div> : null}
                      </td>
                      <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>
                        {formatDateTime(r.executed_at)}
                        <div className="text-stone-600">
                          {r.executed_by} · {ENVIRONMENT_LABEL[r.environment]}
                        </div>
                      </td>
                      <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>{counts(r)}</td>
                      <td className={cn(tdClass, 'text-center')}>
                        <Chip tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Chip>
                      </td>
                      <td className={cn(tdClass, 'whitespace-nowrap font-mono text-[11.5px]')}>
                        {r.linked_change_id ? changeById.get(r.linked_change_id)?.change_no ?? '—' : '—'}
                      </td>
                      <td className={cn(tdClass, 'whitespace-nowrap text-[11.5px]')}>
                        {r.reviewed_at ? (
                          <>
                            {formatDateTime(r.reviewed_at)}
                            <div className="text-stone-600">{r.reviewed_by}</div>
                          </>
                        ) : (
                          <Chip tone="amber">Pending</Chip>
                        )}
                      </td>
                      <td className={tdClass}>{rowActions(r, false)}</td>
                    </tr>
                    {expanded === r.id ? (
                      <tr>
                        <td colSpan={10} className="p-0">
                          {evidenceBlock(r)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No validation runs recorded yet.</p> : null}
          <p className="mt-2 text-[12px] text-stone-600">
            Calculation checks: run <code>npm run validate:calculations</code> in <code>frontend/</code>, then use
            “Import evidence JSON” with <code>scripts/validation/out/latest.json</code>.
          </p>
        </RegisterPanel>
      ) : null}
    </div>
  )
}
