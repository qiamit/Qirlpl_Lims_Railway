import type { SampleRow } from '../types'

/** Block Sample Receiving edit when SRF exists in Sample Allocation until referback. */
export function isSampleReceivingEditLocked(
  row: SampleRow,
  sampleIdsInAllocation: Set<string>,
): boolean {
  return sampleIdsInAllocation.has(row.id) && !row.referback_from_allocation
}

export const SAMPLE_RECEIVING_EDIT_LOCKED_TITLE =
  'Edit locked: this SRF is in Sample Allocation. Use Referback in Sample Allocation to unlock.'
