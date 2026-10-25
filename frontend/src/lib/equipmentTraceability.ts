import { supabase } from '@/lib/supabaseClient'
import { EQUIPMENT_KIND_TESTING } from '@/lib/equipmentKind'

/**
 * ISO/IEC 17025 6.4 / 6.5 / 7.5.1 — equipment and reference materials used
 * for a result, and whether they may be used on the test date.
 *
 * The rules mirror public.equipment_usable_on() in
 * backend/supabase/migrations/20261026100100_equipment_traceability.sql.
 */

export type EquipmentUsedKind = 'equipment' | 'crm'

/** One item of test_allocation_parameters.equipment_used (snapshot at save time). */
export type EquipmentUsedSnapshot = {
  equipment_id: string
  kind: EquipmentUsedKind
  asset_code: string
  name: string
  cal_cert_no: string | null
  cal_due_date: string | null
  status_at_use: string | null
  crm_valid_upto: string | null
  /** Usability on the test date when the snapshot was taken. */
  usable?: boolean
  reason?: string | null
  /** Set only when the Laboratory Director overrode a block. */
  override_reason?: string
  override_by?: string
  override_by_name?: string
  override_at?: string
}

/**
 * "No equipment used" for a result (visual examination, calculation,
 * observation). Stored as the only item of equipment_used so the record says
 * explicitly that no equipment was needed, and why.
 */
export type NoEquipmentUsed = { kind: 'none'; reason: string }

/** One item of test_allocation_parameters.equipment_used. */
export type EquipmentUsedEntry = EquipmentUsedSnapshot | NoEquipmentUsed

export const NO_EQUIPMENT_LABEL = 'No equipment used (visual / calculation / observation)'

export function isNoEquipmentEntry(e: EquipmentUsedEntry | null | undefined): e is NoEquipmentUsed {
  return Boolean(e) && (e as { kind?: string }).kind === 'none'
}

/** The "no equipment used" entry of a list, when that is what was recorded. */
export function noEquipmentEntryOf(items: EquipmentUsedEntry[] | null | undefined): NoEquipmentUsed | null {
  return (items ?? []).find(isNoEquipmentEntry) ?? null
}

/** Equipment / CRM snapshots only (drops a "no equipment used" entry). */
export function equipmentSnapshotsOf(items: EquipmentUsedEntry[] | null | undefined): EquipmentUsedSnapshot[] {
  return (items ?? []).filter((e): e is EquipmentUsedSnapshot => !isNoEquipmentEntry(e))
}

/**
 * Does the list satisfy "equipment recorded for this result"? True for at
 * least one equipment / CRM, or a "no equipment used" entry with a reason.
 */
export function equipmentUsedIsRecorded(items: EquipmentUsedEntry[] | null | undefined): boolean {
  const none = noEquipmentEntryOf(items)
  if (none) return none.reason.trim() !== ''
  return equipmentSnapshotsOf(items).length > 0
}

export type EquipmentOption = {
  id: string
  kind: EquipmentUsedKind
  assetCode: string
  name: string
  location: string | null
  /** Department of the custodian (testing equipment only). */
  custodianDepartment: string | null
  calCertNo: string | null
  calDueDate: string | null
  status: string | null
  crmValidUpto: string | null
  /** Open breakdown register entries: register number, status and breakdown date. */
  openBreakdowns: Array<{ registerNo: string; status: string; date: string | null }>
}

export type EquipmentUsability = { usable: boolean; reason: string | null }

const BLOCKED_STATUSES = new Set([
  'out of service',
  'out-of-service',
  'out of order',
  'under repair',
  'in repair',
  'breakdown',
  'under breakdown',
  'scrapped',
  'retired',
  'condemned',
  'discarded',
])

const OPEN_BREAKDOWN_STATUSES = ['Open', 'Under Repair', 'Awaiting Verification']

const isoDate = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

export function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function isBlockedEquipmentStatus(status: string | null | undefined): boolean {
  return BLOCKED_STATUSES.has((status ?? '').trim().toLowerCase())
}

/** Same checks as equipment_usable_on(); `onDate` is an ISO date (defaults to today). */
export function checkEquipmentUsableOn(
  item: Pick<EquipmentOption, 'kind' | 'status' | 'calDueDate' | 'crmValidUpto' | 'openBreakdowns'>,
  onDate?: string | null,
): EquipmentUsability {
  const on = isoDate(onDate) ?? todayIso()
  const reasons: string[] = []
  if (item.kind === 'crm') {
    const valid = isoDate(item.crmValidUpto)
    if (valid && valid < on) reasons.push(`CRM expired on ${ddmmyyyy(valid)}`)
  } else {
    if (isBlockedEquipmentStatus(item.status)) reasons.push(`Status is ${(item.status ?? '').trim()}`)
    const due = isoDate(item.calDueDate)
    if (due && due < on) reasons.push(`Calibration overdue since ${ddmmyyyy(due)}`)
    const open = item.openBreakdowns.filter((b) => {
      const d = isoDate(b.date)
      return !d || d <= on
    })
    if (open.length > 0) {
      reasons.push(`Breakdown open: ${open.map((b) => `${b.registerNo || 'breakdown'} (${b.status})`).join(', ')}`)
    }
  }
  return reasons.length === 0 ? { usable: true, reason: null } : { usable: false, reason: reasons.join('; ') }
}

/** PostgREST / Postgres "column does not exist" (migration not applied yet). */
export function isMissingColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'PGRST204' || e.code === '42703') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes('equipment_used') && (msg.includes('does not exist') || msg.includes('schema cache'))
}

export function parseEquipmentUsed(raw: unknown): EquipmentUsedEntry[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    .map((x): EquipmentUsedEntry =>
      x.kind === 'none'
        ? { kind: 'none', reason: String(x.reason ?? '') }
        : {
            ...(x as EquipmentUsedSnapshot),
            equipment_id: String(x.equipment_id ?? ''),
            kind: x.kind === 'crm' ? 'crm' : 'equipment',
            asset_code: String(x.asset_code ?? ''),
            name: String(x.name ?? ''),
            cal_cert_no: (x.cal_cert_no as string | null) ?? null,
            cal_due_date: (x.cal_due_date as string | null) ?? null,
            status_at_use: (x.status_at_use as string | null) ?? null,
            crm_valid_upto: (x.crm_valid_upto as string | null) ?? null,
          },
    )
}

export function snapshotFromOption(
  opt: EquipmentOption,
  onDate: string | null | undefined,
  override?: { reason: string; byId: string; byName: string },
): EquipmentUsedSnapshot {
  const check = checkEquipmentUsableOn(opt, onDate)
  return {
    equipment_id: opt.id,
    kind: opt.kind,
    asset_code: opt.assetCode,
    name: opt.name,
    cal_cert_no: opt.calCertNo,
    cal_due_date: opt.calDueDate,
    status_at_use: opt.status,
    crm_valid_upto: opt.crmValidUpto,
    usable: check.usable,
    reason: check.reason,
    ...(override && !check.usable
      ? {
          override_reason: override.reason,
          override_by: override.byId,
          override_by_name: override.byName,
          override_at: new Date().toISOString(),
        }
      : {}),
  }
}

/** Short one-line label, e.g. "EQ-001 Balance (cal due 01-01-2027)". */
export function formatEquipmentUsed(s: EquipmentUsedEntry): string {
  if (isNoEquipmentEntry(s)) {
    return s.reason.trim() ? `No equipment used: ${s.reason.trim()}` : 'No equipment used'
  }
  const head = [s.asset_code, s.name].filter((x) => x && x.trim()).join(' ') || s.equipment_id
  const due = isoDate(s.kind === 'crm' ? s.crm_valid_upto : s.cal_due_date)
  const tail = due ? ` (${s.kind === 'crm' ? 'valid upto' : 'cal due'} ${ddmmyyyy(due)})` : ''
  return `${head}${tail}`
}

/**
 * Testing equipment (equipment_master, kind testing) and CRMs, with open
 * breakdowns. Soft-deleted rows are hidden by RLS and never offered.
 */
export async function loadEquipmentOptions(): Promise<EquipmentOption[]> {
  const [eqRes, crmRes, bdRes] = await Promise.all([
    supabase
      .from('equipment_master')
      .select(
        'id, asset_code, equipment_name, equipment_status, next_calibration_due, calibration_certificate_number, current_location, custodian_employee_id',
      )
      .eq('equipment_kind', EQUIPMENT_KIND_TESTING)
      .order('asset_code', { ascending: true }),
    supabase
      .from('equipment_crms')
      .select('id, id_no, crm_type, make, valid_upto')
      .order('s_no', { ascending: true }),
    supabase
      .from('equipment_breakdown_register')
      .select('equipment_id, register_no, status, breakdown_date')
      .in('status', OPEN_BREAKDOWN_STATUSES),
  ])
  if (eqRes.error) throw eqRes.error

  const breakdowns = new Map<string, EquipmentOption['openBreakdowns']>()
  for (const raw of bdRes.error ? [] : (bdRes.data ?? [])) {
    const b = raw as { equipment_id: string | null; register_no: string; status: string; breakdown_date: string | null }
    if (!b.equipment_id) continue
    const list = breakdowns.get(b.equipment_id) ?? []
    list.push({ registerNo: b.register_no, status: b.status, date: b.breakdown_date })
    breakdowns.set(b.equipment_id, list)
  }

  type EqRaw = {
    id: string
    asset_code: string
    equipment_name: string
    equipment_status: string | null
    next_calibration_due: string | null
    calibration_certificate_number: string | null
    current_location: string | null
    custodian_employee_id: string | null
  }
  const eqRows = (eqRes.data ?? []) as EqRaw[]

  const custodianIds = [...new Set(eqRows.map((r) => r.custodian_employee_id).filter((x): x is string => Boolean(x)))]
  const deptById = new Map<string, string>()
  if (custodianIds.length > 0) {
    const { data } = await supabase.from('user_profiles').select('id, department_name').in('id', custodianIds)
    for (const raw of data ?? []) {
      const p = raw as { id: string; department_name: string | null }
      if (p.department_name?.trim()) deptById.set(p.id, p.department_name.trim())
    }
  }

  const equipment: EquipmentOption[] = eqRows.map((r) => ({
    id: r.id,
    kind: 'equipment',
    assetCode: r.asset_code ?? '',
    name: r.equipment_name ?? '',
    location: r.current_location,
    custodianDepartment: r.custodian_employee_id ? (deptById.get(r.custodian_employee_id) ?? null) : null,
    calCertNo: r.calibration_certificate_number,
    calDueDate: r.next_calibration_due,
    status: r.equipment_status,
    crmValidUpto: null,
    openBreakdowns: breakdowns.get(r.id) ?? [],
  }))

  const crms: EquipmentOption[] = (crmRes.error ? [] : (crmRes.data ?? [])).map((raw) => {
    const c = raw as { id: string; id_no: string; crm_type: string | null; make: string | null; valid_upto: string | null }
    return {
      id: c.id,
      kind: 'crm',
      assetCode: c.id_no ?? '',
      name: ['CRM', c.crm_type?.trim(), c.make?.trim() ? `(${c.make.trim()})` : ''].filter(Boolean).join(' '),
      location: null,
      custodianDepartment: null,
      calCertNo: null,
      calDueDate: null,
      status: null,
      crmValidUpto: c.valid_upto,
      openBreakdowns: [],
    }
  })

  return [...equipment, ...crms]
}

/** True when the option belongs to the lab section (location or custodian department matches). */
export function equipmentMatchesSection(opt: EquipmentOption, section: string | null | undefined): boolean {
  const s = (section ?? '').trim().toLowerCase()
  if (!s) return false
  if (opt.kind === 'crm') return true
  const loc = (opt.location ?? '').toLowerCase()
  const dept = (opt.custodianDepartment ?? '').toLowerCase()
  return (loc !== '' && (loc.includes(s) || s.includes(loc))) || (dept !== '' && dept === s)
}

/**
 * Reads equipment_used for saved result rows. `available` is false while the
 * migration is not applied (column missing): callers then skip the feature.
 */
export async function fetchEquipmentUsedByParamIds(
  ids: string[],
): Promise<{ available: boolean; byId: Record<string, EquipmentUsedEntry[]> }> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))]
  const query = supabase.from('test_allocation_parameters').select('id, equipment_used')
  const { data, error } =
    unique.length > 0 ? await query.in('id', unique) : await query.limit(1)
  if (error) {
    if (isMissingColumnError(error)) return { available: false, byId: {} }
    throw error
  }
  const byId: Record<string, EquipmentUsedEntry[]> = {}
  if (unique.length > 0) {
    for (const raw of data ?? []) {
      const r = raw as { id: string; equipment_used: unknown }
      byId[r.id] = parseEquipmentUsed(r.equipment_used)
    }
  }
  return { available: true, byId }
}

const LAST_SELECTION_PREFIX = 'lims.equipmentUsed.last.'

/** Last equipment ids chosen for a test parameter on this browser (saves clicks). */
export function readLastEquipmentSelection(paramKey: string): string[] {
  if (!paramKey) return []
  try {
    const raw = window.localStorage.getItem(LAST_SELECTION_PREFIX + paramKey)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function writeLastEquipmentSelection(paramKey: string, ids: string[]): void {
  if (!paramKey) return
  try {
    window.localStorage.setItem(LAST_SELECTION_PREFIX + paramKey, JSON.stringify(ids))
  } catch {
    // storage unavailable: nothing to remember
  }
}
