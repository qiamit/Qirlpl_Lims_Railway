import { supabase } from '@/lib/supabaseClient'
import {
  effectiveActionStatus,
  shiftIsoDate,
  todayIso,
  type MrmFigure,
  type MrmInputSummary,
  type MrmSourceState,
} from './types'

/**
 * Auto-pull of management review inputs (ISO/IEC 17025 8.9.2 a - o) for a
 * review period. Every source is optional: a table that does not exist yet
 * (migration not applied) is reported as "no data source" and skipped.
 * Rows hidden by soft delete are never returned by PostgREST reads.
 */

type Row = Record<string, unknown>

type Filter =
  | { op: 'gte' | 'lte' | 'lt' | 'gt' | 'eq' | 'neq' | 'like'; col: string; value: string }
  | { op: 'in'; col: string; value: string[] }

type ReadResult = { state: MrmSourceState; rows: Row[] }

const MAX_ROWS = 5000
const MAX_ITEMS = 8

function isMissingError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205' || err.code === '42703' || err.code === 'PGRST204') return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    (msg.includes('relation') && msg.includes('does not exist')) ||
    msg.includes('could not find the table') ||
    (msg.includes('column') && msg.includes('does not exist'))
  )
}

async function readRows(
  key: string,
  label: string,
  table: string,
  columns: string,
  filters: Filter[] = [],
): Promise<ReadResult> {
  try {
    let q = supabase.from(table).select(columns)
    for (const f of filters) {
      if (f.op === 'in') {
        if (f.value.length === 0) return { state: { key, label, status: 'ok' }, rows: [] }
        q = q.in(f.col, f.value)
      } else if (f.op === 'gte') q = q.gte(f.col, f.value)
      else if (f.op === 'lte') q = q.lte(f.col, f.value)
      else if (f.op === 'lt') q = q.lt(f.col, f.value)
      else if (f.op === 'gt') q = q.gt(f.col, f.value)
      else if (f.op === 'eq') q = q.eq(f.col, f.value)
      else if (f.op === 'neq') q = q.neq(f.col, f.value)
      else q = q.like(f.col, f.value)
    }
    const { data, error } = await q.limit(MAX_ROWS)
    if (error) {
      if (isMissingError(error)) return { state: { key, label, status: 'missing' }, rows: [] }
      return { state: { key, label, status: 'error', message: error.message }, rows: [] }
    }
    return {
      state: { key, label, status: 'ok' },
      rows: (Array.isArray(data) ? data : []) as unknown as Row[],
    }
  } catch (err) {
    return {
      state: { key, label, status: 'error', message: err instanceof Error ? err.message : 'read failed' },
      rows: [],
    }
  }
}

const s = (v: unknown) => String(v ?? '').trim()
const blank = (v: unknown) => s(v) === ''
const d10 = (v: unknown) => s(v).slice(0, 10)

function countWhere(rows: Row[], pred: (r: Row) => boolean): number {
  let n = 0
  for (const r of rows) if (pred(r)) n += 1
  return n
}

function countBy(rows: Row[], col: string, order?: string[]): MrmFigure[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = s(r[col]) || 'Not set'
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const keys = order ? [...order.filter((k) => map.has(k)), ...[...map.keys()].filter((k) => !order.includes(k))] : [...map.keys()].sort()
  return keys.map((k) => ({ label: k, value: map.get(k) ?? 0 }))
}

function shorten(text: unknown, n = 90): string {
  const t = s(text).replace(/\s+/g, ' ')
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function warnIf(label: string, value: number): MrmFigure {
  return { label, value, tone: value > 0 ? 'warn' : undefined }
}

export type MrmPullContext = {
  from: string
  to: string
  meetingId: string
  heldOn: string
}

type Builder = (ctx: MrmPullContext) => Promise<Omit<MrmInputSummary, 'period' | 'pulledAt'>>

/** Timestamp filters covering whole days of the period. */
function tsRange(col: string, ctx: MrmPullContext): Filter[] {
  return [
    { op: 'gte', col, value: ctx.from },
    { op: 'lt', col, value: shiftIsoDate(ctx.to, { days: 1 }) },
  ]
}

function dateRange(col: string, ctx: MrmPullContext): Filter[] {
  return [
    { op: 'gte', col, value: ctx.from },
    { op: 'lte', col, value: ctx.to },
  ]
}

const builders: Record<string, Builder> = {
  // a) Changes in internal and external issues
  a: async (ctx) => {
    const acc = await readRows('lab_accreditations', 'Accreditations', 'lab_accreditations',
      'accreditation_body, accreditation_number, standard, valid_until, updated_at')
    const horizon = shiftIsoDate(ctx.to, { months: 6 })
    const expiring = acc.rows.filter((r) => d10(r.valid_until) && d10(r.valid_until) <= horizon)
    const changed = acc.rows.filter((r) => d10(r.updated_at) >= ctx.from && d10(r.updated_at) <= ctx.to)
    return {
      figures: acc.state.status === 'ok'
        ? [
            { label: 'Accreditations on record', value: acc.rows.length },
            { label: 'Updated in period', value: changed.length },
            warnIf('Expiring within 6 months of period end', expiring.length),
          ]
        : [],
      items: expiring.slice(0, MAX_ITEMS).map((r) =>
        `${s(r.accreditation_body)} ${s(r.accreditation_number)} (${s(r.standard)}) valid until ${d10(r.valid_until)}`),
      sources: [acc.state],
    }
  },

  // b) Fulfilment of objectives
  b: async (ctx) => {
    const obj = await readRows('gr_objectives', 'Quality objectives', 'gr_objectives',
      'objective_id, title, status, target_date')
    const missed = obj.rows.filter((r) => s(r.status) !== 'Achieved' && d10(r.target_date) && d10(r.target_date) <= ctx.to)
    return {
      figures: obj.state.status === 'ok'
        ? [
            { label: 'Objectives', value: obj.rows.length },
            ...countBy(obj.rows, 'status', ['Achieved', 'In Progress', 'Planned', 'Deferred']),
            warnIf('Target date passed, not achieved', missed.length),
          ]
        : [],
      items: missed.slice(0, MAX_ITEMS).map((r) =>
        `${s(r.objective_id)} ${shorten(r.title, 70)} — ${s(r.status)}, target ${d10(r.target_date)}`),
      sources: [obj.state],
    }
  },

  // c) Suitability of policies and procedures
  c: async (ctx) => {
    const ver = await readRows('management_document_versions', 'Document revisions', 'management_document_versions',
      'doc_number, title, revision_no, change_type, changed_at', tsRange('changed_at', ctx))
    const docs = await readRows('management_documents', 'Management documents', 'management_documents', 'status')
    return {
      figures: [
        ...(docs.state.status === 'ok' ? [{ label: 'Controlled documents', value: docs.rows.length }] : []),
        ...(ver.state.status === 'ok'
          ? [{ label: 'Revisions in period', value: ver.rows.length }, ...countBy(ver.rows, 'change_type')]
          : []),
      ],
      items: ver.rows.slice(0, MAX_ITEMS).map((r) =>
        `${s(r.doc_number)} ${shorten(r.title, 60)}${s(r.revision_no) ? ` rev ${s(r.revision_no)}` : ''} (${d10(r.changed_at)})`),
      sources: [docs.state, ver.state],
    }
  },

  // d) Status of actions from previous management reviews
  d: async (ctx) => {
    const meetings = await readRows('mrm_meetings', 'Previous meetings', 'mrm_meetings', 'id, meeting_no, held_on')
    const prior = meetings.rows.filter((m) => s(m.id) !== ctx.meetingId && (!ctx.heldOn || d10(m.held_on) <= ctx.heldOn))
    const byId = new Map(prior.map((m) => [s(m.id), m]))
    const acts = await readRows('mrm_actions', 'Actions of previous reviews', 'mrm_actions',
      'meeting_id, action, owner_name, due_on, status, closed_on',
      [{ op: 'in', col: 'meeting_id', value: [...byId.keys()] }])
    const today = todayIso()
    const eff = acts.rows.map((r) => ({ r, st: effectiveActionStatus({ status: s(r.status) as 'open', dueOn: d10(r.due_on) }, today) }))
    const pending = eff.filter((x) => x.st !== 'done')
    return {
      figures: acts.state.status === 'ok'
        ? [
            { label: 'Previous meetings', value: prior.length },
            { label: 'Actions raised', value: acts.rows.length },
            { label: 'Done', value: countWhere(eff.map((x) => x.r), (r) => s(r.status) === 'done'), tone: 'ok' },
            { label: 'Open', value: eff.filter((x) => x.st === 'open').length },
            warnIf('Overdue', eff.filter((x) => x.st === 'overdue').length),
          ]
        : [],
      items: pending.slice(0, MAX_ITEMS).map(({ r, st }) =>
        `${s(byId.get(s(r.meeting_id))?.meeting_no)}: ${shorten(r.action, 70)} — ${s(r.owner_name) || 'no owner'}, due ${d10(r.due_on) || '—'} (${st})`),
      sources: [meetings.state, acts.state],
    }
  },

  // e) Outcome of recent internal audits
  e: async (ctx) => {
    const plans = await readRows('audit_plans', 'Internal audits', 'audit_plans',
      'id, audit_id, audit_type, proposed_from, proposed_to',
      [{ op: 'eq', col: 'audit_type', value: 'internal' }, { op: 'lte', col: 'proposed_from', value: ctx.to }, { op: 'gte', col: 'proposed_to', value: ctx.from }])
    const ids = plans.rows.map((r) => s(r.id))
    const items = await readRows('audit_checklist_items', 'Audit checklist', 'audit_checklist_items',
      'id, audit_plan_id, clause_no, conformity, non_conformity', [{ op: 'in', col: 'audit_plan_id', value: ids }])
    const ncItems = items.rows.filter((r) => s(r.conformity) === 'no')
    const ncas = await readRows('audit_nc_actions', 'Audit NC actions', 'audit_nc_actions',
      'checklist_item_id, verification_closure', [{ op: 'in', col: 'checklist_item_id', value: ncItems.map((r) => s(r.id)) }])
    const planById = new Map(plans.rows.map((p) => [s(p.id), p]))
    return {
      figures: plans.state.status === 'ok'
        ? [
            { label: 'Internal audits in period', value: plans.rows.length },
            ...(items.state.status === 'ok'
              ? [
                  { label: 'Clauses checked', value: countWhere(items.rows, (r) => ['yes', 'no', 'na'].includes(s(r.conformity))) },
                  warnIf('Nonconformities', ncItems.length),
                ]
              : []),
            ...(ncas.state.status === 'ok'
              ? [
                  { label: 'NC actions closed', value: countWhere(ncas.rows, (r) => !blank(r.verification_closure)), tone: 'ok' as const },
                  warnIf('NC actions open', countWhere(ncas.rows, (r) => blank(r.verification_closure))),
                ]
              : []),
          ]
        : [],
      items: ncItems.slice(0, MAX_ITEMS).map((r) =>
        `${s(planById.get(s(r.audit_plan_id))?.audit_id)} clause ${s(r.clause_no)}: ${shorten(r.non_conformity, 70)}`),
      sources: [plans.state, items.state, ncas.state],
    }
  },

  // f) Corrective actions
  f: async (ctx) => {
    const nc = await readRows('nc_work_records', 'Nonconforming work', 'nc_work_records',
      'nc_id, description, status, risk_level, corrective_action_required, detected_at', tsRange('detected_at', ctx))
    const ca = await readRows('nc_work_corrective_actions', 'NC corrective actions', 'nc_work_corrective_actions',
      'verification_closure, review_of_effectiveness, created_at', tsRange('created_at', ctx))
    const aca = await readRows('audit_nc_actions', 'Audit corrective actions', 'audit_nc_actions',
      'verification_closure, created_at', tsRange('created_at', ctx))
    const openNc = nc.rows.filter((r) => s(r.status) !== 'Closed')
    return {
      figures: [
        ...(nc.state.status === 'ok'
          ? [
              { label: 'NC work records', value: nc.rows.length },
              warnIf('NC not closed', openNc.length),
              { label: 'CAPA required', value: countWhere(nc.rows, (r) => r.corrective_action_required === true || s(r.status) === 'CAPA Required') },
              warnIf('High risk', countWhere(nc.rows, (r) => s(r.risk_level) === 'High')),
            ]
          : []),
        ...(ca.state.status === 'ok'
          ? [
              { label: 'Corrective actions (NC work)', value: ca.rows.length },
              { label: 'Verified / closed', value: countWhere(ca.rows, (r) => !blank(r.verification_closure)), tone: 'ok' as const },
              { label: 'Effectiveness reviewed', value: countWhere(ca.rows, (r) => !blank(r.review_of_effectiveness)) },
            ]
          : []),
        ...(aca.state.status === 'ok'
          ? [
              { label: 'Corrective actions (audits)', value: aca.rows.length },
              warnIf('Audit CAs open', countWhere(aca.rows, (r) => blank(r.verification_closure))),
            ]
          : []),
      ],
      items: openNc.slice(0, MAX_ITEMS).map((r) => `${s(r.nc_id)} ${shorten(r.description, 70)} — ${s(r.status)}`),
      sources: [nc.state, ca.state, aca.state],
    }
  },

  // g) Assessments by external bodies
  g: async (ctx) => {
    const ext = await readRows('audit_plans', 'External assessments', 'audit_plans',
      'audit_id, proposed_from, proposed_to',
      [{ op: 'eq', col: 'audit_type', value: 'external' }, { op: 'lte', col: 'proposed_from', value: ctx.to }, { op: 'gte', col: 'proposed_to', value: ctx.from }])
    return {
      figures: ext.state.status === 'ok' ? [{ label: 'External assessments in period', value: ext.rows.length }] : [],
      items: ext.rows.slice(0, MAX_ITEMS).map((r) => `${s(r.audit_id)}: ${d10(r.proposed_from)} – ${d10(r.proposed_to)}`),
      sources: [ext.state],
    }
  },

  // h) Changes in the volume and type of work
  h: async (ctx) => {
    const days = Math.max(1, Math.round((Date.parse(ctx.to) - Date.parse(ctx.from)) / 86400000) + 1)
    const prev: MrmPullContext = { ...ctx, from: shiftIsoDate(ctx.from, { days: -days }), to: shiftIsoDate(ctx.from, { days: -1 }) }
    const [smp, smpPrev, cal, calPrev] = await Promise.all([
      readRows('samples', 'Samples received', 'samples', 'matrix, date_of_sample_receiving', dateRange('date_of_sample_receiving', ctx)),
      readRows('samples', 'Samples received (previous period)', 'samples', 'id', dateRange('date_of_sample_receiving', prev)),
      readRows('calibration_jobs', 'Calibration jobs', 'calibration_jobs', 'id, created_at', tsRange('created_at', ctx)),
      readRows('calibration_jobs', 'Calibration jobs (previous period)', 'calibration_jobs', 'id', tsRange('created_at', prev)),
    ])
    const change = (now: number, before: number) =>
      before === 0 ? (now === 0 ? '0%' : 'new') : `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}%`
    const matrices = countBy(smp.rows, 'matrix').sort((x, y) => Number(y.value) - Number(x.value)).slice(0, 5)
    return {
      figures: [
        ...(smp.state.status === 'ok'
          ? [
              { label: 'Samples received', value: smp.rows.length },
              { label: 'Previous period', value: smpPrev.rows.length },
              { label: 'Change', value: change(smp.rows.length, smpPrev.rows.length) },
            ]
          : []),
        ...(cal.state.status === 'ok'
          ? [
              { label: 'Calibration jobs', value: cal.rows.length },
              { label: 'Previous period', value: calPrev.rows.length },
              { label: 'Change', value: change(cal.rows.length, calPrev.rows.length) },
            ]
          : []),
      ],
      items: matrices.map((m) => `Matrix ${m.label}: ${m.value} samples`),
      sources: [smp.state, cal.state],
    }
  },

  // i) Customer and personnel feedback
  i: async (ctx) => {
    const fb = await readRows('customer_feedback', 'Customer feedback', 'customer_feedback',
      'feedback_id, customer_name, feedback_type, description, status', tsRange('received_at', ctx))
    const ps = await readRows('gr_improvements', 'Personnel suggestions', 'gr_improvements',
      'improvement_id, description', [{ op: 'eq', col: 'source', value: 'Personnel Suggestion' }, ...dateRange('identified_at', ctx)])
    const concerns = fb.rows.filter((r) => s(r.feedback_type) === 'Concern')
    return {
      figures: [
        ...(fb.state.status === 'ok'
          ? [
              { label: 'Customer feedback', value: fb.rows.length },
              ...countBy(fb.rows, 'feedback_type', ['Praise', 'Suggestion', 'Concern', 'Other']),
              warnIf('Not closed', countWhere(fb.rows, (r) => s(r.status) !== 'Closed')),
            ]
          : []),
        ...(ps.state.status === 'ok' ? [{ label: 'Personnel suggestions', value: ps.rows.length }] : []),
      ],
      items: [
        ...concerns.map((r) => `${s(r.feedback_id)} ${s(r.customer_name)}: ${shorten(r.description, 70)}`),
        ...ps.rows.map((r) => `${s(r.improvement_id)} (personnel): ${shorten(r.description, 70)}`),
      ].slice(0, MAX_ITEMS),
      sources: [fb.state, ps.state],
    }
  },

  // j) Complaints
  j: async (ctx) => {
    const c = await readRows('customer_complaints', 'Complaints', 'customer_complaints',
      'complaint_id, complainant_name, description, status, validated', tsRange('received_at', ctx))
    const open = c.rows.filter((r) => !['Closed', 'Not Related'].includes(s(r.status)))
    return {
      figures: c.state.status === 'ok'
        ? [
            { label: 'Complaints received', value: c.rows.length },
            { label: 'Validated', value: countWhere(c.rows, (r) => r.validated === true) },
            { label: 'Closed', value: countWhere(c.rows, (r) => s(r.status) === 'Closed'), tone: 'ok' },
            { label: 'Not related to lab', value: countWhere(c.rows, (r) => s(r.status) === 'Not Related') },
            warnIf('Open', open.length),
          ]
        : [],
      items: open.slice(0, MAX_ITEMS).map((r) => `${s(r.complaint_id)} ${s(r.complainant_name)}: ${shorten(r.description, 60)} — ${s(r.status)}`),
      sources: [c.state],
    }
  },

  // k) Effectiveness of implemented improvements
  k: async (ctx) => {
    const imp = await readRows('gr_improvements', 'Improvements', 'gr_improvements',
      'improvement_id, description, status, effectiveness_notes', dateRange('identified_at', ctx))
    const implemented = imp.rows.filter((r) => ['Implemented', 'Closed'].includes(s(r.status)))
    return {
      figures: imp.state.status === 'ok'
        ? [
            { label: 'Improvements identified', value: imp.rows.length },
            ...countBy(imp.rows, 'status', ['Identified', 'In Progress', 'Implemented', 'Closed']),
            warnIf('Implemented without effectiveness review', countWhere(implemented, (r) => blank(r.effectiveness_notes))),
          ]
        : [],
      items: implemented.slice(0, MAX_ITEMS).map((r) =>
        `${s(r.improvement_id)} ${shorten(r.description, 60)} — ${blank(r.effectiveness_notes) ? 'effectiveness not recorded' : shorten(r.effectiveness_notes, 50)}`),
      sources: [imp.state],
    }
  },

  // l) Adequacy of resources
  l: async (ctx) => {
    const br = await readRows('equipment_breakdown_register', 'Equipment breakdowns', 'equipment_breakdown_register',
      'register_no, equipment_name, nature_of_breakdown, status, downtime_from, downtime_to', dateRange('breakdown_date', ctx))
    const staff = await readRows('user_profiles', 'Staff', 'user_profiles', 'status')
    const notClosed = br.rows.filter((r) => !['Closed', 'Scrapped'].includes(s(r.status)))
    let downtimeHours = 0
    for (const r of br.rows) {
      const a = Date.parse(s(r.downtime_from))
      const b = Date.parse(s(r.downtime_to))
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) downtimeHours += (b - a) / 3600000
    }
    return {
      figures: [
        ...(staff.state.status === 'ok'
          ? [{ label: 'Active staff', value: countWhere(staff.rows, (r) => s(r.status).toLowerCase() !== 'inactive') }]
          : []),
        ...(br.state.status === 'ok'
          ? [
              { label: 'Equipment breakdowns', value: br.rows.length },
              warnIf('Breakdowns not closed', notClosed.length),
              { label: 'Recorded downtime (h)', value: Math.round(downtimeHours) },
            ]
          : []),
      ],
      items: notClosed.slice(0, MAX_ITEMS).map((r) => `${s(r.register_no)} ${s(r.equipment_name)}: ${shorten(r.nature_of_breakdown, 60)} — ${s(r.status)}`),
      sources: [staff.state, br.state],
    }
  },

  // m) Results of risk identification
  m: async (ctx) => {
    const ro = await readRows('gr_risk_opportunities', 'Risks and opportunities', 'gr_risk_opportunities',
      'item_id, item_type, description, status, identified_at')
    const imp = await readRows('gr_impartiality_risks', 'Impartiality risks', 'gr_impartiality_risks',
      'risk_id, risk_description, status, risk_score, identified_at')
    const inPeriod = (r: Row) => d10(r.identified_at) >= ctx.from && d10(r.identified_at) <= ctx.to
    const openRo = ro.rows.filter((r) => s(r.status) !== 'Closed')
    const openImp = imp.rows.filter((r) => s(r.status) === 'Open')
    return {
      figures: [
        ...(ro.state.status === 'ok'
          ? [
              { label: 'Risks identified in period', value: countWhere(ro.rows, (r) => inPeriod(r) && s(r.item_type) === 'Risk') },
              { label: 'Opportunities in period', value: countWhere(ro.rows, (r) => inPeriod(r) && s(r.item_type) === 'Opportunity') },
              warnIf('Risks / opportunities open', openRo.length),
            ]
          : []),
        ...(imp.state.status === 'ok'
          ? [
              { label: 'Impartiality risks in period', value: countWhere(imp.rows, inPeriod) },
              warnIf('Impartiality risks open', openImp.length),
              warnIf('High score (>= 15) not closed', countWhere(imp.rows, (r) => Number(r.risk_score) >= 15 && s(r.status) !== 'Closed')),
            ]
          : []),
      ],
      items: [
        ...openRo.map((r) => `${s(r.item_id)} ${s(r.item_type)}: ${shorten(r.description, 60)} — ${s(r.status)}`),
        ...openImp.map((r) => `${s(r.risk_id)} impartiality: ${shorten(r.risk_description, 60)}`),
      ].slice(0, MAX_ITEMS),
      sources: [ro.state, imp.state],
    }
  },

  // n) Assurance of the validity of results
  n: async (ctx) => {
    const rv = await readRows('result_validity_checks', 'Result validity checks (7.7)', 'result_validity_checks',
      'check_ref, title, status, conclusion', dateRange('check_date', ctx))
    const pt = await readRows('pt_participations', 'PT / ILC participations', 'pt_participations',
      'scheme_name, round_code, parameter, performance, status, reported_on', dateRange('reported_on', ctx))
    const iqc = await readRows('iqc_plan_items', 'IQC plan', 'iqc_plan_items', 'check_name, status, next_due')
    const badRv = rv.rows.filter((r) => s(r.status) === 'unsatisfactory')
    const badPt = pt.rows.filter((r) => ['unsatisfactory', 'questionable'].includes(s(r.performance)))
    const overdueIqc = iqc.rows.filter((r) => s(r.status) === 'overdue' || (s(r.status) !== 'inactive' && d10(r.next_due) && d10(r.next_due) < ctx.to))
    return {
      figures: [
        ...(rv.state.status === 'ok'
          ? [
              { label: 'Validity checks', value: rv.rows.length },
              { label: 'Satisfactory', value: countWhere(rv.rows, (r) => s(r.status) === 'satisfactory'), tone: 'ok' as const },
              warnIf('Unsatisfactory', badRv.length),
              { label: 'Planned / in progress', value: countWhere(rv.rows, (r) => ['planned', 'in_progress'].includes(s(r.status))) },
            ]
          : []),
        ...(pt.state.status === 'ok'
          ? [
              { label: 'PT / ILC results', value: pt.rows.length },
              { label: 'PT satisfactory', value: countWhere(pt.rows, (r) => s(r.performance) === 'satisfactory'), tone: 'ok' as const },
              warnIf('PT questionable', countWhere(pt.rows, (r) => s(r.performance) === 'questionable')),
              warnIf('PT unsatisfactory', countWhere(pt.rows, (r) => s(r.performance) === 'unsatisfactory')),
            ]
          : []),
        ...(iqc.state.status === 'ok'
          ? [{ label: 'IQC checks planned', value: iqc.rows.length }, warnIf('IQC checks overdue', overdueIqc.length)]
          : []),
      ],
      items: [
        ...badRv.map((r) => `${s(r.check_ref)} ${shorten(r.title, 60)}: ${shorten(r.conclusion, 40)}`),
        ...badPt.map((r) => `PT ${s(r.scheme_name)} ${s(r.round_code)} ${s(r.parameter)}: ${s(r.performance)}`),
        ...overdueIqc.map((r) => `IQC ${s(r.check_name)} due ${d10(r.next_due)}`),
      ].slice(0, MAX_ITEMS),
      sources: [rv.state, pt.state, iqc.state],
    }
  },

  // o) Other relevant factors: monitoring activities and training
  o: async (ctx) => {
    const env = await readRows('environment_readings', 'Environmental monitoring', 'environment_readings',
      'recorded_at, within_limits, limit_snapshot', tsRange('recorded_at', ctx))
    const tr = await readRows('compliance_registers', 'Training registers', 'compliance_registers',
      'module_key, reference_no, title, person_name, status, due_on',
      [{ op: 'like', col: 'module_key', value: 'training.%' }, ...dateRange('due_on', ctx)])
    const out = env.rows.filter((r) => r.within_limits === false)
    const openTr = tr.rows.filter((r) => s(r.status) !== 'Closed')
    return {
      figures: [
        ...(env.state.status === 'ok'
          ? [{ label: 'Environment readings', value: env.rows.length }, warnIf('Out of limits', out.length)]
          : []),
        ...(tr.state.status === 'ok'
          ? [
              { label: 'Training items due in period', value: tr.rows.length },
              { label: 'Training closed', value: countWhere(tr.rows, (r) => s(r.status) === 'Closed'), tone: 'ok' as const },
              warnIf('Training not closed', openTr.length),
            ]
          : []),
      ],
      items: [
        ...out.slice(0, 4).map((r) => {
          const snap = (r.limit_snapshot ?? {}) as Row
          return `Out of limits: ${s(snap.area_code) || 'area'} at ${s(r.recorded_at).slice(0, 16).replace('T', ' ')}`
        }),
        ...openTr.map((r) => `${s(r.reference_no)} ${shorten(r.title, 50)} (${s(r.person_name)}) due ${d10(r.due_on)}`),
      ].slice(0, MAX_ITEMS),
      sources: [env.state, tr.state],
    }
  },
}

/** Pull figures for one input; never throws. */
export async function pullMrmInput(code: string, ctx: MrmPullContext): Promise<MrmInputSummary> {
  const pulledAt = new Date().toISOString()
  const builder = builders[code]
  const base = { period: { from: ctx.from, to: ctx.to }, pulledAt }
  if (!builder) return { ...base, figures: [], items: [], sources: [] }
  try {
    const out = await builder(ctx)
    return { ...base, ...out }
  } catch (err) {
    return {
      ...base,
      figures: [],
      items: [],
      sources: [{ key: code, label: 'Auto-pull', status: 'error', message: err instanceof Error ? err.message : 'failed' }],
    }
  }
}

export async function pullAllMrmInputs(codes: string[], ctx: MrmPullContext): Promise<Record<string, MrmInputSummary>> {
  const entries = await Promise.all(codes.map(async (c) => [c, await pullMrmInput(c, ctx)] as const))
  return Object.fromEntries(entries)
}
