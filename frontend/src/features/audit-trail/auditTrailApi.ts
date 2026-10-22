import { supabase } from '@/lib/supabaseClient'
import type { AuditAction, AuditRow } from './auditTrailDiff'

export type AuditFilters = {
  table: string
  actor: string
  action: '' | AuditAction
  /** yyyy-mm-dd, local day, inclusive */
  from: string
  /** yyyy-mm-dd, local day, inclusive */
  to: string
  recordId: string
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  table: '',
  actor: '',
  action: '',
  from: '',
  to: '',
  recordId: '',
}

export type StaffOption = { id: string; name: string }

const AUDIT_COLUMNS = 'id, at, actor, table_name, row_id, action, old_row, new_row, reason'
export const AUDIT_EXPORT_LIMIT = 10000
const EXPORT_BATCH = 1000

function localDayStartIso(day: string, addDays = 0): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays)
  return d.toISOString()
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function buildQuery(filters: AuditFilters, withCount: boolean) {
  let query = supabase
    .from('audit_log')
    .select(AUDIT_COLUMNS, withCount ? { count: 'exact' } : undefined)
  if (filters.table) query = query.eq('table_name', filters.table)
  if (filters.actor) query = query.eq('actor', filters.actor)
  if (filters.action) query = query.eq('action', filters.action)
  const fromIso = filters.from ? localDayStartIso(filters.from) : null
  if (fromIso) query = query.gte('at', fromIso)
  const toIso = filters.to ? localDayStartIso(filters.to, 1) : null
  if (toIso) query = query.lt('at', toIso)
  const recordId = filters.recordId.trim()
  if (recordId) query = query.ilike('row_id', `%${escapeLike(recordId)}%`)
  return query.order('at', { ascending: false }).order('id', { ascending: false })
}

/** True for active Laboratory Director / Quality Manager (server decides). */
export async function canReadAuditLog(): Promise<boolean> {
  const { data, error } = await supabase.rpc('app_can_read_audit_log')
  if (error) throw error
  return data === true
}

export async function fetchAuditPage(
  filters: AuditFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: AuditRow[]; total: number }> {
  const from = (page - 1) * pageSize
  const { data, error, count } = await buildQuery(filters, true).range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 }
}

/** Every row matching the filters, newest first, capped at AUDIT_EXPORT_LIMIT. */
export async function fetchAuditRowsForExport(filters: AuditFilters): Promise<AuditRow[]> {
  const out: AuditRow[] = []
  while (out.length < AUDIT_EXPORT_LIMIT) {
    const { data, error } = await buildQuery(filters, false).range(out.length, out.length + EXPORT_BATCH - 1)
    if (error) throw error
    const batch = (data ?? []) as AuditRow[]
    out.push(...batch)
    if (batch.length < EXPORT_BATCH) break
  }
  return out.slice(0, AUDIT_EXPORT_LIMIT)
}

/** Staff the caller may see (RLS on user_profiles), for names and the user filter. */
export async function fetchStaffOptions(): Promise<StaffOption[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .order('full_name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => ({
    id: p.id,
    name: (p.full_name ?? '').trim() || p.id.slice(0, 8),
  }))
}

export { annotateAuditReason } from '@/lib/auditReason'
