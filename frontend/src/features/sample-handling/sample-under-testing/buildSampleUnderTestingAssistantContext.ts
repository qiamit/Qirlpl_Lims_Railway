import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'
import { formatTestResultDisplay } from './testResultValues'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

/** List context for header QI Assistant (General Q&A tab). */
export function buildSampleUnderTestingListAssistantContext(
  rows: TestAllocationRow[],
  search: string,
): string {
  const lines = [
    'Module: Sample Under Testing (Clause 7.4 — technical records, results entry, send for review)',
    `Total section rows loaded: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Per-parameter dates, results, and results_reviewer_id live in test_allocation_parameters.',
    'samples.stage moves to results_review when sent for review.',
    'Use the **Section Review** tab and enter a section code for compliance suggestions (no DB changes).',
    '',
    'Section rows (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of slice) {
      const paramCount = r.parameters?.length ?? 0
      const resultsFilled =
        r.parameters?.filter((p) => (p.results ?? '').trim()).length ?? 0
      lines.push(
        `- section=${fmt(r.sectionCode)} | SRF=${fmt(r.srfNumber)} | IS=${fmt(r.isCodeLabel)} | dept=${fmt(r.department)} | tests=${paramCount} | results_entered=${resultsFilled} | assigned=${fmt(r.assignedEmployeeName)}`,
      )
    }
    if (rows.length > 30) {
      lines.push(`… and ${rows.length - 30} more rows not listed.`)
    }
  }

  return lines.join('\n')
}

export const SECTION_REVIEW_SYSTEM_INSTRUCTIONS = `You are the Sample Under Testing **Section Review** assistant for an ISO 17025 testing laboratory.

RULES:
- Provide **suggestions only**. Do not claim official approval/rejection. Do not instruct database changes.
- Base analysis on the context below and IS Code PDF text when provided.

For the requested section, work through:
1. **Sample Description** and **Declared Value** — summarize what the client declared vs what tests require.
2. **IS Standard** — use uploaded IS Code PDF excerpts to interpret applicable clauses/requirements.
3. **Each test parameter** — compare Specific Requirement and Acceptance Criteria against the standard for this sample description and declared value; note gaps or ambiguities.
4. **Reported Results** — state whether results appear to **confirm** (meet) requirements or **not confirm**, with reasoning.
5. **Testing time** — compare test_start_date and test_end_date to typical duration implied by the test method / standard; flag if duration seems unusually short or long.

Structure the reply with clear headings per test parameter. Use cautious language ("suggest", "consider", "may not meet").`

export function parseSectionCodeFromMessage(message: string, knownCodes: string[]): string | null {
  const trimmed = message.trim()
  if (!trimmed) return null

  const norm = (s: string) => s.trim().toLowerCase()
  const uniqueCodes = [...new Set(knownCodes.map((c) => c.trim()).filter(Boolean))]

  const tryMatch = (candidate: string): string | null => {
    const c = candidate.trim()
    if (!c) return null
    const n = norm(c)
    const exact = uniqueCodes.find((code) => norm(code) === n)
    if (exact) return exact
    const contained = uniqueCodes.filter((code) => norm(code).includes(n) || n.includes(norm(code)))
    if (contained.length === 1) return contained[0]!
    return null
  }

  const firstLine = trimmed.split('\n')[0]!.trim()
  const fromFirst = tryMatch(firstLine)
  if (fromFirst) return fromFirst

  for (const line of trimmed.split(/\n+/)) {
    const m = tryMatch(line.trim())
    if (m) return m
  }

  if (uniqueCodes.length === 1 && trimmed.length < 40) {
    return uniqueCodes[0]!
  }

  return tryMatch(trimmed) ?? (firstLine.length <= 64 ? firstLine : null)
}

export function findRowBySectionCode(rows: TestAllocationRow[], sectionCode: string): TestAllocationRow | null {
  const n = sectionCode.trim().toLowerCase()
  if (!n) return null
  const exact = rows.filter((r) => (r.sectionCode ?? '').trim().toLowerCase() === n)
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1) return exact[0]!
  const partial = rows.filter((r) => {
    const sc = (r.sectionCode ?? '').trim().toLowerCase()
    return sc.includes(n) || n.includes(sc)
  })
  if (partial.length === 1) return partial[0]!
  return null
}

/** Rich context for Section Review tab (fetched when user sends a section code). */
export async function buildSectionReviewAssistantContext(row: TestAllocationRow): Promise<string> {
  const lines: string[] = [
    SECTION_REVIEW_SYSTEM_INSTRUCTIONS,
    '',
    '=== SECTION UNDER REVIEW ===',
    `Section code: ${fmt(row.sectionCode)}`,
    `SRF: ${fmt(row.srfNumber)}`,
    `IS Code label: ${fmt(row.isCodeLabel)}`,
    row.isCodeId ? `is_code_id (for PDF notebook): ${row.isCodeId}` : 'is_code_id: —',
    `Department / designation: ${fmt(row.department)} / ${fmt(row.designation)}`,
    `Assigned testing engineer: ${fmt(row.assignedEmployeeName)}`,
    row.testAllocationId ? `test_allocations id: ${row.testAllocationId}` : '',
    `sample id: ${row.sampleId}`,
    '',
  ]

  const { data: sampleRow } = await supabase
    .from('samples')
    .select('sample_description, sample_declaration, any_other_information')
    .eq('id', row.sampleId)
    .maybeSingle()

  const sample = sampleRow as {
    sample_description?: string | null
    sample_declaration?: string | null
    any_other_information?: string | null
  } | null

  lines.push(
    '=== SAMPLE DESCRIPTION & DECLARED VALUE ===',
    `Sample Description:\n${fmt(sample?.sample_description)}`,
    `Declared Value (sample_declaration):\n${fmt(sample?.sample_declaration)}`,
    sample?.any_other_information
      ? `Other information:\n${fmt(sample.any_other_information)}`
      : '',
    '',
  )

  const paramRows = row.parameters ?? []
  const tpIds = [
    ...new Set(
      paramRows
        .map((p) => p.testParameterId)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ]

  const tpById = new Map<string, Record<string, unknown>>()
  if (tpIds.length > 0) {
    const { data: tpData } = await supabase.from('test_parameters').select('*').in('id', tpIds)
    for (const tp of Array.isArray(tpData) ? tpData : []) {
      const r = tp as Record<string, unknown>
      if (typeof r.id === 'string') tpById.set(r.id, r)
    }
  }

  lines.push('=== TEST PARAMETERS (results & timing) ===')
  if (paramRows.length === 0) {
    lines.push(
      `(No per-parameter rows in test_allocation_parameters; summary only: ${fmt(row.testParameterSummary)})`,
    )
  } else {
    for (const p of paramRows) {
      const tp = p.testParameterId ? tpById.get(p.testParameterId) : undefined
      lines.push(
        `--- ${fmt(p.testLabel)} ---`,
        `test_parameter_id: ${p.testParameterId ?? '—'}`,
        `Specific requirement (master): ${fmt(p.specificRequirement ?? (tp?.specific_requirement as string))}`,
        `Acceptance criteria (master): ${fmt(tp?.acceptance_criteria as string)}`,
        `Test method (master): ${fmt(tp?.test_method as string)}`,
        `Clause: ${fmt(tp?.clause_no as string)} | Unit: ${fmt(tp?.unit_value as string)}`,
        `Uncertainty (MU): ${fmt(tp?.uncertainty_mu as string)}`,
        `Test start date: ${fmt(p.testStartDate)}`,
        `Test end date: ${fmt(p.testEndDate)}`,
        `Reported results: ${fmt(formatTestResultDisplay(p.results))}`,
        '',
      )
    }
  }

  if (row.isCodeId) {
    const { data: files } = await supabase
      .from('is_code_files')
      .select('file_name')
      .eq('is_code_id', row.isCodeId)
      .order('created_at', { ascending: false })
      .limit(10)
    const names = (Array.isArray(files) ? files : [])
      .map((f) => (f as { file_name?: string }).file_name)
      .filter(Boolean)
    lines.push(
      '=== IS CODE FILES (PDF text loaded separately by assistant) ===',
      names.length > 0 ? names.join(', ') : '(no files listed — edge function may still read storage)',
      '',
    )
  }

  return lines.filter((line) => line.length > 0).join('\n')
}
