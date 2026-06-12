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

const LOCKED_ALLOCATION_STAGES = new Set(['test_allocation', 'under_testing', 'results_review'])

/** Block edit when any section code on this SRF is used in Test Allocation (unless referback). */
export function isSampleAllocationEditLocked(
  row: AllocationRow,
  sampleAllocationIdsWithTestAllocation: Set<string>,
): boolean {
  return areSampleAllocationActionsLocked(row, sampleAllocationIdsWithTestAllocation)
}

/** Block row actions for allocated SRFs until referback from Test Allocation. Pending rows stay unlocked. */
export function areSampleAllocationActionsLocked(
  row: AllocationRow,
  sampleAllocationIdsWithTestAllocation: Set<string>,
): boolean {
  if (row.allocationIds.length === 0) return false
  if (row.sample.referback_from_allocation) return false
  const stage = (row.sample.stage ?? '').trim().toLowerCase()
  if (LOCKED_ALLOCATION_STAGES.has(stage)) return true
  return getSectionCodesInTestAllocation(row, sampleAllocationIdsWithTestAllocation).length > 0
}

export function sampleAllocationEditLockedTitle(lockedSectionCodes: string[]): string {
  if (lockedSectionCodes.length === 0) {
    return 'Actions locked: this SRF is in Test Allocation. Refer back from Test Allocation to unlock.'
  }
  return `Actions locked: section code(s) ${lockedSectionCodes.join(', ')} are in Test Allocation. Refer back from Test Allocation to unlock.`
}
