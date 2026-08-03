import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import { QuotationHeaderBar } from './QuotationHeaderBar'
import { QuotationTable } from './QuotationTable'
import { QuotationFooterBar } from './QuotationFooterBar'
import {
  QuotationFormView,
  type QuotationClientContact,
  type QuotationProductDetails,
} from './QuotationForm'
import {
  computeQuotationTotals,
  emptyQuotationForm,
  formatDate,
  formatMoney,
  lineAmount,
  nextQuotationNumber,
  parseMoney,
  rowToForm,
  type QuotationForm as QuotationFormType,
  type QuotationLineRow,
  type QuotationRow,
  type QuotationStatus,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function QuotationMasterPage() {
  const [rows, setRows] = useState<QuotationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<QuotationFormType>(() => emptyQuotationForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [clientOptions, setClientOptions] = useState<FilterComboboxOption[]>([])
  const [clientContactById, setClientContactById] = useState<Record<string, QuotationClientContact>>(
    {},
  )
  const [productOptions, setProductOptions] = useState<FilterComboboxOption[]>([])
  const [productById, setProductById] = useState<Record<string, QuotationProductDetails>>({})

  const canSave =
    !saveLoading &&
    form.quotationNumber.trim().length > 0 &&
    form.clientName.trim().length > 0 &&
    form.lines.some((l) => l.description.trim().length > 0)

  const loadClients = useCallback(async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, company_name, contact_person_name, email, country_code, mobile')
      .order('company_name', { ascending: true })
    if (error) return
    const list = Array.isArray(data) ? data : []
    setClientOptions(
      list.map((c) => ({
        id: String((c as { id: string }).id),
        label: String((c as { company_name?: string }).company_name ?? '').trim() || 'Unnamed',
      })),
    )
    const contacts: Record<string, QuotationClientContact> = {}
    for (const c of list) {
      const id = String((c as { id: string }).id)
      const row = c as {
        contact_person_name?: string | null
        email?: string | null
        country_code?: string | null
        mobile?: string | null
      }
      const contactMobile = [row.country_code, row.mobile]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .join(' ')
      contacts[id] = {
        contactPerson: String(row.contact_person_name ?? '').trim(),
        contactEmail: String(row.email ?? '').trim(),
        contactMobile,
      }
    }
    setClientContactById(contacts)
  }, [])

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('products_services_master')
      .select('id, item_code, item_name, hsn_code, unit_of_measurement, sale_price')
      .order('item_name', { ascending: true })
    if (error) return
    const list = Array.isArray(data) ? data : []
    const options: FilterComboboxOption[] = []
    const byId: Record<string, QuotationProductDetails> = {}
    for (const row of list) {
      const r = row as {
        id: string
        item_code?: string | null
        item_name?: string | null
        hsn_code?: string | null
        unit_of_measurement?: string | null
        sale_price?: number | null
      }
      const id = String(r.id)
      const itemName = String(r.item_name ?? '').trim()
      const itemCode = String(r.item_code ?? '').trim()
      options.push({
        id,
        label: [itemCode, itemName].filter(Boolean).join(' · ') || 'Unnamed item',
      })
      byId[id] = {
        itemName: itemName || itemCode,
        hsnCode: String(r.hsn_code ?? '').trim(),
        unit: String(r.unit_of_measurement ?? '').trim(),
        salePrice: Number(r.sale_price ?? 0) || 0,
      }
    }
    setProductOptions(options)
    setProductById(byId)
  }, [])

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const [{ data: headers, error: hErr }, { data: lines, error: lErr }] = await Promise.all([
        supabase.from('quotations').select('*').order('quotation_date', { ascending: false }),
        supabase.from('quotation_line_items').select('*').order('line_no', { ascending: true }),
      ])
      if (hErr) throw hErr
      if (lErr) throw lErr

      const lineRows = (Array.isArray(lines) ? lines : []) as QuotationLineRow[]
      const byQuotation = new Map<string, QuotationLineRow[]>()
      for (const line of lineRows) {
        const list = byQuotation.get(line.quotation_id) ?? []
        list.push(line)
        byQuotation.set(line.quotation_id, list)
      }

      const list = (Array.isArray(headers) ? headers : []).map((h) => {
        const row = h as QuotationRow
        return {
          ...row,
          status: (row.status ?? 'Draft') as QuotationStatus,
          line_items: byQuotation.get(row.id) ?? [],
        }
      })
      setRows(list)
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadClients()
    void loadProducts()
    void loadRows()
  }, [loadClients, loadProducts, loadRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.quotation_number,
        r.client_name,
        r.status,
        r.subject ?? '',
        r.reference_no ?? '',
        r.contact_person ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  const openNew = () => {
    const next = nextQuotationNumber(rows.map((r) => r.quotation_number))
    setEditingId(null)
    setForm(emptyQuotationForm(next))
    setSaveMessage(null)
    setShowForm(true)
  }

  const openEdit = (row: QuotationRow) => {
    setEditingId(row.id)
    setForm(rowToForm(row, false))
    setSaveMessage(null)
    setShowForm(true)
  }

  const openCopy = (row: QuotationRow) => {
    const next = nextQuotationNumber(rows.map((r) => r.quotation_number))
    setEditingId(null)
    setForm(rowToForm(row, true, next))
    setSaveMessage(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const totals = computeQuotationTotals(form)
      const payload = {
        quotation_number: form.quotationNumber.trim(),
        quotation_date: form.quotationDate || null,
        valid_until: form.validUntil || null,
        client_id: form.clientId || null,
        client_name: form.clientName.trim(),
        contact_person: form.contactPerson.trim() || null,
        contact_email: form.contactEmail.trim() || null,
        contact_mobile: form.contactMobile.trim() || null,
        subject: null,
        reference_no: null,
        status: form.status,
        payment_terms: form.paymentTerms.trim() || null,
        remarks: form.remarks.trim() || null,
        discount_percent: parseMoney(form.discountPercent),
        discount_amount: totals.discountAmount,
        gst_percent: parseMoney(form.gstPercent),
        gst_amount: totals.gstAmount,
        subtotal: totals.subtotal,
        grand_total: totals.grandTotal,
      }

      let quotationId = editingId
      if (editingId) {
        const { error } = await supabase.from('quotations').update(payload).eq('id', editingId)
        if (error) throw error
        const { error: delErr } = await supabase
          .from('quotation_line_items')
          .delete()
          .eq('quotation_id', editingId)
        if (delErr) throw delErr
      } else {
        const { data, error } = await supabase
          .from('quotations')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        quotationId = (data as { id: string } | null)?.id ?? null
      }

      if (!quotationId) throw new Error('Quotation id missing after save')

      const linePayloads = form.lines
        .filter((l) => l.description.trim().length > 0)
        .map((l, index) => ({
          quotation_id: quotationId,
          line_no: index + 1,
          description: l.description.trim(),
          hsn_sac: l.hsnSac.trim() || null,
          quantity: parseMoney(l.quantity) || 1,
          unit: l.unit.trim() || 'Nos',
          rate: parseMoney(l.rate),
          amount: lineAmount(l),
        }))

      if (linePayloads.length > 0) {
        const { error: lineErr } = await supabase.from('quotation_line_items').insert(linePayloads)
        if (lineErr) throw lineErr
      }

      setSaveMessage(`Saved ${form.quotationNumber}.`)
      setShowForm(false)
      setEditingId(null)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (!checked) pagedRows.forEach((r) => next.delete(r.id))
      else pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} quotation(s)?`)) return
    setSaveMessage(null)
    try {
      const { error } = await supabase.from('quotations').delete().in('id', ids)
      if (error) throw error
      setSelectedIds(new Set())
      setSaveMessage(`Deleted ${ids.length} quotation(s).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    }
  }

  const handleExport = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : filteredRows
    const header = [
      'quotation_number',
      'quotation_date',
      'client_name',
      'status',
      'subtotal',
      'gst_amount',
      'grand_total',
      'valid_until',
    ]
    const lines = [
      header.join(','),
      ...source.map((r) =>
        [
          r.quotation_number,
          r.quotation_date,
          `"${(r.client_name ?? '').replace(/"/g, '""')}"`,
          r.status,
          r.subtotal,
          r.gst_amount,
          r.grand_total,
          r.valid_until ?? '',
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quotations.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : filteredRows
    const cards = source
      .map((r) => {
        const items = (r.line_items ?? [])
          .map(
            (l) =>
              `<tr><td>${esc(l.description)}</td><td>${l.quantity}</td><td>${esc(l.unit)}</td><td>₹ ${formatMoney(l.rate)}</td><td>₹ ${formatMoney(l.amount)}</td></tr>`,
          )
          .join('')
        return `
          <section style="margin-bottom:24px;page-break-inside:avoid;border:1px solid #cbd5e1;border-radius:8px;padding:16px;">
            <h2 style="margin:0 0 8px;font-size:16px;">${esc(r.quotation_number)} · ${esc(r.status)}</h2>
            <p style="margin:0 0 4px;"><b>Client:</b> ${esc(r.client_name || '—')}</p>
            <p style="margin:0 0 4px;"><b>Date:</b> ${esc(formatDate(r.quotation_date))} · <b>Valid:</b> ${esc(formatDate(r.valid_until))}</p>
            <p style="margin:0 0 12px;"><b>Subject:</b> ${esc(r.subject || '—')}</p>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr>
                <th style="border:1px solid #e2e8f0;text-align:left;padding:4px;">Description</th>
                <th style="border:1px solid #e2e8f0;padding:4px;">Qty</th>
                <th style="border:1px solid #e2e8f0;padding:4px;">Unit</th>
                <th style="border:1px solid #e2e8f0;padding:4px;">Rate</th>
                <th style="border:1px solid #e2e8f0;padding:4px;">Amount</th>
              </tr></thead>
              <tbody>${items || '<tr><td colspan="5" style="padding:8px;text-align:center;">No lines</td></tr>'}</tbody>
            </table>
            <p style="margin:12px 0 0;text-align:right;font-weight:600;">Grand Total: ₹ ${formatMoney(r.grand_total)}</p>
          </section>`
      })
      .join('')

    const html = `<!doctype html><html><head><title>Quotations</title></head><body style="font-family:system-ui,sans-serif;padding:24px;">${cards}</body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.close()
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => iframe.remove(), 1000)
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 sm:space-y-5 sm:p-4 md:p-6">
      <QuotationHeaderBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        onNew={openNew}
      />
      <QuotationTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={openEdit}
        onCopy={openCopy}
      />
      <QuotationFooterBar
        message={saveMessage}
        loading={listLoading || saveLoading}
        selectedCount={selectedIds.size}
        totalCount={filteredRows.length}
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onExport={handleExport}
        onPrintSelected={handlePrint}
        onDeleteSelected={() => void handleDeleteSelected()}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          className="!flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
            <DialogHeader className="relative pr-12 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                {editingId ? 'Finance · Sale · Edit Quotation' : 'Finance · Sale · New Quotation'}
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {editingId ? 'Edit Quotation' : 'Add New Quotation'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage && showForm ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <QuotationFormView
              form={form}
              onChange={setForm}
              clientOptions={clientOptions}
              clientContactById={clientContactById}
              productOptions={productOptions}
              productById={productById}
              onReloadProducts={() => void loadProducts()}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={() => void handleSave()}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
