import { LAB_SETTINGS_SINGLETON_ID } from '@/features/settings/lab-settings/labSettingsDb'
import { fetchTeamUsers } from '@/lib/fetchTeamUsers'
import { supabase } from '@/lib/supabaseClient'
import { mapMrmPlanRow, type MrmPlanRow } from '../mrm-agenda/types'
import {
  MRM_INPUT_CODES,
  asOutputType,
  mapActionRow,
  mapMeetingRow,
  mrmInputDefaultTitle,
  parseSummary,
  shiftIsoDate,
  uiKey,
  type MrmActionForm,
  type MrmActionListRow,
  type MrmMeetingForm,
  type MrmMeetingRow,
  type MrmUser,
} from './types'

type Row = Record<string, unknown>

function rows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : []
}

export function errorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  if (typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string }
    return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
  }
  return String(err)
}

/** True when migration 20261027100200 has not been applied yet. */
export function isMrmTableMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes('mrm_meetings') && (msg.includes('does not exist') || msg.includes('could not find'))
}

export async function loadPlans(): Promise<MrmPlanRow[]> {
  const { data, error } = await supabase.from('mrm_plans').select('*').order('planned_from', { ascending: false })
  if (error) throw error
  const plans = rows(data)
  const ids = plans.map((p) => String(p.id))
  if (ids.length === 0) return []
  const [agenda, recips] = await Promise.all([
    supabase.from('mrm_agenda_items').select('*').in('plan_id', ids),
    supabase.from('mrm_plan_recipients').select('*').in('plan_id', ids),
  ])
  const group = (list: Row[]) => {
    const m = new Map<string, Row[]>()
    for (const r of list) {
      const k = String(r.plan_id ?? '')
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return m
  }
  const a = group(agenda.error ? [] : rows(agenda.data))
  const r = group(recips.error ? [] : rows(recips.data))
  return plans.map((p) => mapMrmPlanRow(p, a.get(String(p.id)) ?? [], r.get(String(p.id)) ?? []))
}

export async function loadMeetings(planCodeById: Map<string, string>): Promise<MrmMeetingRow[]> {
  const { data, error } = await supabase.from('mrm_meetings').select('*').order('held_on', { ascending: false })
  if (error) throw error
  return rows(data).map((r) => mapMeetingRow(r, planCodeById))
}

export async function loadUsers(): Promise<MrmUser[]> {
  try {
    const list = await fetchTeamUsers()
    return list
      .filter((u) => u.status.toLowerCase() !== 'inactive')
      .map((u) => ({ id: u.id, name: u.full_name || u.email || u.id, designation: u.designation }))
      .sort((x, y) => x.name.localeCompare(y.name))
  } catch {
    return []
  }
}

export async function loadMeetingForm(meeting: MrmMeetingRow): Promise<MrmMeetingForm> {
  const id = meeting.id
  const [att, inp, out, act] = await Promise.all([
    supabase.from('mrm_meeting_attendance').select('*').eq('meeting_id', id).order('sort_order'),
    supabase.from('mrm_meeting_inputs').select('*').eq('meeting_id', id),
    supabase.from('mrm_meeting_outputs').select('*').eq('meeting_id', id).order('sort_order'),
    supabase.from('mrm_actions').select('*').eq('meeting_id', id).order('sort_order'),
  ])
  for (const res of [att, inp, out, act]) if (res.error) throw res.error
  const inputByCode = new Map(rows(inp.data).map((r) => [String(r.input_code), r]))
  return {
    meetingNo: meeting.meetingNo,
    heldOn: meeting.heldOn,
    venue: meeting.venue,
    chairedBy: meeting.chairedBy,
    periodFrom: meeting.periodFrom,
    periodTo: meeting.periodTo,
    closingRemarks: meeting.closingRemarks,
    attendance: rows(att.data).map((r) => ({
      key: `saved-${String(r.id)}`,
      userId: String(r.user_id ?? ''),
      name: String(r.name ?? ''),
      designation: String(r.designation ?? ''),
      present: r.present !== false,
    })),
    inputs: MRM_INPUT_CODES.map((code) => {
      const r = inputByCode.get(code)
      return {
        id: r ? String(r.id) : '',
        code,
        title: String(r?.title ?? '') || mrmInputDefaultTitle(code),
        summary: parseSummary(r?.summary_data),
        pulledAt: r?.pulled_at ? String(r.pulled_at) : null,
        discussion: String(r?.discussion ?? ''),
        conclusion: String(r?.conclusion ?? ''),
      }
    }),
    outputs: rows(out.data).map((r) => ({
      key: `saved-${String(r.id)}`,
      outputType: asOutputType(r.output_type),
      decision: String(r.decision ?? ''),
    })),
    actions: rows(act.data).map(mapActionRow),
  }
}

/** Create a draft meeting from an MRM plan (inputs a - o, attendees from plan recipients). */
export async function createMeetingFromPlan(opts: {
  plan: MrmPlanRow
  meetingNo: string
  heldOn: string
  periodFrom: string
  periodTo: string
}): Promise<string> {
  const { plan } = opts
  const { data, error } = await supabase
    .from('mrm_meetings')
    .insert({
      mrm_plan_id: plan.id,
      meeting_no: opts.meetingNo.trim(),
      held_on: opts.heldOn,
      venue: plan.venue,
      chaired_by: plan.chairperson,
      period_from: opts.periodFrom || null,
      period_to: opts.periodTo || null,
    })
    .select('id')
    .single()
  if (error) throw error
  const meetingId = String((data as Row).id)

  const agendaByCode = new Map(plan.agendaItems.map((a) => [a.clauseLetter, a]))
  const inputRows = MRM_INPUT_CODES.map((code) => {
    const a = agendaByCode.get(code)
    return {
      meeting_id: meetingId,
      input_code: code,
      title: a?.title || mrmInputDefaultTitle(code),
      discussion: a?.remarks ?? '',
    }
  })
  const attendanceRows = plan.recipients
    .filter((r) => r.name.trim())
    .map((r, i) => ({
      meeting_id: meetingId,
      user_id: r.userId || null,
      name: r.name.trim(),
      designation: r.designation,
      present: true,
      sort_order: i + 1,
    }))
  const [inpRes, attRes] = await Promise.all([
    supabase.from('mrm_meeting_inputs').insert(inputRows),
    attendanceRows.length ? supabase.from('mrm_meeting_attendance').insert(attendanceRows) : Promise.resolve({ error: null }),
  ])
  if (inpRes.error) throw inpRes.error
  if (attRes.error) throw attRes.error
  return meetingId
}

/** Default review period: day after the last meeting's period, else 12 months up to the meeting. */
export function defaultPeriod(heldOn: string, previous: MrmMeetingRow[]): { from: string; to: string } {
  const to = heldOn
  const last = previous
    .filter((m) => m.periodTo && m.periodTo < heldOn)
    .sort((a, b) => b.periodTo.localeCompare(a.periodTo))[0]
  const from = last ? shiftIsoDate(last.periodTo, { days: 1 }) : shiftIsoDate(heldOn, { months: -12, days: 1 })
  return { from, to }
}

function actionPayload(a: MrmActionForm, index: number) {
  return {
    action: a.action.trim(),
    owner_user_id: a.ownerUserId || null,
    owner_name: a.ownerName.trim(),
    due_on: a.dueOn || null,
    status: a.status,
    closed_on: a.status === 'done' ? a.closedOn || null : null,
    closure_evidence: a.closureEvidence.trim(),
    capa_ref: a.capaRef.trim(),
    sort_order: index + 1,
  }
}

/** Save a draft / circulated meeting: header, attendance, inputs, outputs, actions. */
export async function saveMeeting(meetingId: string, form: MrmMeetingForm, savedActionIds: string[]): Promise<void> {
  const { error: mErr } = await supabase
    .from('mrm_meetings')
    .update({
      meeting_no: form.meetingNo.trim(),
      held_on: form.heldOn,
      venue: form.venue.trim(),
      chaired_by: form.chairedBy.trim(),
      period_from: form.periodFrom || null,
      period_to: form.periodTo || null,
      closing_remarks: form.closingRemarks.trim(),
    })
    .eq('id', meetingId)
  if (mErr) throw mErr

  const { error: aDel } = await supabase.from('mrm_meeting_attendance').delete().eq('meeting_id', meetingId)
  if (aDel) throw aDel
  const att = form.attendance
    .filter((a) => a.name.trim())
    .map((a, i) => ({
      meeting_id: meetingId,
      user_id: a.userId || null,
      name: a.name.trim(),
      designation: a.designation.trim(),
      present: a.present,
      sort_order: i + 1,
    }))
  if (att.length) {
    const { error } = await supabase.from('mrm_meeting_attendance').insert(att)
    if (error) throw error
  }

  const { error: iErr } = await supabase.from('mrm_meeting_inputs').upsert(
    form.inputs.map((i) => ({
      meeting_id: meetingId,
      input_code: i.code,
      title: i.title,
      summary_data: i.summary,
      pulled_at: i.pulledAt,
      discussion: i.discussion,
      conclusion: i.conclusion.trim(),
    })),
    { onConflict: 'meeting_id,input_code' },
  )
  if (iErr) throw iErr

  const { error: oDel } = await supabase.from('mrm_meeting_outputs').delete().eq('meeting_id', meetingId)
  if (oDel) throw oDel
  const outs = form.outputs
    .filter((o) => o.decision.trim())
    .map((o, i) => ({ meeting_id: meetingId, output_type: o.outputType, decision: o.decision.trim(), sort_order: i + 1 }))
  if (outs.length) {
    const { error } = await supabase.from('mrm_meeting_outputs').insert(outs)
    if (error) throw error
  }

  const keep = form.actions.filter((a) => a.action.trim())
  const keptIds = new Set(keep.map((a) => a.id).filter(Boolean))
  const removed = savedActionIds.filter((id) => !keptIds.has(id))
  if (removed.length) {
    const { error } = await supabase.from('mrm_actions').delete().in('id', removed)
    if (error) throw error
  }
  for (const [index, a] of keep.entries()) {
    if (a.id) {
      const { error } = await supabase.from('mrm_actions').update(actionPayload(a, index)).eq('id', a.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('mrm_actions').insert({ meeting_id: meetingId, ...actionPayload(a, index) })
      if (error) throw error
    }
  }
}

export async function setMeetingStatus(
  meetingId: string,
  status: 'draft' | 'minutes_circulated' | 'closed',
  extra: { closingRemarks?: string; reauthenticatedAt?: string } = {},
): Promise<void> {
  const patch: Row = { status }
  if (extra.closingRemarks !== undefined) patch.closing_remarks = extra.closingRemarks.trim()
  if (extra.reauthenticatedAt) patch.approved_reauthenticated_at = extra.reauthenticatedAt
  const { error } = await supabase.from('mrm_meetings').update(patch).eq('id', meetingId)
  if (error) throw error
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  const { data, error } = await supabase.from('mrm_meetings').delete().eq('id', meetingId).select('id')
  if (error) throw error
  if (rows(data).length === 0) throw new Error('Only the Laboratory Director can delete a draft meeting.')
}

/** Follow-up of one action (status, closure evidence, CAPA ref) — also after the meeting is closed. */
export async function saveActionFollowUp(a: MrmActionForm): Promise<void> {
  const { data, error } = await supabase
    .from('mrm_actions')
    .update({
      status: a.status,
      closed_on: a.status === 'done' ? a.closedOn || null : null,
      closure_evidence: a.closureEvidence.trim(),
      capa_ref: a.capaRef.trim(),
    })
    .eq('id', a.id)
    .select('id')
  if (error) throw error
  if (rows(data).length === 0) throw new Error('You cannot update this action.')
}

export async function loadAllActions(meetings: MrmMeetingRow[]): Promise<MrmActionListRow[]> {
  const { data, error } = await supabase.from('mrm_actions').select('*').order('due_on', { ascending: true, nullsFirst: false })
  if (error) throw error
  const byId = new Map(meetings.map((m) => [m.id, m]))
  return rows(data).map((r) => {
    const a = mapActionRow(r)
    const m = byId.get(a.meetingId)
    return {
      ...a,
      key: uiKey('list'),
      meetingNo: m?.meetingNo ?? '',
      meetingStatus: m?.status ?? 'draft',
      heldOn: m?.heldOn ?? '',
    }
  })
}

export async function loadLabName(): Promise<string> {
  try {
    const { data } = await supabase.from('lab_settings').select('lab_name').eq('id', LAB_SETTINGS_SINGLETON_ID).maybeSingle()
    return String((data as { lab_name?: string } | null)?.lab_name ?? '').trim()
  } catch {
    return ''
  }
}
