/** Certificate Preparation draft stored on calibration_jobs.certificate_draft */

import { is2RoundCompact } from '@/lib/is2Rounding'

export type CertificateAmendmentType = 'amendment' | 'revised' | 'supplementary'

/**
 * Set by start_certificate_amendment() when an issued certificate is reopened
 * (ISO/IEC 17025 7.8.8). Printed as a one-line statement on the new certificate.
 */
export type CertificateAmendmentRef = {
  id: string
  amendmentNo: number
  type: CertificateAmendmentType
  reason: string
  replacesCertificateNumber: string
  replacesUlrNumber: string
  /** yyyy-mm-dd issue date of the certificate being replaced. */
  replacesIssueDate: string
}

/**
 * Who issued the certificate (ISO/IEC 17025 7.8.2.1 / 7.5): set on Issue after
 * the issuer re-enters their password; the database stamps the signed-in user.
 */
export type CertificateIssuedBy = {
  userId: string
  name: string
  designation: string
  issuedAt: string
  reauthenticatedAt: string
}

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
  /** Present when this certificate amends an earlier issued one. */
  amendment: CertificateAmendmentRef | null
  issuedBy: CertificateIssuedBy | null
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
  amendment: null,
  issuedBy: null,
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

/**
 * Notes for force testing machines (UTM, tensile / compression machines, IS
 * 1828 Part 1). Until 23 Oct 2026 this was the default for every instrument,
 * so vernier calipers, gauges and meters printed machine notes.
 */
export const TESTING_MACHINE_CERTIFICATE_NOTES = [
  '1. Maximum permissible values for the given class of machine range for Indication, Repeatability, Resolution & Zero Errors are as per Table 2 of IS 1828 Part 1.',
  '2. General Inspection of machine carried out as per Annex A of IS 1828 Part - 1 : No anomalies were found.',
  // Replaced from the SRF when a draft is prepared (srfConformityPolicy.ts, ISO 17025 7.8.6).
  '3. No statement of conformity was requested by the customer.',
  `4. The lower limit of the machine for the given range = ${CERTIFICATE_NOTES_MIN_LOAD_TOKEN} (Resolution x 200)`,
  '5. This machine is calibrated in one mode as it has two work areas with common force application & indicating device.',
].join('\n')

/** Default notes for any instrument; the conformity line is replaced from the SRF (srfConformityPolicy.ts). */
export const DEFAULT_CERTIFICATE_NOTES = [
  '1. No statement of conformity was requested by the customer.',
].join('\n')

/** Equipment names that take the testing machine notes (IS 1828 Part 1). */
export function isForceTestingMachine(equipmentName: string | null | undefined): boolean {
  return /testing machine|tasting machine|\butm\b/i.test(String(equipmentName ?? ''))
}

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
  const fmt = Number.isInteger(min) ? String(min) : is2RoundCompact(min, 2)
  return `${fmt} ${u}`
}

/** Remarks line 1 for each place of calibration (ISO/IEC 17025 7.8.2.1 c). */
export const CERTIFICATE_LOCATION_REMARK = {
  lab: 'The above calibration was carried out in the laboratory.',
  site: "The above calibration was carried out at the customer's site.",
} as const

/**
 * Set the place-of-calibration remark from the job (In Lab / On Site). The
 * default remarks said "done at the Site of Customer" for every job.
 */
export function applyCertificateLocationRemark(remarks: string, location: string | null | undefined): string {
  const text = /site/i.test(String(location ?? '')) ? CERTIFICATE_LOCATION_REMARK.site : CERTIFICATE_LOCATION_REMARK.lab
  const re = /^(\s*\d+[).]\s*)?The above calibration (?:is done|was carried out|is carried out) (?:at|in) [^\n]*$/im
  if (re.test(remarks)) return remarks.replace(re, (_m, prefix: string | undefined) => `${prefix ?? ''}${text}`)
  return remarks
}

/** Default Other Remarks language (editable on the draft). */
export const DEFAULT_CERTIFICATE_REMARKS = [
  `1) ${CERTIFICATE_LOCATION_REMARK.lab}`,
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

const AMENDMENT_TYPES: CertificateAmendmentType[] = ['amendment', 'revised', 'supplementary']

export function parseCertificateIssuedBy(raw: unknown): CertificateIssuedBy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const userId = String(row.userId ?? row.user_id ?? '').trim()
  if (!userId) return null
  return {
    userId,
    name: String(row.name ?? '').trim(),
    designation: String(row.designation ?? '').trim(),
    issuedAt: String(row.issuedAt ?? row.issued_at ?? '').trim(),
    reauthenticatedAt: String(row.reauthenticatedAt ?? row.reauthenticated_at ?? '').trim(),
  }
}

export function parseCertificateAmendmentRef(raw: unknown): CertificateAmendmentRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = String(row.id ?? '').trim()
  const amendmentNo = Number.parseInt(String(row.amendmentNo ?? row.amendment_no ?? ''), 10)
  if (!id || !Number.isFinite(amendmentNo) || amendmentNo < 1) return null
  const typeRaw = String(row.type ?? '').trim().toLowerCase() as CertificateAmendmentType
  return {
    id,
    amendmentNo,
    type: AMENDMENT_TYPES.includes(typeRaw) ? typeRaw : 'amendment',
    reason: String(row.reason ?? '').trim(),
    replacesCertificateNumber: str(row, 'replacesCertificateNumber', 'replaces_certificate_number'),
    replacesUlrNumber: str(row, 'replacesUlrNumber', 'replaces_ulr_number'),
    replacesIssueDate: dateStr(row, 'replacesIssueDate', 'replaces_issue_date'),
  }
}

export const CERTIFICATE_AMENDMENT_TYPE_LABELS: Record<CertificateAmendmentType, string> = {
  amendment: 'Amendment',
  revised: 'Revised',
  supplementary: 'Supplementary',
}

/**
 * One-line statement printed on an amended certificate, e.g.
 * "Amendment No. 1 — replaces certificate QI/CC/2026/0001 dated 01/10/2026. Reason: …"
 */
export function certificateAmendmentStatement(
  ref: CertificateAmendmentRef,
  formatIssueDate: (isoDate: string) => string,
): string {
  const kind =
    ref.type === 'revised' ? 'Revision' : ref.type === 'supplementary' ? 'Supplement' : 'Amendment'
  const verb = ref.type === 'supplementary' ? 'supplements' : 'replaces'
  const original = ref.replacesCertificateNumber || '—'
  const dated = ref.replacesIssueDate ? ` dated ${formatIssueDate(ref.replacesIssueDate)}` : ''
  const reason = ref.reason ? ` Reason: ${ref.reason.replace(/\s+/g, ' ')}` : ''
  return `${kind} No. ${ref.amendmentNo} — ${verb} certificate ${original}${dated}.${reason}`
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
    amendment: parseCertificateAmendmentRef(row.amendment),
    issuedBy: parseCertificateIssuedBy(row.issuedBy ?? row.issued_by),
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
    amendment: draft.amendment,
    issuedBy: draft.issuedBy,
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

/**
 * Certificate number without its amendment suffix: "QI/CC/2026/0003/A1" →
 * "QI/CC/2026/0003" (the /A1, /R1, /S1 that calibration_amended_certificate_number writes).
 */
export function certificateNumberBase(no: string | null | undefined): string {
  return String(no ?? '').trim().replace(/\/[ARS]\d+$/i, '')
}

/**
 * Next certificate number `{prefix}/{year}/{NNNN}` after every number in
 * `used`, amended ones (…/0003/A1) and the numbers they replaced included.
 * Before, an amended number did not match and its serial was handed out again
 * (OQ staging run, 23 Oct 2026: QI/CC/2026/0003 issued twice).
 */
export function nextCalibrationCertificateNumber(
  prefix: string,
  year: number,
  used: Array<string | null | undefined>,
): string {
  const yearToken = String(year)
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}[/\\-]?${yearToken}[/\\-]?(\\d{1,6})$`, 'i')
  // Also accept a bare serial after the year when drafts used another separator.
  const looseRe = new RegExp(`(?:^|[\\/\\-])${yearToken}[\\/\\-](\\d{1,6})$`, 'i')
  let maxSerial = 0
  for (const raw of used) {
    const num = certificateNumberBase(raw)
    if (!num) continue
    const m = num.match(re) ?? (num.toUpperCase().includes(prefix.toUpperCase()) ? num.match(looseRe) : null)
    if (m?.[1]) maxSerial = Math.max(maxSerial, Number.parseInt(m[1], 10) || 0)
  }
  return `${prefix}/${yearToken}/${String(maxSerial + 1).padStart(4, '0')}`
}
