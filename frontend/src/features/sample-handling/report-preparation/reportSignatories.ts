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
 * 7.8.2.1 o, 7.5.1): whoever entered the results and the Technical Manager who
 * reviewed and approved them. Print Setting decides the layout (which roles
 * sign, after which parts); the names it held were printed on every report
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

/** One line per person: the same person may come with and without a user id (older rows hold only the name). */
function uniquePeople(people: ReportPerson[]): ReportPerson[] {
  const seen = new Set<string>()
  return people.filter((p) => {
    const keys = [p.userId, p.name.trim().toLowerCase()].filter(Boolean)
    if (keys.length === 0 || keys.some((k) => seen.has(k))) return false
    keys.forEach((k) => seen.add(k))
    return true
  })
}

/**
 * Signatures for this report. Print Setting decides which roles sign and
 * after which parts (lab, 25 Oct 2026); only roles enabled there print. The
 * names come from the sample: "Tested By" = whoever entered the results;
 * "Reviewed / Checked By" and "Approved / Authorized By" = whoever reviewed and
 * approved the results (the Technical Manager). The person issuing the report
 * is not printed unless Print Setting has such a role. A role whose person is
 * not known yet (results not reviewed) prints the names Print Setting holds.
 */
export function applyReportPeopleToSignatures(
  settings: TestReportPrintSettings,
  people: SampleReportPeople,
): TestReportPrintSettings {
  type Slot = { label: string; parts: TestReportSignatureAfterPart[]; fallback: TestReportSignature[] }
  const order: Array<RoleGroup | TestReportSignature> = []
  const layout: Partial<Record<RoleGroup, Slot>> = {}
  for (const sig of settings.signatures) {
    if (!sig.enabled) continue
    const group = roleGroup(sig.roleLabel)
    if (!group) {
      order.push(sig) // a role the app does not fill: printed as set
      continue
    }
    const current = layout[group]
    if (!current) order.push(group)
    layout[group] = {
      label: current?.label ?? (sig.roleLabel.trim() || DEFAULT_ROLE_LABEL[group]),
      parts: [...new Set([...(current?.parts ?? []), ...sig.showAfterParts])],
      fallback: [...(current?.fallback ?? []), sig],
    }
  }
  const peopleFor: Record<RoleGroup, ReportPerson[]> = {
    tested: uniquePeople(people.testers),
    reviewed: uniquePeople(people.reviewers),
    authorized: uniquePeople(people.reviewers),
  }
  const signatures: TestReportSignature[] = []
  for (const item of order) {
    if (typeof item !== 'string') {
      signatures.push(item)
      continue
    }
    const slot = layout[item]!
    const persons = peopleFor[item]
    if (persons.length === 0) {
      signatures.push(...slot.fallback.map((f) => ({ ...f, roleLabel: slot.label, showAfterParts: slot.parts })))
      continue
    }
    for (const p of persons) {
      signatures.push({
        roleLabel: slot.label,
        userId: p.userId,
        name: p.name,
        designation: p.designation,
        department: p.department,
        enabled: true,
        required: true,
        showAfterParts: slot.parts,
      })
    }
  }
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
