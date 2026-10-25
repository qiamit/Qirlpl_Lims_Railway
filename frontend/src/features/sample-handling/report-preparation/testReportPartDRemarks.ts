/**
 * Line 1 — auto from SRF IS code (read-only in UI). legacyWording: reports
 * issued with the wording used until 23 Oct 2026 ("Confirms") print it again.
 */
export function formatPartDRemarksLine1(isCodeLabel?: string | null, legacyWording = false): string {
  const isRef = isCodeLabel?.trim() || 'the Applicable IS Standard'
  return `1. The Sample ${legacyWording ? 'Confirms' : 'Conforms'} to ${isRef} with Respect to Above Tests.`
}

const LINE1_PREFIX = '1. The Sample Conforms to'
/** Line 1 as worded until 23 Oct 2026; still in drafts and issued reports. */
const LEGACY_LINE1_PREFIX = '1. The Sample Confirms to'

/** Draft remarks with the old line 1 wording, reworded (used when a draft is opened). */
export function modernizePartDRemarks(stored: string): string {
  const lead = stored.length - stored.trimStart().length
  return stored.trimStart().startsWith(LEGACY_LINE1_PREFIX)
    ? stored.slice(0, lead) + LINE1_PREFIX + stored.slice(lead + LEGACY_LINE1_PREFIX.length)
    : stored
}

export function splitPartDRemarks(
  stored: string,
  isCodeLabel?: string | null,
  legacyWording = false,
): { line1: string; line2: string } {
  const line1 = formatPartDRemarksLine1(isCodeLabel, legacyWording)
  if (!stored.trim()) return { line1, line2: '' }

  // Saved with the old wording (issued before 23 Oct 2026): print line 1 as saved.
  const legacy = stored.trimStart()
  if (legacy.startsWith(LEGACY_LINE1_PREFIX)) {
    const newlineIdx = legacy.indexOf('\n')
    return newlineIdx > 0
      ? { line1: legacy.slice(0, newlineIdx), line2: legacy.slice(newlineIdx + 1) }
      : { line1: legacy, line2: '' }
  }

  if (stored.startsWith(LINE1_PREFIX) || stored.trimStart().startsWith(LINE1_PREFIX)) {
    const body = stored.startsWith(LINE1_PREFIX) ? stored : stored.trimStart()
    if (body === line1 || body === `${line1}\n`) return { line1, line2: '' }
    if (body.startsWith(`${line1}\n`)) {
      return { line1, line2: body.slice(line1.length + 1) }
    }
    const newlineIdx = body.indexOf('\n')
    if (newlineIdx > 0) {
      return { line1, line2: body.slice(newlineIdx + 1) }
    }
  }

  return { line1, line2: stored }
}

export function joinPartDRemarks(line1: string, line2: string): string {
  if (!line2.trim()) return line1.trim()
  return `${line1.trim()}\n${line2}`
}

/** @deprecated Use formatPartDRemarksLine1 */
export const formatPartDRemarksPlaceholder = formatPartDRemarksLine1
