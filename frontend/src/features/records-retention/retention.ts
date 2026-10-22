/**
 * Records retention schedule (ISO/IEC 17025 8.4.2).
 * Database: record_retention_rules + app_retention_past_due_counts() from
 * migration 20261028100000_document_control_and_retention.sql.
 * The count RPC only counts; nothing in the LIMS deletes records automatically.
 */
import { csvCell } from '@/lib/csv'
import { supabase } from '@/lib/supabaseClient'

export type RetentionRule = {
  id: string
  rule_key: string | null
  record_type: string
  clause: string | null
  table_name: string | null
  date_column: string | null
  filter_column: string | null
  filter_values: string[] | null
  retention_years: number
  retention_starts: string
  legal_basis: string | null
  disposal_method: string | null
  owner: string | null
  remarks: string | null
  sort_order: number
  active: boolean
  updated_at?: string
}

export type RetentionCount = {
  rule_id: string
  tracked: boolean
  total_count: number | null
  past_retention_count: number | null
  oldest_record: string | null
  cutoff: string | null
  note: string | null
}

type PgError = { code?: string; message?: string } | null | undefined

export function isRetentionMissingError(err: PgError): boolean {
  if (!err) return false
  if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(err.code ?? '')) return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    /(record_retention_rules|app_retention_past_due_counts)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function retentionErrorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export async function fetchRetentionRules(): Promise<RetentionRule[]> {
  const { data, error } = await supabase
    .from('record_retention_rules')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('record_type', { ascending: true })
  if (error) throw error
  return ((data ?? []) as RetentionRule[]).map((r) => ({ ...r, retention_years: Number(r.retention_years) }))
}

export async function fetchRetentionCounts(): Promise<Map<string, RetentionCount>> {
  const { data, error } = await supabase.rpc('app_retention_past_due_counts')
  if (error) throw error
  const map = new Map<string, RetentionCount>()
  for (const raw of (Array.isArray(data) ? data : []) as RetentionCount[]) {
    map.set(raw.rule_id, {
      ...raw,
      total_count: raw.total_count == null ? null : Number(raw.total_count),
      past_retention_count: raw.past_retention_count == null ? null : Number(raw.past_retention_count),
    })
  }
  return map
}

export type RetentionRuleEdit = Pick<
  RetentionRule,
  'retention_years' | 'retention_starts' | 'legal_basis' | 'disposal_method' | 'owner' | 'remarks' | 'active'
>

export async function updateRetentionRule(id: string, patch: RetentionRuleEdit): Promise<void> {
  const { data, error } = await supabase.from('record_retention_rules').update(patch).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Not saved: only the Laboratory Director or Quality Manager can change the retention schedule.')
  }
}

export function formatYears(years: number): string {
  if (!Number.isFinite(years)) return '—'
  if (Number.isInteger(years)) return `${years} year${years === 1 ? '' : 's'}`
  const months = Math.round(years * 12)
  return months < 24 ? `${months} months` : `${years} years`
}

export function retentionCsv(rules: RetentionRule[], counts: ReadonlyMap<string, RetentionCount>): string {
  const headers = [
    'Record type',
    'Clause',
    'Retention',
    'Retention starts',
    'Legal / normative basis',
    'Disposal method',
    'Owner',
    'Held in LIMS (table)',
    'Records held',
    'Past retention',
    'Oldest record',
    'Active',
    'Remarks',
  ]
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rules) {
    const c = counts.get(r.id)
    lines.push(
      [
        r.record_type,
        r.clause ?? '',
        formatYears(r.retention_years),
        r.retention_starts,
        r.legal_basis ?? '',
        r.disposal_method ?? '',
        r.owner ?? '',
        r.table_name ?? 'Paper / external',
        c?.total_count ?? '',
        c?.past_retention_count ?? '',
        c?.oldest_record ?? '',
        r.active ? 'Yes' : 'No',
        r.remarks ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}
