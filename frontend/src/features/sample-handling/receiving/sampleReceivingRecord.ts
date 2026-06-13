import { supabase } from '@/lib/supabaseClient'
import {
  RECEIVING_REPORT_TYPES,
  normalizeText,
  type SampleReceivingForm,
  type SampleRow,
} from '../types'
import { buildReceivingSrfFromReference, stripReceivingReportSuffix } from './receivingSrfFromReference'

const BUCKET = 'sample-client-references'
const STAGE = 'receiving' as const

export function mapSupabaseRowToSampleRow(r: Record<string, unknown>): SampleRow {
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
    test_report_is_code_label: null,
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
}

export function sampleRowToReceivingForm(row: SampleRow): SampleReceivingForm {
  return {
    srfNumber: row.srf_number ?? '',
    referencedSrfNumber:
      row.referenced_srf_number ?? stripReceivingReportSuffix(row.srf_number ?? ''),
    dateOfSampleReceiving:
      row.date_of_sample_receiving?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    customerId: row.client_id ?? '',
    testReportAsPerIsId: row.test_report_is_code_id ?? '',
    clientReference: row.client_reference ?? '',
    sampleQuantity: row.sample_quantity ?? '',
    sampleCode: row.sample_code ?? '',
    sampleQrCode: row.sample_qr_code ?? '',
    shelfLife: row.shelf_life ?? '',
    testRequired: row.test_required ?? '',
    batchNumber: row.batch_number ?? '',
    dateOfManufacturing:
      row.date_of_manufacturing?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
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
    tentativeDateRequired:
      row.tentative_date_required?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    tentativeDateByLab:
      row.tentative_date_by_lab?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    sampleReceivingStatus: row.sample_receiving_status ?? '',
    receivingReportType: row.receiving_report_type ?? 'New Report',
    clientReferencesPath: row.client_references_path ?? '',
  }
}

export async function fetchSampleRowById(sampleId: string): Promise<SampleRow> {
  const id = sampleId.trim()
  if (!id) throw new Error('Missing sample id.')
  const { data, error } = await supabase
    .from('samples')
    .select('*, clients(company_name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Sample not found.')
  return mapSupabaseRowToSampleRow(data as Record<string, unknown>)
}

export async function saveSampleReceivingEdit(input: {
  sampleId: string
  form: SampleReceivingForm
  clientReferencesFile?: File | null
  /** Keep workflow stage when editing from Test Report Preparation / later stages. */
  preserveWorkflowStage: boolean
}): Promise<{ srfNumber: string | null }> {
  const sampleId = input.sampleId.trim()
  const form = input.form
  const reportIsNew = form.receivingReportType === RECEIVING_REPORT_TYPES[0]
  let referencedSrf: string | null = null
  let srfNumber = form.srfNumber.trim()

  if (!reportIsNew) {
    const base = stripReceivingReportSuffix(normalizeText(form.referencedSrfNumber))
    if (!base) {
      throw new Error('Select a previous SRF number from the search list.')
    }
    referencedSrf = base
    srfNumber = buildReceivingSrfFromReference(base, form.receivingReportType)
  }

  let clientRefPath: string | null = form.clientReferencesPath || null
  if (input.clientReferencesFile) {
    const ext = input.clientReferencesFile.name.split('.').pop() || 'bin'
    const path = `${sampleId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, input.clientReferencesFile, { upsert: true })
    if (upErr) throw upErr
    clientRefPath = path
  }

  const payload: Record<string, unknown> = {
    srf_number: srfNumber || null,
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
    status: form.sampleReceivingStatus.trim() || 'registered',
  }

  if (input.preserveWorkflowStage) {
    payload.sample_receiving_edit_unlocked = false
  } else {
    Object.assign(payload, {
      stage: STAGE,
      referback_from_allocation: false,
    })
  }

  const { error } = await supabase.from('samples').update(payload).eq('id', sampleId)
  if (error) throw error

  return { srfNumber: srfNumber || null }
}
