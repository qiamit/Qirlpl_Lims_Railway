import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import {
  formatTestResultDisplay,
  getReportedTestResult,
} from '@/features/sample-handling/sample-under-testing/testResultValues'
import { fetchReportResultRowsForSample } from '@/features/sample-handling/report-preparation/reportResultRows'
import { resolveReportScopeFromAccreditationIds } from '@/features/sample-handling/report-preparation/reportScope'

export type RetestSampleTestParameterOption = {
  id: string
  testParameterId: string | null
  label: string
  specificRequirement: string | null
  testMethod: string
  unit: string
  uncertainty: string
  oldResult: string
  scope: string
}

type TestParameterSnapshot = {
  item_name: string | null
  test_method: string | null
  clause_no: string | null
  unit_value: string | null
  uncertainty_mu: string | null
  under_accreditation_ids: string[] | null
}

type TestParameterContext = {
  tpMap: Map<string, TestParameterSnapshot>
  accreditationById: Map<string, string>
}

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '')

function normalizeResultsRaw(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return null
    }
  }
  return String(raw)
}

function resolveOldTestResult(raw: unknown): string {
  const normalized = normalizeResultsRaw(raw)
  if (!normalized?.trim()) return ''

  const reported = getReportedTestResult(normalized)
  if (reported.trim()) return reported.trim()

  const display = formatTestResultDisplay(normalized)
  if (display.trim()) return display.trim()

  return normalized.trim()
}

async function loadObservedResultsFallback(
  sampleId: string,
  testAllocationId?: string,
): Promise<Map<string, string>> {
  try {
    const rows = await fetchReportResultRowsForSample(sampleId)
    const taFilter = testAllocationId?.trim()
    const map = new Map<string, string>()

    for (const row of rows) {
      if (taFilter && row.testAllocationId !== taFilter) continue
      const observed = row.observedValue?.trim()
      if (!row.parameterId || !observed || observed === '—') continue
      map.set(row.parameterId, observed)
    }

    return map
  } catch {
    return new Map()
  }
}

function buildTestMethod(tp: TestParameterSnapshot | undefined): string {
  const method = tp?.test_method?.trim()
  const clause = tp?.clause_no?.trim()
  const parts = [method, clause ? `Clause ${clause}` : null].filter(Boolean)
  return parts.join(' · ')
}

function buildTestName(tp: TestParameterSnapshot | undefined, fallbackLabel: string): string {
  return (tp?.item_name ?? fallbackLabel).trim() || fallbackLabel
}

function mapParameterRow(
  row: {
    id: string
    test_parameter_id?: string | null
    test_label?: string | null
    specific_requirement?: string | null
    results?: unknown
  },
  context: TestParameterContext,
  observedFallbackByParameterId: Map<string, string>,
): RetestSampleTestParameterOption | null {
  const label = String(row.test_label ?? '').trim()
  if (!label) return null

  const tp = row.test_parameter_id ? context.tpMap.get(row.test_parameter_id) : undefined
  const testName = buildTestName(tp, label)
  const testMethod = buildTestMethod(tp)
  const oldResult =
    resolveOldTestResult(row.results) || observedFallbackByParameterId.get(row.id) || ''

  return {
    id: row.id,
    testParameterId: row.test_parameter_id ?? null,
    label: testName,
    specificRequirement: row.specific_requirement?.trim() || null,
    testMethod,
    unit: fmt(tp?.unit_value),
    uncertainty: fmt(tp?.uncertainty_mu),
    oldResult,
    scope: resolveReportScopeFromAccreditationIds(
      tp?.under_accreditation_ids,
      context.accreditationById,
    ),
  }
}

async function loadTestParameterContext(testParameterIds: string[]): Promise<TestParameterContext> {
  const tpMap = new Map<string, TestParameterSnapshot>()
  const accreditationById = new Map<string, string>()

  if (testParameterIds.length === 0) {
    return { tpMap, accreditationById }
  }

  const [{ data: tpData, error: tpErr }, { data: abData, error: abErr }] = await Promise.all([
    supabase
      .from('test_parameters')
      .select(
        'id, item_name, test_method, clause_no, unit_value, uncertainty_mu, under_accreditation_ids',
      )
      .in('id', testParameterIds),
    supabase.from('accreditation_bodies').select('id, name'),
  ])

  if (tpErr) throw new Error(formatSupabaseError(tpErr))
  if (abErr) throw new Error(formatSupabaseError(abErr))

  for (const raw of tpData ?? []) {
    const row = raw as TestParameterSnapshot & { id: string }
    tpMap.set(row.id, row)
  }

  for (const raw of abData ?? []) {
    const row = raw as { id: string; name?: string | null }
    accreditationById.set(row.id, String(row.name ?? '').trim())
  }

  return { tpMap, accreditationById }
}

async function mapParameterRows(
  paramRows: Array<{
    id: string
    test_parameter_id?: string | null
    test_label?: string | null
    specific_requirement?: string | null
    results?: unknown
  }>,
  observedFallbackByParameterId: Map<string, string>,
): Promise<RetestSampleTestParameterOption[]> {
  const tpIds = [
    ...new Set(
      paramRows
        .map((p) => p.test_parameter_id)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ]

  const context = await loadTestParameterContext(tpIds)

  return paramRows
    .map((row) => mapParameterRow(row, context, observedFallbackByParameterId))
    .filter((row): row is RetestSampleTestParameterOption => row != null)
}

export async function fetchSampleTestParametersForRetest(
  sampleId: string,
  testAllocationId?: string,
): Promise<RetestSampleTestParameterOption[]> {
  const sid = sampleId.trim()
  if (!sid) return []

  const taId = testAllocationId?.trim()
  let allocationIds: string[] = []

  if (taId) {
    allocationIds = [taId]
  } else {
    const { data: allocations, error: allocErr } = await supabase
      .from('test_allocations')
      .select('id')
      .eq('sample_id', sid)

    if (allocErr) throw new Error(formatSupabaseError(allocErr))

    allocationIds = (allocations ?? [])
      .map((a) => (a as { id: string }).id)
      .filter(Boolean)
  }

  if (allocationIds.length === 0) return []

  const { data: params, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select('id, test_parameter_id, test_label, specific_requirement, results')
    .in('test_allocation_id', allocationIds)
    .order('test_label', { ascending: true })

  if (paramErr) throw new Error(formatSupabaseError(paramErr))

  const paramRows = (params ?? []) as Array<{
    id: string
    test_parameter_id?: string | null
    test_label?: string | null
    specific_requirement?: string | null
    results?: unknown
  }>

  const observedFallbackByParameterId = await loadObservedResultsFallback(sid, taId)
  const mapped = await mapParameterRows(paramRows, observedFallbackByParameterId)

  const optionsByKey = new Map<string, RetestSampleTestParameterOption>()

  for (const row of mapped) {
    const key = row.testParameterId?.trim() || row.id
    const existing = optionsByKey.get(key)
    if (!existing || (!existing.oldResult.trim() && row.oldResult.trim())) {
      optionsByKey.set(key, row)
    }
  }

  return [...optionsByKey.values()]
}

export async function fetchRetestParametersByAllocationIds(
  allocationParameterIds: string[],
  sampleId?: string,
  testAllocationId?: string,
): Promise<RetestSampleTestParameterOption[]> {
  const ids = [...new Set(allocationParameterIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return []

  const { data: params, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select('id, test_parameter_id, test_label, specific_requirement, results')
    .in('id', ids)

  if (paramErr) throw new Error(formatSupabaseError(paramErr))

  const paramRows = (params ?? []) as Array<{
    id: string
    test_parameter_id?: string | null
    test_label?: string | null
    specific_requirement?: string | null
    results?: unknown
  }>

  const observedFallbackByParameterId = sampleId?.trim()
    ? await loadObservedResultsFallback(sampleId.trim(), testAllocationId)
    : new Map<string, string>()

  return mapParameterRows(paramRows, observedFallbackByParameterId)
}
