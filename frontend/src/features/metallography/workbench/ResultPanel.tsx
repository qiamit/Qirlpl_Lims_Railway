import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getReportedTestResult } from '@/features/sample-handling/sample-under-testing/testResultValues'
import { envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { IndicativeBadge } from '../MetallographyUi'
import { fieldStatistics } from '../calc/fieldStatistics'
import { RING_SHARE_DECIMALS, RING_THICKNESS_DECIMALS, type RingTestSummary } from '../engines/types'
import { AVAILABLE_ANALYSIS_KINDS, ANALYSIS_KIND_LABEL, type AnalysisKind, type FormattedMetallographyResult, type ResultSummary } from '../types'

/**
 * Result column of the workbench and of the S3 view (design 3.3 S2 "result
 * panel"): per-field values and multi-field statistics (n, mean, s, 95 % CI,
 * %RA), warnings below min_fields / min_counts_per_field, the reported value
 * exactly as it will go to Enter Results, and the Indicative badge. The
 * engine verdict (ring test pass / fail) is shown but is not the conformity
 * statement: conformity stays with the decision rule in Enter Results.
 */

export type ResultPanelProps = {
  kind: AnalysisKind
  summary: ResultSummary | null
  /** formatMetallographyResult() of the summary; null until there is a result. */
  formatted: FormattedMetallographyResult | null
  /** Stored reported_value (view); preferred over `formatted.results` when given. */
  storedReportedValue?: string | null
  reportedUnit: string | null
  includedFields: number
  minFields: number
  minCountsPerField?: number | null
  /** Per-field numeric results (later kinds); statistics are shown for 2 or more. */
  perField?: Array<{ fieldNo: number; value: number | null; count?: number | null }>
  indicative: boolean
  /** e.g. "Apply t1–t8 to get a result". */
  pendingText?: string | null
}

const isRingSummary = (s: ResultSummary | null): s is RingTestSummary =>
  Boolean(s) && (s as { kind?: unknown }).kind === 'ring_test'

function fmt(v: number | null | undefined, d: number): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d)
}

function VerdictBadge({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-1 border border-emerald-700/40 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
      <CheckCircle2 className="h-3 w-3" /> PASS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 border border-red-700/50 bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
      <XCircle className="h-3 w-3" /> FAIL
    </span>
  )
}

function RingSummaryView({ s }: { s: RingTestSummary }) {
  const td = s.thickness_decimals ?? RING_THICKNESS_DECIMALS
  const sd = s.share_decimals ?? RING_SHARE_DECIMALS
  const inRange = (v: number | null) => {
    if (v === null) return false
    return s.limits.limits_inclusive
      ? v >= s.thickness_range_low_mm && v <= s.thickness_range_high_mm
      : v > s.thickness_range_low_mm && v < s.thickness_range_high_mm
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="text-stone-600">d used</div>
        <div className="tabular-nums font-semibold">
          {fmt(s.d_mm, 2)} mm <span className="font-normal text-stone-500">({s.d_source})</span>
        </div>
        <div className="text-stone-600">Scale</div>
        <div className="tabular-nums">
          {s.scale_source === 'calibration' ? 'Calibration' : 'In-image line'} · {(s.mm_per_px_x * 1000).toFixed(4)} µm/px
        </div>
        <div className="text-stone-600">Thickness limits</div>
        <div className="tabular-nums">
          {fmt(s.thickness_range_low_mm, td)} – {fmt(s.thickness_range_high_mm, td)} mm
          <span className="text-stone-500"> ({s.limits.thickness_min_factor} d – {s.limits.thickness_max_factor} d)</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={envThClass}>Point</th>
              <th className={envThClass}>Angle °</th>
              <th className={envThClass}>t (mm)</th>
            </tr>
          </thead>
          <tbody>
            {s.thickness.map((p) => (
              <tr key={p.label}>
                <td className={cn(envTdClass, 'text-center font-semibold')}>{p.label}</td>
                <td className={cn(envTdClass, 'text-center tabular-nums')}>{fmt(p.angle_deg, 1)}</td>
                <td className={cn(envTdClass, 'text-right tabular-nums', !inRange(p.thickness_mm) && 'bg-red-50 font-semibold text-red-800')}>
                  {fmt(p.thickness_mm, td)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="text-stone-600">Valid points</div>
        <div className={cn('tabular-nums', s.valid_point_count !== 8 && 'font-semibold text-red-800')}>{s.valid_point_count} of 8</div>
        <div className="text-stone-600">Min / mean / max</div>
        <div className="tabular-nums">
          {fmt(s.thickness_min_mm, td)} / {fmt(s.thickness_mean_mm, td)} / {fmt(s.thickness_max_mm, td)} mm
        </div>
        <div className="text-stone-600">Thickness in range</div>
        <div>{s.thickness_in_range ? 'Yes' : <span className="font-semibold text-red-800">No</span>}</div>
        <div className="text-stone-600">Area TM / F&amp;P</div>
        <div className="tabular-nums">
          {fmt(s.area_tm_mm2, 3)} / {fmt(s.area_fp_mm2, 3)} mm²
        </div>
        <div className="text-stone-600">TM share</div>
        <div className="tabular-nums font-semibold">
          {fmt(s.tm_share_pct, sd)} %{' '}
          <span className="font-normal text-stone-500">
            (limits {s.limits.tm_share_min_pct}–{s.limits.tm_share_max_pct} %)
          </span>
        </div>
        <div className="text-stone-600">TM share in range</div>
        <div>{s.tm_share_in_range ? 'Yes' : <span className="font-semibold text-red-800">No</span>}</div>
        <div className="text-stone-600">Engine verdict</div>
        <div className="flex flex-wrap items-center gap-1">
          <VerdictBadge pass={s.overall_pass} />
          <span className="text-[11px] text-stone-500">shown only, not the conformity statement</span>
        </div>
        <div className="text-stone-600">Engine</div>
        <div className="font-mono text-[11.5px]">{s.engine_version}</div>
      </div>
    </div>
  )
}

export function ResultPanel(props: ResultPanelProps) {
  const {
    kind,
    summary,
    formatted,
    storedReportedValue,
    reportedUnit,
    includedFields,
    minFields,
    minCountsPerField,
    perField,
    indicative,
    pendingText,
  } = props
  const values = (perField ?? []).map((f) => f.value).filter((v): v is number => v !== null && Number.isFinite(v))
  const stats = values.length >= 2 ? fieldStatistics(values) : null
  const lowCounts =
    minCountsPerField && perField ? perField.filter((f) => f.count !== null && f.count !== undefined && f.count < minCountsPerField) : []
  const reported = storedReportedValue ?? formatted?.results ?? null
  // Stored value first (view); its human text comes from the StructuredTestResult when it is one.
  const reportedText = storedReportedValue ? getReportedTestResult(storedReportedValue) : (formatted?.reportedText ?? null)

  return (
    <div className="space-y-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-stone-800">{ANALYSIS_KIND_LABEL[kind]}</span>
        {indicative ? <IndicativeBadge /> : null}
      </div>

      {includedFields < minFields ? (
        <p className="flex items-start gap-1.5 border border-amber-600/60 bg-amber-50 px-2 py-1.5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          At least {minFields} field{minFields === 1 ? '' : 's'} needed ({includedFields} in use).
        </p>
      ) : null}
      {lowCounts.length > 0 ? (
        <p className="flex items-start gap-1.5 border border-amber-600/60 bg-amber-50 px-2 py-1.5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Fields {lowCounts.map((f) => f.fieldNo).join(', ')} have fewer than {minCountsPerField} counts.
        </p>
      ) : null}

      {!AVAILABLE_ANALYSIS_KINDS.has(kind) ? (
        <p className="border border-stone-300 bg-stone-50 px-2 py-1.5 text-stone-700">
          The {ANALYSIS_KIND_LABEL[kind].toLowerCase()} engine comes in a later phase.
        </p>
      ) : isRingSummary(summary) ? (
        <RingSummaryView s={summary} />
      ) : (
        <p className="border border-stone-300 bg-stone-50 px-2 py-1.5 text-stone-700">{pendingText ?? 'No result yet.'}</p>
      )}

      {perField && perField.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={envThClass}>Field</th>
                <th className={envThClass}>Value{reportedUnit ? ` (${reportedUnit})` : ''}</th>
                {minCountsPerField ? <th className={envThClass}>Counts</th> : null}
              </tr>
            </thead>
            <tbody>
              {perField.map((f) => (
                <tr key={f.fieldNo}>
                  <td className={cn(envTdClass, 'text-center')}>{f.fieldNo}</td>
                  <td className={cn(envTdClass, 'text-right tabular-nums')}>{f.value === null ? '—' : f.value}</td>
                  {minCountsPerField ? <td className={cn(envTdClass, 'text-right tabular-nums')}>{f.count ?? '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {stats ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border border-stone-300 bg-stone-50 p-2 tabular-nums">
          <div className="text-stone-600">n</div>
          <div>{stats.n}</div>
          <div className="text-stone-600">Mean</div>
          <div>{fmt(stats.mean, 3)}</div>
          <div className="text-stone-600">s</div>
          <div>{fmt(stats.s, 3)}</div>
          <div className="text-stone-600">95 % CI (±)</div>
          <div>{fmt(stats.ci95, 3)}</div>
          <div className="text-stone-600">% RA</div>
          <div>{fmt(stats.relativeAccuracyPct, 1)}</div>
        </div>
      ) : null}

      <div className="space-y-1 border-2 border-amber-600/60 bg-amber-50/60 p-2">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-amber-900">Reported value</div>
        {reported ? (
          <>
            <div className="break-words font-semibold text-stone-900">{reportedText ?? reported}</div>
            {reportedText && reportedText !== reported ? (
              <details className="text-[11px] text-stone-500">
                <summary className="cursor-pointer">Stored text</summary>
                <code className="block break-all">{reported}</code>
              </details>
            ) : null}
          </>
        ) : (
          <div className="text-stone-600">—</div>
        )}
      </div>
    </div>
  )
}
