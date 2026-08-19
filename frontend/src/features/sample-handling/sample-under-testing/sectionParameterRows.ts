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

export type SectionParameterEntry = {
  paramRowId: string | null
  testParameterId: string | null
  testLabel: string
  clauseNo: string | null
  isCodeLabel: string | null
  unitValue: string | null
  sectionSpecOverride: string | null
  specificRequirement: string | null
  testStartDate: string | null
  testEndDate: string | null
  results: string | null
}

export function mergeSectionDraftPreservingEdits(
  prev: SectionParameterEntry[],
  next: SectionParameterEntry[],
): SectionParameterEntry[] {
  if (prev.length === 0) return next
  return next.map((n) => {
    const match = prev.find((p) => {
      if (p.paramRowId && n.paramRowId && p.paramRowId === n.paramRowId) return true
      if (p.testParameterId && n.testParameterId && p.testParameterId === n.testParameterId) {
        return true
      }
      return p.testLabel.trim().toLowerCase() === n.testLabel.trim().toLowerCase()
    })
    if (!match) return n
    return {
      ...n,
      results: match.results,
      testStartDate: match.testStartDate,
      testEndDate: match.testEndDate,
    }
  })
}

export function getSectionParametersForEntry(row: TestAllocationRow): SectionParameterEntry[] {
  const params = sortParametersByClause(row.parameters ?? [])
  if (params.length > 0) {
    return params.map((p) => ({
      paramRowId: p.id && !p.id.startsWith('local-') ? p.id : null,
      testParameterId: p.testParameterId,
      testLabel: p.testLabel,
      clauseNo: p.clauseNo ?? null,
      isCodeLabel: p.isCodeLabel ?? null,
      unitValue: p.unitValue ?? null,
      sectionSpecOverride: p.sectionSpecOverride ?? null,
      specificRequirement: p.specificRequirement ?? null,
      testStartDate: p.testStartDate ?? null,
      testEndDate: p.testEndDate ?? null,
      results: p.results ?? null,
    }))
  }
  const labels = parseSummaryLabels(row.testParameterSummary)
  const ids = row.testParameterIds ?? []
  if (labels.length === 0) {
    return [
      {
        paramRowId: null,
        testParameterId: null,
        testLabel: '-',
        clauseNo: null,
        isCodeLabel: null,
        unitValue: null,
        sectionSpecOverride: null,
        specificRequirement: null,
        testStartDate: row.testStartDate ?? null,
        testEndDate: row.testEndDate ?? null,
        results: row.results ?? null,
      },
    ]
  }
  return labels.map((label, i) => ({
    paramRowId: null,
    testParameterId: ids[i] ?? null,
    testLabel: label,
    clauseNo: null,
    isCodeLabel: null,
    unitValue: null,
    sectionSpecOverride: null,
    specificRequirement: null,
    testStartDate: row.testStartDate ?? null,
    testEndDate: row.testEndDate ?? null,
    results: row.results ?? null,
  }))
}

export function countFilledResults(entries: SectionParameterEntry[]): { filled: number; total: number } {
  const total = entries.length
  const filled = entries.filter((e) => Boolean(e.results?.trim())).length
  return { filled, total }
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
