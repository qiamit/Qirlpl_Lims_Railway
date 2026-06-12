import type { TestAllocationRow } from '../types'

export type TestAllocationSortKey =
  | 'srfSection'
  | 'isCode'
  | 'testParameters'
  | 'employeeName'

export function sortTestAllocationRows(
  rows: TestAllocationRow[],
  key: TestAllocationSortKey,
  direction: 'asc' | 'desc',
): TestAllocationRow[] {
  const mul = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'srfSection': {
        cmp = (a.srfNumber ?? '').localeCompare(b.srfNumber ?? '', undefined, { numeric: true })
        if (cmp === 0) {
          cmp = (a.sectionCode ?? '').localeCompare(b.sectionCode ?? '', undefined, { numeric: true })
        }
        break
      }
      case 'isCode':
        cmp = (a.isCodeLabel ?? '').localeCompare(b.isCodeLabel ?? '', undefined, { numeric: true })
        break
      case 'testParameters':
        cmp = (a.testParameterSummary ?? '').localeCompare(b.testParameterSummary ?? '', undefined, {
          numeric: true,
        })
        break
      case 'employeeName':
        cmp = (a.assignedEmployeeName ?? '').localeCompare(b.assignedEmployeeName ?? '', undefined, {
          numeric: true,
        })
        break
    }
    return cmp * mul
  })
}

export function isPendingTestAllocationRow(row: TestAllocationRow): boolean {
  if (row.sentForTesting) return false
  if (!row.testAllocationId) return true
  const hasParams =
    (row.testParameterSummary ?? '').trim().length > 0 || (row.testParameterIds?.length ?? 0) > 0
  return !hasParams
}

export function isPendingTestingRow(row: TestAllocationRow): boolean {
  if (row.sentForTesting) return false
  return !isPendingTestAllocationRow(row)
}

export function groupRowsBySrf(rows: TestAllocationRow[]): TestAllocationRow[][] {
  const order: string[] = []
  const groups = new Map<string, TestAllocationRow[]>()
  rows.forEach((row) => {
    const key = row.sampleId?.trim() || row.srfNumber?.trim() || row.sampleAllocationId
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(row)
  })
  return order.map((key) => groups.get(key)!)
}
