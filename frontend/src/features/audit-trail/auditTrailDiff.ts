/** Pure helpers for the audit trail: table labels, field-level diff, CSV. */
import { csvCell } from '@/lib/csv'

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'

export type AuditRow = {
  id: string
  at: string
  actor: string | null
  table_name: string
  row_id: string | null
  action: AuditAction
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
  reason: string | null
}

export type FieldChange = {
  field: string
  oldValue: unknown
  newValue: unknown
  secret: boolean
}

/** Tables the audit trigger is attached to (20261024100000), with display names. */
export const AUDITED_TABLES: Array<{ value: string; label: string }> = [
  { value: 'samples', label: 'Samples' },
  { value: 'sample_allocations', label: 'Sample allocations' },
  { value: 'test_allocations', label: 'Test allocations' },
  { value: 'test_allocation_parameters', label: 'Test results (parameters)' },
  { value: 'test_parameters', label: 'Test parameters' },
  { value: 'test_parameter_units', label: 'Test parameter units' },
  { value: 'is_codes', label: 'IS codes' },
  { value: 'is_code_files', label: 'IS code files' },
  { value: 'nabl_scope', label: 'NABL scope (testing)' },
  { value: 'nabl_scope_lookups', label: 'NABL scope lookups' },
  { value: 'issued_report_amendments', label: 'Issued report amendments' },
  { value: 'consent_letters', label: 'Consent letters' },
  { value: 'sample_retention_disposal', label: 'Sample retention / disposal' },
  { value: 'calibration_jobs', label: 'Calibration jobs' },
  { value: 'calibration_raw_data_sheets', label: 'Calibration raw data sheets' },
  { value: 'calibration_service_requests', label: 'Calibration service requests' },
  { value: 'calibration_nabl_scope', label: 'NABL scope (calibration)' },
  { value: 'equipment_master', label: 'Equipment master' },
  { value: 'equipment_for_calibration', label: 'Equipment for calibration' },
  { value: 'equipment_crms', label: 'Equipment CRMs' },
  { value: 'equipment_breakdown_register', label: 'Equipment breakdown register' },
  { value: 'iqc_masters', label: 'IQC masters' },
  { value: 'iqc_plan_items', label: 'IQC plan items' },
  { value: 'result_validity_checks', label: 'Result validity checks' },
  { value: 'nc_work_records', label: 'Nonconforming work' },
  { value: 'nc_work_corrective_actions', label: 'NC corrective actions' },
  { value: 'nc_work_responsibility_matrix', label: 'NC responsibility matrix' },
  { value: 'customer_complaints', label: 'Customer complaints' },
  { value: 'customer_feedback', label: 'Customer feedback' },
  { value: 'audit_plans', label: 'Internal audit plans' },
  { value: 'audit_checklist_items', label: 'Audit checklist items' },
  { value: 'audit_nc_actions', label: 'Audit NC actions' },
  { value: 'mrm_plans', label: 'MRM plans' },
  { value: 'mrm_agenda_items', label: 'MRM agenda items' },
  { value: 'mrm_plan_recipients', label: 'MRM recipients' },
  { value: 'gr_confidentiality_records', label: 'Confidentiality records' },
  { value: 'gr_impartiality_risks', label: 'Impartiality risks' },
  { value: 'gr_improvements', label: 'Improvements' },
  { value: 'gr_objectives', label: 'Quality objectives' },
  { value: 'gr_risk_opportunities', label: 'Risks & opportunities' },
  { value: 'management_documents', label: 'Management documents' },
  { value: 'management_document_versions', label: 'Management document versions' },
  { value: 'lab_documents', label: 'Lab documents' },
  { value: 'compliance_registers', label: 'Compliance registers' },
  { value: 'lab_accreditations', label: 'Lab accreditations' },
  { value: 'accreditation_bodies', label: 'Accreditation bodies' },
  { value: 'clients', label: 'Clients' },
  { value: 'master_clients', label: 'Master clients' },
  { value: 'quotations', label: 'Quotations' },
  { value: 'quotation_line_items', label: 'Quotation line items' },
  { value: 'quotation_notes', label: 'Quotation notes' },
  { value: 'quotation_remarks', label: 'Quotation remarks' },
  { value: 'quotation_terms_conditions', label: 'Quotation terms' },
  { value: 'sale_documents', label: 'Sale documents' },
  { value: 'sale_document_signature_defaults', label: 'Sale document signatures' },
  { value: 'products_services_master', label: 'Products & services' },
  { value: 'gst_rates', label: 'GST rates' },
  { value: 'document_series', label: 'Document numbering' },
  { value: 'lab_settings', label: 'Lab settings' },
  { value: 'lab_letterheads', label: 'Lab letterheads' },
  { value: 'lab_prefixes', label: 'Lab prefixes' },
  { value: 'user_profiles', label: 'User profiles' },
  { value: 'module_access_rules', label: 'Module access rules' },
].sort((a, b) => a.label.localeCompare(b.label))

const TABLE_LABELS = new Map(AUDITED_TABLES.map((t) => [t.value, t.label]))

export function tableLabel(tableName: string): string {
  const known = TABLE_LABELS.get(tableName)
  if (known) return known
  const text = tableName.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Same rule as public.app_audit_strip_secrets() on the server. */
const SECRET_KEY = /(^|_)(api_?key|password|passwd|secret|token)(_|$)/i

export function isSecretField(field: string): boolean {
  return SECRET_KEY.test(field)
}

/** Columns that change on every save and say nothing about the record. */
const NOISE_FIELDS = new Set(['updated_at'])

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Only changed keys for UPDATE; every non-empty key for INSERT / DELETE. */
export function diffAuditRow(row: AuditRow): FieldChange[] {
  const oldRow = row.old_row ?? {}
  const newRow = row.new_row ?? {}
  const keys = Array.from(new Set([...Object.keys(oldRow), ...Object.keys(newRow)])).sort()
  const changes: FieldChange[] = []
  for (const field of keys) {
    const oldValue = oldRow[field]
    const newValue = newRow[field]
    if (row.action === 'UPDATE') {
      if (NOISE_FIELDS.has(field) || sameValue(oldValue, newValue)) continue
    } else if (row.action === 'INSERT') {
      if (newValue == null || newValue === '') continue
    } else if (oldValue == null || oldValue === '') {
      continue
    }
    changes.push({ field, oldValue, newValue, secret: isSecretField(field) })
  }
  return changes
}

export function formatAuditValue(value: unknown, secret = false): string {
  if (secret) return '•••• hidden'
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function fieldLabel(field: string): string {
  const text = field.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function actionLabel(action: AuditAction): string {
  if (action === 'INSERT') return 'Created'
  if (action === 'DELETE') return 'Deleted'
  return 'Updated'
}

export function changeSummary(changes: FieldChange[]): string {
  if (!changes.length) return 'No field changes'
  const names = changes.slice(0, 3).map((c) => fieldLabel(c.field))
  const more = changes.length > 3 ? ` +${changes.length - 3} more` : ''
  return `${changes.length} field${changes.length === 1 ? '' : 's'}: ${names.join(', ')}${more}`
}

export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const CSV_MAX_VALUE = 500

function clip(text: string): string {
  return text.length > CSV_MAX_VALUE ? `${text.slice(0, CSV_MAX_VALUE)}…` : text
}

export function auditRowsToCsv(rows: AuditRow[], actorName: (id: string | null) => string): string {
  const headers = [
    'Date & time',
    'User',
    'User ID',
    'Table',
    'Record ID',
    'Action',
    'Changed fields',
    'Changes (old -> new)',
    'Reason',
  ]
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) {
    const changes = diffAuditRow(row)
    const detail = changes
      .map((c) => {
        const oldText = clip(formatAuditValue(c.oldValue, c.secret))
        const newText = clip(formatAuditValue(c.newValue, c.secret))
        if (row.action === 'INSERT') return `${c.field}: ${newText}`
        if (row.action === 'DELETE') return `${c.field}: ${oldText}`
        return `${c.field}: ${oldText} -> ${newText}`
      })
      .join(' | ')
    lines.push(
      [
        formatAuditTimestamp(row.at),
        actorName(row.actor),
        row.actor ?? '',
        tableLabel(row.table_name),
        row.row_id ?? '',
        actionLabel(row.action),
        changes.map((c) => c.field).join('; '),
        detail,
        row.reason ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}
