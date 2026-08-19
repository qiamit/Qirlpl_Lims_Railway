import { supabase } from '@/lib/supabaseClient'
import { fetchAllByRange, fetchByIdChunks } from '@/features/sample-handling/shared/fetchByIdChunks'
import { countPendingUnderTestingSrfs } from '@/features/sample-handling/sample-under-testing/countPendingUnderTestingSrfs'
import { loadResultsUnderReviewRowsForDirector } from '@/features/sample-handling/results-under-review/loadResultsUnderReviewRowsForDirector'
import { partitionResultsUnderReviewRows } from '@/features/sample-handling/results-under-review/resultsUnderReviewPartitions'
import {
  filterSampleIdsVisibleInReportPreparation,
  syncSampleReportPreparationStages,
} from '@/features/sample-handling/report-preparation/sampleReportReadiness'

/** Unique SRFs still in Test Allocation work queue (not sent for testing). */
async function countPendingTestAllocationSrfs(): Promise<number> {
  const testAllocs = await fetchAllByRange(async (from, to) => {
    const { data, error } = await supabase
      .from('test_allocations')
      .select('id, sample_allocation_id, sent_for_testing')
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw error
    return Array.isArray(data) ? data : []
  })
  const pendingAllocIds = [
    ...new Set(
      testAllocs
        .filter((row) => !(row as { sent_for_testing?: boolean | null }).sent_for_testing)
        .map((row) => String((row as { sample_allocation_id?: string }).sample_allocation_id ?? ''))
        .filter(Boolean),
    ),
  ]
  if (pendingAllocIds.length === 0) return 0

  const allocations = await fetchByIdChunks(pendingAllocIds, 100, async (chunkIds) => {
    const { data, error } = await supabase.from('sample_allocations').select('id, sample_id').in('id', chunkIds)
    if (error) throw error
    return Array.isArray(data) ? data : []
  })
  return new Set(
    allocations.map((row) => String((row as { sample_id?: string }).sample_id ?? '')).filter(Boolean),
  ).size
}

/** Unique SRFs with at least one section still pending Results Under Review. */
async function countPendingResultsReviewSrfs(): Promise<number> {
  const list = await loadResultsUnderReviewRowsForDirector()
  const { pending } = partitionResultsUnderReviewRows(list)
  return new Set(pending.map((row) => row.sampleId?.trim()).filter(Boolean)).size
}

/** Unique SRFs shown in Test Report Preparation (approved section exists). */
async function countReportPreparationSrfs(sampleIds: string[]): Promise<number> {
  const visible = await filterSampleIdsVisibleInReportPreparation(sampleIds)
  if (visible.size > 0) {
    try {
      await syncSampleReportPreparationStages([...visible])
    } catch {
      /* counts still valid even if stage write fails */
    }
  }
  return visible.size
}

export type DashboardWorkflowCounts = {
  testAllocation: number
  underTesting: number
  resultsReview: number
  reportPreparation: number
}

export async function loadDashboardWorkflowCounts(
  candidateReportPrepSampleIds: string[],
): Promise<DashboardWorkflowCounts> {
  const [testAllocation, underTesting, resultsReview, reportPreparation] = await Promise.all([
    countPendingTestAllocationSrfs(),
    countPendingUnderTestingSrfs(),
    countPendingResultsReviewSrfs(),
    countReportPreparationSrfs(candidateReportPrepSampleIds),
  ])
  return { testAllocation, underTesting, resultsReview, reportPreparation }
}
