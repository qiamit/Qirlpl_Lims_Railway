import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarBtnClass, limsDialogClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
import { EnvHeader, EnvPanel, EnvSelect, Field, MessageLine, envInputClass, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { SupplierMissingNotice, SupplierNav } from '../SupplierUi'
import {
  SUBCONTRACTING_PATH,
  canManageSuppliers,
  downloadCsv,
  isSupplierMissingError,
  supplierErrorText,
  todayIso,
  type ClientOption,
  type SubcontractEntry,
} from '../supplierShared'

type Stage = 'consent_pending' | 'ready' | 'sent' | 'report_received'

const STAGE_LABEL: Record<Stage, string> = {
  consent_pending: 'Consent pending',
  ready: 'Ready to send',
  sent: 'Sent',
  report_received: 'Report received',
}

const STAGE_TONE: Record<Stage, string> = {
  consent_pending: 'border-red-700/60 bg-red-100 text-red-900',
  ready: 'border-amber-600/60 bg-amber-100 text-amber-900',
  sent: 'border-sky-700/50 bg-sky-100 text-sky-900',
  report_received: 'border-emerald-700/50 bg-emerald-100 text-emerald-900',
}

function stageOf(r: Pick<SubcontractEntry, 'customer_consent' | 'sent_on' | 'report_received_on'>): Stage {
  if (r.report_received_on) return 'report_received'
  if (r.sent_on) return 'sent'
  return r.customer_consent ? 'ready' : 'consent_pending'
}

function StageBadge({ stage }: { stage: Stage }) {
  return <span className={cn('whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold', STAGE_TONE[stage])}>{STAGE_LABEL[stage]}</span>
}

type FlaggedSrf = {
  id: string
  srf_number: string
  srf_date: string | null
  client_id: string | null
  client_name: string | null
  equipment_description: string | null
  external_provider_customer_approved: boolean | null
  external_provider_details: string | null
}

type SubForm = {
  workDescription: string
  ref: string
  customerId: string
  labId: string
  consent: boolean
  consentRef: string
  consentOn: string
  sentOn: string
  reportReceivedOn: string
  reportRef: string
  remarks: string
}

const EMPTY_FORM: SubForm = {
  workDescription: '',
  ref: '',
  customerId: '',
  labId: '',
  consent: false,
  consentRef: '',
  consentOn: '',
  sentOn: '',
  reportReceivedOn: '',
  reportRef: '',
  remarks: '',
}

const LAB_CATEGORIES = ['subcontract_lab', 'calibration_lab']

export default function SubcontractingRegisterPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const isDirector = isLaboratoryDirector(designation)
  const canManage = canManageSuppliers(designation, departmentName, isDirector)

  const [rows, setRows] = useState<SubcontractEntry[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [approvedLabIds, setApprovedLabIds] = useState<Set<string>>(new Set())
  const [srfs, setSrfs] = useState<FlaggedSrf[]>([])
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<'' | Stage>('')
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SubcontractEntry | null>(null)
  const [form, setForm] = useState<SubForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, aRes, cRes, sRes] = await Promise.all([
        supabase.from('subcontracting_register').select('*').order('created_at', { ascending: false }).limit(5000),
        supabase.from('supplier_approvals').select('client_id, category').eq('approved', true).limit(5000),
        supabase.from('clients').select('id, company_name, company_type').order('company_name').limit(5000),
        supabase
          .from('calibration_service_requests')
          .select('id, srf_number, srf_date, client_id, client_name, equipment_description, external_provider_customer_approved, external_provider_details')
          .eq('external_provider_used', true)
          .order('srf_date', { ascending: false })
          .limit(500),
      ])
      if (rRes.error) {
        if (isSupplierMissingError(rRes.error)) {
          setMissing(true)
          return
        }
        throw rRes.error
      }
      setMissing(false)
      setRows((rRes.data ?? []) as SubcontractEntry[])
      const approvals = aRes.error ? [] : ((aRes.data ?? []) as { client_id: string; category: string }[])
      setApprovedLabIds(new Set(approvals.filter((a) => LAB_CATEGORIES.includes(a.category)).map((a) => a.client_id)))
      setClients(cRes.error ? [] : ((cRes.data ?? []) as ClientOption[]))
      // SRF list is a convenience only; ignore when the SRF table is absent.
      setSrfs(sRes.error ? [] : ((sRes.data ?? []) as FlaggedSrf[]))
    } catch (err) {
      setError(supplierErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const clientName = useCallback(
    (id: string | null) => (id ? clients.find((c) => c.id === id)?.company_name ?? 'Unknown / deleted client' : '—'),
    [clients],
  )

  const labOptions = useMemo(() => {
    const isLab = (c: ClientOption) => approvedLabIds.has(c.id) || /laborator/i.test(c.company_type ?? '')
    return [...clients.filter(isLab), ...clients.filter((c) => !isLab(c))]
  }, [clients, approvedLabIds])

  const pendingSrfs = useMemo(() => {
    const refs = new Set(rows.map((r) => (r.sample_or_srf_ref ?? '').trim().toLowerCase()).filter(Boolean))
    return srfs.filter((s) => !refs.has(s.srf_number.trim().toLowerCase()))
  }, [srfs, rows])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows
      .filter((r) => !stageFilter || stageOf(r) === stageFilter)
      .filter((r) => {
        if (!needle) return true
        return [r.work_description, r.sample_or_srf_ref, clientName(r.subcontract_lab_id), clientName(r.customer_id), r.consent_ref, r.remarks]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
  }, [rows, stageFilter, search, clientName])

  const openNew = (srf?: FlaggedSrf) => {
    setEditing(null)
    setForm(
      srf
        ? {
            ...EMPTY_FORM,
            workDescription: [srf.equipment_description, srf.external_provider_details].filter(Boolean).join(' — '),
            ref: srf.srf_number,
            customerId: srf.client_id ?? '',
            consent: srf.external_provider_customer_approved === true,
            consentRef: srf.external_provider_customer_approved ? `SRF ${srf.srf_number} review` : '',
            consentOn: srf.external_provider_customer_approved ? (srf.srf_date ?? '') : '',
          }
        : EMPTY_FORM,
    )
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (r: SubcontractEntry) => {
    setEditing(r)
    setForm({
      workDescription: r.work_description,
      ref: r.sample_or_srf_ref ?? '',
      customerId: r.customer_id ?? '',
      labId: r.subcontract_lab_id,
      consent: r.customer_consent,
      consentRef: r.consent_ref ?? '',
      consentOn: r.consent_on ?? '',
      sentOn: r.sent_on ?? '',
      reportReceivedOn: r.report_received_on ?? '',
      reportRef: r.report_ref ?? '',
      remarks: r.remarks ?? '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const consentComplete = form.consent && Boolean(form.consentOn)

  const save = async () => {
    if (!form.workDescription.trim()) {
      setFormError('Describe the work being subcontracted.')
      return
    }
    if (!form.labId) {
      setFormError('Choose the subcontract laboratory.')
      return
    }
    if (form.consent && !form.consentOn) {
      setFormError('Enter the date the customer gave consent.')
      return
    }
    if (form.sentOn && !consentComplete) {
      setFormError('Customer consent (with its date) is required before the work is sent (ISO/IEC 17025 7.1.1 e).')
      return
    }
    if (form.sentOn && form.consentOn && form.sentOn < form.consentOn) {
      setFormError('The sent date cannot be before the consent date.')
      return
    }
    if (form.reportReceivedOn && (!form.sentOn || form.reportReceivedOn < form.sentOn)) {
      setFormError('The report date must be on or after the sent date.')
      return
    }
    const payload = {
      work_description: form.workDescription.trim(),
      sample_or_srf_ref: form.ref.trim() || null,
      customer_id: form.customerId || null,
      subcontract_lab_id: form.labId,
      customer_consent: form.consent,
      consent_ref: form.consent ? form.consentRef.trim() || null : null,
      consent_on: form.consent ? form.consentOn || null : null,
      sent_on: form.sentOn || null,
      report_received_on: form.reportReceivedOn || null,
      report_ref: form.reportRef.trim() || null,
      remarks: form.remarks.trim() || null,
    }
    let reason: string | null = null
    if (editing) {
      reason = await askReason({
        title: 'Reason for changing a subcontracting entry',
        recordLabel: `${editing.sample_or_srf_ref ?? ''} ${editing.work_description}`.trim(),
        quickPicks: ['Consent received', 'Sent to laboratory', 'Report received', 'Correction of entry'],
      })
      if (!reason) return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        const { data, error: err } = await supabase.from('subcontracting_register').update(payload).eq('id', editing.id).select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director, Quality Manager or Technical Manager only).')
        if (reason) await recordReason('subcontracting_register', editing.id, reason)
      } else {
        const { error: err } = await supabase.from('subcontracting_register').insert(payload)
        if (err) throw err
      }
      setFormOpen(false)
      setMessage(editing ? 'Subcontracting entry updated.' : 'Subcontracting entry added.')
      await load()
    } catch (err) {
      setFormError(supplierErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: SubcontractEntry) => {
    const reason = await askReason({
      title: 'Reason for deleting a subcontracting entry',
      recordLabel: `${r.sample_or_srf_ref ?? ''} ${r.work_description}`.trim(),
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error', 'Work not subcontracted'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('subcontracting_register').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? supplierErrorText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('subcontracting_register', r.id, reason)
    await load()
  }

  const exportCsv = () => {
    downloadCsv(
      `subcontracting-register-${todayIso()}.csv`,
      ['Work', 'Sample / SRF', 'Customer', 'Subcontract lab', 'Lab approved when sent', 'Customer consent', 'Consent ref.', 'Consent on', 'Sent on', 'Report received', 'Report ref.', 'Status', 'Remarks'],
      shown.map((r) => [
        r.work_description,
        r.sample_or_srf_ref ?? '',
        r.customer_id ? clientName(r.customer_id) : '',
        clientName(r.subcontract_lab_id),
        r.lab_approved_at_send === null ? '' : r.lab_approved_at_send ? 'Yes' : 'No',
        r.customer_consent ? 'Yes' : 'No',
        r.consent_ref ?? '',
        r.consent_on ?? '',
        r.sent_on ?? '',
        r.report_received_on ?? '',
        r.report_ref ?? '',
        STAGE_LABEL[stageOf(r)],
        r.remarks ?? '',
      ]),
    )
  }

  const labCell = (r: SubcontractEntry) => (
    <>
      {clientName(r.subcontract_lab_id)}
      {r.lab_approved_at_send === false || (!r.sent_on && !approvedLabIds.has(r.subcontract_lab_id)) ? (
        <span className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap border border-amber-600/60 bg-amber-100 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-900">
          <AlertTriangle className="h-3 w-3" /> Not approved
        </span>
      ) : null}
    </>
  )

  const rowActions = (r: SubcontractEntry, big = false) => (
    <span className="inline-flex gap-1">
      {canManage ? (
        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, big ? 'h-10 w-10' : 'h-7 w-7')} onClick={() => openEdit(r)} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      {isDirector ? (
        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, big ? 'h-10 w-10' : 'h-7 w-7')} onClick={() => void remove(r)} aria-label="Delete">
          <Trash2 className="h-4 w-4 text-red-700" />
        </Button>
      ) : null}
    </span>
  )

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Subcontracting Register"
        clause="6.6 / 7.1.1 e"
        subtitle="Work sent to external laboratories. Customer consent is required before the work is sent."
        actions={
          <>
            {canManage && !missing ? (
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => openNew()}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add entry</span>
              </Button>
            ) : null}
            {!missing ? (
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={exportCsv} disabled={shown.length === 0}>
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
              </Button>
            ) : null}
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />
      <SupplierNav current={SUBCONTRACTING_PATH} />
      {missing ? <SupplierMissingNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <>
          {pendingSrfs.length > 0 ? (
            <EnvPanel title={`Calibration SRFs using an external provider, not in the register (${pendingSrfs.length})`}>
              <ul className="space-y-1">
                {pendingSrfs.slice(0, 20).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-amber-50 px-2 py-1.5 text-[13px]">
                    <span>
                      <span className="font-mono font-semibold">{s.srf_number}</span> · {formatDate(s.srf_date)} · {s.client_name ?? clientName(s.client_id)}
                      <span className="block text-[12px] text-stone-600">
                        {s.external_provider_details || s.equipment_description || '—'} · Customer approval in SRF:{' '}
                        <strong>{s.external_provider_customer_approved ? 'Yes' : 'No'}</strong>
                      </span>
                    </span>
                    {canManage ? (
                      <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-7')} onClick={() => openNew(s)}>
                        <Plus className="h-3.5 w-3.5" /> Add to register
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </EnvPanel>
          ) : null}

          <EnvPanel title="Filter">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Status" htmlFor="sc-stage">
                <EnvSelect id="sc-stage" value={stageFilter} onChange={(v) => setStageFilter(v as '' | Stage)}>
                  <option value="">All</option>
                  {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Search" htmlFor="sc-search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
                  <Input id="sc-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Work, SRF, laboratory, customer" className={cn(envInputClass, 'pl-8')} />
                </div>
              </Field>
            </div>
          </EnvPanel>

          <EnvPanel title={`Register (${shown.length})`}>
            <div className="space-y-1.5 md:hidden">
              {shown.map((r) => (
                <div key={r.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">{r.work_description}</p>
                    <StageBadge stage={stageOf(r)} />
                  </div>
                  <p className="text-[12px] text-stone-600">
                    {r.sample_or_srf_ref ? `${r.sample_or_srf_ref} · ` : ''}
                    {labCell(r)}
                  </p>
                  <p className="text-[12px]">
                    Consent: {r.customer_consent ? `${formatDate(r.consent_on)}${r.consent_ref ? ` (${r.consent_ref})` : ''}` : 'No'}
                    {r.sent_on ? ` · Sent ${formatDate(r.sent_on)}` : ''}
                    {r.report_received_on ? ` · Report ${formatDate(r.report_received_on)}` : ''}
                  </p>
                  <div className="mt-1 flex justify-end">{rowActions(r, true)}</div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={cn(envThClass, 'text-left')}>Work</th>
                    <th className={envThClass}>Sample / SRF</th>
                    <th className={envThClass}>Customer</th>
                    <th className={envThClass}>Subcontract lab</th>
                    <th className={envThClass}>Consent</th>
                    <th className={envThClass}>Sent</th>
                    <th className={envThClass}>Report</th>
                    <th className={envThClass}>Status</th>
                    {canManage ? <th className={envThClass}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={envTdClass}>
                        <span className="font-semibold">{r.work_description}</span>
                        {r.remarks ? <span className="block text-[11px] text-stone-600">{r.remarks}</span> : null}
                      </td>
                      <td className={cn(envTdClass, 'font-mono text-[12px]')}>{r.sample_or_srf_ref || '—'}</td>
                      <td className={envTdClass}>{clientName(r.customer_id)}</td>
                      <td className={envTdClass}>{labCell(r)}</td>
                      <td className={cn(envTdClass, 'text-[12px]')}>
                        {r.customer_consent ? (
                          <>
                            {formatDate(r.consent_on)}
                            {r.consent_ref ? <span className="block text-[11px] text-stone-600">{r.consent_ref}</span> : null}
                          </>
                        ) : (
                          <span className="font-semibold text-red-800">Not yet</span>
                        )}
                      </td>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>{r.sent_on ? formatDate(r.sent_on) : '—'}</td>
                      <td className={cn(envTdClass, 'text-[12px]')}>
                        {r.report_received_on ? formatDate(r.report_received_on) : '—'}
                        {r.report_ref ? <span className="block text-[11px] text-stone-600">{r.report_ref}</span> : null}
                      </td>
                      <td className={cn(envTdClass, 'text-center')}>
                        <StageBadge stage={stageOf(r)} />
                      </td>
                      {canManage ? <td className={cn(envTdClass, 'whitespace-nowrap text-center')}>{rowActions(r)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && shown.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No subcontracted work recorded.</p> : null}
          </EnvPanel>
        </>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => (!open && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-2xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">{editing ? 'Edit subcontracting entry' : 'Add subcontracting entry'}</DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                Inform the customer in writing and get their approval before sending work to another laboratory.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[78vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Work subcontracted *" htmlFor="sf-work" className="sm:col-span-2">
                <Input id="sf-work" value={form.workDescription} onChange={(e) => setForm({ ...form, workDescription: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Sample / SRF ref." htmlFor="sf-ref">
                <Input id="sf-ref" list="sf-srf-list" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} className={envInputClass} />
                <datalist id="sf-srf-list">
                  {srfs.map((s) => (
                    <option key={s.id} value={s.srf_number} />
                  ))}
                </datalist>
              </Field>
              <Field label="Customer" htmlFor="sf-cust">
                <EnvSelect id="sf-cust" value={form.customerId} onChange={(v) => setForm({ ...form, customerId: v })}>
                  <option value="">— Not linked —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Subcontract laboratory *" htmlFor="sf-lab" className="sm:col-span-2">
                <EnvSelect id="sf-lab" value={form.labId} onChange={(v) => setForm({ ...form, labId: v })}>
                  <option value="">— Choose laboratory —</option>
                  {labOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {approvedLabIds.has(c.id) ? '✓ ' : ''}
                      {c.company_name}
                      {c.company_type ? ` (${c.company_type})` : ''}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
            </div>
            {form.labId && !approvedLabIds.has(form.labId) ? (
              <MessageLine tone="error" text="This laboratory is not on the approved supplier list as a subcontract or calibration laboratory." />
            ) : null}

            <div className="border border-stone-400 bg-white p-2">
              <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked, ...(e.target.checked ? {} : { sentOn: '', reportReceivedOn: '' }) })}
                />
                Customer has consented to subcontracting
              </label>
              {form.consent ? (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Consent date *" htmlFor="sf-con-on">
                    <Input id="sf-con-on" type="date" value={form.consentOn} onChange={(e) => setForm({ ...form, consentOn: e.target.value })} className={envInputClass} />
                  </Field>
                  <Field label="Consent reference (email, letter, SRF)" htmlFor="sf-con-ref">
                    <Input id="sf-con-ref" value={form.consentRef} onChange={(e) => setForm({ ...form, consentRef: e.target.value })} className={envInputClass} />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Sent on" htmlFor="sf-sent">
                <Input
                  id="sf-sent"
                  type="date"
                  min={form.consentOn || undefined}
                  disabled={!consentComplete}
                  value={form.sentOn}
                  onChange={(e) => setForm({ ...form, sentOn: e.target.value })}
                  className={envInputClass}
                />
                {!consentComplete ? <p className="text-[11px] text-red-800">Record customer consent first.</p> : null}
              </Field>
              <Field label="Report received on" htmlFor="sf-rep">
                <Input
                  id="sf-rep"
                  type="date"
                  min={form.sentOn || undefined}
                  disabled={!form.sentOn}
                  value={form.reportReceivedOn}
                  onChange={(e) => setForm({ ...form, reportReceivedOn: e.target.value })}
                  className={envInputClass}
                />
              </Field>
              <Field label="Report ref." htmlFor="sf-rep-ref">
                <Input id="sf-rep-ref" value={form.reportRef} onChange={(e) => setForm({ ...form, reportRef: e.target.value })} className={envInputClass} />
              </Field>
            </div>
            <Field label="Remarks" htmlFor="sf-rem">
              <Textarea id="sf-rem" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="rounded-none border-stone-500 bg-white text-base sm:text-sm" />
            </Field>
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
