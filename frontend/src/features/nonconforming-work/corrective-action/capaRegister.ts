import { supabase } from '@/lib/supabaseClient'

/**
 * Unified CAPA register (ISO/IEC 17025 8.7, 7.9, 7.10): the database view
 * capa_register_v (migration 20261029100300) lists every corrective action
 * from audit NCs, NC work records, complaints, unsatisfactory PT results and
 * management review actions, with owner, due date, status and effectiveness
 * review. Before the migration fetchCapaRegister() returns null and the hub
 * shows only its original list.
 */

export type CapaSource = 'audit' | 'ncw' | 'complaint' | 'pt' | 'mrm'
export type CapaStatus = 'open' | 'in_progress' | 'closed'
export type EffectivenessOutcome = 'effective' | 'not_effective'

export const CAPA_SOURCES: ReadonlyArray<{ value: CapaSource; label: string; clause: string }> = [
  { value: 'audit', label: 'Audit NC', clause: '8.8' },
  { value: 'ncw', label: 'NC work', clause: '7.10' },
  { value: 'complaint', label: 'Complaint', clause: '7.9' },
  { value: 'pt', label: 'PT / ILC', clause: '7.7' },
  { value: 'mrm', label: 'Management review', clause: '8.9' },
]

export const capaSourceLabel = (s: string) => CAPA_SOURCES.find((x) => x.value === s)?.label ?? s

export const CAPA_STATUS_LABEL: Record<CapaStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
}

export type CapaRegisterRow = {
  key: string
  source: CapaSource
  sourceId: string
  actionTable: string
  actionId: string | null
  ref: string
  description: string
  origin: string | null
  raisedAt: string | null
  ownerUserId: string | null
  ownerName: string | null
  dueOn: string | null
  status: CapaStatus
  closedOn: string | null
  overdue: boolean
  effectivenessReviewDueOn: string | null
  effectivenessOutcome: EffectivenessOutcome | null
  effectivenessVerifiedOn: string | null
  effectivenessVerifiedByName: string | null
  effectivenessDone: boolean
  effectivenessOverdue: boolean
  ncRecordId: string | null
  sampleId: string | null
}

const str = (v: unknown) => (v == null ? null : String(v))

function mapRow(r: Record<string, unknown>): CapaRegisterRow {
  const status = String(r.status ?? 'open')
  const outcome = str(r.effectiveness_outcome)
  return {
    key: `${r.source}:${r.source_id}`,
    source: String(r.source) as CapaSource,
    sourceId: String(r.source_id),
    actionTable: String(r.action_table ?? ''),
    actionId: str(r.action_id),
    ref: String(r.ref ?? ''),
    description: String(r.description ?? ''),
    origin: str(r.origin),
    raisedAt: str(r.raised_at),
    ownerUserId: str(r.owner_user_id),
    ownerName: str(r.owner_name),
    dueOn: str(r.due_on),
    status: (status === 'closed' || status === 'in_progress' ? status : 'open') as CapaStatus,
    closedOn: str(r.closed_on),
    overdue: r.overdue === true,
    effectivenessReviewDueOn: str(r.effectiveness_review_due_on),
    effectivenessOutcome: outcome === 'effective' || outcome === 'not_effective' ? outcome : null,
    effectivenessVerifiedOn: str(r.effectiveness_verified_on),
    effectivenessVerifiedByName: str(r.effectiveness_verified_by_name),
    effectivenessDone: r.effectiveness_done === true,
    effectivenessOverdue: r.effectiveness_overdue === true,
    ncRecordId: str(r.nc_record_id),
    sampleId: str(r.sample_id),
  }
}

/** null = view not available (migration not applied). Throws on other errors. */
export async function fetchCapaRegister(): Promise<CapaRegisterRow[] | null> {
  const { data, error } = await supabase.from('capa_register_v').select('*').order('raised_at', { ascending: false })
  if (error) {
    const msg = (error.message ?? '').toLowerCase()
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      (msg.includes('capa_register_v') && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')))
    ) {
      return null
    }
    throw error
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRow)
}

/** Owner / due / effectiveness can be kept for these sources; MRM actions belong to the minutes, PT needs an NC first. */
export function capaTrackingEditable(row: CapaRegisterRow): boolean {
  return row.source === 'audit' || row.source === 'ncw' || row.source === 'complaint'
}

export type CapaTracking = {
  ownerUserId: string
  ownerName: string
  dueOn: string
  /** audit / ncw only (complaints close on the complaint). */
  closedOn: string
  effectivenessReviewDueOn: string
  effectivenessOutcome: '' | EffectivenessOutcome
  effectivenessNotes: string
  effectivenessVerifiedOn: string
  /** Read only: stamped by the database. */
  effectivenessVerifiedByName: string
}

const TRACKING_COLUMNS =
  'capa_owner_user_id, capa_owner_name, capa_due_on, effectiveness_review_due_on, effectiveness_outcome, effectiveness_notes, effectiveness_verified_on, effectiveness_verified_by_name'

function trackingTarget(row: CapaRegisterRow): { table: string; keyColumn: string; hasClosedOn: boolean } {
  if (row.source === 'audit') return { table: 'audit_nc_actions', keyColumn: 'checklist_item_id', hasClosedOn: true }
  if (row.source === 'ncw') return { table: 'nc_work_corrective_actions', keyColumn: 'nc_work_record_id', hasClosedOn: true }
  return { table: 'customer_complaints', keyColumn: 'id', hasClosedOn: false }
}

const d = (v: unknown) => (v == null ? '' : String(v).slice(0, 10))

export async function loadCapaTracking(row: CapaRegisterRow): Promise<CapaTracking> {
  const t = trackingTarget(row)
  const { data, error } = await supabase
    .from(t.table)
    .select(t.hasClosedOn ? `${TRACKING_COLUMNS}, capa_closed_on` : TRACKING_COLUMNS)
    .eq(t.keyColumn, row.sourceId)
    .maybeSingle()
  if (error) throw error
  const r = (data ?? {}) as Record<string, unknown>
  const outcome = String(r.effectiveness_outcome ?? '')
  return {
    ownerUserId: String(r.capa_owner_user_id ?? ''),
    ownerName: String(r.capa_owner_name ?? ''),
    dueOn: d(r.capa_due_on),
    closedOn: d(r.capa_closed_on),
    effectivenessReviewDueOn: d(r.effectiveness_review_due_on),
    effectivenessOutcome: outcome === 'effective' || outcome === 'not_effective' ? outcome : '',
    effectivenessNotes: String(r.effectiveness_notes ?? ''),
    effectivenessVerifiedOn: d(r.effectiveness_verified_on),
    effectivenessVerifiedByName: String(r.effectiveness_verified_by_name ?? ''),
  }
}

/**
 * Saves the tracking fields on the action row (created for audit / NC when it
 * does not exist yet). Effectiveness fields are sent only by a verifier
 * (Director / QM / Technical Manager); the database enforces this too.
 */
export async function saveCapaTracking(row: CapaRegisterRow, t: CapaTracking, canVerify: boolean): Promise<void> {
  const target = trackingTarget(row)
  const payload: Record<string, unknown> = {
    capa_owner_user_id: t.ownerUserId || null,
    capa_owner_name: t.ownerName.trim() || null,
    capa_due_on: t.dueOn || null,
    effectiveness_review_due_on: t.effectivenessReviewDueOn || null,
  }
  if (target.hasClosedOn) payload.capa_closed_on = t.closedOn || null
  if (canVerify) {
    payload.effectiveness_outcome = t.effectivenessOutcome || null
    payload.effectiveness_notes = t.effectivenessNotes.trim() || null
    payload.effectiveness_verified_on = t.effectivenessOutcome ? t.effectivenessVerifiedOn || null : null
  }
  if (target.keyColumn === 'id') {
    const { error } = await supabase.from(target.table).update(payload).eq('id', row.sourceId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from(target.table)
    .upsert({ [target.keyColumn]: row.sourceId, ...payload }, { onConflict: target.keyColumn })
  if (error) throw error
}

export const CAPA_SOURCE_PATHS: Partial<Record<CapaSource, string>> = {
  complaint: '/complaints/customer-complaints',
  pt: '/quality/pt-participations',
  mrm: '/audit-mrm/management-review-meeting',
}
