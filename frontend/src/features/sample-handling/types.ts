/** Stage for Sample Handling sub-modules (ISO 17025 Clause 7.4) */
export type SampleStage =
  | 'receiving'
  | 'allocation'
  | 'test_allocation'
  | 'under_testing'
  | 'results_review'
  /** Clause 7.8 — approved results; test report drafted / issued from this stage */
  | 'report_preparation'
  | 'completed'

export type ConditionOnReceipt = 'acceptable' | 'damaged' | 'compromised'

export type SampleRow = {
  id: string
  srf_number: string | null
  date_of_sample_receiving: string | null
  sample_code: string | null
  sample_qr_code: string | null
  client_id: string | null
  client_name: string | null
  client_reference: string | null
  test_report_is_code_id: string | null
  test_report_is_code_label: string | null
  description: string | null
  sample_description: string | null
  matrix: string | null
  received_at: string | null
  received_by: string | null
  sample_quantity: string | null
  shelf_life: string | null
  test_required: string | null
  batch_number: string | null
  date_of_manufacturing: string | null
  bis_seal: boolean | null
  io_signature: boolean | null
  sample_declaration: string | null
  any_other_information: string | null
  mode_of_disposal: string | null
  nature_of_sample: string | null
  statement_conformity_required: boolean | null
  witness_test_required: boolean | null
  competent_person_available: boolean | null
  equipment_available: boolean | null
  can_complete_within_time: boolean | null
  deviation_from_methods: boolean | null
  supporting_docs_required: boolean | null
  decision_rule_applied: boolean | null
  testing_method_available: boolean | null
  sampling_procedure_ref: boolean | null
  tentative_date_required: string | null
  tentative_date_by_lab: string | null
  sample_receiving_status: string | null
  client_references_path: string | null
  collection_date: string | null
  collection_location: string | null
  storage_conditions: string | null
  storage_location: string | null
  status: string | null
  stage: SampleStage | null
  quantity: number | null
  quantity_unit: string | null
  condition_on_receipt: ConditionOnReceipt | null
  condition_notes: string | null
  test_request_ids: string[]
  referback_from_allocation?: boolean
  /** Clause 7.8 — optional; add columns via migration if missing */
  test_report_number?: string | null
  test_report_draft_notes?: string | null
  test_report_issued_at?: string | null
  created_at?: string
  updated_at?: string
}

/** One row per SRF in Sample Allocation table: aggregated section codes, departments, quantities */
export type AllocationRow = {
  sampleId: string
  sample: SampleRow
  sectionCodes: string[]
  departments: string[]
  quantities: string[]
  allocationIds: string[]
}

export type TestAllocationParameterRow = {
  id: string
  testAllocationId: string
  testParameterId: string | null
  testLabel: string
  testStartDate: string | null
  testEndDate: string | null
  results: string | null
}

/** One row per section (sample_allocation) in Test Allocation table */
export type TestAllocationRow = {
  /** Primary key from test_allocations table */
  testAllocationId?: string
  sampleAllocationId: string
  sampleId: string
  sectionCode: string
  isCodeId: string | null
  isCodeLabel: string | null
  srfNumber: string | null
  allocationDate: string | null
  department: string | null
  designation: string | null
  testParameterSummary: string | null
  /** IDs of test parameters (order matches testParameterSummary labels); used for View Test Parameter. */
  testParameterIds: string[]
  assignedEmployeeId: string | null
  assignedEmployeeName: string | null
  /** When true, this section can be edited in the form; otherwise Edit is locked */
  referbackFromAllocation?: boolean
  /** Legacy aggregate Sample Under Testing: test start date (section-level, not per parameter) */
  testStartDate?: string | null
  /** Legacy aggregate Sample Under Testing: results (section-level, not per parameter) */
  results?: string | null
  /** Legacy aggregate Sample Under Testing: test end date (section-level, not per parameter) */
  testEndDate?: string | null
  /** Per-parameter Sample Under Testing values from test_allocation_parameters */
  parameters?: TestAllocationParameterRow[]
}

/** Tab 1: Customer & Sample Details */
export type SampleReceivingFormTab1 = {
  srfNumber: string
  dateOfSampleReceiving: string
  customerId: string
  testReportAsPerIsId: string
  clientReference: string
  sampleQuantity: string
  sampleCode: string
  sampleQrCode: string
  shelfLife: string
  testRequired: string
  batchNumber: string
  dateOfManufacturing: string
  bisSeal: boolean
  ioSignature: boolean
  sampleDescription: string
  sampleDeclaration: string
  anyOtherInformation: string
  modeOfDisposal: string
  natureOfSample: string
}

/** Tab 2: Review */
export type SampleReceivingFormTab2 = {
  statementConformityRequired: boolean
  witnessTestRequired: boolean
  competentPersonAvailable: boolean
  equipmentAvailable: boolean
  canCompleteWithinTime: boolean
  deviationFromMethods: boolean
  supportingDocsRequired: boolean
  decisionRuleApplied: boolean
  testingMethodAvailable: boolean
  samplingProcedureRef: boolean
  tentativeDateRequired: string
  tentativeDateByLab: string
  sampleReceivingStatus: string
  clientReferencesPath: string
}

export type SampleReceivingForm = SampleReceivingFormTab1 & SampleReceivingFormTab2

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const emptySampleReceivingFormTab1 = (): SampleReceivingFormTab1 => ({
  srfNumber: '',
  dateOfSampleReceiving: today(),
  customerId: '',
  testReportAsPerIsId: '',
  clientReference: '',
  sampleQuantity: '',
  sampleCode: '',
  sampleQrCode: '',
  shelfLife: 'Life Long',
  testRequired: '',
  batchNumber: '',
  dateOfManufacturing: today(),
  bisSeal: false,
  ioSignature: false,
  sampleDescription: '',
  sampleDeclaration: '',
  anyOtherInformation: '',
  modeOfDisposal: 'Disposed',
  natureOfSample: 'SS',
})

export const emptySampleReceivingFormTab2 = (): SampleReceivingFormTab2 => ({
  statementConformityRequired: false,
  witnessTestRequired: false,
  competentPersonAvailable: true,
  equipmentAvailable: true,
  canCompleteWithinTime: true,
  deviationFromMethods: false,
  supportingDocsRequired: false,
  decisionRuleApplied: false,
  testingMethodAvailable: true,
  samplingProcedureRef: true,
  tentativeDateRequired: addDays(today(), 10),
  tentativeDateByLab: addDays(today(), 10),
  sampleReceivingStatus: '',
  clientReferencesPath: '',
})

export const emptySampleReceivingForm = (): SampleReceivingForm => ({
  ...emptySampleReceivingFormTab1(),
  ...emptySampleReceivingFormTab2(),
})

export const normalizeText = (value: string) => value.trim()
