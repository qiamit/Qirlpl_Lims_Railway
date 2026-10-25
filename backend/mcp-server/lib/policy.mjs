// What the connector may read and write (lab decisions of 25 Oct 2026,
// docs/mcp-connector-plan.md section 7). These rules come on top of row level
// security, the database guards and the user's Module Access level: they can
// only take access away, never add it.

/** Never through the connector (secrets, the connector's own tables, raw logs). */
export const HIDDEN_TABLES = new Set([
  'ai_settings',
  'ai_models',
  'ai_skills',
  'mcp_oauth_clients',
  'mcp_sessions',
  'schema_migrations',
  'finance_backfill_log',
  'audit_log', // read with audit_trail_search (changed fields only)
])

/**
 * Tables the Director cannot create or change through the connector:
 *  - result entry and review (Samples Under Testing → Enter Results, Results
 *    Under Review), result raw data, calibration raw data sheets;
 *  - issued reports, amendments and certificate amendments (issue / sign);
 *  - authorisation overrides, the call log, access and security settings,
 *    numbering series.
 */
export const WRITE_BLOCKED_TABLES = new Map([
  ['test_allocation_parameters', 'results are entered, submitted and approved only in the app (Samples Under Testing → Enter Results, Results Under Review)'],
  ['result_attachments', 'result raw data is added only in the app (Enter Results)'],
  ['calibration_raw_data_sheets', 'calibration results and their review are entered only in the app'],
  ['issued_report_archive', 'issued reports are frozen'],
  ['issued_report_amendments', 'report amendments are made only in the app'],
  ['calibration_certificate_amendments', 'certificate amendments are made only in the app'],
  ['authorization_exceptions', 'authorisation overrides are recorded only by the app'],
  ['mcp_calls', 'the connector call log cannot be changed'],
  ['lab_settings', 'lab settings are changed only in the app'],
  ['user_profiles', 'users and their designations are changed only in the app'],
  ['profiles', 'users are changed only in the app'],
  ['module_access_rules', 'module access is changed only in the app'],
  ['module_access_catalog', 'module access is changed only in the app'],
  ['module_access_enforcement', 'module access is changed only in the app'],
  ['module_access_mode_history', 'module access is changed only in the app'],
  ['module_access_denials', 'module access is changed only in the app'],
  ['module_table_map', 'module access is changed only in the app'],
  ['soft_delete_tables', 'delete settings are changed only in the app'],
  ['document_series', 'document numbering is changed only in the app'],
  ['auth_events', 'sign-in events cannot be changed'],
])

/** Rows the app numbers or builds in several steps: no new rows through the connector. */
export const CREATE_BLOCKED_TABLES = new Map([
  ['samples', 'new SRFs are registered in the app (Sample Receiving), which gives the SRF number'],
  ['sample_allocations', 'allocation is done in the app'],
  ['test_allocations', 'allocation is done in the app'],
  ['calibration_service_requests', 'calibration SRFs are registered in the app'],
  ['calibration_jobs', 'calibration jobs are created in the app'],
  ['quotations', 'quotations are numbered by the app'],
  ['sale_documents', 'sale documents are numbered by the app'],
  ['finance_proforma_invoices', 'invoices are numbered by the app'],
  ['finance_tax_invoices', 'invoices are numbered by the app'],
  ['finance_credit_notes', 'credit notes are numbered by the app'],
  ['consent_letters', 'consent letters are generated in the app'],
])

/** Columns never written through the connector, in any table. */
const BLOCKED_COLUMN_RULES = [
  [/^(deleted_at|deleted_by|delete_reason|archived_at)$/, 'delete is not possible through the connector'],
  [/(^|_)issued(_|$)|^issue_hold_|signature|reauthenticated/, 'issuing and signing are done only in the app'],
  [/^(id|created_at|updated_at|created_by)$/, 'set by the database'],
]

/** Columns blocked in one table. */
const BLOCKED_TABLE_COLUMNS = {
  samples: {
    stage: 'stage moves (including issue) are done in the app',
    status: 'stage moves are done in the app',
    test_report_number: 'report numbers are given by the app',
    test_report_nabl_ulr_number: 'ULR numbers are given by the app',
    srf_number: 'SRF numbers are given by the app',
    opinions_by: 'set by the database',
    opinions_by_name: 'set by the database',
    opinions_at: 'set by the database',
    referback_from_allocation: 'refer-back is done in the app',
  },
  calibration_jobs: {
    stage: 'stage moves (including certificate issue) are done in the app',
    stage_entered_at: 'stage moves are done in the app',
    certificate_draft: 'certificate results and signature are entered only in the app',
    srf_number: 'SRF numbers are given by the app',
  },
  test_allocations: {
    sent_for_testing: 'sending for testing and review is done in the app',
    referred_back_from_review: 'refer-back is done in the app',
  },
}

export function writeRefusal({ table, columns, create }) {
  if (HIDDEN_TABLES.has(table)) return `${table} is not available through the connector.`
  if (WRITE_BLOCKED_TABLES.has(table)) return `${table} cannot be changed through the connector: ${WRITE_BLOCKED_TABLES.get(table)}.`
  if (create && CREATE_BLOCKED_TABLES.has(table)) return `New ${table} rows cannot be created through the connector: ${CREATE_BLOCKED_TABLES.get(table)}.`
  for (const col of columns) {
    for (const [re, why] of BLOCKED_COLUMN_RULES) if (re.test(col)) return `Column ${col} cannot be written: ${why}.`
    const per = BLOCKED_TABLE_COLUMNS[table]?.[col]
    if (per) return `Column ${table}.${col} cannot be written: ${per}.`
  }
  return null
}

export function columnWriteNote(table, col) {
  for (const [re, why] of BLOCKED_COLUMN_RULES) if (re.test(col)) return why
  return BLOCKED_TABLE_COLUMNS[table]?.[col] || null
}

export const SAFE_NAME = /^[a-z_][a-z0-9_]{0,62}$/
