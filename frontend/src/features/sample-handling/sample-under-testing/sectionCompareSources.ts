import {
  getReportedTestResult,
  parseReadingInput,
  parseTestResultValue,
} from './testResultValues'

export type SectionCompareSource = {
  id: string
  label: string
  value: number
  unit?: string
}

export function buildSectionCompareSources(
  items: Array<{
    paramKey: string
    testLabel: string
    results: string | null
    unit?: string | null
  }>,
  currentParamKey: string,
): SectionCompareSource[] {
  const sources: SectionCompareSource[] = []

  for (const item of items) {
    if (item.paramKey === currentParamKey) continue

    const unit = item.unit?.trim() || undefined
    const structured = parseTestResultValue(item.results ?? '')

    if (structured && structured.entries.length > 0) {
      structured.entries.forEach((entry, index) => {
        const entryLabel = entry.label?.trim() || `Reading ${index + 1}`
        sources.push({
          id: `${item.paramKey}:entry:${index}`,
          label: `${item.testLabel} · ${entryLabel}`,
          value: entry.value,
          unit: entry.unit?.trim() || unit,
        })
      })
    }

    const reportedRaw = getReportedTestResult(item.results)
    const reportedNum = parseReadingInput(reportedRaw)
    if (reportedNum !== null) {
      sources.push({
        id: `${item.paramKey}:reported`,
        label: `${item.testLabel} · Reported`,
        value: reportedNum,
        unit,
      })
    } else if (!structured) {
      const plain = parseReadingInput(item.results ?? '')
      if (plain !== null) {
        sources.push({
          id: `${item.paramKey}:plain`,
          label: item.testLabel,
          value: plain,
          unit,
        })
      }
    }
  }

  return sources
}

export function paramKeyFromRow(paramRowId: string | null, testLabel: string): string {
  return `${paramRowId ?? 'local'}:${testLabel}`
}
