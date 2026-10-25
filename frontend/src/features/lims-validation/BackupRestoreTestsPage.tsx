import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatabaseBackup, Loader2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
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
  BACKUP_KIND_LABEL,
  RESTORE_TEST_INTERVAL_DAYS,
  RESULT_LABEL,
  STANDARD_RESTORE_CHECKS,
  blankToNull,
  canWriteValidationRegisters,
  daysSince,
  errorText,
  inputClass,
  intOrNull,
  isValidationMissingError,
  localDateKey,
  localInputToIso,
  tdClass,
  thClass,
  type BackupKind,
  type BackupRestoreTest,
  type ItIncident,
  type RestoreCheck,
  type RunResult,
} from './validationShared'

type IncidentOption = Pick<ItIncident, 'id' | 'incident_no' | 'description'>

type Form = {
  testedOn: string
  backupKind: BackupKind
  backupId: string
  backupName: string
  backupTakenAt: string
  restoredTo: string
  checks: RestoreCheck[]
  extraCheck: string
  result: RunResult
  restoreMinutes: string
  performedBy: string
  witnessedBy: string
  linkedIncidentId: string
  remarks: string
}

const RESULT_TONE: Record<RunResult, ChipTone> = { pass: 'green', fail: 'red', partial: 'amber' }

function newForm(profileName: string): Form {
  return {
    testedOn: localDateKey(new Date()),
    backupKind: 'daily',
    backupId: '',
    backupName: '',
    backupTakenAt: '',
    restoredTo: '',
    checks: STANDARD_RESTORE_CHECKS.map((check) => ({ check, ok: false, note: '' })),
    extraCheck: '',
    result: 'pass',
    restoreMinutes: '',
    performedBy: profileName,
    witnessedBy: '',
    linkedIncidentId: '',
    remarks: '',
  }
}

function checksOk(checks: RestoreCheck[]): string {
  if (!Array.isArray(checks) || checks.length === 0) return '—'
  return `${checks.filter((c) => c.ok).length}/${checks.length} OK`
}

export default function BackupRestoreTestsPage() {
  const { designation, departmentName, profileName } = useAuth()
  const canWrite = canWriteValidationRegisters(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [rows, setRows] = useState<BackupRestoreTest[]>([])
  const [incidents, setIncidents] = useState<IncidentOption[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'ok' } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await supabase
        .from('backup_restore_tests')
        .select('*')
        .order('tested_on', { ascending: false })
        .order('test_no', { ascending: false })
        .limit(200)
      if (res.error) {
        if (isValidationMissingError(res.error)) {
          setMissing(true)
          return
        }
        throw res.error
      }
      setMissing(false)
      setRows((res.data ?? []) as BackupRestoreTest[])
      const iRes = await supabase
        .from('it_incidents')
        .select('id, incident_no, description')
        .order('occurred_at', { ascending: false })
        .limit(200)
      if (iRes.error) throw iRes.error
      setIncidents((iRes.data ?? []) as IncidentOption[])
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const lastPass = useMemo(() => rows.find((r) => r.result === 'pass') ?? null, [rows])
  const age = lastPass ? daysSince(lastPass.tested_on) : null
  const overdue = age === null || age > RESTORE_TEST_INTERVAL_DAYS

  const setCheck = (idx: number, patch: Partial<RestoreCheck>) => {
    if (!form) return
    setForm({ ...form, checks: form.checks.map((c, i) => (i === idx ? { ...c, ...patch } : c)) })
  }

  const save = async () => {
    if (!form) return
    if (!form.backupId.trim() && !form.backupName.trim()) {
      setMessage({ text: 'Enter the backup id or name (as shown in Railway → Backups).', tone: 'error' })
      return
    }
    if (!form.restoredTo.trim() || !form.performedBy.trim()) {
      setMessage({ text: 'Enter where the backup was restored and who did it.', tone: 'error' })
      return
    }
    const failedChecks = form.checks.filter((c) => !c.ok)
    if (form.result === 'pass' && failedChecks.length > 0) {
      setMessage({ text: `${failedChecks.length} check(s) are not ticked. Tick them, remove them, or record the result as partial / fail.`, tone: 'error' })
      return
    }
    if (form.result !== 'pass' && !form.remarks.trim()) {
      setMessage({ text: 'A failed or partial restore test needs remarks (what failed, what happens next).', tone: 'error' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const { data, error: err } = await supabase
        .from('backup_restore_tests')
        .insert({
          tested_on: form.testedOn,
          backup_kind: form.backupKind,
          backup_id: blankToNull(form.backupId),
          backup_name: blankToNull(form.backupName),
          backup_taken_at: localInputToIso(form.backupTakenAt),
          restored_to: form.restoredTo.trim(),
          checks_done: form.checks.map((c) => ({ check: c.check, ok: c.ok, ...(c.note?.trim() ? { note: c.note.trim() } : {}) })),
          result: form.result,
          restore_minutes: intOrNull(form.restoreMinutes),
          performed_by: form.performedBy.trim(),
          witnessed_by: blankToNull(form.witnessedBy),
          linked_incident_id: form.linkedIncidentId || null,
          remarks: blankToNull(form.remarks),
        })
        .select('test_no')
        .single()
      if (err) throw err
      setMessage({ text: `Restore test ${String(data?.test_no ?? '')} recorded.`, tone: 'ok' })
      setForm(null)
      await load()
    } catch (err) {
      setMessage({ text: errorText(err), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: BackupRestoreTest) => {
    const reason = await askReason({
      title: 'Reason for deleting a restore test record',
      recordLabel: `${r.test_no} · ${formatDate(r.tested_on)}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('backup_restore_tests').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage({ text: err ? errorText(err) : 'Not deleted (Laboratory Director only).', tone: 'error' })
      return
    }
    await recordReason('backup_restore_tests', r.id, reason)
    await load()
  }

  const checksBlock = (r: BackupRestoreTest) => (
    <ul className="space-y-0.5 border-t border-stone-300 bg-white p-2 text-[12px]">
      {(Array.isArray(r.checks_done) ? r.checks_done : []).map((c, i) => (
        <li key={`${r.id}-${i}`} className="flex gap-1.5">
          <Chip tone={c.ok ? 'green' : 'red'}>{c.ok ? 'OK' : 'NOT OK'}</Chip>
          <span>
            {c.check}
            {c.note ? <span className="text-stone-600"> — {c.note}</span> : null}
          </span>
        </li>
      ))}
      {r.remarks ? <li className="pt-1 italic">Remarks: {r.remarks}</li> : null}
    </ul>
  )

  return (
    <div className={limsPageShellClass}>
      <RegisterHeader
        title="Backup Restore Tests"
        clause="7.11.3 (c)"
        subtitle="Proof that the Railway Postgres backups can be restored and the data is complete."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canWrite && !missing ? (
              <Button className={limsPrimaryBtnClass} onClick={() => { setForm(newForm(profileName)); setMessage(null) }}>
                <Plus className="h-4 w-4" /> Record restore test
              </Button>
            ) : null}
          </>
        }
      />
      {missing ? <MissingRegistersNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine tone={message?.tone} text={message?.text ?? null} />

      {!missing && !loading ? (
        <div className={cn('flex items-start gap-2 border-2 p-3 text-[13px]', overdue ? 'border-red-600 bg-red-50 text-red-900' : 'border-emerald-600 bg-emerald-50 text-emerald-900')}>
          <DatabaseBackup className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            {lastPass ? (
              <p className="font-semibold">
                Last successful restore test: {lastPass.test_no} on {formatDate(lastPass.tested_on)} ({age} day{age === 1 ? '' : 's'} ago).
              </p>
            ) : (
              <p className="font-semibold">No successful restore test recorded yet.</p>
            )}
            <p>
              {overdue
                ? `A restore test is due (every ${RESTORE_TEST_INTERVAL_DAYS} days and after any change to the database or backup set-up). Follow docs/lims-validation/backup-restore-procedure.md.`
                : `Next restore test due within ${RESTORE_TEST_INTERVAL_DAYS - (age ?? 0)} days.`}
            </p>
          </div>
        </div>
      ) : null}

      {form ? (
        <RegisterPanel
          title="Record a restore test"
          right={
            <Button variant="outline" className={cn(limsDarkBarBtnClass, 'h-7')} onClick={() => setForm(null)}>
              <X className="h-4 w-4" /> Close
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tested on *" htmlFor="br-on">
              <Input id="br-on" type="date" value={form.testedOn} max={localDateKey(new Date())}
                onChange={(e) => setForm({ ...form, testedOn: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Backup type *" htmlFor="br-kind">
              <NativeSelect id="br-kind" value={form.backupKind} onChange={(v) => setForm({ ...form, backupKind: v as BackupKind })}>
                {(Object.keys(BACKUP_KIND_LABEL) as BackupKind[]).map((k) => (
                  <option key={k} value={k}>
                    {BACKUP_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Backup id" htmlFor="br-id">
              <Input id="br-id" value={form.backupId} onChange={(e) => setForm({ ...form, backupId: e.target.value })} className={cn(inputClass, 'font-mono')} />
            </Field>
            <Field label="Backup name / label" htmlFor="br-name">
              <Input id="br-name" value={form.backupName} placeholder="As shown in Railway → Backups"
                onChange={(e) => setForm({ ...form, backupName: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Backup taken at" htmlFor="br-taken">
              <Input id="br-taken" type="datetime-local" value={form.backupTakenAt}
                onChange={(e) => setForm({ ...form, backupTakenAt: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Restored to *" htmlFor="br-to" className="sm:col-span-2">
              <Input id="br-to" value={form.restoredTo} placeholder="e.g. new Railway service postgres-restore-test (project QIRLPL)"
                onChange={(e) => setForm({ ...form, restoredTo: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Time to restore (minutes)" htmlFor="br-min">
              <Input id="br-min" inputMode="numeric" value={form.restoreMinutes}
                onChange={(e) => setForm({ ...form, restoreMinutes: e.target.value })} className={inputClass} />
            </Field>
          </div>

          <div className="mt-3 border border-stone-300 bg-white p-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Checks on the restored copy</p>
            <ul className="space-y-1.5">
              {form.checks.map((c, idx) => (
                <li key={`${c.check}-${idx}`} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-center">
                  <label className="flex min-h-10 items-center gap-2 text-[13px] sm:min-h-0">
                    <input type="checkbox" className="h-5 w-5 shrink-0" checked={c.ok} onChange={(e) => setCheck(idx, { ok: e.target.checked })} />
                    {c.check}
                  </label>
                  <Input aria-label={`Note for ${c.check}`} value={c.note ?? ''} placeholder="Note / figures"
                    onChange={(e) => setCheck(idx, { note: e.target.value })} className={inputClass} />
                  <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-8')} aria-label={`Remove ${c.check}`}
                    onClick={() => setForm({ ...form, checks: form.checks.filter((_, i) => i !== idx) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1">
              <Input aria-label="Add a check" value={form.extraCheck} placeholder="Add another check"
                onChange={(e) => setForm({ ...form, extraCheck: e.target.value })} className={inputClass} />
              <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-8')} disabled={!form.extraCheck.trim()}
                onClick={() => setForm({ ...form, checks: [...form.checks, { check: form.extraCheck.trim(), ok: false, note: '' }], extraCheck: '' })}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Result *" htmlFor="br-res">
              <NativeSelect id="br-res" value={form.result} onChange={(v) => setForm({ ...form, result: v as RunResult })}>
                {(Object.keys(RESULT_LABEL) as RunResult[]).map((k) => (
                  <option key={k} value={k}>
                    {RESULT_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Performed by *" htmlFor="br-by">
              <Input id="br-by" value={form.performedBy} onChange={(e) => setForm({ ...form, performedBy: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Witnessed by" htmlFor="br-wit">
              <Input id="br-wit" value={form.witnessedBy} onChange={(e) => setForm({ ...form, witnessedBy: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Related IT incident" htmlFor="br-inc">
              <NativeSelect id="br-inc" value={form.linkedIncidentId} onChange={(v) => setForm({ ...form, linkedIncidentId: v })}>
                <option value="">— None —</option>
                {incidents.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.incident_no} · {i.description.slice(0, 50)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={form.result === 'pass' ? 'Remarks' : 'Remarks *'} htmlFor="br-rem" className="sm:col-span-2 lg:col-span-4">
              <Input id="br-rem" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={inputClass} />
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
        <RegisterPanel title={`Restore tests (${rows.length})`}>
          <div className="space-y-1.5 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-semibold text-amber-800">{r.test_no}</span>
                  <Chip tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Chip>
                  <span>{formatDate(r.tested_on)}</span>
                </div>
                <KeyValue label="Backup" value={`${BACKUP_KIND_LABEL[r.backup_kind]} · ${r.backup_name || r.backup_id}`} />
                {r.backup_taken_at ? <KeyValue label="Taken" value={formatDateTime(r.backup_taken_at)} /> : null}
                <KeyValue label="Restored to" value={r.restored_to} />
                <KeyValue label="Checks" value={checksOk(r.checks_done)} />
                <KeyValue label="By" value={[r.performed_by, r.witnessed_by && `witness ${r.witnessed_by}`].filter(Boolean).join(' · ')} />
                <div className="mt-1 flex justify-end gap-1">
                  <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10')} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    Checks
                  </Button>
                  {isDirector ? (
                    <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10')} onClick={() => void remove(r)} aria-label={`Delete ${r.test_no}`}>
                      <Trash2 className="h-4 w-4 text-red-700" />
                    </Button>
                  ) : null}
                </div>
                {expanded === r.id ? checksBlock(r) : null}
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={thClass}>No.</th>
                  <th className={thClass}>Tested on</th>
                  <th className={thClass}>Backup</th>
                  <th className={thClass}>Restored to</th>
                  <th className={thClass}>Checks</th>
                  <th className={thClass}>Minutes</th>
                  <th className={thClass}>Result</th>
                  <th className={thClass}>By</th>
                  <th className={thClass}> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                    <td className={cn(tdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>{r.test_no}</td>
                    <td className={cn(tdClass, 'whitespace-nowrap')}>{formatDate(r.tested_on)}</td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>
                      {BACKUP_KIND_LABEL[r.backup_kind]}
                      <div className="font-mono text-stone-600">{r.backup_name || r.backup_id}</div>
                      {r.backup_taken_at ? <div className="text-stone-600">Taken {formatDateTime(r.backup_taken_at)}</div> : null}
                    </td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>{r.restored_to}</td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>
                      <button type="button" className="text-amber-800 underline-offset-2 hover:underline" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                        {checksOk(r.checks_done)}
                      </button>
                      {expanded === r.id ? checksBlock(r) : null}
                    </td>
                    <td className={cn(tdClass, 'text-center')}>{r.restore_minutes ?? '—'}</td>
                    <td className={cn(tdClass, 'text-center')}>
                      <Chip tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Chip>
                    </td>
                    <td className={cn(tdClass, 'text-[11.5px]')}>
                      {r.performed_by}
                      {r.witnessed_by ? <div className="text-stone-600">Witness: {r.witnessed_by}</div> : null}
                    </td>
                    <td className={cn(tdClass, 'text-center')}>
                      {isDirector ? (
                        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} onClick={() => void remove(r)} aria-label={`Delete ${r.test_no}`}>
                          <Trash2 className="h-4 w-4 text-red-700" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No restore tests recorded yet.</p> : null}
        </RegisterPanel>
      ) : null}
    </div>
  )
}
