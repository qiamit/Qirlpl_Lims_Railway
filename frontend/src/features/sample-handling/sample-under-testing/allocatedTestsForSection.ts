import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'
import type { SectionParameterEntry } from './sectionParameterRows'

export type AllocatedTestOption = {
  testParameterId: string
  /** Existing allocation row id; needed to remove a parameter after its master row is deleted. */
  allocationParameterId?: string
  testLabel: string
  specificRequirement: string | null
  /** Master `test_parameters.test_method` — not IS number. */
  testMethod: string | null
  clauseNo: string | null
  unitValue: string | null
  isCodeLabel: string | null
  uncertaintyMu: string | null
  underAccreditation: string | null
  /** Already present on this section (draft / saved). Pre-checked; engineer may unselect to remove. */
  alreadyInSection?: boolean
  /** The saved allocation no longer has a matching test-parameter master row. */
  isUnavailableInMaster?: boolean
  /** Existing row has a result that will be deleted if removed from this section. */
  hasResults?: boolean
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
    if (id) keys.add(`id:${id}`)
  }
  return keys
}

function isInDraft(
  keys: Set<string>,
  testParameterId: string | null | undefined,
): boolean {
  const id = testParameterId?.trim()
  return Boolean(id && keys.has(`id:${id}`))
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
): SectionParameterEntry | undefined {
  const id = testParameterId.trim()
  return draft.find((entry) => entry.testParameterId?.trim() === id)
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
        'id, item_name, specific_requirement, test_method, clause_no, unit_value, uncertainty_mu, department, is_code_id, is_code_label, under_accreditation_ids',
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
      test_method?: string | null
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
    const alreadyInSection = isInDraft(keys, r.id)
    const masterSpec = (r.specific_requirement ?? '').trim() || null
    const draftEntry = alreadyInSection ? findDraftEntry(draft, r.id) : undefined
    const sectionSpec =
      draftEntry?.specificRequirement?.trim() ||
      draftEntry?.sectionSpecOverride?.trim() ||
      null

    options.push({
      testParameterId: r.id,
      allocationParameterId: draftEntry?.paramRowId ?? undefined,
      testLabel: testName,
      specificRequirement: sectionSpec || masterSpec,
      testMethod: (r.test_method ?? '').trim() || null,
      clauseNo: (r.clause_no ?? '').trim() || null,
      unitValue: (r.unit_value ?? '').trim() || null,
      isCodeLabel: (r.is_code_label ?? '').trim() || null,
      uncertaintyMu: (r.uncertainty_mu ?? '').trim() || null,
      underAccreditation: underAccreditationLabel(r.under_accreditation_ids, bodies),
      alreadyInSection,
      hasResults: Boolean(
        draftEntry?.results?.trim() || draftEntry?.testStartDate || draftEntry?.testEndDate,
      ),
    })
  }

  // Keep saved rows visible even when their master parameter was deleted or moved to
  // another IS code/department. The database's ON DELETE SET NULL preserves the
  // allocation row and result, so remove it by its allocation row id.
  const availableIds = new Set(options.map((option) => option.testParameterId))
  for (const entry of draft) {
    const parameterId = entry.testParameterId?.trim()
    if (parameterId && availableIds.has(parameterId)) continue
    const allocationParameterId = entry.paramRowId?.trim()
    if (!allocationParameterId) continue
    options.push({
      testParameterId: `unavailable:${allocationParameterId}`,
      allocationParameterId,
      testLabel: entry.testLabel,
      specificRequirement: entry.specificRequirement,
      testMethod: null,
      clauseNo: entry.clauseNo,
      unitValue: entry.unitValue,
      isCodeLabel: entry.isCodeLabel,
      uncertaintyMu: null,
      underAccreditation: 'Unavailable — not in current master',
      alreadyInSection: true,
      isUnavailableInMaster: true,
      hasResults: Boolean(entry.results?.trim() || entry.testStartDate || entry.testEndDate),
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
