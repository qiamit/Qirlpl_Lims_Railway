/**
 * Statement of conformity for one test result (ISO/IEC 17025 7.1.3, 7.8.6).
 *
 * evaluateResultConformity(observed, requirement) with no rule is exactly the
 * original behaviour (simple acceptance, measurement uncertainty ignored), so
 * reports of samples without a decision rule do not change.
 *
 * With a decision rule (ILAC-G8:09/2019) and the result's expanded
 * uncertainty U, numeric results are judged against the acceptance limit:
 *   simple_acceptance  w = 0, same answers as no rule (Conforms / Does Not Conform)
 *   guard_band         w = factor x U; conforming only when the result is
 *                      inside the limit by at least w (Conforms / Does Not Conform)
 *   non_binary         zone width z = factor x U on each side of the limit:
 *                      Pass / Conditional Pass / Conditional Fail / Fail
 * Qualitative results (Absent, Pass, ...) and text matches ignore U.
 * When a guard band or non-binary rule has no usable U the result is judged by
 * simple acceptance and the detail says uncertaintyMissing.
 */

/** not_applied: the lab applies no decision rule (DR-NR); results are judged as with no rule. */
export type DecisionRuleType = 'simple_acceptance' | 'guard_band' | 'non_binary' | 'not_applied'

/** The part of a decision rule that conformity needs. */
export type ConformityRule = {
  ruleType: DecisionRuleType
  /** w = factor x U. Ignored (0) for simple acceptance. */
  guardBandFactor?: number | null
}

export type ConformityOutcome =
  | 'pass'
  | 'conditional_pass'
  | 'conditional_fail'
  | 'fail'
  | 'not_applicable'

export type ConformityRemark =
  | 'Conforms'
  | 'Does Not Conform'
  | 'Not Applicable'
  | 'Pass'
  | 'Conditional Pass'
  | 'Conditional Fail'
  | 'Fail'

/** Remarks for no rule, simple acceptance and guard band (the default wording). */
export const RESULT_REMARK_OPTIONS: ConformityRemark[] = [
  'Conforms',
  'Does Not Conform',
  'Not Applicable',
]

/** Remarks for a non-binary decision rule (ILAC-G8:09/2019 4.2.3). */
export const NON_BINARY_REMARK_OPTIONS: ConformityRemark[] = [
  'Pass',
  'Conditional Pass',
  'Conditional Fail',
  'Fail',
  'Not Applicable',
]

/** Every remark the report can hold. */
export const ALL_RESULT_REMARKS: readonly ConformityRemark[] = [
  'Conforms',
  'Does Not Conform',
  'Not Applicable',
  'Pass',
  'Conditional Pass',
  'Conditional Fail',
  'Fail',
]

export function isConformityRemark(value: string | null | undefined): value is ConformityRemark {
  return (ALL_RESULT_REMARKS as readonly string[]).includes(String(value ?? ''))
}

/**
 * Wording used until 23 Oct 2026 ("Confirm" / "Not Confirm"). Results saved
 * and reports issued before then still hold it; issued reports keep it, open
 * reports show and save the current wording.
 */
const LEGACY_REMARKS: Readonly<Record<string, ConformityRemark>> = {
  Confirm: 'Conforms',
  'Not Confirm': 'Does Not Conform',
}

/** A remark saved in the wording used until 23 Oct 2026. */
export function isLegacyConformityRemark(value: string | null | undefined): boolean {
  return String(value ?? '').trim() in LEGACY_REMARKS
}

/** The current remark for a stored value in either wording; null when it is not a remark. */
export function canonicalConformityRemark(value: string | null | undefined): ConformityRemark | null {
  const t = String(value ?? '').trim()
  if (isConformityRemark(t)) return t
  return LEGACY_REMARKS[t] ?? null
}

export function resultRemarkOptionsForRule(
  ruleType: DecisionRuleType | null | undefined,
): ConformityRemark[] {
  return ruleType === 'non_binary' ? NON_BINARY_REMARK_OPTIONS : RESULT_REMARK_OPTIONS
}

/** Printed wording for an outcome. Conforms / Does Not Conform unless the rule is non-binary. */
export function conformityRemarkLabel(
  outcome: ConformityOutcome,
  ruleType: DecisionRuleType | null | undefined,
): ConformityRemark {
  if (outcome === 'not_applicable') return 'Not Applicable'
  if (ruleType === 'non_binary') {
    if (outcome === 'pass') return 'Pass'
    if (outcome === 'conditional_pass') return 'Conditional Pass'
    if (outcome === 'conditional_fail') return 'Conditional Fail'
    return 'Fail'
  }
  return outcome === 'pass' || outcome === 'conditional_pass' ? 'Conforms' : 'Does Not Conform'
}

/** Outcome of a stored or edited remark (any wording). */
export function conformityOutcomeFromRemark(remark: string | null | undefined): ConformityOutcome {
  switch (canonicalConformityRemark(remark) ?? '') {
    case 'Conforms':
    case 'Pass':
      return 'pass'
    case 'Conditional Pass':
      return 'conditional_pass'
    case 'Conditional Fail':
      return 'conditional_fail'
    case 'Does Not Conform':
    case 'Fail':
      return 'fail'
    default:
      return 'not_applicable'
  }
}

const PLACEHOLDER = 'Not Applicable'

const CONFIRM_TERMS = [
  'pass',
  'satisfactory',
  'conforms',
  'confirm',
  'complies',
  'compliant',
  'acceptable',
  'absent',
  'nil',
  'nd',
  'not detected',
  'negative',
  'within limit',
  'within limits',
]

const NOT_CONFIRM_TERMS = [
  'fail',
  'unsatisfactory',
  'non-conform',
  'non conform',
  'not confirm',
  'does not meet',
  'non compliant',
  'non-compliant',
  'positive',
  'present',
  'exceed',
  'exceeds',
]

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isMissing(s: string): boolean {
  const t = s.trim()
  return t === '' || t === PLACEHOLDER
}

function parseFirstNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, '')
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number.parseFloat(match[0])
  return Number.isFinite(n) ? n : null
}

function includesTerm(haystack: string, terms: string[]): boolean {
  return terms.some((t) => haystack.includes(t))
}

type BinaryRemark = 'Conforms' | 'Does Not Conform'

function evaluateQualitative(observed: string, requirement: string): BinaryRemark | null {
  const o = norm(observed)
  const r = norm(requirement)

  if (includesTerm(o, NOT_CONFIRM_TERMS)) return 'Does Not Conform'
  if (includesTerm(o, CONFIRM_TERMS)) {
    if (r.includes('fail') || r.includes('not confirm')) return 'Does Not Conform'
    return 'Conforms'
  }

  const absentReq = /\b(absent|nil|nd|not detected|negative)\b/i.test(requirement)
  if (absentReq && /\b(absent|nil|nd|not detected|negative)\b/i.test(observed)) {
    return 'Conforms'
  }
  if (absentReq && /\b(present|positive|detected)\b/i.test(observed)) {
    return 'Does Not Conform'
  }

  if (o === r) return 'Conforms'

  return null
}

// ---------------------------------------------------------------------------
// Acceptance limit parsed from the specified requirement
// ---------------------------------------------------------------------------

export type AcceptanceLimit =
  | { kind: 'range'; min: number; max: number }
  | { kind: 'tolerance'; center: number; tol: number }
  | { kind: 'upper'; limit: number; inclusive: boolean }
  | { kind: 'lower'; limit: number; inclusive: boolean }
  | { kind: 'equal'; target: number }

function finite(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v))
}

/**
 * Reads the acceptance limit from a requirement such as "10 - 20", "5 ± 0.2",
 * "< 5", "Max 5", "5 min", "≥ 3" or "7". Same patterns, in the same order, as
 * the original evaluator.
 */
export function parseAcceptanceLimit(requirement: string): AcceptanceLimit | null {
  const r = requirement.trim()

  const rangeMatch = r.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i)
  if (rangeMatch) {
    const low = Number.parseFloat(rangeMatch[1])
    const high = Number.parseFloat(rangeMatch[2])
    if (finite(low, high)) {
      return { kind: 'range', min: Math.min(low, high), max: Math.max(low, high) }
    }
  }

  const plusMinus = r.match(/(-?\d+(?:\.\d+)?)\s*(?:±|\+-|\+\/-)\s*(-?\d+(?:\.\d+)?)/)
  if (plusMinus) {
    const center = Number.parseFloat(plusMinus[1])
    const tol = Number.parseFloat(plusMinus[2])
    if (finite(center, tol)) return { kind: 'tolerance', center, tol }
  }

  const upperPatterns: Array<[RegExp, boolean]> = [
    [/<\s*(-?\d+(?:\.\d+)?)/, false],
    [/(?:≤|<=)\s*(-?\d+(?:\.\d+)?)/, true],
    [/(?:max\.?|maximum|nmt|not\s+more\s+than|upto|up\s+to)\s*(-?\d+(?:\.\d+)?)/i, true],
    [/(-?\d+(?:\.\d+)?)\s*(?:max\.?|maximum)\b/i, true],
  ]
  for (const [re, inclusive] of upperPatterns) {
    const m = r.match(re)
    if (!m) continue
    const limit = Number.parseFloat(m[1])
    if (finite(limit)) return { kind: 'upper', limit, inclusive }
  }

  const lowerPatterns: Array<[RegExp, boolean]> = [
    [/>\s*(-?\d+(?:\.\d+)?)/, false],
    [/(?:≥|>=)\s*(-?\d+(?:\.\d+)?)/, true],
    [/(?:min\.?|minimum|nlt|not\s+less\s+than|at\s+least)\s*(-?\d+(?:\.\d+)?)/i, true],
    [/(-?\d+(?:\.\d+)?)\s*(?:min\.?|minimum)\b/i, true],
  ]
  for (const [re, inclusive] of lowerPatterns) {
    const m = r.match(re)
    if (!m) continue
    const limit = Number.parseFloat(m[1])
    if (finite(limit)) return { kind: 'lower', limit, inclusive }
  }

  const eqMatch = r.match(/(?:=|equals?)\s*(-?\d+(?:\.\d+)?)/i)
  if (eqMatch) {
    const target = Number.parseFloat(eqMatch[1])
    if (finite(target)) return { kind: 'equal', target }
  }

  const numbersInReq = [...r.replace(/,/g, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) =>
    Number.parseFloat(m[0]),
  )
  if (numbersInReq.length === 1 && !/[<>=≤≥±]|max|min|range|to\b/i.test(r)) {
    return { kind: 'equal', target: numbersInReq[0] }
  }

  return null
}

/**
 * Simple acceptance (w = 0). A result on the limit is on the limit even when
 * floating point says otherwise (5.2 − 5 = 0.20000000000000018), so every
 * comparison allows a relative epsilon (validation case CF-04).
 */
function simpleAccept(observed: number, limit: AcceptanceLimit): boolean {
  const eps = 1e-9 * limitScale(observed, limit, 0)
  switch (limit.kind) {
    case 'range':
      return observed >= limit.min - eps && observed <= limit.max + eps
    case 'tolerance':
      return Math.abs(observed - limit.center) <= limit.tol + eps
    case 'upper':
      return limit.inclusive ? observed <= limit.limit + eps : observed < limit.limit - eps
    case 'lower':
      return limit.inclusive ? observed >= limit.limit - eps : observed > limit.limit + eps
    case 'equal':
      return Math.abs(observed - limit.target) < eps
  }
}

/**
 * Signed distance of the result inside the limit: positive inside, negative
 * outside, 0 on the limit. Not defined for an exact-value requirement.
 */
function marginInside(observed: number, limit: AcceptanceLimit): number | null {
  switch (limit.kind) {
    case 'range':
      return Math.min(observed - limit.min, limit.max - observed)
    case 'tolerance':
      return limit.tol - Math.abs(observed - limit.center)
    case 'upper':
      return limit.limit - observed
    case 'lower':
      return observed - limit.limit
    case 'equal':
      return null
  }
}

function limitScale(observed: number, limit: AcceptanceLimit, u: number): number {
  const values = [observed, u]
  if (limit.kind === 'range') values.push(limit.min, limit.max)
  else if (limit.kind === 'tolerance') values.push(limit.center, limit.tol)
  else if (limit.kind === 'equal') values.push(limit.target)
  else values.push(limit.limit)
  return Math.max(1, ...values.map((v) => Math.abs(v)))
}

function isInclusive(limit: AcceptanceLimit): boolean {
  return limit.kind === 'upper' || limit.kind === 'lower' ? limit.inclusive : true
}

// ---------------------------------------------------------------------------
// Measurement uncertainty text
// ---------------------------------------------------------------------------

export type ParsedUncertainty = { value: number; relative: boolean }

/**
 * Reads the expanded uncertainty from free text: "± 0.5", "0.5", "±0.5 %",
 * "0.5 MPa", "U = 0.5 mg/kg (k=2)", "± 1.2 % at 95 % confidence".
 * Returns null when there is no usable number.
 */
export function parseUncertaintyText(text: string | number | null | undefined): ParsedUncertainty | null {
  if (typeof text === 'number') {
    return Number.isFinite(text) ? { value: Math.abs(text), relative: false } : null
  }
  let t = String(text ?? '').trim()
  if (!t || t === '—' || t === '-' || /^(n\/?a|not applicable|nil)$/i.test(t)) return null
  t = t
    .replace(/,/g, '')
    // coverage factor "(k = 2)", "k=2"
    .replace(/\(?\s*\bk\s*=\s*\d+(?:\.\d+)?\s*\)?/gi, ' ')
    // confidence level "95 % confidence", "confidence level of 95%", "CL 95%"
    .replace(/\d+(?:\.\d+)?\s*%\s*(?:confidence|c\.?\s?l\.?\b|coverage|level|probability)/gi, ' ')
    .replace(
      /(?:confidence(?:\s+level)?|coverage(?:\s+probability)?|\bc\.?l\.?)\s*(?:of|=|:|at)?\s*\d+(?:\.\d+)?\s*%/gi,
      ' ',
    )
    // "U =", "U95 =", "MU:" labels
    .replace(/\b(?:mu|u\w*)\s*[=:]/gi, ' ')
  const m = t.match(/(?:±|\+\/-|\+-)?\s*(\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*(%)?/i)
  if (!m) return null
  const value = Number.parseFloat(m[1])
  if (!Number.isFinite(value) || value < 0) return null
  return { value, relative: m[2] === '%' }
}

/** Absolute expanded uncertainty U for a result (relative % is taken of the result). */
export function expandedUncertaintyFor(
  uncertainty: string | number | null | undefined,
  observed: number | null,
): number | null {
  const parsed = parseUncertaintyText(uncertainty)
  if (!parsed) return null
  if (!parsed.relative) return parsed.value
  if (observed === null || !Number.isFinite(observed)) return null
  return (Math.abs(observed) * parsed.value) / 100
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type ConformityEvaluationOptions = {
  /** Decision rule agreed at contract review. Null / undefined = original behaviour. */
  rule?: ConformityRule | null
  /** Expanded uncertainty of the result: text from the test parameter or a number. */
  uncertainty?: string | number | null
}

export type ConformityEvaluation = {
  /** Wording for the report (same values evaluateResultConformity returns). */
  remark: ConformityRemark
  outcome: ConformityOutcome
  ruleType: DecisionRuleType | null
  /** How the answer was reached. */
  basis: 'missing' | 'qualitative' | 'numeric' | 'text'
  limit: AcceptanceLimit | null
  observedNumber: number | null
  /** Absolute expanded uncertainty used (null when not used). */
  uncertainty: number | null
  /** Guard band w (binary) or conditional zone width (non-binary) applied. */
  guardBand: number | null
  /** The rule needs U but none could be read: judged by simple acceptance. */
  uncertaintyMissing: boolean
}

function guardBandFactor(rule: ConformityRule): number {
  if (rule.ruleType === 'simple_acceptance' || rule.ruleType === 'not_applied') return 0
  const f = Number(rule.guardBandFactor ?? 1)
  return Number.isFinite(f) && f >= 0 ? f : 1
}

function decideNumeric(
  observed: number,
  limit: AcceptanceLimit,
  rule: ConformityRule | null,
  uncertaintyInput: string | number | null | undefined,
): Pick<ConformityEvaluation, 'outcome' | 'uncertainty' | 'guardBand' | 'uncertaintyMissing'> {
  const simple = (): ConformityOutcome => (simpleAccept(observed, limit) ? 'pass' : 'fail')

  if (!rule || rule.ruleType === 'simple_acceptance' || rule.ruleType === 'not_applied' || limit.kind === 'equal') {
    return { outcome: simple(), uncertainty: null, guardBand: null, uncertaintyMissing: false }
  }

  const factor = guardBandFactor(rule)
  const u = expandedUncertaintyFor(uncertaintyInput, observed)
  if (u === null) {
    return { outcome: simple(), uncertainty: null, guardBand: null, uncertaintyMissing: true }
  }
  const w = factor * u
  const margin = marginInside(observed, limit)
  if (w === 0 || margin === null) {
    return { outcome: simple(), uncertainty: u, guardBand: 0, uncertaintyMissing: false }
  }

  const eps = 1e-9 * limitScale(observed, limit, u)
  const inclusive = isInclusive(limit)
  const inSpec = simpleAccept(observed, limit)

  if (rule.ruleType === 'guard_band') {
    const accept = inclusive ? margin >= w - eps : margin > w + eps
    return { outcome: accept ? 'pass' : 'fail', uncertainty: u, guardBand: w, uncertaintyMissing: false }
  }

  // non_binary
  let outcome: ConformityOutcome
  if (inSpec) {
    const clear = inclusive ? margin >= w - eps : margin > w + eps
    outcome = clear ? 'pass' : 'conditional_pass'
  } else {
    outcome = -margin >= w - eps ? 'fail' : 'conditional_fail'
  }
  return { outcome, uncertainty: u, guardBand: w, uncertaintyMissing: false }
}

/** Full detail of the conformity decision. */
export function evaluateResultConformityDetailed(
  observedValue: string,
  specifiedRequirement: string,
  options: ConformityEvaluationOptions = {},
): ConformityEvaluation {
  const rule = options.rule ?? null
  const ruleType = rule?.ruleType ?? null
  const result = (
    outcome: ConformityOutcome,
    basis: ConformityEvaluation['basis'],
    extra: Partial<ConformityEvaluation> = {},
  ): ConformityEvaluation => ({
    remark: conformityRemarkLabel(outcome, ruleType),
    outcome,
    ruleType,
    basis,
    limit: null,
    observedNumber: null,
    uncertainty: null,
    guardBand: null,
    uncertaintyMissing: false,
    ...extra,
  })

  if (isMissing(observedValue) || isMissing(specifiedRequirement)) {
    return result('not_applicable', 'missing')
  }

  const qualitative = evaluateQualitative(observedValue, specifiedRequirement)
  if (qualitative) {
    return result(qualitative === 'Conforms' ? 'pass' : 'fail', 'qualitative')
  }

  const observedNum = parseFirstNumber(observedValue)
  if (observedNum !== null) {
    const limit = parseAcceptanceLimit(specifiedRequirement)
    if (limit) {
      const decided = decideNumeric(observedNum, limit, rule, options.uncertainty)
      return result(decided.outcome, 'numeric', {
        limit,
        observedNumber: observedNum,
        uncertainty: decided.uncertainty,
        guardBand: decided.guardBand,
        uncertaintyMissing: decided.uncertaintyMissing,
      })
    }
  }

  const o = norm(observedValue)
  const r = norm(specifiedRequirement)
  const textPass = o.includes(r) || r.includes(o)
  return result(textPass ? 'pass' : 'fail', 'text', { observedNumber: observedNum })
}

/**
 * Remark for the report. Without options: Conforms when the observed value meets
 * the specified requirement, otherwise Does Not Conform (Not Applicable when either
 * is blank), exactly as before decision rules existed.
 */
export function evaluateResultConformity(
  observedValue: string,
  specifiedRequirement: string,
  options?: ConformityEvaluationOptions,
): ConformityRemark {
  return evaluateResultConformityDetailed(observedValue, specifiedRequirement, options).remark
}
