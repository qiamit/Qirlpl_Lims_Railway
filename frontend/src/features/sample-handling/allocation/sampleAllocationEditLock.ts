import type { AllocationRow } from '../types'

/** Section codes on this SRF that already have rows in Test Allocation. */
export function getSectionCodesInTestAllocation(
  row: AllocationRow,
  sampleAllocationIdsWithTestAllocation: Set<string>,
): string[] {
  const locked: string[] = []
  row.allocationIds.forEach((id, idx) => {
    if (sampleAllocationIdsWithTestAllocation.has(id)) {
      const code = row.sectionCodes[idx]?.trim()
      if (code) locked.push(code)
    }
  })
  return locked
}

/** Block edit when any section code on this SRF is used in Test Allocation (unless referback). */
export function isSampleAllocationEditLocked(
  row: AllocationRow,
  sampleAllocationIdsWithTestAllocation: Set<string>,
): boolean {
  if (row.sample.referback_from_allocation) return false
  return getSectionCodesInTestAllocation(row, sampleAllocationIdsWithTestAllocation).length > 0
}

export function sampleAllocationEditLockedTitle(lockedSectionCodes: string[]): string {
  if (lockedSectionCodes.length === 0) {
    return 'Edit locked: this SRF was sent to Test Allocation. Use Refer back to Sample Receiving to return it here.'
  }
  return `Edit locked: section code(s) ${lockedSectionCodes.join(', ')} are in Test Allocation. Use Refer back to Sample Receiving to unlock.`
}
