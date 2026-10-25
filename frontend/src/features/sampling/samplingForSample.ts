/**
 * The sampling record of a lab sample (ISO/IEC 17025 7.3.3) and what the test
 * report prints about it (7.8.5).
 *
 * Returns null whenever sampling does not apply, so callers change nothing:
 * sampling switched off in Lab Settings, migration 20261101100200 not applied,
 * no record linked to the sample, or a read error (additive information must
 * never block a report).
 */
import { supabase } from '@/lib/supabaseClient'
import type { ReportSamplingInfo } from './samplingReportBlock'
import {
  fetchSamplingSwitch,
  gpsText,
  isCodeLabel,
  planLabel,
  type SamplingPlan,
  type SamplingRecord,
} from './shared'

export type SamplingRecordForSample = SamplingRecord & {
  plan:
    | (Pick<SamplingPlan, 'id' | 'plan_no' | 'version' | 'title' | 'method_reference'> & {
        is_code: { is_number: string | null; revision_year: string | null } | null
      })
    | null
}

const SELECT =
  '*, plan:sampling_plans!plan_id(id, plan_no, version, title, method_reference, is_code:is_codes(is_number, revision_year))'

/** The sampling record linked to a sample (one per sample), or null. Ignores the on / off switch. */
export async function samplingForSample(sampleId: string | null | undefined): Promise<SamplingRecordForSample | null> {
  if (!sampleId) return null
  try {
    const { data, error } = await supabase
      .from('sampling_records')
      .select(SELECT)
      .eq('sample_id', sampleId)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return data as unknown as SamplingRecordForSample
  } catch {
    return null
  }
}

/** "SP-2026-001 v2 — IS 1199 (Part 1):2018 cl 6" (plan and method reference). */
export function samplingPlanReference(rec: Pick<SamplingRecordForSample, 'plan'>): string {
  const plan = rec.plan
  if (!plan) return ''
  const method = plan.method_reference?.trim() || isCodeLabel(plan.is_code)
  return [planLabel(plan), method].filter(Boolean).join(' — ')
}

/** Conditions during sampling on one line: text, temperature, RH. */
export function samplingConditionsText(
  rec: Pick<SamplingRecord, 'environmental_conditions' | 'ambient_temperature' | 'ambient_humidity'>,
): string {
  const parts: string[] = []
  if (rec.environmental_conditions?.trim()) parts.push(rec.environmental_conditions.trim())
  if (rec.ambient_temperature != null) parts.push(`${rec.ambient_temperature} °C`)
  if (rec.ambient_humidity != null) parts.push(`RH ${rec.ambient_humidity} %`)
  return parts.join('; ')
}

/** Print data for the report from a sampling record. */
export function reportSamplingInfo(rec: SamplingRecordForSample): ReportSamplingInfo {
  return {
    recordNo: rec.record_no,
    sampledAt: rec.sampled_at ?? null,
    samplerName: rec.sampler_name ?? '',
    location: rec.location ?? '',
    gps: gpsText(rec.latitude, rec.longitude),
    planReference: samplingPlanReference(rec),
    environmentalConditions: samplingConditionsText(rec),
    deviations: rec.deviations ?? '',
    customerInformed: Boolean(rec.customer_informed),
    customerAgreed: Boolean(rec.customer_agreed),
  }
}

/**
 * Sampling information for a sample's test report, or null (sampling off,
 * not set up, no linked record).
 */
export async function fetchSamplingForReport(sampleId: string | null | undefined): Promise<ReportSamplingInfo | null> {
  if (!sampleId) return null
  if ((await fetchSamplingSwitch()) !== 'on') return null
  const rec = await samplingForSample(sampleId)
  return rec ? reportSamplingInfo(rec) : null
}
