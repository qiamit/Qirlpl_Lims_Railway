export type EquipmentStatus = 'Active' | 'Inactive'

export type EquipmentRow = {
  id: string
  equipment_name: string
  equipment_code: string
  status: EquipmentStatus
  make: string | null
  model_serial_no: string | null
  least_count: string | null
  range_of_instrument: string | null
  location: string | null
  placed_date: string | null
  uncertainty_mu: number | null
  acceptance_criteria: number | null
  remarks: string | null
  calibration_link: string | null
  intermediate_link: string | null
  created_at?: string
}

export type EquipmentForm = {
  equipmentName: string
  equipmentCode: string
  status: EquipmentStatus
  make: string
  modelSerialNo: string
  leastCount: string
  rangeOfInstrument: string
  location: string
  placedDate: string
  uncertaintyMu: string
  acceptanceCriteria: string
  remarks: string
}

export const emptyEquipmentForm = (): EquipmentForm => ({
  equipmentName: '',
  equipmentCode: '',
  status: 'Active',
  make: '',
  modelSerialNo: '',
  leastCount: '',
  rangeOfInstrument: '',
  location: 'Mechanical',
  placedDate: '',
  uncertaintyMu: '',
  acceptanceCriteria: '',
  remarks: '',
})

export const normalizeText = (value: string) => value.trim()

export const isValidNumberOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isFinite(n)
}
