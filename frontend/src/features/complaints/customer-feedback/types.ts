import {
  fromIsoToLocalInput,
  localNowInputValue,
  nextPrefixedId,
  toIsoOrNull,
} from '../shared'

export const FEEDBACK_TYPES = ['Praise', 'Suggestion', 'Concern', 'Other'] as const
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]

export const FEEDBACK_STATUSES = ['Open', 'Under Evaluation', 'Closed'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const EVAL_STATUSES = ['Pending', 'In Progress', 'Completed'] as const
export type EvalStatus = (typeof EVAL_STATUSES)[number]

export function feedbackStatusTone(status: string): string {
  switch (status) {
    case 'Closed':
      return 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
    case 'Under Evaluation':
      return 'border-amber-600/40 bg-amber-50 text-amber-900'
    default:
      return 'border-sky-600/40 bg-sky-50 text-sky-900'
  }
}

export type FeedbackRow = {
  id: string
  feedback_id: string
  received_at: string
  customer_name: string
  customer_org: string | null
  customer_contact: string | null
  feedback_type: FeedbackType
  description: string
  related_service: string | null
  status: FeedbackStatus
  evaluation_notes: string | null
  significance: string | null
  actions_decided: string | null
  improvement_actions: string | null
  evaluated_by_employee_id: string | null
  evaluated_by_name: string | null
  evaluated_at: string | null
  evaluation_status: EvalStatus
  created_at?: string
}

export type FeedbackForm = {
  feedbackId: string
  receivedAt: string
  customerName: string
  customerOrg: string
  customerContact: string
  feedbackType: FeedbackType
  description: string
  relatedService: string
  status: FeedbackStatus
  evaluationNotes: string
  significance: string
  actionsDecided: string
  improvementActions: string
  evaluatedByEmployeeId: string
  evaluatedByName: string
  evaluatedAt: string
  evaluationStatus: EvalStatus
}

export function emptyFeedbackForm(feedbackId = ''): FeedbackForm {
  return {
    feedbackId,
    receivedAt: localNowInputValue(),
    customerName: '',
    customerOrg: '',
    customerContact: '',
    feedbackType: 'Suggestion',
    description: '',
    relatedService: '',
    status: 'Open',
    evaluationNotes: '',
    significance: '',
    actionsDecided: '',
    improvementActions: '',
    evaluatedByEmployeeId: '',
    evaluatedByName: '',
    evaluatedAt: '',
    evaluationStatus: 'Pending',
  }
}

export function rowToForm(row: FeedbackRow): FeedbackForm {
  return {
    feedbackId: row.feedback_id ?? '',
    receivedAt: fromIsoToLocalInput(row.received_at) || localNowInputValue(),
    customerName: row.customer_name ?? '',
    customerOrg: row.customer_org ?? '',
    customerContact: row.customer_contact ?? '',
    feedbackType: (row.feedback_type as FeedbackType) || 'Suggestion',
    description: row.description ?? '',
    relatedService: row.related_service ?? '',
    status: (row.status as FeedbackStatus) || 'Open',
    evaluationNotes: row.evaluation_notes ?? '',
    significance: row.significance ?? '',
    actionsDecided: row.actions_decided ?? '',
    improvementActions: row.improvement_actions ?? '',
    evaluatedByEmployeeId: row.evaluated_by_employee_id ?? '',
    evaluatedByName: row.evaluated_by_name ?? '',
    evaluatedAt: fromIsoToLocalInput(row.evaluated_at),
    evaluationStatus: (row.evaluation_status as EvalStatus) || 'Pending',
  }
}

export function formToPayload(form: FeedbackForm) {
  return {
    feedback_id: form.feedbackId.trim(),
    received_at: toIsoOrNull(form.receivedAt) ?? new Date().toISOString(),
    customer_name: form.customerName.trim(),
    customer_org: form.customerOrg.trim() || null,
    customer_contact: form.customerContact.trim() || null,
    feedback_type: form.feedbackType,
    description: form.description.trim(),
    related_service: form.relatedService.trim() || null,
    status: form.status,
    evaluation_notes: form.evaluationNotes.trim() || null,
    significance: form.significance.trim() || null,
    actions_decided: form.actionsDecided.trim() || null,
    improvement_actions: form.improvementActions.trim() || null,
    evaluated_by_employee_id: form.evaluatedByEmployeeId.trim() || null,
    evaluated_by_name: form.evaluatedByName.trim() || null,
    evaluated_at: toIsoOrNull(form.evaluatedAt),
    evaluation_status: form.evaluationStatus,
  }
}

export function nextFeedbackId(rows: FeedbackRow[]): string {
  return nextPrefixedId(
    rows.map((r) => r.feedback_id),
    'FBK',
  )
}
