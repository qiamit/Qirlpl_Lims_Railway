import type { CalibrationNablScopeRow } from './types'

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cell(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === '') return '—'
  return escapeHtml(String(value))
}

function readLabName(): string {
  if (typeof window === 'undefined') return 'Laboratory'
  return (
    window.localStorage.getItem('labSettings.labName')?.trim() ||
    'Quality International Research & Laboratories Pvt. Ltd.'
  )
}

export function buildCalibrationNablScopePrintHtml(options: {
  rows: CalibrationNablScopeRow[]
  filterNote?: string
  printedAt?: Date
}): string {
  const { rows, filterNote } = options
  const printedAt = options.printedAt ?? new Date()
  const labName = readLabName()
  const printDate = printedAt.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const rowsHtml = rows
    .map(
      (r) => `<tr>
  <td>${cell(r.s_no)}</td>
  <td>${cell(r.discipline_name)}</td>
  <td>${cell(r.group_name)}</td>
  <td>${cell(r.measurand)}</td>
  <td>${cell(r.calibration_method)}</td>
  <td>${cell(r.measurement_range)}</td>
  <td>${cell(r.cmc)}</td>
  <td>${cell(r.facility_type)}</td>
</tr>`,
    )
    .join('\n')

  const filterLine = filterNote?.trim()
    ? `<p class="meta">Filter: ${escapeHtml(filterNote.trim())}</p>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Calibration NABL Scope — Print</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  .meta { font-size: 9pt; color: #475569; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 8pt; }
  th, td { border: 1px solid #334155; padding: 4px 5px; vertical-align: top; }
  th { background: #1c1917; color: #fde68a; text-align: center; font-size: 7.5pt; text-transform: uppercase; }
  td:first-child { text-align: center; }
  .notes { margin-top: 14px; font-size: 8pt; color: #475569; }
</style>
</head>
<body>
  <h1>2.2 Scope of Accreditation — Calibration</h1>
  <p class="meta">${escapeHtml(labName)}</p>
  <p class="meta">Printed: ${escapeHtml(printDate)}</p>
  ${filterLine}
  <table>
    <thead>
      <tr>
        <th style="width:5%">S. No.</th>
        <th style="width:10%">Discipline Name</th>
        <th style="width:9%">Group</th>
        <th style="width:16%">Measurand / Instrument / Quantity</th>
        <th style="width:15%">Calibration / Measurement Method</th>
        <th style="width:15%">Measurement Range &amp; Parameters</th>
        <th style="width:12%">CMC (±)</th>
        <th style="width:12%">Facility Type</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="8" style="text-align:center">No records</td></tr>'}
    </tbody>
  </table>
  <div class="notes">
    <strong>Notes:</strong> CMC as uncertainties (±) at ~95% confidence; identify Site/Mobile/Permanent Site
    facility calibrations; use latest method standards and SI units where practicable.
  </div>
</body>
</html>`
}

export function buildCalibrationNablScopeAssistantContext(
  rows: CalibrationNablScopeRow[],
  search: string,
): string {
  const lines = rows.slice(0, 40).map(
    (r) =>
      `#${r.s_no} | ${r.discipline_name} | ${r.group_name} | ${r.measurand} | ${r.calibration_method} | ${r.measurement_range} | CMC: ${r.cmc} | ${r.facility_type}`,
  )
  return [
    'Table: calibration_nabl_scope',
    `Search: ${search.trim() || '(none)'}`,
    `Visible rows: ${rows.length}`,
    ...lines,
  ].join('\n')
}
