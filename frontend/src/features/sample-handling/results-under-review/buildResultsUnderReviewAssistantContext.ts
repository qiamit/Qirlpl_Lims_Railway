import type { TestAllocationRow } from '../types'
import {
  SECTION_REVIEW_SYSTEM_INSTRUCTIONS,
  buildSectionReviewAssistantContext,
  findRowBySectionCode,
  parseSectionCodeFromMessage,
} from '../sample-under-testing/buildSampleUnderTestingAssistantContext'

export { findRowBySectionCode, parseSectionCodeFromMessage }

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export const RESULTS_REVIEW_SECTION_INSTRUCTIONS = `You are the **Results Under Review** assistant for an ISO 17025 laboratory (Technical Manager / reviewer role).

CRITICAL SCOPE:
- Answer **only** about the **single section code** provided in the context below.
- Do **not** discuss other sections, SRFs, or modules unless the user asks about this section only.
- If the user question is unrelated to this section, say you can only help for the active section code.

RULES:
- Provide **advisory suggestions only**. Do not officially approve or reject — the reviewer uses **Refer back** or **Approved** in the app.
- Use IS Code PDF excerpts (when loaded) plus sample description, declared value, specific requirements, and reported results.

For this section, analyze:
1. **Sample Description** and **Declared Value** vs test requirements.
2. **IS Standard** — relevant clauses from uploaded IS Code PDFs.
3. **Each test parameter** — specific requirement vs reported result (confirms / does not confirm).
4. **Testing duration** vs test method expectations.
5. **Reviewer recommendation** — suggest Refer back or Approved with clear reasoning (advisory only).

Use headings per test parameter. Use cautious language ("suggest", "consider", "may not meet").`

/** Compact list of sections assigned to this reviewer (header assistant). */
export function buildResultsUnderReviewListAssistantContext(
  rows: TestAllocationRow[],
  search: string,
): string {
  const lines = [
    'Module: Results Under Review (Clause 7.8 — reviewer checks results before test report)',
    `Sections sent to you for review: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Use **Section Analysis** tab: enter a section code to get answers only for that section.',
    'Actions in the table: Refer back → Sample Under Testing | Approved → test report preparation.',
    '',
    'Section codes on screen (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none — no results assigned to you for review)')
  } else {
    for (const r of slice) {
      const paramCount = r.parameters?.length ?? 0
      const withResults = r.parameters?.filter((p) => (p.results ?? '').trim()).length ?? 0
      lines.push(
        `- section=${fmt(r.sectionCode)} | SRF=${fmt(r.srfNumber)} | IS=${fmt(r.isCodeLabel)} | engineer=${fmt(r.assignedEmployeeName)} | params=${paramCount} | results=${withResults}`,
      )
    }
    if (rows.length > 30) lines.push(`… and ${rows.length - 30} more.`)
  }

  return lines.join('\n')
}

/** Full context for one section (section-code tab). */
export async function buildResultsUnderReviewSectionContext(row: TestAllocationRow): Promise<string> {
  const sectionData = await buildSectionReviewAssistantContext(row)
  const body = sectionData.replace(SECTION_REVIEW_SYSTEM_INSTRUCTIONS, '').trim()
  return `${RESULTS_REVIEW_SECTION_INSTRUCTIONS}\n\n${body}`
}
