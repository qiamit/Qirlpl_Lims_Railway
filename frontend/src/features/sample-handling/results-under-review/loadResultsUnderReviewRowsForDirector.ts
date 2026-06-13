import { supabase } from '@/lib/supabaseClient'
import type { SampleStage, TestAllocationRow } from '../types'
import { resolveSectionSpecificRequirement } from '../shared/resolveSectionSpecificRequirement'
import {
  departmentsMatch,
  designationsMatch,
} from '@/features/sample-handling/shared/departmentMatch'
import { pickTestAllocationPerSection } from '../shared/pickTestAllocationPerSection'
import {
  isActiveReviewerName,
  isSectionVisibleInResultsUnderReview,
  isSectionVisibleInScopedResultsUnderReview,
  RESULTS_REVIEW_APPROVED_LABEL,
} from './resultsUnderReviewPartitions'

export type ResultsUnderReviewLoadScope = {
  department?: string | null
  designation?: string | null
  /** When set, also include sections explicitly assigned to this reviewer. */
  reviewerUserId?: string | null
}

type SampleMeta = {
  srf_number: string | null
  date_of_sample_receiving: string | null
  isCodeId: string | null
  isCodeLabel: string | null
  referbackFromAllocation: boolean
  sampleDescription: string | null
  declaredValue: string | null
  stage: SampleStage | null
}

type AllocationRow = {
  id: string
  sample_id: string
  section_code: string
  allocation_date: string | null
  department: string | null
  designation: string | null
}

type TestAllocRow = {
  id: string
  sample_allocation_id: string
  assigned_employee_id?: string | null
  assigned_employee_name?: string | null
  test_parameter_summary?: string | null
  test_parameter_ids?: string[] | null
  sent_for_testing?: boolean | null
  referred_back_from_review?: boolean | null
}

type ParamRow = {
  id: string
  test_allocation_id: string
  test_parameter_id: string | null
  test_label: string
  test_start_date: string | null
  test_end_date: string | null
  results: string | null
  specific_requirement: string | null
  results_reviewer_id: string | null
  results_reviewer_name: string | null
}

const REVIEW_SAMPLE_STAGES = ['results_review', 'report_preparation'] as const
const SCOPED_SAMPLE_STAGES = ['results_review', 'report_preparation', 'under_testing'] as const

function filterAllocationsByScope(
  allocations: AllocationRow[],
  scope?: ResultsUnderReviewLoadScope,
): AllocationRow[] {
  if (!scope?.department?.trim()) return allocations
  let filtered = allocations.filter((a) => departmentsMatch(a.department, scope.department))
  if (scope.designation?.trim()) {
    filtered = filtered.filter(
      (a) => !a.designation?.trim() || designationsMatch(a.designation, scope.designation),
    )
  }
  return filtered
}

function mergeAllocationsById(...lists: AllocationRow[][]): AllocationRow[] {
  const map = new Map<string, AllocationRow>()
  for (const list of lists) {
    for (const row of list) {
      if (row.id) map.set(row.id, row)
    }
  }
  return [...map.values()]
}

async function loadReviewerAssignedAllocations(
  reviewerUserId: string,
  allowedSampleIds: Set<string>,
): Promise<AllocationRow[]> {
  const uid = reviewerUserId.trim()
  if (!uid || allowedSampleIds.size === 0) return []

  const { data: paramRows, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select('test_allocation_id')
    .eq('results_reviewer_id', uid)
  if (paramErr) throw paramErr

  const taIds = [
    ...new Set(
      (Array.isArray(paramRows) ? paramRows : [])
        .map((r) => String((r as { test_allocation_id?: string }).test_allocation_id ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (taIds.length === 0) return []

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('sample_allocation_id')
    .in('id', taIds)
  if (taErr) throw taErr

  const allocIds = [
    ...new Set(
      (Array.isArray(taRows) ? taRows : [])
        .map((r) => String((r as { sample_allocation_id?: string }).sample_allocation_id ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (allocIds.length === 0) return []

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, sample_id, section_code, allocation_date, department, designation')
    .in('id', allocIds)
  if (allocErr) throw allocErr

  return (Array.isArray(allocRows) ? allocRows : []).filter((a) =>
    allowedSampleIds.has(String((a as { sample_id?: string }).sample_id ?? '').trim()),
  ) as AllocationRow[]
}

async function buildRowsForAllocations(input: {
  allocations: AllocationRow[]
  samplesMap: Map<string, SampleMeta>
}): Promise<TestAllocationRow[]> {
  const { allocations, samplesMap } = input
  if (allocations.length === 0 || samplesMap.size === 0) return []

  const allocMap = new Map(allocations.map((a) => [a.id, a]))
  const allocIds = allocations.map((a) => a.id)

  const { data: testAllocData, error: taErr } = await supabase
    .from('test_allocations')
    .select(
      'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_parameter_ids, sent_for_testing, referred_back_from_review',
    )
    .in('sample_allocation_id', allocIds)
    .order('created_at', { ascending: false })
  if (taErr) throw taErr

  const rawTestAllocs = (Array.isArray(testAllocData) ? testAllocData : []) as TestAllocRow[]
  if (rawTestAllocs.length === 0) return []

  const paramsByAllocationId = await loadParamsByAllocationId(rawTestAllocs.map((t) => t.id))
  const testAllocs = pickTestAllocationPerSection(rawTestAllocs, paramsByAllocationId)
  const testParamMetaById = await loadTestParamMetaById(testAllocs, paramsByAllocationId)

  return buildRowsFromTestAllocs({
    testAllocs,
    allocMap,
    samplesMap,
    paramsByAllocationId,
    testParamMetaById,
  })
}

async function loadIsCodeMap(isCodeIds: string[]): Promise<Map<string, string>> {
  if (isCodeIds.length === 0) return new Map()
  const { data: isCodeData } = await supabase
    .from('is_codes')
    .select('id, is_number, revision_year')
    .in('id', isCodeIds)
  const isCodes = Array.isArray(isCodeData) ? isCodeData : []
  return new Map(
    isCodes.map(
      (c: { id: string; is_number?: string; revision_year?: string | null }) => [
        c.id,
        c.revision_year ? `${c.is_number ?? ''} : ${c.revision_year}` : (c.is_number ?? c.id),
      ],
    ),
  )
}

async function loadSamplesMap(
  sampleIds: string[],
  stages: readonly string[],
): Promise<Map<string, SampleMeta>> {
  if (sampleIds.length === 0) return new Map()

  const { data: sampleRows, error: sampleErr } = await supabase
    .from('samples')
    .select(
      'id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation, sample_description, sample_declaration, stage',
    )
    .in('id', sampleIds)
    .in('stage', [...stages])
    .order('created_at', { ascending: false })
  if (sampleErr) throw sampleErr

  const samples = Array.isArray(sampleRows) ? sampleRows : []
  if (samples.length === 0) return new Map()

  const isCodeIds = [
    ...new Set(
      samples
        .map((s: { test_report_is_code_id?: string | null }) => s.test_report_is_code_id)
        .filter(Boolean),
    ),
  ] as string[]
  const isCodeMap = await loadIsCodeMap(isCodeIds)

  return new Map(
    samples.map(
      (s: {
        id: string
        srf_number?: string
        date_of_sample_receiving?: string
        test_report_is_code_id?: string | null
        referback_from_allocation?: boolean | null
        sample_description?: string | null
        sample_declaration?: string | null
        stage?: string | null
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
          stage: (s.stage as SampleStage | null) ?? null,
        },
      ],
    ),
  )
}

async function loadParamsByAllocationId(
  allocationIds: string[],
): Promise<Map<string, ParamRow[]>> {
  const map = new Map<string, ParamRow[]>()
  if (allocationIds.length === 0) return map

  const { data: paramData, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select(
      'id, test_allocation_id, test_parameter_id, test_label, test_start_date, test_end_date, results, specific_requirement, results_reviewer_id, results_reviewer_name',
    )
    .in('test_allocation_id', allocationIds)
  if (paramErr) throw paramErr

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
      results_reviewer_id: (p as { results_reviewer_id?: string | null }).results_reviewer_id ?? null,
      results_reviewer_name: (p as { results_reviewer_name?: string | null }).results_reviewer_name ?? null,
    })
  }
  return map
}

function buildRowsFromTestAllocs(input: {
  testAllocs: TestAllocRow[]
  allocMap: Map<string, AllocationRow>
  samplesMap: Map<string, SampleMeta>
  paramsByAllocationId: Map<string, ParamRow[]>
  testParamMetaById: Map<string, { name: string; specificRequirement: string | null }>
}): TestAllocationRow[] {
  const { testAllocs, allocMap, samplesMap, paramsByAllocationId, testParamMetaById } = input

  return testAllocs
    .map((t) => {
      const a = allocMap.get(t.sample_allocation_id)
      if (!a) return null
      const sample = samplesMap.get(a.sample_id)
      if (!sample) return null

      const params = paramsByAllocationId.get(t.id) ?? []
      const reviewerRow = params.find(
        (p) => p.results_reviewer_id || isActiveReviewerName(p.results_reviewer_name),
      )
      const approvedRow = params.find(
        (p) => p.results_reviewer_name?.trim() === RESULTS_REVIEW_APPROVED_LABEL,
      )
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
        resultsReviewerId: p.results_reviewer_id,
        resultsReviewerName: p.results_reviewer_name,
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
        sampleStage: sample.stage ?? null,
        resultsReviewerName:
          reviewerRow?.results_reviewer_name ??
          approvedRow?.results_reviewer_name ??
          null,
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
        referredBackFromReview: t.referred_back_from_review === true,
        sentForTesting: Boolean(t.sent_for_testing),
        testStartDate: null,
        results: null,
        testEndDate: null,
        parameters: parameterRows,
      } satisfies TestAllocationRow
    })
    .filter((r): r is TestAllocationRow => r != null)
}

async function loadTestParamMetaById(
  testAllocs: TestAllocRow[],
  paramsByAllocationId: Map<string, ParamRow[]>,
): Promise<Map<string, { name: string; specificRequirement: string | null }>> {
  const tpIdsForLookup = new Set<string>()
  for (const params of paramsByAllocationId.values()) {
    for (const p of params) {
      if (p.test_parameter_id) tpIdsForLookup.add(p.test_parameter_id)
    }
  }
  for (const t of testAllocs) {
    const raw = t.test_parameter_ids
    if (!Array.isArray(raw)) continue
    for (const id of raw) {
      if (typeof id === 'string' && id.trim()) tpIdsForLookup.add(id.trim())
    }
  }

  const testParamMetaById = new Map<string, { name: string; specificRequirement: string | null }>()
  if (tpIdsForLookup.size === 0) return testParamMetaById

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
  return testParamMetaById
}

async function loadResultsUnderReviewRowsForDepartmentScope(
  scope: ResultsUnderReviewLoadScope,
): Promise<TestAllocationRow[]> {
  const sampleIdsFromStages = await loadSampleIdsInStages(SCOPED_SAMPLE_STAGES)
  if (sampleIdsFromStages.length === 0) return []

  const allowedSampleIds = new Set(sampleIdsFromStages)
  const samplesMap = await loadSamplesMap(sampleIdsFromStages, SCOPED_SAMPLE_STAGES)
  if (samplesMap.size === 0) return []

  const { data: allocData, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, sample_id, section_code, allocation_date, department, designation')
    .in('sample_id', sampleIdsFromStages)
  if (allocErr) throw allocErr

  const deptScoped = filterAllocationsByScope(
    (Array.isArray(allocData) ? allocData : []) as AllocationRow[],
    scope,
  )

  const reviewerAllocs = scope.reviewerUserId?.trim()
    ? await loadReviewerAssignedAllocations(scope.reviewerUserId, allowedSampleIds)
    : []

  const scopedAllocations = mergeAllocationsById(deptScoped, reviewerAllocs).filter((a) =>
    samplesMap.has(a.sample_id),
  )
  if (scopedAllocations.length === 0) return []

  const rows = await buildRowsForAllocations({ allocations: scopedAllocations, samplesMap })
  return rows.filter(isSectionVisibleInScopedResultsUnderReview)
}

async function loadSampleIdsInStages(stages: readonly string[]): Promise<string[]> {
  const { data: sampleRows, error: sampleErr } = await supabase
    .from('samples')
    .select('id')
    .in('stage', [...stages])
  if (sampleErr) throw sampleErr
  return (Array.isArray(sampleRows) ? sampleRows : [])
    .map((s) => String((s as { id?: string }).id ?? '').trim())
    .filter(Boolean)
}

async function loadResultsUnderReviewRowsUnscoped(): Promise<TestAllocationRow[]> {
  const sampleIds = await loadSampleIdsInStages(REVIEW_SAMPLE_STAGES)
  if (sampleIds.length === 0) return []

  const samplesMap = await loadSamplesMap(sampleIds, REVIEW_SAMPLE_STAGES)
  if (samplesMap.size === 0) return []

  const { data: allocData, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, sample_id, section_code, allocation_date, department, designation')
    .in('sample_id', sampleIds)
  if (allocErr) throw allocErr

  const allocations = Array.isArray(allocData) ? (allocData as AllocationRow[]) : []
  if (allocations.length === 0) return []

  const rows = await buildRowsForAllocations({ allocations, samplesMap })
  return rows.filter(isSectionVisibleInResultsUnderReview)
}

/** Section rows on SRFs in results review workflow. Optional scope filters by allocation department/designation. */
export async function loadResultsUnderReviewRowsForDirector(
  scope?: ResultsUnderReviewLoadScope,
): Promise<TestAllocationRow[]> {
  if (scope?.department?.trim()) {
    return loadResultsUnderReviewRowsForDepartmentScope(scope)
  }
  return loadResultsUnderReviewRowsUnscoped()
}
