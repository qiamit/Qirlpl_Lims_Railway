import { supabase } from '@/lib/supabaseClient'
import { withReceivingReportTypeSuffix } from '@/features/sample-handling/report-preparation/formattedTestReportNumber'
import {
  receivingReportTypeForIssueKind,
  type IssueAndReferbackSectionInput,
  type IssuedReportIssueKind,
  type IssuedReportReferbackTarget,
} from './types'
import {
  issueKindSrfSuffix,
  nextSrfNumberWithReportSuffix,
  stripReceivingReportSuffix,
} from '@/features/sample-handling/receiving/receivingSrfFromReference'

const SAMPLE_OMIT = new Set([
  'id',
  'created_at',
  'updated_at',
  'test_report_issued_at',
  'test_report_nabl_issued_at',
  'test_report_non_nabl_issued_at',
])

const ROW_OMIT = new Set(['id', 'created_at', 'updated_at'])

const STAGE_ORDER: IssuedReportReferbackTarget[] = [
  'allocation',
  'test_allocation',
  'under_testing',
  'results_review',
  'report_preparation',
]

export function earliestReferbackStage(
  targets: IssuedReportReferbackTarget[],
): IssuedReportReferbackTarget {
  return STAGE_ORDER.find((stage) => targets.includes(stage)) ?? 'report_preparation'
}

function asRow(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}
}

function omitKeys(row: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!keys.has(key)) next[key] = value
  }
  return next
}

async function existingSrfNumbersLike(base: string): Promise<string[]> {
  const { data, error } = await supabase.from('samples').select('srf_number').ilike('srf_number', `${base}%`)
  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .map((r) => String((r as { srf_number?: string }).srf_number ?? '').trim())
    .filter(Boolean)
}

async function applySelectedSection(
  section: IssueAndReferbackSectionInput,
  newAllocId: string,
  newTaId: string | null,
  newSrf: string,
  remark: string,
): Promise<void> {
  const allocPatch: Record<string, unknown> = {
    department: section.department || null,
    designation: section.designation || null,
    referback_remark: remark || null,
  }
  const { error: allocErr } = await supabase.from('sample_allocations').update(allocPatch).eq('id', newAllocId)
  if (allocErr) throw allocErr

  if (!newTaId) return

  const taPatch: Record<string, unknown> = {
    srf_number: newSrf,
    department: section.department || null,
    designation: section.designation || null,
  }
  if (section.targetStage === 'test_allocation' || section.targetStage === 'under_testing') {
    taPatch.assigned_employee_id = section.employee.id
    taPatch.assigned_employee_name = section.employee.name || null
  }
  if (section.targetStage === 'allocation' || section.targetStage === 'test_allocation') {
    taPatch.sent_for_testing = false
    taPatch.referred_back_from_review = false
  } else {
    taPatch.sent_for_testing = true
  }
  const { error: taErr } = await supabase.from('test_allocations').update(taPatch).eq('id', newTaId)
  if (taErr) throw taErr

  if (section.targetStage === 'results_review') {
    const { error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .update({
        results_reviewer_id: section.employee.id,
        results_reviewer_name: section.employee.name || null,
        results_review_status: 'under_review',
      })
      .eq('test_allocation_id', newTaId)
    if (paramErr) throw paramErr
  }
}

export type ClonedIssuedSample = {
  newSampleId: string
  newSrfNumber: string
  stage: IssuedReportReferbackTarget
  allocIdByOld: Record<string, string>
  testAllocIdByOld: Record<string, string>
}

/** Copy the issued SRF into a new Amendment / Revised / Supplementary SRF; original stays issued. */
export async function cloneIssuedSampleForAmendment(input: {
  sourceSampleId: string
  sourceSrfNumber: string | null
  issueKind: IssuedReportIssueKind
  sections: IssueAndReferbackSectionInput[]
  remark: string
}): Promise<ClonedIssuedSample> {
  const sourceId = input.sourceSampleId.trim()
  const { data: source, error: sourceErr } = await supabase.from('samples').select('*').eq('id', sourceId).maybeSingle()
  if (sourceErr) throw sourceErr
  if (!source) throw new Error('Original SRF was not found.')

  const sourceSrf =
    input.sourceSrfNumber?.trim() || String((source as { srf_number?: string }).srf_number ?? '').trim()
  if (!sourceSrf) throw new Error('Original SRF number is missing.')

  const reportType = receivingReportTypeForIssueKind(input.issueKind)
  const suffix = issueKindSrfSuffix(input.issueKind)
  const base = stripReceivingReportSuffix(sourceSrf)
  const newSrf = nextSrfNumberWithReportSuffix(sourceSrf, suffix, await existingSrfNumbersLike(base))
  const stage = earliestReferbackStage(input.sections.map((s) => s.targetStage))

  const sourceRow = omitKeys(asRow(source), SAMPLE_OMIT)
  const sampleInsert = {
    ...sourceRow,
    srf_number: newSrf,
    referenced_srf_number: base || sourceSrf,
    receiving_report_type: reportType,
    stage,
    sample_receiving_edit_unlocked: false,
    test_report_number: sourceRow.test_report_number
      ? withReceivingReportTypeSuffix(String(sourceRow.test_report_number), reportType)
      : sourceRow.test_report_number,
    test_report_issued_at: null,
    test_report_nabl_issued_at: null,
    test_report_non_nabl_issued_at: null,
  }

  const { data: created, error: createErr } = await supabase
    .from('samples')
    .insert(sampleInsert)
    .select('id, srf_number')
    .single()
  if (createErr) throw createErr
  const newSampleId = String((created as { id: string }).id)
  const newSrfNumber = String((created as { srf_number?: string }).srf_number ?? newSrf)

  try {
    const { data: allocRows, error: allocErr } = await supabase
      .from('sample_allocations')
      .select('*')
      .eq('sample_id', sourceId)
    if (allocErr) throw allocErr

    const allocIdByOld: Record<string, string> = {}
    const allocations = Array.isArray(allocRows) ? allocRows : []
    for (const row of allocations) {
      const oldId = String((row as { id: string }).id)
      const payload = {
        ...omitKeys(asRow(row), ROW_OMIT),
        sample_id: newSampleId,
      }
      const { data: inserted, error: insErr } = await supabase
        .from('sample_allocations')
        .insert(payload)
        .select('id')
        .single()
      if (insErr) throw insErr
      allocIdByOld[oldId] = String((inserted as { id: string }).id)
    }

    const { data: taRows, error: taErr } = await supabase
      .from('test_allocations')
      .select('*')
      .eq('sample_id', sourceId)
    if (taErr) throw taErr

    const testAllocIdByOld: Record<string, string> = {}
    const testAllocs = Array.isArray(taRows) ? taRows : []
    for (const row of testAllocs) {
      const oldId = String((row as { id: string }).id)
      const oldAllocId = String((row as { sample_allocation_id?: string }).sample_allocation_id ?? '')
      const newAllocId = allocIdByOld[oldAllocId]
      if (!newAllocId) continue
      const payload = {
        ...omitKeys(asRow(row), ROW_OMIT),
        sample_id: newSampleId,
        sample_allocation_id: newAllocId,
        srf_number: newSrfNumber,
      }
      const { data: inserted, error: insErr } = await supabase
        .from('test_allocations')
        .insert(payload)
        .select('id')
        .single()
      if (insErr) throw insErr
      testAllocIdByOld[oldId] = String((inserted as { id: string }).id)
    }

    const oldTaIds = Object.keys(testAllocIdByOld)
    if (oldTaIds.length > 0) {
      const { data: paramRows, error: paramErr } = await supabase
        .from('test_allocation_parameters')
        .select('*')
        .in('test_allocation_id', oldTaIds)
      if (paramErr) throw paramErr
      const params = Array.isArray(paramRows) ? paramRows : []
      const paramInserts = params.flatMap((row) => {
        const oldTaId = String((row as { test_allocation_id?: string }).test_allocation_id ?? '')
        const newTaId = testAllocIdByOld[oldTaId]
        if (!newTaId) return []
        return [{ ...omitKeys(asRow(row), ROW_OMIT), test_allocation_id: newTaId }]
      })
      if (paramInserts.length > 0) {
        const { error: insErr } = await supabase.from('test_allocation_parameters').insert(paramInserts)
        if (insErr) throw insErr
      }
    }

    for (const section of input.sections) {
      const newAllocId = allocIdByOld[section.sampleAllocationId]
      if (!newAllocId) continue
      const newTaId = section.testAllocationId ? testAllocIdByOld[section.testAllocationId] ?? null : null
      await applySelectedSection(section, newAllocId, newTaId, newSrfNumber, input.remark)
    }

    return { newSampleId, newSrfNumber, stage, allocIdByOld, testAllocIdByOld }
  } catch (err) {
    await supabase.from('samples').delete().eq('id', newSampleId)
    throw err
  }
}
