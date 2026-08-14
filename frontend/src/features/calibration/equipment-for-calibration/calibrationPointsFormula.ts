import type { EquipmentForCalibrationForm } from './types'
import type { CalibrationPointsColumn } from './types'
import {
  applyFormulaColumns,
  emptyColumnFormula,
  type RawDataColumnFormula,
  type RawDataSheetColumn,
  type RawDataSheetRowValues,
} from '@/features/calibration/rawDataSheetTypes'
import {
  masterEquipmentFormulaRefColumns,
  masterEquipmentFormulaRefValues,
  MASTER_FORMULA_REF_PREFIX,
  type MasterFormulaRefSource,
} from '@/features/calibration/masterEquipmentFormulaRefs'

/** @deprecated Prefer MASTER_FORMULA_REF_PREFIX */
export const EQUIPMENT_FORMULA_REF_PREFIX = MASTER_FORMULA_REF_PREFIX

export function equipmentFormulaRefColumns(): RawDataSheetColumn[] {
  return masterEquipmentFormulaRefColumns()
}

export function equipmentFormulaRefValues(
  form: EquipmentForCalibrationForm,
): RawDataSheetRowValues {
  return masterEquipmentFormulaRefValues(formToMasterFormulaRef(form))
}

function formToMasterFormulaRef(form: EquipmentForCalibrationForm): MasterFormulaRefSource {
  return {
    asset_code: form.assetCode,
    equipment_name: form.equipmentName,
    manufacturer: form.manufacturer,
    model_number: form.modelNumber,
    serial_number: form.serialNumber,
    current_location: form.currentLocation,
    range_capacity: [form.rangeCapacity, form.rangeCapacityUnit]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(' '),
    resolution_least_count: [form.resolutionLeastCount, form.resolutionLeastCountUnit]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(' '),
    accuracy_acceptance_criteria: form.accuracyAcceptanceCriteria,
    class_of_instrument: form.classOfInstrument,
    calibration_temperature: form.calibrationTemperature,
    calibration_humidity: form.calibrationHumidity,
    coefficient_of_thermal_expansion: form.coefficientOfThermalExpansion,
    calibration_certificate_uncertainty: form.calibrationCertificateUncertainty,
    calibration_coverage_factor: form.calibrationCoverageFactor,
    calibration_certificate_number: form.calibrationCertificateNumber,
  }
}

export function calibrationColumnToRaw(col: CalibrationPointsColumn): RawDataSheetColumn {
  const type = col.type || 'number'
  return {
    key: col.id,
    label: col.header,
    type,
    required: type === 'formula' ? false : Boolean(col.required),
    ...(type === 'formula' ? { formula: col.formula ?? emptyColumnFormula() } : {}),
  }
}

export function rawColumnToCalibration(col: RawDataSheetColumn): CalibrationPointsColumn {
  return {
    id: col.key,
    header: col.label,
    type: col.type,
    required: col.type === 'formula' ? false : col.required,
    ...(col.type === 'formula'
      ? { formula: col.formula ?? emptyColumnFormula() }
      : {}),
  }
}

/** Evaluate formula columns using a master equipment field source (range points viewer). */
export function computeCalibrationPointRowValuesFromMaster(
  columns: CalibrationPointsColumn[],
  rowValues: Record<string, string>,
  master: MasterFormulaRefSource | null | undefined,
  decimalPlaces = 2,
): Record<string, string> {
  const rawCols = columns.map(calibrationColumnToRaw)
  const eqCols = masterEquipmentFormulaRefColumns()
  const allCols = [...rawCols, ...eqCols]
  const merged: RawDataSheetRowValues = {
    ...rowValues,
    ...masterEquipmentFormulaRefValues(master),
  }
  const next = applyFormulaColumns(allCols, merged, decimalPlaces, null, master)
  const out: Record<string, string> = { ...rowValues }
  for (const col of columns) {
    if (col.type === 'formula') {
      out[col.id] = next[col.id] ?? ''
    }
  }
  return out
}

/** Evaluate all formula columns for one points row (includes equipment field refs). */
export function computeCalibrationPointRowValues(
  columns: CalibrationPointsColumn[],
  rowValues: Record<string, string>,
  form: EquipmentForCalibrationForm,
  decimalPlaces = 2,
): Record<string, string> {
  return computeCalibrationPointRowValuesFromMaster(
    columns,
    rowValues,
    formToMasterFormulaRef(form),
    decimalPlaces,
  )
}

export function patchCalibrationColumnFormula(
  col: CalibrationPointsColumn,
  patch: Partial<RawDataColumnFormula>,
): CalibrationPointsColumn {
  const formula = { ...(col.formula ?? emptyColumnFormula()), ...patch }
  return { ...col, type: 'formula', required: false, formula }
}

/** Bake calculated column values into rows before DB save (downstream seeding). */
export function withComputedCalibrationPointFormulas(
  form: EquipmentForCalibrationForm,
): EquipmentForCalibrationForm {
  if (!form.calibrationPointsColumns.some((c) => c.type === 'formula')) return form
  return {
    ...form,
    calibrationPoints: form.calibrationPoints.map((row) => ({
      ...row,
      values: {
        ...row.values,
        ...computeCalibrationPointRowValues(
          form.calibrationPointsColumns,
          row.values,
          form,
        ),
      },
    })),
  }
}
