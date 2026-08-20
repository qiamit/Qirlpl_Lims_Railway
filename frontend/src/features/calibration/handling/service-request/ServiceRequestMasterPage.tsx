import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPageShellClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import { ServiceRequestHeaderBar } from './ServiceRequestHeaderBar'
import { ServiceRequestTable } from './ServiceRequestTable'
import { ServiceRequestFooterBar } from './ServiceRequestFooterBar'
import { ServiceRequestFormView } from './ServiceRequestForm'
import {
  emptyServiceRequestForm,
  formToPayload,
  nextSrfNumber,
  normalizeText,
  rowToForm,
  type ServiceRequestForm,
  type ServiceRequestRow,
} from './types'
import { ensureCalibrationJobsForAcceptedSrf } from '../jobs/calibrationJobApi'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  return lines.join('\n')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const flushCell = () => {
    row.push(cell)
    cell = ''
  }
  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      flushCell()
      continue
    }
    if (ch === '\n') {
      flushRow()
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) flushRow()
  return rows.map((r) => r.map((c) => c.trim()))
}

const CSV_HEADERS = [
  'srf_number',
  'srf_date',
  'client_name',
  'calibration_location',
  'equipment_description',
  'quantity',
  'status',
] as const

const CUSTOMER_DOC_BUCKET = 'calibration-srf-documents'

const SELECT_COLS =
  'id, srf_number, srf_date, client_id, client_name, customer_reference_no, customer_reference_date, calibration_location, equipment_description, quantity, customer_required_date, required_completion_date, customer_document_path, customer_document_name, contact_person, contact_number_mail, physical_condition, calibration_method_choice, invoice_no, invoice_date, special_instruction, witness_required, witness_activity, accreditation_status, terms_accepted, capability_evaluation, resource_evaluation, req_defined_understood, capability_resources_ok, external_provider_used, external_provider_customer_approved, external_provider_details, methods_selected_ok, method_notes, method_outdated_customer_informed, statement_of_conformity_requested, specification_standard, decision_rule, differences_resolved, contract_accepted, deviations_customer_informed, review_remarks, status, created_at, updated_at'

export default function ServiceRequestMasterPage() {
  const { session, loading: authLoading } = useAuth()
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ServiceRequestRow[]>([])
  const [clientOptions, setClientOptions] = useState<FilterComboboxOption[]>([])
  const [clientContactById, setClientContactById] = useState<
    Record<string, { contactPerson: string; contactNumberMail: string }>
  >(() => ({}))
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [form, setForm] = useState<ServiceRequestForm>(() => emptyServiceRequestForm())
  const [customerDocumentFile, setCustomerDocumentFile] = useState<File | null>(null)

  const canSave =
    !saveLoading &&
    normalizeText(form.srfNumber).length > 0 &&
    Boolean(form.srfDate) &&
    Boolean(form.clientId)

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, company_name, contact_person_name, email, country_code, mobile')
      .order('company_name', { ascending: true })
    const options: FilterComboboxOption[] = []
    const contacts: Record<string, { contactPerson: string; contactNumberMail: string }> = {}
    for (const c of data ?? []) {
      const id = String(c.id)
      options.push({
        id,
        label: String(c.company_name ?? '').trim() || 'Unnamed client',
      })
      const phone = [c.country_code, c.mobile]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .join(' ')
      const email = String(c.email ?? '').trim()
      contacts[id] = {
        contactPerson: String(c.contact_person_name ?? '').trim(),
        contactNumberMail: [phone, email].filter(Boolean).join(' / '),
      }
    }
    setClientOptions(options)
    setClientContactById(contacts)
  }, [])

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession()
      if (!activeSession?.access_token) {
        setRows([])
        setListError('Please sign in to view service requests.')
        return
      }
      const { data, error } = await supabase
        .from('calibration_service_requests')
        .select(SELECT_COLS)
        .order('srf_date', { ascending: false })
        .order('srf_number', { ascending: false })
      if (error) throw error
      setRows((data ?? []) as ServiceRequestRow[])
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    void loadClients()
    void loadRows()
  }, [authLoading, session?.access_token, loadClients, loadRows])

  const makeNextSrf = useCallback(
    () => nextSrfNumber(rows.map((r) => r.srf_number)),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.srf_number,
        r.srf_date,
        r.client_name,
        r.calibration_location,
        r.equipment_description,
        r.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const assistantContext = useMemo(() => {
    const lines = [
      'Module: Calibration Handling / Service Request',
      `Total requests: ${rows.length}`,
      search.trim() ? `Search: "${search.trim()}"` : 'No search',
      '',
      'Recent (up to 20):',
    ]
    for (const r of rows.slice(0, 20)) {
      lines.push(
        `- ${r.srf_number} | ${r.client_name ?? '-'} | ${r.calibration_location} | ${r.status}`,
      )
    }
    return lines.join('\n')
  }, [rows, search])

  const openNew = () => {
    setEditingId(null)
    setForm({ ...emptyServiceRequestForm(), srfNumber: makeNextSrf() })
    setCustomerDocumentFile(null)
    setSaveMessage(null)
    setShowForm(true)
  }

  const openEdit = (row: ServiceRequestRow) => {
    setEditingId(row.id)
    setForm(rowToForm(row))
    setCustomerDocumentFile(null)
    setSaveMessage(null)
    setShowForm(true)
  }

  const openCopy = (row: ServiceRequestRow) => {
    setEditingId(null)
    setForm(rowToForm(row, true, makeNextSrf()))
    setCustomerDocumentFile(null)
    setSaveMessage(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      let customerDocPath = form.customerDocumentPath || null
      let customerDocName = form.customerDocumentName || null
      if (customerDocumentFile) {
        const ext = customerDocumentFile.name.split('.').pop() || 'bin'
        const path = `${editingId || crypto.randomUUID()}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from(CUSTOMER_DOC_BUCKET)
          .upload(path, customerDocumentFile, { upsert: true })
        if (upErr) throw upErr
        customerDocPath = path
        customerDocName = customerDocumentFile.name
      }
      const payload = formToPayload({
        ...form,
        customerDocumentPath: customerDocPath ?? '',
        customerDocumentName: customerDocName ?? '',
      })
      let serviceRequestId = editingId
      if (editingId) {
        const { error } = await supabase
          .from('calibration_service_requests')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { data: inserted, error } = await supabase
          .from('calibration_service_requests')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        serviceRequestId = (inserted as { id: string } | null)?.id ?? null
      }

      if (payload.status === 'Accepted' && serviceRequestId) {
        const { created } = await ensureCalibrationJobsForAcceptedSrf({
          serviceRequestId,
          srfNumber: payload.srf_number,
          clientId: payload.client_id,
          clientName: payload.client_name,
          equipmentDescription: payload.equipment_description,
        })
        setSaveMessage(
          created > 0
            ? `Saved ${payload.srf_number}. Created ${created} calibration job(s).`
            : `Saved ${payload.srf_number}.`,
        )
      } else {
        setSaveMessage(`Saved ${payload.srf_number}.`)
      }
      setShowForm(false)
      setEditingId(null)
      setCustomerDocumentFile(null)
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
    if (!window.confirm(`Delete ${ids.length} selected service request(s)?`)) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const { error } = await supabase.from('calibration_service_requests').delete().in('id', ids)
      if (error) throw error
      setSelectedIds(new Set())
      setSaveMessage(`Deleted ${ids.length} record(s).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleExport = () => {
    const source =
      selectedIds.size > 0 ? filteredRows.filter((r) => selectedIds.has(r.id)) : filteredRows
    const csvRows = source.map((r) => ({
      srf_number: r.srf_number ?? '',
      srf_date: r.srf_date?.slice(0, 10) ?? '',
      client_name: r.client_name ?? '',
      calibration_location: r.calibration_location ?? '',
      equipment_description: r.equipment_description ?? '',
      quantity: String(r.quantity ?? 1),
      status: r.status ?? '',
    }))
    const blob = new Blob([toCsv([...CSV_HEADERS], csvRows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'calibration_service_requests.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (file: File) => {
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.length < 2) throw new Error('CSV has no data rows.')
      const header = parsed[0]!.map((h) => h.toLowerCase())
      const idx = (name: string) => header.indexOf(name)
      const payloads = parsed
        .slice(1)
        .map((cells) => {
          const get = (name: string) => {
            const i = idx(name)
            return i >= 0 ? (cells[i] ?? '').trim() : ''
          }
          const clientName = get('client_name')
          const client = clientOptions.find(
            (c) => c.label.toLowerCase() === clientName.toLowerCase(),
          )
          return {
            srf_number: get('srf_number'),
            srf_date: get('srf_date') || new Date().toISOString().slice(0, 10),
            client_id: client?.id ?? null,
            client_name: clientName || null,
            calibration_location: get('calibration_location') === 'On Site' ? 'On Site' : 'In Lab',
            equipment_description: get('equipment_description') || null,
            quantity: Number.parseInt(get('quantity') || '1', 10) || 1,
            status: get('status') || 'Under Review',
          }
        })
        .filter((p) => p.srf_number)
      if (payloads.length === 0) throw new Error('No valid rows found in CSV.')
      const { error } = await supabase
        .from('calibration_service_requests')
        .upsert(payloads, { onConflict: 'srf_number' })
      if (error) throw error
      setSaveMessage(`Imported ${payloads.length} service request(s).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handlePrintSelected = () => {
    const source =
      selectedIds.size > 0 ? filteredRows.filter((r) => selectedIds.has(r.id)) : filteredRows
    if (source.length === 0) {
      setSaveMessage('Nothing to print.')
      return
    }
    const esc = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const cards = source
      .map(
        (r) => `
        <section style="border:1px solid #e7eaf0;border-radius:12px;padding:14px;margin-bottom:12px">
          <h2 style="margin:0 0 8px">${esc(r.srf_number)}</h2>
          <p><b>Date:</b> ${esc(formatDate(r.srf_date))} · <b>Status:</b> ${esc(r.status || '—')}</p>
          <p><b>Client:</b> ${esc(r.client_name || '—')}</p>
          <p><b>Location:</b> ${esc(r.calibration_location || '—')}</p>
          <p><b>Equipment:</b> ${esc(r.equipment_description || '—')}</p>
        </section>`,
      )
      .join('')
    const w = window.open('', '_blank')
    if (!w) {
      setSaveMessage('Popup blocked. Allow popups to print.')
      return
    }
    w.document.open()
    w.document.write(`<!doctype html><html><head><title>Service Requests</title></head><body style="font-family:sans-serif;padding:24px">${cards}<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`)
    w.document.close()
  }

  return (
    <div className={limsPageShellClass}>
      <ServiceRequestHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadRows()}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden p-0',
            'left-0 top-0',
            'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
          )}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Service Request' : 'Add New Service Request'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
            {saveMessage && showForm ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <ServiceRequestFormView
              form={form}
              onChange={setForm}
              clientOptions={clientOptions}
              clientContactById={clientContactById}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={() => void handleSave()}
              srfLocked={!editingId}
              onCustomerDocumentSelect={setCustomerDocumentFile}
              customerDocumentFileName={customerDocumentFile?.name}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ServiceRequestTable
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

      <ServiceRequestFooterBar
        loading={listLoading || saveLoading}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onImport={() => importInputRef.current?.click()}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={() => void handleDeleteSelected()}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (!Number.isFinite(n)) return
          setPage(Math.min(pageCount, Math.max(1, n)))
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onImportFile(file)
        }}
      />
    </div>
  )
}
