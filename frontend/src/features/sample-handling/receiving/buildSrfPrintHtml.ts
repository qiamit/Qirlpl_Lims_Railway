import type { SrfPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import type { SampleRow } from '../types'
import { getSampleWorkflowStatusLabel } from '../sampleWorkflowStatus'
import { buildSrfPrintStylesCss } from './buildSrfPrintStylesCss'

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(v: string | null | undefined): string {
  const t = String(v ?? '').trim()
  return t ? escapeHtml(t) : '—'
}

export type BuildSrfPrintHtmlOptions = {
  rows: SampleRow[]
  labName: string
  printSettings: SrfPrintSettings
  headerUrl?: string | null
  footerUrl?: string | null
  filterNote?: string
  printedAt?: Date
}

export function buildSrfPrintHtml(opts: BuildSrfPrintHtmlOptions): string {
  const { rows, labName, printSettings } = opts
  const printedAt = opts.printedAt ?? new Date()
  const styles = buildSrfPrintStylesCss(printSettings)

  const headerBlock =
    printSettings.showHeader && opts.headerUrl
      ? `<header class="print-header"><img src="${escapeHtml(opts.headerUrl)}" alt="" /></header>`
      : printSettings.showHeader
        ? `<header class="print-header fallback">${escapeHtml(labName.trim() || 'Laboratory')}</header>`
        : ''

  const footerBlock =
    printSettings.showFooter && opts.footerUrl
      ? `<footer class="print-footer"><img src="${escapeHtml(opts.footerUrl)}" alt="" /></footer>`
      : ''

  const rowsHtml = rows
    .map(
      (r) => `<tr>
  <td class="num">${cell(r.srf_number)}</td>
  <td class="num">${cell(r.date_of_sample_receiving)}</td>
  <td>${cell(r.client_name)}</td>
  <td>${cell(r.sample_code)}</td>
  <td>${cell(r.sample_qr_code)}</td>
  <td>${cell(r.sample_description ?? r.description)}</td>
  <td class="num">${cell(r.tentative_date_required)}</td>
  <td class="num">${cell(r.tentative_date_by_lab)}</td>
  <td>${cell(getSampleWorkflowStatusLabel(r))}</td>
  <td>${cell(r.receiving_report_type)}</td>
  <td>${cell(r.test_report_is_code_label)}</td>
  <td>${cell(r.test_required)}</td>
  <td>${cell(r.nature_of_sample)}</td>
  <td>${cell(r.mode_of_disposal)}</td>
</tr>`,
    )
    .join('\n')

  const filterLine = opts.filterNote?.trim()
    ? `<p class="srf-title-block"><span style="font-size:9pt;color:#64748b">Filter: ${escapeHtml(opts.filterNote.trim())}</span></p>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sample Receiving — SRF Print</title>
<style>${styles}</style>
</head>
<body>
${headerBlock}
${footerBlock}
<main class="print-body">
  <div class="srf-title-block">
    <h1>Sample Receiving Form (SRF)</h1>
    <p>${escapeHtml(labName.trim() || 'Laboratory')} · ${rows.length} record${rows.length === 1 ? '' : 's'}</p>
  </div>
  ${filterLine}
  <table class="srf-table">
    <thead>
      <tr>
        <th>SRF Number</th>
        <th>Date of Receiving</th>
        <th>Customer</th>
        <th>Sample Code</th>
        <th>QR Code</th>
        <th>Description</th>
        <th>Tentative Date (Customer)</th>
        <th>Tentative Date (Lab)</th>
        <th>Status</th>
        <th>Report Type</th>
        <th>IS Code</th>
        <th>Test Required</th>
        <th>Nature of Sample</th>
        <th>Mode of Disposal</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="14" style="text-align:center">No records</td></tr>'}
    </tbody>
  </table>
  <p class="print-meta">Printed ${escapeHtml(printedAt.toLocaleString())}</p>
</main>
</body>
</html>`
}
