import { supabase } from '@/lib/supabaseClient'
import {
  extractEquipmentMasterIdFromDetail,
  initialCalibrationJobStage,
  nextCalibrationJobStage,
  previousCalibrationJobStage,
  parseDucLinesFromEquipmentDescription,
  type CalibrationJobLocation,
  type CalibrationJobRow,
  type CalibrationJobStage,
} from '../types'

const JOB_SELECT =
  'id, service_request_id, equipment_line_index, srf_number, client_id, client_name, equipment_label, equipment_detail, equipment_master_id, calibration_location, stage, stage_entered_at, remarks, allocated_engineer_id, allocated_engineer_name, outgoing_checklist, inward_checklist, certificate_draft, created_at, updated_at'

export async function fetchCalibrationJobsByStage(
  stage: CalibrationJobStage | CalibrationJobStage[],
  opts?: {
    allocatedEngineerId?: string | null
    calibrationLocation?: CalibrationJobLocation | null
  },
): Promise<CalibrationJobRow[]> {
  const stages = Array.isArray(stage) ? stage : [stage]
  let query = supabase
    .from('calibration_jobs')
    .select(JOB_SELECT)
    .in('stage', stages)
    .order('stage_entered_at', { ascending: false })

  if (opts?.allocatedEngineerId) {
    query = query.eq('allocated_engineer_id', opts.allocatedEngineerId)
  }
  if (opts?.calibrationLocation) {
    query = query.eq('calibration_location', opts.calibrationLocation)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CalibrationJobRow[]
}

export async function updateCalibrationJobLocation(
  id: string,
  location: CalibrationJobLocation,
): Promise<void> {
  const { error } = await supabase
    .from('calibration_jobs')
    .update({ calibration_location: location })
    .eq('id', id)
  if (error) throw error
}

export async function updateCalibrationJobEngineer(
  id: string,
  engineer: { id: string | null; name: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('calibration_jobs')
    .update({
      allocated_engineer_id: engineer.id,
      allocated_engineer_name: engineer.name,
    })
    .eq('id', id)
  if (error) throw error
}

export async function updateCalibrationJobOutsideChecklist(
  id: string,
  kind: 'outgoing' | 'inward',
  payload: Record<string, unknown>,
): Promise<void> {
  const column = kind === 'outgoing' ? 'outgoing_checklist' : 'inward_checklist'
  const { error } = await supabase
    .from('calibration_jobs')
    .update({ [column]: payload })
    .eq('id', id)
  if (error) throw error
}

export type CalibrationEngineerOption = {
  id: string
  name: string
  designation: string
}

export async function fetchCalibrationEngineerOptions(): Promise<CalibrationEngineerOption[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, designation, status')
    .order('full_name', { ascending: true })
  if (error) throw error

  return (data ?? [])
    .filter((u) => String((u as { status?: string }).status ?? '').toLowerCase() !== 'inactive')
    .map((u) => {
      const id = String((u as { id: string }).id)
      const name =
        String((u as { full_name?: string }).full_name ?? '').trim() || id
      const designation = String((u as { designation?: string }).designation ?? '').trim()
      return { id, name, designation }
    })
}

export async function moveCalibrationJobStage(
  ids: string[],
  nextStage: CalibrationJobStage,
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('calibration_jobs')
    .update({
      stage: nextStage,
      stage_entered_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (error) throw error
}

export async function moveCalibrationJobsToNextStage(ids: string[]): Promise<{
  moved: number
  skippedTerminal: number
}> {
  if (ids.length === 0) return { moved: 0, skippedTerminal: 0 }

  const { data, error } = await supabase
    .from('calibration_jobs')
    .select('id, stage')
    .in('id', ids)
  if (error) throw error

  const byNext = new Map<CalibrationJobStage, string[]>()
  let skippedTerminal = 0
  for (const row of data ?? []) {
    const next = nextCalibrationJobStage(row.stage as CalibrationJobStage)
    if (!next) {
      skippedTerminal += 1
      continue
    }
    const list = byNext.get(next) ?? []
    list.push(row.id as string)
    byNext.set(next, list)
  }

  let moved = 0
  for (const [nextStage, jobIds] of byNext) {
    await moveCalibrationJobStage(jobIds, nextStage)
    moved += jobIds.length
  }
  return { moved, skippedTerminal }
}

export async function moveCalibrationJobsToPreviousStage(ids: string[]): Promise<{
  moved: number
  skippedFirst: number
}> {
  if (ids.length === 0) return { moved: 0, skippedFirst: 0 }

  const { data, error } = await supabase
    .from('calibration_jobs')
    .select('id, stage')
    .in('id', ids)
  if (error) throw error

  const byPrev = new Map<CalibrationJobStage, string[]>()
  let skippedFirst = 0
  for (const row of data ?? []) {
    const prev = previousCalibrationJobStage(row.stage as CalibrationJobStage)
    if (!prev) {
      skippedFirst += 1
      continue
    }
    const list = byPrev.get(prev) ?? []
    list.push(row.id as string)
    byPrev.set(prev, list)
  }

  let moved = 0
  for (const [prevStage, jobIds] of byPrev) {
    await moveCalibrationJobStage(jobIds, prevStage)
    moved += jobIds.length
  }
  return { moved, skippedFirst }
}

/**
 * Job Allocation → Service Request referback (Sample Allocation → Receiving pattern).
 * Deletes DUC jobs (raw sheets cascade) and reopens SRF as Under Review when no jobs remain.
 */
export async function referbackCalibrationJobsToServiceRequest(ids: string[]): Promise<{
  removed: number
  srfReopened: number
}> {
  if (ids.length === 0) return { removed: 0, srfReopened: 0 }

  const { data, error } = await supabase
    .from('calibration_jobs')
    .select('id, service_request_id, stage')
    .in('id', ids)
  if (error) throw error

  const rows = (data ?? []) as Array<{
    id: string
    service_request_id: string
    stage: string
  }>
  const atAllocation = rows.filter((r) => r.stage === 'job_allocation')
  if (atAllocation.length === 0) return { removed: 0, srfReopened: 0 }

  const jobIds = atAllocation.map((r) => r.id)
  const srfIds = [...new Set(atAllocation.map((r) => r.service_request_id).filter(Boolean))]

  const { error: delError } = await supabase.from('calibration_jobs').delete().in('id', jobIds)
  if (delError) throw delError

  let srfReopened = 0
  for (const srfId of srfIds) {
    const { count, error: countError } = await supabase
      .from('calibration_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('service_request_id', srfId)
    if (countError) throw countError
    if ((count ?? 0) > 0) continue

    const { error: srfError } = await supabase
      .from('calibration_service_requests')
      .update({ status: 'Under Review' })
      .eq('id', srfId)
    if (srfError) throw srfError
    srfReopened += 1
  }

  return { removed: jobIds.length, srfReopened }
}

type EnsureJobsArgs = {
  serviceRequestId: string
  srfNumber: string
  clientId: string | null
  clientName: string | null
  equipmentDescription: string | null
}

/**
 * Create missing per-DUC jobs (+ empty raw data sheets) for an Accepted SRF.
 * Jobs start at Job Allocation (Inside/Outside finalized there).
 */
export async function ensureCalibrationJobsForAcceptedSrf(
  args: EnsureJobsArgs,
): Promise<{ created: number }> {
  const lines = parseDucLinesFromEquipmentDescription(args.equipmentDescription)
  if (lines.length === 0) return { created: 0 }

  const { data: existing, error: existingErr } = await supabase
    .from('calibration_jobs')
    .select('equipment_line_index')
    .eq('service_request_id', args.serviceRequestId)
  if (existingErr) throw existingErr

  const existingIdx = new Set(
    (existing ?? []).map((r) => Number((r as { equipment_line_index: number }).equipment_line_index)),
  )

  const toInsert = lines.filter((l) => !existingIdx.has(l.lineIndex))
  if (toInsert.length === 0) return { created: 0 }

  const stage = initialCalibrationJobStage()
  const jobRows = toInsert.map((line) => ({
    service_request_id: args.serviceRequestId,
    equipment_line_index: line.lineIndex,
    srf_number: args.srfNumber,
    client_id: args.clientId,
    client_name: args.clientName,
    equipment_label: line.label,
    equipment_detail: line.detail,
    equipment_master_id: line.equipmentMasterId,
    calibration_location: line.location,
    stage,
    stage_entered_at: new Date().toISOString(),
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from('calibration_jobs')
    .insert(jobRows)
    .select('id')
  if (insertErr) throw insertErr

  const sheetRows = (inserted ?? []).map((j) => ({
    calibration_job_id: (j as { id: string }).id,
    sheet_status: 'draft',
    payload: {},
  }))
  if (sheetRows.length > 0) {
    const { error: sheetErr } = await supabase
      .from('calibration_raw_data_sheets')
      .insert(sheetRows)
    if (sheetErr) throw sheetErr
  }

  return { created: jobRows.length }
}

export type CalibrationRawDataSheetRow = {
  id: string
  calibration_job_id: string
  sheet_status: 'draft' | 'under_review' | 'approved'
  payload: Record<string, unknown>
  reviewed_at: string | null
  reviewed_by: string | null
}

export async function fetchRawDataSheetByJobId(
  jobId: string,
): Promise<CalibrationRawDataSheetRow | null> {
  const { data, error } = await supabase
    .from('calibration_raw_data_sheets')
    .select('id, calibration_job_id, sheet_status, payload, reviewed_at, reviewed_by')
    .eq('calibration_job_id', jobId)
    .maybeSingle()
  if (error) throw error
  return data as CalibrationRawDataSheetRow | null
}

export async function updateRawDataSheetPayload(
  sheetId: string,
  payload: Record<string, unknown>,
  sheetStatus?: 'draft' | 'under_review' | 'approved',
): Promise<void> {
  const update: Record<string, unknown> = { payload }
  if (sheetStatus) update.sheet_status = sheetStatus
  const { error } = await supabase
    .from('calibration_raw_data_sheets')
    .update(update)
    .eq('id', sheetId)
  if (error) throw error
}

export async function ensureRawDataSheetForJob(jobId: string): Promise<CalibrationRawDataSheetRow> {
  const existing = await fetchRawDataSheetByJobId(jobId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('calibration_raw_data_sheets')
    .insert({
      calibration_job_id: jobId,
      sheet_status: 'draft',
      payload: {},
    })
    .select('id, calibration_job_id, sheet_status, payload, reviewed_at, reviewed_by')
    .single()
  if (error) throw error
  return data as CalibrationRawDataSheetRow
}

export type EquipmentMasterForSheet = {
  id: string
  equipment_name: string
  measurement_ranges: unknown
  range_capacity: string | null
  resolution_least_count: string | null
  raw_data_sheet_template: unknown
  /** Measurement Uncertainty (MU) calculation sheet template. */
  mu_calculation_template?: unknown
  /** Generate Report button visibility + defaults. */
  generate_report_config?: unknown
  /** Per-equipment Calibration Certificate template. */
  certificate_template_config?: unknown
  calibration_method_label: string | null
  master_equipment_id?: string | null
}

export async function fetchEquipmentMasterForSheet(
  equipmentMasterId: string,
): Promise<EquipmentMasterForSheet | null> {
  const { data, error } = await supabase
    .from('equipment_master')
    .select(
      'id, equipment_name, measurement_ranges, range_capacity, resolution_least_count, raw_data_sheet_template, mu_calculation_template, generate_report_config, certificate_template_config, calibration_method_label, master_equipment_id',
    )
    .eq('id', equipmentMasterId)
    .maybeSingle()
  if (error) throw error
  return data as EquipmentMasterForSheet | null
}

export type MasterEquipmentForSheet = {
  id: string
  asset_code: string
  equipment_name: string
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
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
  current_location: string | null
}

export async function fetchMasterEquipmentsByIds(
  ids: string[],
): Promise<MasterEquipmentForSheet[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return []

  const { data, error } = await supabase
    .from('equipment_for_calibration')
    .select(
      'id, asset_code, equipment_name, manufacturer, model_number, serial_number, equipment_status, range_capacity, resolution_least_count, accuracy_acceptance_criteria, calibration_frequency, last_calibration_date, next_calibration_due, calibration_certificate_number, calibration_certificate_uncertainty, calibration_uncertainty_unit, calibration_coverage_factor, current_location',
    )
    .in('id', unique)
  if (error) throw error

  // Keep Calibration Equipment tab order (Master 1, Master 2, …), not asset_code sort.
  const byId = new Map(
    ((data ?? []) as MasterEquipmentForSheet[]).map((row) => [row.id, row]),
  )
  return unique.map((id) => byId.get(id)).filter((row): row is MasterEquipmentForSheet => !!row)
}

const SHEET_EQ_SELECT =
  'id, equipment_name, serial_number, equipment_status, measurement_ranges, range_capacity, resolution_least_count, raw_data_sheet_template, mu_calculation_template, generate_report_config, certificate_template_config, calibration_method_label, master_equipment_id'

type EquipmentMasterResolveRow = EquipmentMasterForSheet & {
  serial_number: string | null
  equipment_status: string | null
}

function takePrefixedFromDetail(detail: string, prefix: RegExp): string {
  const parts = detail.split('·').map((p) => p.trim()).filter(Boolean)
  const idx = parts.findIndex((p) => prefix.test(p))
  if (idx < 0) return ''
  return parts[idx]!.replace(prefix, '').trim()
}

/**
 * Resolve Calibration Equipment for a job when equipment_master_id / EQID is missing
 * (legacy jobs created before EQID embedding).
 */
export async function resolveEquipmentMasterForJob(job: {
  id: string
  equipment_label: string
  equipment_detail: string
  equipment_master_id: string | null
}): Promise<EquipmentMasterForSheet | null> {
  const fromFk = job.equipment_master_id?.trim() || null
  const fromEqid = extractEquipmentMasterIdFromDetail(job.equipment_detail || '')
  const directId = fromFk || fromEqid

  if (directId) {
    const row = await fetchEquipmentMasterForSheet(directId)
    if (row) {
      if (!fromFk) {
        try {
          await syncJobEquipmentMasterId(job.id, row.id)
        } catch {
          // non-fatal
        }
      }
      return row
    }
  }

  const label = (job.equipment_label || '').trim()
  if (!label) return null

  const detail = job.equipment_detail || ''
  const serial = takePrefixedFromDetail(detail, /^s\/n\s+/i)

  const { data, error } = await supabase
    .from('equipment_master')
    .select(SHEET_EQ_SELECT)
    .ilike('equipment_name', label)
  if (error) throw error

  let candidates = (data ?? []) as EquipmentMasterResolveRow[]

  // Broader fallback: name contains label or label contains name
  if (candidates.length === 0) {
    const { data: all, error: allErr } = await supabase
      .from('equipment_master')
      .select(SHEET_EQ_SELECT)
      .order('equipment_name', { ascending: true })
      .limit(500)
    if (allErr) throw allErr
    const needle = label.toLowerCase()
    candidates = ((all ?? []) as EquipmentMasterResolveRow[]).filter((r) => {
      const name = (r.equipment_name || '').trim().toLowerCase()
      return name === needle || name.includes(needle) || needle.includes(name)
    })
  }

  if (candidates.length === 0) return null

  let chosen = candidates[0]!
  if (serial) {
    const bySerial = candidates.find(
      (r) => (r.serial_number || '').trim().toLowerCase() === serial.toLowerCase(),
    )
    if (bySerial) chosen = bySerial
  } else if (candidates.length > 1) {
    const active = candidates.find(
      (r) => String(r.equipment_status ?? '').toLowerCase() === 'active',
    )
    if (active) chosen = active
  }

  try {
    await syncJobEquipmentMasterId(job.id, chosen.id)
  } catch {
    // non-fatal
  }

  return {
    id: chosen.id,
    equipment_name: chosen.equipment_name,
    measurement_ranges: chosen.measurement_ranges,
    range_capacity: chosen.range_capacity,
    resolution_least_count: chosen.resolution_least_count,
    raw_data_sheet_template: chosen.raw_data_sheet_template,
    mu_calculation_template: chosen.mu_calculation_template,
    generate_report_config: chosen.generate_report_config,
    certificate_template_config: chosen.certificate_template_config,
    calibration_method_label: chosen.calibration_method_label ?? null,
    master_equipment_id: chosen.master_equipment_id ?? null,
  }
}

/** Backfill job.equipment_master_id when older SRF lines already embed EQID. */
export async function syncJobEquipmentMasterId(
  jobId: string,
  equipmentMasterId: string,
): Promise<void> {
  const { error } = await supabase
    .from('calibration_jobs')
    .update({ equipment_master_id: equipmentMasterId })
    .eq('id', jobId)
  if (error) throw error
}

export type SrfSummaryForSheet = {
  id: string
  srf_number: string
  srf_date: string | null
  client_id: string | null
  client_name: string | null
  customer_reference_no: string | null
  customer_reference_date: string | null
  calibration_location: string | null
  contact_person: string | null
  contact_number_mail: string | null
  /** Resolved from Client Master when SRF contact_number_mail is blank. */
  contact_email: string | null
  contact_phone: string | null
  /** Full postal address from Client Master. */
  customer_address: string | null
  customer_required_date: string | null
  required_completion_date: string | null
  method_notes: string | null
  accreditation_status: string | null
  special_instruction: string | null
  status: string | null
}

const CLIENT_SHEET_SELECT =
  'id, contact_person_name, email, country_code, mobile, address, district, pin_code, state, country'

export async function fetchSrfSummaryForSheet(
  serviceRequestId: string,
  opts?: { clientId?: string | null; clientName?: string | null },
): Promise<SrfSummaryForSheet | null> {
  const { data, error } = await supabase
    .from('calibration_service_requests')
    .select(
      'id, srf_number, srf_date, client_id, client_name, customer_reference_no, customer_reference_date, calibration_location, contact_person, contact_number_mail, customer_required_date, required_completion_date, method_notes, accreditation_status, special_instruction, status',
    )
    .eq('id', serviceRequestId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as SrfSummaryForSheet
  row.contact_email = null
  row.contact_phone = null
  row.customer_address = null

  // Parse email out of SRF contact_number_mail if it embeds one
  const srfMailRaw = (row.contact_number_mail ?? '').trim()
  if (srfMailRaw) {
    const emailMatch = srfMailRaw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    if (emailMatch) row.contact_email = emailMatch[0]
    const withoutEmail = srfMailRaw
      .replace(emailMatch?.[0] ?? '', '')
      .replace(/[·/|,]+/g, ' ')
      .trim()
    if (withoutEmail) row.contact_phone = withoutEmail
  }

  const hasContact = Boolean((row.contact_person ?? '').trim())
  const hasMail = Boolean((row.contact_email ?? '').trim() || (row.contact_number_mail ?? '').trim())

  let clientId = (row.client_id ?? opts?.clientId ?? '').trim()
  const clientName = (row.client_name ?? opts?.clientName ?? '').trim()

  let client: ClientContactSource | null = null

  if (!clientId && clientName) {
    const { data: byName, error: nameErr } = await supabase
      .from('clients')
      .select(CLIENT_SHEET_SELECT)
      .ilike('company_name', clientName)
      .limit(1)
      .maybeSingle()
    if (nameErr) throw nameErr
    if (byName) {
      clientId = String((byName as { id: string }).id)
      client = byName as ClientContactSource
    }
  }

  if (!client && clientId) {
    const { data: byId, error: clientErr } = await supabase
      .from('clients')
      .select(CLIENT_SHEET_SELECT)
      .eq('id', clientId)
      .maybeSingle()
    if (clientErr) throw clientErr
    if (byId) client = byId as ClientContactSource
  }

  if (client) {
    applyClientContactFallback(row, client, hasContact, hasMail)
  }

  return row
}

type ClientContactSource = {
  contact_person_name?: string | null
  email?: string | null
  country_code?: string | null
  mobile?: string | null
  address?: string | null
  district?: string | null
  pin_code?: string | null
  state?: string | null
  country?: string | null
}

function formatCustomerAddress(client: ClientContactSource): string | null {
  const parts = [
    client.address,
    client.district,
    client.pin_code,
    client.state,
    client.country,
  ]
    .map((p) => String(p ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function applyClientContactFallback(
  row: SrfSummaryForSheet,
  client: ClientContactSource,
  hasContact: boolean,
  hasMail: boolean,
) {
  if (!hasContact) {
    row.contact_person = String(client.contact_person_name ?? '').trim() || null
  }

  const email = String(client.email ?? '').trim()
  const phone = [client.country_code, client.mobile]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ')

  if (!row.contact_email && email) row.contact_email = email
  if (!row.contact_phone && phone) row.contact_phone = phone

  if (!hasMail) {
    const parts = [email, phone].filter(Boolean)
    row.contact_number_mail = parts.join(' · ') || null
  }

  row.customer_address = formatCustomerAddress(client)
}

export async function fetchCertificateDraftByJobId(
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('calibration_jobs')
    .select('certificate_draft')
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw error
  const draft = (data as { certificate_draft?: unknown } | null)?.certificate_draft
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null
  return draft as Record<string, unknown>
}

export async function updateCalibrationJobCertificateDraft(
  jobId: string,
  draft: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('calibration_jobs')
    .update({ certificate_draft: draft })
    .eq('id', jobId)
  if (error) throw error
}

/** Suggest next certificate number from Lab Settings prefixes + existing drafts. */
export async function suggestCalibrationCertificateNumber(): Promise<string> {
  const FALLBACK_PREFIX = 'QI/CC'
  const { data: prefixes, error: prefixErr } = await supabase
    .from('lab_prefixes')
    .select('name, prefix')
    .order('name', { ascending: true })
  if (prefixErr) {
    console.warn('[suggestCalibrationCertificateNumber]', prefixErr.message)
  }

  const rows = (Array.isArray(prefixes) ? prefixes : []) as Array<{
    name: string
    prefix: string
  }>
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const byName = new Map(
    rows
      .map((r) => ({ name: String(r.name ?? '').trim(), prefix: String(r.prefix ?? '').trim() }))
      .filter((r) => r.name && r.prefix)
      .map((r) => [normalize(r.name), r.prefix] as const),
  )

  const preferred = [
    'Calibration Certificate',
    'Certificate Number',
    'Calibration Cert',
    'CC',
  ]
  let prefix = ''
  for (const name of preferred) {
    const hit = byName.get(normalize(name))
    if (hit) {
      prefix = hit
      break
    }
  }
  if (!prefix) {
    const fuzzy = rows.find((r) => {
      const n = normalize(String(r.name ?? ''))
      return n.includes('calibration') && n.includes('cert')
    })
    prefix = String(fuzzy?.prefix ?? '').trim()
  }
  if (!prefix) prefix = FALLBACK_PREFIX

  const year = new Date().getFullYear()
  const yearToken = String(year)
  const { data: jobs, error: jobsErr } = await supabase
    .from('calibration_jobs')
    .select('certificate_draft')
    .neq('certificate_draft', '{}')
    .limit(500)
  if (jobsErr) {
    console.warn('[suggestCalibrationCertificateNumber]', jobsErr.message)
    return `${prefix}/${yearToken}/0001`
  }

  let maxSerial = 0
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}[/\\-]?${yearToken}[/\\-]?(\\d{1,6})$`, 'i')
  // Also accept bare serial after year when drafts used QI/CC/YYYY/NNNN
  const looseRe = new RegExp(
    `(?:^|[\\/\\-])${yearToken}[\\/\\-](\\d{1,6})$`,
    'i',
  )
  for (const row of jobs ?? []) {
    const draft = (row as { certificate_draft?: unknown }).certificate_draft
    if (!draft || typeof draft !== 'object') continue
    const num = String(
      (draft as Record<string, unknown>).certificateNumber ??
        (draft as Record<string, unknown>).certificate_number ??
        '',
    ).trim()
    if (!num) continue
    const m = num.match(re) ?? (num.toUpperCase().includes(prefix.toUpperCase()) ? num.match(looseRe) : null)
    if (m?.[1]) maxSerial = Math.max(maxSerial, Number.parseInt(m[1], 10) || 0)
  }

  const next = String(maxSerial + 1).padStart(4, '0')
  return `${prefix}/${yearToken}/${next}`
}
