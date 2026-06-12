import type { TestAllocationRow } from '../types'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

export function formatTestAllocationRowTitle(row: TestAllocationRow): string {
  const srf = row.srfNumber?.trim() || 'SRF'
  return `${row.sectionCode} — ${srf}`
}

/** Row-level context for Test Allocation QI Assistant. */
export function buildTestAllocationRowAssistantContext(row: TestAllocationRow): string {
  const lines = [
    'Module: Test Allocation — single section assistant',
    row.testAllocationId ? `test_allocations id (UUID): ${row.testAllocationId}` : '',
    `sample_allocations id (UUID): ${row.sampleAllocationId}`,
    `sample id (UUID): ${row.sampleId}`,
    `Section code: ${row.sectionCode}`,
    `SRF Number: ${fmt(row.srfNumber)}`,
    `IS Code: ${fmt(row.isCodeLabel)}`,
    row.isCodeId ? `Linked is_code_id: ${row.isCodeId}` : '',
    `Department: ${fmt(row.department)}`,
    `Designation: ${fmt(row.designation)}`,
    `Assigned employee: ${fmt(row.assignedEmployeeName)}`,
    row.assignedEmployeeId ? `assigned_employee_id: ${row.assignedEmployeeId}` : '',
    `Test parameters: ${fmt(row.testParameterSummary)}`,
    row.testParameterIds.length > 0 ? `test_parameter_ids: ${row.testParameterIds.join(', ')}` : '',
    '',
    'Use test_allocations / test_allocation_parameters ids in lims_crud for updates.',
    'Referback removes this section from Test Allocation and returns it to Sample Allocation workflow.',
  ]

  return lines.filter((line) => line.length > 0).join('\n')
}

/** List-level context for Test Allocation header assistant. */
export function buildTestAllocationListAssistantContext(
  rows: TestAllocationRow[],
  search: string,
): string {
  const pending = rows.filter((r) => !r.sentForTesting)
  const sent = rows.filter((r) => r.sentForTesting)
  const lines = [
    'Module: Test Allocation — list assistant',
    `Search filter: ${search.trim() || '(none)'}`,
    `Total sections shown: ${rows.length}`,
    `Pending for testing: ${pending.length}`,
    `Sent for testing: ${sent.length}`,
    '',
    'Sections:',
    ...rows.slice(0, 50).map((r) => {
      const status = r.sentForTesting ? 'SENT' : 'PENDING'
      return `- ${r.sectionCode} | ${status} | IS: ${fmt(r.isCodeLabel)} | ${fmt(r.assignedEmployeeName)} | ${fmt(r.testParameterSummary?.slice(0, 120))}`
    }),
    rows.length > 50 ? `… and ${rows.length - 50} more` : '',
    '',
    'Referback removes a section from Test Allocation and returns it to Sample Allocation (test parameters cleared).',
  ]
  return lines.filter((line) => line.length > 0).join('\n')
}
