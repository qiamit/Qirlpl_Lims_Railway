import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'
import { resolveSectionSpecificRequirement } from '../shared/resolveSectionSpecificRequirement'

/** All section rows on SRFs in results_review (no reviewer / department filter). */
export async function loadResultsUnderReviewRowsForDirector(): Promise<TestAllocationRow[]> {
  const { data: sampleRows, error: sampleErr } = await supabase
    .from('samples')
    .select(
      'id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation, sample_description, sample_declaration',
    )
    .eq('stage', 'results_review')
    .order('created_at', { ascending: false })
  if (sampleErr) throw sampleErr

  const samples = Array.isArray(sampleRows) ? sampleRows : []
  if (samples.length === 0) return []

  const sampleIds = samples.map((s) => String((s as { id: string }).id))

  const isCodeIds = [
    ...new Set(
      samples
        .map((s: { test_report_is_code_id?: string | null }) => s.test_report_is_code_id)
        .filter(Boolean),
    ),
  ] as string[]

  let isCodeMap = new Map<string, string>()
  if (isCodeIds.length > 0) {
    const { data: isCodeData } = await supabase
      .from('is_codes')
      .select('id, is_number, revision_year')
      .in('id', isCodeIds)
    const isCodes = Array.isArray(isCodeData) ? isCodeData : []
    isCodeMap = new Map(
      isCodes.map(
        (c: { id: string; is_number?: string; revision_year?: string | null }) => [
          c.id,
          c.revision_year ? `${c.is_number ?? ''} : ${c.revision_year}` : (c.is_number ?? c.id),
        ],
      ),
    )
  }

  const samplesMap = new Map(
    samples.map(
      (s: {
        id: string
        srf_number?: string
        date_of_sample_receiving?: string
        test_report_is_code_id?: string | null
        referback_from_allocation?: boolean | null
        sample_description?: string | null
        sample_declaration?: string | null
      }) => [
        s.id,
        {
          srf_number: s.srf_number ?? null,
          date_of_sample_receiving: s.date_of_sample_receiving ?? null,
          isCodeId: s.test_report_is_code_id ?? null,
          isCodeLabel: s.test_report_is_code_id
            ? (isCodeMap.get(s.test_report_is_code_id) ?? null)
            : null,
          referbackFromAllocation: !!s.referback_from_allocation,
          sampleDescription: s.sample_description ?? null,
          declaredValue: s.sample_declaration ?? null,
        },
      ],
    ),
  )

  const { data: allocData, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, sample_id, section_code, allocation_date, department, designation')
    .in('sample_id', sampleIds)
  if (allocErr) throw allocErr

  const allocations = Array.isArray(allocData) ? allocData : []
  if (allocations.length === 0) return []

  const allocMap = new Map(allocations.map((a: { id: string }) => [a.id, a]))
  const allocIds = allocations.map((a: { id: string }) => a.id)

  const { data: testAllocData, error: taErr } = await supabase
    .from('test_allocations')
    .select(
      'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_parameter_ids',
    )
    .in('sample_allocation_id', allocIds)
    .order('created_at', { ascending: false })
  if (taErr) throw taErr

  const testAllocs = Array.isArray(testAllocData) ? testAllocData : []
  if (testAllocs.length === 0) return []

  const allocationIds = testAllocs.map((t: { id: string }) => t.id)
  let paramsByAllocationId = new Map<
    string,
    {
      id: string
      test_allocation_id: string
      test_parameter_id: string | null
      test_label: string
      test_start_date: string | null
      test_end_date: string | null
      results: string | null
    }[]
  >()

  if (allocationIds.length > 0) {
    const { data: paramData, error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .select(
        'id, test_allocation_id, test_parameter_id, test_label, test_start_date, test_end_date, results, specific_requirement',
      )
      .in('test_allocation_id', allocationIds)
    if (paramErr) throw paramErr

    const map = new Map<
      string,
      {
        id: string
        test_allocation_id: string
        test_parameter_id: string | null
        test_label: string
        test_start_date: string | null
        test_end_date: string | null
        results: string | null
        specific_requirement: string | null
      }[]
    >()
    for (const p of Array.isArray(paramData) ? paramData : []) {
      const key = String((p as { test_allocation_id?: string }).test_allocation_id ?? '')
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({
        id: String((p as { id: string }).id),
        test_allocation_id: key,
        test_parameter_id: (p as { test_parameter_id?: string | null }).test_parameter_id ?? null,
        test_label: String((p as { test_label?: string }).test_label ?? ''),
        test_start_date: (p as { test_start_date?: string | null }).test_start_date ?? null,
        test_end_date: (p as { test_end_date?: string | null }).test_end_date ?? null,
        results: (p as { results?: string | null }).results ?? null,
        specific_requirement: (p as { specific_requirement?: string | null }).specific_requirement ?? null,
      })
    }
    paramsByAllocationId = map
  }

  const tpIdsForLookup = new Set<string>()
  for (const params of paramsByAllocationId.values()) {
    for (const p of params) {
      if (p.test_parameter_id) tpIdsForLookup.add(p.test_parameter_id)
    }
  }
  for (const t of testAllocs as { test_parameter_ids?: unknown }[]) {
    const raw = t.test_parameter_ids
    if (!Array.isArray(raw)) continue
    for (const id of raw) {
      if (typeof id === 'string' && id.trim()) tpIdsForLookup.add(id.trim())
    }
  }

  const testParamMetaById = new Map<string, { name: string; specificRequirement: string | null }>()
  if (tpIdsForLookup.size > 0) {
    const { data: tpMetaRows } = await supabase
      .from('test_parameters')
      .select('id, item_name, specific_requirement')
      .in('id', [...tpIdsForLookup])
    for (const row of Array.isArray(tpMetaRows) ? tpMetaRows : []) {
      const r = row as { id: string; item_name?: string | null; specific_requirement?: string | null }
      testParamMetaById.set(r.id, {
        name: (r.item_name ?? '').trim() || r.id,
        specificRequirement: (r.specific_requirement ?? '').trim() || null,
      })
    }
  }

  return testAllocs
    .map(
      (t: {
        id: string
        sample_allocation_id: string
        assigned_employee_id?: string | null
        assigned_employee_name?: string | null
        test_parameter_summary?: string | null
        test_parameter_ids?: string[] | null
      }) => {
        const a = allocMap.get(t.sample_allocation_id) as
          | {
              id: string
              sample_id: string
              section_code: string
              allocation_date: string | null
              department: string | null
              designation: string | null
            }
          | undefined
        if (!a) return null
        const sample = samplesMap.get(a.sample_id)
        if (!sample) return null

        const params = paramsByAllocationId.get(t.id) ?? []
        let parameterRows = params.map((p) => ({
          id: p.id,
          testAllocationId: p.test_allocation_id,
          testParameterId: p.test_parameter_id,
          testLabel: p.test_label,
          sectionSpecOverride: p.specific_requirement ?? null,
          specificRequirement: resolveSectionSpecificRequirement(
            p.specific_requirement,
            p.test_parameter_id
              ? testParamMetaById.get(p.test_parameter_id)?.specificRequirement
              : null,
          ),
          testStartDate: p.test_start_date,
          testEndDate: p.test_end_date,
          results: p.results,
        }))

        if (parameterRows.length === 0) {
          const summaryStr = (t.test_parameter_summary ?? '').trim()
          const ids = Array.isArray(t.test_parameter_ids)
            ? (t.test_parameter_ids as string[]).map((x) => String(x).trim()).filter(Boolean)
            : []
          let labels = summaryStr
            ? summaryStr.split(',').map((x) => x.trim()).filter(Boolean)
            : []
          if (labels.length === 0 && ids.length > 0) {
            labels = ids.map((id) => testParamMetaById.get(id)?.name ?? id)
          } else {
            for (let i = labels.length; i < ids.length; i += 1) {
              const id = ids[i]!
              labels.push(testParamMetaById.get(id)?.name ?? id)
            }
          }
          if (labels.length > 0) {
            parameterRows = labels.map((label, i) => {
              const tpId = ids[i] ?? null
              return {
                id: '',
                testAllocationId: t.id,
                testParameterId: tpId,
                testLabel: label,
                sectionSpecOverride: null,
                specificRequirement: tpId
                  ? (testParamMetaById.get(tpId)?.specificRequirement ?? null)
                  : null,
                testStartDate: null,
                testEndDate: null,
                results: null,
              }
            })
          }
        }

        return {
          testAllocationId: t.id,
          sampleAllocationId: a.id,
          sampleId: a.sample_id,
          sectionCode: a.section_code,
          isCodeId: sample.isCodeId ?? null,
          isCodeLabel: sample.isCodeLabel ?? null,
          sampleDescription: sample.sampleDescription ?? null,
          declaredValue: sample.declaredValue ?? null,
          srfNumber: sample.srf_number ?? null,
          allocationDate: a.allocation_date ?? sample.date_of_sample_receiving ?? null,
          department: a.department ?? null,
          designation: a.designation ?? null,
          testParameterSummary: t.test_parameter_summary ?? null,
          testParameterIds: [
            ...new Set([
              ...parameterRows
                .map((p) => p.testParameterId)
                .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
              ...(Array.isArray(t.test_parameter_ids)
                ? (t.test_parameter_ids as string[]).map((x) => String(x).trim()).filter(Boolean)
                : []),
            ]),
          ],
          assignedEmployeeId: t.assigned_employee_id ?? null,
          assignedEmployeeName: t.assigned_employee_name ?? null,
          referbackFromAllocation: sample.referbackFromAllocation ?? false,
          testStartDate: null,
          results: null,
          testEndDate: null,
          parameters: parameterRows,
        } satisfies TestAllocationRow
      },
    )
    .filter((r): r is TestAllocationRow => r != null)
}
