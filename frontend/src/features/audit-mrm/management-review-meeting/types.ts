import { MRM_AGENDA_ISO_892, type MrmAgendaClauseLetter } from '../mrm-agenda/types'

/** ISO/IEC 17025:2017 8.9 management review meeting (migration 20261027100200). */

export type MrmMeetingStatus = 'draft' | 'minutes_circulated' | 'closed'

export type MrmOutputType = 'effectiveness' | 'improvement' | 'resources' | 'changes' | 'other'

export type MrmActionStatus = 'open' | 'done' | 'overdue'

export const MRM_INPUT_CODES: MrmAgendaClauseLetter[] = MRM_AGENDA_ISO_892.map((x) => x.letter)

export function mrmInputDefaultTitle(code: string): string {
  return MRM_AGENDA_ISO_892.find((x) => x.letter === code)?.title ?? `Input ${code}`
}

/** ISO/IEC 17025:2017 8.9.3 outputs. */
export const MRM_OUTPUT_TYPES: ReadonlyArray<{ value: MrmOutputType; label: string; hint: string }> = [
  {
    value: 'effectiveness',
    label: 'Effectiveness of the management system',
    hint: '8.9.3 a: effectiveness of the management system and its processes',
  },
  {
    value: 'improvement',
    label: 'Improvement of laboratory activities',
    hint: '8.9.3 b: improvement of the laboratory activities related to the fulfilment of ISO/IEC 17025',
  },
  { value: 'resources', label: 'Provision of required resources', hint: '8.9.3 c' },
  { value: 'changes', label: 'Need for any change', hint: '8.9.3 d' },
  { value: 'other', label: 'Other decisions', hint: '' },
]

export function mrmOutputTypeLabel(value: string): string {
  return MRM_OUTPUT_TYPES.find((t) => t.value === value)?.label ?? value
}

/** One figure pulled from the LIMS for an input. */
export type MrmFigure = { label: string; value: number | string; tone?: 'warn' | 'ok' }

export type MrmSourceState = {
  key: string
  label: string
  status: 'ok' | 'missing' | 'error'
  message?: string
}

/** Stored in mrm_meeting_inputs.summary_data (snapshot at pull time). */
export type MrmInputSummary = {
  period?: { from: string; to: string }
  pulledAt?: string
  figures: MrmFigure[]
  items: string[]
  sources: MrmSourceState[]
}

export function emptySummary(): MrmInputSummary {
  return { figures: [], items: [], sources: [] }
}

export function parseSummary(raw: unknown): MrmInputSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptySummary()
  const r = raw as Record<string, unknown>
  const figures = Array.isArray(r.figures)
    ? (r.figures as unknown[])
        .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
        .map(
          (f): MrmFigure => ({
            label: String(f.label ?? ''),
            value: typeof f.value === 'number' ? f.value : String(f.value ?? ''),
            tone: f.tone === 'warn' ? 'warn' : f.tone === 'ok' ? 'ok' : undefined,
          }),
        )
    : []
  const items = Array.isArray(r.items) ? (r.items as unknown[]).map((x) => String(x ?? '')) : []
  const sources = Array.isArray(r.sources)
    ? (r.sources as unknown[])
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map((s) => ({
          key: String(s.key ?? ''),
          label: String(s.label ?? ''),
          status: (s.status === 'missing' || s.status === 'error' ? s.status : 'ok') as MrmSourceState['status'],
          message: s.message ? String(s.message) : undefined,
        }))
    : []
  const period =
    r.period && typeof r.period === 'object'
      ? {
          from: String((r.period as Record<string, unknown>).from ?? ''),
          to: String((r.period as Record<string, unknown>).to ?? ''),
        }
      : undefined
  return {
    period,
    pulledAt: r.pulledAt ? String(r.pulledAt) : undefined,
    figures,
    items,
    sources,
  }
}

export type MrmMeetingRow = {
  id: string
  mrmPlanId: string
  planCode: string
  meetingNo: string
  heldOn: string
  venue: string
  chairedBy: string
  status: MrmMeetingStatus
  periodFrom: string
  periodTo: string
  closingRemarks: string
  minutesCirculatedAt: string | null
  approvedBy: string | null
  approvedByName: string
  approvedAt: string | null
  approvedReauthenticatedAt: string | null
  createdAt: string
  updatedAt: string
}

export type MrmAttendanceForm = {
  key: string
  userId: string
  name: string
  designation: string
  present: boolean
}

export type MrmInputForm = {
  id: string
  code: string
  title: string
  summary: MrmInputSummary
  pulledAt: string | null
  discussion: string
  conclusion: string
}

export type MrmOutputForm = {
  key: string
  outputType: MrmOutputType
  decision: string
}

export type MrmActionForm = {
  /** Database id; empty for a new row. */
  id: string
  key: string
  meetingId: string
  action: string
  ownerUserId: string
  ownerName: string
  dueOn: string
  status: MrmActionStatus
  closedOn: string
  closureEvidence: string
  capaRef: string
}

export type MrmMeetingForm = {
  meetingNo: string
  heldOn: string
  venue: string
  chairedBy: string
  periodFrom: string
  periodTo: string
  closingRemarks: string
  attendance: MrmAttendanceForm[]
  inputs: MrmInputForm[]
  outputs: MrmOutputForm[]
  actions: MrmActionForm[]
}

/** Action with the meeting it belongs to (overdue view). */
export type MrmActionListRow = MrmActionForm & {
  meetingNo: string
  meetingStatus: MrmMeetingStatus
  heldOn: string
}

export type MrmUser = { id: string; name: string; designation: string }

export function uiKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function asMeetingStatus(raw: unknown): MrmMeetingStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'minutes_circulated' || s === 'closed') return s
  return 'draft'
}

export function asActionStatus(raw: unknown): MrmActionStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'done' || s === 'overdue') return s
  return 'open'
}

export function asOutputType(raw: unknown): MrmOutputType {
  const s = String(raw ?? '').trim().toLowerCase()
  return (MRM_OUTPUT_TYPES.find((t) => t.value === s)?.value ?? 'other') as MrmOutputType
}

export function meetingStatusLabel(status: MrmMeetingStatus): string {
  if (status === 'minutes_circulated') return 'Minutes circulated'
  if (status === 'closed') return 'Closed'
  return 'Draft'
}

export function meetingStatusClass(status: MrmMeetingStatus): string {
  if (status === 'closed') return 'border-emerald-600 bg-emerald-50 text-emerald-900'
  if (status === 'minutes_circulated') return 'border-amber-600 bg-amber-50 text-amber-950'
  return 'border-stone-500 bg-stone-100 text-stone-800'
}

export function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Shift an ISO date (yyyy-mm-dd) by days / months, staying in local calendar terms. */
export function shiftIsoDate(iso: string, opts: { days?: number; months?: number }): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map((x) => Number.parseInt(x, 10))
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1 + (opts.months ?? 0), d + (opts.days ?? 0))
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

/** Effective status: an open action past its due date shows as overdue. */
export function effectiveActionStatus(
  a: Pick<MrmActionForm, 'status' | 'dueOn'>,
  today = todayIso(),
): MrmActionStatus {
  if (a.status === 'done') return 'done'
  if (a.status === 'overdue') return 'overdue'
  if (a.dueOn && a.dueOn.slice(0, 10) < today) return 'overdue'
  return 'open'
}

export function actionStatusLabel(status: MrmActionStatus): string {
  if (status === 'done') return 'Done'
  if (status === 'overdue') return 'Overdue'
  return 'Open'
}

export function actionStatusClass(status: MrmActionStatus): string {
  if (status === 'done') return 'border-emerald-600 bg-emerald-50 text-emerald-900'
  if (status === 'overdue') return 'border-red-600 bg-red-50 text-red-900'
  return 'border-amber-600 bg-amber-50 text-amber-950'
}

export function nextMeetingNo(firmInitials: string, existing: string[]): string {
  const initials = (firmInitials || 'QI').slice(0, 2).toUpperCase() || 'QI'
  let max = 0
  for (const code of existing) {
    const m = String(code).match(/\/MRMM-(\d+)$/i)
    if (!m) continue
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${initials}/MRMM-${String(max + 1).padStart(2, '0')}`
}

export function firmInitialsFromLabName(labName: string): string {
  const parts = labName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'QI'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function mapMeetingRow(raw: Record<string, unknown>, planCodeById: Map<string, string>): MrmMeetingRow {
  const planId = String(raw.mrm_plan_id ?? '')
  return {
    id: String(raw.id ?? ''),
    mrmPlanId: planId,
    planCode: planCodeById.get(planId) ?? '',
    meetingNo: String(raw.meeting_no ?? ''),
    heldOn: String(raw.held_on ?? '').slice(0, 10),
    venue: String(raw.venue ?? ''),
    chairedBy: String(raw.chaired_by ?? ''),
    status: asMeetingStatus(raw.status),
    periodFrom: String(raw.period_from ?? '').slice(0, 10),
    periodTo: String(raw.period_to ?? '').slice(0, 10),
    closingRemarks: String(raw.closing_remarks ?? ''),
    minutesCirculatedAt: raw.minutes_circulated_at ? String(raw.minutes_circulated_at) : null,
    approvedBy: raw.approved_by ? String(raw.approved_by) : null,
    approvedByName: String(raw.approved_by_name ?? ''),
    approvedAt: raw.approved_at ? String(raw.approved_at) : null,
    approvedReauthenticatedAt: raw.approved_reauthenticated_at ? String(raw.approved_reauthenticated_at) : null,
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  }
}

export function mapActionRow(raw: Record<string, unknown>): MrmActionForm {
  const id = String(raw.id ?? '')
  return {
    id,
    key: `saved-${id}`,
    meetingId: String(raw.meeting_id ?? ''),
    action: String(raw.action ?? ''),
    ownerUserId: String(raw.owner_user_id ?? ''),
    ownerName: String(raw.owner_name ?? ''),
    dueOn: String(raw.due_on ?? '').slice(0, 10),
    status: asActionStatus(raw.status),
    closedOn: String(raw.closed_on ?? '').slice(0, 10),
    closureEvidence: String(raw.closure_evidence ?? ''),
    capaRef: String(raw.capa_ref ?? ''),
  }
}

export function emptyAction(meetingId: string): MrmActionForm {
  return {
    id: '',
    key: uiKey('action'),
    meetingId,
    action: '',
    ownerUserId: '',
    ownerName: '',
    dueOn: '',
    status: 'open',
    closedOn: '',
    closureEvidence: '',
    capaRef: '',
  }
}

export function formatPeriod(from: string, to: string, fmt: (d: string) => string): string {
  if (!from && !to) return '—'
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  return fmt(from || to)
}
