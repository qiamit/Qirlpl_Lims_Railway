import {
  fromIsoToLocalInput,
  localNowInputValue,
  nextPrefixedId,
  toIsoOrNull,
} from '../shared'

export const COMPLAINT_STATUSES = [
  'Received',
  'Under Investigation',
  'Decision Pending',
  'Closed',
  'Not Related',
] as const
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

export function complaintStatusTone(status: string): string {
  switch (status) {
    case 'Closed':
      return 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
    case 'Not Related':
      return 'border-stone-500/40 bg-stone-100 text-stone-700'
    case 'Under Investigation':
    case 'Decision Pending':
      return 'border-amber-600/40 bg-amber-50 text-amber-900'
    default:
      return 'border-sky-600/40 bg-sky-50 text-sky-900'
  }
}

export type ComplaintRow = {
  id: string
  complaint_id: string
  received_at: string
  complainant_name: string
  complainant_org: string | null
  complainant_contact: string | null
  description: string
  related_activity: string | null
  relates_to_lab: boolean
  validated: boolean
  validation_notes: string | null
  investigation_notes: string | null
  actions_taken: string | null
  decision_outcome: string | null
  acknowledged_at: string | null
  progress_reported_at: string | null
  outcome_communicated_at: string | null
  formal_closure_notice_sent: boolean
  closed_at: string | null
  reviewed_by_employee_id: string | null
  reviewed_by_name: string | null
  reviewer_not_involved: boolean
  status: ComplaintStatus
  created_at?: string
}

export type ComplaintForm = {
  complaintId: string
  receivedAt: string
  complainantName: string
  complainantOrg: string
  complainantContact: string
  description: string
  relatedActivity: string
  relatesToLab: boolean
  validated: boolean
  validationNotes: string
  investigationNotes: string
  actionsTaken: string
  decisionOutcome: string
  acknowledgedAt: string
  progressReportedAt: string
  outcomeCommunicatedAt: string
  formalClosureNoticeSent: boolean
  closedAt: string
  reviewedByEmployeeId: string
  reviewedByName: string
  reviewerNotInvolved: boolean
  status: ComplaintStatus
}

export function emptyComplaintForm(complaintId = ''): ComplaintForm {
  return {
    complaintId,
    receivedAt: localNowInputValue(),
    complainantName: '',
    complainantOrg: '',
    complainantContact: '',
    description: '',
    relatedActivity: '',
    relatesToLab: true,
    validated: false,
    validationNotes: '',
    investigationNotes: '',
    actionsTaken: '',
    decisionOutcome: '',
    acknowledgedAt: '',
    progressReportedAt: '',
    outcomeCommunicatedAt: '',
    formalClosureNoticeSent: false,
    closedAt: '',
    reviewedByEmployeeId: '',
    reviewedByName: '',
    reviewerNotInvolved: false,
    status: 'Received',
  }
}

export function rowToForm(row: ComplaintRow): ComplaintForm {
  return {
    complaintId: row.complaint_id ?? '',
    receivedAt: fromIsoToLocalInput(row.received_at) || localNowInputValue(),
    complainantName: row.complainant_name ?? '',
    complainantOrg: row.complainant_org ?? '',
    complainantContact: row.complainant_contact ?? '',
    description: row.description ?? '',
    relatedActivity: row.related_activity ?? '',
    relatesToLab: Boolean(row.relates_to_lab),
    validated: Boolean(row.validated),
    validationNotes: row.validation_notes ?? '',
    investigationNotes: row.investigation_notes ?? '',
    actionsTaken: row.actions_taken ?? '',
    decisionOutcome: row.decision_outcome ?? '',
    acknowledgedAt: fromIsoToLocalInput(row.acknowledged_at),
    progressReportedAt: fromIsoToLocalInput(row.progress_reported_at),
    outcomeCommunicatedAt: fromIsoToLocalInput(row.outcome_communicated_at),
    formalClosureNoticeSent: Boolean(row.formal_closure_notice_sent),
    closedAt: fromIsoToLocalInput(row.closed_at),
    reviewedByEmployeeId: row.reviewed_by_employee_id ?? '',
    reviewedByName: row.reviewed_by_name ?? '',
    reviewerNotInvolved: Boolean(row.reviewer_not_involved),
    status: (row.status as ComplaintStatus) || 'Received',
  }
}

export function formToPayload(form: ComplaintForm) {
  return {
    complaint_id: form.complaintId.trim(),
    received_at: toIsoOrNull(form.receivedAt) ?? new Date().toISOString(),
    complainant_name: form.complainantName.trim(),
    complainant_org: form.complainantOrg.trim() || null,
    complainant_contact: form.complainantContact.trim() || null,
    description: form.description.trim(),
    related_activity: form.relatedActivity.trim() || null,
    relates_to_lab: form.relatesToLab,
    validated: form.validated,
    validation_notes: form.validationNotes.trim() || null,
    investigation_notes: form.investigationNotes.trim() || null,
    actions_taken: form.actionsTaken.trim() || null,
    decision_outcome: form.decisionOutcome.trim() || null,
    acknowledged_at: toIsoOrNull(form.acknowledgedAt),
    progress_reported_at: toIsoOrNull(form.progressReportedAt),
    outcome_communicated_at: toIsoOrNull(form.outcomeCommunicatedAt),
    formal_closure_notice_sent: form.formalClosureNoticeSent,
    closed_at: toIsoOrNull(form.closedAt),
    reviewed_by_employee_id: form.reviewedByEmployeeId.trim() || null,
    reviewed_by_name: form.reviewedByName.trim() || null,
    reviewer_not_involved: form.reviewerNotInvolved,
    status: form.status,
  }
}

export function nextComplaintId(rows: ComplaintRow[]): string {
  return nextPrefixedId(
    rows.map((r) => r.complaint_id),
    'CMP',
  )
}
