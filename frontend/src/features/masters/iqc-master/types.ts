import type {
  MaintenanceChecklistItem,
  MaintenanceHistoryRecord,
} from '../equipment-master/types'
import type {
  CalibrationPointsColumn,
  CalibrationPointRow,
  CalibrationPointsStored,
} from '@/features/calibration/equipment-for-calibration/types'
import { parseCalibrationPointsTable } from '@/features/calibration/equipment-for-calibration/types'

export type EquipmentStatus = 'Active' | 'In Repair' | 'Idle'

export type Frequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half Yearly' | 'Yearly' | ''

export type { MaintenanceChecklistItem, MaintenanceHistoryRecord }
export type { CalibrationPointsColumn, CalibrationPointRow, CalibrationPointsStored }

/** @deprecated Legacy fixed-column shape; prefer CalibrationPointsStored. */
export type CalibrationPoint = {
  id: string
  nominalValue: string
  actualValue: string
  correction: string
  uncertainty: string
}

export type IqcRow = {
  id: string
  asset_code: string
  equipment_name: string
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  date_of_purchase: string | null
  purchased_from: string | null
  date_placed_in_service: string | null
  current_location: string | null
  equipment_status: string | null
  range_capacity: string | null
  resolution_least_count: string | null
  accuracy_acceptance_criteria: string | null
  calibration_frequency: string | null
  last_calibration_date: string | null
  next_calibration_due: string | null
  calibration_certificate_number: string | null
  calibration_temperature: string | null
  calibration_humidity: string | null
  external_calibration_agency: string | null
  intermediate_check_frequency: string | null
  last_intermediate_check_date: string | null
  next_intermediate_check_date: string | null
  intermediate_check_result: string | null
  maintenance_schedule_frequency: string | null
  last_maintenance_date: string | null
  next_maintenance_date: string | null
  maintenance_done_by: string | null
  maintenance_checklist: MaintenanceChecklistItem[] | null
  maintenance_history: MaintenanceHistoryRecord[] | null
  history_of_damage: string | null
  upload_certificate_path: string | null
  upload_manual_sop_path: string | null
  custodian_employee_id: string | null
  /** Flexible table `{ columns, rows }` or legacy point array. */
  calibration_points: CalibrationPointsStored | CalibrationPoint[] | null
  created_at?: string
  updated_at?: string
}

export type IqcForm = {
  assetCode: string
  equipmentName: string
  manufacturer: string
  modelNumber: string
  serialNumber: string
  dateOfPurchase: string
  purchasedFrom: string
  datePlacedInService: string
  currentLocation: string
  equipmentStatus: EquipmentStatus
  rangeCapacity: string
  rangeCapacityUnit: string
  resolutionLeastCount: string
  resolutionLeastCountUnit: string
  accuracyAcceptanceCriteria: string
  accuracyAcceptanceCriteriaUnit: string
  calibrationFrequency: Frequency
  lastCalibrationDate: string
  nextCalibrationDue: string
  calibrationCertificateNumber: string
  calibrationTemperature: string
  calibrationHumidity: string
  externalCalibrationAgency: string
  intermediateCheckFrequency: Frequency
  lastIntermediateCheckDate: string
  nextIntermediateCheckDate: string
  intermediateCheckResult: string
  maintenanceScheduleFrequency: Frequency
  lastMaintenanceDate: string
  nextMaintenanceDate: string
  maintenanceDoneBy: string
  maintenanceChecklist: MaintenanceChecklistItem[]
  maintenanceHistory: MaintenanceHistoryRecord[]
  historyOfDamage: string
  uploadCertificatePath: string
  uploadManualSopPath: string
  custodianEmployeeId: string
  certificateFile: File | null
  manualSopFile: File | null
  calibrationPointsColumns: CalibrationPointsColumn[]
  calibrationPoints: CalibrationPointRow[]
}

export const emptyIqcForm = (): IqcForm => ({
  assetCode: '',
  equipmentName: '',
  manufacturer: '',
  modelNumber: '',
  serialNumber: '',
  dateOfPurchase: '',
  purchasedFrom: '',
  datePlacedInService: '',
  currentLocation: '',
  equipmentStatus: 'Active',
  rangeCapacity: '',
  rangeCapacityUnit: '',
  resolutionLeastCount: '',
  resolutionLeastCountUnit: '',
  accuracyAcceptanceCriteria: '',
  accuracyAcceptanceCriteriaUnit: '',
  calibrationFrequency: '',
  lastCalibrationDate: '',
  nextCalibrationDue: '',
  calibrationCertificateNumber: '',
  calibrationTemperature: '',
  calibrationHumidity: '',
  externalCalibrationAgency: '',
  intermediateCheckFrequency: '',
  lastIntermediateCheckDate: '',
  nextIntermediateCheckDate: '',
  intermediateCheckResult: '',
  maintenanceScheduleFrequency: '',
  lastMaintenanceDate: '',
  nextMaintenanceDate: '',
  maintenanceDoneBy: '',
  maintenanceChecklist: [],
  maintenanceHistory: [],
  historyOfDamage: '',
  uploadCertificatePath: '',
  uploadManualSopPath: '',
  custodianEmployeeId: '',
  certificateFile: null,
  manualSopFile: null,
  calibrationPointsColumns: [],
  calibrationPoints: [],
})

export const normalizeText = (value: string) => value.trim()

export function calculateNextDueDate(lastDateStr: string, frequency: Frequency): string {
  if (!lastDateStr || !frequency) return ''
  const date = new Date(lastDateStr)
  if (Number.isNaN(date.getTime())) return ''
  
  if (date.getFullYear() > 9999) {
    date.setFullYear(date.getFullYear() % 10000)
  }

  switch (frequency) {
    case 'Daily':
      date.setDate(date.getDate() + 1)
      break
    case 'Weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'Monthly':
      date.setMonth(date.getMonth() + 1)
      break
    case 'Quarterly':
      date.setMonth(date.getMonth() + 3)
      break
    case 'Half Yearly':
      date.setMonth(date.getMonth() + 6)
      break
    case 'Yearly':
      date.setMonth(date.getMonth() + 12)
      break
    default:
      return ''
  }

  return date.toISOString().split('T')[0]
}

export function sanitizeDateStr(dateStr: string | null | undefined): string {
  if (!dateStr?.trim()) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  if (date.getFullYear() > 9999) {
    date.setFullYear(date.getFullYear() % 10000)
  }
  return date.toISOString().split('T')[0]
}

export function isCalibrationApplicable(row: IqcRow): boolean {
  const pointsTable = parseCalibrationPointsTable(row.calibration_points)
  return !!(
    row.calibration_frequency?.trim() ||
    row.last_calibration_date?.trim() ||
    row.next_calibration_due?.trim() ||
    row.calibration_certificate_number?.trim() ||
    row.external_calibration_agency?.trim() ||
    row.upload_certificate_path?.trim() ||
    pointsTable.columns.length > 0
  )
}

export function isIntermediateCheckApplicable(row: IqcRow): boolean {
  return !!(
    row.intermediate_check_frequency?.trim() ||
    row.last_intermediate_check_date?.trim() ||
    row.next_intermediate_check_date?.trim() ||
    row.intermediate_check_result?.trim()
  )
}

export function isMaintenanceApplicable(row: IqcRow): boolean {
  return !!(
    row.maintenance_schedule_frequency?.trim() ||
    row.last_maintenance_date?.trim() ||
    row.next_maintenance_date?.trim() ||
    row.maintenance_done_by?.trim() ||
    (Array.isArray(row.maintenance_checklist) && row.maintenance_checklist.length > 0) ||
    (Array.isArray(row.maintenance_history) && row.maintenance_history.length > 0)
  )
}
