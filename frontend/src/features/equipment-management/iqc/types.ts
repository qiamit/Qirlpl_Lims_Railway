import {
  isCalibrationApplicable,
  isIntermediateCheckApplicable,
  isMaintenanceApplicable,
  type IqcRow,
} from '@/features/masters/iqc-master/types'
import type { EquipmentForCalibrationRow } from '@/features/calibration/equipment-for-calibration/types'

export type IqcListSource = 'testing' | 'calibration'

export const IQC_SOURCE_LABELS: Record<IqcListSource, string> = {
  testing: 'Testing',
  calibration: 'Calibration',
}

export type EquipmentsForIqcListRow = {
  key: string
  id: string
  source: IqcListSource
  assetCode: string
  equipmentName: string
  leastCount: string
  range: string
  location: string
  status: string
  nextCalibrationDue: string | null
  nextIntermediateCheckDate: string | null
  nextMaintenanceDate: string | null
  calibrationApplicable: boolean
  intermediateApplicable: boolean
  maintenanceApplicable: boolean
}

function hasScheduleSignal(
  frequency: string | null | undefined,
  last: string | null | undefined,
  next: string | null | undefined,
  extra?: string | null,
): boolean {
  return !!(frequency?.trim() || last?.trim() || next?.trim() || extra?.trim())
}

export function mapTestingIqcToListRow(row: IqcRow): EquipmentsForIqcListRow {
  return {
    key: `testing:${row.id}`,
    id: row.id,
    source: 'testing',
    assetCode: row.asset_code ?? '',
    equipmentName: row.equipment_name ?? '',
    leastCount: row.resolution_least_count?.trim() || '',
    range: row.range_capacity?.trim() || '',
    location: row.current_location?.trim() || '',
    status: row.equipment_status?.trim() || '',
    nextCalibrationDue: row.next_calibration_due,
    nextIntermediateCheckDate: row.next_intermediate_check_date,
    nextMaintenanceDate: row.next_maintenance_date,
    calibrationApplicable: isCalibrationApplicable(row),
    intermediateApplicable: isIntermediateCheckApplicable(row),
    maintenanceApplicable: isMaintenanceApplicable(row),
  }
}

export function mapCalibrationIqcToListRow(
  row: EquipmentForCalibrationRow,
): EquipmentsForIqcListRow {
  return {
    key: `calibration:${row.id}`,
    id: row.id,
    source: 'calibration',
    assetCode: row.asset_code ?? '',
    equipmentName: row.equipment_name ?? '',
    leastCount: row.resolution_least_count?.trim() || '',
    range: row.range_capacity?.trim() || '',
    location: row.current_location?.trim() || '',
    status: row.equipment_status?.trim() || '',
    nextCalibrationDue: row.next_calibration_due,
    nextIntermediateCheckDate: row.next_intermediate_check_date,
    nextMaintenanceDate: row.next_maintenance_date,
    calibrationApplicable: hasScheduleSignal(
      row.calibration_frequency,
      row.last_calibration_date,
      row.next_calibration_due,
      row.calibration_certificate_number,
    ),
    // Calibration IQC variant disables Intermediate Check UI
    intermediateApplicable: false,
    maintenanceApplicable: hasScheduleSignal(
      row.maintenance_schedule_frequency,
      row.last_maintenance_date,
      row.next_maintenance_date,
      row.maintenance_done_by,
    ),
  }
}
