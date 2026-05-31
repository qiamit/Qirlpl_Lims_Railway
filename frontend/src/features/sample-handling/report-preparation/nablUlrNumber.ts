import { supabase } from '@/lib/supabaseClient'
import { pickTestReportPrefixFromRows, type PrefixRow } from './testReportNumberPrefix'

/** Total ULR length (alphanumeric); last character is always F */
export const NABL_ULR_TOTAL_LENGTH = 18
export const NABL_ULR_LAST_CHAR = 'F'

export const DEFAULT_ULR_PREFIX = 'TC'

/** Lab Settings → Prefix's names for ULR, checked in order */
export const ULR_PREFIX_SETTING_NAMES = ['ULR Number', 'ULR', 'NABL ULR'] as const

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

/** Alphanumeric only, uppercase — for prefix segment inside ULR */
export function normalizeUlrAlphanumeric(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function sanitizeNablUlrInput(value: string): string {
  return normalizeUlrAlphanumeric(value).slice(0, NABL_ULR_TOTAL_LENGTH)
}

/**
 * Build 18-char ULR: `{prefix}{zeroPaddedSerial}{F}`.
 * Serial starts at 1; width fills space between prefix and trailing F.
 */
export function formatNablUlrNumber(prefix: string, sequence: number): string {
  const suffix = NABL_ULR_LAST_CHAR
  const p = normalizeUlrAlphanumeric(prefix)
  const seq = Math.max(1, Math.floor(sequence))
  const serialLen = Math.max(1, NABL_ULR_TOTAL_LENGTH - p.length - suffix.length)
  const maxPrefixLen = NABL_ULR_TOTAL_LENGTH - serialLen - suffix.length
  const usePrefix = p.slice(0, Math.max(0, maxPrefixLen))
  const actualSerialLen = NABL_ULR_TOTAL_LENGTH - usePrefix.length - suffix.length
  const serial = String(seq).padStart(actualSerialLen, '0').slice(-actualSerialLen)
  return `${usePrefix}${serial}${suffix}`
}

/** Extract serial from stored ULR if it matches prefix + ends with F */
export function parseNablUlrSequence(ulr: string, prefix: string): number | null {
  const raw = normalizeUlrAlphanumeric(ulr)
  if (raw.length !== NABL_ULR_TOTAL_LENGTH) return null
  if (raw.at(-1) !== NABL_ULR_LAST_CHAR) return null

  const p = normalizeUlrAlphanumeric(prefix)
  if (!raw.startsWith(p)) return null

  const middle = raw.slice(p.length, -1)
  if (!middle || !/^\d+$/.test(middle)) return null

  const n = parseInt(middle, 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

export function isValidNablUlrFormat(ulr: string, prefix: string): boolean {
  return parseNablUlrSequence(ulr, prefix) !== null
}

export async function fetchNextNablUlrNumber(excludeSampleId?: string): Promise<{
  prefix: string
  ulr: string
  sequence: number
}> {
  const prefix = await fetchUlrPrefix()

  let query = supabase
    .from('samples')
    .select('id, test_report_nabl_ulr_number')
    .not('test_report_nabl_ulr_number', 'is', null)

  if (excludeSampleId) {
    query = query.neq('id', excludeSampleId)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[fetchNextNablUlrNumber]', error.message)
    return { prefix, ulr: formatNablUlrNumber(prefix, 1), sequence: 1 }
  }

  let maxSeq = 0
  for (const row of Array.isArray(data) ? data : []) {
    const num = row.test_report_nabl_ulr_number as string | null
    if (!num?.trim()) continue
    const parsed = parseNablUlrSequence(num, prefix)
    if (parsed !== null && parsed > maxSeq) maxSeq = parsed
  }

  const sequence = maxSeq + 1
  return {
    prefix,
    ulr: formatNablUlrNumber(prefix, sequence),
    sequence,
  }
}
