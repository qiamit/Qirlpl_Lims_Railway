import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'
import type { SectionParameterEntry } from './sectionParameterRows'

export type AllocatedTestOption = {
  testParameterId: string
  testLabel: string
  specificRequirement: string | null
  clauseNo: string | null
  unitValue: string | null
  isCodeLabel: string | null
  uncertaintyMu: string | null
  underAccreditation: string | null
  /** Already present on this section (draft / saved). Pre-checked; engineer may unselect to remove. */
  alreadyInSection?: boolean
}

export type SectionTestSelectionChange = {
  toAdd: AllocatedTestOption[]
  toRemove: AllocatedTestOption[]
  /** Already-in-section tests whose section-only specified requirement was edited. */
  toUpdate: AllocatedTestOption[]
}

function draftKeys(draft: SectionParameterEntry[]): Set<string> {
  const keys = new Set<string>()
  for (const entry of draft) {
    const id = entry.testParameterId?.trim()
    const label = entry.testLabel?.trim()
    if (id) keys.add(`id:${id}`)
    if (label) keys.add(`label:${label.toLowerCase()}`)
  }
  return keys
}

function isInDraft(
  keys: Set<string>,
  testParameterId: string | null | undefined,
  testLabel: string,
): boolean {
  const id = testParameterId?.trim()
  const label = testLabel.trim()
  if (id && keys.has(`id:${id}`)) return true
  if (label && keys.has(`label:${label.toLowerCase()}`)) return true
  return false
}

function underAccreditationLabel(
  ids: string[] | null | undefined,
  bodies: Map<string, string>,
): string {
  if (!Array.isArray(ids) || ids.length === 0) return 'Not Accredited'
  const names = ids.map((id) => bodies.get(id)).filter(Boolean) as string[]
  return names.length > 0 ? names.join(', ') : 'Not Accredited'
}

function findDraftEntry(
  draft: SectionParameterEntry[],
  testParameterId: string,
  testLabel: string,
): SectionParameterEntry | undefined {
  const id = testParameterId.trim()
  const label = testLabel.trim().toLowerCase()
  return draft.find((entry) => {
    const entryId = entry.testParameterId?.trim()
    if (id && entryId && entryId === id) return true
    const entryLabel = entry.testLabel?.trim().toLowerCase()
    return Boolean(label && entryLabel && entryLabel === label)
  })
}

/**
 * All Test Parameter master rows for section IS code + department.
 * Marks tests already in the section draft so the Add dialog can show selected + unselected together.
 */
export async function fetchIsCodeTestsForSection(
  row: TestAllocationRow,
  draft: SectionParameterEntry[],
): Promise<AllocatedTestOption[]> {
  const isCodeId = row.isCodeId?.trim()
  if (!isCodeId) return []

  const [{ data, error }, { data: abData }] = await Promise.all([
    supabase
      .from('test_parameters')
      .select(
        'id, item_name, specific_requirement, clause_no, unit_value, uncertainty_mu, department, is_code_id, is_code_label, under_accreditation_ids',
      )
      .eq('is_code_id', isCodeId)
      .order('item_name', { ascending: true }),
    supabase.from('accreditation_bodies').select('id, name').order('name', { ascending: true }),
  ])

  if (error) throw error

  const bodies = new Map<string, string>()
  for (const b of Array.isArray(abData) ? abData : []) {
    const entry = b as { id: string; name: string }
    bodies.set(entry.id, entry.name)
  }

  const sectionDept = (row.department ?? '').trim()
  const keys = draftKeys(draft)
  const options: AllocatedTestOption[] = []

  for (const raw of Array.isArray(data) ? data : []) {
    const r = raw as {
      id: string
      item_name?: string | null
      specific_requirement?: string | null
      clause_no?: string | null
      unit_value?: string | null
      is_code_label?: string | null
      uncertainty_mu?: string | null
      department?: string | null
      under_accreditation_ids?: string[] | null
    }

    const paramDept = (r.department ?? '').trim()
    if (sectionDept && paramDept !== sectionDept) continue

    const testName = (r.item_name ?? '').trim() || r.id
    const alreadyInSection = isInDraft(keys, r.id, testName)
    const masterSpec = (r.specific_requirement ?? '').trim() || null
    const draftEntry = alreadyInSection ? findDraftEntry(draft, r.id, testName) : undefined
    const sectionSpec =
      draftEntry?.specificRequirement?.trim() ||
      draftEntry?.sectionSpecOverride?.trim() ||
      null

    options.push({
      testParameterId: r.id,
      testLabel: testName,
      specificRequirement: sectionSpec || masterSpec,
      clauseNo: (r.clause_no ?? '').trim() || null,
      unitValue: (r.unit_value ?? '').trim() || null,
      isCodeLabel: (r.is_code_label ?? '').trim() || null,
      uncertaintyMu: (r.uncertainty_mu ?? '').trim() || null,
      underAccreditation: underAccreditationLabel(r.under_accreditation_ids, bodies),
      alreadyInSection,
    })
  }

  return options.sort((a, b) => {
    if (Boolean(a.alreadyInSection) !== Boolean(b.alreadyInSection)) {
      return a.alreadyInSection ? -1 : 1
    }
    return a.testLabel.localeCompare(b.testLabel, undefined, { sensitivity: 'base' })
  })
}

/** @deprecated Prefer fetchIsCodeTestsForSection — kept for any external callers. */
export async function fetchIsCodeTestsNotInDraft(
  row: TestAllocationRow,
  draft: SectionParameterEntry[],
): Promise<AllocatedTestOption[]> {
  const all = await fetchIsCodeTestsForSection(row, draft)
  return all.filter((o) => !o.alreadyInSection)
}
