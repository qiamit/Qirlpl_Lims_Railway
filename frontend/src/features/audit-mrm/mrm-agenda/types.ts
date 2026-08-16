import { formatDate } from '@/lib/utils'

export type MrmPlanStatus = 'draft' | 'planned' | 'communicated'

export type MrmEmailStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export type MrmAgendaClauseLetter =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'

/** ISO/IEC 17025:2017 Clause 8.9.2 management review inputs (a–o). */
export const MRM_AGENDA_ISO_892: ReadonlyArray<{
  letter: MrmAgendaClauseLetter
  title: string
  sortOrder: number
}> = [
  {
    letter: 'a',
    title: 'Changes in internal and external issues that are relevant to the laboratory',
    sortOrder: 1,
  },
  { letter: 'b', title: 'Fulfilment of objectives', sortOrder: 2 },
  { letter: 'c', title: 'Suitability of policies and procedures', sortOrder: 3 },
  {
    letter: 'd',
    title: 'Status of actions from previous management reviews',
    sortOrder: 4,
  },
  { letter: 'e', title: 'Outcome of recent internal audits', sortOrder: 5 },
  { letter: 'f', title: 'Corrective actions', sortOrder: 6 },
  { letter: 'g', title: 'Assessments by external bodies', sortOrder: 7 },
  {
    letter: 'h',
    title:
      'Changes in the volume and type of the work or in the range of laboratory activities',
    sortOrder: 8,
  },
  { letter: 'i', title: 'Customer and personnel feedback', sortOrder: 9 },
  { letter: 'j', title: 'Complaints', sortOrder: 10 },
  {
    letter: 'k',
    title: 'Effectiveness of any implemented improvements',
    sortOrder: 11,
  },
  { letter: 'l', title: 'Adequacy of resources', sortOrder: 12 },
  { letter: 'm', title: 'Results of risk identification', sortOrder: 13 },
  {
    letter: 'n',
    title: 'Outcomes of the assurance of the validity of results',
    sortOrder: 14,
  },
  {
    letter: 'o',
    title: 'Other relevant factors, such as monitoring activities and training',
    sortOrder: 15,
  },
]

/** Sentence-style auto capitalization for agenda point text. */
export function toAutoCapitalizedAgendaTitle(value: string): string {
  if (!value) return value
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const body = value.slice(leading.length)
  if (!body) return value
  return leading + body.charAt(0).toUpperCase() + body.slice(1)
}

export function validateMrmAgendaItems(
  items: Array<{ included: boolean; title: string }>,
): string | null {
  if (items.length === 0) return 'Add at least one agenda point.'
  if (!items.some((i) => i.included)) return 'Select at least one agenda point.'
  const emptySelected = items.some((i) => i.included && !i.title.trim())
  if (emptySelected) return 'Selected agenda points cannot be empty.'
  return null
}

export type MrmAgendaItemRow = {
  id: string
  planId: string
  clauseLetter: string
  title: string
  sortOrder: number
  included: boolean
  remarks: string
}

export type MrmRecipientRow = {
  id: string
  planId: string
  userId: string
  name: string
  email: string
  mobile: string
  designation: string
  department: string
  division: string
  markedCommunicatedAt: string | null
  emailSentAt: string | null
  emailStatus: MrmEmailStatus
  emailError: string
}

export type MrmPlanRow = {
  id: string
  planCode: string
  plannedFrom: string
  plannedTo: string
  venue: string
  chairperson: string
  status: MrmPlanStatus
  notes: string
  communicatedAt: string | null
  createdAt: string
  updatedAt: string
  agendaItems: MrmAgendaItemRow[]
  recipients: MrmRecipientRow[]
}

export type MrmAgendaItemForm = {
  /** Stable UI key (not persisted). */
  key: string
  clauseLetter: string
  title: string
  sortOrder: number
  included: boolean
  remarks: string
}

export type MrmRecipientForm = {
  /** Stable UI key (not persisted). */
  key: string
  userId: string
  name: string
  email: string
  mobile: string
  designation: string
  department: string
  division: string
  markedCommunicatedAt: string | null
  emailSentAt: string | null
  emailStatus: MrmEmailStatus
  emailError: string
}

export type MrmPlanForm = {
  planCode: string
  plannedFrom: string
  plannedTo: string
  venue: string
  chairperson: string
  status: MrmPlanStatus
  notes: string
  agendaItems: MrmAgendaItemForm[]
  recipients: MrmRecipientForm[]
}

export type MrmUserOption = {
  id: string
  name: string
  email: string
  mobile: string
  designation: string
  department: string
  division: string
}

export function createEmptyRecipient(): MrmRecipientForm {
  return {
    key: `recip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: '',
    name: '',
    email: '',
    mobile: '',
    designation: '',
    department: '',
    division: '',
    markedCommunicatedAt: null,
    emailSentAt: null,
    emailStatus: 'pending',
    emailError: '',
  }
}

export function recipientFromUser(user: MrmUserOption, existing?: Partial<MrmRecipientForm>): MrmRecipientForm {
  return {
    key: existing?.key ?? `recip-${user.id}`,
    userId: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    designation: user.designation,
    department: user.department,
    division: user.division,
    markedCommunicatedAt: existing?.markedCommunicatedAt ?? null,
    emailSentAt: existing?.emailSentAt ?? null,
    emailStatus: existing?.emailStatus ?? 'pending',
    emailError: existing?.emailError ?? '',
  }
}

export function emptyAgendaItems(): MrmAgendaItemForm[] {
  return MRM_AGENDA_ISO_892.map((item) => ({
    key: `iso-${item.letter}`,
    clauseLetter: item.letter,
    title: item.title,
    sortOrder: item.sortOrder,
    included: true,
    remarks: '',
  }))
}

export function nextAgendaClauseLetter(existing: MrmAgendaItemForm[]): string {
  const used = new Set(existing.map((i) => i.clauseLetter.toLowerCase()))
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    if (!used.has(ch)) return ch
  }
  let n = 1
  while (used.has(`x${n}`)) n += 1
  return `x${n}`
}

export function createEmptyAgendaItem(existing: MrmAgendaItemForm[]): MrmAgendaItemForm {
  const letter = nextAgendaClauseLetter(existing)
  return {
    key: `row-${Date.now()}-${letter}`,
    clauseLetter: letter,
    title: '',
    sortOrder: existing.length + 1,
    included: true,
    remarks: '',
  }
}

export function emptyMrmPlanForm(planCode = ''): MrmPlanForm {
  return {
    planCode,
    plannedFrom: '',
    plannedTo: '',
    venue: '',
    chairperson: '',
    status: 'draft',
    notes: '',
    agendaItems: emptyAgendaItems(),
    recipients: [],
  }
}

export function mrmStatusLabel(status: MrmPlanStatus): string {
  if (status === 'planned') return 'Planned'
  if (status === 'communicated') return 'Communicated'
  return 'Draft'
}

export function formatPlannedRange(from: string, to: string): string {
  const a = formatDate(from)
  const b = formatDate(to)
  if (!a && !b) return '—'
  if (a && !b) return a
  if (!a && b) return b
  if (a === b) return a
  return `${a} – ${b}`
}

export function nextMrmPlanCode(firmInitials: string, existingCodes: string[]): string {
  const initials = (firmInitials || 'QI').slice(0, 2).toUpperCase() || 'QI'
  let max = 0
  for (const code of existingCodes) {
    const m = String(code).match(/\/MRM-(\d+)$/i)
    if (!m) continue
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${initials}/MRM-${String(max + 1).padStart(2, '0')}`
}

function asStatus(raw: unknown): MrmPlanStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'planned' || s === 'communicated') return s
  return 'draft'
}

function asEmailStatus(raw: unknown): MrmEmailStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'sent' || s === 'failed' || s === 'skipped') return s
  return 'pending'
}

function asLetter(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function mapAgendaItem(raw: Record<string, unknown>): MrmAgendaItemRow | null {
  const letter = asLetter(raw.clause_letter)
  if (!letter) return null
  const meta = MRM_AGENDA_ISO_892.find((x) => x.letter === letter)
  const title = String(raw.title ?? meta?.title ?? '').trim()
  if (!title && !meta) return null
  return {
    id: String(raw.id ?? ''),
    planId: String(raw.plan_id ?? ''),
    clauseLetter: letter,
    title: title || meta?.title || '',
    sortOrder: Number(raw.sort_order ?? meta?.sortOrder ?? 0) || 0,
    included: raw.included !== false,
    remarks: String(raw.remarks ?? '').trim(),
  }
}

export function mapRecipient(raw: Record<string, unknown>): MrmRecipientRow {
  return {
    id: String(raw.id ?? ''),
    planId: String(raw.plan_id ?? ''),
    userId: String(raw.user_id ?? ''),
    name: String(raw.name ?? '').trim(),
    email: String(raw.email ?? '').trim(),
    mobile: String(raw.mobile ?? '').trim(),
    designation: String(raw.designation ?? '').trim(),
    department: String(raw.department ?? '').trim(),
    division: String(raw.division ?? '').trim(),
    markedCommunicatedAt: raw.marked_communicated_at
      ? String(raw.marked_communicated_at)
      : null,
    emailSentAt: raw.email_sent_at ? String(raw.email_sent_at) : null,
    emailStatus: asEmailStatus(raw.email_status),
    emailError: String(raw.email_error ?? '').trim(),
  }
}

export function mapMrmPlanRow(
  plan: Record<string, unknown>,
  agendaRaw: Record<string, unknown>[] = [],
  recipientsRaw: Record<string, unknown>[] = [],
): MrmPlanRow {
  const agendaItems = agendaRaw
    .map(mapAgendaItem)
    .filter((x): x is MrmAgendaItemRow => Boolean(x))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return {
    id: String(plan.id ?? ''),
    planCode: String(plan.plan_code ?? ''),
    plannedFrom: String(plan.planned_from ?? ''),
    plannedTo: String(plan.planned_to ?? ''),
    venue: String(plan.venue ?? '').trim(),
    chairperson: String(plan.chairperson ?? '').trim(),
    status: asStatus(plan.status),
    notes: String(plan.notes ?? '').trim(),
    communicatedAt: plan.communicated_at ? String(plan.communicated_at) : null,
    createdAt: String(plan.created_at ?? ''),
    updatedAt: String(plan.updated_at ?? ''),
    agendaItems:
      agendaItems.length > 0
        ? agendaItems
        : emptyAgendaItems().map((i) => ({
            id: '',
            planId: String(plan.id ?? ''),
            clauseLetter: i.clauseLetter,
            title: i.title,
            sortOrder: i.sortOrder,
            included: i.included,
            remarks: i.remarks,
          })),
    recipients: recipientsRaw.map(mapRecipient),
  }
}

export function rowToForm(row: MrmPlanRow): MrmPlanForm {
  return {
    planCode: row.planCode,
    plannedFrom: row.plannedFrom.slice(0, 10),
    plannedTo: row.plannedTo.slice(0, 10),
    venue: row.venue,
    chairperson: row.chairperson,
    status: row.status,
    notes: row.notes,
    agendaItems: row.agendaItems.map((i, idx) => ({
      key: `saved-${i.id || i.clauseLetter}-${idx}`,
      clauseLetter: i.clauseLetter,
      title: toAutoCapitalizedAgendaTitle(i.title),
      sortOrder: i.sortOrder,
      included: i.included,
      remarks: i.remarks,
    })),
    recipients: row.recipients.map((r) => ({
      key: `saved-${r.id || r.userId}`,
      userId: r.userId,
      name: r.name,
      email: r.email,
      mobile: r.mobile,
      designation: r.designation,
      department: r.department,
      division: r.division,
      markedCommunicatedAt: r.markedCommunicatedAt,
      emailSentAt: r.emailSentAt,
      emailStatus: r.emailStatus,
      emailError: r.emailError,
    })),
  }
}

export { formatDate }
