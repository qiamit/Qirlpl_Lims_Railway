import {
  cssPageSizeValue,
  resolvePrintPageSizeMm,
  type TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'

/** Consent letter page margins (cm → mm). */
export const CONSENT_LETTER_PAGE_MARGINS_MM = {
  top: 10,
  right: 5,
  bottom: 5,
  left: 10,
} as const

/** Compact single-page consent letter — flow layout (no fixed header gap). */
export function buildConsentLetterPrintStylesCss(settings: TestReportPrintSettings): string {
  const { headerMaxHeightMm, footerMaxHeightMm } = settings
  const { top, right, bottom, left } = CONSENT_LETTER_PAGE_MARGINS_MM

  const headerMaxMm = Math.min(Math.max(headerMaxHeightMm, 28), 42)
  const footerMaxMm = Math.min(Math.max(footerMaxHeightMm, 18), 36)
  const pageHeightMm = resolvePrintPageSizeMm(settings).height
  const contentMinHeightMm = pageHeightMm - top - bottom
  const footerReserveMm = footerMaxMm + 4
  const pageSizeCss = cssPageSizeValue(settings)

  return `
  @page {
    size: ${pageSizeCss};
    margin: ${top}mm ${right}mm ${bottom}mm ${left}mm;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
  }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 10pt;
    line-height: 1.35;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .consent-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    min-height: ${contentMinHeightMm}mm;
    margin: 0;
    padding: 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .consent-body {
    flex: 1 1 auto;
  }

  .consent-header {
    flex-shrink: 0;
    margin: 0 0 6pt;
    margin-left: -${left}mm;
    margin-right: -${right}mm;
    width: calc(100% + ${left}mm + ${right}mm);
    padding: 0;
    line-height: 0;
    text-align: center;
  }
  .consent-header img {
    display: block;
    width: 100%;
    max-width: 100%;
    max-height: ${headerMaxMm}mm;
    height: auto;
    margin: 0;
    padding: 0;
    object-fit: contain;
    object-position: top center;
  }
  .consent-header.fallback {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    padding: 2mm ${left}mm 0;
    text-align: left;
  }

  .consent-footer {
    flex-shrink: 0;
    margin-top: auto;
    margin-left: -${left}mm;
    margin-right: -${right}mm;
    width: calc(100% + ${left}mm + ${right}mm);
    padding: 0;
    line-height: 0;
    text-align: center;
  }
  .consent-footer img {
    display: block;
    width: 100%;
    height: ${footerMaxMm}mm;
    margin: 0;
    padding: 0;
    object-fit: fill;
    object-position: bottom center;
  }

  .consent-letter {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    color: inherit;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .client-block {
    margin: 6pt 0 8pt;
  }
  .is-spec-block {
    margin: 0 0 8pt;
  }
  .is-spec-block p {
    margin: 0 0 4pt;
  }
  .consent-section-rule {
    display: block;
    width: calc(100% + ${left}mm + ${right}mm);
    margin: 0 -${right}mm 5mm -${left}mm;
    padding: 0;
    border: none;
    border-top: 1px solid #111;
    height: 0;
  }
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 6pt;
  }
  .meta-table td {
    vertical-align: top;
    padding: 0;
  }
  .meta-right {
    text-align: right;
    white-space: nowrap;
  }
  .subject {
    margin: 0 0 8pt;
    text-align: justify;
  }
  .salutation {
    margin: 0 0 6pt;
  }
  .body-text {
    margin: 0 0 6pt;
    text-align: justify;
  }
  table.details {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 10pt;
    font-size: 9.5pt;
  }
  table.details th,
  table.details td {
    border: 1px solid #333;
    padding: 4pt 6pt;
    vertical-align: top;
  }
  table.details th {
    background: #f3f4f6;
    text-align: center;
    font-weight: 600;
  }
  table.details td.num {
    width: 10%;
    text-align: center;
  }
  table.details td.param-name {
    width: 62%;
  }
  table.details td.clause {
    width: 28%;
    text-align: center;
  }
  .credentials {
    margin: 0 0 8pt;
  }
  .credentials ol {
    margin: 4pt 0 0;
    padding-left: 18pt;
  }
  .credentials li {
    margin-bottom: 4pt;
    text-align: justify;
  }
  .closing {
    margin-top: 10pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .closing p {
    margin: 0 0 4pt;
  }
  .consent-sign-block {
    margin-top: 8pt;
    margin-left: auto;
    width: fit-content;
    max-width: 55mm;
  }
  .consent-sign-inner {
    position: relative;
    display: inline-block;
    text-align: center;
    min-width: 42mm;
  }
  .consent-sign-text {
    position: relative;
    z-index: 1;
    padding-top: 14mm;
    text-align: center;
  }
  .consent-seal {
    position: absolute;
    top: -2mm;
    left: 50%;
    z-index: 2;
    transform: translateX(-50%);
    line-height: 0;
    pointer-events: none;
  }
  .consent-seal img {
    display: block;
    max-height: 22mm;
    max-width: 52mm;
    height: auto;
    width: auto;
    object-fit: contain;
    background: transparent;
    mix-blend-mode: multiply;
  }
  .signatory-name {
    margin: 0 !important;
    font-weight: 700;
  }
  .signatory-designation {
    margin: 0 !important;
    font-size: 9.5pt;
  }
  .signatory {
    margin-top: 4pt !important;
    font-weight: 600;
  }

  @media print {
    html, body {
      margin: 0;
      padding: 0;
    }
    .consent-page {
      display: block;
      min-height: 0;
      margin: 0;
      padding: 0 0 ${footerReserveMm}mm;
    }
    .consent-footer {
      position: fixed;
      bottom: ${bottom}mm;
      left: 0;
      right: 0;
      margin: 0;
      width: 100%;
    }
    .consent-footer img {
      width: 100%;
      height: ${footerMaxMm}mm;
      object-fit: fill;
    }
  }
`
}
