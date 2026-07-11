import type { MaintenanceHistoryRecord } from './maintenanceHistory'
import type { IntermediateCheckHistoryRecord } from './intermediateCheckHistory'

export type EquipmentStatus = 'Active' | 'In Repair' | 'Idle'

export type Frequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half Yearly' | 'Yearly' | ''

export type MaintenanceChecklistItem = {
  checkPoint: string
  status: 'OK' | 'Not OK'
  repairIfAny: string
}

export type { MaintenanceHistoryRecord } from './maintenanceHistory'
export type { IntermediateCheckHistoryRecord } from './intermediateCheckHistory'

export type EquipmentRow = {
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
  calibration_certificate_uncertainty: string | null
  calibration_uncertainty_unit: string | null
  calibration_coverage_factor: string | null
  external_calibration_agency: string | null
  intermediate_check_frequency: string | null
  last_intermediate_check_date: string | null
  next_intermediate_check_date: string | null
  intermediate_check_result: string | null
  intermediate_check_history: IntermediateCheckHistoryRecord[] | null
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
  created_at?: string
  updated_at?: string
}

export type EquipmentForm = {
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
  resolutionLeastCount: string
  accuracyAcceptanceCriteria: string
  calibrationFrequency: Frequency
  lastCalibrationDate: string
  nextCalibrationDue: string
  calibrationCertificateNumber: string
  calibrationCertificateUncertainty: string
  calibrationUncertaintyUnit: string
  calibrationCoverageFactor: string
  externalCalibrationAgency: string
  intermediateCheckFrequency: Frequency
  lastIntermediateCheckDate: string
  nextIntermediateCheckDate: string
  intermediateCheckResult: string
  intermediateCheckHistory: IntermediateCheckHistoryRecord[]
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
}

export const emptyEquipmentForm = (): EquipmentForm => ({
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
  resolutionLeastCount: '',
  accuracyAcceptanceCriteria: '',
  calibrationFrequency: '',
  lastCalibrationDate: '',
  nextCalibrationDue: '',
  calibrationCertificateNumber: '',
  calibrationCertificateUncertainty: '',
  calibrationUncertaintyUnit: '',
  calibrationCoverageFactor: '',
  externalCalibrationAgency: '',
  intermediateCheckFrequency: '',
  lastIntermediateCheckDate: '',
  nextIntermediateCheckDate: '',
  intermediateCheckResult: '',
  intermediateCheckHistory: [],
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
})

export const normalizeText = (value: string) => value.trim()

export function calculateNextDueDate(lastDateStr: string, frequency: Frequency): string {
  if (!lastDateStr || !frequency) return ''
  const date = new Date(lastDateStr)
  if (Number.isNaN(date.getTime())) return ''
  
  // Defensive check for accidental 6-digit years entered by user
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
