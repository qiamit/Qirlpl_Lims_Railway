import { supabase } from '@/lib/supabaseClient'
import {
  fetchDecisionRuleById,
  type DecisionRule,
} from '@/features/masters/decision-rules/decisionRules'

/**
 * ISO/IEC 17025:2017 7.1.3 / 7.8.6: a statement of conformity is given only when
 * the customer asked for it, with the decision rule agreed on the SRF
 * (calibration_service_requests.statement_of_conformity_requested,
 * decision_rule_id and the older free-text decision_rule).
 */
export type SrfConformityPolicy = {
  requested: boolean
  rule: DecisionRule | null
  /** Older free-text decision rule on the SRF. */
  ruleText: string
}

export const NO_CONFORMITY_POLICY: SrfConformityPolicy = { requested: false, rule: null, ruleText: '' }

/** Neutral certificate note when no statement of conformity was requested. */
export const NO_CONFORMITY_STATEMENT_NOTE = 'No statement of conformity was requested by the customer.'

const RULE_NOT_RECORDED_NOTE =
  'A statement of conformity was requested by the customer; the decision rule is not recorded on the SRF.'

/**
 * Reads the conformity request from the SRF. select('*') so it works before
 * migration 20261026100000; any read error means "not requested".
 */
export async function fetchSrfConformityPolicy(
  serviceRequestId: string | null | undefined,
): Promise<SrfConformityPolicy> {
  const id = (serviceRequestId ?? '').trim()
  if (!id) return NO_CONFORMITY_POLICY
  try {
    const { data, error } = await supabase
      .from('calibration_service_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return NO_CONFORMITY_POLICY
    const row = data as Record<string, unknown>
    const requested = row.statement_of_conformity_requested === true
    const ruleId = typeof row.decision_rule_id === 'string' ? row.decision_rule_id : null
    return {
      requested,
      rule: requested && ruleId ? await fetchDecisionRuleById(ruleId) : null,
      ruleText: typeof row.decision_rule === 'string' ? row.decision_rule.trim() : '',
    }
  } catch {
    return NO_CONFORMITY_POLICY
  }
}

/** The conformity note for the certificate notes. */
export function certificateConformityNote(policy: SrfConformityPolicy): string {
  if (!policy.requested) return NO_CONFORMITY_STATEMENT_NOTE
  const statement = policy.rule?.statementText.trim()
  if (statement) return statement
  if (policy.ruleText) return `Decision rule (agreed with the customer): ${policy.ruleText.replace(/\.\s*$/, '')}.`
  return RULE_NOT_RECORDED_NOTE
}

/** Lines that are a conformity note written by this module or the old default notes. */
function isConformityNoteLine(body: string, policy: SrfConformityPolicy): boolean {
  const t = body.trim()
  if (!t) return false
  if (/customer does not have requirement of conformity statement/i.test(t)) return true
  if (/^no statement of conformity was requested/i.test(t)) return true
  if (/^a statement of conformity was requested by the customer; the decision rule is not recorded/i.test(t)) return true
  if (/^decision rule\b/i.test(t)) return true
  const statement = policy.rule?.statementText.trim()
  return Boolean(statement && t === statement)
}

const NUMBER_PREFIX = /^(\s*\d+\s*[.)]\s*)/

/**
 * Puts the right conformity note into certificate notes: replaces the old
 * hard-coded "customer does not have requirement of conformity statement"
 * line (or the first note this function wrote before) keeping its number. When there
 * is no such line, a requested statement is added as the next numbered note;
 * otherwise the notes are left as they are.
 */
export function applyCertificateConformityNote(notes: string, policy: SrfConformityPolicy): string {
  const note = certificateConformityNote(policy)
  const lines = notes.split('\n')
  let replaced = false
  const next = lines.map((line) => {
    const prefix = line.match(NUMBER_PREFIX)?.[1] ?? ''
    const body = line.slice(prefix.length)
    if (replaced || !isConformityNoteLine(body, policy)) return line
    replaced = true
    return `${prefix}${note}`
  })
  if (replaced) return next.join('\n')
  if (!policy.requested) return notes
  const numbers = lines
    .map((l) => Number.parseInt(l.match(NUMBER_PREFIX)?.[1] ?? '', 10))
    .filter((n) => Number.isFinite(n))
  const trimmed = notes.replace(/\s+$/, '')
  const line = numbers.length > 0 ? `${Math.max(...numbers) + 1}. ${note}` : note
  return trimmed ? `${trimmed}\n${line}` : line
}
