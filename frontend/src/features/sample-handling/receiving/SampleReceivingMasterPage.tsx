import { useEffect, useMemo, useState } from 'react'
import { limsDarkBarGlowStyle, limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { canDeleteSampleHandlingRecords } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteSamplesByIds,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { supabase } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AddClientDialog } from './AddClientDialog'
import { AddIsCodeDialog } from './AddIsCodeDialog'
import { SampleReceivingHeaderBar } from './SampleReceivingHeaderBar'
import { SampleReceivingForm } from './SampleReceivingForm'
import { SampleReceivingTable } from './SampleReceivingTable'
import { SampleReceivingDetailsViewDialog } from './SampleReceivingDetailsViewDialog'
import { SampleReceivingTableFooterBar } from './SampleReceivingFooterBar'
import { buildSampleReceivingAssistantContext } from './buildSampleReceivingAssistantContext'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  isSampleReceivingEditLocked,
  SAMPLE_RECEIVING_EDIT_LOCKED_TITLE,
} from './sampleReceivingEditLock'
import {
  RECEIVING_REPORT_TYPES,
  addDays,
  emptySampleReceivingForm,
  normalizeText,
  type SampleRow,
  type SampleReceivingForm as FormType,
} from '../types'
import { generateNextSrfNumber } from './generateNextSrfNumber'
import { buildSrfPrintHtml } from './buildSrfPrintHtml'
import { outputSrfDocument } from './outputSrfDocument'
import { buildReceivingSrfFromReference, stripReceivingReportSuffix } from './receivingSrfFromReference'
import { fetchSrfPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import {
  sortSampleReceivingRows,
  type SampleReceivingSortKey,
} from './sortSampleReceivingRows'
import { getSampleWorkflowStatusLabel } from '../sampleWorkflowStatus'

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

export default function SampleReceivingMasterPage() {
  const { designation } = useAuth()
  const showDelete = canDeleteSampleHandlingRecords(designation)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Part A temporary unlock — save must re-lock without changing stage or referback. */
  const [editingViaReportPrepUnlock, setEditingViaReportPrepUnlock] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [activeTab, setActiveTab] = useState('details')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SampleReceivingSortKey>('srfDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
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
  const [sampleIdsInAllocation, setSampleIdsInAllocation] = useState<Set<string>>(() => new Set())
  const [detailsViewRow, setDetailsViewRow] = useState<SampleRow | null>(null)

  const isNewReport = form.receivingReportType === RECEIVING_REPORT_TYPES[0]
  const canSave =
    !saveLoading &&
    (normalizeText(form.sampleCode).length > 0 || form.customerId.trim().length > 0) &&
    (isNewReport || !!editingId || normalizeText(form.referencedSrfNumber).length > 0)

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
        label: formatIsCodeLabelFromParts(r.is_number, r.revision_year) || r.id,
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

  const onUpdateReceivingOption = async (category: string, id: string, label: string) => {
    const { error } = await supabase
      .from('sample_receiving_options')
      .update({ label: label.trim() })
      .eq('id', id)
      .eq('category', category)
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
      const [samplesResult, allocationResult] = await Promise.all([
        supabase
          .from('samples')
          .select('*, clients(company_name)')
          .order('date_of_sample_receiving', { ascending: false, nullsFirst: false })
          .order('srf_number', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase.from('sample_allocations').select('sample_id'),
      ])

      const { data, error } = samplesResult
      if (error) throw error

      const allocRows = Array.isArray(allocationResult.data) ? allocationResult.data : []
      setSampleIdsInAllocation(
        new Set(
          allocRows
            .map((r) => String((r as { sample_id?: unknown }).sample_id ?? '').trim())
            .filter((id) => id.length > 0),
        ),
      )

      const list = (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => {
        const clients = r.clients as { company_name?: string } | null
        return {
          id: r.id as string,
          srf_number: (r.srf_number as string) ?? null,
          referenced_srf_number: (r.referenced_srf_number as string) ?? null,
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
          receiving_report_type: (r.receiving_report_type as string) ?? null,
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
          sample_receiving_edit_unlocked: (r.sample_receiving_edit_unlocked as boolean) ?? false,
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
    setEditingViaReportPrepUnlock(false)
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
    referencedSrfNumber:
      row.referenced_srf_number ?? stripReceivingReportSuffix(row.srf_number ?? ''),
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
    receivingReportType: row.receiving_report_type ?? 'New Report',
    clientReferencesPath: row.client_references_path ?? '',
  })

  const handleEdit = (row: SampleRow) => {
    if (isSampleReceivingEditLocked(row, sampleIdsInAllocation)) {
      setSaveMessage(SAMPLE_RECEIVING_EDIT_LOCKED_TITLE)
      return
    }
    setSaveMessage(null)
    setEditingId(row.id)
    setEditingViaReportPrepUnlock(Boolean(row.sample_receiving_edit_unlocked))
    setForm(rowToForm(row))
    setClientReferencesFile(null)
    setActiveTab('details')
    setShowForm(true)
  }

  const handleReportTypeChange = (reportType: string) => {
    void (async () => {
      if (reportType === RECEIVING_REPORT_TYPES[0]) {
        const srf = await generateNextSrfNumber(form.dateOfSampleReceiving)
        setForm((prev) => ({
          ...prev,
          receivingReportType: reportType,
          referencedSrfNumber: '',
          srfNumber: srf,
        }))
      } else {
        setForm((prev) => {
          const base =
            stripReceivingReportSuffix(prev.referencedSrfNumber) ||
            stripReceivingReportSuffix(prev.srfNumber)
          return {
            ...prev,
            receivingReportType: reportType,
            referencedSrfNumber: base,
            srfNumber: base ? buildReceivingSrfFromReference(base, reportType) : '',
          }
        })
      }
    })()
  }

  const handleSelectReferencedSrf = (sampleId: string) => {
    const row = rows.find((r) => r.id === sampleId)
    if (!row) return
    const base = stripReceivingReportSuffix(row.srf_number ?? '')
    const filled = rowToForm(row)
    filled.receivingReportType = form.receivingReportType
    filled.referencedSrfNumber = base
    filled.sampleCode = ''
    filled.clientReferencesPath = ''
    filled.srfNumber = buildReceivingSrfFromReference(base, form.receivingReportType)
    setForm(filled)
    setClientReferencesFile(null)
  }

  const handleCopy = (row: SampleRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setEditingViaReportPrepUnlock(false)
    const base = rowToForm(row)
    base.srfNumber = ''
    base.referencedSrfNumber = ''
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
        const reportIsNew = form.receivingReportType === RECEIVING_REPORT_TYPES[0]
        let referencedSrf: string | null = null
        let srfNumber = form.srfNumber.trim()

        if (isNew) {
          if (reportIsNew) {
            if (!srfNumber) srfNumber = await generateNextSrfNumber(form.dateOfSampleReceiving)
          } else {
            const base = stripReceivingReportSuffix(normalizeText(form.referencedSrfNumber))
            if (!base) {
              setSaveMessage('Select a previous SRF number from the search list.')
              setSaveLoading(false)
              return
            }
            referencedSrf = base
            srfNumber = buildReceivingSrfFromReference(base, form.receivingReportType)
          }
        }
        let clientRefPath: string | null = form.clientReferencesPath || null
        if (clientReferencesFile) {
          const ext = clientReferencesFile.name.split('.').pop() || 'bin'
          const path = `${editingId || crypto.randomUUID()}/${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, clientReferencesFile, { upsert: true })
          if (upErr) throw upErr
          clientRefPath = path
        }
        const payload = {
          ...(isNew || reportIsNew ? { srf_number: srfNumber || null } : {}),
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
          receiving_report_type: normalizeText(form.receivingReportType) || null,
          referenced_srf_number: referencedSrf,
          client_references_path: clientRefPath,
        }
        if (isNew) {
          Object.assign(payload, {
            stage: STAGE,
            status: form.sampleReceivingStatus.trim() || 'registered',
          })
        } else if (editingViaReportPrepUnlock) {
          Object.assign(payload, {
            sample_receiving_edit_unlocked: false,
            status: form.sampleReceivingStatus.trim() || 'registered',
          })
        } else {
          Object.assign(payload, {
            stage: STAGE,
            status: form.sampleReceivingStatus.trim() || 'registered',
            referback_from_allocation: false,
          })
        }
        if (editingId) {
          const { error } = await supabase.from('samples').update(payload).eq('id', editingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('samples').insert({ ...payload, srf_number: srfNumber || null })
          if (error) throw error
        }
        setSaveMessage(
          editingViaReportPrepUnlock
            ? 'Saved successfully. Sample Receiving edit is locked again.'
            : 'Saved successfully.',
        )
        setShowForm(false)
        setEditingId(null)
        setEditingViaReportPrepUnlock(false)
        setClientReferencesFile(null)
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const rowsWithIsCode = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        test_report_is_code_label:
          r.test_report_is_code_label ??
          isCodeOptions.find((c) => c.id === r.test_report_is_code_id)?.label ??
          null,
      })),
    [rows, isCodeOptions],
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rowsWithIsCode
    return rowsWithIsCode.filter((r) => {
      const blob = [
        r.srf_number,
        r.sample_code,
        r.client_name,
        r.test_report_is_code_label,
        r.sample_description,
        r.description,
        r.sample_declaration,
        r.any_other_information,
        getSampleWorkflowStatusLabel(r),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [rowsWithIsCode, search])

  const assistantContext = useMemo(
    () =>
      buildSampleReceivingAssistantContext({
        rows: filteredRows,
        search,
        clients: clientOptions,
        isCodes: isCodeOptions,
      }),
    [filteredRows, search, clientOptions, isCodeOptions],
  )

  const sortedRows = useMemo(
    () => sortSampleReceivingRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  )
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  useEffect(() => { setPage(1); setJumpTo('') }, [search, pageSize, sortKey, sortDir])
  const pagedRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize],
  )

  const handleSort = (key: SampleReceivingSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
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
      pagedRows.forEach((r) => (checked ? next.add(r.id) : next.delete(r.id)))
      return next
    })
  }
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const labName = useMemo(() => {
    if (typeof window === 'undefined') return 'Quality International Research & Laboratories Pvt. Ltd.'
    return window.localStorage.getItem('labSettings.labName') || 'Quality International Research & Laboratories Pvt. Ltd.'
  }, [])

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return

    void (async () => {
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const printSettings = await fetchSrfPrintSettings()
        const { headerUrl, footerUrl } = await resolveNamedLetterheadTemplates(
          printSettings.headerTemplateName,
          printSettings.footerTemplateName,
        )
        const html = buildSrfPrintHtml({
          rows: exportRows,
          labName,
          printSettings,
          headerUrl,
          footerUrl,
          filterNote: search.trim() || undefined,
        })
        const filenameBase = exportRows.length === 1 && exportRows[0]?.srf_number
          ? `SRF-${exportRows[0].srf_number}`
          : 'sample-receiving-list'
        await outputSrfDocument(html, filenameBase)
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to print SRF list')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleDeleteSelected = () => {
    const ids = selectedRows.map((r) => r.id)
    if (!confirmDestructiveDelete(ids.length, 'SRF')) return
    void (async () => {
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const count = await deleteSamplesByIds(ids)
        setSelectedIds(new Set())
        setSaveMessage(`Deleted ${count} SRF(s).`)
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <div className={limsPageShellClass}>
      <SampleReceivingHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        onNew={handleNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadRows()}
      />
      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            'left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none',
            'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Sample' : 'Receive New Sample'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-stone-100/90 to-stone-50">
            {saveMessage && (
              <p
                className={cn(
                  'shrink-0 px-4 pt-3 text-sm sm:px-6',
                  saveMessage.toLowerCase().includes('success') || saveMessage.toLowerCase().includes('saved')
                    ? 'text-emerald-700'
                    : 'text-red-700',
                )}
              >
                {saveMessage}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
                editingSampleId={editingId}
                srfSearchRows={rows}
                onReportTypeChange={handleReportTypeChange}
                onSelectReferencedSrf={handleSelectReferencedSrf}
                onDateOfSampleReceivingChange={async (newDate) => {
                  const tent = addDays(newDate, 10)
                  if (form.receivingReportType === RECEIVING_REPORT_TYPES[0]) {
                    const srf = await generateNextSrfNumber(newDate)
                    setForm((prev) => ({
                      ...prev,
                      dateOfSampleReceiving: newDate,
                      srfNumber: srf,
                      tentativeDateRequired: tent,
                      tentativeDateByLab: tent,
                    }))
                  } else {
                    setForm((prev) => ({
                      ...prev,
                      dateOfSampleReceiving: newDate,
                      tentativeDateRequired: tent,
                      tentativeDateByLab: tent,
                    }))
                  }
                }}
                onAddReceivingOption={onAddReceivingOption}
                onUpdateReceivingOption={onUpdateReceivingOption}
                onDeleteReceivingOption={onDeleteReceivingOption}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <SampleReceivingTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
        onViewDetails={setDetailsViewRow}
        sampleIdsInAllocation={sampleIdsInAllocation}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
      <SampleReceivingTableFooterBar
        message={saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
        onPrintSelected={handlePrintSelected}
        showDelete={showDelete}
        onDeleteSelected={handleDeleteSelected}
        page={page}
        pageCount={pageCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (Number.isFinite(n) && n > 0) setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
          setJumpTo('')
        }}
      />
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
      <SampleReceivingDetailsViewDialog
        row={detailsViewRow}
        open={detailsViewRow !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsViewRow(null)
        }}
      />
    </div>
  )
}
