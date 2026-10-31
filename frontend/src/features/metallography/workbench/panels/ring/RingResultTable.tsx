import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import {
  RING_SHARE_DECIMALS,
  RING_THICKNESS_DECIMALS,
  RING_THICKNESS_LABELS,
  scaleToMmPerPx,
  type RingTestLimits,
  type RingTestSummary,
  type ScaleInput,
} from '@/features/metallography/engines/types'
import { cn } from '@/lib/utils'
import { ringVerdictPillClass, type RingVerdict } from './ringUi'

/**
 * Ring test results (old RingTestWorkflow ResultsPanel): t1–t8, min / max /
 * mean, the 0.07 d – 0.15 d requirement, areas and TM share, and the engine
 * verdict. Values are the stored ones (rounded to 3 / 2 decimals). The verdict
 * is shown only; it is never written into the result or the report.
 */

const dash = '—'

function fmt(v: number | null | undefined, decimals: number): string {
  return v === null || v === undefined || !Number.isFinite(v) ? dash : v.toFixed(decimals)
}

function inRange(v: number, low: number, high: number, inclusive: boolean): boolean {
  return inclusive ? v >= low && v <= high : v > low && v < high
}

export function RingVerdictBadge({ summary, className }: { summary: RingTestSummary | null; className?: string }) {
  const v: RingVerdict = !summary ? 'pending' : summary.overall_pass ? 'pass' : 'fail'
  return (
    <span className={cn(ringVerdictPillClass(v), className)} title="Engine verdict (shown only, not written into the result)">
      {v === 'pass' ? <CheckCircle2 className="h-3 w-3" /> : v === 'fail' ? <XCircle className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
      {v === 'pass' ? 'Pass' : v === 'fail' ? 'Fail' : 'In progress'}
    </span>
  )
}

export function RingResultTable({
  summary,
  missing,
  limits,
  limitsVerified,
  scale,
  dMm,
  measuredDiameterMm,
  error,
}: {
  summary: RingTestSummary | null
  /** Plain-English steps still needed before the result exists. */
  missing: string[]
  limits: RingTestLimits
  limitsVerified: boolean
  scale: ScaleInput | null
  dMm: number | null
  /** Mean of the drawn diameter lines in mm (informative), null when none / no scale. */
  measuredDiameterMm: number | null
  error: string | null
}) {
  const tDec = summary?.thickness_decimals ?? RING_THICKNESS_DECIMALS
  const sDec = summary?.share_decimals ?? RING_SHARE_DECIMALS
  const d = summary?.d_mm ?? (dMm !== null && dMm > 0 ? dMm : null)
  const low = summary?.thickness_range_low_mm ?? (d !== null ? limits.thickness_min_factor * d : null)
  const high = summary?.thickness_range_high_mm ?? (d !== null ? limits.thickness_max_factor * d : null)
  const mm = scale ? scaleToMmPerPx(scale) : null
  const total = summary ? summary.area_tm_mm2 + summary.area_fp_mm2 : null
  const rel = limits.limits_inclusive ? '' : ' (limits excluded)'

  const rows: Array<[string, string]> = [
    ['Minimum', `${fmt(summary?.thickness_min_mm, tDec)} mm`],
    ['Maximum', `${fmt(summary?.thickness_max_mm, tDec)} mm`],
    ['Mean', `${fmt(summary?.thickness_mean_mm, tDec)} mm`],
    ['Total area', `${fmt(total, sDec)} mm²`],
    ['F&P area', `${fmt(summary?.area_fp_mm2, sDec)} mm²`],
    ['TM area', `${fmt(summary?.area_tm_mm2, sDec)} mm²`],
    ['TM share', `${fmt(summary?.tm_share_pct, sDec)} %`],
    [
      'Scale',
      mm
        ? mm.x === mm.y
          ? `${mm.x.toFixed(6)} mm/px`
          : `x ${mm.x.toFixed(6)} · y ${mm.y.toFixed(6)} mm/px`
        : dash,
    ],
    ['Nominal d', d !== null ? `${d} mm` : dash],
    ['Measured diameter', measuredDiameterMm !== null ? `${measuredDiameterMm.toFixed(3)} mm (informative)` : dash],
  ]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700">Ring test result (IS 1786)</h3>
        <RingVerdictBadge summary={summary} />
      </div>

      {!limitsVerified ? (
        <p className="flex items-start gap-1.5 border border-amber-600/50 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-950">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Limits not yet verified against IS 1786 in Method Setup.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border border-red-600/50 bg-red-50 px-2 py-1.5 text-[12px] text-red-900">
          {error}
        </p>
      ) : null}
      {missing.length > 0 ? (
        <ul className="space-y-0.5 border border-stone-300 bg-stone-50 px-2 py-1.5 text-[12px] text-stone-700">
          {missing.map((m) => (
            <li key={m} className="flex items-start gap-1.5">
              <CircleDashed className="mt-0.5 h-3 w-3 shrink-0 text-stone-400" /> {m}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border border-stone-700 bg-stone-800 px-2 py-1 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
                Point
              </th>
              <th className="border border-stone-700 bg-stone-800 px-2 py-1 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
                Thickness (mm)
              </th>
            </tr>
          </thead>
          <tbody className="bg-[#fffcf7]">
            {RING_THICKNESS_LABELS.map((label) => {
              const p = summary?.thickness.find((t) => t.label === label) ?? null
              const v = p?.thickness_mm ?? null
              const out = v !== null && low !== null && high !== null && !inRange(v, low, high, limits.limits_inclusive)
              return (
                <tr key={label}>
                  <td className="border border-[#e7e0d4] px-2 py-0.5 font-semibold text-stone-800">{label}</td>
                  <td
                    className={cn(
                      'border border-[#e7e0d4] px-2 py-0.5 text-right font-mono',
                      out ? 'font-semibold text-red-700' : 'text-stone-900',
                    )}
                  >
                    {summary && p && v === null ? 'no edge' : fmt(v, tDec)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-3 gap-y-0.5 border border-[#e7e0d4] bg-[#fffcf7] px-2 py-1 text-[12px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-stone-600">{k}</dt>
              <dd className="text-right font-mono text-stone-900">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="border border-stone-300 bg-stone-50 px-2 py-1 text-center text-[12px] text-stone-700">
        Requirement: thickness {limits.thickness_min_factor} d – {limits.thickness_max_factor} d (
        {low !== null && high !== null ? `${low.toFixed(tDec)} – ${high.toFixed(tDec)} mm` : `${dash} – ${dash}`}
        ) {summary ? (summary.thickness_in_range ? '✓' : '✗') : ''} · TM share {limits.tm_share_min_pct} – {limits.tm_share_max_pct} %{' '}
        {summary ? (summary.tm_share_in_range ? '✓' : '✗') : ''}
        {rel}
      </p>
      <p className="text-[11px] text-stone-500">
        The verdict is the program's check only. The reported result is t1–t8 and the TM share; the statement of
        conformity is made on the report.
      </p>
    </div>
  )
}
