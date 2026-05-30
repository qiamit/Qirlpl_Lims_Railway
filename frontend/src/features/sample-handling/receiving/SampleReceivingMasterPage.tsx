import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AddClientDialog } from './AddClientDialog'
import { AddIsCodeDialog } from './AddIsCodeDialog'
import { SampleReceivingHeaderBar } from './SampleReceivingHeaderBar'
import { SampleReceivingForm } from './SampleReceivingForm'
import { SampleReceivingTable } from './SampleReceivingTable'
import { SampleReceivingTableFooterBar } from './SampleReceivingFooterBar'
import {
  addDays,
  emptySampleReceivingForm,
  normalizeText,
  type SampleRow,
  type SampleReceivingForm as FormType,
} from '../types'

const STAGE = 'receiving' as const
const BUCKET = 'sample-client-references'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const e = err as { message?: string }
  return e.message ?? 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\n')
}

/** Generate next SRF: prefix from lab_prefixes (name='SRF') + yymmdd + 2-digit serial, reset per date. Pass dateStr (YYYY-MM-DD) to use that date. */
async function generateNextSrfNumber(dateStr?: string): Promise<string> {
  let yymmdd: string
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-')
    yymmdd = y.slice(-2) + m + d
  } else {
    const today = new Date()
    yymmdd = today.getFullYear().toString().slice(-2) +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')
  }
  let prefix = 'QI/SRF'
  const { data: prefixRows } = await supabase.from('lab_prefixes').select('name, prefix').eq('name', 'SRF').limit(1)
  if (prefixRows?.[0]?.prefix) prefix = String(prefixRows[0].prefix).trim() || prefix
  const pattern = `${prefix}/${yymmdd}-%`
  const { data: existing } = await supabase.from('samples').select('srf_number').not('srf_number', 'is', null).like('srf_number', pattern)
  const numbers = (existing ?? []).map((r: { srf_number?: string }) => r.srf_number).filter((n): n is string => typeof n === 'string')
  const serials = numbers.map((n) => {
    const part = n.split('-')[1]
    return part ? parseInt(part, 10) : 0
  }).filter((s) => !Number.isNaN(s))
  const nextSerial = serials.length > 0 ? Math.max(...serials) + 1 : 1
  return `${prefix}/${yymmdd}-${String(nextSerial).padStart(2, '0')}`
}

export default function SampleReceivingMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<SampleRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([])
  const [isCodeOptions, setIsCodeOptions] = useState<Array<{ id: string; label: string }>>([])
  const [receivingOptions, setReceivingOptions] = useState<{
    test_required: Array<{ id: string; label: string }>
    mode_of_disposal: Array<{ id: string; label: string }>
    nature_of_sample: Array<{ id: string; label: string }>
    sample_receiving_status: Array<{ id: string; label: string }>
  }>({
    test_required: [],
    mode_of_disposal: [],
    nature_of_sample: [],
    sample_receiving_status: [],
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [form, setForm] = useState<FormType>(() => emptySampleReceivingForm())
  const [clientReferencesFile, setClientReferencesFile] = useState<File | null>(null)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [addIsCodeOpen, setAddIsCodeOpen] = useState(false)

  const canSave = !saveLoading && (normalizeText(form.sampleCode).length > 0 || form.customerId.trim().length > 0)

  const loadClients = async () => {
    try {
      const { data, error } = await supabase.from('clients').select('id, company_name').order('company_name', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data) ? (data as Array<{ id: string; company_name: string }>) : []
      setClientOptions(list.map((r) => ({ id: r.id, label: r.company_name ?? r.id })))
    } catch {
      setClientOptions([])
    }
  }

  const loadIsCodes = async () => {
    try {
      const { data, error } = await supabase.from('is_codes').select('id, is_number, revision_year').order('is_number', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data) ? (data as Array<{ id: string; is_number: string; revision_year: string | null }>) : []
      setIsCodeOptions(list.map((r) => ({
        id: r.id,
        label: r.revision_year ? `${r.is_number ?? ''} : ${r.revision_year}` : (r.is_number ?? r.id),
      })))
    } catch {
      setIsCodeOptions([])
    }
  }

  const loadReceivingOptions = async () => {
    try {
      const { data, error } = await supabase.from('sample_receiving_options').select('id, category, label').order('label', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data) ? (data as Array<{ id: string; category: string; label: string }>) : []
      const byCat: Record<string, Array<{ id: string; label: string }>> = {
        test_required: [],
        mode_of_disposal: [],
        nature_of_sample: [],
        sample_receiving_status: [],
      }
      list.forEach((r) => {
        if (byCat[r.category]) byCat[r.category].push({ id: r.id, label: r.label })
      })
      setReceivingOptions((prev) => ({
        test_required: byCat.test_required ?? [],
        mode_of_disposal: byCat.mode_of_disposal ?? [],
        nature_of_sample: byCat.nature_of_sample ?? [],
        sample_receiving_status: byCat.sample_receiving_status ?? [],
      }))
    } catch {
      setReceivingOptions({ test_required: [], mode_of_disposal: [], nature_of_sample: [], sample_receiving_status: [] })
    }
  }

  const onAddReceivingOption = async (category: string, label: string) => {
    const { error } = await supabase.from('sample_receiving_options').insert({ category, label: label.trim() })
    if (error) throw error
    await loadReceivingOptions()
  }

  const onDeleteReceivingOption = async (category: string, id: string) => {
    const { error } = await supabase.from('sample_receiving_options').delete().eq('id', id)
    if (error) throw error
    await loadReceivingOptions()
  }

  const loadRows = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('samples')
        .select('*, clients(company_name)')
        .order('date_of_sample_receiving', { ascending: false, nullsFirst: false })
        .order('srf_number', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) throw error
      const list = (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => {
        const clients = r.clients as { company_name?: string } | null
        return {
          id: r.id as string,
          srf_number: (r.srf_number as string) ?? null,
          date_of_sample_receiving: (r.date_of_sample_receiving as string) ?? null,
          sample_code: (r.sample_code as string) ?? null,
          sample_qr_code: (r.sample_qr_code as string) ?? null,
          client_id: (r.client_id as string) ?? null,
          client_name: clients?.company_name ?? null,
          client_reference: (r.client_reference as string) ?? null,
          test_report_is_code_id: (r.test_report_is_code_id as string) ?? null,
          test_report_is_code_label: null as string | null,
          description: (r.description as string) ?? null,
          sample_description: (r.sample_description as string) ?? null,
          matrix: (r.matrix as string) ?? null,
          received_at: (r.received_at as string) ?? null,
          received_by: (r.received_by as string) ?? null,
          sample_quantity: (r.sample_quantity as string) ?? null,
          shelf_life: (r.shelf_life as string) ?? null,
          test_required: (r.test_required as string) ?? null,
          batch_number: (r.batch_number as string) ?? null,
          date_of_manufacturing: (r.date_of_manufacturing as string) ?? null,
          bis_seal: (r.bis_seal as boolean) ?? null,
          io_signature: (r.io_signature as boolean) ?? null,
          sample_declaration: (r.sample_declaration as string) ?? null,
          any_other_information: (r.any_other_information as string) ?? null,
          mode_of_disposal: (r.mode_of_disposal as string) ?? null,
          nature_of_sample: (r.nature_of_sample as string) ?? null,
          statement_conformity_required: (r.statement_conformity_required as boolean) ?? null,
          witness_test_required: (r.witness_test_required as boolean) ?? null,
          competent_person_available: (r.competent_person_available as boolean) ?? null,
          equipment_available: (r.equipment_available as boolean) ?? null,
          can_complete_within_time: (r.can_complete_within_time as boolean) ?? null,
          deviation_from_methods: (r.deviation_from_methods as boolean) ?? null,
          supporting_docs_required: (r.supporting_docs_required as boolean) ?? null,
          decision_rule_applied: (r.decision_rule_applied as boolean) ?? null,
          testing_method_available: (r.testing_method_available as boolean) ?? null,
          sampling_procedure_ref: (r.sampling_procedure_ref as boolean) ?? null,
          tentative_date_required: (r.tentative_date_required as string) ?? null,
          tentative_date_by_lab: (r.tentative_date_by_lab as string) ?? null,
          sample_receiving_status: (r.sample_receiving_status as string) ?? null,
          client_references_path: (r.client_references_path as string) ?? null,
          collection_date: (r.collection_date as string) ?? null,
          collection_location: (r.collection_location as string) ?? null,
          storage_conditions: (r.storage_conditions as string) ?? null,
          storage_location: (r.storage_location as string) ?? null,
          status: (r.status as string) ?? null,
          stage: (r.stage as SampleRow['stage']) ?? null,
          quantity: typeof r.quantity === 'number' ? r.quantity : null,
          quantity_unit: (r.quantity_unit as string) ?? null,
          condition_on_receipt: (r.condition_on_receipt as SampleRow['condition_on_receipt']) ?? null,
          condition_notes: (r.condition_notes as string) ?? null,
          test_request_ids: Array.isArray(r.test_request_ids) ? (r.test_request_ids as string[]) : [],
          referback_from_allocation: (r.referback_from_allocation as boolean) ?? false,
          created_at: (r.created_at as string) ?? undefined,
          updated_at: (r.updated_at as string) ?? undefined,
        }
      })
      setRows(list)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load samples')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    void loadClients()
    void loadIsCodes()
    void loadReceivingOptions()
    void loadRows()
  }, [])

  const handleNew = async () => {
    setSaveMessage(null)
    setEditingId(null)
    setClientReferencesFile(null)
    const next = emptySampleReceivingForm()
    next.srfNumber = await generateNextSrfNumber()
    const tent = addDays(next.dateOfSampleReceiving, 10)
    next.tentativeDateRequired = tent
    next.tentativeDateByLab = tent
    setForm(next)
    setActiveTab('details')
    setShowForm(true)
  }

  const handleClear = () => {
    setForm(emptySampleReceivingForm())
    setClientReferencesFile(null)
    setSaveMessage(null)
  }

  const rowToForm = (row: SampleRow): FormType => ({
    srfNumber: row.srf_number ?? '',
    dateOfSampleReceiving: row.date_of_sample_receiving?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    customerId: row.client_id ?? '',
    testReportAsPerIsId: row.test_report_is_code_id ?? '',
    clientReference: row.client_reference ?? '',
    sampleQuantity: row.sample_quantity ?? '',
    sampleCode: row.sample_code ?? '',
    sampleQrCode: row.sample_qr_code ?? '',
    shelfLife: row.shelf_life ?? '',
    testRequired: row.test_required ?? '',
    batchNumber: row.batch_number ?? '',
    dateOfManufacturing: row.date_of_manufacturing?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    bisSeal: row.bis_seal ?? false,
    ioSignature: row.io_signature ?? false,
    sampleDescription: row.sample_description ?? row.description ?? '',
    sampleDeclaration: row.sample_declaration ?? '',
    anyOtherInformation: row.any_other_information ?? '',
    modeOfDisposal: row.mode_of_disposal ?? '',
    natureOfSample: row.nature_of_sample ?? '',
    statementConformityRequired: row.statement_conformity_required ?? false,
    witnessTestRequired: row.witness_test_required ?? false,
    competentPersonAvailable: row.competent_person_available ?? true,
    equipmentAvailable: row.equipment_available ?? true,
    canCompleteWithinTime: row.can_complete_within_time ?? true,
    deviationFromMethods: row.deviation_from_methods ?? false,
    supportingDocsRequired: row.supporting_docs_required ?? false,
    decisionRuleApplied: row.decision_rule_applied ?? false,
    testingMethodAvailable: row.testing_method_available ?? true,
    samplingProcedureRef: row.sampling_procedure_ref ?? true,
    tentativeDateRequired: row.tentative_date_required?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    tentativeDateByLab: row.tentative_date_by_lab?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    sampleReceivingStatus: row.sample_receiving_status ?? '',
    clientReferencesPath: row.client_references_path ?? '',
  })

  const handleEdit = (row: SampleRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm(rowToForm(row))
    setClientReferencesFile(null)
    setActiveTab('details')
    setShowForm(true)
  }

  const handleCopy = (row: SampleRow) => {
    setSaveMessage(null)
    setEditingId(null)
    const base = rowToForm(row)
    base.srfNumber = ''
    base.sampleCode = ''
    base.clientReferencesPath = ''
    setForm(base)
    setClientReferencesFile(null)
    setActiveTab('details')
    setShowForm(true)
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const isNew = !editingId
        let srfNumber = form.srfNumber.trim()
        if (isNew && !srfNumber) srfNumber = await generateNextSrfNumber()
        let clientRefPath: string | null = form.clientReferencesPath || null
        if (clientReferencesFile) {
          const ext = clientReferencesFile.name.split('.').pop() || 'bin'
          const path = `${editingId || crypto.randomUUID()}/${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, clientReferencesFile, { upsert: true })
          if (upErr) throw upErr
          clientRefPath = path
        }
        const payload = {
          ...(isNew ? { srf_number: srfNumber || null } : {}),
          date_of_sample_receiving: form.dateOfSampleReceiving.trim() ? form.dateOfSampleReceiving : null,
          client_id: form.customerId.trim() || null,
          test_report_is_code_id: form.testReportAsPerIsId.trim() || null,
          client_reference: normalizeText(form.clientReference) || null,
          sample_quantity: normalizeText(form.sampleQuantity) || null,
          sample_code: normalizeText(form.sampleCode) || null,
          sample_qr_code: normalizeText(form.sampleQrCode) || null,
          shelf_life: normalizeText(form.shelfLife) || null,
          test_required: normalizeText(form.testRequired) || null,
          batch_number: normalizeText(form.batchNumber) || null,
          date_of_manufacturing: form.dateOfManufacturing.trim() ? form.dateOfManufacturing : null,
          bis_seal: form.bisSeal,
          io_signature: form.ioSignature,
          sample_description: normalizeText(form.sampleDescription) || null,
          description: normalizeText(form.sampleDescription) || null,
          sample_declaration: normalizeText(form.sampleDeclaration) || null,
          any_other_information: normalizeText(form.anyOtherInformation) || null,
          mode_of_disposal: normalizeText(form.modeOfDisposal) || null,
          nature_of_sample: normalizeText(form.natureOfSample) || null,
          statement_conformity_required: form.statementConformityRequired,
          witness_test_required: form.witnessTestRequired,
          competent_person_available: form.competentPersonAvailable,
          equipment_available: form.equipmentAvailable,
          can_complete_within_time: form.canCompleteWithinTime,
          deviation_from_methods: form.deviationFromMethods,
          supporting_docs_required: form.supportingDocsRequired,
          decision_rule_applied: form.decisionRuleApplied,
          testing_method_available: form.testingMethodAvailable,
          sampling_procedure_ref: form.samplingProcedureRef,
          tentative_date_required: form.tentativeDateRequired.trim() ? form.tentativeDateRequired : null,
          tentative_date_by_lab: form.tentativeDateByLab.trim() ? form.tentativeDateByLab : null,
          sample_receiving_status: normalizeText(form.sampleReceivingStatus) || null,
          client_references_path: clientRefPath,
          stage: STAGE,
          status: form.sampleReceivingStatus.trim() || 'registered',
          ...(editingId ? { referback_from_allocation: false } : {}),
        }
        if (editingId) {
          const { error } = await supabase.from('samples').update(payload).eq('id', editingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('samples').insert({ ...payload, srf_number: srfNumber || null })
          if (error) throw error
        }
        setSaveMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        setClientReferencesFile(null)
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [r.srf_number, r.sample_code, r.client_name, r.sample_description, r.description].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  useEffect(() => { setPage(1); setJumpTo('') }, [search, pageSize])
  const pagedRows = useMemo(() => filteredRows.slice((page - 1) * pageSize, page * pageSize), [filteredRows, page, pageSize])

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
      pagedRows.forEach((r) => (checked ? next.add(r.id) : next.delete(r.id)))
      return next
    })
  }
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const buildPrintHtml = (list: SampleRow[]) => {
    const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const rowsHtml = list.map((r) => `<tr><td>${esc(r.srf_number ?? '')}</td><td>${esc(r.date_of_sample_receiving ?? '')}</td><td>${esc(r.client_name ?? '')}</td><td>${esc(r.sample_code ?? '')}</td><td>${esc(r.sample_qr_code ?? '')}</td><td>${esc(r.sample_description ?? '')}</td><td>${esc(r.tentative_date_required ?? '')}</td><td>${esc(r.tentative_date_by_lab ?? '')}</td><td>${esc(r.sample_receiving_status ?? '')}</td></tr>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"/><title>Sample Receiving</title><style>body{font-family:ui-sans-serif,sans-serif;padding:18px;}table{border-collapse:collapse;width:100%;font-size:12px;}th,td{border:1px solid #cbd5e1;padding:8px;}th{background:#f1f5f9;}</style></head><body><h1>Sample Receiving</h1><table><thead><tr><th>SRF Number</th><th>Date</th><th>Customer</th><th>Sample Code</th><th>QR Code</th><th>Description</th><th>By Customer</th><th>By Lab</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`
  }

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) { document.body.removeChild(iframe); return }
    doc.open()
    doc.write(buildPrintHtml(exportRows))
    doc.close()
    iframe.onload = () => { win.print(); setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 500) }
  }

  return (
    <div className="p-6 space-y-5">
      <SampleReceivingHeaderBar search={search} onSearchChange={setSearch} pageSize={pageSize} onPageSizeChange={(s) => { setPageSize(s); setPage(1) }} onNew={handleNew} />
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="w-[62.5vw] max-w-[62.5vw] max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Receive New Sample</DialogTitle>
          </DialogHeader>
          {saveMessage && <div className="text-sm text-destructive">{saveMessage}</div>}
          <SampleReceivingForm
            form={form}
            onChange={setForm}
            onSave={handleSave}
            onClear={handleClear}
            onGoToReview={() => setActiveTab('review')}
            canSave={canSave}
            saveLoading={saveLoading}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            clientOptions={clientOptions}
            isCodeOptions={isCodeOptions}
            testRequiredOptions={receivingOptions.test_required}
            modeOfDisposalOptions={receivingOptions.mode_of_disposal}
            natureOfSampleOptions={receivingOptions.nature_of_sample}
            sampleReceivingStatusOptions={[
              'Received',
              'Under Review',
              'Rejected',
              'Returned',
              ...receivingOptions.sample_receiving_status.map((o) => o.label).filter((l) => !['Received', 'Under Review', 'Rejected', 'Returned'].includes(l)),
            ]}
            onAddClient={() => setAddClientOpen(true)}
            onAddIsCode={() => setAddIsCodeOpen(true)}
            onFileSelect={setClientReferencesFile}
            clientReferencesFileName={clientReferencesFile?.name}
            onDateOfSampleReceivingChange={async (newDate) => {
              const srf = await generateNextSrfNumber(newDate)
              const tent = addDays(newDate, 10)
              setForm((prev) => ({
                ...prev,
                dateOfSampleReceiving: newDate,
                srfNumber: srf,
                tentativeDateRequired: tent,
                tentativeDateByLab: tent,
              }))
            }}
            onAddReceivingOption={onAddReceivingOption}
            onDeleteReceivingOption={onDeleteReceivingOption}
          />
        </DialogContent>
      </Dialog>
      <SampleReceivingTable rows={pagedRows} loading={listLoading} error={listError} selectedIds={selectedIds} onToggle={toggleRow} onToggleAll={toggleAllOnPage} onEdit={handleEdit} onCopy={handleCopy} />
      <SampleReceivingTableFooterBar message={saveMessage} loading={saveLoading} selectedCount={selectedIds.size} onPrintSelected={handlePrintSelected} page={page} pageCount={pageCount} onPrevPage={() => setPage((p) => Math.max(1, p - 1))} onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))} jumpTo={jumpTo} onJumpToChange={setJumpTo} onJumpToGo={() => { const n = Number(jumpTo); if (Number.isFinite(n) && n > 0) setPage(Math.min(pageCount, Math.max(1, Math.floor(n)))); setJumpTo('') }} />
      <AddClientDialog
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onSaved={(id) => {
          void loadClients()
          setForm((prev) => ({ ...prev, customerId: id }))
        }}
      />
      <AddIsCodeDialog
        open={addIsCodeOpen}
        onOpenChange={setAddIsCodeOpen}
        onSaved={(id) => {
          void loadIsCodes()
          setForm((prev) => ({ ...prev, testReportAsPerIsId: id }))
        }}
      />
    </div>
  )
}
