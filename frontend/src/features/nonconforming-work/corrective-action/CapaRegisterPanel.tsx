import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, ClipboardCheck, ExternalLink, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsOutlineBtnClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import {
  CAPA_SOURCE_PATHS,
  CAPA_SOURCES,
  CAPA_STATUS_LABEL,
  capaSourceLabel,
  capaTrackingEditable,
  type CapaRegisterRow,
  type CapaSource,
} from './capaRegister'

type StatusFilter = 'not_closed' | 'open' | 'in_progress' | 'closed' | 'all'

const thClass =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[10.5px] font-bold uppercase tracking-[0.12em] text-amber-200'
const tdClass = 'border border-[#e7e0d4] px-2 py-1.5 align-top text-[12px] text-[#292524]'
const selectClass = 'h-8 rounded-none border border-stone-400 bg-white px-2 text-xs'

const statusTone = (r: CapaRegisterRow) =>
  r.status === 'closed'
    ? 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
    : r.overdue
      ? 'border-red-600/50 bg-red-50 text-red-800'
      : r.status === 'in_progress'
        ? 'border-amber-600/40 bg-amber-50 text-amber-900'
        : 'border-sky-600/40 bg-sky-50 text-sky-900'

/**
 * Unified CAPA register on the Corrective Action hub (ISO/IEC 17025 8.7):
 * every corrective action from every source, with filters and overdue alerts.
 */
export function CapaRegisterPanel({
  rows,
  loading,
  error,
  search,
  onTrack,
  onOpenSource,
}: {
  rows: CapaRegisterRow[]
  loading: boolean
  error: string | null
  search: string
  onTrack: (row: CapaRegisterRow) => void
  /** Opens the CAPA form of an audit NC / NC work row. */
  onOpenSource: (row: CapaRegisterRow) => void
}) {
  const [source, setSource] = useState<'all' | CapaSource>('all')
  const [status, setStatus] = useState<StatusFilter>('not_closed')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [effectivenessDueOnly, setEffectivenessDueOnly] = useState(false)

  const overdue = useMemo(() => rows.filter((r) => r.overdue), [rows])
  const effOverdue = useMemo(() => rows.filter((r) => r.effectivenessOverdue), [rows])
  const noOwner = useMemo(() => rows.filter((r) => r.status !== 'closed' && !r.ownerName && capaTrackingEditable(r)), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (source !== 'all' && r.source !== source) return false
      if (status === 'not_closed' && r.status === 'closed') return false
      if (status !== 'not_closed' && status !== 'all' && r.status !== status) return false
      if (overdueOnly && !r.overdue) return false
      if (effectivenessDueOnly && !r.effectivenessOverdue) return false
      if (!q) return true
      return `${r.ref} ${r.description} ${r.origin ?? ''} ${r.ownerName ?? ''} ${capaSourceLabel(r.source)} ${CAPA_STATUS_LABEL[r.status]}`
        .toLowerCase()
        .includes(q)
    })
  }, [rows, source, status, overdueOnly, effectivenessDueOnly, search])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {overdue.length > 0 || effOverdue.length > 0 || noOwner.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          {overdue.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setOverdueOnly(true)
                setEffectivenessDueOnly(false)
                setStatus('not_closed')
              }}
              className="inline-flex items-center gap-1.5 border border-red-700/50 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
            >
              <AlarmClock className="h-3.5 w-3.5" />
              {overdue.length} corrective action{overdue.length === 1 ? '' : 's'} overdue
            </button>
          ) : null}
          {effOverdue.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setEffectivenessDueOnly(true)
                setOverdueOnly(false)
                setStatus('all')
              }}
              className="inline-flex items-center gap-1.5 border border-amber-700/50 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {effOverdue.length} effectiveness review{effOverdue.length === 1 ? '' : 's'} overdue
            </button>
          ) : null}
          {noOwner.length > 0 ? (
            <span className="border border-stone-400 bg-white px-2.5 py-1 text-xs text-stone-700">
              {noOwner.length} open without an owner
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select aria-label="Source" className={selectClass} value={source} onChange={(e) => setSource(e.target.value as 'all' | CapaSource)}>
          <option value="all">All sources</option>
          {CAPA_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} ({s.clause})
            </option>
          ))}
        </select>
        <select aria-label="Status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="not_closed">Open + in progress</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
          <option value="all">All statuses</option>
        </select>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={effectivenessDueOnly} onChange={(e) => setEffectivenessDueOnly(e.target.checked)} />
          Effectiveness review overdue
        </label>
        <span className="ml-auto text-stone-600">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
        {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="m-4 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-6 text-center text-sm text-[#57534e]">
            No corrective actions for this filter.
          </div>
        ) : (
          <table className="w-full min-w-[1100px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[110px]" />
              <col className="w-[170px]" />
              <col />
              <col className="w-[140px]" />
              <col className="w-[100px]" />
              <col className="w-[110px]" />
              <col className="w-[170px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Source</th>
                <th className={thClass}>Reference</th>
                <th className={thClass}>Corrective action / NC</th>
                <th className={thClass}>Owner</th>
                <th className={thClass}>Due</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Effectiveness review</th>
                <th className={thClass}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const path = CAPA_SOURCE_PATHS[r.source]
                return (
                  <tr key={r.key} className={i % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                    <td className={cn(tdClass, 'text-center font-semibold')}>{capaSourceLabel(r.source)}</td>
                    <td className={tdClass}>
                      <p className="break-words font-mono text-[11px] font-semibold text-[#b45309]">{r.ref}</p>
                      {r.origin ? <p className="break-words text-[11px] text-stone-600">{r.origin}</p> : null}
                    </td>
                    <td className={tdClass}>
                      <p className="line-clamp-3 break-words" title={r.description}>
                        {r.description || '—'}
                      </p>
                    </td>
                    <td className={cn(tdClass, 'text-center')}>{r.ownerName || <span className="text-stone-400">—</span>}</td>
                    <td className={cn(tdClass, 'text-center', r.overdue && 'font-semibold text-red-700')}>
                      {r.dueOn ? formatDate(r.dueOn) : '—'}
                    </td>
                    <td className={cn(tdClass, 'text-center')}>
                      <span className={cn('inline-block border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', statusTone(r))}>
                        {r.overdue ? 'Overdue' : CAPA_STATUS_LABEL[r.status]}
                      </span>
                      {r.closedOn ? <p className="mt-0.5 text-[10.5px] text-stone-500">{formatDate(r.closedOn)}</p> : null}
                    </td>
                    <td className={cn(tdClass, 'text-center text-[11px]')}>
                      {r.effectivenessOutcome ? (
                        <span className={r.effectivenessOutcome === 'effective' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                          {r.effectivenessOutcome === 'effective' ? 'Effective' : 'Not effective'}
                          <span className="block font-normal text-stone-600">
                            {[r.effectivenessVerifiedByName, r.effectivenessVerifiedOn ? formatDate(r.effectivenessVerifiedOn) : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      ) : r.effectivenessReviewDueOn ? (
                        <span className={r.effectivenessOverdue ? 'font-semibold text-amber-800' : 'text-stone-700'}>
                          Due {formatDate(r.effectivenessReviewDueOn)}
                          {r.effectivenessOverdue ? ' (overdue)' : ''}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className={cn(tdClass, 'text-center')}>
                      <div className="inline-flex gap-0.5">
                        {capaTrackingEditable(r) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(limsOutlineBtnClass, 'h-7 px-1.5 text-[11px]')}
                            onClick={() => onTrack(r)}
                            title="Owner, due date and effectiveness review"
                          >
                            Track
                          </Button>
                        ) : null}
                        {r.source === 'audit' || r.source === 'ncw' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 rounded-none px-1.5 text-[#92400e]"
                            aria-label={`Open CAPA form for ${r.ref}`}
                            title="Open the CAPA form"
                            onClick={() => onOpenSource(r)}
                          >
                            <Pencil size={15} />
                          </Button>
                        ) : path ? (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 rounded-none px-1.5 text-[#92400e]"
                            title={r.source === 'pt' ? 'Raise the NC from PT / ILC Participation' : 'Open the source record'}
                          >
                            <Link to={path} aria-label={`Open ${capaSourceLabel(r.source)} ${r.ref}`}>
                              <ExternalLink size={15} />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
