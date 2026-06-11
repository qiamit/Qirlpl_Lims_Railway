import {
  effectiveTableFontSizePt,
  type PageNumberPosition,
  type TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'

const PAGE_MARGIN_BOXES = [
  'top-left-corner',
  'top-left',
  'top-center',
  'top-right',
  'top-right-corner',
  'bottom-left-corner',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'bottom-right-corner',
] as const

function pageNumberVerticalAlign(position: PageNumberPosition): 'top' | 'bottom' {
  return position.startsWith('top-') ? 'bottom' : 'top'
}

function buildPageMarginBoxesCss(
  position: PageNumberPosition,
  showPageNumbers: boolean,
  pageNumberContent: string,
  fontFamily: string,
  baseFontSizePt: number,
): string {
  return PAGE_MARGIN_BOXES.map((box) => {
    if (showPageNumbers && box === position) {
      return `@${box} {
      content: ${pageNumberContent};
      font-family: ${fontFamily};
      font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
      color: #475569;
      vertical-align: ${pageNumberVerticalAlign(position)};
    }`
    }
    return `@${box} { content: ""; }`
  }).join('\n    ')
}

export type PrintPageMarginsMm = {
  top: number
  right: number
  bottom: number
  left: number
}

export function getTestReportPrintMargins(settings: TestReportPrintSettings): PrintPageMarginsMm {
  return {
    top: settings.bodyPaddingTopMm,
    right: settings.bodyPaddingRightMm,
    bottom: settings.bodyPaddingBottomMm,
    left: settings.bodyPaddingLeftMm,
  }
}

export function buildPrintStylesCss(settings: TestReportPrintSettings): string {
  const {
    pageSize,
    bodyPaddingTopMm,
    bodyPaddingBottomMm,
    bodyPaddingLeftMm,
    bodyPaddingRightMm,
    headerMaxHeightMm,
    footerMaxHeightMm,
    fontFamily,
    baseFontSizePt,
    titleFontSizePt,
    lineHeight,
    partGapMm,
    partGapAfterAMm,
    partGapAfterBMm,
    partGapAfterCMm,
    tableCellPaddingPx,
    showPartFrames,
    partBNewPage,
    partCNewPage,
    partDNewPage,
    partANewPage,
    showPageNumbers,
    pageNumberPosition,
  } = settings

  const tableFontSizePt = effectiveTableFontSizePt(settings)
  const pageNumberContent = showPageNumbers
    ? '"Page " counter(page, decimal-leading-zero) " of " counter(pages, decimal-leading-zero)'
    : '""'

  const partFrameBorder = showPartFrames ? '2px solid #2563eb' : '1.5px solid #60a5fa'
  const innerBorder = '1px solid #93c5fd'
  const partFrameBg = showPartFrames
    ? 'linear-gradient(180deg, #eff6ff 0%, #ffffff 28px)'
    : '#ffffff'
  const cellPad = `${tableCellPaddingPx}px`
  const headerImgMaxMm = Math.min(headerMaxHeightMm, Math.max(12, bodyPaddingTopMm - 6))
  const footerImgMaxMm = Math.min(footerMaxHeightMm, Math.max(10, bodyPaddingBottomMm - 6))

  const partBreakRules = [
    partANewPage ? '.report-part.part-a' : null,
    partBNewPage ? '.report-part.part-b' : null,
    partCNewPage ? '.report-part.part-c' : null,
    partDNewPage ? '.report-part.part-d' : null,
  ]
    .filter(Boolean)
    .map((sel) => `${sel}{break-before:page;page-break-before:always}`)
    .join('\n    ')

  const pageMarginBoxes = buildPageMarginBoxesCss(
    pageNumberPosition,
    showPageNumbers,
    pageNumberContent,
    fontFamily,
    baseFontSizePt,
  )

  return `
  @page {
    size: ${pageSize};
    margin: ${bodyPaddingTopMm}mm ${bodyPaddingRightMm}mm ${bodyPaddingBottomMm}mm ${bodyPaddingLeftMm}mm;
    ${pageMarginBoxes}
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; }
  body {
    font-family: ${fontFamily};
    font-size: ${baseFontSizePt}pt;
    line-height: ${lineHeight};
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Fixed letterhead + footer on every printed page (Chrome / Edge). */
  .print-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: #fff;
    padding: 2mm ${bodyPaddingRightMm}mm 2mm ${bodyPaddingLeftMm}mm;
    max-height: ${bodyPaddingTopMm}mm;
    overflow: hidden;
  }
  .print-header img {
    display: block;
    width: 100%;
    max-width: 100%;
    max-height: ${headerImgMaxMm}mm;
    height: auto;
    margin: 0 auto;
    object-fit: contain;
    object-position: top center;
  }
  .print-header.fallback {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    padding: 4mm 0;
  }

  .print-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: #fff;
    padding: 2mm ${bodyPaddingRightMm}mm 2mm ${bodyPaddingLeftMm}mm;
    max-height: ${bodyPaddingBottomMm}mm;
    overflow: hidden;
  }
  .print-footer img {
    display: block;
    width: 100%;
    max-width: 100%;
    max-height: ${footerImgMaxMm}mm;
    height: auto;
    margin: 0 auto;
    object-fit: contain;
    object-position: bottom center;
  }

  .print-body {
    position: relative;
    z-index: 1;
    padding: ${bodyPaddingTopMm}mm ${bodyPaddingRightMm}mm ${bodyPaddingBottomMm}mm ${bodyPaddingLeftMm}mm;
  }

  .report-title-block {
    text-align: center;
    margin-bottom: ${partGapMm}px;
  }
  .report-title-block h1 {
    font-size: ${titleFontSizePt}pt;
    font-weight: 700;
    margin: 0;
    letter-spacing: 0.02em;
  }

  .report-part {
    break-inside: auto;
    page-break-inside: auto;
  }
  .report-part.part-a {
    margin-bottom: ${partGapAfterAMm}px;
  }
  .report-part.part-b {
    margin-bottom: ${partGapAfterBMm}px;
  }
  .report-part.part-c {
    margin-bottom: ${partGapAfterCMm}px;
  }
  .report-part.part-d {
    margin-bottom: 0;
  }
  .part-heading {
    font-size: ${Math.max(9, baseFontSizePt - 1)}pt;
    font-weight: 700;
    margin: 0 0 8px;
    padding-bottom: 4px;
    text-align: left;
    color: #1d4ed8;
    border-bottom: 2px solid #3b82f6;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    break-after: avoid;
    page-break-after: avoid;
  }

  .part-frame {
    display: block;
    width: 100%;
    border: ${partFrameBorder};
    background: ${partFrameBg};
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
    overflow: visible;
    break-inside: auto;
    page-break-inside: auto;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  .part-c-frame {
    padding: 0;
    overflow: visible;
  }
  .part-c-heading {
    margin: 0;
    padding: 8px 12px;
    border-bottom: ${innerBorder};
    break-after: avoid;
    page-break-after: avoid;
  }
  .part-c-table-area {
    break-before: avoid;
    page-break-before: avoid;
  }

  .part-a-grid { font-size: ${baseFontSizePt}pt; }
  .part-a-row {
    display: grid;
    border-bottom: ${innerBorder};
  }
  .part-a-row:last-child { border-bottom: none; }
  .part-a-row-full {
    display: block;
    padding: ${cellPad} 12px;
    line-height: ${lineHeight};
    word-break: break-word;
    border-bottom: ${innerBorder};
  }
  .part-a-grid > .part-a-row-full:last-child { border-bottom: none; }
  .part-a-row-cols-2 { grid-template-columns: 1fr 1fr; }
  .part-a-row-cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .part-a-cell {
    padding: ${cellPad} 12px;
    border-right: ${innerBorder};
    line-height: ${lineHeight};
    word-break: break-word;
  }
  .part-a-cell:last-child { border-right: none; }
  .muted { color: #475569; }
  .part-a-cell strong, .part-a-row-full strong { font-weight: 600; color: #0f172a; }

  .part-b-grid { font-size: ${baseFontSizePt}pt; }
  .part-b-row {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr) minmax(9rem, max-content);
    border-bottom: ${innerBorder};
  }
  .part-b-row:last-child { border-bottom: none; }
  .part-b-num {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: ${cellPad} 6px;
    border-right: ${innerBorder};
    color: #64748b;
    font-weight: 600;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
  }
  .part-b-desc {
    padding: ${cellPad} 10px;
    border-right: ${innerBorder};
    color: #64748b;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    line-height: 1.35;
    word-break: break-word;
  }
  .part-b-value {
    display: flex;
    align-items: center;
    padding: ${cellPad} 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .part-c-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
    font-size: ${tableFontSizePt}pt;
    margin: 0;
    border: none;
  }
  .part-c-table thead {
    display: table-header-group;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table tbody {
    display: table-row-group;
  }
  .part-c-table th,
  .part-c-table td {
    border: 1px solid #94a3b8;
    padding: ${cellPad};
    vertical-align: top;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table th:first-child,
  .part-c-table td:first-child {
    border-left: 2px solid rgba(37, 99, 235, 0.35);
  }
  .part-c-table th:last-child,
  .part-c-table td:last-child {
    border-right: 2px solid rgba(37, 99, 235, 0.35);
  }
  .part-c-table th {
    background: #f1f5f9;
    font-weight: 600;
    text-align: center;
    border-bottom: 2px solid rgba(37, 99, 235, 0.4);
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
  }
  .part-c-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table tr.section-code td {
    border-top: 2px solid rgba(37, 99, 235, 0.35);
    border-bottom: 2px solid rgba(37, 99, 235, 0.25);
    background: #f8fafc;
    font-weight: 600;
    text-align: left;
    padding: ${cellPad} 10px;
    break-after: avoid;
    page-break-after: avoid;
  }
  .part-c-table td.l {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table td.l .name,
  .part-c-table td.l .sub {
    display: inline;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-end-notes {
    border-top: 2px solid #94a3b8;
    padding: 10px 12px;
    background: #f8fafc;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    break-inside: avoid;
    page-break-inside: avoid;
    break-before: avoid;
    page-break-before: avoid;
  }
  .end-marker {
    text-align: center;
    font-weight: 600;
    margin: 0 0 6px;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    letter-spacing: 0.04em;
  }
  .end-notes-body { text-align: justify; line-height: 1.45; margin: 0; }
  td.c { text-align: center; }
  td.l { text-align: left; }
  td.strong { font-weight: 600; }
  .name { font-weight: 600; line-height: 1.35; }
  .sub { color: #64748b; font-size: ${Math.max(8, baseFontSizePt - 1)}pt; margin-top: 2px; line-height: 1.3; }
  .remark-confirm { color: #047857; font-weight: 600; }
  .remark-fail { color: #b91c1c; font-weight: 600; }
  .remark-na { color: #64748b; font-weight: 600; }

  .part-d-shell { font-size: ${baseFontSizePt}pt; }
  .part-d-heading-bar {
    border-bottom: ${innerBorder};
    background: #f1f5f9;
    padding: ${cellPad} 12px;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .part-d-line1 {
    margin: 0;
    padding: ${cellPad} 12px;
    border-bottom: ${innerBorder};
    background: #f8fafc;
    line-height: ${lineHeight};
  }
  .part-d-line2 {
    margin: 0;
    padding: ${cellPad} 12px;
    line-height: ${lineHeight};
    white-space: pre-wrap;
    min-height: 2.5em;
  }

  .report-signatures {
    margin-top: ${partGapAfterCMm}px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-signatures-flow {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-signatures-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 24px 16px;
  }
  .report-signature-cell {
    flex: 1 1 140px;
    max-width: 220px;
    min-width: 120px;
    text-align: center;
  }
  .report-signature-role {
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #334155;
    margin-bottom: 4px;
  }
  .report-signature-line {
    border-top: 1px solid #334155;
    margin: 28px 8px 8px;
  }
  .report-signature-name {
    font-weight: 700;
    font-size: ${baseFontSizePt}pt;
    line-height: ${lineHeight};
  }
  .report-signature-designation {
    margin-top: 2px;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    color: #475569;
    line-height: ${lineHeight};
  }

  .terms {
    margin-top: ${partGapMm}px;
    font-size: ${baseFontSizePt}pt;
    border: ${innerBorder};
    padding: 10px 12px;
    break-inside: avoid;
    line-height: ${lineHeight};
  }
  .terms h3 { font-size: ${Math.max(9, baseFontSizePt - 1)}pt; margin: 0 0 6px; font-weight: 700; }
  .terms-body { white-space: pre-wrap; }

  @media print {
    ${partBreakRules}
    /* @page margins apply on every sheet — do not pad .print-body (page 1 only bug). */
    .print-body {
      padding: 0;
    }
    .print-header,
    .print-footer {
      position: fixed;
    }
    .report-part.part-c .part-c-frame {
      break-inside: auto;
      page-break-inside: auto;
      border: none;
      background: transparent;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .report-part.part-c .part-c-heading {
      border: ${partFrameBorder};
      border-bottom: ${innerBorder};
      background: #fff;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .report-part.part-c .part-c-table-area {
      break-before: avoid;
      page-break-before: avoid;
    }
    .part-c-table thead {
      display: table-header-group;
    }
    .part-c-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .part-c-table th,
    .part-c-table td {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .part-c-table tr.section-code {
      break-after: avoid;
      page-break-after: avoid;
    }
    .part-c-end-notes {
      border: ${partFrameBorder};
      border-top: 2px solid #94a3b8;
      break-inside: avoid;
      page-break-inside: avoid;
      break-before: avoid;
      page-break-before: avoid;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .report-part,
    .part-frame:not(.part-c-frame) {
      break-inside: auto;
      page-break-inside: auto;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .part-heading:not(.part-c-heading) {
      break-after: avoid;
      page-break-after: avoid;
    }
    .report-signatures-flow {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`
}

export function buildWatermarkStyleCss(
  settings: TestReportPrintSettings,
  template: { watermarkUrl: string | null; watermarkText: string },
  escapeHtml: (s: string) => string,
): string {
  if (!settings.showWatermark) return ''

  const inset = `${settings.bodyPaddingTopMm}mm ${settings.bodyPaddingRightMm}mm ${settings.bodyPaddingBottomMm}mm ${settings.bodyPaddingLeftMm}mm`

  if (template.watermarkUrl) {
    return `.print-body::before{content:'';position:fixed;inset:${inset};background:url('${escapeHtml(template.watermarkUrl)}') center/42% no-repeat;opacity:.07;pointer-events:none;z-index:0}`
  }
  if (template.watermarkText) {
    return `.print-body::before{content:'${escapeHtml(template.watermarkText)}';position:fixed;inset:${inset};display:flex;align-items:center;justify-content:center;font-size:48px;color:#94a3b8;opacity:.1;transform:rotate(-25deg);pointer-events:none;z-index:0}`
  }
  return ''
}
