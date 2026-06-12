import type { SampleRow, SampleStage } from './types'

const WORKFLOW_STATUS_BY_STAGE: Record<Exclude<SampleStage, 'receiving'>, string> = {
  allocation: 'Sample Allocation',
  test_allocation: 'Test Allocation',
  under_testing: 'Under Testing',
  results_review: 'Results Under Review',
  report_preparation: 'Test Report Preparation',
  completed: 'Completed',
}

/** Display status in Sample Receiving list: receiving status at receiving stage, else workflow stage label. */
export function getSampleWorkflowStatusLabel(
  row: Pick<SampleRow, 'stage' | 'sample_receiving_status' | 'status'>,
): string {
  const stage = (row.stage ?? 'receiving').trim().toLowerCase()
  if (!stage || stage === 'receiving') {
    const receiving = row.sample_receiving_status?.trim() || row.status?.trim()
    return receiving || 'Received'
  }
  if (stage in WORKFLOW_STATUS_BY_STAGE) {
    return WORKFLOW_STATUS_BY_STAGE[stage as Exclude<SampleStage, 'receiving'>]
  }
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
