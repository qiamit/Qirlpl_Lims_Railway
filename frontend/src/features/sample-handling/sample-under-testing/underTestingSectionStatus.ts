import { sectionWasApprovedForReview } from '../results-under-review/resultsUnderReviewPartitions'
import type { TestAllocationRow } from '../types'

/** Progress label under Submitted for Review / Approved in Sample Under Testing. */
export type UnderTestingSubmittedStatus =
  | 'submitted_for_review'
  | 'under_report_preparation'
  | 'test_report_issued'

export const UNDER_TESTING_SUBMITTED_STATUS_LABEL: Record<UnderTestingSubmittedStatus, string> = {
  submitted_for_review: 'Submitted for Review',
  under_report_preparation: 'Under Report Preparation',
  test_report_issued: 'Test Report Issued',
}

/**
 * Section left "Pending for Results" (locked / later sample stages).
 * Matches Sample Under Testing table partition.
 */
export function isSectionSubmittedForReview(
  row: Pick<
    TestAllocationRow,
    'referredBackFromReview' | 'sampleStage' | 'resultsLocked' | 'sectionReviewApproved'
  >,
): boolean {
  if (row.referredBackFromReview) return false
  const stage = String(row.sampleStage ?? '')
    .trim()
    .toLowerCase()
  // Issued / completed work must never sit in Pending for Results
  if (stage === 'completed') return true
  if (stage === 'report_preparation' && (row.resultsLocked || row.sectionReviewApproved)) return true
  return Boolean(row.resultsLocked)
}

/**
 * Workflow progress for a section that has left "Pending for Results"
 * (sent for review / approved / later stages).
 */
export function getUnderTestingSubmittedStatus(
  row: Pick<
    TestAllocationRow,
    'sampleStage' | 'sectionReviewApproved' | 'resultsReviewerName' | 'resultsReviewStatus'
  >,
): UnderTestingSubmittedStatus {
  const stage = String(row.sampleStage ?? '')
    .trim()
    .toLowerCase()

  if (stage === 'completed') return 'test_report_issued'
  if (stage === 'report_preparation') return 'under_report_preparation'
  return 'submitted_for_review'
}

export function isSectionApprovedForDisplay(
  row: Pick<TestAllocationRow, 'sectionReviewApproved' | 'resultsReviewerName' | 'resultsReviewStatus'>,
): boolean {
  if (row.sectionReviewApproved) return true
  return sectionWasApprovedForReview(row as TestAllocationRow)
}
