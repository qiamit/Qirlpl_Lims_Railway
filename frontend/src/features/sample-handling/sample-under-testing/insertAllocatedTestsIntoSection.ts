import { supabase } from '@/lib/supabaseClient'
import { resolveSectionSpecificRequirement } from '../shared/resolveSectionSpecificRequirement'
import type { TestAllocationParameterRow } from '../types'
import type { AllocatedTestOption } from './allocatedTestsForSection'

async function syncTestAllocationParameterSummary(testAllocationId: string): Promise<void> {
  const { data: paramRows, error: listErr } = await supabase
    .from('test_allocation_parameters')
    .select('test_parameter_id, test_label')
    .eq('test_allocation_id', testAllocationId)
    .order('test_label', { ascending: true })

  if (listErr) throw listErr

  const ids: string[] = []
  const labels: string[] = []
  for (const row of Array.isArray(paramRows) ? paramRows : []) {
    const r = row as { test_parameter_id?: string | null; test_label?: string | null }
    const id = r.test_parameter_id?.trim()
    const label = r.test_label?.trim()
    if (id) ids.push(id)
    if (label) labels.push(label)
  }

  const { error: syncErr } = await supabase
    .from('test_allocations')
    .update({
      test_parameter_ids: ids,
      test_parameter_summary: labels.join(', '),
    })
    .eq('id', testAllocationId)

  if (syncErr) throw syncErr
}

export async function insertAllocatedTestsIntoSection(
  testAllocationId: string,
  tests: AllocatedTestOption[],
): Promise<void> {
  const taId = testAllocationId.trim()
  if (!taId || tests.length === 0) return

  for (const test of tests) {
    const { data: existing } = await supabase
      .from('test_allocation_parameters')
      .select('id')
      .eq('test_allocation_id', taId)
      .eq('test_parameter_id', test.testParameterId)
      .maybeSingle()

    if (existing?.id) continue

    const { error } = await supabase.from('test_allocation_parameters').insert({
      test_allocation_id: taId,
      test_parameter_id: test.testParameterId,
      test_label: test.testLabel,
      specific_requirement: test.specificRequirement,
    })
    if (error) throw error
  }

  await syncTestAllocationParameterSummary(taId)
}

/** Remove selected master tests from a section allocation (by test_parameter_id). */
export async function removeAllocatedTestsFromSection(
  testAllocationId: string,
  tests: AllocatedTestOption[],
): Promise<void> {
  const taId = testAllocationId.trim()
  if (!taId || tests.length === 0) return

  const ids = tests.map((t) => t.testParameterId.trim()).filter(Boolean)
  if (ids.length === 0) return

  const { error } = await supabase
    .from('test_allocation_parameters')
    .delete()
    .eq('test_allocation_id', taId)
    .in('test_parameter_id', ids)

  if (error) throw error

  await syncTestAllocationParameterSummary(taId)
}

export async function fetchSectionParameterRows(
  testAllocationId: string,
): Promise<TestAllocationParameterRow[]> {
  const taId = testAllocationId.trim()
  if (!taId) return []

  const { data, error } = await supabase
    .from('test_allocation_parameters')
    .select(
      'id, test_allocation_id, test_parameter_id, test_label, test_start_date, test_end_date, results, specific_requirement',
    )
    .eq('test_allocation_id', taId)
    .order('test_label', { ascending: true })

  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  const tpIds = rows
    .map((r) => (r as { test_parameter_id?: string | null }).test_parameter_id)
    .filter((id): id is string => Boolean(id?.trim()))

  const metaById = new Map<string, { specificRequirement: string | null; clauseNo: string | null }>()
  if (tpIds.length > 0) {
    const { data: tpRows } = await supabase
      .from('test_parameters')
      .select('id, specific_requirement, clause_no')
      .in('id', tpIds)
    for (const row of Array.isArray(tpRows) ? tpRows : []) {
      const r = row as {
        id: string
        specific_requirement?: string | null
        clause_no?: string | null
      }
      metaById.set(r.id, {
        specificRequirement: (r.specific_requirement ?? '').trim() || null,
        clauseNo: (r.clause_no ?? '').trim() || null,
      })
    }
  }

  return rows.map((row) => {
    const r = row as {
      id: string
      test_allocation_id: string
      test_parameter_id: string | null
      test_label: string
      test_start_date: string | null
      test_end_date: string | null
      results: string | null
      specific_requirement: string | null
    }
    const tpId = r.test_parameter_id
    const master = tpId ? metaById.get(tpId) : undefined
    return {
      id: r.id,
      testAllocationId: r.test_allocation_id,
      testParameterId: tpId,
      testLabel: r.test_label,
      clauseNo: master?.clauseNo ?? null,
      sectionSpecOverride: r.specific_requirement ?? null,
      specificRequirement: resolveSectionSpecificRequirement(
        r.specific_requirement,
        master?.specificRequirement,
      ),
      testStartDate: r.test_start_date,
      testEndDate: r.test_end_date,
      results: r.results,
    }
  })
}
