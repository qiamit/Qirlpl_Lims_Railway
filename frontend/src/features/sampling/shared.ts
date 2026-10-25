/**
 * Sampling (ISO/IEC 17025 7.3) and sampling information in reports (7.8.5).
 * Types and pure helpers shared by the sampling pages and the report print.
 * Tables: migration 20261101100200_sampling.sql. The module is OFF until the
 * Laboratory Director sets lab_settings.sampling_enabled in Lab Settings.
 */
import { supabase } from '@/lib/supabaseClient'
import { resolveLabSettingsRowId } from '@/features/settings/lab-settings/labSettingsDb'

/** Quality Manual exclusion while the lab does not sample (shown as guidance on the pages). */
export const SAMPLING_EXCLUSION_TEXT =
  'Clause 7.3 (Sampling) is excluded in the Quality Manual: the laboratory does not carry out sampling. ' +
  'Samples are tested as received from the customer, the customer is responsible for sampling, and results ' +
  'apply to the sample as received. Test reports state "Sampling Procedure Reference: Not Applicable".'

export const SAMPLING_OFF_TITLE = 'Sampling is not in use — enable it in Lab Settings'

export type SamplingPlanStatus = 'draft' | 'approved' | 'superseded' | 'withdrawn'

export type SamplingPlan = {
  id: string
  plan_no: string
  version: number
  supersedes_id: string | null
  title: string
  matrix: string | null
  is_code_id: string | null
  method_reference: string | null
  lot_size: number | null
  sample_size: number | null
  acceptance_number: number | null
  rejection_number: number | null
  aql: number | null
  inspection_level: string | null
  statistical_basis: string | null
  locations: string[] | null
  frequency: string | null
  factors_to_control: string | null
  handling_instructions: string | null
  status: SamplingPlanStatus
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  remarks: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** One handover in the chain of custody. */
export type CustodyStep = {
  at: string
  from: string
  to: string
  condition?: string
  seal_intact?: boolean | null
  remarks?: string
}

export type SamplingAttachment = { path: string; name: string; uploaded_at: string }

export type SamplingRecord = {
  id: string
  record_no: string
  plan_id: string | null
  client_id: string | null
  customer_name: string | null
  sample_id: string | null
  sampled_at: string
  sampler_id: string | null
  sampler_name: string | null
  location: string
  latitude: number | null
  longitude: number | null
  gps_accuracy_m: number | null
  location_source: 'gps' | 'manual' | null
  environmental_conditions: string | null
  ambient_temperature: number | null
  ambient_humidity: number | null
  sample_identification: string
  sample_description: string | null
  quantity: string | null
  containers: string | null
  preservation: string | null
  chain_of_custody: CustodyStep[] | null
  deviations: string | null
  customer_informed: boolean
  customer_agreed: boolean
  attachments: SamplingAttachment[] | null
  remarks: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const PLAN_STATUS_LABEL: Record<SamplingPlanStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
}

export const SAMPLING_BUCKET = 'sampling-files'

/** True when the sampling tables / column are not on this database yet. */
export function isSamplingMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /(sampling_plans|sampling_records|sampling_enabled)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function samplingErrorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export type SamplingSwitch = 'on' | 'off' | 'missing'

/**
 * lab_settings.sampling_enabled through the normal Lab Settings read.
 * 'missing' before migration 20261101100200 (column absent), 'off' when false
 * or unreadable.
 */
export async function fetchSamplingSwitch(): Promise<SamplingSwitch> {
  try {
    const id = await resolveLabSettingsRowId(supabase)
    const { data, error } = await supabase.from('lab_settings').select('sampling_enabled').eq('id', id).maybeSingle()
    if (error) return isSamplingMissingError(error) ? 'missing' : 'off'
    return (data as { sampling_enabled?: boolean } | null)?.sampling_enabled === true ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function intOrNull(v: string): number | null {
  const n = num(v)
  return n === null ? null : Math.round(n)
}

/** "SP-2026-001 v2" */
export function planLabel(p: Pick<SamplingPlan, 'plan_no' | 'version'>): string {
  return `${p.plan_no} v${p.version}`
}

/** "IS 1199 (Part 1):2018" from an is_codes row. */
export function isCodeLabel(c: { is_number?: string | null; revision_year?: string | null } | null | undefined): string {
  if (!c?.is_number) return ''
  return c.revision_year ? `${c.is_number}:${c.revision_year}` : c.is_number
}

/** Plan statistical basis on one line: "Lot 100 · n = 8 · Ac 1 / Re 2 · AQL 2.5 % · Level II". */
export function statisticalBasisText(
  p: Pick<SamplingPlan, 'lot_size' | 'sample_size' | 'acceptance_number' | 'rejection_number' | 'aql' | 'inspection_level' | 'statistical_basis'>,
): string {
  const parts: string[] = []
  if (p.lot_size != null) parts.push(`Lot ${p.lot_size}`)
  if (p.sample_size != null) parts.push(`n = ${p.sample_size}`)
  if (p.acceptance_number != null || p.rejection_number != null) {
    parts.push([p.acceptance_number != null ? `Ac ${p.acceptance_number}` : '', p.rejection_number != null ? `Re ${p.rejection_number}` : ''].filter(Boolean).join(' / '))
  }
  if (p.aql != null) parts.push(`AQL ${p.aql} %`)
  if (p.inspection_level?.trim()) parts.push(`Level ${p.inspection_level.trim()}`)
  if (p.statistical_basis?.trim()) parts.push(p.statistical_basis.trim())
  return parts.join(' · ')
}

export function gpsText(lat: number | null | undefined, lng: number | null | undefined): string | null {
  const a = num(lat)
  const b = num(lng)
  if (a === null || b === null) return null
  return `${a.toFixed(5)}, ${b.toFixed(5)}`
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function localInputToIso(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
