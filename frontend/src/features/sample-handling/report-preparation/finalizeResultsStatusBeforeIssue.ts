import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { RESULTS_REVIEW_STATUS_APPROVED } from '@/features/sample-handling/results-under-review/resultsUnderReviewPartitions'

/**
 * Before moving a sample to Issued / completed, finalize section results status first:
 * set results_review_status = approved (keep reviewer id/name). Keep sent_for_testing
 * so Testing Engineers still see their sections with "Test Report Issued".
 */
export async function finalizeResultsStatusBeforeIssue(sampleId: string): Promise<void> {
  const id = sampleId.trim()
  if (!id) return

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', id)
  if (allocErr) throw allocErr

  const sampleAllocationIds = (Array.isArray(allocRows) ? allocRows : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  if (sampleAllocationIds.length === 0) return

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id')
    .in('sample_allocation_id', sampleAllocationIds)
  if (taErr) throw taErr

  const testAllocationIds = (Array.isArray(taRows) ? taRows : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  if (testAllocationIds.length === 0) return

  const { data: paramRows, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select('id, results_review_status')
    .in('test_allocation_id', testAllocationIds)
  if (paramErr) throw paramErr

  const pending = (Array.isArray(paramRows) ? paramRows : []).filter((row) => {
    const status = String((row as { results_review_status?: string }).results_review_status ?? '')
      .trim()
      .toLowerCase()
    return status !== RESULTS_REVIEW_STATUS_APPROVED
  })
  if (pending.length > 0) {
    throw new Error(
      `Cannot issue this report. ${pending.length} parameter(s) are not approved yet.`,
    )
  }

  const clearReferback = await supabase
    .from('test_allocations')
    .update({ referred_back_from_review: false })
    .in('id', testAllocationIds)
  if (
    clearReferback.error &&
    !isSupabaseMissingColumnError(clearReferback.error, 'referred_back_from_review')
  ) {
    throw clearReferback.error
  }
}
