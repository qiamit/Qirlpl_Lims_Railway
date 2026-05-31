import { supabase } from '@/lib/supabaseClient'
import { departmentsMatch } from './departmentMatch'

/** Creates test_allocation_parameters rows from test_allocations summary when missing. */
export async function ensureTestAllocationParameterRows(testAllocationId: string): Promise<void> {
  const taId = testAllocationId.trim()
  if (!taId) return

  const { data: existing, error } = await supabase
    .from('test_allocation_parameters')
    .select('id')
    .eq('test_allocation_id', taId)
    .limit(1)
  if (error) throw error
  if (Array.isArray(existing) && existing.length > 0) return

  const { data: ta, error: taErr } = await supabase
    .from('test_allocations')
    .select('test_parameter_summary, test_parameter_ids')
    .eq('id', taId)
    .maybeSingle()
  if (taErr) throw taErr
  if (!ta) return

  const summary = String(
    (ta as { test_parameter_summary?: string | null }).test_parameter_summary ?? '',
  ).trim()
  const rawIds = (ta as { test_parameter_ids?: unknown }).test_parameter_ids
  const ids = Array.isArray(rawIds)
    ? rawIds.map((x) => String(x).trim()).filter(Boolean)
    : []
  const labels = summary ? summary.split(',').map((s) => s.trim()).filter(Boolean) : []

  if (labels.length === 0 && ids.length === 0) return

  const count = Math.max(labels.length, ids.length)
  for (let i = 0; i < count; i += 1) {
    const label = labels[i] ?? `Parameter ${i + 1}`
    const { error: insErr } = await supabase.from('test_allocation_parameters').insert({
      test_allocation_id: taId,
      test_parameter_id: ids[i] ?? null,
      test_label: label,
    })
    if (insErr) throw insErr
  }
}

export async function allTestAllocationIdsForSample(
  sampleId: string,
  department?: string | null,
): Promise<string[]> {
  const { data: allocs, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, department')
    .eq('sample_id', sampleId)
  if (allocErr) throw allocErr

  const allocIds = (Array.isArray(allocs) ? allocs : [])
    .filter((r) => {
      const id = String((r as { id?: string }).id ?? '').trim()
      if (!id) return false
      const dept = (r as { department?: string | null }).department
      if (department?.trim()) return departmentsMatch(dept, department)
      return true
    })
    .map((r) => String((r as { id?: string }).id ?? '').trim())
  if (allocIds.length === 0) return []

  const { data: tas, error: taErr } = await supabase
    .from('test_allocations')
    .select('id')
    .in('sample_allocation_id', allocIds)
  if (taErr) throw taErr

  return (Array.isArray(tas) ? tas : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)
}
