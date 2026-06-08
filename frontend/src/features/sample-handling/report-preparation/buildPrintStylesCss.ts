import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'

export type PrintPageMarginsMm = {
  top: number
  right: number
  bottom: number
  left: number
}

export function getTestReportPrintMargins(settings: TestReportPrintSettings): PrintPageMarginsMm {
  return {
    top: settings.bodyPaddingTopMm,
    right: settings.bodyPaddingHorizontalMm,
    bottom: settings.bodyPaddingBottomMm,
    left: settings.bodyPaddingHorizontalMm,
  }
}

export function buildPrintStylesCss(settings: TestReportPrintSettings): string {
  const {
    pageSize,
    bodyPaddingTopMm,
    bodyPaddingBottomMm,
    bodyPaddingHorizontalMm,
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
  } = settings

  const partFrameBorder = showPartFrames ? '2px solid rgba(37, 99, 235, 0.35)' : '1px solid #cbd5e1'
  const innerBorder = '1px solid #e2e8f0'
  const cellPad = `${tableCellPaddingPx}px`
  const headerImgMaxMm = Math.min(headerMaxHeightMm, Math.max(12, bodyPaddingTopMm - 6))
  const footerImgMaxMm = Math.min(footerMaxHeightMm, Math.max(10, bodyPaddingBottomMm - 6))

  const partBreakRules = [
    partBNewPage ? '.report-part.part-b' : null,
    partCNewPage ? '.report-part.part-c' : null,
    partDNewPage ? '.report-part.part-d' : null,
  ]
    .filter(Boolean)
    .map((sel) => `${sel}{break-before:page;page-break-before:always}`)
    .join('\n    ')

  return `
  @page {
    size: ${pageSize};
    margin: ${bodyPaddingTopMm}mm ${bodyPaddingHorizontalMm}mm ${bodyPaddingBottomMm}mm ${bodyPaddingHorizontalMm}mm;
    @top-left-corner { content: ""; }
    @top-left { content: ""; }
    @top-center { content: ""; }
    @top-right { content: ""; }
    @top-right-corner { content: ""; }
    @bottom-left-corner { content: ""; }
    @bottom-left { content: ""; }
    @bottom-center { content: ""; }
    @bottom-right { content: ""; }
    @bottom-right-corner { content: ""; }
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
    padding: 2mm ${bodyPaddingHorizontalMm}mm 2mm;
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
    padding: 2mm ${bodyPaddingHorizontalMm}mm 2mm;
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
    padding: ${bodyPaddingTopMm}mm ${bodyPaddingHorizontalMm}mm ${bodyPaddingBottomMm}mm;
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
    break-inside: avoid-page;
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
    margin: 0 0 6px;
    text-align: left;
    color: #2563eb;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .part-frame {
    border: ${partFrameBorder};
    background: #fff;
    overflow: hidden;
  }

  .part-a-grid { font-size: ${baseFontSizePt}pt; }
  .part-a-row {
    display: grid;
    border-bottom: ${innerBorder};
  }
  .part-a-row:last-child { border-bottom: none; }
  .part-a-row-full {
    padding: ${cellPad} 12px;
    line-height: ${lineHeight};
    word-break: break-word;
  }
  .part-a-row-cols-2 { grid-template-columns: 1fr 1fr; }
  .part-a-row-cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .part-a-cell {
    padding: ${cellPad} 12px;
    border-right: ${innerBorder};
    line-height: ${lineHeight};
    word-break: break-word;
  }
  .part-a-cell:last-child { border-right: none; }
  .muted { color: #64748b; }
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
    font-size: ${baseFontSizePt}pt;
    margin: 0;
  }
  .part-c-table thead { display: table-header-group; }
  .part-c-table th,
  .part-c-table td {
    border: 1px solid #cbd5e1;
    padding: ${cellPad};
    vertical-align: top;
  }
  .part-c-table th {
    background: #f1f5f9;
    font-weight: 600;
    text-align: center;
    border-bottom: 2px solid rgba(37, 99, 235, 0.4);
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
  }
  .part-c-table tr.section-code td {
    border-top: 2px solid rgba(37, 99, 235, 0.35);
    border-bottom: 2px solid rgba(37, 99, 235, 0.25);
    background: #f8fafc;
    font-weight: 600;
    text-align: left;
    padding: ${cellPad} 10px;
  }
  .part-c-end-notes {
    border-top: 2px solid #94a3b8;
    padding: 10px 12px;
    background: #f8fafc;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
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
    .part-c-table thead { display: table-header-group; }
    .part-c-table tr { break-inside: avoid; }
    .report-part.part-a { break-inside: avoid-page; }
  }
`
}

export function buildWatermarkStyleCss(
  settings: TestReportPrintSettings,
  template: { watermarkUrl: string | null; watermarkText: string },
  escapeHtml: (s: string) => string,
): string {
  if (!settings.showWatermark) return ''

  const inset = `${settings.bodyPaddingTopMm}mm ${settings.bodyPaddingHorizontalMm}mm ${settings.bodyPaddingBottomMm}mm`

  if (template.watermarkUrl) {
    return `.print-body::before{content:'';position:fixed;inset:${inset};background:url('${escapeHtml(template.watermarkUrl)}') center/42% no-repeat;opacity:.07;pointer-events:none;z-index:0}`
  }
  if (template.watermarkText) {
    return `.print-body::before{content:'${escapeHtml(template.watermarkText)}';position:fixed;inset:${inset};display:flex;align-items:center;justify-content:center;font-size:48px;color:#94a3b8;opacity:.1;transform:rotate(-25deg);pointer-events:none;z-index:0}`
  }
  return ''
}
