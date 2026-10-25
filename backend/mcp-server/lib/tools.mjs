// The connector's tools. Each call runs as the signed-in user (their own
// GoTrue token), after the Module Access check for the table, and is logged in
// mcp_calls. The Director also gets create_record and update_record.

import { z } from 'zod'
import { HIDDEN_TABLES, SAFE_NAME, columnWriteNote, writeRefusal } from './policy.mjs'
import { RestError } from './db.mjs'

const LONG_TEXT = 1500
const LONG_JSON = 3000
const SELECTED_JSON = 20000

export class Refused extends Error {}

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const enc = encodeURIComponent

/** Value for a PostgREST filter inside or=(...) / in.(...) lists. */
const listValue = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

function trimValue(v, selected) {
  if (typeof v === 'string' && v.length > LONG_TEXT && !selected) return `${v.slice(0, LONG_TEXT)}… [${v.length} characters; ask for this column to see all]`
  if (v && typeof v === 'object') {
    const s = JSON.stringify(v)
    const cap = selected ? SELECTED_JSON : LONG_JSON
    if (s.length > cap) return `[JSON, ${s.length} characters${selected ? ', too long' : '; ask for this column by name to see it'}]`
  }
  return v
}

function shapeRows(rows, selectedColumns, redactor) {
  const selected = new Set(selectedColumns || [])
  return redactor.redactRows(rows).map((r) => {
    const out = {}
    for (const [k, v] of Object.entries(r)) out[k] = trimValue(v, selected.has(k))
    return out
  })
}

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }] })

export function createToolkit({ config, db }) {
  let openApiCache = null

  async function schema(jwt) {
    if (openApiCache && Date.now() - openApiCache.at < 10 * 60 * 1000) return openApiCache.doc
    const doc = await db.openApi(jwt)
    openApiCache = { at: Date.now(), doc }
    return doc
  }

  async function tableDef(ctx, table) {
    if (!SAFE_NAME.test(table) || HIDDEN_TABLES.has(table)) throw new Refused(`Table ${table} is not available through the connector.`)
    const doc = await schema(ctx.jwt)
    const def = doc?.definitions?.[table]
    if (!def) throw new Refused(`There is no table ${table}, or you cannot see it.`)
    return def
  }

  async function access(ctx, table) {
    const key = `acc:${table}`
    if (ctx.cache.has(key)) return ctx.cache.get(key)
    const rows = await db.rpc(ctx.jwt, 'app_mcp_table_access', { p_tables: [table] })
    const a = rows?.[0] || { can_read: false, can_write: false }
    ctx.cache.set(key, a)
    return a
  }

  async function mustRead(ctx, table) {
    await tableDef(ctx, table)
    const a = await access(ctx, table)
    if (!a.can_read) throw new Refused(`Your Module Access does not include ${table}, so the connector cannot show it (same as the app).`)
  }

  async function get(ctx, table, query) {
    await mustRead(ctx, table)
    const { data } = await db.asUser(ctx.jwt, `/${table}?${query}`)
    return Array.isArray(data) ? data : []
  }

  function checkColumns(def, table, cols) {
    for (const c of cols) {
      if (!SAFE_NAME.test(c) || !def.properties?.[c]) throw new Refused(`${table} has no column ${c}.`)
    }
  }

  function hasColumn(def, c) {
    return Boolean(def.properties?.[c])
  }

  const FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']

  function filterQuery(def, table, filters, redactor) {
    const parts = []
    for (const f of filters || []) {
      checkColumns(def, table, [f.column])
      if (!FILTER_OPS.includes(f.op)) throw new Refused(`Unknown filter ${f.op}.`)
      if (f.op === 'is') {
        const v = String(f.value).toLowerCase()
        if (!['null', 'true', 'false'].includes(v)) throw new Refused('Filter "is" takes null, true or false.')
        parts.push(`${f.column}=is.${v}`)
      } else if (f.op === 'in') {
        const values = (Array.isArray(f.value) ? f.value : [f.value]).map((v) => listValue(redactor.unmask(v)))
        parts.push(`${f.column}=in.(${enc(values.join(','))})`)
      } else {
        const v = redactor.unmask(f.value).replace(/%/g, '*')
        parts.push(`${f.column}=${f.op}.${enc(v)}`)
      }
    }
    return parts
  }

  // ----- tools ---------------------------------------------------------------

  const tools = []
  const tool = (name, spec, run) => tools.push({ name, spec, run })

  tool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Your name, designation and what the QIRLPL LIMS connector lets you do.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async (ctx) => ({
      name: ctx.who.full_name,
      designation: ctx.who.designation,
      department: ctx.who.department,
      can_edit: ctx.role === 'director',
      client_names_and_addresses: ctx.role === 'director' ? 'shown' : 'replaced by placeholders such as CLIENT_3fa91c (you can search with a placeholder)',
      never_through_connector: [
        'submitting or approving results (Enter Results, Results Under Review)',
        'issuing or signing a test report or calibration certificate',
        'deleting anything',
      ],
      rows_per_answer: config.maxRows,
      environment: config.environment,
    }),
  )

  tool(
    'list_tables',
    {
      title: 'List LIMS tables',
      description: 'Tables you can read in the LIMS (by your Module Access), with a short description. Use describe_table for the columns.',
      inputSchema: { search: z.string().optional().describe('Part of a table name, e.g. "equipment"') },
      annotations: { readOnlyHint: true },
    },
    async (ctx, { search }) => {
      const doc = await schema(ctx.jwt)
      const names = Object.keys(doc?.definitions || {})
        .filter((t) => !HIDDEN_TABLES.has(t) && SAFE_NAME.test(t))
        .filter((t) => !search || t.includes(String(search).toLowerCase()))
        .sort()
      const acc = names.length ? await db.rpc(ctx.jwt, 'app_mcp_table_access', { p_tables: names }) : []
      const ok = new Map(acc.map((a) => [a.table_name, a]))
      return names
        .filter((t) => ok.get(t)?.can_read)
        .map((t) => ({
          table: t,
          description: String(doc.definitions[t].description || '').split('\n')[0].slice(0, 200) || undefined,
          you_can_edit: ctx.role === 'director' && Boolean(ok.get(t)?.can_write) && !writeRefusal({ table: t, columns: [], create: false }),
        }))
    },
  )

  tool(
    'describe_table',
    {
      title: 'Describe a LIMS table',
      description: 'Columns of one table with their types (and, for the Director, which columns cannot be written through the connector).',
      inputSchema: { table: z.string() },
      annotations: { readOnlyHint: true },
    },
    async (ctx, { table }) => {
      await mustRead(ctx, table)
      const def = await tableDef(ctx, table)
      const tableBlock = ctx.role === 'director' ? writeRefusal({ table, columns: [], create: false }) : 'read only for your designation'
      return {
        table,
        description: def.description || undefined,
        writes: tableBlock || 'the Director can update rows; see per-column notes',
        columns: Object.entries(def.properties || {}).map(([c, p]) => ({
          column: c,
          type: p.format || p.type,
          note: (String(p.description || '').split('\n')[0] || undefined),
          not_writable: ctx.role === 'director' && !tableBlock ? columnWriteNote(table, c) || undefined : undefined,
        })),
      }
    },
  )

  tool(
    'query_table',
    {
      title: 'Read rows from a LIMS table',
      description:
        'Read up to 50 rows from one table with simple filters (no free SQL). Deleted rows are left out. Use "*" as a wildcard in like/ilike. Example filters: [{"column":"srf_number","op":"ilike","value":"SR2610*"}].',
      inputSchema: {
        table: z.string(),
        columns: z.array(z.string()).optional().describe('Columns to return (default: all)'),
        filters: z
          .array(
            z.object({
              column: z.string(),
              op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']),
              value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
            }),
          )
          .optional(),
        order_by: z.string().optional(),
        descending: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (ctx, args) => {
      const { table } = args
      await mustRead(ctx, table)
      const def = await tableDef(ctx, table)
      const cols = args.columns?.length ? args.columns : null
      if (cols) checkColumns(def, table, cols)
      const parts = filterQuery(def, table, args.filters, ctx.redactor)
      if (hasColumn(def, 'deleted_at')) parts.push('deleted_at=is.null')
      if (args.order_by) {
        checkColumns(def, table, [args.order_by])
        parts.push(`order=${args.order_by}.${args.descending ? 'desc' : 'asc'}.nullslast`)
      }
      const limit = Math.min(args.limit || 20, config.maxRows)
      parts.push(`limit=${limit}`, `offset=${args.offset || 0}`, `select=${cols ? cols.join(',') : '*'}`)
      const { data } = await db.asUser(ctx.jwt, `/${table}?${parts.join('&')}`, { headers: { Prefer: 'count=exact' } })
      const rows = Array.isArray(data) ? data : []
      ctx.note.table = table
      ctx.note.rows = rows.length
      return { table, rows: shapeRows(rows, cols, ctx.redactor), more: rows.length === limit ? `more rows may exist; use offset ${(args.offset || 0) + limit}` : undefined }
    },
  )

  const SAMPLE_COLS =
    'id,srf_number,date_of_sample_receiving,client_name,sample_description,test_report_is_code_label,stage,status,tentative_date_by_lab,test_report_number,test_report_nabl_ulr_number,test_report_issued_at,decision_rule_id'

  tool(
    'search_samples',
    {
      title: 'Search samples (SRFs)',
      description: 'Find test samples by SRF number, client, IS code, description, report or ULR number, stage and receiving date.',
      inputSchema: {
        text: z.string().optional().describe('SRF, client, IS code, description, report number or ULR (part is enough)'),
        stage: z.enum(['receiving', 'allocation', 'test_allocation', 'under_testing', 'results_review', 'report_preparation', 'completed']).optional(),
        received_from: z.string().optional().describe('YYYY-MM-DD'),
        received_to: z.string().optional().describe('YYYY-MM-DD'),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (ctx, a) => {
      const parts = [`select=${SAMPLE_COLS}`, 'deleted_at=is.null', 'order=date_of_sample_receiving.desc.nullslast', `limit=${a.limit || 20}`]
      if (a.text) {
        const v = listValue(`*${ctx.redactor.unmask(a.text)}*`)
        const cols = ['srf_number', 'client_name', 'sample_description', 'test_report_is_code_label', 'test_report_number', 'test_report_nabl_ulr_number']
        parts.push(`or=${enc(`(${cols.map((c) => `${c}.ilike.${v}`).join(',')})`)}`)
      }
      if (a.stage) parts.push(`stage=eq.${a.stage}`)
      if (a.received_from) parts.push(`date_of_sample_receiving=gte.${enc(a.received_from)}`)
      if (a.received_to) parts.push(`date_of_sample_receiving=lte.${enc(a.received_to)}`)
      const rows = await get(ctx, 'samples', parts.join('&'))
      ctx.note.table = 'samples'
      ctx.note.rows = rows.length
      return shapeRows(rows, null, ctx.redactor)
    },
  )

  tool(
    'sample_status',
    {
      title: 'Status of one sample',
      description: 'One SRF: stage, sections, who is testing, results entered and reviewed, report and ULR.',
      inputSchema: { srf_number: z.string().describe('SRF number, e.g. SR261016/208-008') },
      annotations: { readOnlyHint: true },
    },
    async (ctx, { srf_number }) => {
      const samples = await get(ctx, 'samples', `select=*&srf_number=eq.${enc(srf_number)}&deleted_at=is.null&limit=2`)
      if (!samples.length) return `No sample ${srf_number} (or you cannot see it).`
      const s = samples[0]
      const allocs = await get(
        ctx,
        'test_allocations',
        `select=id,section_code,is_code_label,department,assigned_employee_name,allocation_date,sent_for_testing,referred_back_from_review&sample_id=eq.${s.id}&deleted_at=is.null`,
      )
      let params = []
      if (allocs.length) {
        params = await get(
          ctx,
          'test_allocation_parameters',
          `select=test_allocation_id,test_label,test_start_date,test_end_date,results,entered_by_name,entered_at,results_reviewer_name,results_review_status&test_allocation_id=in.(${allocs.map((a) => a.id).join(',')})&deleted_at=is.null`,
        ).catch(() => [])
      }
      ctx.note.table = 'samples'
      ctx.note.rowIds = [s.id]
      ctx.note.rows = 1 + allocs.length + params.length
      const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]))
      return ctx.redactor.redactValue({
        sample: pick(s, [
          'srf_number', 'date_of_sample_receiving', 'client_name', 'sample_description', 'test_report_is_code_label', 'stage', 'status',
          'tentative_date_by_lab', 'statement_conformity_required', 'test_report_number', 'test_report_nabl_ulr_number',
          'test_report_issued_at', 'issued_by_name', 'sample_retention_status', 'sample_retention_due_date',
        ]),
        sections: allocs.map((a) => ({
          ...pick(a, ['section_code', 'is_code_label', 'department', 'assigned_employee_name', 'allocation_date', 'sent_for_testing', 'referred_back_from_review']),
          tests: params
            .filter((p) => p.test_allocation_id === a.id)
            .map((p) => ({ ...pick(p, ['test_label', 'test_start_date', 'test_end_date', 'entered_by_name', 'entered_at', 'results_reviewer_name', 'results_review_status']), result: trimValue(p.results) })),
        })),
      })
    },
  )

  tool(
    'due_and_overdue',
    {
      title: 'Due and overdue work',
      description: 'Samples not yet reported whose lab due date is past or within the next days, and equipment whose calibration, intermediate check or maintenance is due.',
      inputSchema: { days: z.number().int().min(0).max(90).optional().describe('Look ahead this many days (default 7)') },
      annotations: { readOnlyHint: true },
    },
    async (ctx, { days = 7 }) => {
      const until = addDays(days)
      const samples = await get(
        ctx,
        'samples',
        `select=srf_number,client_name,stage,tentative_date_by_lab,date_of_sample_receiving&deleted_at=is.null&test_report_issued_at=is.null&tentative_date_by_lab=lte.${until}&order=tentative_date_by_lab.asc&limit=${config.maxRows}`,
      ).catch((e) => (e instanceof Refused ? [] : Promise.reject(e)))
      const eqCols = 'asset_code,equipment_name,equipment_status,current_location,next_calibration_due,next_intermediate_check_date,next_maintenance_date'
      const equipment = await get(
        ctx,
        'equipment_master',
        `select=${eqCols}&deleted_at=is.null&or=${enc(`(next_calibration_due.lte.${until},next_intermediate_check_date.lte.${until},next_maintenance_date.lte.${until})`)}&order=next_calibration_due.asc.nullslast&limit=${config.maxRows}`,
      ).catch((e) => (e instanceof Refused ? [] : Promise.reject(e)))
      const t = today()
      ctx.note.rows = samples.length + equipment.length
      return {
        today: t,
        look_ahead_until: until,
        samples: shapeRows(samples, null, ctx.redactor).map((s) => ({ ...s, overdue: s.tentative_date_by_lab < t })),
        equipment: equipment.map((e) => ({
          ...e,
          calibration_overdue: Boolean(e.next_calibration_due && e.next_calibration_due < t),
          intermediate_check_overdue: Boolean(e.next_intermediate_check_date && e.next_intermediate_check_date < t),
          maintenance_overdue: Boolean(e.next_maintenance_date && e.next_maintenance_date < t),
        })),
      }
    },
  )

  tool(
    'equipment_status',
    {
      title: 'Equipment status',
      description: 'Equipment by name, asset code or serial number: status, location, calibration and check dates, certificate number.',
      inputSchema: {
        text: z.string().optional().describe('Name, asset code (e.g. QI-EQ-0021) or serial number'),
        due_within_days: z.number().int().min(0).max(365).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (ctx, a) => {
      const parts = [
        'select=id,asset_code,equipment_name,manufacturer,model_number,serial_number,equipment_status,current_location,range_capacity,calibration_frequency,last_calibration_date,next_calibration_due,calibration_certificate_number,last_intermediate_check_date,next_intermediate_check_date,intermediate_check_result,next_maintenance_date',
        'deleted_at=is.null',
        'order=asset_code.asc',
        `limit=${a.limit || 20}`,
      ]
      if (a.text) {
        const v = listValue(`*${a.text}*`)
        parts.push(`or=${enc(`(equipment_name.ilike.${v},asset_code.ilike.${v},serial_number.ilike.${v})`)}`)
      }
      if (a.due_within_days !== undefined) parts.push(`next_calibration_due=lte.${addDays(a.due_within_days)}`)
      const rows = await get(ctx, 'equipment_master', parts.join('&'))
      ctx.note.table = 'equipment_master'
      ctx.note.rows = rows.length
      return shapeRows(rows, null, ctx.redactor)
    },
  )

  tool(
    'open_ncs_and_complaints',
    {
      title: 'Open NCs, CAPA and complaints',
      description: 'Open nonconforming work records, corrective actions not closed, and customer complaints not closed.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async (ctx) => {
      const soft = (p) => p.catch((e) => (e instanceof Refused ? { refused: e.message } : Promise.reject(e)))
      const ncs = await soft(
        get(ctx, 'nc_work_records', `select=id,nc_id,detected_at,source_area,equipment_or_activity,description,risk_level,status,srf_number,corrective_action_required&deleted_at=is.null&status=not.ilike.closed*&order=detected_at.desc&limit=${config.maxRows}`),
      )
      const capa = await soft(
        get(ctx, 'nc_work_corrective_actions', `select=nc_work_record_id,description_of_nc,capa_owner_name,capa_due_on,effectiveness_review_due_on,effectiveness_outcome&deleted_at=is.null&capa_closed_on=is.null&limit=${config.maxRows}`),
      )
      const complaints = await soft(
        get(ctx, 'customer_complaints', `select=complaint_id,received_at,complainant_name,complainant_org,description,status,validated,capa_owner_name,capa_due_on&deleted_at=is.null&closed_at=is.null&order=received_at.desc&limit=${config.maxRows}`),
      )
      const shape = (x) => (Array.isArray(x) ? shapeRows(x, null, ctx.redactor) : x)
      return { open_nc_records: shape(ncs), open_corrective_actions: shape(capa), open_complaints: shape(complaints) }
    },
  )

  tool(
    'issued_reports',
    {
      title: 'Issued test reports',
      description: 'Test reports issued between two dates (report number, ULR, client, IS code, issued by). No file contents.',
      inputSchema: {
        from: z.string().describe('YYYY-MM-DD'),
        to: z.string().optional().describe('YYYY-MM-DD (default today)'),
        text: z.string().optional().describe('Client, SRF, report or ULR number (part is enough)'),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (ctx, a) => {
      const to = a.to || today()
      const parts = [
        'select=srf_number,client_name,test_report_is_code_label,test_report_number,test_report_nabl_ulr_number,test_report_issued_at,issued_by_name',
        'deleted_at=is.null',
        `test_report_issued_at=gte.${enc(a.from)}`,
        `test_report_issued_at=lt.${enc(new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10))}`,
        'order=test_report_issued_at.desc',
        `limit=${a.limit || 50}`,
      ]
      if (a.text) {
        const v = listValue(`*${ctx.redactor.unmask(a.text)}*`)
        parts.push(`or=${enc(`(srf_number.ilike.${v},client_name.ilike.${v},test_report_number.ilike.${v},test_report_nabl_ulr_number.ilike.${v})`)}`)
      }
      const rows = await get(ctx, 'samples', parts.join('&'))
      ctx.note.table = 'samples'
      ctx.note.rows = rows.length
      return shapeRows(rows, null, ctx.redactor)
    },
  )

  tool(
    'audit_trail_search',
    {
      title: 'Search the Audit Trail',
      description: 'Who changed which record and when, and which fields changed (values are not shown). Quality Manager and Laboratory Director only, as in the app.',
      inputSchema: {
        table: z.string().optional(),
        row_id: z.string().optional(),
        from: z.string().optional().describe('YYYY-MM-DD'),
        to: z.string().optional().describe('YYYY-MM-DD'),
        action: z.enum(['INSERT', 'UPDATE', 'DELETE']).optional(),
        via_mcp_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (ctx, a) => {
      if (ctx.role === 'tm') throw new Refused('The Audit Trail is for the Quality Manager and the Laboratory Director (same as the app).')
      const parts = ['select=at,actor,table_name,row_id,action,reason,old_row,new_row', 'order=at.desc', `limit=${a.limit || 30}`]
      if (a.table) {
        if (!SAFE_NAME.test(a.table)) throw new Refused('Bad table name.')
        parts.push(`table_name=eq.${a.table}`)
      }
      if (a.row_id) parts.push(`row_id=eq.${enc(a.row_id)}`)
      if (a.from) parts.push(`at=gte.${enc(a.from)}`)
      if (a.to) parts.push(`at=lt.${enc(new Date(Date.parse(a.to) + 86400000).toISOString().slice(0, 10))}`)
      if (a.action) parts.push(`action=eq.${a.action}`)
      if (a.via_mcp_only) parts.push('reason=eq.via%20MCP')
      const { data } = await db.asUser(ctx.jwt, `/audit_log?${parts.join('&')}`)
      const rows = Array.isArray(data) ? data : []
      const actors = [...new Set(rows.map((r) => r.actor).filter(Boolean))]
      const names = actors.length
        ? (await db.asUser(ctx.jwt, `/user_profiles?select=id,full_name&id=in.(${actors.join(',')})`)).data
        : []
      const nameOf = new Map((names || []).map((p) => [p.id, p.full_name]))
      ctx.note.table = 'audit_log'
      ctx.note.rows = rows.length
      return rows.map((r) => {
        const keys = new Set([...Object.keys(r.old_row || {}), ...Object.keys(r.new_row || {})])
        const changed = [...keys].filter((k) => k !== 'updated_at' && JSON.stringify(r.old_row?.[k]) !== JSON.stringify(r.new_row?.[k]))
        return {
          at: r.at,
          who: nameOf.get(r.actor) || r.actor,
          table: r.table_name,
          row_id: r.row_id,
          action: r.action,
          reason: r.reason || undefined,
          changed_fields: r.action === 'UPDATE' ? changed : undefined,
        }
      })
    },
  )

  tool(
    'lab_summary',
    {
      title: 'Lab summary',
      description: 'Counts for the dashboard: samples by stage, received and reported in a period, open NCs and complaints, equipment overdue.',
      inputSchema: { from: z.string().optional().describe('YYYY-MM-DD (default first day of this month)') },
      annotations: { readOnlyHint: true },
    },
    async (ctx, { from }) => {
      const start = from || `${today().slice(0, 8)}01`
      const open = await get(ctx, 'samples', 'select=stage&deleted_at=is.null&stage=neq.completed&limit=5000')
      const received = await get(ctx, 'samples', `select=id&deleted_at=is.null&date_of_sample_receiving=gte.${enc(start)}&limit=5000`)
      const reported = await get(ctx, 'samples', `select=id&deleted_at=is.null&test_report_issued_at=gte.${enc(start)}&limit=5000`)
      const count = async (table, q) => {
        try {
          return (await get(ctx, table, `select=id&${q}&limit=5000`)).length
        } catch (e) {
          if (e instanceof Refused) return 'not in your access'
          throw e
        }
      }
      const byStage = {}
      for (const r of open) byStage[r.stage || 'unknown'] = (byStage[r.stage || 'unknown'] || 0) + 1
      const t = today()
      return {
        period_from: start,
        samples_in_progress_by_stage: byStage,
        samples_received_in_period: received.length,
        reports_issued_in_period: reported.length,
        open_nc_records: await count('nc_work_records', 'deleted_at=is.null&status=not.ilike.closed*'),
        open_complaints: await count('customer_complaints', 'deleted_at=is.null&closed_at=is.null'),
        equipment_calibration_overdue: await count('equipment_master', `deleted_at=is.null&next_calibration_due=lt.${t}`),
      }
    },
  )

  tool(
    'my_work',
    {
      title: 'My work',
      description: 'Sections allocated to you, and results waiting for your review.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async (ctx) => {
      const me = ctx.who.user_id
      const allocated = await get(
        ctx,
        'test_allocations',
        `select=srf_number,section_code,is_code_label,allocation_date,sent_for_testing&assigned_employee_id=eq.${me}&deleted_at=is.null&order=allocation_date.desc&limit=${config.maxRows}`,
      )
      const review = await get(
        ctx,
        'test_allocation_parameters',
        `select=test_allocation_id,test_label,entered_by_name,entered_at&results_reviewer_id=eq.${me}&results_review_status=eq.under_review&deleted_at=is.null&limit=${config.maxRows}`,
      ).catch((e) => (e instanceof Refused ? [] : Promise.reject(e)))
      let sections = []
      if (review.length) {
        const ids = [...new Set(review.map((r) => r.test_allocation_id))]
        sections = await get(ctx, 'test_allocations', `select=id,srf_number,section_code&id=in.(${ids.join(',')})`)
      }
      const srfOf = new Map(sections.map((s) => [s.id, `${s.srf_number} ${s.section_code || ''}`.trim()]))
      return {
        allocated_to_me: allocated,
        results_waiting_for_my_review: review.map((r) => ({ section: srfOf.get(r.test_allocation_id), test: r.test_label, entered_by: r.entered_by_name, entered_at: r.entered_at })),
      }
    },
  )

  // ----- Director only ----------------------------------------------------------

  async function mustWrite(ctx, table, columns, create) {
    if (ctx.role !== 'director') throw new Refused('Only the Laboratory Director can change data through the connector.')
    const def = await tableDef(ctx, table)
    checkColumns(def, table, columns)
    const why = writeRefusal({ table, columns, create })
    if (why) throw new Refused(why)
    const a = await access(ctx, table)
    if (!a.can_write) throw new Refused(`Your Module Access does not let you edit ${table} (same as the app).`)
    return def
  }

  const writeValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.any())])

  const directorTools = []
  const dtool = (name, spec, run) => directorTools.push({ name, spec, run })

  dtool(
    'update_record',
    {
      title: 'Change one LIMS record (Director)',
      description:
        'Change fields of one row, found by its id. Shows the old and new values. The Audit Trail marks the change "via MCP". Not possible: results entry or approval, issuing or signing reports and certificates, deleting, stage moves, numbers the app gives.',
      inputSchema: {
        table: z.string(),
        id: z.string().describe('The row id (uuid)'),
        changes: z.record(writeValue).describe('Column → new value'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (ctx, { table, id, changes }) => {
      const columns = Object.keys(changes || {})
      if (!columns.length) throw new Refused('No changes given.')
      const def = await mustWrite(ctx, table, columns, false)
      if (!hasColumn(def, 'id')) throw new Refused(`${table} has no id column; change it in the app.`)
      const softFilter = hasColumn(def, 'deleted_at') ? '&deleted_at=is.null' : ''
      const before = (await db.asUser(ctx.jwt, `/${table}?id=eq.${enc(id)}${softFilter}&select=${columns.join(',')}`)).data
      if (!before?.length) throw new Refused(`No ${table} row ${id} (or you cannot see it).`)
      const { data } = await db.asUser(ctx.jwt, `/${table}?id=eq.${enc(id)}${softFilter}&select=${columns.join(',')}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(changes),
      })
      if (!data?.length) throw new Refused('The database did not change the row (its rules refused it).')
      ctx.note.table = table
      ctx.note.rowIds = [id]
      ctx.note.rows = 1
      ctx.note.write = true
      return { table, id, before: before[0], after: data[0], audit_trail: 'recorded, reason "via MCP"' }
    },
  )

  dtool(
    'create_record',
    {
      title: 'Add one LIMS record (Director)',
      description:
        'Add one row to a master or register table (for example equipment, IS codes, test parameters, NC or complaint registers). Not possible for SRFs, allocations, jobs, quotations, invoices, consent letters, results, reports or certificates: use the app for those.',
      inputSchema: {
        table: z.string(),
        values: z.record(writeValue).describe('Column → value'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (ctx, { table, values }) => {
      const columns = Object.keys(values || {})
      if (!columns.length) throw new Refused('No values given.')
      await mustWrite(ctx, table, columns, true)
      const { data } = await db.asUser(ctx.jwt, `/${table}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(values),
      })
      const row = Array.isArray(data) ? data[0] : data
      ctx.note.table = table
      ctx.note.rowIds = row?.id ? [String(row.id)] : []
      ctx.note.rows = 1
      ctx.note.write = true
      return { table, created: row, audit_trail: 'recorded, reason "via MCP"' }
    },
  )

  return {
    toolsFor: (role) => (role === 'director' ? [...tools, ...directorTools] : tools),
    Refused,
    RestError,
  }
}
