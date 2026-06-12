import type { TestAllocationRow } from '../types'

export type HiddenSrfDiagnosticReason =
  | 'legacy_results_review'
  | 'visibility_rules'
  | 'assignment_filter'

export type HiddenSrfDiagnosticEntry = {
  sampleId: string
  srfNumber: string
  stage: string | null
  sectionCodes: string[]
  reasons: HiddenSrfDiagnosticReason[]
  /** True when the SRF still appears in the loaded table (warning only). */
  isVisibleInTable: boolean
}

export type SampleUnderTestingLoadDiagnostics = {
  totalSentSections: number
  totalSentSrfs: number
  visibleSectionsAfterVisibility: number
  visibleSrfsAfterVisibility: number
  entries: HiddenSrfDiagnosticEntry[]
}

const REASON_LABELS: Record<HiddenSrfDiagnosticReason, string> = {
  legacy_results_review:
    'Results Under Review stage without a reviewer on any section — assign a reviewer or check refer-back.',
  visibility_rules: 'Filtered out by Sample Under Testing visibility rules.',
  assignment_filter: 'Hidden because Only my assignments is on — uncheck it to see all sent sections.',
}

export function diagnosticReasonLabel(reason: HiddenSrfDiagnosticReason): string {
  return REASON_LABELS[reason]
}

type VisibilityHiddenSection = {
  sampleId: string
  srfNumber: string | null
  stage: string | null
  sectionCode: string
}

type BuildLoadDiagnosticsInput = {
  testAllocs: { id: string; sample_allocation_id: string }[]
  visibleRows: TestAllocationRow[]
  legacyResultsReviewSampleIds: Set<string>
  visibilityHiddenSections: VisibilityHiddenSection[]
  sampleIdBySampleAllocationId: Map<string, string>
  allocations: { id: string; sample_id: string; section_code: string }[]
  samplesById: Map<string, { srf_number?: string | null; stage?: string | null }>
}

function uniqueSampleIdsFromTestAllocs(
  testAllocs: { sample_allocation_id: string }[],
  sampleIdBySampleAllocationId: Map<string, string>,
): Set<string> {
  const ids = new Set<string>()
  for (const ta of testAllocs) {
    const sampleId = sampleIdBySampleAllocationId.get(ta.sample_allocation_id)?.trim()
    if (sampleId) ids.add(sampleId)
  }
  return ids
}

function groupSectionsBySample(
  sections: VisibilityHiddenSection[],
): Map<string, { srfNumber: string; stage: string | null; sectionCodes: string[] }> {
  const map = new Map<string, { srfNumber: string; stage: string | null; sectionCodes: string[] }>()
  for (const s of sections) {
    const sampleId = s.sampleId.trim()
    if (!sampleId) continue
    if (!map.has(sampleId)) {
      map.set(sampleId, {
        srfNumber: s.srfNumber?.trim() || sampleId,
        stage: s.stage ?? null,
        sectionCodes: [],
      })
    }
    const entry = map.get(sampleId)!
    const code = s.sectionCode.trim()
    if (code && !entry.sectionCodes.includes(code)) entry.sectionCodes.push(code)
  }
  return map
}

function upsertEntry(
  map: Map<string, HiddenSrfDiagnosticEntry>,
  entry: HiddenSrfDiagnosticEntry,
): void {
  const existing = map.get(entry.sampleId)
  if (!existing) {
    map.set(entry.sampleId, {
      ...entry,
      reasons: [...entry.reasons],
      sectionCodes: [...entry.sectionCodes],
    })
    return
  }
  existing.reasons = [...new Set([...existing.reasons, ...entry.reasons])]
  existing.sectionCodes = [...new Set([...existing.sectionCodes, ...entry.sectionCodes])]
  existing.isVisibleInTable = existing.isVisibleInTable || entry.isVisibleInTable
  if (!existing.srfNumber || existing.srfNumber === existing.sampleId) {
    existing.srfNumber = entry.srfNumber
  }
  if (!existing.stage && entry.stage) existing.stage = entry.stage
}

export function buildLoadDiagnostics(input: BuildLoadDiagnosticsInput): SampleUnderTestingLoadDiagnostics {
  const sentSampleIds = uniqueSampleIdsFromTestAllocs(
    input.testAllocs,
    input.sampleIdBySampleAllocationId,
  )
  const visibleSampleIds = new Set(
    input.visibleRows.map((r) => r.sampleId?.trim()).filter(Boolean) as string[],
  )

  const entriesBySample = new Map<string, HiddenSrfDiagnosticEntry>()

  for (const [sampleId, grouped] of groupSectionsBySample(input.visibilityHiddenSections)) {
    upsertEntry(entriesBySample, {
      sampleId,
      srfNumber: grouped.srfNumber,
      stage: grouped.stage,
      sectionCodes: grouped.sectionCodes,
      reasons: ['visibility_rules'],
      isVisibleInTable: false,
    })
  }

  for (const sampleId of input.legacyResultsReviewSampleIds) {
    if (!sentSampleIds.has(sampleId)) continue
    const sample = input.samplesById.get(sampleId)
    const sectionCodes = input.allocations
      .filter((a) => a.sample_id === sampleId)
      .map((a) => a.section_code.trim())
      .filter(Boolean)
    upsertEntry(entriesBySample, {
      sampleId,
      srfNumber: sample?.srf_number?.trim() || sampleId,
      stage: sample?.stage ?? null,
      sectionCodes: [...new Set(sectionCodes)],
      reasons: ['legacy_results_review'],
      isVisibleInTable: visibleSampleIds.has(sampleId),
    })
  }

  return {
    totalSentSections: input.testAllocs.length,
    totalSentSrfs: sentSampleIds.size,
    visibleSectionsAfterVisibility: input.visibleRows.length,
    visibleSrfsAfterVisibility: visibleSampleIds.size,
    entries: [...entriesBySample.values()],
  }
}

export function buildAssignmentFilterHiddenEntries(
  allRows: TestAllocationRow[],
  visibleRows: TestAllocationRow[],
): HiddenSrfDiagnosticEntry[] {
  const visibleSampleIds = new Set(
    visibleRows.map((r) => r.sampleId?.trim()).filter(Boolean) as string[],
  )
  const bySample = new Map<string, HiddenSrfDiagnosticEntry>()

  for (const row of allRows) {
    const sampleId = row.sampleId?.trim()
    if (!sampleId || visibleSampleIds.has(sampleId)) continue
    upsertEntry(bySample, {
      sampleId,
      srfNumber: row.srfNumber?.trim() || sampleId,
      stage: row.sampleStage ?? null,
      sectionCodes: row.sectionCode?.trim() ? [row.sectionCode.trim()] : [],
      reasons: ['assignment_filter'],
      isVisibleInTable: false,
    })
  }

  return [...bySample.values()]
}

export function mergeDiagnosticEntries(
  base: SampleUnderTestingLoadDiagnostics,
  extra: HiddenSrfDiagnosticEntry[],
): SampleUnderTestingLoadDiagnostics {
  const entriesBySample = new Map<string, HiddenSrfDiagnosticEntry>()
  for (const entry of base.entries) upsertEntry(entriesBySample, entry)
  for (const entry of extra) upsertEntry(entriesBySample, entry)
  return {
    ...base,
    entries: [...entriesBySample.values()],
  }
}

export function partitionDiagnosticEntries(entries: HiddenSrfDiagnosticEntry[]): {
  hidden: HiddenSrfDiagnosticEntry[]
  notices: HiddenSrfDiagnosticEntry[]
} {
  const hidden: HiddenSrfDiagnosticEntry[] = []
  const notices: HiddenSrfDiagnosticEntry[] = []
  for (const entry of entries) {
    if (entry.isVisibleInTable) notices.push(entry)
    else hidden.push(entry)
  }
  return { hidden, notices }
}
