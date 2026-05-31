import { supabase } from '@/lib/supabaseClient'

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
    .select('results_reviewer_id')
    .in('test_allocation_id', taIds)
  if (paramErr) throw paramErr

  return (Array.isArray(paramRows) ? paramRows : []).some(
    (p) => (p as { results_reviewer_id?: string | null }).results_reviewer_id,
  )
}

/** At least one section was sent for testing on this SRF. */
export async function sampleHasSentForTesting(sampleId: string): Promise<boolean> {
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
    .eq('sent_for_testing', true)
    .limit(1)
  if (taErr) throw taErr

  return (Array.isArray(taRows) ? taRows : []).length > 0
}

/** Approved in review — no reviewer pending and testing was sent at least once. */
export async function isSampleReadyForReportPreparation(sampleId: string): Promise<boolean> {
  const [hasTesting, stillInReview] = await Promise.all([
    sampleHasSentForTesting(sampleId),
    sampleStillHasResultsInReview(sampleId),
  ])
  return hasTesting && !stillInReview
}
