/**
 * Metallography result → the text written to metallography_analyses.reported_value
 * and, through Use result, unchanged to test_allocation_parameters.results
 * (the link guard refuses any other text while the row is linked).
 *
 * Rounding is IS 2:1960 (lib/is2Rounding, lab decision 23 Oct 2026).
 *
 * Ring test: a StructuredTestResult (testResultValues.ts, v 2) with entries
 * t1…t8 in mm and TM in %, decimals = RING_THICKNESS_DECIMALS, and
 * reported "t1 1.460 mm, t2 …, t8 … mm; TM 43.75 %". The values are reported
 * at the precision the verdict used (RING_THICKNESS_DECIMALS = 3,
 * RING_SHARE_DECIMALS = 2): the method decimals are ignored for the ring test,
 * so the text is never re-rounded from already rounded values and always
 * reads the same as the verdict. app_metallography_ring_reported_check()
 * rebuilds this text in the database and refuses any other. The engine
 * verdict (PASS / FAIL) is returned separately and never written into `results`.
 *
 * Other kinds (Phase 2+): a single number `value` in result_summary, IS 2
 * rounded to the method decimals.
 *
 * DOM-free: bundled for Node by `npm run validate:calculations` (mgFormat, MF-01).
 */
import { is2RoundFixed } from '@/lib/is2Rounding'
import {
  serializeTestResult,
  type StructuredTestResult,
  type TestResultReadingEntry,
} from '@/features/sample-handling/sample-under-testing/testResultValues'
import { RING_SHARE_DECIMALS, RING_THICKNESS_DECIMALS, type RingTestSummary } from './engines/types'
import type { AnalysisKind, FormattedMetallographyResult, ResultSummary } from './types'

/** One value IS 2 rounded to `decimals` places, keeping trailing zeros (7.46 at 1 → "7.5"; 10.2 at 2 → "10.20"). */
export function formatSingleValue(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return ''
  return is2RoundFixed(value, decimals)
}

const EMPTY: FormattedMetallographyResult = { results: '', reportedText: '', structured: null, verdict: null }

function isRingSummary(summary: ResultSummary): summary is RingTestSummary {
  return (summary as { kind?: unknown }).kind === 'ring_test' && Array.isArray((summary as { thickness?: unknown }).thickness)
}

function validDecimals(d: number | null | undefined): number | null {
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6 ? d : null
}

function formatRing(summary: RingTestSummary): FormattedMetallographyResult {
  // Fixed precision: the precision computeRing rounded and decided at.
  const tDec = RING_THICKNESS_DECIMALS
  const sDec = RING_SHARE_DECIMALS
  // A summary rounded otherwise is not this engine's; the database refuses it too.
  if (summary.thickness_decimals !== tDec || summary.share_decimals !== sDec) return EMPTY
  const points = summary.thickness
  // A reportable ring result has all 8 thickness points and a TM share.
  if (points.length !== 8 || points.some((p) => p.thickness_mm === null || !Number.isFinite(p.thickness_mm))) return EMPTY
  if (!Number.isFinite(summary.tm_share_pct)) return EMPTY

  const thicknessText = points.map((p) => `${p.label} ${formatSingleValue(p.thickness_mm as number, tDec)} mm`)
  const shareText = formatSingleValue(summary.tm_share_pct, sDec)
  const reported = `${thicknessText.join(', ')}; TM ${shareText} %`

  // Entry values are the reported (rounded) numbers, so the stored readings match the text.
  const entries: TestResultReadingEntry[] = [
    ...points.map((p) => ({ label: p.label, value: Number(formatSingleValue(p.thickness_mm as number, tDec)), unit: 'mm' })),
    { label: 'TM', value: Number(shareText), unit: '%' },
  ]
  const structured: StructuredTestResult = {
    v: 2,
    entries,
    readings: entries.map((e) => e.value),
    reported,
    stat: 'composed',
    decimals: tDec,
  }
  return {
    results: serializeTestResult(structured),
    reportedText: reported,
    structured,
    verdict: summary.overall_pass ? 'PASS' : 'FAIL',
  }
}

/**
 * The text to store as reported_value (and hand to Enter Results unchanged).
 * Returns empty `results` when the summary is not complete enough to report
 * (e.g. ring test without all 8 thickness points).
 */
export function formatMetallographyResult(args: {
  kind: AnalysisKind
  summary: ResultSummary
  reportedUnit: string | null
  /** Method decimals (Phase 2+ kinds). Ignored for the ring test, which reports at RING_THICKNESS_DECIMALS / RING_SHARE_DECIMALS. */
  decimals: number | null
}): FormattedMetallographyResult {
  const { kind, summary, reportedUnit, decimals } = args
  if (!summary || typeof summary !== 'object') return EMPTY

  if (kind === 'ring_test') {
    return isRingSummary(summary) ? formatRing(summary) : EMPTY
  }

  // Phase 2+ kinds: a single reported number in result_summary.value.
  const value = (summary as { value?: unknown }).value
  if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY
  const text = formatSingleValue(value, validDecimals(decimals) ?? 2)
  const unit = reportedUnit?.trim()
  return { results: text, reportedText: unit ? `${text} ${unit}` : text, structured: null, verdict: null }
}
