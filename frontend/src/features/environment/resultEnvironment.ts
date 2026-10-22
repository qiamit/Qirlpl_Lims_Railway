import { supabase } from '@/lib/supabaseClient'
import { parseResultEnvironmentSnapshot, type ResultEnvironmentSnapshot } from './resultEnvironmentSnapshot'

/**
 * Environmental conditions on test results (ISO/IEC 17025 7.5.1):
 * test_allocation_parameters.environment_area_id / environment_snapshot
 * (migration 20261026100300). Every reader here degrades to "not available"
 * while the migration is not applied.
 */

export type LabAreaOption = { id: string; code: string; name: string; department: string | null }

export type SavedResultEnvironment = {
  areaId: string | null
  snapshot: ResultEnvironmentSnapshot | null
}

/** PostgREST / Postgres "column or table does not exist" for the environment columns. */
export function isMissingEnvironmentColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'PGRST204' || e.code === '42703' || e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    (msg.includes('environment_') || msg.includes('lab_areas')) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

/**
 * Saved area + snapshot for result rows. `available` is false while the
 * migration is not applied (callers then hide the feature and send nothing).
 */
export async function fetchResultEnvironmentByParamIds(
  ids: string[],
): Promise<{ available: boolean; byId: Record<string, SavedResultEnvironment> }> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))]
  const query = supabase.from('test_allocation_parameters').select('id, environment_area_id, environment_snapshot')
  const { data, error } = unique.length > 0 ? await query.in('id', unique) : await query.limit(1)
  if (error) {
    if (isMissingEnvironmentColumnError(error)) return { available: false, byId: {} }
    throw error
  }
  const byId: Record<string, SavedResultEnvironment> = {}
  if (unique.length > 0) {
    for (const raw of data ?? []) {
      const r = raw as { id: string; environment_area_id: string | null; environment_snapshot: unknown }
      byId[r.id] = {
        areaId: r.environment_area_id ?? null,
        snapshot: parseResultEnvironmentSnapshot(r.environment_snapshot),
      }
    }
  }
  return { available: true, byId }
}

/** Snapshots for report printing; {} when the migration is not applied. */
export async function fetchResultEnvironmentSnapshots(
  parameterIds: string[],
): Promise<Record<string, ResultEnvironmentSnapshot>> {
  const unique = [...new Set(parameterIds.map((x) => x.trim()).filter(Boolean))]
  if (unique.length === 0) return {}
  try {
    const { byId } = await fetchResultEnvironmentByParamIds(unique)
    const out: Record<string, ResultEnvironmentSnapshot> = {}
    for (const [id, saved] of Object.entries(byId)) if (saved.snapshot) out[id] = saved.snapshot
    return out
  } catch (err) {
    if (isMissingEnvironmentColumnError(err)) return {}
    throw err
  }
}

/** Active lab areas for the picker; [] when the environment tables are missing. */
export async function loadLabAreaOptions(): Promise<LabAreaOption[]> {
  const { data, error } = await supabase
    .from('lab_areas')
    .select('id, code, name, department')
    .eq('active', true)
    .order('code', { ascending: true })
  if (error) {
    if (isMissingEnvironmentColumnError(error)) return []
    throw error
  }
  return (data ?? []).map((raw) => {
    const a = raw as { id: string; code: string; name: string; department: string | null }
    return { id: a.id, code: a.code ?? '', name: a.name ?? '', department: a.department ?? null }
  })
}

const pad = (n: number) => String(n).padStart(2, '0')
const localIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const asIsoDate = (v: string | null | undefined): string => {
  const s = (v ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 1000 ? s : ''
}

export type TestPeriod = {
  /** First and last day (YYYY-MM-DD). */
  startDate: string
  endDate: string
  /** Start of the first day / end of the last day, local time, as ISO timestamps. */
  from: string
  to: string
  key: string
}

/**
 * Test period from the start / end dates of a result: start of the start date
 * to end of the end date (local time). A missing date falls back to the other
 * one, then to today.
 */
export function testPeriodOf(start: string | null | undefined, end: string | null | undefined): TestPeriod {
  const today = localIsoDate(new Date())
  const s = asIsoDate(start) || asIsoDate(end) || today
  const e = asIsoDate(end) || asIsoDate(start) || today
  const [first, last] = s <= e ? [s, e] : [e, s]
  return {
    startDate: first,
    endDate: last,
    from: new Date(`${first}T00:00:00`).toISOString(),
    to: new Date(`${last}T23:59:59.999`).toISOString(),
    key: `${first}|${last}`,
  }
}

const LAST_AREA_PREFIX = 'lims.environmentArea.section.'

/** Last lab area chosen for a section on this browser. */
export function readLastSectionArea(sectionKey: string): string {
  if (!sectionKey) return ''
  try {
    return window.localStorage.getItem(LAST_AREA_PREFIX + sectionKey) ?? ''
  } catch {
    return ''
  }
}

export function writeLastSectionArea(sectionKey: string, areaId: string): void {
  if (!sectionKey) return
  try {
    if (areaId) window.localStorage.setItem(LAST_AREA_PREFIX + sectionKey, areaId)
    else window.localStorage.removeItem(LAST_AREA_PREFIX + sectionKey)
  } catch {
    // storage unavailable: nothing to remember
  }
}
