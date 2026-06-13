export type PartCReportColumnKey =
  | 'srNo'
  | 'testName'
  | 'unit'
  | 'specifiedRequirement'
  | 'observedValue'
  | 'uncertainty'
  | 'remark'

export type PartCReportColumnVisibility = Record<PartCReportColumnKey, boolean>

export const PART_C_REPORT_COLUMN_DEFS: ReadonlyArray<{
  key: PartCReportColumnKey
  label: string
}> = [
  { key: 'srNo', label: 'Sr No' },
  { key: 'testName', label: 'Test Name' },
  { key: 'unit', label: 'Unit' },
  { key: 'specifiedRequirement', label: 'Specified Requirements' },
  { key: 'observedValue', label: 'Observed Value' },
  { key: 'uncertainty', label: 'Uncertainty' },
  { key: 'remark', label: 'Remark' },
]

export const DEFAULT_PART_C_REPORT_COLUMNS: PartCReportColumnVisibility = {
  srNo: true,
  testName: true,
  unit: true,
  specifiedRequirement: true,
  observedValue: true,
  uncertainty: true,
  remark: true,
}

export function parsePartCReportColumns(raw: unknown): PartCReportColumnVisibility {
  const out = { ...DEFAULT_PART_C_REPORT_COLUMNS }
  if (!raw || typeof raw !== 'object') return out

  const o = raw as Record<string, unknown>
  for (const col of PART_C_REPORT_COLUMN_DEFS) {
    if (typeof o[col.key] === 'boolean') {
      out[col.key] = o[col.key]
    }
  }

  const anyVisible = PART_C_REPORT_COLUMN_DEFS.some((col) => out[col.key])
  return anyVisible ? out : { ...DEFAULT_PART_C_REPORT_COLUMNS }
}

export function visiblePartCReportColumns(
  columns: PartCReportColumnVisibility,
): Array<(typeof PART_C_REPORT_COLUMN_DEFS)[number]> {
  return PART_C_REPORT_COLUMN_DEFS.filter((col) => columns[col.key])
}
