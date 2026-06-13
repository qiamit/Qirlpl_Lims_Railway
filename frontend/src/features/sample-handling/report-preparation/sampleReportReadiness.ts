import { supabase } from '@/lib/supabaseClient'
import { RESULTS_REVIEW_APPROVED_LABEL } from '../results-under-review/resultsUnderReviewPartitions'

type SectionApprovalOptions = {
  /** Pre–Approved-marker data: reviewer cleared and all results filled. */
  allowLegacyCompleteResults?: boolean
}

type SectionApprovalState = {
  sampleAllocationId: string
  testAllocationId: string
  sentForTesting: boolean
  approved: boolean
}

/** Section has no pending reviewer and was approved in Results Under Review. */
async function testAllocationSectionIsReviewApproved(
  testAllocationId: string,
  options?: SectionApprovalOptions,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('test_allocation_parameters')
    .select('results_reviewer_id, results_reviewer_name, results')
    .eq('test_allocation_id', testAllocationId)
  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  if (rows.length === 0) return false

  const hasPendingReviewer = rows.some(
    (p) => Boolean((p as { results_reviewer_id?: string | null }).results_reviewer_id),
  )
  if (hasPendingReviewer) return false

  const hasApprovedLabel = rows.some(
    (p) =>
      String((p as { results_reviewer_name?: string | null }).results_reviewer_name ?? '').trim() ===
      RESULTS_REVIEW_APPROVED_LABEL,
  )
  if (hasApprovedLabel) return true

  if (options?.allowLegacyCompleteResults) {
    return rows.every((p) => String((p as { results?: string | null }).results ?? '').trim().length > 0)
  }

  return false
}

function pickTestAllocationPerSection(
  taList: Array<{ id: string; sample_allocation_id: string; sent_for_testing?: boolean | null }>,
): Map<string, { id: string; sent_for_testing: boolean }> {
  const byAlloc = new Map<string, { id: string; sent_for_testing: boolean }>()
  for (const ta of taList) {
    const allocId = String(ta.sample_allocation_id ?? '').trim()
    const taId = String(ta.id ?? '').trim()
    if (!allocId || !taId) continue
    const sent = Boolean(ta.sent_for_testing)
    const existing = byAlloc.get(allocId)
    if (!existing || (sent && !existing.sent_for_testing)) {
      byAlloc.set(allocId, { id: taId, sent_for_testing: sent })
    }
  }
  return byAlloc
}

async function loadSampleSectionApprovalStates(
  sampleId: string,
): Promise<{ states: SectionApprovalState[]; allowLegacyCompleteResults: boolean }> {
  const { data: sampleRow, error: sampleErr } = await supabase
    .from('samples')
    .select('stage')
    .eq('id', sampleId)
    .maybeSingle()
  if (sampleErr) throw sampleErr
  const sampleStage = String((sampleRow as { stage?: string | null } | null)?.stage ?? '').trim()
  const stillInReview = await sampleStillHasResultsInReview(sampleId)
  const allowLegacyCompleteResults =
    sampleStage === 'report_preparation' ||
    (sampleStage === 'results_review' && !stillInReview)

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', sampleId)
  if (allocErr) throw allocErr

  const allocIds = (Array.isArray(allocRows) ? allocRows : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)

  if (allocIds.length === 0) {
    return { states: [], allowLegacyCompleteResults }
  }

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id, sample_allocation_id, sent_for_testing')
    .in('sample_allocation_id', allocIds)
  if (taErr) throw taErr

  const taList = (Array.isArray(taRows) ? taRows : []) as Array<{
    id: string
    sample_allocation_id: string
    sent_for_testing?: boolean | null
  }>
  const taByAlloc = pickTestAllocationPerSection(taList)

  const states: SectionApprovalState[] = []
  for (const allocId of allocIds) {
    const ta = taByAlloc.get(allocId)
    if (!ta) {
      states.push({
        sampleAllocationId: allocId,
        testAllocationId: '',
        sentForTesting: false,
        approved: false,
      })
      continue
    }
    const approved = await testAllocationSectionIsReviewApproved(ta.id, {
      allowLegacyCompleteResults,
    })
    states.push({
      sampleAllocationId: allocId,
      testAllocationId: ta.id,
      sentForTesting: ta.sent_for_testing,
      approved,
    })
  }

  return { states, allowLegacyCompleteResults }
}

/**
 * Show SRF in Test Report Preparation when at least one section was sent for testing
 * and its results were approved in Results Under Review.
 */
export async function isSampleVisibleInReportPreparation(sampleId: string): Promise<boolean> {
  const { states } = await loadSampleSectionApprovalStates(sampleId)
  return states.some((s) => s.sentForTesting && s.approved)
}

/**
 * SRF is fully ready to issue when every allocated section was sent for testing
 * and each section's results were approved in review.
 */
export async function isSampleReadyForReportPreparation(sampleId: string): Promise<boolean> {
  const { states } = await loadSampleSectionApprovalStates(sampleId)
  if (states.length === 0) return false
  return states.every((s) => s.sentForTesting && s.approved)
}

/** Any parameter still assigned to a results reviewer for this SRF. */
export async function sampleStillHasResultsInReview(sampleId: string): Promise<boolean> {
  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', sampleId)
  if (allocErr) throw allocErr

  const allocIds = (Array.isArray(allocRows) ? allocRows : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  if (allocIds.length === 0) return false

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id')
    .in('sample_allocation_id', allocIds)
  if (taErr) throw taErr

  const taIds = (Array.isArray(taRows) ? taRows : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  if (taIds.length === 0) return false

  const { data: paramRows, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select('results_reviewer_id, results_reviewer_name')
    .in('test_allocation_id', taIds)
  if (paramErr) throw paramErr

  return (Array.isArray(paramRows) ? paramRows : []).some((p) => {
    const row = p as { results_reviewer_id?: string | null; results_reviewer_name?: string | null }
    if (row.results_reviewer_id) return true
    return (
      String(row.results_reviewer_name ?? '').trim() === RESULTS_REVIEW_APPROVED_LABEL
    )
  })
}

/** Keep sample stage aligned: report_preparation when any section is approved for prep. */
export async function syncSampleReportPreparationStage(sampleId: string): Promise<void> {
  const id = sampleId.trim()
  if (!id) return

  const { data, error } = await supabase.from('samples').select('stage').eq('id', id).maybeSingle()
  if (error) throw error

  const stage = String((data as { stage?: string | null } | null)?.stage ?? '').trim()
  if (stage !== 'results_review' && stage !== 'report_preparation') return

  const visible = await isSampleVisibleInReportPreparation(id)
  const nextStage = visible ? 'report_preparation' : 'results_review'
  if (stage === nextStage) return

  const { error: updErr } = await supabase.from('samples').update({ stage: nextStage }).eq('id', id)
  if (updErr) throw updErr
}
