/**
 * Frozen record of an issued test report (ISO/IEC 17025 7.8, 7.11).
 *
 * After a report is issued, the data the issued-report print uses is gathered
 * with the same loaders as printIssuedTestReport.ts, serialised as canonical
 * JSON (sorted keys), hashed with SHA-256 and stored once in
 * issued_report_archive via archive_issued_test_report() (migration
 * 20261024100300_report_issue_signature.sql). The RPC takes the report number,
 * ULR, issue time and issuer from the issued sample row itself. Re-prints read
 * it back with checkIssuedReportArchive() (see printIssuedTestReport.ts).
 */
import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  buildIssuedReportSnapshotFromSources,
  isIssuedReportSnapshot,
  issuedReportScopes,
  type IssuedReportSnapshot,
} from './issuedReportPrintData'
import { loadIssuedReportSources } from './loadIssuedReportSources'
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

/** snapshot_sha256 as stored by archiveIssuedTestReport(): SHA-256 of the canonical JSON. */
export function snapshotSha256(snapshot: unknown): Promise<string> {
  return sha256Hex(canonicalJson(snapshot))
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
 * loader and data shape as the issued-report print (issuedReportPrintData.ts),
 * so a re-print from the snapshot renders the issued copy.
 */
export async function buildIssuedReportSnapshot(sampleId: string): Promise<IssuedReportSnapshot> {
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
  const sources = await loadIssuedReportSources(row, issuedReportScopes(row), labNameFromSettings(), {
    notes: s.test_report_draft_notes ?? '',
  })
  return buildIssuedReportSnapshotFromSources(sources, {
    capturedAt: new Date().toISOString(),
    issuedBy: {
      userId: s.issued_by ?? null,
      name: s.issued_by_name ?? null,
      signatureMeaning: s.issued_signature_meaning ?? null,
      reauthenticatedAt: s.issued_reauthenticated_at ?? null,
    },
  })
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
    const sha256 = await snapshotSha256(snapshot)
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

// ---------------------------------------------------------------------------
// Reading the archive back (ISO/IEC 17025 7.8.2: a re-print matches the issue)
// ---------------------------------------------------------------------------

export type IssuedReportArchiveCheck =
  /** Archive row for the current issue whose snapshot matches its SHA-256. */
  | { status: 'verified'; archiveId: string; sha256: string; snapshot: IssuedReportSnapshot }
  /** No archive row for this issue (issued before the archive, or migration not applied). */
  | { status: 'missing' }
  /** Archive row exists but its snapshot does not match snapshot_sha256 (or is unreadable). */
  | {
      status: 'integrity_failed'
      archiveId: string
      expectedSha256: string
      actualSha256: string | null
      reason: string
    }

type ArchiveRow = {
  id: string
  issued_at: string
  snapshot: unknown
  snapshot_sha256: string
}

/**
 * Loads the archive row for the sample's current issue (matching issued_at)
 * and recomputes the snapshot hash exactly as archiveIssuedTestReport() does.
 */
export async function checkIssuedReportArchive(
  sampleId: string,
  issuedAt: string | null,
): Promise<IssuedReportArchiveCheck> {
  if (!issuedAt) return { status: 'missing' }
  const { data, error } = await supabase
    .from('issued_report_archive')
    .select('id, issued_at, snapshot, snapshot_sha256')
    .eq('sample_id', sampleId)
    .eq('issued_at', issuedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMissingArchiveError(error)) return { status: 'missing' }
    throw new Error(error.message || 'Could not read the issued report archive.')
  }
  if (!data) return { status: 'missing' }
  return verifyArchiveRow(data as ArchiveRow, sampleId)
}

/** Hash check of one archive row; exported for tests. */
export async function verifyArchiveRow(
  row: ArchiveRow,
  sampleId: string,
): Promise<IssuedReportArchiveCheck> {
  const expected = String(row.snapshot_sha256 ?? '').trim().toLowerCase()
  const fail = (reason: string, actual: string | null) =>
    ({
      status: 'integrity_failed',
      archiveId: row.id,
      expectedSha256: expected,
      actualSha256: actual,
      reason,
    }) as const
  if (!row.snapshot || typeof row.snapshot !== 'object' || Array.isArray(row.snapshot)) {
    return fail('The archived snapshot is not a JSON object.', null)
  }
  const actual = await snapshotSha256(row.snapshot)
  if (actual !== expected) return fail('SHA-256 of the archived snapshot does not match.', actual)
  if (!isIssuedReportSnapshot(row.snapshot)) {
    return fail('The archived snapshot is not an issued test report.', actual)
  }
  if (row.snapshot.sampleId !== sampleId) {
    return fail('The archived snapshot belongs to a different sample.', actual)
  }
  return { status: 'verified', archiveId: row.id, sha256: actual, snapshot: row.snapshot }
}

/**
 * Which rows have an archive row for their current issue. Reads only ids and
 * timestamps (no snapshots, no hashing). Null when the archive is not deployed.
 */
export async function fetchIssuedReportArchivePresence(
  rows: Array<Pick<IssuedTestReportListRow, 'id' | 'issuedAt'>>,
): Promise<Map<string, boolean> | null> {
  const wanted = rows.filter((r) => r.issuedAt)
  const result = new Map<string, boolean>(rows.map((r) => [r.id, false]))
  if (wanted.length === 0) return result
  const { data, error } = await supabase
    .from('issued_report_archive')
    .select('sample_id, issued_at')
    .in(
      'sample_id',
      wanted.map((r) => r.id),
    )
  if (error) {
    if (isMissingArchiveError(error)) return null
    throw new Error(error.message || 'Could not read the issued report archive.')
  }
  const issuedAtById = new Map(wanted.map((r) => [r.id, Date.parse(r.issuedAt as string)]))
  for (const a of (Array.isArray(data) ? data : []) as Array<{ sample_id: string; issued_at: string }>) {
    const t = issuedAtById.get(a.sample_id)
    if (t !== undefined && Date.parse(a.issued_at) === t) result.set(a.sample_id, true)
  }
  return result
}
