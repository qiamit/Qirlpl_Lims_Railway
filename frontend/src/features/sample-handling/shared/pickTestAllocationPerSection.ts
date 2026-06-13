import {
  isActiveReviewerName,
  RESULTS_REVIEW_APPROVED_LABEL,
} from '../results-under-review/resultsUnderReviewPartitions'

export type PickTestAllocationRow = {
  id: string
  sample_allocation_id: string
  sent_for_testing?: boolean | null
  referred_back_from_review?: boolean | null
}

export type PickTestAllocationParamRow = {
  results_reviewer_id: string | null
  results_reviewer_name: string | null
}

/**
 * When duplicate test_allocations exist for one section, pick the row that best
 * reflects current workflow (active review > refer-back > sent for testing > stale approved).
 */
export function pickTestAllocationPerSection<T extends PickTestAllocationRow>(
  taList: T[],
  paramsByAllocationId: Map<string, PickTestAllocationParamRow[]>,
): T[] {
  const byAlloc = new Map<string, T[]>()
  for (const ta of taList) {
    const allocId = String(ta.sample_allocation_id ?? '').trim()
    if (!allocId) continue
    if (!byAlloc.has(allocId)) byAlloc.set(allocId, [])
    byAlloc.get(allocId)!.push(ta)
  }

  const score = (ta: T): number => {
    const params = paramsByAllocationId.get(ta.id) ?? []
    const approved = params.some(
      (p) => p.results_reviewer_name?.trim() === RESULTS_REVIEW_APPROVED_LABEL,
    )
    const activeReviewer = params.some(
      (p) => p.results_reviewer_id || isActiveReviewerName(p.results_reviewer_name),
    )
    const markersCleared = params.length > 0 && !approved && !activeReviewer
    let value = 0
    if (activeReviewer) value += 50
    if (markersCleared && ta.sent_for_testing) value += 40
    if (ta.referred_back_from_review && ta.sent_for_testing) value += 35
    if (ta.sent_for_testing) value += 10
    if (approved) value += 5
    return value
  }

  const picked: T[] = []
  for (const list of byAlloc.values()) {
    let best = list[0]
    let bestScore = best ? score(best) : -1
    for (let i = 1; i < list.length; i += 1) {
      const candidate = list[i]!
      const candidateScore = score(candidate)
      if (candidateScore > bestScore) {
        best = candidate
        bestScore = candidateScore
      }
    }
    if (best) picked.push(best)
  }
  return picked
}
