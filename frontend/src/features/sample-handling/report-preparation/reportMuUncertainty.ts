/**
 * MU by range band on the test report (ISO/IEC 17025 7.6 / 7.8.3.1 c), gap P3-2).
 *
 * Pure helpers (no Supabase): the report rows load the MU bands of the
 * sample's parameters once (fetchMuBands) and pick the band U for each
 * observed value here. When a parameter has no band that applies, the text
 * of test_parameters.uncertainty_mu is returned unchanged, so reports
 * without bands print and decide exactly as before.
 *
 * The band U is returned as uncertainty text ("± 0.5" absolute, "± 2 %"
 * relative to the result). That text goes into ReportResultRow.uncertainty,
 * which feeds both the printed MU column (and the archive snapshot taken at
 * issue) and the decision rule (evaluateResultConformity parses it the same
 * way as uncertainty_mu), so the live print, the archived print and the
 * conformity statement all use the same U.
 */
import { muForValue, toNum, type MuBand, type MuForResult } from '@/features/masters/test-parameter/muBands'

/** Bands keyed by test_parameter_id. */
export function groupMuBandsByParameter(bands: readonly MuBand[]): Map<string, MuBand[]> {
  const out = new Map<string, MuBand[]>()
  for (const b of bands) {
    const id = b.test_parameter_id.trim()
    if (!id) continue
    const list = out.get(id)
    if (list) list.push(b)
    else out.set(id, [b])
  }
  return out
}

function fmtNum(n: number): string {
  return String(Number(n.toPrecision(10)))
}

/** Uncertainty text for a band result: "± U" (absolute) or "± U %" (relative). */
export function formatBandUncertainty(mu: MuForResult): string {
  return mu.band.u_unit === '%' ? `± ${fmtNum(mu.band.expanded_u)} %` : `± ${fmtNum(mu.band.expanded_u)}`
}

/**
 * Uncertainty text for one report row: the band U for the observed value when
 * a band of the parameter applies on `onDate`, otherwise `fallback` (the
 * parameter's uncertainty_mu) exactly as given.
 *
 * Like muForResult(), only a plain number selects a ranged band; any other
 * result text ("< 0.1", "Absent") can only use a catch-all band.
 */
export function reportUncertaintyText(
  bands: readonly MuBand[] | null | undefined,
  observed: string | null | undefined,
  fallback: string | null,
  onDate?: string,
): string | null {
  if (!bands || bands.length === 0) return fallback
  const value = toNum(String(observed ?? '').trim())
  const mu = onDate ? muForValue(bands, value, onDate) : muForValue(bands, value)
  return mu ? formatBandUncertainty(mu) : fallback
}
