import type { SampleRow } from '../types'
import { getSampleWorkflowStatusLabel } from '../sampleWorkflowStatus'

export type SampleReceivingSortKey =
  | 'srfDate'
  | 'clientName'
  | 'sampleCode'
  | 'isCode'
  | 'reportingDate'
  | 'status'

export function sortSampleReceivingRows(
  rows: SampleRow[],
  key: SampleReceivingSortKey,
  direction: 'asc' | 'desc',
): SampleRow[] {
  const mul = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'srfDate': {
        const da = a.date_of_sample_receiving ?? a.collection_date ?? ''
        const db = b.date_of_sample_receiving ?? b.collection_date ?? ''
        cmp = da.localeCompare(db)
        if (cmp === 0) {
          cmp = (a.srf_number ?? a.sample_code ?? '').localeCompare(
            b.srf_number ?? b.sample_code ?? '',
            undefined,
            { numeric: true },
          )
        }
        break
      }
      case 'clientName':
        cmp = (a.client_name ?? '').localeCompare(b.client_name ?? '', undefined, { numeric: true })
        break
      case 'sampleCode':
        cmp = (a.sample_code ?? a.sample_qr_code ?? '').localeCompare(
          b.sample_code ?? b.sample_qr_code ?? '',
          undefined,
          { numeric: true },
        )
        break
      case 'isCode':
        cmp = (a.test_report_is_code_label ?? '').localeCompare(
          b.test_report_is_code_label ?? '',
          undefined,
          { numeric: true },
        )
        break
      case 'reportingDate': {
        const da = a.tentative_date_required ?? a.tentative_date_by_lab ?? ''
        const db = b.tentative_date_required ?? b.tentative_date_by_lab ?? ''
        cmp = da.localeCompare(db)
        break
      }
      case 'status':
        cmp = getSampleWorkflowStatusLabel(a).localeCompare(getSampleWorkflowStatusLabel(b), undefined, {
          numeric: true,
        })
        break
    }
    return cmp * mul
  })
}
