import type { AllocationRow } from '../types'

export type SampleAllocationSortKey =
  | 'srfNumber'
  | 'date'
  | 'isCode'
  | 'sectionCode'
  | 'department'
  | 'quantity'

const joinList = (arr: string[]) => arr.filter(Boolean).join(', ')

export function sortSampleAllocationRows(
  rows: AllocationRow[],
  key: SampleAllocationSortKey,
  direction: 'asc' | 'desc',
): AllocationRow[] {
  const mul = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'srfNumber':
        cmp = (a.sample.srf_number ?? a.sample.sample_code ?? '').localeCompare(
          b.sample.srf_number ?? b.sample.sample_code ?? '',
          undefined,
          { numeric: true },
        )
        break
      case 'date':
        cmp = (a.sample.date_of_sample_receiving ?? a.sample.collection_date ?? '').localeCompare(
          b.sample.date_of_sample_receiving ?? b.sample.collection_date ?? '',
        )
        break
      case 'isCode':
        cmp = (a.sample.test_report_is_code_label ?? '').localeCompare(
          b.sample.test_report_is_code_label ?? '',
          undefined,
          { numeric: true },
        )
        break
      case 'sectionCode':
        cmp = joinList(a.sectionCodes).localeCompare(joinList(b.sectionCodes), undefined, { numeric: true })
        break
      case 'department':
        cmp = joinList(a.departments).localeCompare(joinList(b.departments), undefined, { numeric: true })
        break
      case 'quantity':
        cmp = joinList(a.quantities).localeCompare(joinList(b.quantities), undefined, { numeric: true })
        break
    }
    return cmp * mul
  })
}
