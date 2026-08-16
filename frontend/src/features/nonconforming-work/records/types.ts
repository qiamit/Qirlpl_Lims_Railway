export const NC_SOURCE_AREAS = ['Testing', 'Calibration', 'Sample Handling', 'Other'] as const
export type NcSourceArea = (typeof NC_SOURCE_AREAS)[number]

export const NC_RISK_LEVELS = ['Low', 'Medium', 'High'] as const
export type NcRiskLevel = (typeof NC_RISK_LEVELS)[number]

export const NC_ACCEPTABILITY = ['pending', 'accepted', 'not_accepted'] as const
export type NcAcceptability = (typeof NC_ACCEPTABILITY)[number]

export const NC_STATUSES = [
  'Open',
  'Under Evaluation',
  'Decision Pending',
  'Closed',
  'CAPA Required',
] as const
export type NcWorkStatus = (typeof NC_STATUSES)[number]

export function acceptabilityLabel(v: string): string {
  switch (v) {
    case 'accepted':
      return 'Accepted'
    case 'not_accepted':
      return 'Not Accepted'
    default:
      return 'Pending'
  }
}

export function statusTone(status: string): string {
  switch (status) {
    case 'Closed':
      return 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
    case 'CAPA Required':
      return 'border-rose-600/40 bg-rose-50 text-rose-900'
    case 'Under Evaluation':
    case 'Decision Pending':
      return 'border-amber-600/40 bg-amber-50 text-amber-900'
    default:
      return 'border-sky-600/40 bg-sky-50 text-sky-900'
  }
}

export type NcWorkRecordRow = {
  id: string
  nc_id: string
  detected_at: string
  reported_by_employee_id: string | null
  reported_by_name: string | null
  source_area: NcSourceArea
  equipment_or_activity: string | null
  description: string
  risk_level: NcRiskLevel
  actions_taken: string | null
  significance_evaluation: string | null
  impact_on_previous_results: string | null
  acceptability_decision: NcAcceptability
  customer_notified: boolean
  customer_notify_details: string | null
  work_recalled: boolean
  resumption_authorized_by_employee_id: string | null
  resumption_authorized_by_name: string | null
  resumption_authorized_at: string | null
  status: NcWorkStatus
  corrective_action_required: boolean
  created_at?: string
}

export type NcWorkRecordForm = {
  ncId: string
  detectedAt: string
  reportedByEmployeeId: string
  reportedByName: string
  sourceArea: NcSourceArea
  equipmentOrActivity: string
  description: string
  riskLevel: NcRiskLevel
  actionsTaken: string
  significanceEvaluation: string
  impactOnPreviousResults: string
  acceptabilityDecision: NcAcceptability
  customerNotified: boolean
  customerNotifyDetails: string
  workRecalled: boolean
  resumptionAuthorizedByEmployeeId: string
  resumptionAuthorizedByName: string
  resumptionAuthorizedAt: string
  status: NcWorkStatus
  correctiveActionRequired: boolean
}

function nowLocalDateTimeInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

export function emptyNcWorkForm(ncId = ''): NcWorkRecordForm {
  return {
    ncId,
    detectedAt: nowLocalDateTimeInput(),
    reportedByEmployeeId: '',
    reportedByName: '',
    sourceArea: 'Other',
    equipmentOrActivity: '',
    description: '',
    riskLevel: 'Medium',
    actionsTaken: '',
    significanceEvaluation: '',
    impactOnPreviousResults: '',
    acceptabilityDecision: 'pending',
    customerNotified: false,
    customerNotifyDetails: '',
    workRecalled: false,
    resumptionAuthorizedByEmployeeId: '',
    resumptionAuthorizedByName: '',
    resumptionAuthorizedAt: '',
    status: 'Open',
    correctiveActionRequired: false,
  }
}

export function rowToNcWorkForm(row: NcWorkRecordRow): NcWorkRecordForm {
  return {
    ncId: row.nc_id ?? '',
    detectedAt: toLocalDateTimeInput(row.detected_at),
    reportedByEmployeeId: row.reported_by_employee_id ?? '',
    reportedByName: row.reported_by_name ?? '',
    sourceArea: (NC_SOURCE_AREAS.includes(row.source_area as NcSourceArea)
      ? row.source_area
      : 'Other') as NcSourceArea,
    equipmentOrActivity: row.equipment_or_activity ?? '',
    description: row.description ?? '',
    riskLevel: (NC_RISK_LEVELS.includes(row.risk_level as NcRiskLevel)
      ? row.risk_level
      : 'Medium') as NcRiskLevel,
    actionsTaken: row.actions_taken ?? '',
    significanceEvaluation: row.significance_evaluation ?? '',
    impactOnPreviousResults: row.impact_on_previous_results ?? '',
    acceptabilityDecision: (NC_ACCEPTABILITY.includes(row.acceptability_decision as NcAcceptability)
      ? row.acceptability_decision
      : 'pending') as NcAcceptability,
    customerNotified: Boolean(row.customer_notified),
    customerNotifyDetails: row.customer_notify_details ?? '',
    workRecalled: Boolean(row.work_recalled),
    resumptionAuthorizedByEmployeeId: row.resumption_authorized_by_employee_id ?? '',
    resumptionAuthorizedByName: row.resumption_authorized_by_name ?? '',
    resumptionAuthorizedAt: toLocalDateTimeInput(row.resumption_authorized_at),
    status: (NC_STATUSES.includes(row.status as NcWorkStatus) ? row.status : 'Open') as NcWorkStatus,
    correctiveActionRequired: Boolean(row.corrective_action_required),
  }
}

export function ncWorkFormToPayload(form: NcWorkRecordForm) {
  return {
    nc_id: form.ncId.trim(),
    detected_at: localDateTimeToIso(form.detectedAt) ?? new Date().toISOString(),
    reported_by_employee_id: form.reportedByEmployeeId.trim() || null,
    reported_by_name: form.reportedByName.trim() || null,
    source_area: form.sourceArea,
    equipment_or_activity: form.equipmentOrActivity.trim() || null,
    description: form.description.trim(),
    risk_level: form.riskLevel,
    actions_taken: form.actionsTaken.trim() || null,
    significance_evaluation: form.significanceEvaluation.trim() || null,
    impact_on_previous_results: form.impactOnPreviousResults.trim() || null,
    acceptability_decision: form.acceptabilityDecision,
    customer_notified: form.customerNotified,
    customer_notify_details: form.customerNotifyDetails.trim() || null,
    work_recalled: form.workRecalled,
    resumption_authorized_by_employee_id: form.resumptionAuthorizedByEmployeeId.trim() || null,
    resumption_authorized_by_name: form.resumptionAuthorizedByName.trim() || null,
    resumption_authorized_at: localDateTimeToIso(form.resumptionAuthorizedAt),
    status: form.status,
    corrective_action_required: form.correctiveActionRequired,
  }
}

export function nextNcId(existing: NcWorkRecordRow[]): string {
  const year = new Date().getFullYear()
  const prefix = `NCW-${year}-`
  let max = 0
  for (const r of existing) {
    const no = r.nc_id ?? ''
    if (!no.startsWith(prefix)) continue
    const n = Number(no.slice(prefix.length))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
