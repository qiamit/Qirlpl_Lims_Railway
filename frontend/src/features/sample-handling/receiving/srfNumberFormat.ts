import { supabase } from '@/lib/supabaseClient'

/** Strip amendment (A) or supplementary (S) suffix from end of SRF. */
export function stripSrfReportSuffix(srf: string): string {
  const t = srf.trim()
  if (t.endsWith('A') || t.endsWith('S')) return t.slice(0, -1)
  return t
}

export type SrfNumberParts = {
  prefix: string
  yymmdd: string
  primarySerial: number
  secondarySerial: number
}

export function formatSrfYymmdd(dateStr?: string): string {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-')
    return y.slice(-2) + m + d
  }
  const today = new Date()
  return (
    today.getFullYear().toString().slice(-2) +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0')
  )
}

export async function fetchSrfPrefix(): Promise<string> {
  let prefix = 'SR'
  const { data: prefixRows } = await supabase
    .from('lab_prefixes')
    .select('name, prefix')
    .eq('name', 'SRF')
    .limit(1)
  if (prefixRows?.[0]?.prefix) prefix = String(prefixRows[0].prefix).trim() || prefix
  return prefix
}

/**
 * Parse base SRF (no A/S suffix).
 * Current compact: SR260608/1-001
 * Legacy slash: QI/SRF/260608/1-001 and older hyphen variants
 */
export function parseSrfNumberBase(value: string): SrfNumberParts | null {
  const base = stripSrfReportSuffix(value.trim())
  if (!base) return null

  const compactMatch = base.match(/^([A-Z]+)(\d{6})\/(\d+)-(\d{3})$/)
  if (compactMatch) {
    const primary = parseInt(compactMatch[3], 10)
    const secondary = parseInt(compactMatch[4], 10)
    if (Number.isNaN(primary) || Number.isNaN(secondary) || primary < 1 || secondary < 1) return null
    return {
      prefix: compactMatch[1],
      yymmdd: compactMatch[2],
      primarySerial: primary,
      secondarySerial: secondary,
    }
  }

  const slashMatch = base.match(/^(.+)\/(\d{6})\/(\d+)-(\d{3})$/)
  if (slashMatch) {
    const primary = parseInt(slashMatch[3], 10)
    const secondary = parseInt(slashMatch[4], 10)
    if (Number.isNaN(primary) || Number.isNaN(secondary) || primary < 1 || secondary < 1) return null
    return {
      prefix: slashMatch[1],
      yymmdd: slashMatch[2],
      primarySerial: primary,
      secondarySerial: secondary,
    }
  }

  const legacyHyphenNewMatch = base.match(/^(.+)-(\d{6})-(\d+)-(\d{3})$/)
  if (legacyHyphenNewMatch) {
    const primary = parseInt(legacyHyphenNewMatch[3], 10)
    const secondary = parseInt(legacyHyphenNewMatch[4], 10)
    if (Number.isNaN(primary) || Number.isNaN(secondary) || primary < 1 || secondary < 1) return null
    return {
      prefix: legacyHyphenNewMatch[1],
      yymmdd: legacyHyphenNewMatch[2],
      primarySerial: primary,
      secondarySerial: secondary,
    }
  }

  const legacySlashNewMatch = base.match(/^(.+)\/(\d{6})-(\d+)-(\d{3})$/)
  if (legacySlashNewMatch) {
    const primary = parseInt(legacySlashNewMatch[3], 10)
    const secondary = parseInt(legacySlashNewMatch[4], 10)
    if (Number.isNaN(primary) || Number.isNaN(secondary) || primary < 1 || secondary < 1) return null
    return {
      prefix: legacySlashNewMatch[1],
      yymmdd: legacySlashNewMatch[2],
      primarySerial: primary,
      secondarySerial: secondary,
    }
  }

  const legacySlashMatch = base.match(/^(.+)\/(\d{6})-(\d{2})$/)
  if (legacySlashMatch) {
    const serial = parseInt(legacySlashMatch[3], 10)
    if (Number.isNaN(serial) || serial < 1) return null
    return {
      prefix: legacySlashMatch[1],
      yymmdd: legacySlashMatch[2],
      primarySerial: serial,
      secondarySerial: 1,
    }
  }

  const legacyHyphenMatch = base.match(/^(.+)-(\d{6})-(\d{2})$/)
  if (legacyHyphenMatch) {
    const serial = parseInt(legacyHyphenMatch[3], 10)
    if (Number.isNaN(serial) || serial < 1) return null
    return {
      prefix: legacyHyphenMatch[1],
      yymmdd: legacyHyphenMatch[2],
      primarySerial: serial,
      secondarySerial: 1,
    }
  }

  return null
}

/** Build SRF: SR260608/1-001 (prefix + yymmdd / primary-secondary) */
export function formatSrfNumber(
  prefix: string,
  yymmdd: string,
  primarySerial: number,
  secondarySerial: number,
): string {
  const primary = Math.max(1, Math.floor(primarySerial))
  const secondary = Math.max(1, Math.floor(secondarySerial))
  if (prefix.includes('/')) {
    return `${prefix}/${yymmdd}/${primary}-${String(secondary).padStart(3, '0')}`
  }
  return `${prefix}${yymmdd}/${primary}-${String(secondary).padStart(3, '0')}`
}

export function srfNumberLikePattern(prefix: string, yymmdd: string): string {
  if (prefix.includes('/')) return `${prefix}%${yymmdd}%`
  return `${prefix}${yymmdd}%`
}

export function buildSrfValidationRegex(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (prefix.includes('/')) {
    return new RegExp(`^${escaped}\\/\\d{6}\\/\\d+-\\d{3}([AS])?$`)
  }
  return new RegExp(`^${escaped}\\d{6}\\/\\d+-\\d{3}([AS])?$`)
}

export function isValidSrfNumber(value: string, prefix: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const body = stripSrfReportSuffix(trimmed)
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const compactFmt = new RegExp(`^${escaped}\\d{6}\\/\\d+-\\d{3}$`)
  const slashFmt = new RegExp(`^${escaped}\\/\\d{6}\\/\\d+-\\d{3}$`)
  const legacyHyphenNewFmt = new RegExp(`^${escaped}-\\d{6}-\\d+-\\d{3}$`)
  const legacySlashNewFmt = new RegExp(`^${escaped}\\/\\d{6}-\\d+-\\d{3}$`)
  const legacySlashOldFmt = new RegExp(`^${escaped}\\/\\d{6}-\\d{2}$`)
  const legacyHyphenOldFmt = new RegExp(`^${escaped}-\\d{6}-\\d{2}$`)
  return (
    compactFmt.test(body) ||
    slashFmt.test(body) ||
    legacyHyphenNewFmt.test(body) ||
    legacySlashNewFmt.test(body) ||
    legacySlashOldFmt.test(body) ||
    legacyHyphenOldFmt.test(body)
  )
}

export function maxPrimarySerialForDate(
  numbers: string[],
  prefix: string,
  yymmdd: string,
): number {
  let maxPrimary = 0
  for (const raw of numbers) {
    const parts = parseSrfNumberBase(raw)
    if (!parts || parts.prefix !== prefix || parts.yymmdd !== yymmdd) continue
    maxPrimary = Math.max(maxPrimary, parts.primarySerial)
  }
  return maxPrimary
}

export function maxSecondarySerialForDate(
  numbers: string[],
  prefix: string,
  yymmdd: string,
  primarySerial: number,
): number {
  let maxSecondary = 0
  for (const raw of numbers) {
    const parts = parseSrfNumberBase(raw)
    if (
      !parts ||
      parts.prefix !== prefix ||
      parts.yymmdd !== yymmdd ||
      parts.primarySerial !== primarySerial
    ) {
      continue
    }
    maxSecondary = Math.max(maxSecondary, parts.secondarySerial)
  }
  return maxSecondary
}

export function maxPrimarySerialGlobal(numbers: string[], prefix: string): number {
  let maxPrimary = 0
  for (const raw of numbers) {
    const parts = parseSrfNumberBase(raw)
    if (!parts || parts.prefix !== prefix) continue
    maxPrimary = Math.max(maxPrimary, parts.primarySerial)
  }
  return maxPrimary
}
