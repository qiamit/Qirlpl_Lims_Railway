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

/** Block row actions when every section on this SRF is still in Test Allocation. */
export function areSampleAllocationActionsLocked(
  row: AllocationRow,
  sampleAllocationIdsWithTestAllocation: Set<string>,
): boolean {
  if (row.allocationIds.length === 0) return false
  if (row.sample.referback_from_allocation) return false

  const lockedSections = getSectionCodesInTestAllocation(row, sampleAllocationIdsWithTestAllocation)
  if (lockedSections.length === 0) return false
  // At least one section was referred back — allow Sample Allocation edit for the SRF
  if (lockedSections.length < row.sectionCodes.length) return false

  return true
}

/** Block edit when any section code on this SRF is used in Test Allocation (unless referback). */
export function isSampleAllocationEditLocked(
  row: AllocationRow,
  sampleAllocationIdsWithTestAllocation: Set<string>,
): boolean {
  return areSampleAllocationActionsLocked(row, sampleAllocationIdsWithTestAllocation)
}

export function sampleAllocationEditLockedTitle(lockedSectionCodes: string[]): string {
  if (lockedSectionCodes.length === 0) {
    return 'Actions locked: this SRF is in Test Allocation. Refer back from Test Allocation to unlock.'
  }
  return `Actions locked: all section code(s) (${lockedSectionCodes.join(', ')}) are still in Test Allocation. Refer back each section from Test Allocation to unlock edit.`
}
