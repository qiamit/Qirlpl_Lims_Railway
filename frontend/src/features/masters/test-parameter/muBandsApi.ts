/**
 * MU by range band (ISO/IEC 17025 7.6, gap P3-2): Supabase access.
 * Table test_parameter_mu_bands (20261031100000_p3_good_practice.sql).
 * Until that migration is applied every call reports `available: false`
 * and muForResult() returns null, so callers keep their current behaviour.
 */
import { supabase } from '@/lib/supabaseClient'
import { isMissingTableError } from '@/lib/missingSchema'
import {
  isoDate,
  muForValue,
  normalizeMuBand,
  type MuBand,
  type MuBandDraft,
  type MuForResult,
  draftToPayload,
} from './muBands'

export type MuBandsLoad = { available: boolean; bands: MuBand[] }

const TABLE = 'test_parameter_mu_bands'

/** All bands (or the bands of some parameters). */
export async function fetchMuBands(parameterIds?: string[]): Promise<MuBandsLoad> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('test_parameter_id', { ascending: true })
    .order('range_from', { ascending: true, nullsFirst: true })
  if (parameterIds && parameterIds.length > 0) query = query.in('test_parameter_id', parameterIds)
  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error)) return { available: false, bands: [] }
    throw error
  }
  return {
    available: true,
    bands: (Array.isArray(data) ? data : []).map((r) => normalizeMuBand(r as Record<string, unknown>)),
  }
}

export async function saveMuBand(
  testParameterId: string,
  draft: MuBandDraft,
  id: string | null,
): Promise<void> {
  const payload = draftToPayload(draft, testParameterId)
  const res = id
    ? await supabase.from(TABLE).update(payload).eq('id', id).select('id')
    : await supabase.from(TABLE).insert(payload).select('id')
  if (res.error) throw res.error
  if (!res.data || res.data.length === 0) {
    throw new Error('Not saved: only the Laboratory Director, Quality Manager or a Technical Manager can maintain MU bands.')
  }
  invalidateMuBandCache(testParameterId)
}

export async function deleteMuBand(id: string, testParameterId: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Not deleted: only the Laboratory Director, Quality Manager or a Technical Manager can remove MU bands.')
  }
  invalidateMuBandCache(testParameterId)
}

// ---------------------------------------------------------------------------
// muForResult: single-result lookup. Report rows load all bands of a sample
// once (fetchMuBands) and select with reportMuUncertainty.ts instead.
// ---------------------------------------------------------------------------

const CACHE_MS = 60_000
const cache = new Map<string, { at: number; bands: MuBand[] | null }>()

export function invalidateMuBandCache(testParameterId?: string) {
  if (testParameterId) cache.delete(testParameterId)
  else cache.clear()
}

async function bandsFor(testParameterId: string): Promise<MuBand[] | null> {
  const hit = cache.get(testParameterId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.bands
  try {
    const res = await fetchMuBands([testParameterId])
    const bands = res.available ? res.bands : null
    cache.set(testParameterId, { at: Date.now(), bands })
    return bands
  } catch {
    return null
  }
}

/**
 * Expanded uncertainty that applies to a result of a test parameter.
 * Returns null when the migration is not applied, the parameter has no MU
 * bands, no band covers the value, or the bands cannot be read. Callers then
 * fall back to test_parameters.uncertainty_mu (the single MU text).
 *
 * `value` may be a number or the result text ("12.5", "< 0.1" is not numeric
 * and gives only a catch-all band).
 */
export async function muForResult(
  testParameterId: string | null | undefined,
  value: number | string | null | undefined,
  opts?: { onDate?: string },
): Promise<MuForResult | null> {
  const id = String(testParameterId ?? '').trim()
  if (!id) return null
  const bands = await bandsFor(id)
  if (!bands || bands.length === 0) return null
  const n =
    typeof value === 'number'
      ? value
      : value === null || value === undefined || String(value).trim() === ''
        ? null
        : /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(String(value).trim())
          ? Number(String(value).trim())
          : null
  return muForValue(bands, n, opts?.onDate ?? isoDate())
}
