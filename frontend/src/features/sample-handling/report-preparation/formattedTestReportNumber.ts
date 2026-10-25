import { supabase } from '@/lib/supabaseClient'
import { fetchDeletedKeys } from '@/lib/softDelete'
import { receivingReportSuffix } from '@/features/sample-handling/receiving/receivingSrfFromReference'
import { REPORT_SCOPE_SUFFIX, type ReportScopeKind } from './reportScope'
import { fetchTestReportPrefix } from './testReportNumberPrefix'

/**
 * Standard report number length (New Report): prefix + serial + scope letter.
 * Amendment / Revised / Supplementary add one type letter. When the prefix
 * leaves too little room for the serial, the number grows instead of cutting
 * serial digits (a report number is never repeated, URS-RPT-03).
 */
export const TEST_REPORT_TOTAL_LENGTH = 16
export const TEST_REPORT_WITH_TYPE_LENGTH = 17
/** Upper bound for typed / stored report numbers (a grown number still fits). */
export const TEST_REPORT_MAX_LENGTH = 40
/** Lab Settings warns when the report prefix leaves fewer serial digits than this. */
export const TEST_REPORT_MIN_SERIAL_DIGITS = 3
/** Canonical storage / NABL last character */
export const TEST_REPORT_LAST_CHAR = 'A'
export const TEST_REPORT_NON_NABL_LAST_CHAR = 'B'
const SCOPE_AND_TYPE_RE = /[AB][ARS]$/
/** Grown numbers: the scope letter always follows a serial digit. */
const GROWN_BASE_RE = /\d[AB]$/
const GROWN_TYPED_RE = /\d[AB][ARS]$/

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

/** Serial digits a prefix leaves in the standard 16-character number (may be < 1). */
export function testReportSerialDigitsForPrefix(prefix: string): number {
  return TEST_REPORT_TOTAL_LENGTH - prefixSegmentForReportNumber(prefix).length - TEST_REPORT_LAST_CHAR.length
}

export function sanitizeTestReportNumberInput(
  value: string,
  maxLen: number = TEST_REPORT_MAX_LENGTH,
): string {
  return normalizeReportNumberChars(value).slice(0, maxLen)
}

/** Number without a type letter: …A / …B (16 characters, or longer when the serial grew). */
function isBaseReportNumber(v: string): boolean {
  if (v.length === TEST_REPORT_TOTAL_LENGTH) return true
  return v.length > TEST_REPORT_TOTAL_LENGTH && GROWN_BASE_RE.test(v)
}

/** Number with a type letter: …AA / …AR / …AS (17 characters, or longer when the serial grew). */
function isTypedReportNumber(v: string): boolean {
  if (v.length === TEST_REPORT_WITH_TYPE_LENGTH) return SCOPE_AND_TYPE_RE.test(v)
  return v.length > TEST_REPORT_WITH_TYPE_LENGTH && GROWN_TYPED_RE.test(v)
}

/** Drop Amendment/Revised/Supplementary letter (…AA / …AR / …AS) to the base number. */
export function stripReceivingReportTypeSuffix(value: string): string {
  const v = normalizeReportNumberChars(value)
  if (isTypedReportNumber(v)) return v.slice(0, -1)
  if (v.length === TEST_REPORT_TOTAL_LENGTH && /[RS]$/.test(v)) {
    return `${v.slice(0, -1)}${TEST_REPORT_LAST_CHAR}`
  }
  return v
}

/**
 * Build the report number: `{prefix}{zeroPaddedSerial}{A}`, 16 characters
 * when the prefix leaves room. Serial starts at 1. The serial is never cut:
 * when it needs more digits than the prefix leaves, the number grows
 * (e.g. prefix QIRLPL/TR/2026, serial 19 → QIRLPL/TR/202619A).
 */
export function formatTestReportNumber(prefix: string, sequence: number): string {
  const suffix = TEST_REPORT_LAST_CHAR
  const p = prefixSegmentForReportNumber(prefix)
  const seq = Math.max(1, Math.floor(sequence))
  const digits = String(seq)
  const serialLen = Math.max(1, digits.length, TEST_REPORT_TOTAL_LENGTH - p.length - suffix.length)
  return `${p}${digits.padStart(serialLen, '0')}${suffix}`
}

/** Amendment → …AA, Revised → …AR, Supplementary → …AS (after the NABL/Non-NABL letter). */
export function withReceivingReportTypeSuffix(
  value: string,
  reportType: string | null | undefined,
): string {
  const suffix = receivingReportSuffix(reportType ?? '')
  const base = toCanonicalReportNumber(stripReceivingReportTypeSuffix(value))
  if (!suffix) return base
  if (!base) return ''
  if (isBaseReportNumber(base)) return `${base}${suffix}`
  const sixteen = sanitizeTestReportNumberInput(base, TEST_REPORT_TOTAL_LENGTH)
  if (sixteen.length !== TEST_REPORT_TOTAL_LENGTH) return sixteen
  return `${sixteen}${suffix}`
}

/** Stored value is …A (16 characters or a grown number), or …AA / …AR / …AS. */
export function toCanonicalReportNumber(value: string): string {
  const v = sanitizeTestReportNumberInput(value)
  if (!v) return ''
  if (isTypedReportNumber(v)) {
    return `${v.slice(0, -2)}${TEST_REPORT_LAST_CHAR}${v.at(-1)}`
  }
  if (v.length === TEST_REPORT_TOTAL_LENGTH && /[RS]$/.test(v)) {
    return `${v.slice(0, -1)}${TEST_REPORT_LAST_CHAR}${v.at(-1)}`
  }
  if (isBaseReportNumber(v) && /[AB]$/.test(v)) {
    return `${v.slice(0, -1)}${TEST_REPORT_LAST_CHAR}`
  }
  return v
}

/** Display / edit value for a report scope tab (NABL → A, Non-NABL → B). Type letter stays last. */
export function toReportNumberForScope(value: string, scope: ReportScopeKind): string {
  const canonical = toCanonicalReportNumber(value)
  if (!canonical) return ''
  const scopeChar = reportNumberLastCharForScope(scope)
  if (isTypedReportNumber(canonical)) {
    return `${canonical.slice(0, -2)}${scopeChar}${canonical.at(-1)}`
  }
  if (!isBaseReportNumber(canonical)) return canonical
  return `${canonical.slice(0, -1)}${scopeChar}`
}

/** Persist scoped field input as canonical (…A or …AA / …AR / …AS). */
export function fromScopedReportNumberInput(value: string, scope: ReportScopeKind): string {
  const v = sanitizeTestReportNumberInput(value)
  if (!v) return ''
  if (isTypedReportNumber(v)) {
    return toCanonicalReportNumber(`${v.slice(0, -2)}${reportNumberLastCharForScope(scope)}${v.at(-1)}`)
  }
  if (isBaseReportNumber(v)) {
    return toCanonicalReportNumber(`${v.slice(0, -1)}${reportNumberLastCharForScope(scope)}`)
  }
  return toCanonicalReportNumber(v)
}

/** Extract serial if prefix matches; ignores optional Amendment/Revised/Supplementary letter. */
export function parseTestReportSequence(number: string, prefix: string): number | null {
  const raw = stripReceivingReportTypeSuffix(number)
  if (!isBaseReportNumber(raw)) return null
  const last = raw.at(-1)
  if (last !== TEST_REPORT_LAST_CHAR && last !== TEST_REPORT_NON_NABL_LAST_CHAR) return null

  const p = prefixSegmentForReportNumber(prefix)
  if (!raw.startsWith(p)) return null

  const middle = raw.slice(p.length, -1)
  if (!middle || !/^\d+$/.test(middle)) return null

  const n = parseInt(middle, 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

/** True when a save failed because another sample already holds this report number (unique index samples_test_report_number_uidx). */
export function isTestReportNumberConflictError(
  error: { code?: string; message?: string; details?: string } | null | undefined,
): boolean {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return error.code === '23505' && /test_report_number_uidx/i.test(text)
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

  // Report numbers of deleted samples are never reused.
  const [{ data, error }, deletedNumbers] = await Promise.all([
    query,
    fetchDeletedKeys('samples', 'test_report_number'),
  ])
  if (error) {
    console.warn('[fetchNextTestReportNumber]', error.message)
    return { prefix, number: formatTestReportNumber(prefix, 1), sequence: 1 }
  }

  let maxSeq = 0
  for (const num of [
    ...(Array.isArray(data) ? data : []).map((row) => row.test_report_number as string | null),
    ...deletedNumbers,
  ]) {
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
