import type { SampleRow, SampleStage } from './types'

const WORKFLOW_STATUS_BY_STAGE: Record<Exclude<SampleStage, 'receiving'>, string> = {
  allocation: 'Sample Allocation',
  test_allocation: 'Test Allocation',
  under_testing: 'Under Testing',
  results_review: 'Results Under Review',
  report_preparation: 'Test Report Preparation',
  completed: 'Completed',
}

/** Workflow display order for Sample Status column sorting (asc = early → late). */
const WORKFLOW_STATUS_SORT_RANK: Record<string, number> = {
  received: 0,
  registered: 0,
  'sample allocation': 1,
  allocation: 1,
  'test allocation': 2,
  test_allocation: 2,
  'under testing': 3,
  under_testing: 3,
  'under review': 4,
  'results under review': 4,
  results_review: 4,
  'test report preparation': 5,
  'test report prepration': 5,
  report_preparation: 5,
  'test report issued': 6,
  completed: 6,
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

/** Rank for Sample Status sort — matches receiving → allocation → … → issued workflow. */
export function getSampleWorkflowStatusSortRank(
  row: Pick<SampleRow, 'stage' | 'sample_receiving_status' | 'status'>,
): number {
  const stage = (row.stage ?? 'receiving').trim().toLowerCase()
  if (stage && stage !== 'receiving') {
    if (stage in WORKFLOW_STATUS_SORT_RANK) return WORKFLOW_STATUS_SORT_RANK[stage]
    const byStageLabel = WORKFLOW_STATUS_BY_STAGE[stage as Exclude<SampleStage, 'receiving'>]
    if (byStageLabel) {
      const rank = WORKFLOW_STATUS_SORT_RANK[byStageLabel.toLowerCase()]
      if (rank != null) return rank
    }
    return 900
  }

  const receiving = (row.sample_receiving_status?.trim() || row.status?.trim() || 'Received').toLowerCase()
  if (receiving in WORKFLOW_STATUS_SORT_RANK) return WORKFLOW_STATUS_SORT_RANK[receiving]
  // Other receiving statuses (Rejected, Returned, …) after main workflow
  return 800
}
