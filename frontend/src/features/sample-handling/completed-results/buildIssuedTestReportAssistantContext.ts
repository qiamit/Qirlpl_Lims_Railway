import { supabase } from '@/lib/supabaseClient'
import { appendReportScopeSuffix } from '@/features/sample-handling/report-preparation/reportScope'
import {
  buildTestReportPrepareDialogAssistantContext,
  parseSrfFromMessage,
} from '@/features/sample-handling/report-preparation/buildTestReportPreparationAssistantContext'
import { fetchTestReportCoverDetails } from '@/features/sample-handling/report-preparation/fetchTestReportCoverDetails'
import { fetchReportResultRowsForSample } from '@/features/sample-handling/report-preparation/reportResultRows'
import type { IssuedTestReportListRow } from './types'

export { parseSrfFromMessage }

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 10) : '—'

export const ISSUED_TEST_REPORT_INSTRUCTIONS = `You are the **Issued Test Report Assistant** for an ISO 17025 laboratory (Clause 7.8 — post-issue review).

The test report for this SRF has **already been issued**. Use IS Code standard PDFs (when available) as the authoritative source for IS codes, clauses, and test methods.

You may help with:
1. **Report review** — cross-check issued report content (Parts A–D, results, numbering, ULR) against IS PDFs and lab records.
2. **Customer & sample information** — verify Part A consistency with receiving and client data.
3. **Results & conformity** — summarise whether reported results align with specified requirements.
4. **Amendment / supplementary guidance** — if the user asks about corrections, explain what would typically require amendment or supplementary report (advisory only).
5. **Final assessment** — for a full review, end with:

## Review Outcome
**Status:** OK | NEEDS ATTENTION
**Summary:** (short paragraph)
**Findings:** (bullets; write "None" if OK)

RULES:
- **Advisory only** — you cannot re-open or change issued records in the LIMS.
- Do not claim to revoke or re-issue reports; direct users to lab procedure for amendments.`

export function buildIssuedTestReportListContext(
  rows: IssuedTestReportListRow[],
  search: string,
): string {
  const lines = [
    'Module: Issued Test Report (Clause 7.8 — issued test reports and closed SRFs)',
    `Issued SRFs in list: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Use **SRF Analysis** tab: enter an SRF number from the table for full issued-report review on that SRF only.',
    '',
    'Issued SRFs on screen (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none — issue reports from Test Report Preparation first)')
  } else {
    for (const r of slice) {
      const nablNo =
        r.nablIssuedAt && r.reportNumberBase
          ? appendReportScopeSuffix(r.reportNumberBase, 'nabl')
          : '—'
      const nonNablNo =
        r.nonNablIssuedAt && r.reportNumberBase
          ? appendReportScopeSuffix(r.reportNumberBase, 'non_nabl')
          : '—'
      lines.push(
        `- SRF=${fmt(r.srfNumber)} | client=${fmt(r.clientName)} | IS=${fmt(r.isCodeLabel)} | NABL=${nablNo} | Non-NABL=${nonNablNo} | issued=${fmtDate(r.issuedAt)}`,
      )
    }
    if (rows.length > 30) lines.push(`… and ${rows.length - 30} more.`)
  }

  return lines.join('\n')
}

export function findIssuedRowBySrf(
  rows: IssuedTestReportListRow[],
  srf: string,
): IssuedTestReportListRow | null {
  const n = srf.trim().toLowerCase()
  if (!n) return null
  const exact = rows.filter((r) => (r.srfNumber ?? '').trim().toLowerCase() === n)
  if (exact.length >= 1) return exact[0]!
  const partial = rows.filter((r) => {
    const s = (r.srfNumber ?? '').trim().toLowerCase()
    return s.includes(n) || n.includes(s)
  })
  if (partial.length === 1) return partial[0]!
  return null
}

function formatIssuedMetadataBlock(row: IssuedTestReportListRow): string {
  const lines = [
    '=== Issued report metadata (from LIMS) ===',
    `SRF: ${fmt(row.srfNumber)}`,
    `Overall issued timestamp: ${fmtDate(row.issuedAt)}`,
    `Date of receiving: ${fmtDate(row.dateReceiving)}`,
    `Canonical report number (base …A): ${fmt(row.reportNumberBase)}`,
    `NABL ULR: ${fmt(row.nablUlrNumber)}`,
  ]
  if (row.nablIssuedAt && row.reportNumberBase) {
    lines.push(
      `NABL report issued: ${fmtDate(row.nablIssuedAt)} · number ${appendReportScopeSuffix(row.reportNumberBase, 'nabl')}`,
    )
  } else {
    lines.push('NABL report issued: No')
  }
  if (row.nonNablIssuedAt && row.reportNumberBase) {
    lines.push(
      `Non-NABL report issued: ${fmtDate(row.nonNablIssuedAt)} · number ${appendReportScopeSuffix(row.reportNumberBase, 'non_nabl')}`,
    )
  } else {
    lines.push('Non-NABL report issued: No')
  }
  return lines.join('\n')
}

export async function buildIssuedSrfReportAssistantContext(
  row: IssuedTestReportListRow,
): Promise<{ context: string; isCodeId?: string }> {
  const { data: sampleRow } = await supabase
    .from('samples')
    .select('test_report_draft_notes, test_report_is_code_id')
    .eq('id', row.id)
    .maybeSingle()

  const draftNotes = (sampleRow as { test_report_draft_notes?: string | null } | null)
    ?.test_report_draft_notes
  const isCodeId =
    row.isCodeId?.trim() ||
    (sampleRow as { test_report_is_code_id?: string | null } | null)?.test_report_is_code_id?.trim() ||
    undefined

  const [coverDetails, resultRows] = await Promise.all([
    fetchTestReportCoverDetails(row.id, {
      fallbacks: { clientName: row.clientName, isCodeLabel: row.isCodeLabel },
    }),
    fetchReportResultRowsForSample(row.id),
  ])

  const reportSnapshot = buildTestReportPrepareDialogAssistantContext({
    row: {
      id: row.id,
      srfNumber: row.srfNumber,
      dateReceiving: row.dateReceiving,
      clientName: row.clientName,
      isCodeId: isCodeId ?? null,
      isCodeLabel: row.isCodeLabel,
      reportNumber: row.reportNumberBase,
      draftNotes: draftNotes ?? null,
      nablUlrNumber: row.nablUlrNumber,
    },
    coverDetails,
    partBDetails: coverDetails.partB,
    resultRows,
    reportNumber: row.reportNumberBase ?? '',
    nablUlrNumber: row.nablUlrNumber ?? '',
    draftNotes: draftNotes ?? '',
  })

  const marker = '--- DRAFT TEST REPORT ---'
  const reportContent = reportSnapshot.includes(marker)
    ? (reportSnapshot.split(marker)[1]?.trim() ?? reportSnapshot)
    : reportSnapshot

  const context = [
    ISSUED_TEST_REPORT_INSTRUCTIONS,
    '',
    formatIssuedMetadataBlock(row),
    '',
    '--- ISSUED TEST REPORT CONTENT (as stored) ---',
    reportContent,
  ].join('\n')

  return { context, isCodeId }
}
