import type { ReactNode } from 'react'
import { CheckCircle2, Link2, Microscope, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { AnalysisStatusBadge, ComingLaterChip, IndicativeBadge } from './MetallographyUi'
import { analysisParameterText, analysisScaleText } from './metallographyRegisterText'
import {
  ANALYSIS_KIND_LABEL,
  AVAILABLE_ANALYSIS_KINDS,
  type AnalysisListItem,
  type PendingParameterRow,
} from './types'

const rowTone = (i: number) => (i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]')

function RecheckCell({ a }: { a: AnalysisListItem }) {
  if (!a.lastRecheck) return <span className="text-stone-500">Not run</span>
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-semibold', a.lastRecheck.match ? 'text-emerald-800' : 'text-red-800')}
      title={a.lastRecheck.runByName ? `By ${a.lastRecheck.runByName}` : undefined}
    >
      {a.lastRecheck.match ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {a.lastRecheck.match ? 'Match' : 'Mismatch'}
      <span className="font-normal text-stone-500">{formatDate(a.lastRecheck.runAt)}</span>
    </span>
  )
}

function LinkedCell({ a }: { a: AnalysisListItem }) {
  if (a.purpose !== 'sample') return <span className="text-stone-500">—</span>
  return a.linkedToResult ? (
    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
      <Link2 className="h-3.5 w-3.5" /> Yes
    </span>
  ) : (
    <span className="text-stone-500">No</span>
  )
}

function KindCell({ kind }: { kind: AnalysisListItem['kind'] }) {
  return (
    <span className="text-[11px] text-stone-600">
      {ANALYSIS_KIND_LABEL[kind]}
      {!AVAILABLE_ANALYSIS_KINDS.has(kind) ? (
        <span className="ml-1 align-middle">
          <ComingLaterChip />
        </span>
      ) : null}
    </span>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="p-4 text-center text-[13px] text-stone-600">{children}</p>
}

// ---------------------------------------------------------------------------
// Pending tab
// ---------------------------------------------------------------------------

export function MetallographyPendingTable({
  rows,
  loading,
  canRun,
  onAnalyse,
}: {
  rows: PendingParameterRow[]
  loading: boolean
  canRun: boolean
  onAnalyse: (row: PendingParameterRow) => void
}) {
  const action = (r: PendingParameterRow) => {
    const available = AVAILABLE_ANALYSIS_KINDS.has(r.analysisKind)
    if (!available) return <ComingLaterChip />
    return (
      <Button
        type="button"
        className={cn(limsPrimaryBtnClass, 'h-10 px-3 sm:h-8')}
        onClick={() => onAnalyse(r)}
        disabled={!canRun}
        title={canRun ? undefined : 'You need Edit access to Metallography Analyses.'}
      >
        <Microscope className="h-4 w-4" /> {r.inProgressAnalysisId ? 'Continue' : 'Analyse'}
      </Button>
    )
  }

  return (
    <>
      {/* Phone: cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <div key={r.paramRowId} className="border border-stone-400 bg-white p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[12px] font-semibold text-amber-800">{r.srfNumber || '—'}</p>
                <p className="font-semibold text-stone-900">{r.testLabel}</p>
                <KindCell kind={r.analysisKind} />
              </div>
              <div className="shrink-0">{action(r)}</div>
            </div>
            <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[12.5px]">
              <dt className="text-stone-500">Section</dt>
              <dd>{r.sectionCode || '—'}</dd>
              <dt className="text-stone-500">Assigned to</dt>
              <dd>{r.assignedEmployeeName || '—'}</dd>
              <dt className="text-stone-500">Draft</dt>
              <dd className="font-mono">{r.inProgressAnalysisNo || '—'}</dd>
            </dl>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse font-jakarta">
          <thead>
            <tr>
              <th className={envThClass}>SRF</th>
              <th className={envThClass}>Section</th>
              <th className={envThClass}>Parameter</th>
              <th className={envThClass}>Kind</th>
              <th className={envThClass}>Assigned to</th>
              <th className={envThClass}>Draft analysis</th>
              <th className={cn(envThClass, 'w-32')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.paramRowId} className={rowTone(i)}>
                <td className={cn(envTdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>
                  {r.srfNumber || '—'}
                </td>
                <td className={envTdClass}>{r.sectionCode || '—'}</td>
                <td className={cn(envTdClass, 'font-semibold')}>{r.testLabel}</td>
                <td className={envTdClass}>
                  <KindCell kind={r.analysisKind} />
                </td>
                <td className={envTdClass}>{r.assignedEmployeeName || '—'}</td>
                <td className={cn(envTdClass, 'font-mono')}>{r.inProgressAnalysisNo || '—'}</td>
                <td className={cn(envTdClass, 'text-center')}>{action(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? (
        <EmptyLine>
          Nothing pending. Rows appear here once a mapped parameter is saved in Enter Results without a result.
        </EmptyLine>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Analyses tab
// ---------------------------------------------------------------------------

export function MetallographyAnalysesTable({
  rows,
  loading,
  selectedId,
  onSelect,
  onOpen,
}: {
  rows: AnalysisListItem[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpen: (a: AnalysisListItem) => void
}) {
  const selectBox = (a: AnalysisListItem) => (
    <input
      type="checkbox"
      className="h-4 w-4 accent-amber-700"
      checked={selectedId === a.id}
      onChange={(e) => onSelect(e.target.checked ? a.id : null)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Select ${a.analysisNo ?? 'analysis'}`}
    />
  )

  const reported = (a: AnalysisListItem) =>
    a.reportedValue ? (
      <span className="break-words">
        {a.reportedValue}
        {a.reportedUnit && !a.reportedValue.includes(a.reportedUnit) ? ` ${a.reportedUnit}` : ''}
      </span>
    ) : (
      <span className="text-stone-500">—</span>
    )

  return (
    <>
      {/* Phone: cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((a) => (
          <div
            key={a.id}
            className={cn(
              'cursor-pointer border bg-white p-2.5',
              selectedId === a.id ? 'border-amber-600 ring-2 ring-amber-500/30' : 'border-stone-400',
            )}
            onClick={() => onOpen(a)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[12px] font-semibold text-amber-800">{a.analysisNo || '—'}</p>
                <p className="font-semibold text-stone-900">{analysisParameterText(a)}</p>
                <KindCell kind={a.kind} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <AnalysisStatusBadge status={a.status} />
                {a.indicative ? <IndicativeBadge /> : null}
                {selectBox(a)}
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[12.5px]">
              <dt className="text-stone-500">SRF</dt>
              <dd>{a.srfNumber || '—'}</dd>
              <dt className="text-stone-500">Reported</dt>
              <dd>{reported(a)}</dd>
              <dt className="text-stone-500">Scale</dt>
              <dd className="break-words">{analysisScaleText(a)}</dd>
              <dt className="text-stone-500">Linked</dt>
              <dd>
                <LinkedCell a={a} />
              </dd>
              <dt className="text-stone-500">Re-check</dt>
              <dd>
                <RecheckCell a={a} />
              </dd>
              <dt className="text-stone-500">Performed</dt>
              <dd>
                {a.performedByName || '—'} · {formatDate(a.testDate)}
              </dd>
            </dl>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1200px] border-collapse font-jakarta">
          <thead>
            <tr>
              <th className={cn(envThClass, 'w-10')}>
                <span className="sr-only">Select</span>
              </th>
              <th className={envThClass}>Analysis No</th>
              <th className={envThClass}>SRF / Sample</th>
              <th className={envThClass}>Parameter</th>
              <th className={envThClass}>Standard</th>
              <th className={envThClass}>Scale</th>
              <th className={envThClass}>Status</th>
              <th className={envThClass}>Reported value</th>
              <th className={envThClass}>Linked to result</th>
              <th className={envThClass}>Re-check</th>
              <th className={envThClass}>Performed by / at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr
                key={a.id}
                className={cn(
                  rowTone(i),
                  'cursor-pointer hover:bg-amber-50',
                  selectedId === a.id && '!bg-amber-100',
                )}
                onClick={() => onOpen(a)}
              >
                <td className={cn(envTdClass, 'text-center')}>{selectBox(a)}</td>
                <td className={cn(envTdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>
                  {a.analysisNo || '—'}
                  <div className="font-sans font-normal">
                    <KindCell kind={a.kind} />
                  </div>
                </td>
                <td className={cn(envTdClass, 'whitespace-nowrap')}>{a.srfNumber || '—'}</td>
                <td className={envTdClass}>{analysisParameterText(a)}</td>
                <td className={envTdClass}>{a.methodSnapshot?.standard_ref || '—'}</td>
                <td className={cn(envTdClass, 'text-[11.5px]')}>{analysisScaleText(a)}</td>
                <td className={envTdClass}>
                  <div className="flex flex-col items-start gap-1">
                    <AnalysisStatusBadge status={a.status} />
                    {a.indicative ? <IndicativeBadge /> : null}
                  </div>
                </td>
                <td className={envTdClass}>{reported(a)}</td>
                <td className={cn(envTdClass, 'text-center')}>
                  <LinkedCell a={a} />
                </td>
                <td className={envTdClass}>
                  <RecheckCell a={a} />
                </td>
                <td className={envTdClass}>
                  <p>{a.performedByName || '—'}</p>
                  <p className="whitespace-nowrap text-[11px] text-stone-600">
                    Test {formatDate(a.testDate)}
                    {a.completedAt ? ` · done ${formatDateTime(a.completedAt)}` : ''}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? <EmptyLine>No analyses match these filters.</EmptyLine> : null}
    </>
  )
}
