import type { SrfPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'

export function buildSrfPrintStylesCss(settings: SrfPrintSettings): string {
  const {
    pageSize,
    bodyPaddingTopMm,
    bodyPaddingBottomMm,
    bodyPaddingHorizontalMm,
    headerMaxHeightMm,
    footerMaxHeightMm,
    fontFamily,
    baseFontSizePt,
  } = settings

  return `
  @page {
    size: ${pageSize};
    margin-top: ${bodyPaddingTopMm}mm;
    margin-right: ${bodyPaddingHorizontalMm}mm;
    margin-bottom: ${bodyPaddingBottomMm}mm;
    margin-left: ${bodyPaddingHorizontalMm}mm;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${fontFamily};
    font-size: ${baseFontSizePt}pt;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: #fff;
    padding: 3mm ${bodyPaddingHorizontalMm}mm 2mm;
    border-bottom: 1px solid #e2e8f0;
  }
  .print-header img {
    max-width: 100%;
    max-height: ${headerMaxHeightMm}mm;
    width: auto;
    height: auto;
    display: block;
    margin: 0 auto;
    object-fit: contain;
  }
  .print-header.fallback {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    padding: 6mm ${bodyPaddingHorizontalMm}mm;
  }

  .print-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: #fff;
    padding: 2mm ${bodyPaddingHorizontalMm}mm 3mm;
    border-top: 1px solid #e2e8f0;
  }
  .print-footer img {
    max-width: 100%;
    max-height: ${footerMaxHeightMm}mm;
    width: auto;
    height: auto;
    display: block;
    margin: 0 auto;
    object-fit: contain;
  }

  .print-body {
    position: relative;
    z-index: 1;
    padding: ${bodyPaddingTopMm}mm ${bodyPaddingHorizontalMm}mm ${bodyPaddingBottomMm}mm;
    min-height: 100vh;
  }

  .srf-title-block {
    text-align: center;
    margin-bottom: 10px;
  }
  .srf-title-block h1 {
    font-size: 14pt;
    margin: 0 0 4px;
  }
  .srf-title-block p {
    margin: 0;
    font-size: 9pt;
    color: #64748b;
  }

  table.srf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
  }
  table.srf-table thead {
    display: table-header-group;
  }
  table.srf-table tr {
    page-break-inside: avoid;
  }
  table.srf-table th,
  table.srf-table td {
    border: 1px solid #94a3b8;
    padding: 5px 6px;
    vertical-align: top;
    word-wrap: break-word;
  }
  table.srf-table th {
    background: #e2e8f0;
    text-align: center;
    font-weight: 700;
  }
  table.srf-table td.num {
    text-align: center;
    white-space: nowrap;
  }

  .print-meta {
    margin-top: 8px;
    font-size: 8pt;
    color: #64748b;
    text-align: right;
  }

  @media print {
    .print-body {
      padding: 0;
      min-height: 0;
    }
  }
`
}
