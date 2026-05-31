import { supabase } from '@/lib/supabaseClient'
import { REPORT_SCOPE_SUFFIX, type ReportScopeKind } from './reportScope'
import { fetchTestReportPrefix } from './testReportNumberPrefix'

/** Total report number length */
export const TEST_REPORT_TOTAL_LENGTH = 16
/** Canonical storage / NABL last character */
export const TEST_REPORT_LAST_CHAR = 'A'
export const TEST_REPORT_NON_NABL_LAST_CHAR = 'B'

export function reportNumberLastCharForScope(scope: ReportScopeKind): string {
  return REPORT_SCOPE_SUFFIX[scope]
}

/** Uppercase A–Z, 0–9, and / (prefix may be e.g. QI/TR) */
export function normalizeReportNumberChars(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9/]/g, '')
}

export function prefixSegmentForReportNumber(prefix: string): string {
  return normalizeReportNumberChars(prefix.trim())
}

export function sanitizeTestReportNumberInput(value: string): string {
  return normalizeReportNumberChars(value).slice(0, TEST_REPORT_TOTAL_LENGTH)
}

/**
 * Build 16-char report number: `{prefix}{zeroPaddedSerial}{A}`.
 * Serial starts at 1; width fills space between prefix and trailing A.
 */
export function formatTestReportNumber(prefix: string, sequence: number): string {
  const suffix = TEST_REPORT_LAST_CHAR
  const p = prefixSegmentForReportNumber(prefix)
  const seq = Math.max(1, Math.floor(sequence))
  const serialLen = Math.max(1, TEST_REPORT_TOTAL_LENGTH - p.length - suffix.length)
  const maxPrefixLen = TEST_REPORT_TOTAL_LENGTH - serialLen - suffix.length
  const usePrefix = p.slice(0, Math.max(0, maxPrefixLen))
  const actualSerialLen = TEST_REPORT_TOTAL_LENGTH - usePrefix.length - suffix.length
  const serial = String(seq).padStart(actualSerialLen, '0').slice(-actualSerialLen)
  return `${usePrefix}${serial}${suffix}`
}

/** Stored value is canonical (ends with A); accepts A or B when reading. */
export function toCanonicalReportNumber(value: string): string {
  const v = sanitizeTestReportNumberInput(value)
  if (!v) return ''
  if (v.length === TEST_REPORT_TOTAL_LENGTH && /[AB]$/.test(v)) {
    return `${v.slice(0, -1)}${TEST_REPORT_LAST_CHAR}`
  }
  return v
}

/** Display / edit value for a report scope tab (NABL → A, Non-NABL → B). */
export function toReportNumberForScope(value: string, scope: ReportScopeKind): string {
  const canonical = toCanonicalReportNumber(value)
  if (!canonical) return ''
  if (canonical.length !== TEST_REPORT_TOTAL_LENGTH) return canonical
  return `${canonical.slice(0, -1)}${reportNumberLastCharForScope(scope)}`
}

/** Persist scoped field input as canonical (…A) in parent state / DB. */
export function fromScopedReportNumberInput(value: string, scope: ReportScopeKind): string {
  const v = sanitizeTestReportNumberInput(value)
  if (!v) return ''
  if (v.length === TEST_REPORT_TOTAL_LENGTH) {
    return toCanonicalReportNumber(`${v.slice(0, -1)}${reportNumberLastCharForScope(scope)}`)
  }
  return toCanonicalReportNumber(v)
}

/** Extract serial if prefix matches and number ends with A or B */
export function parseTestReportSequence(number: string, prefix: string): number | null {
  const raw = normalizeReportNumberChars(number)
  if (raw.length !== TEST_REPORT_TOTAL_LENGTH) return null
  const last = raw.at(-1)
  if (last !== TEST_REPORT_LAST_CHAR && last !== TEST_REPORT_NON_NABL_LAST_CHAR) return null

  const p = prefixSegmentForReportNumber(prefix)
  if (!raw.startsWith(p)) return null

  const middle = raw.slice(p.length, -1)
  if (!middle || !/^\d+$/.test(middle)) return null

  const n = parseInt(middle, 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

export function isValidTestReportNumberFormat(
  number: string,
  prefix: string,
  scope: ReportScopeKind = 'nabl',
): boolean {
  const parsed = parseTestReportSequence(number, prefix)
  if (parsed === null) return false
  const scoped = toReportNumberForScope(number, scope)
  return normalizeReportNumberChars(number) === normalizeReportNumberChars(scoped)
}

export async function fetchNextTestReportNumber(excludeSampleId?: string): Promise<{
  prefix: string
  number: string
  sequence: number
}> {
  const prefix = await fetchTestReportPrefix()

  let query = supabase
    .from('samples')
    .select('id, test_report_number')
    .not('test_report_number', 'is', null)

  if (excludeSampleId) {
    query = query.neq('id', excludeSampleId)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[fetchNextTestReportNumber]', error.message)
    return { prefix, number: formatTestReportNumber(prefix, 1), sequence: 1 }
  }

  let maxSeq = 0
  for (const row of Array.isArray(data) ? data : []) {
    const num = row.test_report_number as string | null
    if (!num?.trim()) continue
    const parsed = parseTestReportSequence(toCanonicalReportNumber(num), prefix)
    if (parsed !== null && parsed > maxSeq) maxSeq = parsed
  }

  const sequence = maxSeq + 1
  return {
    prefix,
    number: formatTestReportNumber(prefix, sequence),
    sequence,
  }
}
