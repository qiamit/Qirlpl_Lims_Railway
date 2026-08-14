import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import {
  cssPageSizeValue,
  pageBorderCssDeclaration,
  resolvePageBorderInsets,
  resolvePrintPageSizeMm,
} from '@/features/settings/lab-settings/printSettingsTypes'

/** Sheet layout shared by live preview measurement and Print/PDF export. */
export function buildTestReportSheetLayoutCss(settings: TestReportPrintSettings): string {
  const {
    bodyPaddingTopMm,
    bodyPaddingBottomMm,
    bodyPaddingLeftMm,
    bodyPaddingRightMm,
    pageBorderType,
    pageBorderAlignment,
  } = settings

  const borderInsets = resolvePageBorderInsets(settings)
  const sheetBorderCss =
    borderInsets == null
      ? ''
      : `
  .preview-sheet .print-page-border,
  .preview-sheet::after {
    content: '';
    position: absolute;
    left: ${borderInsets.leftMm}mm;
    right: ${borderInsets.rightMm}mm;
    top: ${borderInsets.topMm}mm;
    bottom: ${borderInsets.bottomMm}mm;
    ${pageBorderCssDeclaration(pageBorderType, pageBorderAlignment)}
    box-sizing: border-box;
    pointer-events: none;
    z-index: 45;
  }`

  return `
  .preview-sheet {
    position: relative;
    background: #fff;
    overflow: hidden;
    box-sizing: border-box;
  }
  .preview-sheet .print-header,
  .preview-sheet .print-footer {
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 20 !important;
    background: #fff !important;
  }
  .preview-sheet .print-header { top: 0 !important; }
  .preview-sheet .print-footer { bottom: 0 !important; }
  .preview-sheet .print-body {
    padding: ${bodyPaddingTopMm}mm ${bodyPaddingRightMm}mm ${bodyPaddingBottomMm}mm ${bodyPaddingLeftMm}mm !important;
    box-sizing: border-box;
    overflow: hidden;
    height: 100%;
    position: relative;
    z-index: 1;
  }
  body > .print-page-border,
  body::after {
    display: none !important;
  }
  ${sheetBorderCss}
`
}

/** On-screen chrome for stacked preview sheets (not used for Print/PDF). */
export function buildTestReportSheetScreenChromeCss(): string {
  return `
@media screen {
  html {
    background: #e7e5e4 !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    min-height: 0 !important;
    height: auto !important;
    overflow: visible !important;
    background: #e7e5e4 !important;
  }
  .preview-sheets {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px 0 24px;
  }
  .preview-sheet {
    box-shadow: 0 2px 12px rgba(28, 25, 23, 0.16);
  }
}
`
}

/**
 * Print/PDF rules for already-paginated `.preview-sheet` pages.
 * Continuous @page margins / fixed borders must not apply.
 */
export function buildTestReportSheetPrintCss(settings: TestReportPrintSettings): string {
  const page = resolvePrintPageSizeMm(settings)
  const pageSizeCss = cssPageSizeValue(settings)

  return `
@page {
  size: ${pageSizeCss};
  margin: 0 !important;
}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: ${page.width}mm !important;
  min-height: 0 !important;
  height: auto !important;
  background: #fff !important;
  overflow: visible !important;
}
.preview-sheets {
  display: block !important;
  gap: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}
.preview-sheet {
  width: ${page.width}mm !important;
  height: ${page.height}mm !important;
  margin: 0 !important;
  box-shadow: none !important;
  page-break-after: always;
  break-after: page;
  page-break-inside: avoid;
  break-inside: avoid;
}
.preview-sheet:last-child {
  page-break-after: auto;
  break-after: auto;
}
.print-header,
.print-footer {
  position: absolute !important;
}
`
}

export function injectCssIntoHtml(html: string, css: string): string {
  if (html.includes('</style>')) {
    return html.replace('</style>', `${css}</style>`)
  }
  return html.replace('</head>', `<style>${css}</style></head>`)
}

export function buildLivePreviewSrcDocCss(settings: TestReportPrintSettings): string {
  return `${buildTestReportSheetLayoutCss(settings)}${buildTestReportSheetScreenChromeCss()}
@media print {
  html, body { width: ${resolvePrintPageSizeMm(settings).width}mm; }
}
`
}
