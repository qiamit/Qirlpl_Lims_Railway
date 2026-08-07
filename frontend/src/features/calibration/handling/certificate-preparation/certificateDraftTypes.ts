/** Certificate Preparation draft stored on calibration_jobs.certificate_draft */

export type CertificateDraftPayload = {
  version: 1
  srfNumber: string
  certificateNumber: string
  ulrNumber: string
  formatNumber: string
  customerName: string
  customerAddress: string
  /** Combined contact lines (legacy / print fallback). */
  customerContactDetails: string
  customerContactPerson: string
  customerMobile: string
  customerEmail: string
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
  calibratedByDesignation: string
  calibratedByName: string
  authorizedSignatoryDesignation: string
  authorizedSignatoryName: string
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
  customerContactPerson: '',
  customerMobile: '',
  customerEmail: '',
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
  calibratedByDesignation: '',
  calibratedByName: '',
  authorizedSignatoryDesignation: '',
  authorizedSignatoryName: '',
  updatedAt: null,
}

/** Compose legacy multi-line contact block from person / mobile / email. */
export function composeCustomerContactDetails(parts: {
  person?: string
  mobile?: string
  email?: string
}): string {
  const person = (parts.person ?? '').trim()
  const mobile = (parts.mobile ?? '').trim()
  const email = (parts.email ?? '').trim()
  const lines: string[] = []
  if (person && mobile) lines.push(`${person} - ${mobile}`)
  else if (person) lines.push(person)
  else if (mobile) lines.push(mobile)
  if (email && email !== mobile) lines.push(email)
  return lines.join('\n')
}

/** Split legacy contact block when structured fields are empty. */
export function parseCustomerContactDetails(raw: string): {
  person: string
  mobile: string
  email: string
} {
  const text = raw.trim()
  if (!text) return { person: '', mobile: '', email: '' }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let person = ''
  let mobile = ''
  let email = ''
  for (const line of lines) {
    const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    if (emailMatch && !email) {
      email = emailMatch[0]
      const rest = line.replace(emailMatch[0], '').replace(/[-–—|/·,]+/g, ' ').trim()
      if (rest && !person) {
        const dash = rest.match(/^(.+?)\s*[-–—]\s*(.+)$/)
        if (dash) {
          person = dash[1]!.trim()
          mobile = dash[2]!.trim()
        } else if (/^\+?[\d\s()-]{6,}$/.test(rest)) {
          mobile = rest
        } else {
          person = rest
        }
      }
      continue
    }
    if (!person) {
      const dash = line.match(/^(.+?)\s*[-–—]\s*(.+)$/)
      if (dash) {
        person = dash[1]!.trim()
        mobile = dash[2]!.trim()
      } else if (/^\+?[\d\s()-]{6,}$/.test(line)) {
        mobile = line
      } else {
        person = line
      }
    } else if (!mobile && /^\+?[\d\s()-]{6,}$/.test(line)) {
      mobile = line
    } else if (!email) {
      email = line
    }
  }
  return { person, mobile, email }
}

/** Default certificate notes language (editable on the draft). */
export const CERTIFICATE_NOTES_MIN_LOAD_TOKEN = '{{MIN_LOAD}}'

export const DEFAULT_CERTIFICATE_NOTES = [
  '1. Maximum permissible values for the given class of machine range for Indication, Repeatability, Resolution & Zero Errors are as per Table 2 of IS 1828 Part 1.',
  '2. General Inspection of machine carried out as per Annex A of IS 1828 Part - 1 : No anomalies were found.',
  '3. The customer does not have requirement of conformity statement, so not mentioned.',
  `4. The lower limit of the machine for the given range = ${CERTIFICATE_NOTES_MIN_LOAD_TOKEN} (Resolution x 200)`,
  '5. This machine is calibrated in one mode as it has two work areas with common force application & indicating device.',
].join('\n')

/**
 * Fill Note 4 lower-limit load from Raw Data Sheet minimum Load column value.
 * Replaces `{{MIN_LOAD}}` and the common "… = <value> (Resolution x 200)" clause.
 */
export function applyCertificateNotesMinLoad(
  notes: string,
  minLoadDisplay: string | null | undefined,
): string {
  const fill = String(minLoadDisplay ?? '').trim()
  if (!fill || !notes) return notes
  let next = notes.replace(/\{\{\s*MIN_LOAD\s*\}\}/gi, fill)
  next = next.replace(
    /(lower limit of the machine for the given range\s*=\s*)[^\n(]+?(\s*\(Resolution\s*x\s*200\))/i,
    `$1${fill}$2`,
  )
  return next
}

/** Keep Note 4 load as `{{MIN_LOAD}}` so certificate draft can fill from Raw Data. */
export function ensureCertificateNotesMinLoadToken(notes: string): string {
  if (!notes) return notes
  let next = notes
  if (!/\{\{\s*MIN_LOAD\s*\}\}/i.test(next)) {
    next = next.replace(
      /(lower limit of the machine for the given range\s*=\s*)[^\n(]+?(\s*\(Resolution\s*x\s*200\))/i,
      `$1${CERTIFICATE_NOTES_MIN_LOAD_TOKEN}$2`,
    )
  }
  return next
}

export function formatCertificateMinLoadDisplay(
  min: number,
  unit: string,
): string {
  const u = unit.trim() || 'kN'
  const fmt = Number.isInteger(min) ? String(min) : String(Number(min.toFixed(2)))
  return `${fmt} ${u}`
}

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
  const contactDetails = str(row, 'customerContactDetails', 'customer_contact_details')
  let person = str(row, 'customerContactPerson', 'customer_contact_person')
  let mobile = str(row, 'customerMobile', 'customer_mobile')
  let email = str(row, 'customerEmail', 'customer_email')
  if (!person && !mobile && !email && contactDetails) {
    const parsed = parseCustomerContactDetails(contactDetails)
    person = parsed.person
    mobile = parsed.mobile
    email = parsed.email
  }
  return {
    version: 1,
    srfNumber: str(row, 'srfNumber', 'srf_number'),
    certificateNumber: str(row, 'certificateNumber', 'certificate_number'),
    ulrNumber: str(row, 'ulrNumber', 'ulr_number'),
    formatNumber: str(row, 'formatNumber', 'format_number'),
    customerName: str(row, 'customerName', 'customer_name'),
    customerAddress: str(row, 'customerAddress', 'customer_address'),
    customerContactDetails:
      contactDetails ||
      composeCustomerContactDetails({ person, mobile, email }),
    customerContactPerson: person,
    customerMobile: mobile,
    customerEmail: email,
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
    calibratedByDesignation: str(row, 'calibratedByDesignation', 'calibrated_by_designation'),
    calibratedByName: str(row, 'calibratedByName', 'calibrated_by_name'),
    authorizedSignatoryDesignation: str(
      row,
      'authorizedSignatoryDesignation',
      'authorized_signatory_designation',
    ),
    authorizedSignatoryName: str(row, 'authorizedSignatoryName', 'authorized_signatory_name'),
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
    customerContactPerson: draft.customerContactPerson.trim(),
    customerMobile: draft.customerMobile.trim(),
    customerEmail: draft.customerEmail.trim(),
    customerContactDetails:
      draft.customerContactDetails.trim() ||
      composeCustomerContactDetails({
        person: draft.customerContactPerson,
        mobile: draft.customerMobile,
        email: draft.customerEmail,
      }),
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
    calibratedByDesignation: draft.calibratedByDesignation.trim(),
    calibratedByName: draft.calibratedByName.trim(),
    authorizedSignatoryDesignation: draft.authorizedSignatoryDesignation.trim(),
    authorizedSignatoryName: draft.authorizedSignatoryName.trim(),
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
