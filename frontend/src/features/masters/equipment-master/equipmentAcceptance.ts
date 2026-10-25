/**
 * Equipment acceptance / commissioning (ISO/IEC 17025 6.4.1 - 6.4.4) and
 * correction factors (6.4.11). Tables from migration
 * 20261028100200_control_charts_equipment_acceptance.sql; every loader here
 * returns null when that migration is not applied yet.
 */
import { supabase } from '@/lib/supabaseClient'
import type { EquipmentRow } from './types'

export type AcceptanceResult = 'accepted' | 'conditional' | 'rejected'

export type AcceptanceCheck = {
  item: string
  expected: string
  observed: string
  /** true = OK, false = not OK, null = not applicable / not answered. */
  ok: boolean | null
}

export type AcceptanceRecord = {
  id: string
  equipment_id: string
  checks: AcceptanceCheck[] | null
  initial_calibration_ref: string | null
  initial_calibration_id: string | null
  accepted_on: string
  result: AcceptanceResult
  conditions: string | null
  remarks: string | null
  accepted_by_name: string | null
  created_at: string
}

export type LatestAcceptance = Pick<AcceptanceRecord, 'result' | 'accepted_on' | 'accepted_by_name'>

/** What the equipment list shows. legacy = in service before acceptance records existed. */
export type AcceptanceState = AcceptanceResult | 'pending' | 'legacy'

export const ACCEPTANCE_STATE_UI: Record<AcceptanceState, { text: string; className: string; title: string }> = {
  accepted: {
    text: 'Accepted',
    className: 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
    title: 'Accepted / commissioned before use (ISO 17025 6.4.1)',
  },
  conditional: {
    text: 'Accepted (cond.)',
    className: 'border-sky-700/40 bg-sky-100 text-sky-900',
    title: 'Accepted with conditions',
  },
  rejected: {
    text: 'Rejected',
    className: 'border-red-700/50 bg-red-100 text-red-800',
    title: 'Acceptance rejected: not to be used',
  },
  pending: {
    text: 'Not yet accepted',
    className: 'border-amber-700/50 bg-amber-100 text-amber-900',
    title: 'Record acceptance / commissioning before this equipment is placed in service',
  },
  legacy: {
    text: 'No acceptance record',
    className: 'border-stone-400 bg-stone-100 text-stone-600',
    title: 'In service before acceptance records were kept',
  },
}

export const DEFAULT_ACCEPTANCE_CHECKS: AcceptanceCheck[] = [
  { item: 'Delivered as ordered (make, model, serial no., accessories)', expected: 'As per purchase order', observed: '', ok: null },
  { item: 'Physical condition, no transit damage', expected: 'No damage', observed: '', ok: null },
  { item: 'Manual, certificates, software / firmware version recorded', expected: 'Available', observed: '', ok: null },
  { item: 'Installation, utilities and location / environment suitable', expected: 'As per manufacturer', observed: '', ok: null },
  { item: 'Functional check / self-test', expected: 'Passes', observed: '', ok: null },
  { item: 'Initial calibration / verification within acceptance criteria (6.4.4, 6.4.6)', expected: 'Within criteria', observed: '', ok: null },
  { item: 'Adjustments protected (seal / password) (6.4.12)', expected: 'Protected', observed: '', ok: null },
  { item: 'Operators trained and authorized', expected: 'Trained', observed: '', ok: null },
]

export function isMissingTableError(err: unknown, table: string): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes(table) && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
}

/** Latest acceptance record per equipment, or null when the table is not on this database. */
export async function fetchLatestAcceptance(): Promise<Map<string, LatestAcceptance> | null> {
  const { data, error } = await supabase
    .from('equipment_acceptance')
    .select('equipment_id, result, accepted_on, accepted_by_name, created_at')
    .order('accepted_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingTableError(error, 'equipment_acceptance')) return null
    console.warn('Could not load equipment acceptance records:', error)
    return new Map()
  }
  const map = new Map<string, LatestAcceptance>()
  for (const r of (data ?? []) as Array<LatestAcceptance & { equipment_id: string }>) {
    if (!map.has(r.equipment_id)) {
      map.set(r.equipment_id, { result: r.result, accepted_on: r.accepted_on, accepted_by_name: r.accepted_by_name })
    }
  }
  return map
}

export function acceptanceStateFor(row: EquipmentRow, latest: LatestAcceptance | undefined): AcceptanceState {
  if (latest) return latest.result
  return row.acceptance_required ? 'pending' : 'legacy'
}

/** Friendly text for a refused write (RLS / grants). */
export function authorizeErrorText(err: unknown, what: string): string {
  const e = err as { code?: string; message?: string } | null
  const msg = e?.message ?? (err instanceof Error ? err.message : '')
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return `Only the Laboratory Director, Quality Manager or a Technical Manager can ${what}.`
  }
  return msg || 'Save failed'
}
