import { supabase } from '@/lib/supabaseClient'

/** Remove test allocation rows (and parameters) for given sample_allocation ids. */
export async function deleteTestAllocationsForSampleAllocations(
  sampleAllocationIds: string[],
): Promise<void> {
  const ids = sampleAllocationIds.map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) return

  const { data: testRows, error: fetchErr } = await supabase
    .from('test_allocations')
    .select('id')
    .in('sample_allocation_id', ids)
  if (fetchErr) throw fetchErr

  const testAllocationIds = (Array.isArray(testRows) ? testRows : [])
    .map((r) => String((r as { id?: unknown }).id ?? '').trim())
    .filter(Boolean)

  if (testAllocationIds.length === 0) return

  const { error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .delete()
    .in('test_allocation_id', testAllocationIds)
  if (paramErr) throw paramErr

  const { error: taErr } = await supabase.from('test_allocations').delete().in('id', testAllocationIds)
  if (taErr) throw taErr
}

/** Where the SRF lands after removing a section from Test Allocation → Sample Receiving. */
export type ReferbackToReceivingResult = 'receiving' | 'allocation'

/**
 * Refer back one section from Test Allocation to Sample Receiving:
 * deletes test allocation + sample allocation for the section; unlocks receiving when no sections remain.
 */
export async function referbackSectionToSampleReceiving(
  sampleAllocationId: string,
  sampleId: string,
): Promise<ReferbackToReceivingResult> {
  const allocId = sampleAllocationId.trim()
  const sid = sampleId.trim()
  if (!allocId || !sid) {
    throw new Error('Missing section or sample id.')
  }

  await deleteTestAllocationsForSampleAllocations([allocId])

  const { error: delAllocErr } = await supabase.from('sample_allocations').delete().eq('id', allocId)
  if (delAllocErr) throw delAllocErr

  const { data: remaining, error: remErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', sid)
  if (remErr) throw remErr

  const remainingCount = Array.isArray(remaining) ? remaining.length : 0
  if (remainingCount === 0) {
    const { error: sampleErr } = await supabase
      .from('samples')
      .update({ stage: 'receiving', referback_from_allocation: true })
      .eq('id', sid)
    if (sampleErr) throw sampleErr
    return 'receiving'
  }

  return 'allocation'
}

export type AllocationSectionForTestAllocation = {
  id: string
  sectionCode: string
  department: string | null
  designation: string | null
  allocationDate: string | null
  isCodeId: string | null
  isCodeLabel: string | null
  srfNumber: string | null
}

/** Stages where the SRF is no longer managed on the Sample Allocation list. */
export const SAMPLE_ALLOCATION_LIST_HIDDEN_STAGES = new Set([
  'test_allocation',
  'under_testing',
  'results_review',
  'report_preparation',
])

export function isSampleVisibleInAllocationList(stage: string | null | undefined): boolean {
  const s = (stage ?? 'allocation').trim().toLowerCase()
  return !SAMPLE_ALLOCATION_LIST_HIDDEN_STAGES.has(s)
}

/**
 * Refer back whole SRF from Sample Allocation → Sample Receiving:
 * removes all section allocations and unlocks edit in Sample Receiving.
 */
export async function referbackSrfFromAllocationToSampleReceiving(
  sampleId: string,
  sampleAllocationIds: string[],
): Promise<void> {
  const sid = sampleId.trim()
  if (!sid) throw new Error('Missing sample id.')

  const allocIds = [...new Set(sampleAllocationIds.map((id) => id.trim()).filter(Boolean))]
  if (allocIds.length > 0) {
    await deleteTestAllocationsForSampleAllocations(allocIds)
    const { error: delErr } = await supabase.from('sample_allocations').delete().in('id', allocIds)
    if (delErr) throw delErr
  }

  const { error: sampleErr } = await supabase
    .from('samples')
    .update({ stage: 'receiving', referback_from_allocation: true })
    .eq('id', sid)
  if (sampleErr) throw sampleErr
}

/**
 * Send whole SRF from Sample Allocation → Test Allocation:
 * creates test_allocation rows per section and moves sample stage forward.
 */
export async function sendSrfFromAllocationToTestAllocation(
  sampleId: string,
  sections: AllocationSectionForTestAllocation[],
): Promise<void> {
  const sid = sampleId.trim()
  if (!sid) throw new Error('Missing sample id.')
  if (sections.length === 0) throw new Error('No section codes on this SRF.')

  for (const rec of sections) {
    const allocId = rec.id.trim()
    if (!allocId) continue

    const payload = {
      sample_allocation_id: allocId,
      sample_id: sid,
      section_code: rec.sectionCode,
      department: rec.department,
      designation: rec.designation,
      allocation_date: rec.allocationDate,
      is_code_id: rec.isCodeId,
      is_code_label: rec.isCodeLabel,
      srf_number: rec.srfNumber,
      sent_for_testing: false,
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('test_allocations')
      .select('id')
      .eq('sample_allocation_id', allocId)
      .maybeSingle()
    if (fetchErr) throw fetchErr

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from('test_allocations')
        .update(payload)
        .eq('id', String(existing.id))
      if (updErr) throw updErr
    } else {
      const { error: insErr } = await supabase.from('test_allocations').insert(payload)
      if (insErr) throw insErr
    }
  }

  const { error: stageErr } = await supabase
    .from('samples')
    .update({ stage: 'test_allocation', referback_from_allocation: false })
    .eq('id', sid)
  if (stageErr) throw stageErr
}
