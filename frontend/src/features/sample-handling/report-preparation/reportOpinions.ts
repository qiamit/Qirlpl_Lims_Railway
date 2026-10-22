import { supabase } from '@/lib/supabaseClient'

/**
 * Opinions and interpretations (ISO/IEC 17025 7.8.7), stored on samples by
 * migration 20261029100300 and printed in Part C under OPINIONS_HEADING.
 * JSON-safe: also kept in the issued-report archive snapshot.
 */
export type ReportOpinions = {
  text: string
  basis: string
  byName: string | null
  /** ISO timestamp when the opinion was last written. */
  at: string | null
}

export const OPINIONS_HEADING = 'Opinions and interpretations'

export const OPINIONS_COLUMNS = 'opinions_text, opinions_basis, opinions_by, opinions_by_name, opinions_at'

/** null when there is nothing to print. */
export function opinionsFromSampleRow(row: Record<string, unknown> | null | undefined): ReportOpinions | null {
  if (!row) return null
  const text = String(row.opinions_text ?? '').trim()
  const basis = String(row.opinions_basis ?? '').trim()
  if (!text && !basis) return null
  const byName = String(row.opinions_by_name ?? '').trim()
  const at = String(row.opinions_at ?? '').trim()
  return { text, basis, byName: byName || null, at: at || null }
}

function isMissingOpinionsColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === '42703' || err.code === 'PGRST204') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('opinions_') && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
}

export type SampleOpinionsState = {
  /** false before migration 20261029100300 (section hidden, nothing printed). */
  available: boolean
  opinions: ReportOpinions | null
  opinionsBy: string | null
}

/** Never throws; unavailable on any read error. */
export async function fetchSampleOpinions(sampleId: string): Promise<SampleOpinionsState> {
  try {
    const { data, error } = await supabase.from('samples').select(OPINIONS_COLUMNS).eq('id', sampleId).maybeSingle()
    if (error) {
      if (!isMissingOpinionsColumn(error)) console.warn('[opinions] could not be read', error)
      return { available: false, opinions: null, opinionsBy: null }
    }
    const row = (data ?? null) as Record<string, unknown> | null
    return {
      available: true,
      opinions: opinionsFromSampleRow(row),
      opinionsBy: row?.opinions_by ? String(row.opinions_by) : null,
    }
  } catch (err) {
    console.warn('[opinions] could not be read', err)
    return { available: false, opinions: null, opinionsBy: null }
  }
}

/** Opinions for printing; null when none or not available. Never throws. */
export async function fetchSampleOpinionsForPrint(sampleId: string): Promise<ReportOpinions | null> {
  return (await fetchSampleOpinions(sampleId)).opinions
}
