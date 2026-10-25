/**
 * Decision rules master (ISO/IEC 17025 7.1.3, 7.8.6; ILAC-G8:09/2019).
 * Table and columns come from migration 20261026100000_decision_rules.sql.
 * Until it is applied every read here returns "no rules" instead of throwing,
 * so the SRF screens and report printing keep working.
 */
import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import type {
  ConformityRule,
  DecisionRuleType,
} from '@/features/sample-handling/report-preparation/evaluateResultConformity'

export type { DecisionRuleType }

export type DecisionRuleAppliesTo = 'testing' | 'calibration' | 'both'

export type DecisionRule = ConformityRule & {
  id: string
  code: string
  name: string
  ruleType: DecisionRuleType
  guardBandFactor: number
  statementText: string
  riskNote: string
  active: boolean
  appliesTo: DecisionRuleAppliesTo
  createdAt: string | null
  updatedAt: string | null
}

export const DECISION_RULE_TYPES: DecisionRuleType[] = ['simple_acceptance', 'guard_band', 'non_binary', 'not_applied']

export const DECISION_RULE_TYPE_LABELS: Record<DecisionRuleType, string> = {
  simple_acceptance: 'Simple acceptance (w = 0)',
  guard_band: 'Guard band (w = factor × U)',
  non_binary: 'Non-binary (Pass / Conditional / Fail)',
  not_applied: 'Not applied (no decision rule)',
}

/** Rule types without a guard band factor (w = 0). */
export function ruleHasNoGuardBand(t: DecisionRuleType): boolean {
  return t === 'simple_acceptance' || t === 'not_applied'
}

/**
 * The rule as the report sees it: a "not applied" rule (DR-NR, lab decision
 * 25 Oct 2026) is recorded on the SRF but never shown on reports or
 * certificates, so it reads as no rule.
 */
export function ruleForReport(rule: DecisionRule | null): DecisionRule | null {
  return rule && rule.ruleType !== 'not_applied' ? rule : null
}

export const DECISION_RULE_APPLIES_TO_LABELS: Record<DecisionRuleAppliesTo, string> = {
  testing: 'Testing',
  calibration: 'Calibration',
  both: 'Testing & Calibration',
}

export const MIGRATION_PENDING_MESSAGE =
  'Decision rules are not available yet: database update pending (migration 20261026100000).'

const COLUMNS =
  'id, code, name, rule_type, guard_band_factor, statement_text, risk_note, active, applies_to, created_at, updated_at'

function asRuleType(v: unknown): DecisionRuleType {
  return DECISION_RULE_TYPES.includes(v as DecisionRuleType) ? (v as DecisionRuleType) : 'simple_acceptance'
}

function asAppliesTo(v: unknown): DecisionRuleAppliesTo {
  return v === 'testing' || v === 'calibration' ? v : 'both'
}

export function mapDecisionRuleRow(r: Record<string, unknown>): DecisionRule {
  const factor = Number(r.guard_band_factor ?? 0)
  return {
    id: String(r.id ?? ''),
    code: String(r.code ?? '').trim(),
    name: String(r.name ?? '').trim(),
    ruleType: asRuleType(r.rule_type),
    guardBandFactor: Number.isFinite(factor) ? factor : 0,
    statementText: String(r.statement_text ?? '').trim(),
    riskNote: String(r.risk_note ?? '').trim(),
    active: r.active !== false,
    appliesTo: asAppliesTo(r.applies_to),
    createdAt: (r.created_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  }
}

/** "DR-GB · Guard band w = U" */
export function decisionRuleLabel(rule: Pick<DecisionRule, 'code' | 'name'>): string {
  return [rule.code, rule.name].filter(Boolean).join(' · ')
}

/** Table decision_rules missing (migration not applied). */
export function isDecisionRulesTableMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  const msg = String(e.message ?? '').toLowerCase()
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  return msg.includes('decision_rules') && (msg.includes('does not exist') || msg.includes('schema cache'))
}

/** Column decision_rule_id missing on samples / calibration_service_requests. */
export function isMissingDecisionRuleIdColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  const msg = String(e.message ?? '')
  if (!msg.includes('decision_rule_id')) return false
  return e.code === 'PGRST204' || e.code === '42703' || isSupabaseMissingColumnError(e, 'decision_rule_id')
}

export type DecisionRulesResult = { rules: DecisionRule[]; available: boolean }

/** All rules (any status), ordered by code. Never throws for a missing table. */
export async function fetchDecisionRules(): Promise<DecisionRulesResult> {
  const { data, error } = await supabase.from('decision_rules').select(COLUMNS).order('code', { ascending: true })
  if (error) {
    if (isDecisionRulesTableMissingError(error)) return { rules: [], available: false }
    throw error
  }
  const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : []
  return { rules: rows.map(mapDecisionRuleRow), available: true }
}

/** Rules a contract review may pick for testing or calibration. */
export function decisionRulesFor(
  rules: DecisionRule[],
  scope: 'testing' | 'calibration',
  keepId?: string | null,
): DecisionRule[] {
  return rules.filter(
    (r) => (r.id === keepId && keepId) || (r.active && (r.appliesTo === 'both' || r.appliesTo === scope)),
  )
}

/** One rule by id, or null (missing id, table or row). Never throws. */
export async function fetchDecisionRuleById(id: string | null | undefined): Promise<DecisionRule | null> {
  const ruleId = (id ?? '').trim()
  if (!ruleId) return null
  try {
    const { data, error } = await supabase.from('decision_rules').select(COLUMNS).eq('id', ruleId).maybeSingle()
    if (error || !data) return null
    return mapDecisionRuleRow(data as unknown as Record<string, unknown>)
  } catch {
    return null
  }
}

/** Decision rule for a test report: the SRF's rule, or null when none or not applied (DR-NR). */
export async function fetchSampleReportDecisionRule(sampleId: string | null | undefined): Promise<DecisionRule | null> {
  return ruleForReport(await fetchSampleDecisionRule(sampleId))
}

/**
 * Decision rule agreed on a testing SRF (samples.decision_rule_id), or null.
 * select('*') so the query works before the migration adds the column.
 */
export async function fetchSampleDecisionRule(sampleId: string | null | undefined): Promise<DecisionRule | null> {
  const id = (sampleId ?? '').trim()
  if (!id) return null
  try {
    const { data, error } = await supabase.from('samples').select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    const ruleId = (data as Record<string, unknown>).decision_rule_id
    return typeof ruleId === 'string' ? fetchDecisionRuleById(ruleId) : null
  } catch {
    return null
  }
}

export type DecisionRuleInput = {
  code: string
  name: string
  ruleType: DecisionRuleType
  guardBandFactor: number
  statementText: string
  riskNote: string
  active: boolean
  appliesTo: DecisionRuleAppliesTo
}

function inputToPayload(input: DecisionRuleInput) {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    rule_type: input.ruleType,
    guard_band_factor: ruleHasNoGuardBand(input.ruleType) ? 0 : input.guardBandFactor,
    statement_text: input.statementText.trim(),
    risk_note: input.riskNote.trim() || null,
    active: input.active,
    applies_to: input.appliesTo,
  }
}

const NO_PERMISSION =
  'Only the Laboratory Director or the Quality Manager can change decision rules.'

export async function saveDecisionRule(id: string | null, input: DecisionRuleInput): Promise<void> {
  const payload = inputToPayload(input)
  if (id) {
    const { data, error } = await supabase.from('decision_rules').update(payload).eq('id', id).select('id')
    if (error) throw error
    if (!Array.isArray(data) || data.length === 0) throw new Error(NO_PERMISSION)
    return
  }
  const { error } = await supabase.from('decision_rules').insert(payload)
  if (error) {
    if (/row-level security/i.test(error.message ?? '')) throw new Error(NO_PERMISSION)
    throw error
  }
}

/** Deletes a rule that no SRF uses (the database refuses otherwise). */
export async function deleteDecisionRule(id: string): Promise<void> {
  const { data, error } = await supabase.from('decision_rules').delete().eq('id', id).select('id')
  if (error) {
    if (error.code === '23503' || /foreign key/i.test(error.message ?? '')) {
      throw new Error('This rule is used on an SRF and cannot be deleted. Set it Inactive instead.')
    }
    throw error
  }
  if (!Array.isArray(data) || data.length === 0) throw new Error(NO_PERMISSION)
}
