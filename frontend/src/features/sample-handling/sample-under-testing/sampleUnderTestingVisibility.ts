import { supabase } from '@/lib/supabaseClient'
import { RESULTS_REVIEW_APPROVED_LABEL } from '../results-under-review/resultsUnderReviewPartitions'

/** True when this parameter row is actively with a reviewer (not Approved / cleared). */
export function isParameterActivelyUnderReview(row: {
  results_reviewer_id?: string | null
  results_reviewer_name?: string | null
}): boolean {
  if (row.results_reviewer_id) return true
  const name = row.results_reviewer_name?.trim()
  if (!name || name === RESULTS_REVIEW_APPROVED_LABEL) return false
  return true
}

/** True when this test allocation parameter was sent to Results Under Review. */
export function isParameterSentForReview(row: {
  results_reviewer_id?: string | null
  results_reviewer_name?: string | null
}): boolean {
  if (row.results_reviewer_id) return true
  const name = row.results_reviewer_name?.trim()
  if (!name) return false
  return true
}

/**
 * Load test_allocation ids that already have a results reviewer (sent for review).
 */
export async function fetchSentForReviewTestAllocationIds(
  testAllocationIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(testAllocationIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return new Set()

  const { data, error } = await supabase
    .from('test_allocation_parameters')
    .select('test_allocation_id, results_reviewer_id, results_reviewer_name')
    .in('test_allocation_id', ids)

  if (error) throw error

  const sent = new Set<string>()
  for (const row of Array.isArray(data) ? data : []) {
    const allocId = (row as { test_allocation_id?: string | null }).test_allocation_id
    if (!allocId) continue
    if (
      isParameterSentForReview(
        row as { results_reviewer_id?: string | null; results_reviewer_name?: string | null },
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
  // Sections still marked sent for testing must stay visible — including sibling sections
  // pending results when the SRF stage is results_review but reviewers were cleared (refer-back).
  if (input.sentForTesting) return false
  if (input.legacyResultsReviewSampleIds.has(input.sampleId)) return true
  return false
}
