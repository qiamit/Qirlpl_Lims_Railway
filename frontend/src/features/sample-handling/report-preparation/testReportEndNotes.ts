/** Standard disclaimer shown at the end of Part C — Test Results */
export const TEST_REPORT_END_MARKER = '------ End Report-----'

export const TEST_REPORT_END_NOTES: readonly string[] = [
  'Test Results Related only to the Parameter Tested.',
  'This Report shall not be Reproduced Except in Full without Prior Permission of the Laboratory.',
  'The Report can not be used as Evidence in the Court of Law without Written Approval of Laboratory.',
] as const

/**
 * Single paragraph for display / print (1. … :: 2. … :: 3. …).
 * When the SRF has a decision rule (ISO 17025 7.8.6) its statement is added as
 * the next numbered note; without one the text is unchanged.
 */
export function formatTestReportEndNotesText(decisionRuleStatement?: string | null): string {
  const statement = decisionRuleStatement?.trim()
  const notes = statement ? [...TEST_REPORT_END_NOTES, statement] : TEST_REPORT_END_NOTES
  return notes.map((line, i) => `${i + 1}. ${line}`).join(' :: ')
}
