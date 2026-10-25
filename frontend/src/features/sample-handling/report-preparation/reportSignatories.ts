import { supabase } from '@/lib/supabaseClient'
import {
  fetchTestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsConfig'
import type {
  TestReportPrintSettings,
  TestReportSignature,
  TestReportSignatureAfterPart,
} from '@/features/settings/lab-settings/printSettingsTypes'

/**
 * Test report signatories are the people who did the work (ISO/IEC 17025
 * 7.8.2.1 o, 7.5.1): whoever entered the results, the results reviewer and
 * the issuer. Print Setting keeps only the layout (role labels and the parts
 * each role signs after); the names it held were printed on every report
 * whoever tested it (OQ-01 staging run, 23 Oct 2026).
 */

export type ReportPerson = {
  userId: string
  name: string
  designation: string
  department: string
}

export type SampleReportPeople = {
  testers: ReportPerson[]
  reviewers: ReportPerson[]
  issuer: ReportPerson | null
}

type RoleGroup = 'tested' | 'reviewed' | 'authorized'

const DEFAULT_ROLE_LABEL: Record<RoleGroup, string> = {
  tested: 'Tested By',
  reviewed: 'Reviewed By',
  authorized: 'Authorized By',
}

function roleGroup(label: string): RoleGroup | null {
  if (/test/i.test(label)) return 'tested'
  if (/review|check/i.test(label)) return 'reviewed'
  if (/approv|authori/i.test(label)) return 'authorized'
  return null
}

function uniquePeople(people: ReportPerson[]): ReportPerson[] {
  const seen = new Set<string>()
  return people.filter((p) => {
    const key = p.userId || p.name.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Signatures for this report: one line per tester, per reviewer and the
 * issuer, each placed after the parts the Print Setting role signs after.
 * A role missing from Print Setting signs after the parts of the "Tested By"
 * role (reviewer) or after Part D (issuer).
 */
export function applyReportPeopleToSignatures(
  settings: TestReportPrintSettings,
  people: SampleReportPeople,
): TestReportPrintSettings {
  const layout: Partial<Record<RoleGroup, { label: string; parts: TestReportSignatureAfterPart[] }>> = {}
  for (const sig of settings.signatures) {
    const group = roleGroup(sig.roleLabel)
    if (!group || !sig.enabled) continue
    const current = layout[group]
    layout[group] = {
      label: current?.label ?? (sig.roleLabel.trim() || DEFAULT_ROLE_LABEL[group]),
      parts: [...new Set([...(current?.parts ?? []), ...sig.showAfterParts])],
    }
  }
  const testedParts = layout.tested?.parts ?? (['part_d'] as TestReportSignatureAfterPart[])
  const line = (group: RoleGroup, p: ReportPerson, fallbackParts: TestReportSignatureAfterPart[]): TestReportSignature => ({
    roleLabel: layout[group]?.label ?? DEFAULT_ROLE_LABEL[group],
    userId: p.userId,
    name: p.name,
    designation: p.designation,
    department: p.department,
    enabled: true,
    required: true,
    showAfterParts: layout[group]?.parts?.length ? layout[group]!.parts : fallbackParts,
  })
  const signatures = [
    ...uniquePeople(people.testers).map((p) => line('tested', p, ['part_d'])),
    ...uniquePeople(people.reviewers).map((p) => line('reviewed', p, testedParts)),
    ...(people.issuer?.name ? [line('authorized', people.issuer, ['part_d'])] : []),
  ]
  return { ...settings, signatures }
}

/**
 * Who tested, reviewed and issued this sample. Tester: who entered each
 * result (entered_by), else the engineer the test was assigned to. Issuer:
 * the sample's issued_by, or `issuerIfNotIssued` (the person about to issue).
 */
export async function fetchSampleReportPeople(
  sampleId: string,
  issuerIfNotIssued?: ReportPerson | null,
): Promise<SampleReportPeople> {
  const [{ data: sample }, { data: allocations }] = await Promise.all([
    supabase.from('samples').select('issued_by, issued_by_name').eq('id', sampleId).maybeSingle(),
    supabase
      .from('test_allocations')
      .select('id, assigned_employee_id, assigned_employee_name')
      .eq('sample_id', sampleId),
  ])
  const allocRows = (allocations ?? []) as Array<{
    id: string
    assigned_employee_id: string | null
    assigned_employee_name: string | null
  }>
  const { data: params } = allocRows.length
    ? await supabase
        .from('test_allocation_parameters')
        .select('test_allocation_id, entered_by, entered_by_name, results_reviewer_id, results_reviewer_name')
        .in('test_allocation_id', allocRows.map((a) => a.id))
    : { data: [] }
  const paramRows = (params ?? []) as Array<{
    test_allocation_id: string
    entered_by: string | null
    entered_by_name: string | null
    results_reviewer_id: string | null
    results_reviewer_name: string | null
  }>

  const testers: Array<{ id: string; name: string }> = []
  for (const a of allocRows) {
    const entered = paramRows.filter((p) => p.test_allocation_id === a.id && (p.entered_by || p.entered_by_name))
    if (entered.length > 0) {
      for (const p of entered) testers.push({ id: p.entered_by ?? '', name: p.entered_by_name ?? '' })
    } else if (a.assigned_employee_id || a.assigned_employee_name) {
      testers.push({ id: a.assigned_employee_id ?? '', name: a.assigned_employee_name ?? '' })
    }
  }
  const reviewers = paramRows
    .filter((p) => p.results_reviewer_id || p.results_reviewer_name)
    .map((p) => ({ id: p.results_reviewer_id ?? '', name: p.results_reviewer_name ?? '' }))
  const s = sample as { issued_by: string | null; issued_by_name: string | null } | null
  let issuerRef = s?.issued_by || s?.issued_by_name ? { id: s.issued_by ?? '', name: s.issued_by_name ?? '' } : null
  if (!issuerRef && issuerIfNotIssued === undefined) {
    // Not issued yet: the person preparing it now is shown as the issuer.
    const { data } = await supabase.auth.getUser()
    if (data.user) issuerRef = { id: data.user.id, name: data.user.email ?? '' }
  }

  const ids = [...new Set([...testers, ...reviewers, ...(issuerRef ? [issuerRef] : [])].map((p) => p.id).filter(Boolean))]
  const { data: profiles } = ids.length
    ? await supabase.from('user_profiles').select('id, full_name, designation, department_name').in('id', ids)
    : { data: [] }
  const byId = new Map(
    ((profiles ?? []) as Array<{ id: string; full_name: string | null; designation: string | null; department_name: string | null }>).map(
      (p) => [p.id, p],
    ),
  )
  const person = (ref: { id: string; name: string }): ReportPerson => {
    const p = ref.id ? byId.get(ref.id) : undefined
    return {
      userId: ref.id,
      name: (p?.full_name ?? '').trim() || ref.name.trim(),
      designation: (p?.designation ?? '').trim(),
      department: (p?.department_name ?? '').trim(),
    }
  }
  return {
    testers: uniquePeople(testers.map(person)),
    reviewers: uniquePeople(reviewers.map(person)),
    issuer: issuerRef ? person(issuerRef) : (issuerIfNotIssued ?? null),
  }
}

/** Print Setting layout with this sample's real signatories. */
export async function fetchTestReportPrintSettingsForSample(
  sampleId: string,
  issuerIfNotIssued?: ReportPerson | null,
): Promise<TestReportPrintSettings> {
  const [settings, people] = await Promise.all([
    fetchTestReportPrintSettings(),
    fetchSampleReportPeople(sampleId, issuerIfNotIssued),
  ])
  return applyReportPeopleToSignatures(settings, people)
}
