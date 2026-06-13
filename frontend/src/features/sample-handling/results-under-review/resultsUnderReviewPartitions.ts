import type { TestAllocationRow } from '../types'
import {
  countFilledResults,
  getSectionParametersForEntry,
} from '../sample-under-testing/sectionParameterRows'

/** Stored in results_reviewer_name when a section is approved (reviewer id cleared). */
export const RESULTS_REVIEW_APPROVED_LABEL = 'Approved'

export function isActiveReviewerName(name: string | null | undefined): boolean {
  const n = name?.trim()
  if (!n) return false
  if (n === RESULTS_REVIEW_APPROVED_LABEL) return false
  return true
}

export function sectionHasReviewerAssignment(row: TestAllocationRow): boolean {
  if (row.resultsReviewerName?.trim() && isActiveReviewerName(row.resultsReviewerName)) return true
  return (row.parameters ?? []).some((p) => {
    const reviewerId = (p as { resultsReviewerId?: string | null }).resultsReviewerId
    const reviewerName = (p as { resultsReviewerName?: string | null }).resultsReviewerName
    return Boolean(reviewerId?.trim()) || isActiveReviewerName(reviewerName)
  })
}

export function sectionWasApprovedForReview(row: TestAllocationRow): boolean {
  if (row.resultsReviewerName?.trim() === RESULTS_REVIEW_APPROVED_LABEL) return true
  return (row.parameters ?? []).some(
    (p) =>
      (p as { resultsReviewerName?: string | null }).resultsReviewerName?.trim() ===
      RESULTS_REVIEW_APPROVED_LABEL,
  )
}

function sectionHasCompleteResults(row: TestAllocationRow): boolean {
  const entries = getSectionParametersForEntry(row)
  const { filled, total } = countFilledResults(entries)
  return total > 0 && filled === total
}

function isSampleInReviewWorkflowStage(stage: TestAllocationRow['sampleStage']): boolean {
  return stage === 'results_review' || stage === 'report_preparation' || stage === 'under_testing'
}

/**
 * Section belongs on Results Under Review — active review, approved history,
 * or sections awaiting re-review. Excludes sections referred back to Sample Under Testing.
 */
export function isSectionVisibleInResultsUnderReview(row: TestAllocationRow): boolean {
  if (row.referredBackFromReview) return false
  if (sectionHasReviewerAssignment(row)) return true
  if (sectionWasApprovedForReview(row)) return true
  if (!isSampleInReviewWorkflowStage(row.sampleStage)) return false

  if (row.sentForTesting && sectionHasCompleteResults(row)) return true

  return false
}

/** Dept/designation scoped list uses the same visibility rules. */
export function isSectionVisibleInScopedResultsUnderReview(row: TestAllocationRow): boolean {
  return isSectionVisibleInResultsUnderReview(row)
}

/** Pending = in review workflow and not yet marked Approved. */
export function isResultsReviewPendingRow(row: TestAllocationRow): boolean {
  if (sectionWasApprovedForReview(row)) return false
  return isSectionVisibleInResultsUnderReview(row)
}

/** True when any section on this SRF is still pending review approval. */
export function srfHasPendingReviewSections(
  rows: TestAllocationRow[],
  sampleId: string | null | undefined,
): boolean {
  const sid = sampleId?.trim()
  if (!sid) return false
  return rows.some((r) => r.sampleId?.trim() === sid && isResultsReviewPendingRow(r))
}

export function partitionResultsUnderReviewRows(rows: TestAllocationRow[]) {
  const pending: TestAllocationRow[] = []
  const reviewed: TestAllocationRow[] = []
  for (const row of rows) {
    if (sectionWasApprovedForReview(row)) {
      reviewed.push(row)
    } else if (isResultsReviewPendingRow(row)) {
      pending.push(row)
    }
  }
  return { pending, reviewed }
}
