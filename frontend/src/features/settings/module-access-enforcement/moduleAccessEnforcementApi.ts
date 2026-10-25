/**
 * Database-level module access (migration 20261029100200_db_module_access.sql).
 * Director-only reads and RPCs for the enforcement page.
 */
import { supabase } from '@/lib/supabaseClient'
import type { ModuleAccessLevel } from '@/features/settings/module-access/moduleCatalog'

export type EnforcementMode = 'off' | 'log' | 'enforce_writes' | 'enforce'

export const ENFORCEMENT_MODES: { value: EnforcementMode; label: string; help: string }[] = [
  { value: 'off', label: 'Off', help: 'Nothing is checked in the database (UI checks only).' },
  {
    value: 'log',
    label: 'Log only',
    help: 'Nothing is blocked. Writes a user would not be allowed to make are recorded below. Reads are not recorded.',
  },
  {
    value: 'enforce_writes',
    label: 'Enforce writes',
    help: 'Insert / update / delete need Edit (or View where noted) on a module that uses the table. Reads stay open.',
  },
  {
    value: 'enforce',
    label: 'Enforce',
    help: 'Writes as above, and reading a table needs View on a module that uses it (reference tables stay readable).',
  },
]

export type EnforcementState = {
  mode: EnforcementMode
  changed_at: string | null
  changed_by: string | null
  reason: string | null
}

export type DenialRow = {
  id: number
  user_id: string | null
  table_name: string
  op: string
  mode: string
  paths: string[]
  levels: Record<string, ModuleAccessLevel>
  bucket: string
  first_at: string
  last_at: string
  hits: number
}

export type DryRunRow = {
  table_name: string
  can_view: boolean
  can_edit: boolean
  read_open: boolean
  view_paths: string[]
  edit_paths: string[]
  mapped_paths: string[]
}

export type DryRunSummaryRow = {
  user_id: string
  full_name: string | null
  designation: string | null
  department_name: string | null
  has_user_rules: boolean
  tables_mapped: number
  tables_no_view: number
  tables_no_edit: number
}

export type ProfileLite = {
  id: string
  full_name: string | null
  designation: string | null
  department_name: string | null
  division: string | null
  status: string | null
}

type PgError = { code?: string; message?: string }

/** True when the migration is not on this database yet. */
export function isEnforcementMissingError(err: unknown): boolean {
  const e = err as PgError | null
  const code = e?.code ?? ''
  const msg = (e?.message ?? '').toLowerCase()
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    (msg.includes('module_access_enforcement') && msg.includes('does not exist'))
  )
}

export function enforcementErrorText(err: unknown): string {
  if (err instanceof Error) return err.message
  const e = err as PgError | null
  return e?.message || 'Unexpected error'
}

export async function fetchEnforcementState(): Promise<EnforcementState> {
  const { data, error } = await supabase
    .from('module_access_enforcement')
    .select('mode, changed_at, changed_by, reason')
    .maybeSingle()
  if (error) throw error
  return (data as EnforcementState | null) ?? { mode: 'log', changed_at: null, changed_by: null, reason: null }
}

export async function setEnforcementMode(mode: EnforcementMode, reason: string): Promise<void> {
  const { error } = await supabase.rpc('app_set_module_access_mode', { p_mode: mode, p_reason: reason })
  if (error) throw error
}

export async function fetchDenials(sinceDays: number): Promise<DenialRow[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('module_access_denials')
    .select('id, user_id, table_name, op, mode, paths, levels, bucket, first_at, last_at, hits')
    .gte('last_at', since)
    .order('last_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  return (data ?? []) as DenialRow[]
}

export async function fetchDryRunSummary(): Promise<DryRunSummaryRow[]> {
  const { data, error } = await supabase.rpc('app_module_access_dry_run_summary')
  if (error) throw error
  return (Array.isArray(data) ? data : []) as DryRunSummaryRow[]
}

export async function fetchDryRun(userId: string): Promise<DryRunRow[]> {
  const { data, error } = await supabase.rpc('app_module_access_dry_run', { p_user_id: userId })
  if (error) throw error
  return (Array.isArray(data) ? data : []) as DryRunRow[]
}

export async function fetchDbLevels(userId: string): Promise<Map<string, ModuleAccessLevel>> {
  const { data, error } = await supabase.rpc('app_module_access_levels', { p_user_id: userId })
  if (error) throw error
  const map = new Map<string, ModuleAccessLevel>()
  for (const row of (Array.isArray(data) ? data : []) as { module_path: string; level: ModuleAccessLevel }[]) {
    map.set(row.module_path, row.level)
  }
  return map
}

export async function fetchCatalogKeys(): Promise<string[]> {
  const { data, error } = await supabase.from('module_access_catalog').select('module_key')
  if (error) throw error
  return ((data ?? []) as { module_key: string }[]).map((r) => r.module_key)
}

export async function syncCatalog(entries: { key: string; label: string; section: string }[]): Promise<number> {
  const { data, error } = await supabase.rpc('app_sync_module_access_catalog', { p_entries: entries })
  if (error) throw error
  return Number(data ?? 0)
}

export async function fetchProfiles(): Promise<ProfileLite[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, designation, department_name, division, status')
    .order('full_name')
  if (error) throw error
  return (data ?? []) as ProfileLite[]
}

/** Groups hourly denial rows by user and table. */
export type DenialGroup = {
  key: string
  user_id: string | null
  table_name: string
  ops: string[]
  hits: number
  first_at: string
  last_at: string
  paths: string[]
  levels: Record<string, ModuleAccessLevel>
}

export function groupDenials(rows: DenialRow[]): DenialGroup[] {
  const map = new Map<string, DenialGroup>()
  for (const r of rows) {
    const key = `${r.user_id ?? ''}|${r.table_name}`
    const g = map.get(key)
    if (!g) {
      map.set(key, {
        key,
        user_id: r.user_id,
        table_name: r.table_name,
        ops: [r.op],
        hits: r.hits,
        first_at: r.first_at,
        last_at: r.last_at,
        paths: r.paths ?? [],
        levels: r.levels ?? {},
      })
      continue
    }
    if (!g.ops.includes(r.op)) g.ops.push(r.op)
    g.hits += r.hits
    if (r.first_at < g.first_at) g.first_at = r.first_at
    if (r.last_at > g.last_at) {
      g.last_at = r.last_at
      g.levels = r.levels ?? g.levels
    }
  }
  return [...map.values()].sort((a, b) => (a.last_at < b.last_at ? 1 : -1))
}
