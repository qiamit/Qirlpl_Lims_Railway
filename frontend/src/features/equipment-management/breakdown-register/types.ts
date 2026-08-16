export const EQUIPMENT_SOURCE_FILTERS = ['testing', 'calibration', 'iqc'] as const
export type EquipmentSourceFilter = (typeof EQUIPMENT_SOURCE_FILTERS)[number]

export const EQUIPMENT_SOURCES = ['testing', 'calibration', 'testing_iqc', 'calibration_iqc'] as const
export type EquipmentSource = (typeof EQUIPMENT_SOURCES)[number]

export function sourceFilterFromSource(source: string): EquipmentSourceFilter {
  if (source === 'testing_iqc' || source === 'calibration_iqc' || source === 'iqc') return 'iqc'
  if (source === 'calibration') return 'calibration'
  return 'testing'
}

export function matchesSourceFilter(
  source: EquipmentSource,
  filter: EquipmentSourceFilter,
): boolean {
  if (filter === 'iqc') return source === 'testing_iqc' || source === 'calibration_iqc'
  return source === filter
}

export function sourceLabel(source: string): string {
  switch (source) {
    case 'calibration':
      return 'Calibration'
    case 'testing_iqc':
      return 'Testing IQC'
    case 'calibration_iqc':
      return 'Calibration IQC'
    default:
      return 'Testing'
  }
}

export const BREAKDOWN_STATUSES = [
  'Open',
  'Under Repair',
  'Awaiting Verification',
  'Closed',
  'Scrapped',
] as const
export type BreakdownStatus = (typeof BREAKDOWN_STATUSES)[number]

export type EquipmentPickOption = {
  id: string
  source: EquipmentSource
  asset_code: string
  equipment_name: string
  manufacturer: string
  model_number: string
  serial_number: string
  current_location: string
  equipment_status: string
}

export type BreakdownRegisterRow = {
  id: string
  register_no: string
  equipment_source: EquipmentSource
  equipment_id: string | null
  asset_code: string
  equipment_name: string
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  current_location: string | null
  breakdown_date: string
  breakdown_time: string | null
  reported_by_employee_id: string | null
  reported_by_name: string | null
  nature_of_breakdown: string
  symptoms: string | null
  impact_on_work: string | null
  immediate_action: string | null
  downtime_from: string | null
  downtime_to: string | null
  repair_action: string | null
  repaired_by: string | null
  spare_parts_used: string | null
  repair_cost: number | null
  status: BreakdownStatus
  return_to_service_date: string | null
  authorized_by_employee_id: string | null
  authorized_by_name: string | null
  verification_notes: string | null
  post_repair_check_required: boolean
  post_repair_check_done: boolean
  remarks: string | null
  created_at?: string
}

export type BreakdownRegisterForm = {
  registerNo: string
  equipmentSourceFilter: EquipmentSourceFilter
  equipmentSource: EquipmentSource
  equipmentId: string
  assetCode: string
  equipmentName: string
  manufacturer: string
  modelNumber: string
  serialNumber: string
  currentLocation: string
  breakdownDate: string
  breakdownTime: string
  reportedByEmployeeId: string
  reportedByName: string
  natureOfBreakdown: string
  symptoms: string
  impactOnWork: string
  immediateAction: string
  downtimeFrom: string
  downtimeTo: string
  repairAction: string
  repairedBy: string
  sparePartsUsed: string
  repairCost: string
  status: BreakdownStatus
  returnToServiceDate: string
  authorizedByEmployeeId: string
  authorizedByName: string
  verificationNotes: string
  postRepairCheckRequired: boolean
  postRepairCheckDone: boolean
  remarks: string
}

function todayIsoDate() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nowLocalTime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function emptyBreakdownForm(registerNo = ''): BreakdownRegisterForm {
  return {
    registerNo,
    equipmentSourceFilter: 'testing',
    equipmentSource: 'testing',
    equipmentId: '',
    assetCode: '',
    equipmentName: '',
    manufacturer: '',
    modelNumber: '',
    serialNumber: '',
    currentLocation: '',
    breakdownDate: todayIsoDate(),
    breakdownTime: nowLocalTime(),
    reportedByEmployeeId: '',
    reportedByName: '',
    natureOfBreakdown: '',
    symptoms: '',
    impactOnWork: '',
    immediateAction: '',
    downtimeFrom: '',
    downtimeTo: '',
    repairAction: '',
    repairedBy: '',
    sparePartsUsed: '',
    repairCost: '',
    status: 'Open',
    returnToServiceDate: '',
    authorizedByEmployeeId: '',
    authorizedByName: '',
    verificationNotes: '',
    postRepairCheckRequired: true,
    postRepairCheckDone: false,
    remarks: '',
  }
}

export function rowToForm(row: BreakdownRegisterRow): BreakdownRegisterForm {
  const source = (EQUIPMENT_SOURCES.includes(row.equipment_source as EquipmentSource)
    ? row.equipment_source
    : 'testing') as EquipmentSource
  return {
    registerNo: row.register_no ?? '',
    equipmentSourceFilter: sourceFilterFromSource(source),
    equipmentSource: source,
    equipmentId: row.equipment_id ?? '',
    assetCode: row.asset_code ?? '',
    equipmentName: row.equipment_name ?? '',
    manufacturer: row.manufacturer ?? '',
    modelNumber: row.model_number ?? '',
    serialNumber: row.serial_number ?? '',
    currentLocation: row.current_location ?? '',
    breakdownDate: (row.breakdown_date ?? '').slice(0, 10),
    breakdownTime: (row.breakdown_time ?? '').slice(0, 5),
    reportedByEmployeeId: row.reported_by_employee_id ?? '',
    reportedByName: row.reported_by_name ?? '',
    natureOfBreakdown: row.nature_of_breakdown ?? '',
    symptoms: row.symptoms ?? '',
    impactOnWork: row.impact_on_work ?? '',
    immediateAction: row.immediate_action ?? '',
    downtimeFrom: toLocalDateTimeInput(row.downtime_from),
    downtimeTo: toLocalDateTimeInput(row.downtime_to),
    repairAction: row.repair_action ?? '',
    repairedBy: row.repaired_by ?? '',
    sparePartsUsed: row.spare_parts_used ?? '',
    repairCost: row.repair_cost != null ? String(row.repair_cost) : '',
    status: (BREAKDOWN_STATUSES.includes(row.status as BreakdownStatus)
      ? row.status
      : 'Open') as BreakdownStatus,
    returnToServiceDate: toLocalDateTimeInput(row.return_to_service_date),
    authorizedByEmployeeId: row.authorized_by_employee_id ?? '',
    authorizedByName: row.authorized_by_name ?? '',
    verificationNotes: row.verification_notes ?? '',
    postRepairCheckRequired: Boolean(row.post_repair_check_required),
    postRepairCheckDone: Boolean(row.post_repair_check_done),
    remarks: row.remarks ?? '',
  }
}

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localDateTimeToIso(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function formToPayload(form: BreakdownRegisterForm) {
  const cost = form.repairCost.trim()
  return {
    register_no: form.registerNo.trim(),
    equipment_source: form.equipmentSource,
    equipment_id: form.equipmentId.trim() || null,
    asset_code: form.assetCode.trim(),
    equipment_name: form.equipmentName.trim(),
    manufacturer: form.manufacturer.trim() || null,
    model_number: form.modelNumber.trim() || null,
    serial_number: form.serialNumber.trim() || null,
    current_location: form.currentLocation.trim() || null,
    breakdown_date: form.breakdownDate.trim(),
    breakdown_time: form.breakdownTime.trim() || null,
    reported_by_employee_id: form.reportedByEmployeeId.trim() || null,
    reported_by_name: form.reportedByName.trim() || null,
    nature_of_breakdown: form.natureOfBreakdown.trim(),
    symptoms: form.symptoms.trim() || null,
    impact_on_work: form.impactOnWork.trim() || null,
    immediate_action: form.immediateAction.trim() || null,
    downtime_from: localDateTimeToIso(form.downtimeFrom),
    downtime_to: localDateTimeToIso(form.downtimeTo),
    repair_action: form.repairAction.trim() || null,
    repaired_by: form.repairedBy.trim() || null,
    spare_parts_used: form.sparePartsUsed.trim() || null,
    repair_cost: cost && Number.isFinite(Number(cost)) ? Number(cost) : null,
    status: form.status,
    return_to_service_date: localDateTimeToIso(form.returnToServiceDate),
    authorized_by_employee_id: form.authorizedByEmployeeId.trim() || null,
    authorized_by_name: form.authorizedByName.trim() || null,
    verification_notes: form.verificationNotes.trim() || null,
    post_repair_check_required: form.postRepairCheckRequired,
    post_repair_check_done: form.postRepairCheckDone,
    remarks: form.remarks.trim() || null,
  }
}

export function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = value.slice(0, 10)
  const [y, m, d] = iso.split('-')
  if (y && m && d) return `${d}-${m}-${y}`
  return value
}

export function formatDateTimeDisplay(value: string | null | undefined): string {
  if (!value) return '—'
  const local = toLocalDateTimeInput(value)
  if (!local) return formatDateDisplay(value)
  const [datePart, timePart] = local.split('T')
  const dateDisp = formatDateDisplay(datePart)
  return timePart ? `${dateDisp} ${timePart}` : dateDisp
}

export function statusTone(status: string): string {
  switch (status) {
    case 'Closed':
      return 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
    case 'Under Repair':
      return 'border-amber-600/40 bg-amber-50 text-amber-900'
    case 'Awaiting Verification':
      return 'border-sky-600/40 bg-sky-50 text-sky-900'
    case 'Scrapped':
      return 'border-stone-500/40 bg-stone-100 text-stone-700'
    default:
      return 'border-rose-600/40 bg-rose-50 text-rose-900'
  }
}
