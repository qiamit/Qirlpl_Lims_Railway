import { supabase } from '@/lib/supabaseClient'
import { fetchDeletedKeys } from '@/lib/softDelete'
import {
  fetchSrfPrefix,
  formatSrfNumber,
  formatSrfYymmdd,
  maxPrimarySerialForDate,
  maxPrimarySerialGlobal,
  maxSecondarySerialForDate,
  srfNumberLikePattern,
} from './srfNumberFormat'

/**
 * Generate next SRF:
 * Format: SR260608/1-001
 * - SR: fixed prefix
 * - 260608: receiving date (yymmdd)
 * - 1: primary serial — new number when date changes
 * - 001: secondary serial — increments per SRF on same date, resets on date change
 */
export async function generateNextSrfNumber(dateStr?: string): Promise<string> {
  const yymmdd = formatSrfYymmdd(dateStr)
  const prefix = await fetchSrfPrefix()
  const datePattern = srfNumberLikePattern(prefix, yymmdd)

  const [{ data: existingForDate }, deletedNumbers] = await Promise.all([
    supabase
      .from('samples')
      .select('srf_number')
      .not('srf_number', 'is', null)
      .like('srf_number', datePattern),
    // SRF numbers of deleted samples are never reused (the helpers below filter by prefix / date).
    fetchDeletedKeys('samples', 'srf_number'),
  ])

  const dateNumbers = [
    ...(existingForDate ?? [])
      .map((r) => (r as { srf_number?: string }).srf_number)
      .filter((n): n is string => typeof n === 'string'),
    ...deletedNumbers,
  ]

  const primaryForDate = maxPrimarySerialForDate(dateNumbers, prefix, yymmdd)

  if (primaryForDate > 0) {
    const nextSecondary = maxSecondarySerialForDate(dateNumbers, prefix, yymmdd, primaryForDate) + 1
    return formatSrfNumber(prefix, yymmdd, primaryForDate, nextSecondary)
  }

  const prefixPattern = prefix.includes('/') ? `${prefix}%` : `${prefix}%`
  const { data: allForPrefix } = await supabase
    .from('samples')
    .select('srf_number')
    .not('srf_number', 'is', null)
    .like('srf_number', prefixPattern)

  const allNumbers = [
    ...(allForPrefix ?? [])
      .map((r) => (r as { srf_number?: string }).srf_number)
      .filter((n): n is string => typeof n === 'string'),
    ...deletedNumbers,
  ]

  const nextPrimary = maxPrimarySerialGlobal(allNumbers, prefix) + 1
  return formatSrfNumber(prefix, yymmdd, nextPrimary, 1)
}
