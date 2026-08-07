import type { RawDataSheetColumn, RawDataSheetRowValues } from '@/features/calibration/rawDataSheetTypes'
import { parseCoefficientOfThermalExpansionNumeric } from '@/features/calibration/equipment-for-calibration/thermalExpansion'

/** Virtual formula refs for master / equipment-for-calibration fields (Raw Data + points). */
export const MASTER_FORMULA_REF_PREFIX = 'eq:'

export type MasterFormulaRefSource = {
  asset_code?: string | null
  equipment_name?: string | null
  manufacturer?: string | null
  model_number?: string | null
  serial_number?: string | null
  range_capacity?: string | null
  resolution_least_count?: string | null
  accuracy_acceptance_criteria?: string | null
  class_of_instrument?: string | null
  calibration_temperature?: string | null
  calibration_humidity?: string | null
  coefficient_of_thermal_expansion?: string | null
  calibration_certificate_uncertainty?: string | null
  calibration_coverage_factor?: string | null
  calibration_certificate_number?: string | null
}

type RefDef = {
  key: string
  label: string
  getValue: (m: MasterFormulaRefSource) => string
}

const MASTER_FORMULA_REFS: RefDef[] = [
  {
    key: `${MASTER_FORMULA_REF_PREFIX}asset_code`,
    label: 'Asset Code',
    getValue: (m) => m.asset_code ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}equipment_name`,
    label: 'Equipment Name',
    getValue: (m) => m.equipment_name ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}manufacturer`,
    label: 'Manufacturer',
    getValue: (m) => m.manufacturer ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}model_number`,
    label: 'Model Number',
    getValue: (m) => m.model_number ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}serial_number`,
    label: 'Serial Number',
    getValue: (m) => m.serial_number ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}range_capacity`,
    label: 'Range / Capacity',
    getValue: (m) => m.range_capacity ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}resolution_least_count`,
    label: 'Resolution / Least Count',
    getValue: (m) => m.resolution_least_count ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}accuracy`,
    label: 'Accuracy / Acceptance Criteria',
    getValue: (m) => m.accuracy_acceptance_criteria ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}class_of_instrument`,
    label: 'Class of Instrument',
    getValue: (m) => m.class_of_instrument ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}calibration_temperature`,
    label: 'Calibration Temperature',
    getValue: (m) => m.calibration_temperature ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}calibration_humidity`,
    label: 'Calibration Humidity',
    getValue: (m) => m.calibration_humidity ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}coefficient_of_thermal_expansion`,
    label: 'Coefficient of Thermal Expansion',
    getValue: (m) => {
      const n = parseCoefficientOfThermalExpansionNumeric(m.coefficient_of_thermal_expansion)
      return n == null ? '' : String(n)
    },
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}calibration_certificate_uncertainty`,
    label: 'Calibration Uncertainty',
    getValue: (m) => m.calibration_certificate_uncertainty ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}calibration_coverage_factor`,
    label: 'Coverage Factor (k)',
    getValue: (m) => m.calibration_coverage_factor ?? '',
  },
  {
    key: `${MASTER_FORMULA_REF_PREFIX}calibration_certificate_number`,
    label: 'Calibration Certificate Number',
    getValue: (m) => m.calibration_certificate_number ?? '',
  },
]

/** Virtual columns for formula autocomplete (Master badge). */
export function masterEquipmentFormulaRefColumns(): RawDataSheetColumn[] {
  return MASTER_FORMULA_REFS.map((r) => ({
    key: r.key,
    label: r.label,
    type: 'number',
    required: false,
  }))
}

export function masterEquipmentFormulaRefValues(
  master: MasterFormulaRefSource | null | undefined,
): RawDataSheetRowValues {
  const out: RawDataSheetRowValues = {}
  if (!master) return out
  for (const r of MASTER_FORMULA_REFS) {
    out[r.key] = String(r.getValue(master) ?? '').trim()
  }
  return out
}

export function isMasterFormulaRefKey(key: string): boolean {
  return key.startsWith(MASTER_FORMULA_REF_PREFIX)
}

/** Virtual refs for Selected Master Calibration Points table column headers. */
export const POINTS_FORMULA_REF_PREFIX = 'pt:'

function pointsHeaderSlug(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Unique column headers from selected masters' calibration points tables
 * (Nominal, Actual, Uncertainty, …) for formula autocomplete.
 */
export function masterPointsFormulaRefColumns(
  tables: Array<{ columns?: Array<{ header?: string | null }> | null } | null | undefined>,
): RawDataSheetColumn[] {
  const seen = new Set<string>()
  const out: RawDataSheetColumn[] = []
  for (const table of tables) {
    for (const col of table?.columns ?? []) {
      const header = String(col.header ?? '').trim()
      if (!header) continue
      const slug = pointsHeaderSlug(header)
      if (!slug) continue
      const key = `${POINTS_FORMULA_REF_PREFIX}${slug}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        label: header,
        type: 'number',
        required: false,
      })
    }
  }
  return out
}

/**
 * Resolve Points-column refs from the current sheet row by matching header → sheet column label.
 */
export function masterPointsFormulaRefValues(
  pointCols: RawDataSheetColumn[],
  sheetColumns: RawDataSheetColumn[],
  rowValues: RawDataSheetRowValues,
): RawDataSheetRowValues {
  const out: RawDataSheetRowValues = {}
  for (const pt of pointCols) {
    const needle = pt.label.trim().toLowerCase()
    if (!needle) continue
    const sheetCol =
      sheetColumns.find((c) => c.label.trim().toLowerCase() === needle) ??
      sheetColumns.find((c) => {
        const l = c.label.trim().toLowerCase()
        return l.includes(needle) || needle.includes(l)
      })
    if (sheetCol) {
      out[pt.key] = String(rowValues[sheetCol.key] ?? '').trim()
    }
  }
  return out
}

export function isPointsFormulaRefKey(key: string): boolean {
  return key.startsWith(POINTS_FORMULA_REF_PREFIX)
}
