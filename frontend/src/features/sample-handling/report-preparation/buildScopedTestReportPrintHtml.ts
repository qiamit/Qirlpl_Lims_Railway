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
  signaturesApplyAfterPart,
  visibleTestReportSignatures,
  type TestReportPrintSettings,
  type TestReportSignatureAfterPart,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { buildPrintStylesCss, buildWatermarkStyleCss } from './buildPrintStylesCss'
import {
  DEFAULT_PART_C_REPORT_COLUMNS,
  type PartCReportColumnKey,
  type PartCReportColumnVisibility,
  visiblePartCReportColumns,
} from './partCReportColumns'
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
    ? `<br/><span class="sub">${escapeHtml(row.testMethodClause)}</span>`
    : ''
  return `<span class="name">${escapeHtml(row.testName)}</span>${methodLine}`
}

function remarkClass(remark: string): string {
  if (remark === 'Confirm') return 'remark-confirm'
  if (remark === 'Not Confirm') return 'remark-fail'
  if (remark === 'Not Applicable' || remark === '—' || remark === '-') return 'remark-na'
  return ''
}

function partAFullLine(label: string, value: string | null | undefined): string {
  return `<div class="part-a-row-full"><span class="muted">${escapeHtml(label)}</span> - <strong>${escapeHtml(displayPart(value))}</strong></div>`
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

function partCDataCell(key: PartCReportColumnKey, row: ReportResultRow): string {
  switch (key) {
    case 'srNo':
      return `<td class="c">${row.srNo}</td>`
    case 'testName':
      return `<td class="l">${testNameCell(row)}</td>`
    case 'unit':
      return `<td class="c">${escapeHtml(row.unit)}</td>`
    case 'specifiedRequirement':
      return `<td class="c">${escapeHtml(row.specifiedRequirement)}</td>`
    case 'observedValue':
      return `<td class="c strong">${escapeHtml(row.observedValue)}</td>`
    case 'uncertainty':
      return `<td class="c">${escapeHtml(row.uncertainty)}</td>`
    case 'remark':
      return `<td class="c ${remarkClass(row.remark)}">${escapeHtml(row.remark)}</td>`
    default:
      return ''
  }
}

function buildPartCResultsHtml(
  rows: ReportResultRow[],
  columns: PartCReportColumnVisibility = DEFAULT_PART_C_REPORT_COLUMNS,
  options?: { showEndNotes?: boolean; showSectionRows?: boolean },
): { tableHtml: string; endNotesBlock: string } {
  const showEndNotes = options?.showEndNotes !== false
  const showSectionRows = options?.showSectionRows !== false
  const visibleCols = visiblePartCReportColumns(columns)
  const colCount = Math.max(visibleCols.length, 1)
  const headerCells = visibleCols.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('')

  const sections = groupReportRowsBySectionCode(rows)
  if (sections.length === 0) {
    return {
      tableHtml: `<table class="part-c-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody><tr><td colspan="${colCount}" class="c">No results for this scope</td></tr></tbody>
    </table>`,
      endNotesBlock: '',
    }
  }

  const rowsHtml = sections
    .flatMap((section) => [
      ...(showSectionRows
        ? [
            `<tr class="section-code"><td colspan="${colCount}">Section Code - ${escapeHtml(section.sectionCode)}</td></tr>`,
          ]
        : []),
      ...section.rows.map(
        (r) => `<tr>${visibleCols.map((col) => partCDataCell(col.key, r)).join('')}</tr>`,
      ),
    ])
    .join('')

  const tableHtml = `<table class="part-c-table">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`

  const endNotesBlock = showEndNotes
    ? `
    <div class="part-c-end-notes">
      <p class="end-marker">${escapeHtml(TEST_REPORT_END_MARKER)}</p>
      <p class="end-notes-body">${escapeHtml(formatTestReportEndNotesText())}</p>
    </div>`
    : ''

  return { tableHtml, endNotesBlock }
}

function buildPartCPrintHtml(
  rows: ReportResultRow[],
  columns: PartCReportColumnVisibility = DEFAULT_PART_C_REPORT_COLUMNS,
  printSettings?: TestReportPrintSettings,
): string {
  const { tableHtml, endNotesBlock } = buildPartCResultsHtml(rows, columns, {
    showEndNotes: printSettings?.showPartCEndNotes !== false,
    showSectionRows: printSettings?.showPartCSectionRows !== false,
  })
  return `<section class="report-part part-c">
  <div class="part-frame part-c-frame">
    <h2 class="part-heading part-c-heading">Part C — Test Results</h2>
    <div class="part-c-table-area">${tableHtml}</div>
    ${endNotesBlock}
  </div>
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

function buildSignaturesPrintHtml(printSettings: TestReportPrintSettings): string {
  const signatures = visibleTestReportSignatures(printSettings)
  if (signatures.length === 0) return ''

  const cells = signatures
    .map((sig) => {
      const roleLabel = sig.roleLabel.trim()
      const name = sig.name.trim() || '—'
      const designation = sig.designation.trim() || '—'
      const roleHtml = roleLabel
        ? `<div class="report-signature-role">${escapeHtml(roleLabel)}</div>`
        : ''
      return `<div class="report-signature-cell">
        ${roleHtml}
        <div class="report-signature-line" aria-hidden="true"></div>
        <div class="report-signature-name">${escapeHtml(name)}</div>
        <div class="report-signature-designation">${escapeHtml(designation)}</div>
      </div>`
    })
    .join('')

  return `<section class="report-signatures report-signatures-flow" aria-label="Report signatures">
    <div class="report-signatures-grid">${cells}</div>
  </section>`
}

function withSignaturesAfterPart(
  partHtml: string,
  part: TestReportSignatureAfterPart,
  printSettings: TestReportPrintSettings,
  signatureBlock: string,
): string {
  if (!partHtml.trim() || !signatureBlock) return partHtml
  if (!signaturesApplyAfterPart(printSettings, part)) return partHtml
  return `${partHtml}\n${signatureBlock}`
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

  const headerHtml =
    printSettings.showPrintHeader && headerInner && !opts.template.omitHeader
      ? `<header class="print-header${opts.template.headerUrl ? '' : ' fallback'}">${headerInner}</header>`
      : ''

  const footerHtml =
    printSettings.showPrintFooter && footerInner && !opts.template.omitFooter
      ? `<footer class="print-footer">${footerInner}</footer>`
      : ''

  const termsBlock =
    printSettings.showTermsAndConditions && opts.template.termsText.trim()
      ? `<div class="terms"><h3>Terms &amp; Conditions</h3><div class="terms-body">${escapeHtml(opts.template.termsText).replace(/\n/g, '<br/>')}</div></div>`
      : ''

  const titleBlock = printSettings.showReportTitle
    ? `<div class="report-title-block"><h1>Test Report</h1></div>`
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
  const partCHtml = buildPartCPrintHtml(opts.rows, printSettings.partCColumns, printSettings)
  const partDHtml = buildPartDPrintHtml(opts.notes, isLabel)
  const signatureBlock = buildSignaturesPrintHtml(printSettings)
  const partAWithSignatures = withSignaturesAfterPart(
    partAHtml,
    'part_a',
    printSettings,
    signatureBlock,
  )
  const partBWithSignatures = withSignaturesAfterPart(
    partBHtml,
    'part_b',
    printSettings,
    signatureBlock,
  )
  const partCWithSignatures = withSignaturesAfterPart(
    partCHtml,
    'part_c',
    printSettings,
    signatureBlock,
  )
  const partDWithSignatures = withSignaturesAfterPart(
    partDHtml,
    'part_d',
    printSettings,
    signatureBlock,
  )

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title></title>
<style>${printStyles}${watermarkStyle}</style></head><body>
${headerHtml}
${footerHtml}
<main class="print-body">
  ${titleBlock}
  ${partAWithSignatures}
  ${partBWithSignatures}
  ${partCWithSignatures}
  ${partDWithSignatures}
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
