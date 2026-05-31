import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import { groupReportRowsBySectionCode, type ReportResultRow } from './reportResultRows'
import { PART_D_HEADING } from './TestReportRemarksSection'
import { formatPartDRemarksLine1, splitPartDRemarks } from './testReportPartDRemarks'
import {
  formatTestReportEndNotesText,
  TEST_REPORT_END_MARKER,
} from './testReportEndNotes'
import type { ResolvedScopeTemplate } from './reportScopeConfig'
import { type ReportScopeKind } from './reportScope'
import { PART_B_ROW_LABELS, partBValuesList } from './testReportPartB'
import {
  DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  type TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { buildPrintStylesCss, buildWatermarkStyleCss } from './buildPrintStylesCss'
import { waitForPrintDocumentReady } from './waitForPrintDocumentReady'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const displayPart = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

function testNameCell(row: ReportResultRow): string {
  const methodLine = row.testMethodClause
    ? `<div class="sub">${escapeHtml(row.testMethodClause)}</div>`
    : ''
  return `<div class="name">${escapeHtml(row.testName)}</div>${methodLine}`
}

function remarkClass(remark: string): string {
  if (remark === 'Confirm') return 'remark-confirm'
  if (remark === 'Not Confirm') return 'remark-fail'
  return ''
}

function partAFullLine(label: string, value: string | null | undefined): string {
  return `<div class="part-a-row part-a-row-full"><span class="muted">${escapeHtml(label)}</span> - <strong>${escapeHtml(displayPart(value))}</strong></div>`
}

function partARowCells(
  cols: Array<{ label: string; value: string | null | undefined }>,
  colClass: 'part-a-row-cols-2' | 'part-a-row-cols-3',
): string {
  const cells = cols
    .map(
      (c) =>
        `<div class="part-a-cell"><span class="muted">${escapeHtml(c.label)}</span> - <strong>${escapeHtml(displayPart(c.value))}</strong></div>`,
    )
    .join('')
  return `<div class="part-a-row ${colClass}">${cells}</div>`
}

function buildPartAPrintHtml(
  cover: TestReportCoverDetails | null | undefined,
  fallback: {
    scope: ReportScopeKind
    srf: string
    client: string
    isStandard: string
    dateReceiving: string
    reportNumber: string
    ulrNumber?: string
  },
): string {
  const heading = `<h2 class="part-heading">Part A — Particulars of Sample Submitted</h2>`

  if (!cover) {
    const body = `<div class="part-frame"><div class="part-a-grid">
      ${partAFullLine('SRF', fallback.srf)}
      ${partAFullLine('Client', fallback.client)}
      ${partAFullLine('Report as per IS', fallback.isStandard)}
      ${partAFullLine('Date of receiving', fallback.dateReceiving)}
      ${partAFullLine('Report Number', fallback.reportNumber)}
      ${
        fallback.scope === 'nabl' && fallback.ulrNumber?.trim()
          ? partAFullLine('ULR Number', fallback.ulrNumber)
          : ''
      }
    </div></div>`
    return `<section class="report-part part-a">${heading}${body}</section>`
  }

  const idCols =
    fallback.scope === 'nabl'
      ? [
          { label: 'Date of Reporting', value: cover.dateOfReporting },
          { label: 'Report Number', value: fallback.reportNumber || null },
          { label: 'ULR Number', value: fallback.ulrNumber?.trim() ? fallback.ulrNumber : null },
        ]
      : [
          { label: 'Date of Reporting', value: cover.dateOfReporting },
          { label: 'Report Number', value: fallback.reportNumber || null },
        ]

  const body = `<div class="part-frame"><div class="part-a-grid">
    ${partAFullLine('Customer Details', cover.customerDetails)}
    ${partAFullLine('IS Details', cover.isDetails)}
    ${partARowCells(idCols, idCols.length === 3 ? 'part-a-row-cols-3' : 'part-a-row-cols-2')}
    ${partARowCells(
      [
        { label: 'Sample Code', value: cover.sampleCode },
        { label: 'QR Code / Bar Code', value: cover.sampleQrCode },
        { label: 'Nature of Sample', value: cover.natureOfSample },
      ],
      'part-a-row-cols-3',
    )}
    ${partARowCells(
      [
        { label: 'Batch Number', value: cover.batchNumber },
        { label: 'Date of Manufacturing', value: cover.dateOfManufacturing },
        { label: 'Party Reference No', value: cover.partyReferenceNo },
      ],
      'part-a-row-cols-3',
    )}
    ${partARowCells(
      [
        { label: 'Sample Quantity', value: cover.sampleQuantity },
        { label: 'BIS Seal', value: cover.bisSeal },
        { label: "IO's Signature", value: cover.ioSignature },
      ],
      'part-a-row-cols-3',
    )}
    ${partARowCells(
      [
        { label: 'Section Code', value: cover.sectionCodes },
        { label: 'Section Report No', value: cover.sectionReportNo },
        { label: 'Report Type', value: cover.reportType },
      ],
      'part-a-row-cols-3',
    )}
    ${partARowCells(
      [
        { label: 'Date of Sample Receipt', value: cover.dateOfSampleReceipt },
        { label: 'Date of Testing Started', value: cover.dateOfTestingStarted },
        { label: 'Date of Testing Completed', value: cover.dateOfTestingCompleted },
      ],
      'part-a-row-cols-3',
    )}
    ${partARowCells(
      [
        { label: 'Reference Report No', value: cover.referenceReportNo },
        { label: 'Any Other Information', value: cover.anyOtherInformation },
      ],
      'part-a-row-cols-2',
    )}
    ${partAFullLine('Sample Description', cover.sampleDescription)}
    ${partAFullLine('Declared Value', cover.declaredValue)}
  </div></div>`

  return `<section class="report-part part-a">${heading}${body}</section>`
}

function buildPartBPrintHtml(cover: TestReportCoverDetails): string {
  const values = partBValuesList(cover.partB)
  const rows = PART_B_ROW_LABELS.map(
    (label, i) =>
      `<div class="part-b-row"><div class="part-b-num">${i + 1}.</div><div class="part-b-desc">${escapeHtml(label)}</div><div class="part-b-value">${escapeHtml(values[i] ?? '—')}</div></div>`,
  ).join('')
  return `<section class="report-part part-b">
  <h2 class="part-heading">Part B — Supplementary Information</h2>
  <div class="part-frame"><div class="part-b-grid">${rows}</div></div>
</section>`
}

function buildPartCResultsHtml(rows: ReportResultRow[]): string {
  const sections = groupReportRowsBySectionCode(rows)
  if (sections.length === 0) {
    return `<table class="part-c-table">
      <thead><tr>
        <th>Sr No</th><th>Test Name</th><th>Unit</th>
        <th>Specified Requirements</th><th>Observed Value</th><th>Remark</th>
      </tr></thead>
      <tbody><tr><td colspan="6" class="c">No results for this scope</td></tr></tbody>
    </table>`
  }

  const rowsHtml = sections
    .flatMap((section) => [
      `<tr class="section-code"><td colspan="6">Section Code - ${escapeHtml(section.sectionCode)}</td></tr>`,
      ...section.rows.map(
        (r) => `
      <tr>
        <td class="c">${r.srNo}</td>
        <td class="l">${testNameCell(r)}</td>
        <td class="c">${escapeHtml(r.unit)}</td>
        <td class="c">${escapeHtml(r.specifiedRequirement)}</td>
        <td class="c strong">${escapeHtml(r.observedValue)}</td>
        <td class="c ${remarkClass(r.remark)}">${escapeHtml(r.remark)}</td>
      </tr>`,
      ),
    ])
    .join('')

  const endNotesBlock = `
    <div class="part-c-end-notes">
      <p class="end-marker">${escapeHtml(TEST_REPORT_END_MARKER)}</p>
      <p class="end-notes-body">${escapeHtml(formatTestReportEndNotesText())}</p>
    </div>`

  return `<table class="part-c-table">
    <thead><tr>
      <th>Sr No</th>
      <th>Test Name</th>
      <th>Unit</th>
      <th>Specified Requirements</th>
      <th>Observed Value</th>
      <th>Remark</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>${endNotesBlock}`
}

function buildPartCPrintHtml(rows: ReportResultRow[]): string {
  return `<section class="report-part part-c">
  <h2 class="part-heading">Part C — Test Results</h2>
  <div class="part-frame">${buildPartCResultsHtml(rows)}</div>
</section>`
}

function buildPartDPrintHtml(notes: string, isLabel: string): string {
  const { line1, line2 } = splitPartDRemarks(notes, isLabel)
  const line1Text = line1 || formatPartDRemarksLine1(isLabel)
  const line2Html = line2 ? escapeHtml(line2).replace(/\n/g, '<br/>') : ''
  return `<section class="report-part part-d">
  <h2 class="part-heading">Part D — Remarks</h2>
  <div class="part-frame part-d-shell">
    <div class="part-d-heading-bar">${escapeHtml(PART_D_HEADING)}</div>
    <p class="part-d-line1">${escapeHtml(line1Text)}</p>
    ${line2Html ? `<div class="part-d-line2">${line2Html}</div>` : '<div class="part-d-line2">&nbsp;</div>'}
  </div>
</section>`
}

export function buildScopedTestReportPrintHtml(opts: {
  scope: ReportScopeKind
  labName: string
  srf: string
  client: string
  isStandard: string
  dateReceiving: string
  reportNumber: string
  ulrNumber?: string
  notes: string
  rows: ReportResultRow[]
  template: ResolvedScopeTemplate
  coverDetails?: TestReportCoverDetails | null
  printSettings?: TestReportPrintSettings
}): string {
  const printSettings = opts.printSettings ?? DEFAULT_TEST_REPORT_PRINT_SETTINGS
  const printStyles = buildPrintStylesCss(printSettings)
  const watermarkStyle = buildWatermarkStyleCss(printSettings, opts.template, escapeHtml)

  const headerInner = opts.template.omitHeader
    ? ''
    : opts.template.headerUrl
      ? `<img src="${escapeHtml(opts.template.headerUrl)}" alt="Letterhead"/>`
      : `<strong>${escapeHtml(opts.labName)}</strong>`

  const footerInner =
    opts.template.omitFooter || !opts.template.footerUrl
      ? ''
      : `<img src="${escapeHtml(opts.template.footerUrl)}" alt="Footer"/>`

  const termsBlock = opts.template.termsText.trim()
    ? `<div class="terms"><h3>Terms &amp; Conditions</h3><div class="terms-body">${escapeHtml(opts.template.termsText).replace(/\n/g, '<br/>')}</div></div>`
    : ''

  const isLabel = opts.coverDetails?.isDetails ?? opts.isStandard
  const partAHtml = buildPartAPrintHtml(opts.coverDetails, {
    scope: opts.scope,
    srf: opts.srf,
    client: opts.client,
    isStandard: opts.isStandard,
    dateReceiving: opts.dateReceiving,
    reportNumber: opts.reportNumber,
    ulrNumber: opts.scope === 'nabl' ? opts.ulrNumber : undefined,
  })
  const partBHtml = opts.coverDetails?.partB ? buildPartBPrintHtml(opts.coverDetails) : ''
  const partCHtml = buildPartCPrintHtml(opts.rows)
  const partDHtml = buildPartDPrintHtml(opts.notes, isLabel)

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title></title>
<style>${printStyles}${watermarkStyle}</style></head><body>
${headerInner ? `<header class="print-header${opts.template.headerUrl ? '' : ' fallback'}">${headerInner}</header>` : ''}
${footerInner ? `<footer class="print-footer">${footerInner}</footer>` : ''}
<main class="print-body">
  <div class="report-title-block">
    <h1>Test Report</h1>
  </div>
  ${partAHtml}
  ${partBHtml}
  ${partCHtml}
  ${partDHtml}
  ${termsBlock}
</main>
</body></html>`
}

export async function printHtmlDocument(html: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  doc.title = ''
  await waitForPrintDocumentReady(doc)
  try {
    win.focus()
    win.print()
  } finally {
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {
        /* ignore */
      }
    }, 500)
  }
}
