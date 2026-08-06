/** Certificate Preparation draft stored on calibration_jobs.certificate_draft */

export type CertificateDraftPayload = {
  version: 1
  srfNumber: string
  certificateNumber: string
  ulrNumber: string
  formatNumber: string
  customerName: string
  customerAddress: string
  customerContactDetails: string
  issueDate: string
  pageNumber: string
  workInstructionNumber: string
  dateOfCalibration: string
  dueDateOfCalibration: string
  notes: string
  remarks: string
  /** Summary lines shown above Notes on the certificate. */
  maxZeroReadingObserved: string
  maxRelativeZeroError: string
  uncertaintyReported: string
  updatedAt: string | null
}

export const EMPTY_CERTIFICATE_DRAFT: CertificateDraftPayload = {
  version: 1,
  srfNumber: '',
  certificateNumber: '',
  ulrNumber: '',
  formatNumber: '',
  customerName: '',
  customerAddress: '',
  customerContactDetails: '',
  issueDate: '',
  pageNumber: '01 of 02',
  workInstructionNumber: '',
  dateOfCalibration: '',
  dueDateOfCalibration: '',
  notes: '',
  remarks: '',
  maxZeroReadingObserved: '',
  maxRelativeZeroError: '',
  uncertaintyReported: '',
  updatedAt: null,
}

/** Default certificate notes language (editable on the draft). */
export const DEFAULT_CERTIFICATE_NOTES = [
  '1. Maximum permissible values for the given class of machine range for Indication, Repeatability, Resolution & Zero Errors are as per Table 2 of IS 1828 Part 1.',
  '2. General Inspection of machine carried out as per Annex A of IS 1828 Part - 1 : No anomalies were found.',
  '3. The customer does not have requirement of conformity statement, so not mentioned.',
  '4. The lower limit of the machine for the given range = 2 kN (Resolution x 200)',
  '5. This machine is calibrated in one mode as it has two work areas with common force application & indicating device.',
].join('\n')

/** Default Other Remarks language (editable on the draft). */
export const DEFAULT_CERTIFICATE_REMARKS = [
  '1) The above Calibration is done at the Site of Customer.',
  '2) The Calibration Results reported are valid at the time of & under the stated conditions of measurement & is only for the Calibrated item as identified in the certificate.',
  '3) Calibration Certificate shall not be reproduced except in full, without written approval of QUALITY INTERNATIONAL.',
  '4) MU Indicates expanded measurement of uncertainty at 95% confidence level with coverage factor K=2.',
  '5) Used standard equipments are traceable to National / International standards.',
].join('\n')

function str(row: Record<string, unknown>, camel: string, snake: string): string {
  return String(row[camel] ?? row[snake] ?? '').trim()
}

function dateStr(row: Record<string, unknown>, camel: string, snake: string): string {
  return str(row, camel, snake).slice(0, 10)
}

export function parseCertificateDraft(raw: unknown): CertificateDraftPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_CERTIFICATE_DRAFT }
  }
  const row = raw as Record<string, unknown>
  const pageRaw = str(row, 'pageNumber', 'page_number')
  return {
    version: 1,
    srfNumber: str(row, 'srfNumber', 'srf_number'),
    certificateNumber: str(row, 'certificateNumber', 'certificate_number'),
    ulrNumber: str(row, 'ulrNumber', 'ulr_number'),
    formatNumber: str(row, 'formatNumber', 'format_number'),
    customerName: str(row, 'customerName', 'customer_name'),
    customerAddress: str(row, 'customerAddress', 'customer_address'),
    customerContactDetails: str(row, 'customerContactDetails', 'customer_contact_details'),
    issueDate: dateStr(row, 'issueDate', 'issue_date'),
    pageNumber: pageRaw || EMPTY_CERTIFICATE_DRAFT.pageNumber,
    workInstructionNumber: str(row, 'workInstructionNumber', 'work_instruction_number'),
    dateOfCalibration: dateStr(row, 'dateOfCalibration', 'date_of_calibration'),
    dueDateOfCalibration: dateStr(row, 'dueDateOfCalibration', 'due_date_of_calibration'),
    notes: String(row.notes ?? ''),
    remarks: String(row.remarks ?? ''),
    maxZeroReadingObserved: str(row, 'maxZeroReadingObserved', 'max_zero_reading_observed'),
    maxRelativeZeroError: str(row, 'maxRelativeZeroError', 'max_relative_zero_error'),
    uncertaintyReported: str(row, 'uncertaintyReported', 'uncertainty_reported'),
    updatedAt:
      row.updatedAt != null
        ? String(row.updatedAt)
        : row.updated_at != null
          ? String(row.updated_at)
          : null,
  }
}

export function serializeCertificateDraft(
  draft: CertificateDraftPayload,
): CertificateDraftPayload {
  return {
    version: 1,
    srfNumber: draft.srfNumber.trim(),
    certificateNumber: draft.certificateNumber.trim(),
    ulrNumber: draft.ulrNumber.trim(),
    formatNumber: draft.formatNumber.trim(),
    customerName: draft.customerName.trim(),
    customerAddress: draft.customerAddress.trim(),
    customerContactDetails: draft.customerContactDetails.trim(),
    issueDate: draft.issueDate.trim().slice(0, 10),
    pageNumber: draft.pageNumber.trim() || EMPTY_CERTIFICATE_DRAFT.pageNumber,
    workInstructionNumber: draft.workInstructionNumber.trim(),
    dateOfCalibration: draft.dateOfCalibration.trim().slice(0, 10),
    dueDateOfCalibration: draft.dueDateOfCalibration.trim().slice(0, 10),
    notes: draft.notes,
    remarks: draft.remarks,
    maxZeroReadingObserved: draft.maxZeroReadingObserved.trim(),
    maxRelativeZeroError: draft.maxRelativeZeroError.trim(),
    uncertaintyReported: draft.uncertaintyReported.trim(),
    updatedAt: new Date().toISOString(),
  }
}

/** Preferred Lab Settings → Prefix names for calibration certificates. */
export const CERTIFICATE_NUMBER_PREFIX_NAMES = [
  'Calibration Certificate',
  'Certificate Number',
  'Calibration Cert',
  'CC',
] as const
