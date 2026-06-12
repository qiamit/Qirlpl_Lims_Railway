import { supabase } from '@/lib/supabaseClient'

export type ReportPrepSectionOption = {
  testAllocationId: string
  sampleAllocationId: string
  sectionCode: string
  department: string | null
  designation: string | null
}

/**
 * All section codes on this SRF (with department) for refer-back from Test Report Preparation.
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

  const out: ReportPrepSectionOption[] = []

  for (const [allocId, alloc] of allocById) {
    const taId = taByAllocId.get(allocId)
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
