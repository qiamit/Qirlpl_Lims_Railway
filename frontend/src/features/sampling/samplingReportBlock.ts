/**
 * "Sampling information" in Part C of a test report (ISO/IEC 17025 7.8.5).
 * Pure: no database, no DOM. The data is captured once (live print and archive
 * snapshot use the same object) so an archived re-print reproduces it.
 */
import { formatDateTime } from '@/lib/utils'

export const SAMPLING_INFORMATION_HEADING = 'Sampling information'

/** What the report prints about the sampling of this sample. JSON-safe. */
export type ReportSamplingInfo = {
  /** Sampling record number, e.g. SR-2026-001. */
  recordNo: string
  /** ISO timestamp of sampling; formatted at render time. */
  sampledAt: string | null
  samplerName: string
  location: string
  /** "21.25140, 81.62960" or null. */
  gps: string | null
  /** "SP-2026-001 v2 — IS 1199 (Part 1):2018 cl 6"; empty when no plan. */
  planReference: string
  /** Conditions during sampling as recorded; empty when none. */
  environmentalConditions: string
  /** Deviations from the plan; empty when none. */
  deviations: string
  customerInformed: boolean
  customerAgreed: boolean
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function multiline(s: string): string {
  return esc(s.trim()).replace(/\n/g, '<br/>')
}

/** One-line deviation text, with the customer communication (7.3.2 / 7.1.6). */
export function samplingDeviationText(info: Pick<ReportSamplingInfo, 'deviations' | 'customerInformed' | 'customerAgreed'>): string {
  const d = info.deviations.trim()
  if (!d) return 'None'
  const comm = info.customerAgreed
    ? 'customer informed and agreed'
    : info.customerInformed
      ? 'customer informed'
      : 'customer not yet informed'
  return `${d} (${comm})`
}

/**
 * Part C block, inside the end-notes box. Empty string when there is no
 * sampling information (then the report HTML is exactly as before).
 */
export function buildSamplingInformationHtml(info: ReportSamplingInfo | null | undefined): string {
  if (!info || !info.recordNo) return ''
  const p = (label: string, value: string) =>
    `<p class="end-notes-body part-c-sampling-line" style="text-align:left;margin:0 0 2px;"><strong>${esc(label)}:</strong> ${value}</p>`
  const when = info.sampledAt ? formatDateTime(info.sampledAt) : '—'
  const location = info.gps ? `${esc(info.location)} (GPS ${esc(info.gps)})` : esc(info.location)
  const lines = [
    `<p class="end-notes-body part-c-sampling-line" style="text-align:left;margin:0 0 2px;"><strong>${esc(SAMPLING_INFORMATION_HEADING)}</strong> (record ${esc(info.recordNo)})</p>`,
    p('Date of sampling', esc(when)),
    p('Sampled by', esc(info.samplerName.trim() || '—')),
    p('Location', location),
    p('Sampling plan / method', info.planReference.trim() ? esc(info.planReference.trim()) : '—'),
  ]
  if (info.environmentalConditions.trim()) {
    lines.push(p('Environmental conditions during sampling', multiline(info.environmentalConditions)))
  }
  lines.push(p('Deviations from the sampling plan', multiline(samplingDeviationText(info))))
  return `
      <div class="part-c-sampling" style="margin:0 0 6px;">${lines.join('')}</div>`
}
