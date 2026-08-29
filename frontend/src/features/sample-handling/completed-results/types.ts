export const ISSUED_REPORT_ISSUE_KINDS = [
  { value: 'amendment', label: 'Amendment Report' },
  { value: 'revised', label: 'Revised Report' },
  { value: 'supplementary', label: 'Supplementary Report' },
] as const

export type IssuedReportIssueKind = (typeof ISSUED_REPORT_ISSUE_KINDS)[number]['value']

export const ISSUED_REPORT_REFERBACK_TARGETS = [
  { value: 'allocation', label: 'Sample Allocation' },
  { value: 'test_allocation', label: 'Test Allocation' },
  { value: 'under_testing', label: 'Sample Under Testing' },
  { value: 'results_review', label: 'Results Under Review' },
  { value: 'report_preparation', label: 'Test Report Preparation' },
] as const

export type IssuedReportReferbackTarget = (typeof ISSUED_REPORT_REFERBACK_TARGETS)[number]['value']

/** Sentinel value for referring every section on the SRF. */
export const BOTH_SECTION_CODES_VALUE = '__both_section_codes__'
export const BOTH_SECTION_CODES_LABEL = 'Both Section Code'

export function issuedReportReferbackTargetLabel(target: IssuedReportReferbackTarget): string {
  return ISSUED_REPORT_REFERBACK_TARGETS.find((o) => o.value === target)?.label ?? target
}

export function receivingReportTypeForIssueKind(kind: IssuedReportIssueKind): string {
  if (kind === 'amendment') return 'Amendment Report'
  if (kind === 'revised') return 'Revised Report'
  return 'Supplementary Report'
}

export type IssueAndReferbackSectionInput = {
  sampleAllocationId: string
  testAllocationId: string
  sectionCode: string
  department: string
  designation: string
  employee: { id: string; name: string }
  targetStage: IssuedReportReferbackTarget
}

export type IssuedTestReportListRow = {
  id: string
  srfNumber: string | null
  dateReceiving: string | null
  clientName: string | null
  clientEmail: string | null
  isCodeId: string | null
  isCodeLabel: string | null
  reportNumberBase: string | null
  nablIssuedAt: string | null
  nonNablIssuedAt: string | null
  issuedAt: string | null
  nablUlrNumber: string | null
}
