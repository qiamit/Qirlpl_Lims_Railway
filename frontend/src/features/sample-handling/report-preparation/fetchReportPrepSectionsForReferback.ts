import { supabase } from '@/lib/supabaseClient'

export type ReportPrepSectionOption = {
  testAllocationId: string
  sampleAllocationId: string
  sectionCode: string
  department: string | null
  designation: string | null
}

function sectionHasReviewer(
  params: Array<{ results_reviewer_id?: string | null; results_reviewer_name?: string | null }>,
): boolean {
  return params.some(
    (p) =>
      Boolean(p.results_reviewer_id) ||
      Boolean(String(p.results_reviewer_name ?? '').trim()),
  )
}

/**
 * Sections on this SRF available for refer-back to Results Under Review.
 * Lists all section codes not already assigned to a results reviewer (any department).
 */
export async function fetchReportPrepSectionsForReferback(
  sampleId: string,
): Promise<ReportPrepSectionOption[]> {
  const sid = sampleId.trim()
  if (!sid) return []

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, section_code, department, designation')
    .eq('sample_id', sid)
    .order('section_code')
  if (allocErr) throw allocErr

  const allocations = Array.isArray(allocRows) ? allocRows : []
  if (allocations.length === 0) return []

  const allocById = new Map(
    allocations.map((a) => [
      String((a as { id: string }).id),
      a as { id: string; section_code?: string; department?: string | null; designation?: string | null },
    ]),
  )
  const allocIds = [...allocById.keys()]

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id, sample_allocation_id')
    .in('sample_allocation_id', allocIds)
  if (taErr) throw taErr

  const testAllocs = Array.isArray(taRows) ? taRows : []
  const taByAllocId = new Map<string, string>()
  for (const t of testAllocs) {
    const allocId = String((t as { sample_allocation_id: string }).sample_allocation_id)
    taByAllocId.set(allocId, String((t as { id: string }).id))
  }

  const taIds = testAllocs.map((t) => String((t as { id: string }).id))
  const paramsByTa = new Map<string, Array<{ results_reviewer_id?: string | null; results_reviewer_name?: string | null }>>()

  if (taIds.length > 0) {
    const { data: paramRows, error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .select('test_allocation_id, results_reviewer_id, results_reviewer_name')
      .in('test_allocation_id', taIds)
    if (paramErr) throw paramErr

    for (const p of Array.isArray(paramRows) ? paramRows : []) {
      const taId = String((p as { test_allocation_id?: string }).test_allocation_id ?? '')
      if (!taId) continue
      if (!paramsByTa.has(taId)) paramsByTa.set(taId, [])
      paramsByTa.get(taId)!.push(p as { results_reviewer_id?: string | null; results_reviewer_name?: string | null })
    }
  }

  const out: ReportPrepSectionOption[] = []

  for (const [allocId, alloc] of allocById) {
    const taId = taByAllocId.get(allocId)
    if (taId) {
      const params = paramsByTa.get(taId) ?? []
      if (params.length > 0 && sectionHasReviewer(params)) continue
    }

    out.push({
      testAllocationId: taId ?? '',
      sampleAllocationId: allocId,
      sectionCode: String(alloc.section_code ?? '').trim() || '—',
      department: alloc.department ?? null,
      designation: alloc.designation ?? null,
    })
  }

  return out.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode))
}
