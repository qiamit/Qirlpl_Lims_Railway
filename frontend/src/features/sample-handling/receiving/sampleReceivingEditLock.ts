import type { SampleRow } from '../types'

/** Block Sample Receiving edit when SRF exists in Sample Allocation until unlocked or referback. */
export function isSampleReceivingEditLocked(
  row: SampleRow,
  sampleIdsInAllocation: Set<string>,
): boolean {
  if (row.sample_receiving_edit_unlocked) return false
  if (row.referback_from_allocation) return false
  return sampleIdsInAllocation.has(row.id)
}

export const SAMPLE_RECEIVING_EDIT_LOCKED_TITLE =
  'Edit locked: this SRF is in Sample Allocation. Unlock edit from Test Report Prepare (Part A).'
