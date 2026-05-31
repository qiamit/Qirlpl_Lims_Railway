/** Line 1 — auto from SRF IS code (read-only in UI) */
export function formatPartDRemarksLine1(isCodeLabel?: string | null): string {
  const isRef = isCodeLabel?.trim() || 'the Applicable IS Standard'
  return `1. The Sample Confirms to ${isRef} with Respect to Above Tests.`
}

const LINE1_PREFIX = '1. The Sample Confirms to'

export function splitPartDRemarks(
  stored: string,
  isCodeLabel?: string | null,
): { line1: string; line2: string } {
  const line1 = formatPartDRemarksLine1(isCodeLabel)
  const trimmed = stored.trim()
  if (!trimmed) return { line1, line2: '' }

  if (trimmed.startsWith(LINE1_PREFIX)) {
    if (trimmed === line1) return { line1, line2: '' }
    if (trimmed.startsWith(`${line1}\n`)) {
      return { line1, line2: trimmed.slice(line1.length + 1).trim() }
    }
    const newlineIdx = trimmed.indexOf('\n')
    if (newlineIdx > 0) {
      return { line1, line2: trimmed.slice(newlineIdx + 1).trim() }
    }
  }

  return { line1, line2: trimmed }
}

export function joinPartDRemarks(line1: string, line2: string): string {
  const second = line2.trim()
  if (!second) return line1.trim()
  return `${line1.trim()}\n${second}`
}

/** @deprecated Use formatPartDRemarksLine1 */
export const formatPartDRemarksPlaceholder = formatPartDRemarksLine1
