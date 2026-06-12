import type { AllocationRow } from '../types'

type AllocationRecordLite = {
  id: string
  sectionCode: string
  department: string | null
  designation: string | null
  sampleQuantity: string | null
}

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

/** List context for header QI Assistant. */
export function buildSampleAllocationListAssistantContext(
  rows: AllocationRow[],
  search: string,
  allocationRecords: AllocationRecordLite[],
): string {
  const lines = [
    'Module: Sample Allocation (Clause 7.4 — allocate received samples to lab sections)',
    `Total SRF rows loaded: ${rows.length}`,
    `Total section allocation records: ${allocationRecords.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Tables: samples, sample_allocations (section_code, department, designation, quantity), test_allocations.',
    'Each sample_allocations row has a database id (UUID). Use exact ids in lims_crud for update/delete.',
    'Edit is locked when a section code is already in Test Allocation until Referback is used.',
    'For one SRF, use the sparkle Ask AI button on that row.',
    '',
    'Allocated SRFs (up to 15):',
  ]

  const allocated = rows.filter((r) => r.allocationIds.length > 0)
  const pending = rows.filter((r) => r.allocationIds.length === 0)

  const allocatedSlice = allocated.slice(0, 15)
  if (allocatedSlice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of allocatedSlice) {
      const sections = allocationRecords.filter((rec) => r.allocationIds.includes(rec.id))
      const sectionDetail = sections
        .map(
          (s) =>
            `${s.sectionCode} [alloc_id=${s.id}, dept=${fmt(s.department)}, desig=${fmt(s.designation)}, qty=${fmt(s.sampleQuantity)}]`,
        )
        .join('; ')
      lines.push(
        `- sample_id=${r.sampleId} | SRF=${fmt(r.sample.srf_number)} | IS=${fmt(r.sample.test_report_is_code_label)} | sections: ${sectionDetail || '-'}`,
      )
    }
    if (allocated.length > 15) {
      lines.push(`… and ${allocated.length - 15} more allocated SRF rows not listed.`)
    }
  }

  lines.push('', 'Pending for Allocation (up to 15):')
  const pendingSlice = pending.slice(0, 15)
  if (pendingSlice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of pendingSlice) {
      lines.push(
        `- sample_id=${r.sampleId} | SRF=${fmt(r.sample.srf_number)} | IS=${fmt(r.sample.test_report_is_code_label)} | awaiting section codes`,
      )
    }
    if (pending.length > 15) {
      lines.push(`… and ${pending.length - 15} more pending SRF rows not listed.`)
    }
  }

  return lines.join('\n')
}

/** Row-level context for per-SRF QI Assistant. */
export function buildSampleAllocationRowAssistantContext(
  row: AllocationRow,
  allocationRecords: AllocationRecordLite[],
): string {
  const sections = allocationRecords.filter((rec) => row.allocationIds.includes(rec.id))
  const lines = [
    'Module: Sample Allocation — single SRF assistant',
    `Sample id (UUID): ${row.sampleId}`,
    `SRF Number: ${fmt(row.sample.srf_number)}`,
    `IS Code: ${fmt(row.sample.test_report_is_code_label)}`,
    row.sample.test_report_is_code_id ? `Linked is_code_id: ${row.sample.test_report_is_code_id}` : '',
    `Referback from allocation: ${row.sample.referback_from_allocation ? 'yes (edit unlocked)' : 'no'}`,
    '',
    'Section allocations for this SRF (use sample_allocations id for lims_crud):',
  ]

  if (sections.length === 0) {
    lines.push('(none)')
  } else {
    for (const s of sections) {
      lines.push(
        `- id=${s.id} | section_code=${s.sectionCode} | department=${fmt(s.department)} | designation=${fmt(s.designation)} | quantity=${fmt(s.sampleQuantity)}`,
      )
    }
  }

  lines.push(
    '',
    'When updating allocation, use sample_allocations table with the section id above.',
    'Do not edit sections that are already in Test Allocation unless user has referred back.',
  )

  return lines.filter((line) => line.length > 0).join('\n')
}

export function formatSampleAllocationRowTitle(row: AllocationRow): string {
  const srf = row.sample.srf_number?.trim() || row.sample.sample_code?.trim() || 'SRF'
  const sections = row.sectionCodes.filter(Boolean).join(', ')
  return sections ? `${srf} — ${sections}` : srf
}
