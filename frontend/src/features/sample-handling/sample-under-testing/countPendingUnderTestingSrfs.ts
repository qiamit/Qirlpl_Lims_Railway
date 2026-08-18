import { supabase } from '@/lib/supabaseClient'
import { fetchAllByRange, fetchByIdChunks } from '../shared/fetchByIdChunks'
import { isResultsReviewStatusApproved } from '../results-under-review/resultsUnderReviewPartitions'
import { isParameterSentForReview } from './sampleUnderTestingVisibility'
import { isSectionSubmittedForReview } from './underTestingSectionStatus'

/**
 * Unique SRFs still in Sample Under Testing “Pending for Results”
 * (`sent_for_testing`, not submitted for review). Matches the Under Testing table.
 */
export async function countPendingUnderTestingSrfs(): Promise<number> {
  const testAllocs = await fetchAllByRange(async (from, to) => {
    const { data, error } = await supabase
      .from('test_allocations')
      .select('id, sample_allocation_id, referred_back_from_review')
      .eq('sent_for_testing', true)
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw error
    return Array.isArray(data) ? data : []
  })
  if (testAllocs.length === 0) return 0

  const allocIds = [
    ...new Set(
      testAllocs
        .map((t) => String((t as { sample_allocation_id?: string }).sample_allocation_id ?? ''))
        .filter(Boolean),
    ),
  ]
  const allocations = await fetchByIdChunks(allocIds, 100, async (chunkIds) => {
    const { data, error } = await supabase
      .from('sample_allocations')
      .select('id, sample_id')
      .in('id', chunkIds)
    if (error) throw error
    return Array.isArray(data) ? data : []
  })
  const sampleIdByAllocId = new Map(
    allocations.map((row) => [
      String((row as { id?: string }).id ?? ''),
      String((row as { sample_id?: string }).sample_id ?? ''),
    ]),
  )

  const sampleIds = [...new Set([...sampleIdByAllocId.values()].filter(Boolean))]
  const samples = await fetchByIdChunks(sampleIds, 100, async (chunkIds) => {
    const { data, error } = await supabase
      .from('samples')
      .select('id, stage')
      .in('id', chunkIds)
    if (error) throw error
    return Array.isArray(data) ? data : []
  })
  const stageBySampleId = new Map(
    samples.map((row) => [
      String((row as { id?: string }).id ?? ''),
      String((row as { stage?: string | null }).stage ?? ''),
    ]),
  )

  const testAllocIds = testAllocs
    .map((t) => String((t as { id?: string }).id ?? ''))
    .filter(Boolean)
  const params = await fetchByIdChunks(testAllocIds, 60, async (chunkIds) => {
    const { data, error } = await supabase
      .from('test_allocation_parameters')
      .select(
        'test_allocation_id, results_reviewer_id, results_reviewer_name, results_review_status',
      )
      .in('test_allocation_id', chunkIds)
    if (error) throw error
    return Array.isArray(data) ? data : []
  })

  const paramsByAlloc = new Map<
    string,
    Array<{
      results_reviewer_id?: string | null
      results_reviewer_name?: string | null
      results_review_status?: string | null
    }>
  >()
  for (const row of params) {
    const allocId = String((row as { test_allocation_id?: string | null }).test_allocation_id ?? '')
    if (!allocId) continue
    const list = paramsByAlloc.get(allocId) ?? []
    list.push(row as {
      results_reviewer_id?: string | null
      results_reviewer_name?: string | null
      results_review_status?: string | null
    })
    paramsByAlloc.set(allocId, list)
  }

  const pendingSampleIds = new Set<string>()
  for (const t of testAllocs) {
    const testAllocationId = String((t as { id?: string }).id ?? '')
    const sampleAllocId = String((t as { sample_allocation_id?: string }).sample_allocation_id ?? '')
    const sampleId = sampleIdByAllocId.get(sampleAllocId)
    if (!testAllocationId || !sampleId) continue

    const stage = stageBySampleId.get(sampleId) ?? ''
    const stageNorm = stage.trim().toLowerCase()
    const referredBack =
      (t as { referred_back_from_review?: boolean | null }).referred_back_from_review === true
    const fromDb = paramsByAlloc.get(testAllocationId) ?? []
    const sectionSentForReview =
      !referredBack &&
      (fromDb.some((p) => isParameterSentForReview(p)) || stageNorm === 'completed')
    const sectionApproved =
      fromDb.some((p) =>
        isResultsReviewStatusApproved(p.results_review_status, p.results_reviewer_name),
      ) || stageNorm === 'completed'

    if (
      isSectionSubmittedForReview({
        referredBackFromReview: referredBack,
        sampleStage: stage,
        resultsLocked: sectionSentForReview,
        sectionReviewApproved: sectionApproved,
      })
    ) {
      continue
    }
    pendingSampleIds.add(sampleId)
  }

  return pendingSampleIds.size
}
