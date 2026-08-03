export type CalibrationLocation = 'In Lab' | 'On Site'

export const CALIBRATION_LOCATIONS: CalibrationLocation[] = ['In Lab', 'On Site']

export type ServiceRequestStatus = 'Draft' | 'Under Review' | 'Accepted' | 'Rejected' | 'Closed'

export const SERVICE_REQUEST_STATUSES: ServiceRequestStatus[] = [
  'Draft',
  'Under Review',
  'Accepted',
  'Rejected',
  'Closed',
]

export type PhysicalCondition = '' | 'Ok' | 'Not Ok'
export const PHYSICAL_CONDITIONS: Exclude<PhysicalCondition, ''>[] = ['Ok', 'Not Ok']

export type AccreditationStatus = '' | 'Accredited' | 'Non-Accredited'
export const ACCREDITATION_STATUSES: Exclude<AccreditationStatus, ''>[] = [
  'Accredited',
  'Non-Accredited',
]

/** Yes / No / N/A (null) for ISO review checks. */
export type TriBool = boolean | null

function parseTriBool(raw: unknown): TriBool {
  if (raw === true) return true
  if (raw === false) return false
  return null
}

/** One Yes/No/N/A + Remark row in QI capability / resource evaluation. */
export type EvaluationItem = {
  ok: TriBool
  remark: string
}

export type CapabilityEvaluationKey =
  | 'range_resolution_master'
  | 'accuracy_master'
  | 'cmc_master'
  | 'accreditation_scope'

export type ResourceEvaluationKey =
  | 'competent_manpower'
  | 'equipment_setup'
  | 'availability_standards'
  | 'site_facility'

export type CapabilityEvaluation = Record<CapabilityEvaluationKey, EvaluationItem>
export type ResourceEvaluation = Record<ResourceEvaluationKey, EvaluationItem>

export const CAPABILITY_EVALUATION_ROWS: Array<{
  key: CapabilityEvaluationKey
  label: string
}> = [
  { key: 'range_resolution_master', label: 'Range and Resolution of Master' },
  { key: 'accuracy_master', label: 'Accuracy of Master' },
  { key: 'cmc_master', label: 'CMC of the Master' },
  { key: 'accreditation_scope', label: 'Accreditation for the Scope' },
]

export const RESOURCE_EVALUATION_ROWS: Array<{
  key: ResourceEvaluationKey
  label: string
}> = [
  { key: 'competent_manpower', label: 'Competent Man Power' },
  { key: 'equipment_setup', label: 'Equipment & Set Up' },
  { key: 'availability_standards', label: 'Availability of Standards' },
  { key: 'site_facility', label: 'Site Facility' },
]

export const QI_TERMS_AND_CONDITIONS: string[] = [
  'All instruments submitted for calibration must be in working order.',
  'All possible care will be taken in handling the equipment, but the risk of damage in transit or during calibration must be assumed by customer.',
  'An equipment accepted for calibration may be returned uncalibrated, under circumstances beyond the laboratory.',
  'All the activities falling under accredited scope in no way imply that the equipment calibrated is approved by NABL.',
  'All information obtained from the customer or created during the performance of laboratory activities will be kept confidential; when information is required by NABL or Law, it will be shared keeping the customer informed.',
]

/** Default remark text for each Yes / No / N/A status. */
export const EVALUATION_DEFAULT_REMARKS = {
  yes: 'OK',
  no: 'Not OK',
  na: 'Not Applicable',
} as const

export function remarkForEvaluationOk(ok: TriBool): string {
  if (ok === true) return EVALUATION_DEFAULT_REMARKS.yes
  if (ok === false) return EVALUATION_DEFAULT_REMARKS.no
  return EVALUATION_DEFAULT_REMARKS.na
}

export function isEvaluationDefaultRemark(remark: string): boolean {
  const t = remark.trim()
  return (
    t === '' ||
    t === EVALUATION_DEFAULT_REMARKS.yes ||
    t === EVALUATION_DEFAULT_REMARKS.no ||
    t === EVALUATION_DEFAULT_REMARKS.na
  )
}

function emptyEvaluationItem(): EvaluationItem {
  return { ok: true, remark: EVALUATION_DEFAULT_REMARKS.yes }
}

export function emptyCapabilityEvaluation(): CapabilityEvaluation {
  return {
    range_resolution_master: emptyEvaluationItem(),
    accuracy_master: emptyEvaluationItem(),
    cmc_master: emptyEvaluationItem(),
    accreditation_scope: emptyEvaluationItem(),
  }
}

export function emptyResourceEvaluation(): ResourceEvaluation {
  return {
    competent_manpower: emptyEvaluationItem(),
    equipment_setup: emptyEvaluationItem(),
    availability_standards: emptyEvaluationItem(),
    site_facility: emptyEvaluationItem(),
  }
}

function parseEvaluationItem(raw: unknown): EvaluationItem {
  if (!raw || typeof raw !== 'object') return emptyEvaluationItem()
  const row = raw as Record<string, unknown>
  // Missing `ok` → treat as unset defaults (Yes / OK)
  if (!('ok' in row)) return emptyEvaluationItem()

  const okRaw = row.ok
  const ok: TriBool =
    okRaw === true || okRaw === false
      ? okRaw
      : okRaw === 'yes' || okRaw === 'Yes'
        ? true
        : okRaw === 'no' || okRaw === 'No'
          ? false
          : null

  const remark = String(row.remark ?? '').trim()

  // Legacy unset rows (null + blank/default remark) → default Yes
  if (ok === null && isEvaluationDefaultRemark(remark)) return emptyEvaluationItem()

  return {
    ok,
    remark: remark || remarkForEvaluationOk(ok),
  }
}

export function parseCapabilityEvaluation(raw: unknown): CapabilityEvaluation {
  const base = emptyCapabilityEvaluation()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  for (const { key } of CAPABILITY_EVALUATION_ROWS) {
    base[key] = parseEvaluationItem(obj[key])
  }
  return base
}

export function parseResourceEvaluation(raw: unknown): ResourceEvaluation {
  const base = emptyResourceEvaluation()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  for (const { key } of RESOURCE_EVALUATION_ROWS) {
    base[key] = parseEvaluationItem(obj[key])
  }
  return base
}

export function serializeEvaluationMap(
  map: CapabilityEvaluation | ResourceEvaluation,
): Record<string, { ok: boolean | null; remark: string }> {
  const out: Record<string, { ok: boolean | null; remark: string }> = {}
  for (const [key, item] of Object.entries(map)) {
    out[key] = {
      ok: item.ok,
      remark: normalizeText(item.remark),
    }
  }
  return out
}

export type ServiceRequestRow = {
  id: string
  srf_number: string
  srf_date: string
  client_id: string | null
  client_name: string | null
  customer_reference_no: string | null
  customer_reference_date: string | null
  calibration_location: string
  equipment_description: string | null
  quantity: number
  customer_required_date: string | null
  required_completion_date: string | null
  customer_document_path: string | null
  customer_document_name: string | null
  contact_person: string | null
  contact_number_mail: string | null
  physical_condition: string | null
  calibration_method_choice: string | null
  invoice_no: string | null
  invoice_date: string | null
  special_instruction: string | null
  witness_required: boolean
  witness_activity: string | null
  accreditation_status: string | null
  terms_accepted: boolean
  capability_evaluation: CapabilityEvaluation | Record<string, unknown> | null
  resource_evaluation: ResourceEvaluation | Record<string, unknown> | null
  req_defined_understood: boolean | null
  capability_resources_ok: boolean | null
  external_provider_used: boolean | null
  external_provider_customer_approved: boolean | null
  external_provider_details: string | null
  methods_selected_ok: boolean | null
  method_notes: string | null
  method_outdated_customer_informed: boolean | null
  statement_of_conformity_requested: boolean
  specification_standard: string | null
  decision_rule: string | null
  differences_resolved: boolean | null
  contract_accepted: boolean | null
  deviations_customer_informed: boolean | null
  review_remarks: string | null
  status: string
  created_at?: string
  updated_at?: string
}

export type ServiceRequestForm = {
  srfNumber: string
  srfDate: string
  clientId: string
  clientName: string
  customerReferenceNo: string
  customerReferenceDate: string
  calibrationLocation: CalibrationLocation
  equipmentDescription: string
  quantity: string
  customerRequiredDate: string
  requiredCompletionDate: string
  customerDocumentPath: string
  customerDocumentName: string
  contactPerson: string
  contactNumberMail: string
  physicalCondition: PhysicalCondition
  invoiceNo: string
  invoiceDate: string
  specialInstruction: string
  witnessRequired: boolean
  witnessActivity: string
  accreditationStatus: AccreditationStatus
  termsAccepted: boolean
  capabilityEvaluation: CapabilityEvaluation
  resourceEvaluation: ResourceEvaluation
  reqDefinedUnderstood: TriBool
  capabilityResourcesOk: TriBool
  externalProviderUsed: TriBool
  externalProviderCustomerApproved: TriBool
  externalProviderDetails: string
  methodsSelectedOk: TriBool
  methodNotes: string
  methodOutdatedCustomerInformed: TriBool
  statementOfConformityRequested: boolean
  specificationStandard: string
  decisionRule: string
  differencesResolved: TriBool
  contractAccepted: boolean
  deviationsCustomerInformed: TriBool
  reviewRemarks: string
  status: ServiceRequestStatus
}

export function emptyServiceRequestForm(): ServiceRequestForm {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const srfDate = `${yyyy}-${mm}-${dd}`
  const dueDate = defaultDueDateFromSrf(srfDate)
  return {
    srfNumber: '',
    srfDate,
    clientId: '',
    clientName: '',
    customerReferenceNo: '',
    customerReferenceDate: '',
    calibrationLocation: 'In Lab',
    equipmentDescription: '',
    quantity: '1',
    customerRequiredDate: dueDate,
    requiredCompletionDate: dueDate,
    customerDocumentPath: '',
    customerDocumentName: '',
    contactPerson: '',
    contactNumberMail: '',
    physicalCondition: '',
    invoiceNo: '',
    invoiceDate: '',
    specialInstruction: '',
    witnessRequired: false,
    witnessActivity: '',
    accreditationStatus: 'Accredited',
    termsAccepted: false,
    capabilityEvaluation: emptyCapabilityEvaluation(),
    resourceEvaluation: emptyResourceEvaluation(),
    reqDefinedUnderstood: true,
    capabilityResourcesOk: true,
    externalProviderUsed: false,
    externalProviderCustomerApproved: null,
    externalProviderDetails: '',
    methodsSelectedOk: true,
    methodNotes: '',
    methodOutdatedCustomerInformed: null,
    statementOfConformityRequested: false,
    specificationStandard: '',
    decisionRule: '',
    differencesResolved: true,
    contractAccepted: true,
    deviationsCustomerInformed: true,
    reviewRemarks: '',
    status: 'Under Review',
  }
}

export function normalizeText(value: string): string {
  return value.trim()
}

/** Add calendar days to an ISO date `YYYY-MM-DD`. Returns '' if invalid. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const raw = isoDate.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const [y, m, d] = raw.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  if (Number.isNaN(dt.getTime())) return ''
  dt.setDate(dt.getDate() + days)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Default due dates = SRF date + 10 days. */
export const SRF_DEFAULT_DUE_DAYS = 10

export function defaultDueDateFromSrf(srfDate: string): string {
  return addDaysToIsoDate(srfDate, SRF_DEFAULT_DUE_DAYS)
}

/** Next SRF number: SRF-YYYY-0001 */
export function nextSrfNumber(existing: string[], year = new Date().getFullYear()): string {
  const prefix = `SRF-${year}-`
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i')
  let max = 0
  for (const code of existing) {
    const m = code.trim().match(re)
    if (!m) continue
    const n = Number.parseInt(m[1]!, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function rowToForm(row: ServiceRequestRow, asCopy = false, nextNumber = ''): ServiceRequestForm {
  return {
    srfNumber: asCopy ? nextNumber : (row.srf_number ?? ''),
    srfDate: row.srf_date?.slice(0, 10) ?? emptyServiceRequestForm().srfDate,
    clientId: row.client_id ?? '',
    clientName: row.client_name ?? '',
    customerReferenceNo: row.customer_reference_no ?? '',
    customerReferenceDate: row.customer_reference_date?.slice(0, 10) ?? '',
    calibrationLocation: (row.calibration_location as CalibrationLocation) || 'In Lab',
    equipmentDescription: row.equipment_description ?? '',
    quantity: String(row.quantity ?? 1),
    customerRequiredDate: row.customer_required_date?.slice(0, 10) ?? '',
    requiredCompletionDate: row.required_completion_date?.slice(0, 10) ?? '',
    customerDocumentPath: asCopy ? '' : (row.customer_document_path ?? ''),
    customerDocumentName: asCopy ? '' : (row.customer_document_name ?? ''),
    contactPerson: row.contact_person ?? '',
    contactNumberMail: row.contact_number_mail ?? '',
    physicalCondition: (row.physical_condition as PhysicalCondition) || '',
    invoiceNo: row.invoice_no ?? '',
    invoiceDate: row.invoice_date?.slice(0, 10) ?? '',
    specialInstruction: row.special_instruction ?? '',
    witnessRequired: Boolean(row.witness_required),
    witnessActivity: row.witness_activity ?? '',
    accreditationStatus: (row.accreditation_status as AccreditationStatus) || 'Accredited',
    termsAccepted: Boolean(row.terms_accepted),
    capabilityEvaluation: parseCapabilityEvaluation(row.capability_evaluation),
    resourceEvaluation: parseResourceEvaluation(row.resource_evaluation),
    reqDefinedUnderstood: parseTriBool(row.req_defined_understood),
    capabilityResourcesOk: parseTriBool(row.capability_resources_ok),
    externalProviderUsed: parseTriBool(row.external_provider_used),
    externalProviderCustomerApproved: parseTriBool(row.external_provider_customer_approved),
    externalProviderDetails: row.external_provider_details ?? '',
    methodsSelectedOk: parseTriBool(row.methods_selected_ok),
    methodNotes: row.method_notes ?? '',
    methodOutdatedCustomerInformed: parseTriBool(row.method_outdated_customer_informed),
    statementOfConformityRequested: Boolean(row.statement_of_conformity_requested),
    specificationStandard: row.specification_standard ?? '',
    decisionRule: row.decision_rule ?? '',
    differencesResolved: parseTriBool(row.differences_resolved),
    contractAccepted: Boolean(row.contract_accepted),
    deviationsCustomerInformed: parseTriBool(row.deviations_customer_informed),
    reviewRemarks: row.review_remarks ?? '',
    status: (row.status as ServiceRequestStatus) || 'Under Review',
  }
}

export function formToPayload(form: ServiceRequestForm) {
  const qty = Number.parseInt(form.quantity, 10)
  return {
    srf_number: normalizeText(form.srfNumber),
    srf_date: form.srfDate || null,
    client_id: form.clientId || null,
    client_name: normalizeText(form.clientName) || null,
    customer_reference_no: normalizeText(form.customerReferenceNo) || null,
    customer_reference_date: form.customerReferenceDate || null,
    calibration_location: form.calibrationLocation,
    equipment_description: normalizeText(form.equipmentDescription) || null,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    customer_required_date: form.customerRequiredDate || null,
    required_completion_date: form.requiredCompletionDate || null,
    customer_document_path: form.customerDocumentPath || null,
    customer_document_name: normalizeText(form.customerDocumentName) || null,
    contact_person: normalizeText(form.contactPerson) || null,
    contact_number_mail: normalizeText(form.contactNumberMail) || null,
    physical_condition: form.physicalCondition || null,
    calibration_method_choice: null,
    invoice_no: normalizeText(form.invoiceNo) || null,
    invoice_date: form.invoiceDate || null,
    special_instruction: normalizeText(form.specialInstruction) || null,
    witness_required: form.witnessRequired,
    witness_activity: normalizeText(form.witnessActivity) || null,
    accreditation_status: form.accreditationStatus || null,
    terms_accepted: form.termsAccepted,
    capability_evaluation: serializeEvaluationMap(form.capabilityEvaluation),
    resource_evaluation: serializeEvaluationMap(form.resourceEvaluation),
    req_defined_understood: form.reqDefinedUnderstood,
    capability_resources_ok: form.capabilityResourcesOk,
    external_provider_used: form.externalProviderUsed,
    external_provider_customer_approved: form.externalProviderCustomerApproved,
    external_provider_details: normalizeText(form.externalProviderDetails) || null,
    methods_selected_ok: form.methodsSelectedOk,
    method_notes: normalizeText(form.methodNotes) || null,
    method_outdated_customer_informed: form.methodOutdatedCustomerInformed,
    statement_of_conformity_requested: form.statementOfConformityRequested,
    specification_standard: normalizeText(form.specificationStandard) || null,
    decision_rule: normalizeText(form.decisionRule) || null,
    differences_resolved: form.differencesResolved,
    contract_accepted: form.contractAccepted,
    deviations_customer_informed: form.deviationsCustomerInformed,
    review_remarks: normalizeText(form.reviewRemarks) || null,
    status: form.status,
  }
}
