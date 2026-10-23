import { supabase } from '@/lib/supabaseClient'
import { fetchDeletedKeys } from '@/lib/softDelete'
import { type PrefixRow } from './testReportNumberPrefix'

/**
 * NABL mandatory ULR format (18 positions, 19 characters):
 *  1     : TC / CC / RC (counts as one position, two characters)
 *  2–6   : accreditation certificate number (5 digits)
 *  7–8   : year (YY)
 *  9     : location (0 = single site)
 * 10–17  : running serial (8 digits; hex allowed)
 * 18     : F (within accredited scope)
 *
 * @see NABL clarification on Unique Laboratory Report (ULR) Number
 */
export const NABL_ULR_POSITION_COUNT = 18
export const NABL_ULR_CHAR_LENGTH = 19
/** @deprecated Use {@link NABL_ULR_CHAR_LENGTH} for input length; positions are 18. */
export const NABL_ULR_TOTAL_LENGTH = NABL_ULR_CHAR_LENGTH

export const NABL_ULR_FIXED_PREFIX = 'TC'
export type NablUlrCabType = 'TC' | 'CC' | 'RC'
export const NABL_ULR_CERT_DIGITS = 5
export const NABL_ULR_YEAR_DIGITS = 2
export const NABL_ULR_LOCATION_DIGITS = 1
export const NABL_ULR_SERIAL_DIGITS = 8
export const NABL_ULR_LAST_CHAR = 'F'

export const DEFAULT_ULR_PREFIX = 'TC'
export const DEFAULT_CALIBRATION_ULR_CAB: NablUlrCabType = 'CC'

/** Lab Settings → Prefix's names for ULR, checked in order */
export const ULR_PREFIX_SETTING_NAMES = ['ULR Number', 'ULR', 'NABL ULR'] as const

const NABL_ULR_PATTERN = new RegExp(
  `^(TC|CC|RC)\\d{${NABL_ULR_CERT_DIGITS}}\\d{${NABL_ULR_YEAR_DIGITS}}[0-9A-F][0-9A-F]{${NABL_ULR_SERIAL_DIGITS}}${NABL_ULR_LAST_CHAR}$`,
)

const HEADER_CHAR_LENGTH =
  NABL_ULR_FIXED_PREFIX.length +
  NABL_ULR_CERT_DIGITS +
  NABL_ULR_YEAR_DIGITS +
  NABL_ULR_LOCATION_DIGITS

function normalizePrefixName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function pickUlrPrefixFromRows(rows: PrefixRow[]): string | null {
  const valid = rows
    .map((r) => ({ name: String(r.name ?? '').trim(), prefix: String(r.prefix ?? '').trim() }))
    .filter((r) => r.name && r.prefix)

  if (valid.length === 0) return null

  const byName = new Map(valid.map((r) => [normalizePrefixName(r.name), r.prefix]))

  for (const settingName of ULR_PREFIX_SETTING_NAMES) {
    const hit = byName.get(normalizePrefixName(settingName))
    if (hit) return hit
  }

  const fuzzy = valid.find((r) => normalizePrefixName(r.name).includes('ulr'))
  return fuzzy?.prefix ?? null
}

export async function fetchUlrPrefix(): Promise<string> {
  const { data, error } = await supabase.from('lab_prefixes').select('name, prefix').order('name')

  if (error) {
    console.warn('[fetchUlrPrefix]', error.message)
    return DEFAULT_ULR_PREFIX
  }

  return pickUlrPrefixFromRows((Array.isArray(data) ? data : []) as PrefixRow[]) ?? DEFAULT_ULR_PREFIX
}

/** Alphanumeric only, uppercase — for segments inside ULR */
export function normalizeUlrAlphanumeric(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * An amended / revised report keeps the original ULR with a revision suffix:
 * `TC1544226000000400F-R1`, then `-R2`, … (lab decision 23 Oct 2026; the lab
 * typed `-R2` by hand before). Room for up to `-R99` in inputs.
 */
export const NABL_ULR_REVISION_SEPARATOR = '-R'
export const NABL_ULR_MAX_INPUT_LENGTH = NABL_ULR_CHAR_LENGTH + NABL_ULR_REVISION_SEPARATOR.length + 2

/** `TC…F-R2` → base `TC…F` and revision 2; a ULR without a suffix has revision null. */
export function splitNablUlrRevision(ulr: string): { base: string; revision: number | null } {
  const m = /^(.*?)\s*-\s*R\s*(\d+)\s*$/i.exec(ulr)
  if (!m) return { base: normalizeUlrAlphanumeric(ulr), revision: null }
  const revision = parseInt(m[2]!, 10)
  return { base: normalizeUlrAlphanumeric(m[1]!), revision: revision >= 1 ? revision : null }
}

/**
 * ULR for the next amended / revised report of `sourceUlr`: its base plus
 * `-R` and one more than the highest revision already used for that base
 * (`existingUlrs` should include deleted samples' ULRs, never reused).
 */
export function nextRevisedNablUlrNumber(sourceUlr: string, existingUlrs: Array<string | null | undefined>): string {
  const { base, revision } = splitNablUlrRevision(sourceUlr)
  let highest = revision ?? 0
  for (const other of existingUlrs) {
    if (!other?.trim()) continue
    const parts = splitNablUlrRevision(other)
    if (parts.base === base && parts.revision != null && parts.revision > highest) highest = parts.revision
  }
  return `${base}${NABL_ULR_REVISION_SEPARATOR}${highest + 1}`
}

/**
 * ULR as typed or stored: alphanumeric, uppercase, 19 characters, plus a
 * complete revision suffix when there is one (`-R1`, set on amendment). A
 * partial suffix (`-`, `-R`) is dropped so it can never be saved as a
 * different ULR.
 */
export function sanitizeNablUlrInput(value: string): string {
  const { base, revision } = splitNablUlrRevision(value)
  if (revision != null && revision <= 99 && base.length === NABL_ULR_CHAR_LENGTH) {
    return `${base}${NABL_ULR_REVISION_SEPARATOR}${revision}`
  }
  return normalizeUlrAlphanumeric(value).slice(0, NABL_ULR_CHAR_LENGTH)
}

/**
 * Parse NABL accreditation display (e.g. `CC - 3039`) into CAB type + 5-digit body.
 */
export function parseNablAccreditationCert(raw: string | null | undefined): {
  cab: NablUlrCabType
  digits: string
} | null {
  const t = normalizeUlrAlphanumeric(raw ?? '')
  if (!t) return null
  const m = t.match(/^(TC|CC|RC)(\d+)$/)
  if (m) {
    return {
      cab: m[1] as NablUlrCabType,
      digits: m[2]!.padStart(NABL_ULR_CERT_DIGITS, '0').slice(-NABL_ULR_CERT_DIGITS),
    }
  }
  const digitsOnly = t.replace(/\D/g, '')
  if (!digitsOnly) return null
  return {
    cab: DEFAULT_CALIBRATION_ULR_CAB,
    digits: digitsOnly.padStart(NABL_ULR_CERT_DIGITS, '0').slice(-NABL_ULR_CERT_DIGITS),
  }
}

/**
 * Lab prefix is typically TC/CC/RC + cert (5) + year (2), optionally + location (1).
 * Returns the 10-char header used before the 8-digit serial.
 */
export function normalizeNablUlrHeaderPrefix(
  prefix: string,
  fallbackCab: NablUlrCabType = 'TC',
): string {
  let p = normalizeUlrAlphanumeric(prefix)
  if (!/^(TC|CC|RC)/.test(p)) {
    p = `${fallbackCab}${p}`
  }

  const minHeaderLen =
    NABL_ULR_FIXED_PREFIX.length + NABL_ULR_CERT_DIGITS + NABL_ULR_YEAR_DIGITS
  if (p.length < minHeaderLen) {
    p = p.padEnd(minHeaderLen, '0')
  }

  if (p.length === minHeaderLen) {
    return `${p}0`
  }

  return p.slice(0, HEADER_CHAR_LENGTH)
}

/**
 * Build calibration ULR header from NABL accreditation certificate no.
 * Example: `CC - 3039` + year 2026 → `CC03039260`
 */
export function buildCalibrationUlrHeaderPrefix(
  accreditationCertificateNo: string | null | undefined,
): string {
  const parsed = parseNablAccreditationCert(accreditationCertificateNo)
  const cab = parsed?.cab ?? DEFAULT_CALIBRATION_ULR_CAB
  const digits = parsed?.digits ?? '0'.repeat(NABL_ULR_CERT_DIGITS)
  const year = String(new Date().getFullYear()).slice(-NABL_ULR_YEAR_DIGITS)
  return normalizeNablUlrHeaderPrefix(`${cab}${digits}${year}`, cab)
}

/**
 * Build a 19-character ULR: `{header}{8-digit serial}{F}`.
 * Header = TC/CC/RC + cert (5) + year (2) + location (1); serial starts at 1 each calendar year.
 */
export function formatNablUlrNumber(
  prefix: string,
  sequence: number,
  fallbackCab: NablUlrCabType = 'TC',
): string {
  const header = normalizeNablUlrHeaderPrefix(prefix, fallbackCab)
  const seq = Math.max(1, Math.floor(sequence))
  // Never cut serial digits: a serial above 99,999,999 gives a 20-character
  // value that fails matchesNablUlrStructure instead of repeating an earlier ULR.
  const serial = String(seq).padStart(NABL_ULR_SERIAL_DIGITS, '0')
  return `${header}${serial}${NABL_ULR_LAST_CHAR}`
}

export function matchesNablUlrStructure(ulr: string): boolean {
  const raw = normalizeUlrAlphanumeric(ulr)
  return raw.length === NABL_ULR_CHAR_LENGTH && NABL_ULR_PATTERN.test(raw)
}

/** Extract serial from stored ULR if it matches prefix + NABL structure (a `-Rn` revision keeps its serial) */
export function parseNablUlrSequence(
  ulr: string,
  prefix: string,
  fallbackCab: NablUlrCabType = 'TC',
): number | null {
  const raw = splitNablUlrRevision(ulr).base
  if (!matchesNablUlrStructure(raw)) return null

  const header = normalizeNablUlrHeaderPrefix(prefix, fallbackCab)
  if (!raw.startsWith(header)) return null

  const serialPart = raw.slice(HEADER_CHAR_LENGTH, -1)
  const n = parseInt(serialPart, 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

export function isValidNablUlrFormat(
  ulr: string,
  prefix: string,
  fallbackCab: NablUlrCabType = 'TC',
): boolean {
  return parseNablUlrSequence(ulr, prefix, fallbackCab) !== null
}

export function nablUlrPlaceholder(prefix?: string): string {
  if (prefix?.trim()) {
    return formatNablUlrNumber(prefix, 1)
  }
  const year = String(new Date().getFullYear()).slice(-2)
  return `${NABL_ULR_FIXED_PREFIX}${'0'.repeat(NABL_ULR_CERT_DIGITS)}${year}0${'0'.repeat(NABL_ULR_SERIAL_DIGITS - 1)}1${NABL_ULR_LAST_CHAR}`
}

/**
 * Every ULR already used in the lab: test reports (samples, deleted ones
 * included), calibration certificates and the ULRs of amended certificates.
 * Read through `app_used_ulr_numbers` (migration 42), which sees all rows
 * whatever the user's module access, so the testing and calibration series
 * never hand out a number the other already holds. Before that migration the
 * tables are read directly (only what the user may see).
 */
async function fetchUsedUlrNumbers(): Promise<string[]> {
  const deletedPromise = fetchDeletedKeys('samples', 'test_report_nabl_ulr_number')
  const rpc = await supabase.rpc('app_used_ulr_numbers')
  if (!rpc.error && Array.isArray(rpc.data)) {
    return [...(rpc.data as unknown[]).map((u) => String(u ?? '')), ...(await deletedPromise)]
  }
  const [samplesRes, jobsRes, deleted] = await Promise.all([
    supabase.from('samples').select('test_report_nabl_ulr_number').not('test_report_nabl_ulr_number', 'is', null),
    supabase.from('calibration_jobs').select('certificate_draft').neq('certificate_draft', '{}'),
    deletedPromise,
  ])
  if (samplesRes.error) console.warn('[fetchUsedUlrNumbers] samples', samplesRes.error.message)
  if (jobsRes.error) console.warn('[fetchUsedUlrNumbers] calibration_jobs', jobsRes.error.message)
  return [
    ...(Array.isArray(samplesRes.data) ? samplesRes.data : []).map((r) =>
      String((r as { test_report_nabl_ulr_number?: string | null }).test_report_nabl_ulr_number ?? ''),
    ),
    ...(Array.isArray(jobsRes.data) ? jobsRes.data : []).map((r) => {
      const draft = (r as { certificate_draft?: Record<string, unknown> | null }).certificate_draft ?? {}
      return String(draft.ulrNumber ?? draft.ulr_number ?? '')
    }),
    ...deleted,
  ]
}

function highestUlrSerial(used: string[], prefix: string, fallbackCab: NablUlrCabType): number {
  let maxSeq = 0
  for (const num of used) {
    if (!num?.trim()) continue
    const parsed = parseNablUlrSequence(num, prefix, fallbackCab)
    if (parsed !== null && parsed > maxSeq) maxSeq = parsed
  }
  return maxSeq
}

/**
 * Next test report ULR (TC series, Lab Settings → Prefix "ULR Number").
 * Counts calibration certificates too: before, a certificate that took a TC
 * serial was not seen here and the next test report reused it.
 */
export async function fetchNextNablUlrNumber(excludeSampleId?: string): Promise<{
  prefix: string
  ulr: string
  sequence: number
}> {
  const prefix = await fetchUlrPrefix()
  let used: string[] = []
  try {
    used = await fetchUsedUlrNumbers()
  } catch (err) {
    console.warn('[fetchNextNablUlrNumber]', err instanceof Error ? err.message : err)
  }
  // The open sample's own ULR does not block it (it keeps that number).
  if (excludeSampleId) {
    const { data } = await supabase
      .from('samples')
      .select('test_report_nabl_ulr_number')
      .eq('id', excludeSampleId)
      .maybeSingle()
    const own = splitNablUlrRevision(String((data as { test_report_nabl_ulr_number?: string | null } | null)?.test_report_nabl_ulr_number ?? '')).base
    if (own) used = used.filter((u) => splitNablUlrRevision(u).base !== own)
  }
  const sequence = highestUlrSerial(used, prefix, 'TC') + 1
  return {
    prefix,
    ulr: formatNablUlrNumber(prefix, sequence),
    sequence,
  }
}

/** True when a save failed because another sample already holds this ULR (unique index samples_nabl_ulr_uidx). */
export function isNablUlrConflictError(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return error.code === '23505' && /nabl_ulr/i.test(text)
}

/** The lab's calibration accreditation as published (NABL CC-3039), used when Lab Settings has none. */
export const LAB_CALIBRATION_ACCREDITATION_DEFAULT = 'CC-3039'

/**
 * Calibration accreditation number for certificate ULRs: a CC accreditation
 * from Lab Settings → Accreditations, else `preferred` when it is a CC number,
 * else the lab's published CC-3039. Never the testing (TC) number or the Lab
 * Settings ULR prefix, which belong to test reports.
 */
export async function fetchCalibrationAccreditationNo(preferred?: string | null): Promise<string> {
  const { data, error } = await supabase.from('lab_accreditations').select('accreditation_number')
  if (!error) {
    for (const row of Array.isArray(data) ? data : []) {
      const no = String((row as { accreditation_number?: string | null }).accreditation_number ?? '')
      if (parseNablAccreditationCert(no)?.cab === 'CC' && /^\s*CC/i.test(no)) return no
    }
  }
  if (preferred && /^\s*CC/i.test(preferred)) return preferred
  return LAB_CALIBRATION_ACCREDITATION_DEFAULT
}

/** True when `ulr` is a calibration certificate ULR (CC series). */
export function isCalibrationUlr(ulr: string | null | undefined): boolean {
  return /^CC/.test(splitNablUlrRevision(ulr ?? '').base)
}

/**
 * Next ULR for Calibration Certificates: CC + calibration accreditation
 * number + year + location, with its own serial (OQ-02, 23 Oct 2026: the
 * certificates had taken the testing TC prefix and two serials of test
 * reports). Counts every ULR in use, test reports included.
 */
export async function fetchNextCalibrationNablUlrNumber(opts?: {
  accreditationCertificateNo?: string | null
  excludeJobId?: string
}): Promise<{ prefix: string; ulr: string; sequence: number }> {
  const accreditationNo = await fetchCalibrationAccreditationNo(opts?.accreditationCertificateNo)
  const prefix = buildCalibrationUlrHeaderPrefix(accreditationNo)
  let used = await fetchUsedUlrNumbers()
  if (opts?.excludeJobId) {
    const { data } = await supabase
      .from('calibration_jobs')
      .select('certificate_draft')
      .eq('id', opts.excludeJobId)
      .maybeSingle()
    const draft = (data as { certificate_draft?: Record<string, unknown> | null } | null)?.certificate_draft ?? {}
    const own = splitNablUlrRevision(String(draft.ulrNumber ?? '')).base
    if (own) used = used.filter((u) => splitNablUlrRevision(u).base !== own)
  }
  const sequence = highestUlrSerial(used, prefix, 'CC') + 1
  return {
    prefix,
    ulr: formatNablUlrNumber(prefix, sequence, 'CC'),
    sequence,
  }
}
