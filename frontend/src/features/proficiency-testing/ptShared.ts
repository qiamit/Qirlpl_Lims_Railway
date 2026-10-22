/**
 * Proficiency testing / interlaboratory comparisons (ISO/IEC 17025 7.7.2).
 * Types and pure helpers shared by the PT pages.
 * Tables: migration 20261027100000_proficiency_testing.sql.
 */

export type PtScopeKind = 'testing' | 'calibration'
export type PtPerformance = 'satisfactory' | 'questionable' | 'unsatisfactory'
export type PtPlanStatus = 'planned' | 'enrolled' | 'participated' | 'postponed' | 'cancelled'
export type PtParticipationStatus = 'open' | 'closed'

export const PT_PERFORMANCES: readonly PtPerformance[] = ['satisfactory', 'questionable', 'unsatisfactory']
export const PT_PLAN_STATUSES: readonly PtPlanStatus[] = ['planned', 'enrolled', 'participated', 'postponed', 'cancelled']

export const PT_PLAN_STATUS_LABEL: Record<PtPlanStatus, string> = {
  planned: 'Planned',
  enrolled: 'Enrolled',
  participated: 'Participated',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
}

export const PT_PERFORMANCE_LABEL: Record<PtPerformance, string> = {
  satisfactory: 'Satisfactory',
  questionable: 'Questionable',
  unsatisfactory: 'Unsatisfactory',
}

export const PT_REPORTS_BUCKET = 'pt-reports'
export const PT_MIGRATION = '20261027100000_proficiency_testing.sql'
export const NC_RECORDS_PATH = '/nonconforming-work/records'
/** Proposed routes (wired in App / routeElements by the integrator). */
export const PT_PLAN_PATH = '/quality/pt-plan'
export const PT_PARTICIPATIONS_PATH = '/quality/pt-participations'

/** Years covered by one NABL PT plan. */
export const PT_PLAN_YEARS = 4

export type PtPlan = {
  id: string
  period_from: string
  period_to: string
  scope_kind: PtScopeKind
  discipline: string
  sub_discipline: string
  scope_ids: string[]
  parameters: string | null
  planned_year: number
  planned_provider_id: string | null
  scheme: string | null
  status: PtPlanStatus
  remarks: string | null
  created_at?: string
  updated_at?: string
}

export type PtParticipation = {
  id: string
  plan_id: string | null
  scope_kind: PtScopeKind
  discipline: string | null
  sub_discipline: string | null
  scope_ids: string[]
  provider_id: string | null
  provider_name: string | null
  provider_iso17043_accredited: boolean
  scheme_name: string | null
  round_code: string | null
  sample_description: string | null
  parameter: string
  unit: string | null
  method: string | null
  received_on: string | null
  reported_on: string | null
  lab_result: number | null
  assigned_value: number | null
  sd_for_pt: number | null
  lab_uncertainty: number | null
  ref_uncertainty: number | null
  coverage_factor: number
  provider_z_score: number | null
  provider_en_score: number | null
  z_score: number | null
  en_score: number | null
  zeta_score: number | null
  manual_performance: PtPerformance | null
  performance: PtPerformance | null
  analyst_user_id: string | null
  analyst_name: string | null
  report_path: string | null
  monitor_note: string | null
  remarks: string | null
  nc_record_id: string | null
  status: PtParticipationStatus
  created_at: string
  updated_at?: string
  /** PostgREST embed of nc_work_records (hidden when the NC was deleted). */
  nc?: { nc_id: string; status: string } | null
}

export type ProviderOption = { id: string; company_name: string; company_type: string | null }
export type StaffOption = { id: string; full_name: string | null }

export type TestingScopeRow = {
  id: string
  discipline_group: string | null
  materials_products: string | null
  component_parameter: string | null
  scope_status?: string | null
}

export type CalibrationScopeRow = {
  id: string
  discipline_name: string | null
  group_name: string | null
  measurand: string | null
}

/** True when the PT tables are not on this database yet. */
export function isPtMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /(pt_plans|pt_participations)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function ptErrorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function fmtScore(v: number | null | undefined): string {
  const n = num(v)
  return n === null ? '—' : n.toFixed(2)
}

export function fmtValue(v: number | null | undefined): string {
  const n = num(v)
  return n === null ? '—' : String(n)
}

// ---------------------------------------------------------------------------
// Score maths: same rules as the database (app_pt_z / app_pt_en /
// app_pt_zeta / app_pt_performance). Used for the live preview only; the
// stored scores always come from the database trigger.
// ---------------------------------------------------------------------------

/** Round half away from zero to 2 decimals, like PostgreSQL round(numeric, 2). */
function round2(v: number): number {
  const r = Math.round(Math.abs(v) * 100 + 1e-9) / 100
  return v < 0 ? -r : r
}

export function ptZ(x: number | null, assigned: number | null, sd: number | null): number | null {
  if (x === null || assigned === null || sd === null || sd <= 0) return null
  return round2((x - assigned) / sd)
}

export function ptEn(x: number | null, assigned: number | null, uLab: number | null, uRef: number | null): number | null {
  if (x === null || assigned === null || uLab === null || uRef === null) return null
  const den = uLab * uLab + uRef * uRef
  if (den <= 0) return null
  return round2((x - assigned) / Math.sqrt(den))
}

export function ptZeta(
  x: number | null,
  assigned: number | null,
  uLab: number | null,
  uRef: number | null,
  k: number | null,
): number | null {
  if (x === null || assigned === null || uLab === null || uRef === null || k === null || k <= 0) return null
  if (uLab * uLab + uRef * uRef <= 0) return null
  return round2((x - assigned) / Math.sqrt((uLab / k) ** 2 + (uRef / k) ** 2))
}

export function zClass(z: number | null): PtPerformance | null {
  if (z === null) return null
  const a = Math.abs(z)
  if (a <= 2) return 'satisfactory'
  if (a < 3) return 'questionable'
  return 'unsatisfactory'
}

export function enClass(en: number | null): PtPerformance | null {
  if (en === null) return null
  return Math.abs(en) <= 1 ? 'satisfactory' : 'unsatisfactory'
}

const RANK: Record<PtPerformance, number> = { satisfactory: 1, questionable: 2, unsatisfactory: 3 }

export function ptPerformance(z: number | null, en: number | null, manual: PtPerformance | null): PtPerformance | null {
  const zc = zClass(z)
  const ec = enClass(en)
  if (!zc && !ec) return manual
  const worst = Math.max(zc ? RANK[zc] : 1, ec ? RANK[ec] : 1)
  return PT_PERFORMANCES[worst - 1]
}

export type PtScoreInput = {
  lab_result: number | null
  assigned_value: number | null
  sd_for_pt: number | null
  lab_uncertainty: number | null
  ref_uncertainty: number | null
  coverage_factor: number | null
  provider_z_score: number | null
  provider_en_score: number | null
  manual_performance: PtPerformance | null
}

export type PtScores = {
  z: number | null
  en: number | null
  zeta: number | null
  zFromProvider: boolean
  enFromProvider: boolean
  performance: PtPerformance | null
}

export function computePtScores(i: PtScoreInput): PtScores {
  const zCalc = ptZ(i.lab_result, i.assigned_value, i.sd_for_pt)
  const enCalc = ptEn(i.lab_result, i.assigned_value, i.lab_uncertainty, i.ref_uncertainty)
  const z = zCalc ?? (i.provider_z_score === null ? null : round2(i.provider_z_score))
  const en = enCalc ?? (i.provider_en_score === null ? null : round2(i.provider_en_score))
  return {
    z,
    en,
    zeta: ptZeta(i.lab_result, i.assigned_value, i.lab_uncertainty, i.ref_uncertainty, i.coverage_factor ?? 2),
    zFromProvider: zCalc === null && z !== null,
    enFromProvider: enCalc === null && en !== null,
    performance: ptPerformance(z, en, i.manual_performance),
  }
}

/** What has to happen before a participation can be closed (null = may close). */
export function closeBlocker(p: Pick<PtParticipation, 'performance' | 'nc_record_id' | 'monitor_note'>): string | null {
  if (!p.performance) return 'Performance not known yet.'
  if (p.performance === 'unsatisfactory' && !p.nc_record_id) return 'Unsatisfactory: raise a nonconforming work record first.'
  if (p.performance === 'questionable' && !p.monitor_note?.trim()) return 'Questionable: add a monitoring note first.'
  return null
}

// ---------------------------------------------------------------------------
// Sub-disciplines and coverage
// ---------------------------------------------------------------------------

export function norm(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** A row of the plan grid: one sub-discipline of the scope. */
export type PtUnit = {
  key: string
  kind: PtScopeKind
  discipline: string
  /** '' = the whole discipline / group is one unit. */
  sub: string
  scopeIds: string[]
  /** Parameters / measurands in the scope rows of this unit (for the tooltip). */
  items: string[]
  inScope: boolean
}

export function unitKey(kind: PtScopeKind, discipline: string | null | undefined, sub: string | null | undefined): string {
  return `${kind}|${norm(discipline)}|${norm(sub)}`
}

export function unitLabel(u: Pick<PtUnit, 'discipline' | 'sub'>): string {
  return u.sub ? `${u.discipline} › ${u.sub}` : u.discipline
}

/**
 * Testing: sub-discipline = nabl_scope.discipline_group (or discipline_group
 * + materials_products when byProduct). Calibration: discipline_name + group_name.
 */
export function buildScopeUnits(
  testing: TestingScopeRow[],
  calibration: CalibrationScopeRow[],
  byProduct: boolean,
): PtUnit[] {
  const map = new Map<string, PtUnit>()
  const add = (kind: PtScopeKind, discipline: string, sub: string, id: string, item: string) => {
    if (!discipline.trim()) return
    const key = unitKey(kind, discipline, sub)
    let u = map.get(key)
    if (!u) {
      u = { key, kind, discipline: discipline.trim(), sub: sub.trim(), scopeIds: [], items: [], inScope: true }
      map.set(key, u)
    }
    u.scopeIds.push(id)
    if (item.trim() && !u.items.includes(item.trim())) u.items.push(item.trim())
  }
  for (const r of testing) {
    add('testing', r.discipline_group ?? '', byProduct ? r.materials_products ?? '' : '', r.id, r.component_parameter ?? '')
  }
  for (const r of calibration) {
    add('calibration', r.discipline_name ?? '', r.group_name ?? '', r.id, r.measurand ?? '')
  }
  return [...map.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.discipline.localeCompare(b.discipline) || a.sub.localeCompare(b.sub),
  )
}

/** Does a plan row / participation belong to this unit? */
export function inUnit(
  u: Pick<PtUnit, 'kind' | 'discipline' | 'sub'>,
  rec: { scope_kind: PtScopeKind; discipline: string | null; sub_discipline: string | null },
): boolean {
  if (rec.scope_kind !== u.kind || norm(rec.discipline) !== norm(u.discipline)) return false
  return !u.sub || norm(rec.sub_discipline) === norm(u.sub)
}

/** Units from plan rows / participations that are not in the scope tables. */
export function extraUnits(
  units: PtUnit[],
  recs: Array<{ scope_kind: PtScopeKind; discipline: string | null; sub_discipline: string | null }>,
): PtUnit[] {
  const out = new Map<string, PtUnit>()
  for (const r of recs) {
    if (!r.discipline?.trim()) continue
    if (units.some((u) => inUnit(u, r))) continue
    const key = unitKey(r.scope_kind, r.discipline, r.sub_discipline)
    if (!out.has(key)) {
      out.set(key, {
        key,
        kind: r.scope_kind,
        discipline: r.discipline.trim(),
        sub: (r.sub_discipline ?? '').trim(),
        scopeIds: [],
        items: [],
        inScope: false,
      })
    }
  }
  return [...out.values()]
}

/** Year a participation counts for: reported, else received, else entered. */
export function participationYear(p: Pick<PtParticipation, 'reported_on' | 'received_on' | 'created_at'>): number {
  const d = p.reported_on || p.received_on || p.created_at
  return Number(String(d).slice(0, 4))
}

export function participationDate(p: Pick<PtParticipation, 'reported_on' | 'received_on' | 'created_at'>): string {
  return String(p.reported_on || p.received_on || p.created_at).slice(0, 10)
}

export type CellState = 'done' | 'planned' | 'missed' | 'none'

export type GridCell = {
  state: CellState
  plans: PtPlan[]
  participations: PtParticipation[]
  worst: PtPerformance | null
}

export function worstPerformance(list: Array<PtPerformance | null>): PtPerformance | null {
  let best: PtPerformance | null = null
  for (const p of list) {
    if (!p) continue
    if (!best || RANK[p] > RANK[best]) best = p
  }
  return best
}

/**
 * done = a participation in that year; planned = a plan row (current or
 * future year, or not cancelled); missed = a plan row for a past year with no
 * participation; none = nothing planned.
 */
export function gridCell(
  unit: PtUnit,
  year: number,
  plans: PtPlan[],
  parts: PtParticipation[],
  currentYear: number,
): GridCell {
  const ps = plans.filter((p) => p.planned_year === year && inUnit(unit, p))
  const pp = parts.filter(
    (p) => participationYear(p) === year && (inUnit(unit, p) || (p.plan_id !== null && ps.some((x) => x.id === p.plan_id))),
  )
  const live = ps.filter((p) => p.status !== 'cancelled')
  let state: CellState = 'none'
  if (pp.length || live.some((p) => p.status === 'participated')) state = 'done'
  else if (live.length) state = year < currentYear ? 'missed' : 'planned'
  return { state, plans: ps, participations: pp, worst: worstPerformance(pp.map((p) => p.performance)) }
}

/** ISO date of the day `years` years before today (local). */
export function yearsAgoIso(years: number, today = new Date()): string {
  const d = new Date(today.getFullYear() - years, today.getMonth(), today.getDate())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayIso(today = new Date()): string {
  return yearsAgoIso(0, today)
}

/** Last PT of each unit and whether it is within the last 4 years. */
export function coverageGaps(
  units: PtUnit[],
  parts: PtParticipation[],
  today = new Date(),
): Array<{ unit: PtUnit; last: PtParticipation | null }> {
  const since = yearsAgoIso(PT_PLAN_YEARS, today)
  const out: Array<{ unit: PtUnit; last: PtParticipation | null }> = []
  for (const u of units) {
    if (!u.inScope) continue
    const mine = parts.filter((p) => inUnit(u, p)).sort((a, b) => participationDate(b).localeCompare(participationDate(a)))
    const last = mine[0] ?? null
    if (!last || participationDate(last) < since) out.push({ unit: u, last })
  }
  return out
}

export function performanceTone(p: PtPerformance | null): string {
  if (p === 'satisfactory') return 'border-emerald-700/40 bg-emerald-100 text-emerald-800'
  if (p === 'questionable') return 'border-amber-700/50 bg-amber-100 text-amber-900'
  if (p === 'unsatisfactory') return 'border-red-700/50 bg-red-100 text-red-800'
  return 'border-stone-400 bg-stone-100 text-stone-600'
}
