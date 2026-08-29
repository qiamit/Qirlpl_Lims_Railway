import { RECEIVING_REPORT_TYPES } from '../types'

export type ReceivingReportSrfSuffix = 'A' | 'R' | 'S'

/** Strip amendment (A), revised (R), or supplementary (S) suffix from end of SRF. */
export function stripReceivingReportSuffix(srf: string): string {
  const t = srf.trim()
  if (t.endsWith('A') || t.endsWith('R') || t.endsWith('S')) return t.slice(0, -1)
  return t
}

export function receivingReportSuffix(reportType: string): ReceivingReportSrfSuffix | null {
  if (reportType === 'Amendment Report' || reportType === RECEIVING_REPORT_TYPES[1]) return 'A'
  if (reportType === 'Revised Report') return 'R'
  if (reportType === 'Supplementary Report' || reportType === RECEIVING_REPORT_TYPES[2]) return 'S'
  return null
}

export function issueKindSrfSuffix(kind: 'amendment' | 'revised' | 'supplementary'): ReceivingReportSrfSuffix {
  if (kind === 'revised') return 'R'
  if (kind === 'supplementary') return 'S'
  return 'A'
}

/** Sample Code / QR stay as original — do not keep Amendment A / Revised R / Supplementary S. */
export function stripReceivingReportTypeFromCode(
  value: string | null | undefined,
  reportType: string | null | undefined,
): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return raw || null
  const suffix = receivingReportSuffix(reportType ?? '')
  if (suffix && raw.endsWith(suffix) && raw.length > suffix.length) return raw.slice(0, -suffix.length)
  return raw
}

/** Amendment → base + A; Revised → base + R; Supplementary → base + S */
export function buildReceivingSrfFromReference(baseSrf: string, reportType: string): string {
  const base = stripReceivingReportSuffix(baseSrf)
  if (!base) return ''
  const suffix = receivingReportSuffix(reportType)
  return suffix ? `${base}${suffix}` : base
}

export function nextSrfNumberWithReportSuffix(
  originalSrf: string,
  suffix: ReceivingReportSrfSuffix,
  existing: Iterable<string>,
): string {
  const taken = new Set([...existing].map((s) => s.trim()).filter(Boolean))
  const base = stripReceivingReportSuffix(originalSrf)
  const root = base || originalSrf.trim()
  const first = `${root}${suffix}`
  if (!taken.has(first)) return first
  let n = 2
  while (taken.has(`${root}${suffix}${n}`)) n += 1
  return `${root}${suffix}${n}`
}
