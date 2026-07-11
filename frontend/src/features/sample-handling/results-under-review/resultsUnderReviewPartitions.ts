import type { TestAllocationRow } from '../types'
import {
  countFilledResults,
  getSectionParametersForEntry,
} from '../sample-under-testing/sectionParameterRows'

/** Legacy marker previously written into results_reviewer_name (migrated to results_review_status). */
export const RESULTS_REVIEW_APPROVED_LABEL = 'Approved'

export const RESULTS_REVIEW_STATUS_UNDER_REVIEW = 'under_review'
export const RESULTS_REVIEW_STATUS_APPROVED = 'approved'

export type ResultsReviewStatusValue =
  | typeof RESULTS_REVIEW_STATUS_UNDER_REVIEW
  | typeof RESULTS_REVIEW_STATUS_APPROVED

export function normalizeResultsReviewStatus(
  status: string | null | undefined,
): ResultsReviewStatusValue | null {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
  if (s === RESULTS_REVIEW_STATUS_APPROVED) return RESULTS_REVIEW_STATUS_APPROVED
  if (s === RESULTS_REVIEW_STATUS_UNDER_REVIEW || s === 'submitted') {
    return RESULTS_REVIEW_STATUS_UNDER_REVIEW
  }
  return null
}

export function isResultsReviewStatusApproved(
  status: string | null | undefined,
  reviewerName?: string | null,
): boolean {
  if (normalizeResultsReviewStatus(status) === RESULTS_REVIEW_STATUS_APPROVED) return true
  return reviewerName?.trim() === RESULTS_REVIEW_APPROVED_LABEL
}

export function isActiveReviewerName(name: string | null | undefined): boolean {
  const n = name?.trim()
  if (!n) return false
  if (n === RESULTS_REVIEW_APPROVED_LABEL) return false
  return true
}

export function sectionHasReviewerAssignment(row: TestAllocationRow): boolean {
  if (sectionWasApprovedForReview(row)) return false
  if (row.resultsReviewerName?.trim() && isActiveReviewerName(row.resultsReviewerName)) return true
  return (row.parameters ?? []).some((p) => {
    const status = (p as { resultsReviewStatus?: string | null }).resultsReviewStatus
    if (isResultsReviewStatusApproved(status, (p as { resultsReviewerName?: string | null }).resultsReviewerName)) {
      return false
    }
    const reviewerId = (p as { resultsReviewerId?: string | null }).resultsReviewerId
    const reviewerName = (p as { resultsReviewerName?: string | null }).resultsReviewerName
    return Boolean(reviewerId?.trim()) || isActiveReviewerName(reviewerName)
  })
}

export function sectionWasApprovedForReview(row: TestAllocationRow): boolean {
  if (isResultsReviewStatusApproved(row.resultsReviewStatus, row.resultsReviewerName)) return true
  return (row.parameters ?? []).some((p) =>
    isResultsReviewStatusApproved(
      (p as { resultsReviewStatus?: string | null }).resultsReviewStatus,
      (p as { resultsReviewerName?: string | null }).resultsReviewerName,
    ),
  )
}

function sectionHasCompleteResults(row: TestAllocationRow): boolean {
  const entries = getSectionParametersForEntry(row)
  const { filled, total } = countFilledResults(entries)
  return total > 0 && filled === total
}

function isSampleInReviewWorkflowStage(stage: TestAllocationRow['sampleStage']): boolean {
  return (
    stage === 'results_review' ||
    stage === 'report_preparation' ||
    stage === 'under_testing' ||
    stage === 'completed'
  )
}

/**
 * Section belongs on Results Under Review — active review, approved history
 * (incl. issued / completed), or sections awaiting re-review.
 * Excludes sections referred back to Sample Under Testing.
 */
export function isSectionVisibleInResultsUnderReview(row: TestAllocationRow): boolean {
  if (row.referredBackFromReview) return false
  if (sectionHasReviewerAssignment(row)) return true
  if (sectionWasApprovedForReview(row)) return true
  if (!isSampleInReviewWorkflowStage(row.sampleStage)) return false

  if (row.sampleStage === 'completed' && sectionHasCompleteResults(row)) return true

  if (row.sentForTesting && sectionHasCompleteResults(row)) return true

  return false
}

/** Dept/designation scoped list uses the same visibility rules. */
export function isSectionVisibleInScopedResultsUnderReview(row: TestAllocationRow): boolean {
  return isSectionVisibleInResultsUnderReview(row)
}

/** Pending = in review workflow and not yet marked Approved (issued/completed stay in Reviewed). */
export function isResultsReviewPendingRow(row: TestAllocationRow): boolean {
  if (sectionWasApprovedForReview(row)) return false
  if (row.sampleStage === 'completed') return false
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
    if (sectionWasApprovedForReview(row) || row.sampleStage === 'completed') {
      reviewed.push(row)
    } else if (isResultsReviewPendingRow(row)) {
      pending.push(row)
    }
  }
  return { pending, reviewed }
}
