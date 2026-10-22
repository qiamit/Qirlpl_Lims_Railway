/**
 * Frozen record of an issued test report (ISO/IEC 17025 7.8, 7.11).
 *
 * After a report is issued, the data the issued-report print uses is gathered
 * with the same loaders as printIssuedTestReport.ts, serialised as canonical
 * JSON (sorted keys), hashed with SHA-256 and stored once in
 * issued_report_archive via archive_issued_test_report() (migration
 * 20261024100300_report_issue_signature.sql). The RPC takes the report number,
 * ULR, issue time and issuer from the issued sample row itself.
 */
import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import {
  TEST_REPORT_SIGNATURE_PART_IDS,
  signaturesForPart,
  type TestReportSignature,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { toCanonicalReportNumber } from '@/features/sample-handling/report-preparation/formattedTestReportNumber'
import { fetchTestReportCoverDetails } from '@/features/sample-handling/report-preparation/fetchTestReportCoverDetails'
import { fetchReportPrepLetterheads } from '@/features/sample-handling/report-preparation/reportPrepLetterhead'
import {
  fetchReportResultRowsForSample,
  filterReportRowsByScope,
} from '@/features/sample-handling/report-preparation/reportResultRows'
import { appendReportScopeSuffix } from '@/features/sample-handling/report-preparation/reportScope'
import { issuedReportScopes } from './printIssuedTestReport'
import type { IssuedTestReportListRow } from './types'

/** Stored in samples.issued_signature_meaning. */
export const ISSUE_SIGNATURE_MEANING = 'Authorized for release'

/** Statement the issuer confirms with their password. */
export const ISSUE_SIGNATURE_STATEMENT = 'I authorize release of this test report'

export const ISSUE_SIGNATURE_COLUMNS = [
  'issued_by',
  'issued_by_name',
  'issued_signature_meaning',
  'issued_reauthenticated_at',
] as const

const SNAPSHOT_FORMAT = 'qirlpl-issued-test-report'
const SNAPSHOT_VERSION = 1

type PgLikeError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined

/** True when the signature columns are not in the database yet (migration not applied). */
export function isMissingIssueSignatureColumnError(error: PgLikeError): boolean {
  return ISSUE_SIGNATURE_COLUMNS.some((col) => isSupabaseMissingColumnError(error, col))
}

/** True when archive_issued_test_report() / issued_report_archive do not exist yet. */
export function isMissingArchiveError(error: PgLikeError): boolean {
  if (!error) return false
  const code = String(error.code ?? '')
  const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  if (code === 'PGRST202' || code === '42883' || code === '42P01' || code === 'PGRST205') return true
  return (
    (msg.includes('archive_issued_test_report') || msg.includes('issued_report_archive')) &&
    (msg.includes('could not find') || msg.includes('does not exist') || msg.includes('schema cache'))
  )
}

/** JSON with object keys sorted at every level; the hashed form of the snapshot. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value)
    return s === undefined ? 'null' : s
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const parts = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
  return `{${parts.join(',')}}`
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function labNameFromSettings(): string {
  try {
    return (
      window.localStorage.getItem('labSettings.labName') ||
      'Quality International Research & Laboratories Pvt. Ltd.'
    )
  } catch {
    return 'Quality International Research & Laboratories Pvt. Ltd.'
  }
}

function signatoryForSnapshot(sig: TestReportSignature) {
  return {
    roleLabel: sig.roleLabel ?? '',
    userId: sig.userId ?? '',
    name: sig.name ?? '',
    designation: sig.designation ?? '',
    department: sig.department ?? '',
  }
}

type IssuedSampleRow = {
  id: string
  srf_number?: string | null
  date_of_sample_receiving?: string | null
  test_report_is_code_id?: string | null
  test_report_number?: string | null
  test_report_issued_at?: string | null
  test_report_nabl_issued_at?: string | null
  test_report_non_nabl_issued_at?: string | null
  test_report_nabl_ulr_number?: string | null
  test_report_draft_notes?: string | null
  issued_by?: string | null
  issued_by_name?: string | null
  issued_signature_meaning?: string | null
  issued_reauthenticated_at?: string | null
  clients?:
    | { company_name?: string | null; email?: string | null }
    | Array<{ company_name?: string | null; email?: string | null }>
    | null
}

/**
 * Builds the snapshot of an issued report from the database, using the same
 * loaders as the issued-report print (results per scope, cover details,
 * letterheads, signatories, Part D notes).
 */
export async function buildIssuedReportSnapshot(sampleId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('samples')
    .select(
      'id, srf_number, date_of_sample_receiving, test_report_is_code_id, test_report_number, test_report_issued_at, test_report_nabl_issued_at, test_report_non_nabl_issued_at, test_report_nabl_ulr_number, test_report_draft_notes, issued_by, issued_by_name, issued_signature_meaning, issued_reauthenticated_at, clients(company_name, email)',
    )
    .eq('id', sampleId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Issued sample was not found.')
  const s = data as IssuedSampleRow
  const client = Array.isArray(s.clients) ? (s.clients[0] ?? null) : (s.clients ?? null)

  let isCodeLabel: string | null = null
  if (s.test_report_is_code_id) {
    const { data: isRow } = await supabase
      .from('is_codes')
      .select('id, is_number, revision_year')
      .eq('id', s.test_report_is_code_id)
      .maybeSingle()
    const r = isRow as { id: string; is_number?: string; revision_year?: string | null } | null
    if (r) isCodeLabel = formatIsCodeLabelFromParts(r.is_number, r.revision_year) || r.is_number || r.id
  }

  const row: IssuedTestReportListRow = {
    id: s.id,
    srfNumber: s.srf_number ?? null,
    dateReceiving: s.date_of_sample_receiving ?? null,
    clientName: client?.company_name ?? null,
    clientEmail: client?.email?.trim() || null,
    isCodeId: s.test_report_is_code_id ?? null,
    isCodeLabel,
    reportNumberBase: s.test_report_number ?? null,
    nablIssuedAt: s.test_report_nabl_issued_at ?? null,
    nonNablIssuedAt: s.test_report_non_nabl_issued_at ?? null,
    issuedAt: s.test_report_issued_at ?? null,
    nablUlrNumber: s.test_report_nabl_ulr_number ?? null,
  }
  const scopes = issuedReportScopes(row)
  const base = toCanonicalReportNumber(row.reportNumberBase ?? '')

  const [resultRows, coverDetails, letterheadData, printSettings] = await Promise.all([
    fetchReportResultRowsForSample(row.id),
    fetchTestReportCoverDetails(row.id, {
      fallbacks: { clientName: row.clientName, isCodeLabel: row.isCodeLabel },
    }),
    fetchReportPrepLetterheads(row.id, scopes),
    fetchTestReportPrintSettings(),
  ])

  const reports = scopes.map((scope) => ({
    scope,
    reportNumber: base ? appendReportScopeSuffix(base, scope) : null,
    ulrNumber: scope === 'nabl' ? row.nablUlrNumber : null,
    issuedAt: (scope === 'nabl' ? row.nablIssuedAt : row.nonNablIssuedAt) || row.issuedAt,
    letterhead: letterheadData.letterheads[scope] ?? null,
    results: filterReportRowsByScope(resultRows, scope).map((r) => ({
      parameterId: r.parameterId,
      srNo: r.srNo,
      sectionCode: r.sectionCode,
      clauseNo: r.clauseNo,
      testName: r.testName,
      testMethodClause: r.testMethodClause,
      unit: r.unit,
      specifiedRequirement: r.specifiedRequirement,
      observedValue: r.observedValue,
      uncertainty: r.uncertainty,
      conformity: r.remark,
      scope: r.scope,
    })),
  }))

  const signatories = {
    show: Boolean(printSettings.showSignatures),
    afterPart: Object.fromEntries(
      TEST_REPORT_SIGNATURE_PART_IDS.map((part) => [
        part,
        signaturesForPart(printSettings, part).map(signatoryForSnapshot),
      ]),
    ),
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
    labName: labNameFromSettings(),
    sampleId: row.id,
    srfNumber: row.srfNumber,
    dateOfSampleReceiving: row.dateReceiving,
    reportNumber: base || null,
    ulrNumber: row.nablUlrNumber,
    issuedAt: row.issuedAt,
    nablIssuedAt: row.nablIssuedAt,
    nonNablIssuedAt: row.nonNablIssuedAt,
    issuedBy: {
      userId: s.issued_by ?? null,
      name: s.issued_by_name ?? null,
      signatureMeaning: s.issued_signature_meaning ?? null,
      reauthenticatedAt: s.issued_reauthenticated_at ?? null,
    },
    customer: {
      name: coverDetails.customerName ?? row.clientName,
      address: coverDetails.customerAddress,
      details: coverDetails.customerDetails,
    },
    isStandard: row.isCodeLabel,
    cover: coverDetails,
    remarks: s.test_report_draft_notes ?? '',
    reports,
    signatories,
  }
}

export type ArchiveIssuedReportResult =
  | { status: 'archived'; id: string | null; sha256: string }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string }

/**
 * Stores the frozen copy of a just-issued report. Never throws: the report is
 * already issued, so a failure here is reported to the caller to show.
 */
export async function archiveIssuedTestReport(sampleId: string): Promise<ArchiveIssuedReportResult> {
  try {
    const raw = await buildIssuedReportSnapshot(sampleId)
    // Round-trip so the stored JSON is exactly what was hashed.
    const snapshot = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
    const sha256 = await sha256Hex(canonicalJson(snapshot))
    const { data, error } = await supabase.rpc('archive_issued_test_report', {
      p_sample_id: sampleId,
      p_snapshot: snapshot,
      p_sha256: sha256,
    })
    if (error) {
      if (isMissingArchiveError(error)) {
        return { status: 'unavailable', message: error.message }
      }
      return { status: 'failed', message: error.message || 'Could not store the issued report copy.' }
    }
    return { status: 'archived', id: typeof data === 'string' ? data : null, sha256 }
  } catch (e) {
    const err = e as PgLikeError
    if (isMissingIssueSignatureColumnError(err) || isMissingArchiveError(err)) {
      return { status: 'unavailable', message: err?.message ?? '' }
    }
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : (err?.message ?? 'Could not store the issued report copy.'),
    }
  }
}
