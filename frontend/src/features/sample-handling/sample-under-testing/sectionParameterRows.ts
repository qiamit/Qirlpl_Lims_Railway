import { compareClauseNumbers } from '../report-preparation/clauseNumberSort'
import type { TestAllocationParameterRow, TestAllocationRow } from '../types'

export function sortParametersByClause<T extends Pick<TestAllocationParameterRow, 'clauseNo' | 'testLabel'>>(
  params: T[],
): T[] {
  return [...params].sort((a, b) => {
    const clauseCmp = compareClauseNumbers(a.clauseNo, b.clauseNo)
    if (clauseCmp !== 0) return clauseCmp
    return a.testLabel.localeCompare(b.testLabel, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

function parseSummaryLabels(summary: string | null | undefined): string[] {
  const s = summary?.trim() ?? ''
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

/** First row under a section code (shows referback / send-for-review actions). */
export function isFirstSectionParameterRow(
  row: TestAllocationRow,
  paramRowId: string | null,
  testLabel: string,
): boolean {
  const params = sortParametersByClause(row.parameters ?? [])
  if (params.length > 0) {
    const first = params[0]
    if (paramRowId && first.id && !first.id.startsWith('local-')) return first.id === paramRowId
    return first.testLabel === testLabel
  }
  const labels = parseSummaryLabels(row.testParameterSummary)
  if (labels.length === 0) return true
  return labels[0] === testLabel
}

export function listSectionParameterTargets(
  row: TestAllocationRow,
): Array<{ paramRowId: string | null; testLabel: string }> {
  const params = sortParametersByClause(row.parameters ?? [])
  if (params.length > 0) {
    return params.map((p) => ({
      paramRowId: p.id && !p.id.startsWith('local-') ? p.id : null,
      testLabel: p.testLabel,
    }))
  }
  const labels = parseSummaryLabels(row.testParameterSummary)
  if (labels.length === 0) return [{ paramRowId: null, testLabel: '-' }]
  return labels.map((label) => ({ paramRowId: null, testLabel: label }))
}
