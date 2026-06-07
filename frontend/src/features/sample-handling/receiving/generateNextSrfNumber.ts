import { supabase } from '@/lib/supabaseClient'
import {
  fetchSrfPrefix,
  formatSrfNumber,
  formatSrfYymmdd,
  maxPrimarySerialForDate,
  srfNumberLikePattern,
} from './srfNumberFormat'

/**
 * Generate next SRF:
 * Format: {prefix}/{YYMMDD}/{primary}-{secondary3} e.g. QI/SRF/260607/1-001
 */
export async function generateNextSrfNumber(dateStr?: string): Promise<string> {
  const yymmdd = formatSrfYymmdd(dateStr)
  const prefix = await fetchSrfPrefix()
  const pattern = srfNumberLikePattern(prefix, yymmdd)
  const { data: existing } = await supabase
    .from('samples')
    .select('srf_number')
    .not('srf_number', 'is', null)
    .like('srf_number', pattern)
  const numbers = (existing ?? [])
    .map((r) => (r as { srf_number?: string }).srf_number)
    .filter((n): n is string => typeof n === 'string')

  const nextPrimary = maxPrimarySerialForDate(numbers, prefix, yymmdd) + 1
  return formatSrfNumber(prefix, yymmdd, nextPrimary, 1)
}
