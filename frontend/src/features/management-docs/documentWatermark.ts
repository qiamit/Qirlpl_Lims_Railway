/**
 * Watermarks for the A4 document preview / print (ISO/IEC 17025 8.3.2 e, f).
 *   Obsolete            "OBSOLETE" on screen and on paper.
 *   Draft / under review "DRAFT - NOT APPROVED" on paper.
 *   Active              "UNCONTROLLED COPY" on paper.
 * Every printed page also gets a small line "Uncontrolled copy when printed ...".
 * Pure CSS on [data-mgmt-a4-pages] [data-mgmt-a4-page]; the measuring page is
 * outside that container, so pagination is not affected.
 */
import type { ManagementDocStatus } from './types'

/** Text inside a CSS string literal (no quotes, backslashes, line breaks or tags). */
function cssString(text: string): string {
  const clean = text.replace(/[\r\n\t]+/g, ' ').replace(/[<>]/g, '')
  return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const PAGE = '[data-mgmt-a4-pages] [data-mgmt-a4-page]'

function diagonal(text: string, rgb: string, alpha: number, fontPx: number): string {
  return `
    ${PAGE} { position: relative !important; }
    ${PAGE}::after {
      content: ${cssString(text)};
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font: 800 ${fontPx}px/1 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
      letter-spacing: 0.12em;
      white-space: nowrap;
      color: rgba(${rgb}, ${alpha});
      border: 6px solid rgba(${rgb}, ${alpha});
      padding: 10px 28px;
      pointer-events: none;
      z-index: 30;
    }`
}

export function buildDocumentWatermarkCss({
  status,
  printedBy,
  printedAt = new Date(),
}: {
  status: ManagementDocStatus
  printedBy: string
  printedAt?: Date
}): string {
  const when = printedAt.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const stamp =
    status === 'obsolete'
      ? `OBSOLETE - withdrawn document, for reference only. Printed ${when}${printedBy ? ` by ${printedBy}` : ''}`
      : `Uncontrolled copy when printed. Printed ${when}${printedBy ? ` by ${printedBy}` : ''}. Check the LIMS for the current version.`

  const printLine = `
    ${PAGE} { position: relative !important; }
    ${PAGE}::before {
      content: ${cssString(stamp)};
      position: absolute;
      left: 0;
      right: 0;
      bottom: 1.5mm;
      text-align: center;
      font: 600 8px/1.2 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
      letter-spacing: 0.04em;
      color: ${status === 'obsolete' ? '#b91c1c' : '#57534e'};
      pointer-events: none;
      z-index: 31;
    }`

  if (status === 'obsolete') {
    // On screen too: nobody should mistake it for the current document.
    return `${diagonal('OBSOLETE', '185, 28, 28', 0.2, 96)}\n@media print {${printLine}}`
  }
  const printMark =
    status === 'active'
      ? diagonal('UNCONTROLLED COPY', '87, 83, 78', 0.09, 58)
      : diagonal('DRAFT - NOT APPROVED', '180, 83, 9', 0.14, 54)
  return `@media print {${printMark}\n${printLine}}`
}
