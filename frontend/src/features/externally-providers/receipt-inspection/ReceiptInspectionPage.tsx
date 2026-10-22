import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
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
import { DueBadge, SupplierMissingNotice, SupplierNav } from '../SupplierUi'
import {
  RECEIPT_CHECK_TEMPLATES,
  RECEIPT_INSPECTION_PATH,
  RECEIPT_ITEM_LABEL,
  asArray,
  canManageSuppliers,
  downloadCsv,
  isSupplierMissingError,
  supplierErrorText,
  todayIso,
  type CheckResult,
  type ClientOption,
  type ReceiptCheck,
  type ReceiptInspection,
  type ReceiptItemType,
} from '../supplierShared'

type Decision = 'pending' | 'accepted' | 'rejected'

type ReceiptForm = {
  supplierId: string
  itemType: ReceiptItemType
  itemDescription: string
  poRef: string
  receivedOn: string
  quantity: string
  unit: string
  batchLot: string
  expiryDate: string
  certificateRef: string
  checks: ReceiptCheck[]
  decision: Decision
  inspectedBy: string
  remarks: string
}

const ITEM_TYPES = Object.keys(RECEIPT_ITEM_LABEL) as ReceiptItemType[]

function checksFor(type: ReceiptItemType): ReceiptCheck[] {
  return RECEIPT_CHECK_TEMPLATES[type].map((check) => ({ check, result: 'pass' as CheckResult }))
}

function emptyForm(): ReceiptForm {
  return {
    supplierId: '',
    itemType: 'consumable',
    itemDescription: '',
    poRef: '',
    receivedOn: todayIso(),
    quantity: '',
    unit: '',
    batchLot: '',
    expiryDate: '',
    certificateRef: '',
    checks: checksFor('consumable'),
    decision: 'pending',
    inspectedBy: '',
    remarks: '',
  }
}

function DecisionBadge({ value }: { value: boolean | null }) {
  if (value === null) {
    return <span className="whitespace-nowrap border border-stone-400 bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold text-stone-700">Pending</span>
  }
  return value ? (
    <span className="whitespace-nowrap border border-emerald-700/50 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-900">Accepted</span>
  ) : (
    <span className="whitespace-nowrap border border-red-700/60 bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-900">Rejected</span>
  )
}

const RESULT_TONE: Record<CheckResult, string> = {
  pass: 'text-emerald-800',
  fail: 'font-bold text-red-800',
  na: 'text-stone-500',
}

export default function ReceiptInspectionPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const isDirector = isLaboratoryDirector(designation)
  const canManage = canManageSuppliers(designation, departmentName, isDirector)

  const [rows, setRows] = useState<ReceiptInspection[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [typeFilter, setTypeFilter] = useState<'' | ReceiptItemType>('')
  const [decisionFilter, setDecisionFilter] = useState<'' | Decision>('')
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ReceiptInspection | null>(null)
  const [form, setForm] = useState<ReceiptForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, aRes, cRes] = await Promise.all([
        supabase.from('receipt_inspections').select('*').order('received_on', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
        supabase.from('supplier_approvals').select('client_id').eq('approved', true).limit(5000),
        supabase.from('clients').select('id, company_name, company_type').order('company_name').limit(5000),
      ])
      if (rRes.error) {
        if (isSupplierMissingError(rRes.error)) {
          setMissing(true)
          return
        }
        throw rRes.error
      }
      setMissing(false)
      setRows(((rRes.data ?? []) as ReceiptInspection[]).map((r) => ({ ...r, checks: asArray<ReceiptCheck>(r.checks) })))
      setApprovedIds(new Set(aRes.error ? [] : (aRes.data ?? []).map((r) => String((r as { client_id: string }).client_id))))
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

  const sortedClients = useMemo(
    () => [...clients.filter((c) => approvedIds.has(c.id)), ...clients.filter((c) => !approvedIds.has(c.id))],
    [clients, approvedIds],
  )

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows
      .filter((r) => !typeFilter || r.item_type === typeFilter)
      .filter((r) => {
        if (!decisionFilter) return true
        const d: Decision = r.accepted === null ? 'pending' : r.accepted ? 'accepted' : 'rejected'
        return d === decisionFilter
      })
      .filter((r) => {
        if (!needle) return true
        return [clientName(r.supplier_id), r.item_description, r.po_or_invoice_ref, r.batch_lot, r.certificate_ref, r.remarks]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
  }, [rows, typeFilter, decisionFilter, search, clientName])

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (r: ReceiptInspection) => {
    setEditing(r)
    setForm({
      supplierId: r.supplier_id,
      itemType: r.item_type,
      itemDescription: r.item_description,
      poRef: r.po_or_invoice_ref ?? '',
      receivedOn: r.received_on,
      quantity: r.quantity === null ? '' : String(r.quantity),
      unit: r.unit ?? '',
      batchLot: r.batch_lot ?? '',
      expiryDate: r.expiry_date ?? '',
      certificateRef: r.certificate_ref ?? '',
      checks: r.checks.map((c) => ({ check: c.check, result: c.result, note: c.note ?? '' })),
      decision: r.accepted === null ? 'pending' : r.accepted ? 'accepted' : 'rejected',
      inspectedBy: r.inspected_by ?? '',
      remarks: r.remarks ?? '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const setItemType = (t: ReceiptItemType) => {
    const untouched = form.checks.every((c) => c.result === 'pass' && !c.note)
    setForm({ ...form, itemType: t, checks: untouched ? checksFor(t) : form.checks })
  }

  const setCheck = (i: number, patch: Partial<ReceiptCheck>) =>
    setForm({ ...form, checks: form.checks.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  const failedCount = form.checks.filter((c) => c.result === 'fail').length
  const expiredOnReceipt = Boolean(form.expiryDate && form.receivedOn && form.expiryDate < form.receivedOn)

  const save = async () => {
    if (!form.supplierId) {
      setFormError('Choose the supplier.')
      return
    }
    if (!form.itemDescription.trim()) {
      setFormError('Describe the item received.')
      return
    }
    if (form.checks.some((c) => !c.check.trim())) {
      setFormError('Every check needs a name (or remove it).')
      return
    }
    if (form.decision === 'accepted' && expiredOnReceipt) {
      setFormError('The item had expired on receipt and cannot be accepted.')
      return
    }
    if (form.decision === 'accepted' && failedCount > 0 && !form.remarks.trim()) {
      setFormError('A check failed: write the justification in remarks before accepting, or reject the item.')
      return
    }
    const qty = form.quantity.trim() === '' ? null : Number(form.quantity)
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      setFormError('Quantity must be a number of 0 or more.')
      return
    }
    const payload = {
      supplier_id: form.supplierId,
      item_type: form.itemType,
      item_description: form.itemDescription.trim(),
      po_or_invoice_ref: form.poRef.trim() || null,
      received_on: form.receivedOn,
      quantity: qty,
      unit: form.unit.trim() || null,
      batch_lot: form.batchLot.trim() || null,
      expiry_date: form.expiryDate || null,
      certificate_ref: form.certificateRef.trim() || null,
      checks: form.checks.map((c) => ({ check: c.check.trim(), result: c.result, ...(c.note?.trim() ? { note: c.note.trim() } : {}) })),
      accepted: form.decision === 'pending' ? null : form.decision === 'accepted',
      inspected_by: form.inspectedBy.trim() || null,
      remarks: form.remarks.trim() || null,
    }
    let reason: string | null = null
    if (editing) {
      reason = await askReason({
        title: 'Reason for changing a receipt inspection',
        recordLabel: `${editing.item_description} · ${formatDate(editing.received_on)}`,
        quickPicks: ['Decision recorded', 'Certificate received later', 'Correction of entry'],
      })
      if (!reason) return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        const { data, error: err } = await supabase.from('receipt_inspections').update(payload).eq('id', editing.id).select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director, Quality Manager or Technical Manager only).')
        if (reason) await recordReason('receipt_inspections', editing.id, reason)
      } else {
        const { error: err } = await supabase.from('receipt_inspections').insert(payload)
        if (err) throw err
      }
      setFormOpen(false)
      setMessage(editing ? 'Receipt inspection updated.' : 'Receipt inspection recorded.')
      await load()
    } catch (err) {
      setFormError(supplierErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: ReceiptInspection) => {
    const reason = await askReason({
      title: 'Reason for deleting a receipt inspection',
      recordLabel: `${r.item_description} · ${formatDate(r.received_on)}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('receipt_inspections').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? supplierErrorText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('receipt_inspections', r.id, reason)
    await load()
  }

  const exportCsv = () => {
    downloadCsv(
      `receipt-inspections-${todayIso()}.csv`,
      ['Received on', 'Supplier', 'Approved supplier', 'Item type', 'Item', 'PO / invoice', 'Quantity', 'Unit', 'Batch / lot', 'Expiry', 'Certificate', 'Checks', 'Decision', 'Inspected by', 'Remarks'],
      shown.map((r) => [
        r.received_on,
        clientName(r.supplier_id),
        r.supplier_approved_at_receipt === null ? '' : r.supplier_approved_at_receipt ? 'Yes' : 'No',
        RECEIPT_ITEM_LABEL[r.item_type],
        r.item_description,
        r.po_or_invoice_ref ?? '',
        r.quantity ?? '',
        r.unit ?? '',
        r.batch_lot ?? '',
        r.expiry_date ?? '',
        r.certificate_ref ?? '',
        r.checks.map((c) => `${c.check}: ${c.result}${c.note ? ` (${c.note})` : ''}`).join('; '),
        r.accepted === null ? 'Pending' : r.accepted ? 'Accepted' : 'Rejected',
        r.inspected_by ?? '',
        r.remarks ?? '',
      ]),
    )
  }

  const notApprovedBadge = (r: ReceiptInspection) =>
    r.supplier_approved_at_receipt === false ? (
      <span className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap border border-amber-600/60 bg-amber-100 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-900">
        <AlertTriangle className="h-3 w-3" /> Not on approved list
      </span>
    ) : null

  const rowActions = (r: ReceiptInspection, big = false) => (
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

  const supplierApprovedNow = form.supplierId ? approvedIds.has(form.supplierId) : true

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Receipt Inspection"
        clause="6.6.2 / 6.4.4"
        subtitle="Verify consumables, CRMs, reagents and equipment on receipt before they are used."
        actions={
          <>
            {canManage && !missing ? (
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={openNew}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Record receipt</span>
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
      <SupplierNav current={RECEIPT_INSPECTION_PATH} />
      {missing ? <SupplierMissingNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <>
          <EnvPanel title="Filter">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="Item type" htmlFor="ri-type">
                <EnvSelect id="ri-type" value={typeFilter} onChange={(v) => setTypeFilter(v as '' | ReceiptItemType)}>
                  <option value="">All items</option>
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RECEIPT_ITEM_LABEL[t]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Decision" htmlFor="ri-dec">
                <EnvSelect id="ri-dec" value={decisionFilter} onChange={(v) => setDecisionFilter(v as '' | Decision)}>
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </EnvSelect>
              </Field>
              <Field label="Search" htmlFor="ri-search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
                  <Input id="ri-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item, supplier, PO, batch" className={cn(envInputClass, 'pl-8')} />
                </div>
              </Field>
            </div>
          </EnvPanel>

          <EnvPanel title={`Receipts (${shown.length})`}>
            <div className="space-y-1.5 md:hidden">
              {shown.map((r) => (
                <div key={r.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">{r.item_description}</p>
                    <DecisionBadge value={r.accepted} />
                  </div>
                  <p className="text-[12px] text-stone-600">
                    {formatDate(r.received_on)} · {RECEIPT_ITEM_LABEL[r.item_type]} · {clientName(r.supplier_id)}
                    {notApprovedBadge(r)}
                  </p>
                  <p className="text-[12px]">
                    {r.batch_lot ? `Lot ${r.batch_lot} · ` : ''}
                    {r.expiry_date ? (
                      <>
                        Expiry <DueBadge date={r.expiry_date} label="Expiry" soonDays={60} overdueText="Expired" />
                      </>
                    ) : null}
                  </p>
                  <div className="mt-1 flex justify-end">{rowActions(r, true)}</div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1040px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={envThClass}>Received</th>
                    <th className={cn(envThClass, 'text-left')}>Item</th>
                    <th className={envThClass}>Supplier</th>
                    <th className={envThClass}>PO / invoice</th>
                    <th className={envThClass}>Qty</th>
                    <th className={envThClass}>Batch · expiry</th>
                    <th className={envThClass}>Checks</th>
                    <th className={envThClass}>Decision</th>
                    <th className={envThClass}>By</th>
                    {canManage ? <th className={envThClass}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>{formatDate(r.received_on)}</td>
                      <td className={envTdClass}>
                        <span className="font-semibold">{r.item_description}</span>
                        <span className="block text-[11px] text-stone-600">
                          {RECEIPT_ITEM_LABEL[r.item_type]}
                          {r.certificate_ref ? ` · Cert ${r.certificate_ref}` : ''}
                        </span>
                      </td>
                      <td className={envTdClass}>
                        {clientName(r.supplier_id)}
                        {notApprovedBadge(r)}
                      </td>
                      <td className={envTdClass}>{r.po_or_invoice_ref || '—'}</td>
                      <td className={cn(envTdClass, 'text-center')}>
                        {r.quantity ?? '—'} {r.unit ?? ''}
                      </td>
                      <td className={envTdClass}>
                        {r.batch_lot || '—'}
                        {r.expiry_date ? (
                          <span className="block">
                            <DueBadge date={r.expiry_date} label="Expiry" soonDays={60} overdueText="Expired" />
                          </span>
                        ) : null}
                      </td>
                      <td className={cn(envTdClass, 'text-[11px]')}>
                        {r.checks.map((c, j) => (
                          <span key={j} className="block">
                            {c.check}: <span className={RESULT_TONE[c.result]}>{c.result.toUpperCase()}</span>
                            {c.note ? <span className="text-stone-500"> ({c.note})</span> : null}
                          </span>
                        ))}
                      </td>
                      <td className={cn(envTdClass, 'text-center')}>
                        <DecisionBadge value={r.accepted} />
                        {r.remarks ? <span className="mt-0.5 block text-left text-[11px] text-stone-600">{r.remarks}</span> : null}
                      </td>
                      <td className={envTdClass}>{r.inspected_by ?? '—'}</td>
                      {canManage ? <td className={cn(envTdClass, 'whitespace-nowrap text-center')}>{rowActions(r)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && shown.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No receipt inspections recorded yet.</p> : null}
          </EnvPanel>
        </>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => (!open && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-3xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">{editing ? 'Edit receipt inspection' : 'Record receipt inspection'}</DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                Items must not be used until accepted. A failed check needs a justification to accept.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[78vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Supplier *" htmlFor="rf-sup" className="sm:col-span-2">
                <EnvSelect id="rf-sup" value={form.supplierId} onChange={(v) => setForm({ ...form, supplierId: v })}>
                  <option value="">— Choose supplier —</option>
                  {sortedClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {approvedIds.has(c.id) ? '✓ ' : ''}
                      {c.company_name}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Item type" htmlFor="rf-type">
                <EnvSelect id="rf-type" value={form.itemType} onChange={(v) => setItemType(v as ReceiptItemType)}>
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RECEIPT_ITEM_LABEL[t]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
            </div>
            {!supplierApprovedNow ? (
              <MessageLine tone="error" text="This supplier is not on the approved supplier list. Record why it was used in remarks." />
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Item description *" htmlFor="rf-item" className="sm:col-span-2">
                <Input id="rf-item" value={form.itemDescription} onChange={(e) => setForm({ ...form, itemDescription: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="PO / invoice ref." htmlFor="rf-po">
                <Input id="rf-po" value={form.poRef} onChange={(e) => setForm({ ...form, poRef: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Received on *" htmlFor="rf-recv">
                <Input id="rf-recv" type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Quantity" htmlFor="rf-qty">
                <Input id="rf-qty" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Unit" htmlFor="rf-unit">
                <Input id="rf-unit" value={form.unit} placeholder="bottle, kg, nos" onChange={(e) => setForm({ ...form, unit: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Batch / lot" htmlFor="rf-lot">
                <Input id="rf-lot" value={form.batchLot} onChange={(e) => setForm({ ...form, batchLot: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Expiry date" htmlFor="rf-exp">
                <Input id="rf-exp" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Certificate / CoA ref." htmlFor="rf-cert">
                <Input id="rf-cert" value={form.certificateRef} onChange={(e) => setForm({ ...form, certificateRef: e.target.value })} className={envInputClass} />
              </Field>
            </div>
            {expiredOnReceipt ? <MessageLine tone="error" text="The expiry date is before the receipt date: the item cannot be accepted." /> : null}

            <div className="border border-stone-400 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 bg-stone-100 px-2 py-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-700">Checks on receipt</p>
                <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-7')} onClick={() => setForm({ ...form, checks: [...form.checks, { check: '', result: 'pass' }] })}>
                  <Plus className="h-3.5 w-3.5" /> Check
                </Button>
              </div>
              <div className="divide-y divide-stone-200">
                {form.checks.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 p-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                    <Field label={`Check ${i + 1}`} htmlFor={`rf-c-${i}`} className="col-span-2 sm:col-span-1">
                      <Input id={`rf-c-${i}`} value={c.check} onChange={(e) => setCheck(i, { check: e.target.value })} className={envInputClass} />
                    </Field>
                    <Field label="Result" htmlFor={`rf-r-${i}`}>
                      <EnvSelect id={`rf-r-${i}`} value={c.result} onChange={(v) => setCheck(i, { result: v as CheckResult })}>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                        <option value="na">N/A</option>
                      </EnvSelect>
                    </Field>
                    <Field label="Note" htmlFor={`rf-n-${i}`} className="col-span-2 sm:col-span-1">
                      <Input id={`rf-n-${i}`} value={c.note ?? ''} onChange={(e) => setCheck(i, { note: e.target.value })} className={envInputClass} />
                    </Field>
                    <Button
                      size="icon"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'h-10 w-10 sm:h-8 sm:w-8')}
                      onClick={() => setForm({ ...form, checks: form.checks.filter((_, j) => j !== i) })}
                      aria-label={`Remove check ${i + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Decision" htmlFor="rf-dec">
                <EnvSelect id="rf-dec" value={form.decision} onChange={(v) => setForm({ ...form, decision: v as Decision })}>
                  <option value="pending">Pending (do not use yet)</option>
                  <option value="accepted" disabled={expiredOnReceipt}>
                    Accepted for use
                  </option>
                  <option value="rejected">Rejected / returned</option>
                </EnvSelect>
              </Field>
              <Field label="Inspected by (blank = you)" htmlFor="rf-by">
                <Input id="rf-by" value={form.inspectedBy} onChange={(e) => setForm({ ...form, inspectedBy: e.target.value })} className={envInputClass} />
              </Field>
            </div>
            <Field label={failedCount > 0 && form.decision === 'accepted' ? 'Remarks / justification *' : 'Remarks'} htmlFor="rf-rem">
              <Textarea id="rf-rem" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="rounded-none border-stone-500 bg-white text-base sm:text-sm" />
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
