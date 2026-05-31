import { supabase } from '@/lib/supabaseClient'
import { evaluateResultConformity } from './evaluateResultConformity'
import { resolveReportScopeFromAccreditationIds, scopeKindFromLabel } from './reportScope'
import type { ReportScopeKind } from './reportScope'

export type ReportResultRow = {
  srNo: number
  sectionCode: string
  testName: string
  testMethodClause: string | null
  unit: string
  specifiedRequirement: string
  observedValue: string
  remark: string
  scope: string
}

export type ReportResultSectionGroup = {
  sectionCode: string
  rows: ReportResultRow[]
}

type TestParameterSnapshot = {
  item_name: string | null
  test_method: string | null
  clause_no: string | null
  unit_value: string | null
  specific_requirement: string | null
  under_accreditation_ids: string[] | null
}

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

function buildTestNameParts(
  tp: TestParameterSnapshot | undefined,
  fallbackLabel: string,
): { testName: string; testMethodClause: string | null } {
  const testName = (tp?.item_name ?? fallbackLabel).trim() || fallbackLabel
  const method = tp?.test_method?.trim()
  const clause = tp?.clause_no?.trim()
  const parts = [method, clause ? `Clause ${clause}` : null].filter(Boolean)
  return {
    testName,
    testMethodClause: parts.length > 0 ? parts.join(' · ') : null,
  }
}

export async function fetchReportResultRowsForSample(sampleId: string): Promise<ReportResultRow[]> {
  const { data: allocs, error: aErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', sampleId)
  if (aErr) throw aErr
  const allocList = Array.isArray(allocs) ? allocs : []
  if (allocList.length === 0) return []

  const allocIds = allocList.map((a: { id: string }) => a.id)
  const { data: tas, error: tErr } = await supabase
    .from('test_allocations')
    .select('id, section_code')
    .in('sample_allocation_id', allocIds)
    .eq('sent_for_testing', true)
  if (tErr) throw tErr
  const taList = Array.isArray(tas) ? tas : []
  const taIds = taList.map((t: { id: string }) => t.id)
  if (taIds.length === 0) return []

  const sectionCodeByTaId = new Map<string, string>()
  for (const t of taList) {
    const row = t as { id: string; section_code?: string | null }
    sectionCodeByTaId.set(row.id, String(row.section_code ?? '').trim() || '—')
  }

  const { data: pr, error: pErr } = await supabase
    .from('test_allocation_parameters')
    .select('test_allocation_id, test_parameter_id, test_label, results')
    .in('test_allocation_id', taIds)
  if (pErr) throw pErr

  const paramRows = (Array.isArray(pr) ? pr : []).filter(
    (p) => String((p as { results?: string | null }).results ?? '').trim() !== '',
  ) as Array<{
    test_allocation_id: string
    test_parameter_id: string | null
    test_label: string
    results: string | null
  }>
  if (paramRows.length === 0) return []

  const tpIds = [
    ...new Set(
      paramRows
        .map((p) => p.test_parameter_id)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ]

  const [{ data: tpData }, { data: abData }] = await Promise.all([
    tpIds.length > 0
      ? supabase
          .from('test_parameters')
          .select(
            'id, item_name, test_method, clause_no, unit_value, specific_requirement, under_accreditation_ids',
          )
          .in('id', tpIds)
      : Promise.resolve({ data: [] as TestParameterSnapshot[], error: null }),
    supabase.from('accreditation_bodies').select('id, name'),
  ])

  const tpMap = new Map<string, TestParameterSnapshot & { id: string }>()
  for (const row of Array.isArray(tpData) ? tpData : []) {
    const r = row as TestParameterSnapshot & { id: string }
    tpMap.set(r.id, r)
  }

  const accreditationById = new Map<string, string>()
  for (const row of Array.isArray(abData) ? abData : []) {
    const r = row as { id: string; name?: string | null }
    accreditationById.set(r.id, String(r.name ?? '').trim())
  }

  return paramRows.map((p, index) => {
    const tp = p.test_parameter_id ? tpMap.get(p.test_parameter_id) : undefined
    const { testName, testMethodClause } = buildTestNameParts(tp, p.test_label ?? '—')
    return {
      srNo: index + 1,
      sectionCode: sectionCodeByTaId.get(p.test_allocation_id) ?? '—',
      testName,
      testMethodClause,
      unit: fmt(tp?.unit_value),
      specifiedRequirement: fmt(tp?.specific_requirement),
      observedValue: fmt(p.results),
      remark: evaluateResultConformity(String(p.results ?? ''), String(tp?.specific_requirement ?? '')),
      scope: resolveReportScopeFromAccreditationIds(tp?.under_accreditation_ids, accreditationById),
    }
  })
}

export function filterReportRowsByScope(rows: ReportResultRow[], scope: ReportScopeKind): ReportResultRow[] {
  return rows
    .filter((r) => scopeKindFromLabel(r.scope) === scope)
    .map((r, index) => ({ ...r, srNo: index + 1 }))
}

export function getApplicableReportScopes(rows: ReportResultRow[]): ReportScopeKind[] {
  const scopes = new Set<ReportScopeKind>()
  for (const row of rows) {
    scopes.add(scopeKindFromLabel(row.scope))
  }
  return (['nabl', 'non_nabl'] as const).filter((s) => scopes.has(s))
}

/** Group scoped rows by section code; Sr No restarts at 1 per section. */
export function groupReportRowsBySectionCode(rows: ReportResultRow[]): ReportResultSectionGroup[] {
  const order: string[] = []
  const byCode = new Map<string, ReportResultRow[]>()

  for (const row of rows) {
    const code = row.sectionCode.trim() || '—'
    if (!byCode.has(code)) {
      byCode.set(code, [])
      order.push(code)
    }
    byCode.get(code)!.push(row)
  }

  return order.map((sectionCode) => ({
    sectionCode,
    rows: byCode.get(sectionCode)!.map((r, index) => ({ ...r, srNo: index + 1 })),
  }))
}
