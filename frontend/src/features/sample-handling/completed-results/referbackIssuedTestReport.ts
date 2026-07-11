import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { clearSampleRetentionPayload } from '@/features/sample-handling/retain-disposed/sampleRetention'
import {
  allTestAllocationIdsForSample,
  ensureTestAllocationParameterRows,
} from '@/features/sample-handling/shared/ensureTestAllocationParameterRows'

function clearIssuedTimestampsPayload(stage: string): Record<string, string | null> {
  return {
    stage,
    test_report_issued_at: null,
    test_report_nabl_issued_at: null,
    test_report_non_nabl_issued_at: null,
    ...clearSampleRetentionPayload(),
  }
}

async function updateSampleStage(sampleId: string, payload: Record<string, string | null>): Promise<void> {
  let { error } = await supabase.from('samples').update(payload).eq('id', sampleId)

  if (error && isSupabaseMissingColumnError(error, 'test_report_non_nabl_issued_at')) {
    const { test_report_non_nabl_issued_at: _n, ...retry } = payload
    ;({ error } = await supabase.from('samples').update(retry).eq('id', sampleId))
  }

  if (error) throw error
}

/** Move issued SRF back to Test Report Preparation for edits. */
export async function referbackIssuedTestReportToPreparation(sampleId: string): Promise<void> {
  await updateSampleStage(sampleId, clearIssuedTimestampsPayload('report_preparation'))
}

/**
 * Move SRF back to Results Under Review (from Test Report Preparation or Issued).
 * Re-assigns all section parameters to the reviewer so they appear in Results Under Review.
 */
export async function referbackSampleToResultsReview(
  sampleId: string,
  reviewer: { id: string; name: string | null; department?: string | null },
): Promise<void> {
  const taIds = await allTestAllocationIdsForSample(sampleId, reviewer.department)
  if (taIds.length === 0) {
    const dept = reviewer.department?.trim()
    throw new Error(
      dept
        ? `No ${dept} test sections found for this SRF.`
        : 'No test sections found for this SRF.',
    )
  }

  for (const taId of taIds) {
    await ensureTestAllocationParameterRows(taId)
  }

  const { error: taFlagErr } = await supabase
    .from('test_allocations')
    .update({ sent_for_testing: true })
    .in('id', taIds)
  if (taFlagErr) throw taFlagErr

  const { error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .update({
      results_reviewer_id: reviewer.id,
      results_reviewer_name: reviewer.name,
      results_review_status: 'under_review',
    })
    .in('test_allocation_id', taIds)
  if (paramErr) throw paramErr

  const { data: assigned, error: checkErr } = await supabase
    .from('test_allocation_parameters')
    .select('id')
    .in('test_allocation_id', taIds)
    .eq('results_reviewer_id', reviewer.id)
    .limit(1)
  if (checkErr) throw checkErr
  if (!Array.isArray(assigned) || assigned.length === 0) {
    throw new Error(
      'Could not assign results reviewer. Add test parameters to this SRF and try again.',
    )
  }

  await updateSampleStage(sampleId, clearIssuedTimestampsPayload('results_review'))
}

export type ReferbackToReviewSectionInput = {
  testAllocationId: string
  reviewer: { id: string; name: string | null }
}

/** True when every test allocation on the SRF has a results reviewer on its parameters. */
async function allSampleSectionsInResultsReview(sampleId: string): Promise<boolean> {
  const taIds = await allTestAllocationIdsForSample(sampleId, null)
  if (taIds.length === 0) return false

  for (const taId of taIds) {
    const { data, error } = await supabase
      .from('test_allocation_parameters')
      .select('results_reviewer_id')
      .eq('test_allocation_id', taId)
    if (error) throw error
    const params = Array.isArray(data) ? data : []
    if (params.length === 0) return false
    const hasReviewer = params.some(
      (p) => (p as { results_reviewer_id?: string | null }).results_reviewer_id,
    )
    if (!hasReviewer) return false
  }
  return true
}

/**
 * Refer back selected section(s) to Results Under Review.
 * Sample stays in Test Report Preparation when other sections are not referred back.
 */
export async function referbackSectionsToResultsReview(
  sampleId: string,
  sections: ReferbackToReviewSectionInput[],
): Promise<{ allSectionsReferred: boolean }> {
  const sid = sampleId.trim()
  if (!sid) throw new Error('Missing sample id.')

  const unique = new Map<string, ReferbackToReviewSectionInput>()
  for (const row of sections) {
    const taId = row.testAllocationId.trim()
    if (!taId) continue
    unique.set(taId, row)
  }
  if (unique.size === 0) throw new Error('Select at least one section code.')

  for (const { testAllocationId, reviewer } of unique.values()) {
    await ensureTestAllocationParameterRows(testAllocationId)

    const { error: taFlagErr } = await supabase
      .from('test_allocations')
      .update({ sent_for_testing: true })
      .eq('id', testAllocationId)
    if (taFlagErr) throw taFlagErr

    const { error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .update({
        results_reviewer_id: reviewer.id,
        results_reviewer_name: reviewer.name,
        results_review_status: 'under_review',
      })
      .eq('test_allocation_id', testAllocationId)
    if (paramErr) throw paramErr

    const { data: assigned, error: checkErr } = await supabase
      .from('test_allocation_parameters')
      .select('id')
      .eq('test_allocation_id', testAllocationId)
      .eq('results_reviewer_id', reviewer.id)
      .limit(1)
    if (checkErr) throw checkErr
    if (!Array.isArray(assigned) || assigned.length === 0) {
      throw new Error('Could not assign results reviewer for a selected section.')
    }
  }

  const allSectionsReferred = await allSampleSectionsInResultsReview(sid)
  if (allSectionsReferred) {
    await updateSampleStage(sid, clearIssuedTimestampsPayload('results_review'))
  }

  return { allSectionsReferred }
}

/** @deprecated Use referbackSampleToResultsReview */
export const referbackIssuedTestReportToResultsReview = referbackSampleToResultsReview
