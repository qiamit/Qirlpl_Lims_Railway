import { formatDateTime } from '@/lib/utils'

/** Date/time shown on digital signature stamps. Uses Report Issue Date when available. */
export function formatReportIssueStamp(issuedAtIso?: string | null): string {
  const raw = issuedAtIso?.trim()
  if (raw) return formatDateTime(raw)
  return formatDateTime(new Date().toISOString())
}

export function digitalSignatureStampFields(
  sig: { roleLabel: string; name: string; designation: string },
  issuedAtIso?: string | null,
): {
  roleLabel: string
  name: string
  designation: string
  issueStamp: string
} {
  return {
    roleLabel: sig.roleLabel.trim(),
    name: sig.name.trim() || '—',
    designation: sig.designation.trim() || '—',
    issueStamp: formatReportIssueStamp(issuedAtIso),
  }
}
