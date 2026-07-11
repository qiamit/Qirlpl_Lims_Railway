import { supabase } from '@/lib/supabaseClient'
import {
  isActiveReviewerName,
  isResultsReviewStatusApproved,
  normalizeResultsReviewStatus,
  RESULTS_REVIEW_STATUS_APPROVED,
  RESULTS_REVIEW_STATUS_UNDER_REVIEW,
} from '../results-under-review/resultsUnderReviewPartitions'
import { fetchByIdChunks } from '../shared/fetchByIdChunks'

/** True when this parameter row is actively with a reviewer (not Approved / cleared). */
export function isParameterActivelyUnderReview(row: {
  results_reviewer_id?: string | null
  results_reviewer_name?: string | null
  results_review_status?: string | null
}): boolean {
  if (isResultsReviewStatusApproved(row.results_review_status, row.results_reviewer_name)) return false
  if (row.results_reviewer_id) return true
  return isActiveReviewerName(row.results_reviewer_name)
}

/** True when this test allocation parameter was sent to Results Under Review. */
export function isParameterSentForReview(row: {
  results_reviewer_id?: string | null
  results_reviewer_name?: string | null
  results_review_status?: string | null
}): boolean {
  const status = normalizeResultsReviewStatus(row.results_review_status)
  if (status === RESULTS_REVIEW_STATUS_APPROVED || status === RESULTS_REVIEW_STATUS_UNDER_REVIEW) {
    return true
  }
  if (row.results_reviewer_id) return true
  return isActiveReviewerName(row.results_reviewer_name)
}

/**
 * Load test_allocation ids that already have a results reviewer (sent for review).
 * Chunked to avoid PostgREST max-rows truncating large parameter lists.
 */
export async function fetchSentForReviewTestAllocationIds(
  testAllocationIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(testAllocationIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return new Set()

  const rows = await fetchByIdChunks(ids, 40, async (chunkIds) => {
    const { data, error } = await supabase
      .from('test_allocation_parameters')
      .select('test_allocation_id, results_reviewer_id, results_reviewer_name, results_review_status')
      .in('test_allocation_id', chunkIds)
    if (error) throw error
    return Array.isArray(data) ? data : []
  })

  const sent = new Set<string>()
  for (const row of rows) {
    const allocId = (row as { test_allocation_id?: string | null }).test_allocation_id
    if (!allocId) continue
    if (
      isParameterSentForReview(
        row as {
          results_reviewer_id?: string | null
          results_reviewer_name?: string | null
          results_review_status?: string | null
        },
      )
    ) {
      sent.add(allocId)
    }
  }
  return sent
}

/**
 * Samples moved to results_review before per-parameter reviewer existed (stage-only send).
 * Hide all their test allocations from Sample Under Testing.
 */
export function buildLegacyResultsReviewSampleIds(
  testAllocs: { id: string; sample_allocation_id: string }[],
  sampleIdBySampleAllocationId: Map<string, string>,
  samplesStageById: Map<string, string | null>,
  sentForReviewAllocIds: Set<string>,
): Set<string> {
  const legacy = new Set<string>()
  const allocsBySample = new Map<string, string[]>()

  for (const ta of testAllocs) {
    const sampleId = sampleIdBySampleAllocationId.get(ta.sample_allocation_id)
    if (!sampleId) continue
    if (!allocsBySample.has(sampleId)) allocsBySample.set(sampleId, [])
    allocsBySample.get(sampleId)!.push(ta.id)
  }

  for (const [sampleId, allocIds] of allocsBySample) {
    if (samplesStageById.get(sampleId) !== 'results_review') continue
    const anyInReviewWorkflow = allocIds.some((id) => sentForReviewAllocIds.has(id))
    if (!anyInReviewWorkflow) legacy.add(sampleId)
  }

  return legacy
}

export function shouldHideFromSampleUnderTesting(input: {
  testAllocationId: string | undefined
  sampleId: string
  sentForReviewAllocIds: Set<string>
  legacyResultsReviewSampleIds: Set<string>
  /** Active in Sample Under Testing (incl. refer-back from Results Under Review). */
  sentForTesting?: boolean
}): boolean {
  // Keep sent_for_testing sections visible through review / report prep / issued
  // so Testing Engineers can track status on their sections.
  if (input.sentForTesting) return false
  if (input.legacyResultsReviewSampleIds.has(input.sampleId)) return true
  return false
}
