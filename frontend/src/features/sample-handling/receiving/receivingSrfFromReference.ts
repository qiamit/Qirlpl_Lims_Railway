import { RECEIVING_REPORT_TYPES } from '../types'

/** Strip amendment (A) or supplementary (S) suffix from end of SRF. */
export function stripReceivingReportSuffix(srf: string): string {
  const t = srf.trim()
  if (t.endsWith('A') || t.endsWith('S')) return t.slice(0, -1)
  return t
}

export function receivingReportSuffix(reportType: string): 'A' | 'S' | null {
  if (reportType === RECEIVING_REPORT_TYPES[1]) return 'A'
  if (reportType === RECEIVING_REPORT_TYPES[2]) return 'S'
  return null
}

/** Amendment → base + A; Supplementary → base + S */
export function buildReceivingSrfFromReference(baseSrf: string, reportType: string): string {
  const base = stripReceivingReportSuffix(baseSrf)
  if (!base) return ''
  const suffix = receivingReportSuffix(reportType)
  return suffix ? `${base}${suffix}` : base
}
