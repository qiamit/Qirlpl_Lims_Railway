import { supabase } from '@/lib/supabaseClient'
import { cloneIssuedSampleForAmendment } from './cloneIssuedSampleForAmendment'
import {
  issuedReportReferbackTargetLabel,
  receivingReportTypeForIssueKind,
  type IssueAndReferbackSectionInput,
  type IssuedReportIssueKind,
  type IssuedReportReferbackTarget,
} from './types'

const TARGETS_NEEDING_TEST_ALLOC: ReadonlySet<IssuedReportReferbackTarget> = new Set([
  'test_allocation',
  'under_testing',
  'results_review',
])

export type { IssueAndReferbackSectionInput }

export type IssueAndReferbackIssuedReportInput = {
  sampleId: string
  srfNumber: string | null
  issueKind: IssuedReportIssueKind
  sections: IssueAndReferbackSectionInput[]
  remark: string
  createdBy?: string | null
}

export async function issueAndReferbackIssuedReport(
  input: IssueAndReferbackIssuedReportInput,
): Promise<{ targetLabel: string; newSrfNumber: string; newSampleId: string }> {
  const sampleId = input.sampleId.trim()
  const sections = input.sections
    .map((s) => ({
      sampleAllocationId: s.sampleAllocationId.trim(),
      testAllocationId: s.testAllocationId.trim(),
      sectionCode: s.sectionCode.trim(),
      department: s.department.trim(),
      designation: s.designation.trim(),
      employee: { id: s.employee.id.trim(), name: s.employee.name.trim() },
      targetStage: s.targetStage,
    }))
    .filter((s) => s.sampleAllocationId)
  const reportType = receivingReportTypeForIssueKind(input.issueKind)
  const remark =
    input.remark.trim() || `${reportType} created from Issued Test Report ${input.srfNumber?.trim() || ''}`.trim()

  if (!sampleId) throw new Error('Missing sample id.')
  if (sections.length === 0) throw new Error('Select a section code.')
  if (sections.some((s) => !s.employee.id)) throw new Error('Select an employee for every section.')
  for (const section of sections) {
    if (TARGETS_NEEDING_TEST_ALLOC.has(section.targetStage) && !section.testAllocationId) {
      throw new Error(
        `${section.sectionCode || 'A section'} has no test allocation. Choose Sample Allocation or Test Report Preparation, or allocate tests first.`,
      )
    }
  }

  const cloned = await cloneIssuedSampleForAmendment({
    sourceSampleId: sampleId,
    sourceSrfNumber: input.srfNumber,
    issueKind: input.issueKind,
    sections,
    remark,
  })

  const historyRows = sections.map((section) => ({
    sample_id: cloned.newSampleId,
    srf_number: cloned.newSrfNumber,
    issue_kind: input.issueKind,
    section_code: section.sectionCode || null,
    sample_allocation_id: cloned.allocIdByOld[section.sampleAllocationId] ?? section.sampleAllocationId,
    test_allocation_id: section.testAllocationId
      ? cloned.testAllocIdByOld[section.testAllocationId] ?? section.testAllocationId
      : null,
    department: section.department || null,
    designation: section.designation || null,
    employee_id: section.employee.id,
    employee_name: section.employee.name || null,
    target_stage: section.targetStage,
    remark,
    created_by: input.createdBy?.trim() || null,
  }))
  const { error: histErr } = await supabase.from('issued_report_amendments').insert(historyRows)
  if (histErr) {
    const missingTable =
      histErr.message?.includes('issued_report_amendments') ||
      histErr.code === '42P01' ||
      histErr.code === 'PGRST205' ||
      histErr.code === 'PGRST116'
    throw new Error(
      missingTable
        ? `New SRF ${cloned.newSrfNumber} was created, but the amendment history table is not available on the API yet. Ask to reload PostgREST schema.`
        : histErr.message || `New SRF ${cloned.newSrfNumber} was created, but the amendment record could not be saved.`,
    )
  }

  const uniqueTargets = [...new Set(sections.map((s) => s.targetStage))]
  const targetLabel =
    uniqueTargets.length === 1
      ? issuedReportReferbackTargetLabel(uniqueTargets[0])
      : uniqueTargets.map((t) => issuedReportReferbackTargetLabel(t)).join(', ')
  return {
    targetLabel,
    newSrfNumber: cloned.newSrfNumber,
    newSampleId: cloned.newSampleId,
  }
}
