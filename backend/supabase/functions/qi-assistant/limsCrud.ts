import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type CrudOperation = 'create' | 'update' | 'delete'

export type CrudActionInput = {
  operation: CrudOperation
  table: string
  id?: string
  data?: Record<string, unknown>
  /** Find row when id is omitted, e.g. { is_number, revision_year } or { company_name } */
  match?: Record<string, unknown>
}

export type CrudExecutionOptions = {
  /** Row opened via per-row Ask AI (e.g. IS Code sparkle button) */
  activeRecordId?: string
  activeRecordTable?: string
}

export type CrudActionResult = {
  operation: CrudOperation
  table: string
  id?: string
  ok: boolean
  message: string
}

const BLOCKED_TABLES = new Set(['ai_models', 'ai_skills', 'ai_settings'])

/** Tables QI Assistant may mutate (matches LIMS RLS list; excludes AI config). */
export const ALL_CRUD_TABLES = [
  'lab_master_options',
  'lab_settings',
  'lab_documents',
  'lab_accreditations',
  'lab_prefixes',
  'lab_letterheads',
  'clients',
  'client_master_options',
  'is_codes',
  'is_code_files',
  'is_code_master_options',
  'accreditation_bodies',
  'test_parameter_units',
  'test_parameters',
  'equipment_master',
  'nabl_scope',
  'samples',
  'sample_receiving_options',
  'sample_allocations',
  'test_allocations',
  'test_allocation_parameters',
] as const

/** Prefer page-scoped tables; falls back to full list. */
export const PAGE_CRUD_TABLES: Record<string, readonly string[]> = {
  'is-codes': ['is_codes', 'is_code_files', 'is_code_master_options'],
  clients: ['clients', 'client_master_options'],
  'test-parameter': ['test_parameters', 'test_parameter_units', 'is_codes', 'is_code_master_options'],
  'nabl-scope': ['nabl_scope'],
  samples: ['samples', 'sample_receiving_options', 'sample_allocations'],
  'samples/receiving': ['samples', 'sample_receiving_options', 'is_codes', 'clients'],
  'samples/allocation': ['samples', 'sample_allocations', 'test_allocations'],
  'samples/test-allocation': ['test_allocations', 'test_allocation_parameters', 'samples'],
  'lab-settings': [
    'lab_settings',
    'lab_documents',
    'lab_accreditations',
    'lab_prefixes',
    'lab_letterheads',
    'lab_master_options',
  ],
}

const STRIP_ON_WRITE = new Set(['id', 'created_at', 'updated_at'])

export function getAllowedTables(page?: string): Set<string> {
  const scoped = page?.trim() ? PAGE_CRUD_TABLES[page.trim()] : undefined
  const list = scoped ?? ALL_CRUD_TABLES
  return new Set(list.filter((t) => !BLOCKED_TABLES.has(t)))
}

function sanitizeData(
  data: Record<string, unknown>,
  operation: CrudOperation,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (STRIP_ON_WRITE.has(k)) continue
    if (v === undefined) continue
    out[k] = v
  }
  if (operation === 'create' && Object.keys(out).length === 0) {
    throw new Error('data must include at least one column for create')
  }
  return out
}

async function resolveIsCodeId(
  client: SupabaseClient,
  isNumber: string,
  revisionYear: unknown,
): Promise<string | null> {
  let q = client.from('is_codes').select('id').eq('is_number', isNumber)
  const rev = revisionYear === undefined || revisionYear === null ? null : String(revisionYear).trim()
  if (rev) {
    q = q.eq('revision_year', rev)
  } else {
    q = q.is('revision_year', null)
  }
  const { data, error } = await q.limit(2)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  if (rows.length === 1) return String((rows[0] as { id: string }).id)
  if (rows.length > 1) {
    throw new Error(`Multiple IS codes match ${isNumber}; provide revision_year or id.`)
  }
  return null
}

async function resolveClientId(client: SupabaseClient, companyName: string): Promise<string | null> {
  const name = companyName.trim()
  if (!name) return null
  const { data, error } = await client.from('clients').select('id').eq('company_name', name).limit(2)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  if (rows.length === 1) return String((rows[0] as { id: string }).id)
  if (rows.length > 1) throw new Error(`Multiple clients named "${companyName}"; use id.`)
  return null
}

async function generateNextSrfNumber(client: SupabaseClient, dateStr?: string): Promise<string> {
  let yymmdd: string
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-')
    yymmdd = y.slice(-2) + m + d
  } else {
    const today = new Date()
    yymmdd =
      today.getFullYear().toString().slice(-2) +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')
  }
  let prefix = 'QI/SRF'
  const { data: prefixRows } = await client.from('lab_prefixes').select('name, prefix').eq('name', 'SRF').limit(1)
  if (prefixRows?.[0]?.prefix) prefix = String((prefixRows[0] as { prefix?: string }).prefix).trim() || prefix
  const pattern = `${prefix}/${yymmdd}-%`
  const { data: existing } = await client
    .from('samples')
    .select('srf_number')
    .not('srf_number', 'is', null)
    .like('srf_number', pattern)
  const numbers = (Array.isArray(existing) ? existing : [])
    .map((r) => (r as { srf_number?: string }).srf_number)
    .filter((n): n is string => typeof n === 'string')
  const serials = numbers
    .map((n) => {
      const part = n.split('-')[1]
      return part ? parseInt(part, 10) : 0
    })
    .filter((s) => !Number.isNaN(s))
  const nextSerial = serials.length > 0 ? Math.max(...serials) + 1 : 1
  return `${prefix}/${yymmdd}-${String(nextSerial).padStart(2, '0')}`
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function prepareSampleCreateData(
  client: SupabaseClient,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out = { ...data }

  if (!out.client_id) {
    const clientName = String(out.client_name ?? out.customer_name ?? '').trim()
    if (clientName) {
      const id = await resolveClientId(client, clientName)
      if (id) out.client_id = id
    }
  }
  delete out.client_name
  delete out.customer_name

  if (!out.test_report_is_code_id) {
    const label = String(out.test_report_is_code_label ?? out.is_code_label ?? '').trim()
    const isNumber = String(out.is_number ?? '').trim() || label.replace(/^IS\s*/i, '').split(':')[0]?.trim()
    const revPart = label.includes(':') ? label.split(':').slice(1).join(':').trim() : out.revision_year
    if (isNumber) {
      const id = await resolveIsCodeId(client, isNumber, revPart)
      if (id) out.test_report_is_code_id = id
    }
  }
  delete out.is_number
  delete out.revision_year

  if (!out.stage) out.stage = 'receiving'
  if (!out.status) out.status = 'registered'
  if (!out.sample_receiving_status) out.sample_receiving_status = 'Received'

  const recvDate = out.date_of_sample_receiving
    ? String(out.date_of_sample_receiving).slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  if (!out.date_of_sample_receiving) out.date_of_sample_receiving = recvDate

  if (!out.srf_number) {
    out.srf_number = await generateNextSrfNumber(client, recvDate)
  }

  if (!out.tentative_date_required) out.tentative_date_required = addDaysIso(recvDate, 10)
  if (!out.tentative_date_by_lab) out.tentative_date_by_lab = addDaysIso(recvDate, 10)

  if (out.competent_person_available === undefined) out.competent_person_available = true
  if (out.equipment_available === undefined) out.equipment_available = true
  if (out.can_complete_within_time === undefined) out.can_complete_within_time = true
  if (out.testing_method_available === undefined) out.testing_method_available = true
  if (out.sampling_procedure_ref === undefined) out.sampling_procedure_ref = true

  if (out.sample_description && !out.description) out.description = out.sample_description

  return out
}

async function resolveRowId(
  client: SupabaseClient,
  table: string,
  input: CrudActionInput,
  options?: CrudExecutionOptions,
): Promise<string | null> {
  const direct = String(input.id ?? '').trim()
  if (direct) return direct

  if (
    options?.activeRecordId?.trim() &&
    options.activeRecordTable === table
  ) {
    return options.activeRecordId.trim()
  }

  const match = input.match ?? {}
  const data = input.data ?? {}

  if (table === 'is_codes') {
    const isNumber = String(match.is_number ?? data.is_number ?? '').trim()
    if (isNumber) {
      return await resolveIsCodeId(client, isNumber, match.revision_year ?? data.revision_year)
    }
  }

  if (table === 'clients') {
    const name = String(match.company_name ?? data.company_name ?? '').trim()
    if (name) return await resolveClientId(client, name)
  }

  return null
}

export async function executeLimsCrud(
  client: SupabaseClient,
  page: string | undefined,
  input: CrudActionInput,
  options?: CrudExecutionOptions,
): Promise<CrudActionResult> {
  const operation = input.operation
  const table = String(input.table ?? '').trim()

  if (!table || BLOCKED_TABLES.has(table)) {
    return {
      operation,
      table,
      ok: false,
      message: `Table "${table}" is not allowed.`,
    }
  }

  const allowed = getAllowedTables(page)
  if (!allowed.has(table)) {
    return {
      operation,
      table,
      ok: false,
      message: `Table "${table}" is not allowed on page "${page ?? 'unknown'}". Allowed: ${[...allowed].join(', ')}`,
    }
  }

  try {
    if (operation === 'create') {
      let data = sanitizeData(input.data ?? {}, 'create')
      if (table === 'samples') {
        data = await prepareSampleCreateData(client, data)
      }
      const { data: row, error } = await client.from(table).insert(data).select('id').single()
      if (error) throw error
      const id = (row as { id?: string } | null)?.id
      return { operation, table, id, ok: true, message: `Created row in ${table}.` }
    }

    if (operation === 'update') {
      const id = await resolveRowId(client, table, input, options)
      if (!id) {
        return {
          operation,
          table,
          ok: false,
          message:
            'Could not resolve row id. Pass id from Page data, or match { is_number, revision_year } / { company_name }.',
        }
      }
      const data = sanitizeData(input.data ?? {}, 'update')
      if (Object.keys(data).length === 0) {
        return { operation, table, id, ok: false, message: 'data must include fields to update.' }
      }
      const { error } = await client.from(table).update(data).eq('id', id)
      if (error) throw error
      return { operation, table, id, ok: true, message: `Updated row in ${table}.` }
    }

    if (operation === 'delete') {
      const id = await resolveRowId(client, table, input, options)
      if (!id) {
        return {
          operation,
          table,
          ok: false,
          message: 'Could not resolve row id for delete. Pass id from Page data.',
        }
      }
      const { error } = await client.from(table).delete().eq('id', id)
      if (error) throw error
      return { operation, table, id, ok: true, message: `Deleted row from ${table}.` }
    }

    return { operation, table, ok: false, message: `Unknown operation: ${operation}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { operation, table, id: input.id, ok: false, message: msg }
  }
}

export const LIMS_CRUD_TOOL = {
  type: 'function' as const,
  function: {
    name: 'lims_crud',
    description:
      'Create, update, or delete one row in Qirlpl LIMS. Use when the user asks to add, save, change, or remove data.',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'update', 'delete'] },
        table: { type: 'string', description: 'Postgres table name, e.g. is_codes, clients' },
        id: { type: 'string', description: 'Row UUID from Page data (preferred for update/delete)' },
        match: {
          type: 'object',
          description: 'Optional lookup if id unknown: is_codes { is_number, revision_year }; clients { company_name }',
        },
        data: { type: 'object', description: 'Column values for create/update' },
      },
      required: ['operation', 'table'],
    },
  },
}
