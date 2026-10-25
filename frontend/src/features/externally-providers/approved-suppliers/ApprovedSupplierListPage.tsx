import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Download, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
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
import { DueBadge, SupplierMissingNotice, SupplierNav, SupplierStatusBadge } from '../SupplierUi'
import {
  ACCREDITED_CATEGORIES,
  APPROVED_SUPPLIERS_PATH,
  SUPPLIER_CATEGORIES,
  SUPPLIER_CATEGORY_LABEL,
  SUPPLIER_EVALUATIONS_PATH,
  SUPPLIER_STATUSES,
  SUPPLIER_STATUS_LABEL,
  canManageSuppliers,
  dueState,
  downloadCsv,
  isSupplierMissingError,
  supplierErrorText,
  todayIso,
  type ClientOption,
  type SupplierApproval,
  type SupplierCategory,
  type SupplierStatus,
} from '../supplierShared'

type ApprovalForm = {
  clientId: string
  category: SupplierCategory
  scope: string
  accreditationBody: string
  accreditationNo: string
  accreditationValidUntil: string
  status: SupplierStatus
  approvedBy: string
  approvedOn: string
  intervalMonths: string
  nextDue: string
  remarks: string
}

const EMPTY_FORM: ApprovalForm = {
  clientId: '',
  category: 'consumables',
  scope: '',
  accreditationBody: '',
  accreditationNo: '',
  accreditationValidUntil: '',
  status: 'approved',
  approvedBy: '',
  approvedOn: '',
  intervalMonths: '12',
  nextDue: '',
  remarks: '',
}

const SUPPLIER_TYPES = ['supplier', 'service provider', 'pt provider', 'calibration laboratory']

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, d))
  return dt.toISOString().slice(0, 10)
}

export default function ApprovedSupplierListPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const isDirector = isLaboratoryDirector(designation)
  const canManage = canManageSuppliers(designation, departmentName, isDirector)

  const [rows, setRows] = useState<SupplierApproval[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [categoryFilter, setCategoryFilter] = useState<'' | SupplierCategory>('')
  const [statusFilter, setStatusFilter] = useState<'' | SupplierStatus | 'current'>('current')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierApproval | null>(null)
  const [form, setForm] = useState<ApprovalForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [aRes, cRes] = await Promise.all([
        supabase.from('supplier_approvals').select('*').order('created_at', { ascending: false }).limit(5000),
        supabase.from('clients').select('id, company_name, company_type').order('company_name').limit(5000),
      ])
      if (aRes.error) {
        if (isSupplierMissingError(aRes.error)) {
          setMissing(true)
          return
        }
        throw aRes.error
      }
      setMissing(false)
      setRows((aRes.data ?? []) as SupplierApproval[])
      setClients(cRes.error ? [] : ((cRes.data ?? []) as ClientOption[]))
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
    (id: string) => clients.find((c) => c.id === id)?.company_name ?? 'Unknown / deleted client',
    [clients],
  )

  const sortedClients = useMemo(() => {
    const isSup = (c: ClientOption) => SUPPLIER_TYPES.includes((c.company_type ?? '').trim().toLowerCase())
    return [...clients.filter(isSup), ...clients.filter((c) => !isSup(c))]
  }, [clients])

  const accreditationIssue = (r: SupplierApproval) => {
    if (!ACCREDITED_CATEGORIES.has(r.category)) return null
    if (!r.accreditation_no?.trim()) return 'missing'
    const s = dueState(r.accreditation_valid_until, 60)
    return s === 'overdue' ? 'expired' : s === 'soon' ? 'soon' : null
  }

  const needsAttention = useCallback(
    (r: SupplierApproval) => {
      if (!r.approved) return false
      const ev = dueState(r.next_evaluation_due, 30)
      if (ev === 'overdue' || ev === 'soon' || !r.next_evaluation_due) return true
      if (ACCREDITED_CATEGORIES.has(r.category)) {
        if (!r.accreditation_no?.trim()) return true
        const ac = dueState(r.accreditation_valid_until, 60)
        if (ac === 'overdue' || ac === 'soon') return true
      }
      return false
    },
    [],
  )

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows
      .filter((r) => !categoryFilter || r.category === categoryFilter)
      .filter((r) => (statusFilter === 'current' ? r.approved : !statusFilter || r.status === statusFilter))
      .filter((r) => !attentionOnly || needsAttention(r))
      .filter((r) => {
        if (!needle) return true
        return [clientName(r.client_id), r.scope, r.accreditation_body, r.accreditation_no, r.remarks]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => clientName(a.client_id).localeCompare(clientName(b.client_id)) || a.category.localeCompare(b.category))
  }, [rows, categoryFilter, statusFilter, attentionOnly, search, clientName, needsAttention])

  const stats = useMemo(
    () => ({
      approved: rows.filter((r) => r.status === 'approved').length,
      conditional: rows.filter((r) => r.status === 'conditional').length,
      suspended: rows.filter((r) => r.status === 'suspended').length,
      evalOverdue: rows.filter((r) => r.approved && dueState(r.next_evaluation_due) === 'overdue').length,
      accExpired: rows.filter((r) => r.approved && ACCREDITED_CATEGORIES.has(r.category) && dueState(r.accreditation_valid_until) === 'overdue').length,
    }),
    [rows],
  )

  const openNew = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, approvedOn: todayIso(), nextDue: addMonths(todayIso(), 12) })
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (r: SupplierApproval) => {
    setEditing(r)
    setForm({
      clientId: r.client_id,
      category: r.category,
      scope: r.scope ?? '',
      accreditationBody: r.accreditation_body ?? '',
      accreditationNo: r.accreditation_no ?? '',
      accreditationValidUntil: r.accreditation_valid_until ?? '',
      status: r.status,
      approvedBy: r.approved_by ?? '',
      approvedOn: r.approved_on ?? '',
      intervalMonths: String(r.evaluation_interval_months ?? 12),
      nextDue: r.next_evaluation_due ?? '',
      remarks: r.remarks ?? '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.clientId) {
      setFormError('Choose the supplier (from the Clients master).')
      return
    }
    const interval = Number(form.intervalMonths)
    if (!Number.isInteger(interval) || interval < 1 || interval > 60) {
      setFormError('Re-evaluation interval must be 1 to 60 months.')
      return
    }
    const payload = {
      client_id: form.clientId,
      category: form.category,
      scope: form.scope.trim() || null,
      accreditation_body: form.accreditationBody.trim() || null,
      accreditation_no: form.accreditationNo.trim() || null,
      accreditation_valid_until: form.accreditationValidUntil || null,
      status: form.status,
      approved_by: form.approvedBy.trim() || null,
      approved_on: form.approvedOn || null,
      evaluation_interval_months: interval,
      next_evaluation_due: form.nextDue || null,
      remarks: form.remarks.trim() || null,
    }
    let reason: string | null = null
    if (editing) {
      reason = await askReason({
        title: 'Reason for changing an approved supplier',
        recordLabel: `${clientName(editing.client_id)} · ${SUPPLIER_CATEGORY_LABEL[editing.category]}`,
        quickPicks: ['Re-evaluation outcome', 'Accreditation renewed', 'Scope changed', 'Correction of entry'],
      })
      if (!reason) return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        const { data, error: err } = await supabase.from('supplier_approvals').update(payload).eq('id', editing.id).select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director, Quality Manager or Technical Manager only).')
        if (reason) await recordReason('supplier_approvals', editing.id, reason)
      } else {
        const { error: err } = await supabase.from('supplier_approvals').insert(payload)
        if (err) {
          if (err.code === '23505') throw new Error('This supplier already has an entry for this category. Edit that entry instead.')
          throw err
        }
      }
      setFormOpen(false)
      setMessage(editing ? 'Supplier entry updated.' : 'Supplier added to the list.')
      await load()
    } catch (err) {
      setFormError(supplierErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: SupplierApproval) => {
    const reason = await askReason({
      title: 'Reason for deleting a supplier entry',
      recordLabel: `${clientName(r.client_id)} · ${SUPPLIER_CATEGORY_LABEL[r.category]}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('supplier_approvals').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(
        err
          ? err.code === '23503'
            ? 'This supplier has evaluations on record. Set the status to Suspended or Not approved instead.'
            : supplierErrorText(err)
          : 'Not deleted (Laboratory Director only).',
      )
      return
    }
    await recordReason('supplier_approvals', r.id, reason)
    await load()
  }

  const exportCsv = () => {
    downloadCsv(
      `approved-suppliers-${todayIso()}.csv`,
      [
        'Supplier',
        'Category',
        'Scope',
        'Accreditation body',
        'Accreditation no.',
        'Accreditation valid until',
        'Status',
        'Approved on',
        'Approved by',
        'Last evaluated',
        'Last score %',
        'Next evaluation due',
        'Remarks',
      ],
      filtered.map((r) => [
        clientName(r.client_id),
        SUPPLIER_CATEGORY_LABEL[r.category],
        r.scope ?? '',
        r.accreditation_body ?? '',
        r.accreditation_no ?? '',
        r.accreditation_valid_until ?? '',
        SUPPLIER_STATUS_LABEL[r.status],
        r.approved_on ?? '',
        r.approved_by ?? '',
        r.last_evaluated_on ?? '',
        r.last_score ?? '',
        r.next_evaluation_due ?? '',
        r.remarks ?? '',
      ]),
    )
  }

  const accCell = (r: SupplierApproval) => {
    const issue = accreditationIssue(r)
    return (
      <div className="space-y-0.5">
        {r.accreditation_body || r.accreditation_no ? (
          <p className="text-[12px]">
            {r.accreditation_body ?? ''} {r.accreditation_no ?? ''}
          </p>
        ) : null}
        {r.accreditation_valid_until ? <DueBadge date={r.accreditation_valid_until} label="Accreditation" soonDays={60} overdueText="Accreditation expired" /> : null}
        {issue === 'missing' ? (
          <span className="inline-block border border-red-700/60 bg-red-100 px-1 py-0.5 text-[10px] font-bold uppercase text-red-800">
            Accreditation missing
          </span>
        ) : null}
        {!r.accreditation_body && !r.accreditation_no && !r.accreditation_valid_until && !issue ? <span className="text-stone-500">—</span> : null}
      </div>
    )
  }

  const actions = (r: SupplierApproval, big = false) => (
    <span className="inline-flex gap-1">
      <Button asChild size="icon" variant="outline" className={cn(limsOutlineBtnClass, big ? 'h-10 w-10' : 'h-7 w-7')} aria-label="Evaluate">
        <Link to={`${SUPPLIER_EVALUATIONS_PATH}?approval=${r.id}`} title="Evaluate">
          <ClipboardCheck className="h-4 w-4" />
        </Link>
      </Button>
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
        title="Approved Supplier List"
        clause="6.6.2"
        subtitle="Externally provided products and services: approval, scope, accreditation and re-evaluation."
        actions={
          <>
            {canManage && !missing ? (
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={openNew}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add supplier</span>
              </Button>
            ) : null}
            {!missing ? (
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={exportCsv} disabled={filtered.length === 0}>
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
      <SupplierNav current={APPROVED_SUPPLIERS_PATH} />
      {missing ? <SupplierMissingNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <>
          <EnvPanel
            title="Filter"
            right={
              <span className="text-[11px] text-stone-200">
                {stats.approved} approved · {stats.conditional} conditional · {stats.suspended} suspended
                {stats.evalOverdue ? ` · ${stats.evalOverdue} evaluation overdue` : ''}
                {stats.accExpired ? ` · ${stats.accExpired} accreditation expired` : ''}
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Category" htmlFor="as-cat">
                <EnvSelect id="as-cat" value={categoryFilter} onChange={(v) => setCategoryFilter(v as '' | SupplierCategory)}>
                  <option value="">All categories</option>
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {SUPPLIER_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Status" htmlFor="as-status">
                <EnvSelect id="as-status" value={statusFilter} onChange={(v) => setStatusFilter(v as '' | SupplierStatus | 'current')}>
                  <option value="current">Approved + conditional</option>
                  <option value="">All statuses</option>
                  {SUPPLIER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {SUPPLIER_STATUS_LABEL[s]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Search" htmlFor="as-search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
                  <Input id="as-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Supplier, scope, accreditation" className={cn(envInputClass, 'pl-8')} />
                </div>
              </Field>
              <label className="flex min-h-10 items-end gap-2 pb-1.5 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
                Needs attention (evaluation or accreditation due)
              </label>
            </div>
          </EnvPanel>

          <EnvPanel title={`Suppliers (${filtered.length})`}>
            <div className="space-y-1.5 md:hidden">
              {filtered.map((r) => (
                <div key={r.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">{clientName(r.client_id)}</p>
                    <SupplierStatusBadge value={r.status} />
                  </div>
                  <p className="text-[12px] text-stone-600">
                    {SUPPLIER_CATEGORY_LABEL[r.category]}
                    {r.scope ? ` · ${r.scope}` : ''}
                  </p>
                  <div className="mt-1">{accCell(r)}</div>
                  <p className="mt-1 text-[12px]">
                    Next evaluation: <DueBadge date={r.next_evaluation_due} label="Evaluation" />
                  </p>
                  <div className="mt-1 flex justify-end">{actions(r, true)}</div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1080px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={cn(envThClass, 'text-left')}>Supplier</th>
                    <th className={envThClass}>Category</th>
                    <th className={envThClass}>Scope</th>
                    <th className={envThClass}>Accreditation</th>
                    <th className={envThClass}>Status</th>
                    <th className={envThClass}>Approved</th>
                    <th className={envThClass}>Last evaluation</th>
                    <th className={envThClass}>Next evaluation</th>
                    <th className={envThClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(envTdClass, 'font-semibold')}>{clientName(r.client_id)}</td>
                      <td className={envTdClass}>{SUPPLIER_CATEGORY_LABEL[r.category]}</td>
                      <td className={cn(envTdClass, 'text-[11.5px]')}>{r.scope || '—'}</td>
                      <td className={envTdClass}>{accCell(r)}</td>
                      <td className={cn(envTdClass, 'text-center')}>
                        <SupplierStatusBadge value={r.status} />
                      </td>
                      <td className={cn(envTdClass, 'text-[12px]')}>
                        {r.approved_on ? formatDate(r.approved_on) : '—'}
                        {r.approved_by ? <span className="block text-[11px] text-stone-600">{r.approved_by}</span> : null}
                      </td>
                      <td className={cn(envTdClass, 'text-[12px]')}>
                        {r.last_evaluated_on ? formatDate(r.last_evaluated_on) : 'Not evaluated'}
                        {r.last_score !== null ? <span className="block font-semibold">{r.last_score}%</span> : null}
                      </td>
                      <td className={envTdClass}>
                        {r.approved && !r.next_evaluation_due ? (
                          <span className="border border-amber-600/60 bg-amber-100 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-900">Not set</span>
                        ) : (
                          <DueBadge date={r.next_evaluation_due} label="Evaluation" />
                        )}
                      </td>
                      <td className={cn(envTdClass, 'whitespace-nowrap text-center')}>{actions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && filtered.length === 0 ? (
              <p className="p-4 text-center text-[13px] text-stone-600">
                {rows.length === 0 ? 'No suppliers on the list yet. Add suppliers from the Clients master.' : 'No suppliers match the filter.'}
              </p>
            ) : null}
          </EnvPanel>
        </>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => (!open && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-2xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">{editing ? 'Edit supplier entry' : 'Add supplier to the list'}</DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                One entry per supplier and category. Status follows the latest evaluation; you can override it here.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[75vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Supplier *" htmlFor="af-client" className="sm:col-span-2">
                <EnvSelect id="af-client" value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })}>
                  <option value="">— Choose from the Clients master —</option>
                  {sortedClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                      {c.company_type ? ` (${c.company_type})` : ''}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Category *" htmlFor="af-cat">
                <EnvSelect id="af-cat" value={form.category} onChange={(v) => setForm({ ...form, category: v as SupplierCategory })}>
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {SUPPLIER_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Status" htmlFor="af-status">
                <EnvSelect id="af-status" value={form.status} onChange={(v) => setForm({ ...form, status: v as SupplierStatus })}>
                  {SUPPLIER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {SUPPLIER_STATUS_LABEL[s]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Scope of supply" htmlFor="af-scope" className="sm:col-span-2">
                <Input id="af-scope" value={form.scope} placeholder="e.g. Pressure and temperature calibration up to 700 bar" onChange={(e) => setForm({ ...form, scope: e.target.value })} className={envInputClass} />
              </Field>
              <Field label={ACCREDITED_CATEGORIES.has(form.category) ? 'Accreditation body *' : 'Accreditation body'} htmlFor="af-ab">
                <Input id="af-ab" value={form.accreditationBody} placeholder="NABL, ISO 17034, ISO/IEC 17043…" onChange={(e) => setForm({ ...form, accreditationBody: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Accreditation / certificate no." htmlFor="af-an">
                <Input id="af-an" value={form.accreditationNo} onChange={(e) => setForm({ ...form, accreditationNo: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Accreditation valid until" htmlFor="af-av">
                <Input id="af-av" type="date" value={form.accreditationValidUntil} onChange={(e) => setForm({ ...form, accreditationValidUntil: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Approved on" htmlFor="af-aon">
                <Input id="af-aon" type="date" value={form.approvedOn} onChange={(e) => setForm({ ...form, approvedOn: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Approved by (blank = you)" htmlFor="af-aby">
                <Input id="af-aby" value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Re-evaluate every (months)" htmlFor="af-int">
                <Input id="af-int" type="number" min={1} max={60} value={form.intervalMonths} onChange={(e) => setForm({ ...form, intervalMonths: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Next evaluation due" htmlFor="af-due">
                <Input id="af-due" type="date" value={form.nextDue} onChange={(e) => setForm({ ...form, nextDue: e.target.value })} className={envInputClass} />
              </Field>
            </div>
            <Field label="Remarks" htmlFor="af-rem">
              <Textarea id="af-rem" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="rounded-none border-stone-500 bg-white text-base sm:text-sm" />
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
