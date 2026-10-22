import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsOutlineBtnClass, limsPanelClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { checkboxClass, formatSupabaseError } from '../shared'
import {
  LIKELIHOOD_LABELS,
  SEVERITY_LABELS,
  isHeatMapRow,
  riskBand,
  riskCellClass,
  riskRowCell,
  scaleValue,
  type HeatCell,
  type HeatMapMode,
} from './riskScoring'

type ImpartialityRisk = {
  id: string
  risk_id: string
  risk_description: string
  status: string
  likelihood: number | null
  severity: number | null
}

const LEVELS = [1, 2, 3, 4, 5]

function cellKey(l: number, s: number) {
  return `${l}x${s}`
}

/**
 * 5 x 5 likelihood x severity grid (ISO/IEC 17025 8.5). Counts the risk
 * register rows per cell, optionally the impartiality register (4.1.4) too.
 * Clicking a cell filters the register table below; clicking it again clears.
 */
export function RiskHeatMap({
  rows,
  mode,
  onModeChange,
  openOnly,
  onOpenOnlyChange,
  selected,
  onSelect,
}: {
  rows: Array<Record<string, unknown>>
  mode: HeatMapMode
  onModeChange: (mode: HeatMapMode) => void
  openOnly: boolean
  onOpenOnlyChange: (v: boolean) => void
  selected: HeatCell | null
  onSelect: (cell: HeatCell | null) => void
}) {
  const [showImpartiality, setShowImpartiality] = useState(false)
  const [impartiality, setImpartiality] = useState<ImpartialityRisk[] | null>(null)
  const [impError, setImpError] = useState<string | null>(null)

  useEffect(() => {
    if (!showImpartiality || impartiality) return
    let canceled = false
    void (async () => {
      const { data, error } = await supabase.from('gr_impartiality_risks').select('*')
      if (canceled) return
      if (error) {
        setImpError(formatSupabaseError(error))
        setImpartiality([])
        return
      }
      setImpError(null)
      setImpartiality(
        (Array.isArray(data) ? data : []).map((raw) => {
          const r = raw as Record<string, unknown>
          return {
            id: String(r.id),
            risk_id: String(r.risk_id ?? ''),
            risk_description: String(r.risk_description ?? ''),
            status: String(r.status ?? ''),
            likelihood: scaleValue(r.likelihood),
            severity: scaleValue(r.severity),
          }
        }),
      )
    })()
    return () => {
      canceled = true
    }
  }, [showImpartiality, impartiality])

  const registerCounts = useMemo(() => {
    const m = new Map<string, number>()
    let unscored = 0
    for (const r of rows) {
      if (!isHeatMapRow(r, openOnly)) continue
      const c = riskRowCell(r, mode)
      if (!c) {
        unscored += 1
        continue
      }
      const k = cellKey(c.likelihood, c.severity)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return { m, unscored }
  }, [rows, mode, openOnly])

  // Impartiality risks carry inherent L x S only (residual is a Low / Medium / High text).
  const impartialityInMap = useMemo(() => {
    if (!showImpartiality || mode !== 'inherent' || !impartiality) return []
    return impartiality.filter(
      (r) =>
        r.likelihood != null &&
        r.severity != null &&
        (!openOnly || r.status !== 'Closed'),
    )
  }, [showImpartiality, mode, impartiality, openOnly])

  const impCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of impartialityInMap) {
      const k = cellKey(r.likelihood as number, r.severity as number)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [impartialityInMap])

  const selectedImpartiality = selected
    ? impartialityInMap.filter(
        (r) => r.likelihood === selected.likelihood && r.severity === selected.severity,
      )
    : []

  const total = Array.from(registerCounts.m.values()).reduce((a, b) => a + b, 0)
  const highCount = Array.from(registerCounts.m.entries()).reduce((acc, [k, n]) => {
    const [l, s] = k.split('x').map(Number)
    return riskBand(l * s) === 'High' ? acc + n : acc
  }, 0)

  return (
    <section className={cn(limsPanelClass, 'bg-[#fffcf7] p-3')} aria-label="Risk heat map">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Risk heat map</h2>
          <p className="text-[11px] text-stone-600">
            Likelihood × severity (ISO/IEC 17025 8.5). {total} scored risk(s), {highCount} high
            {registerCounts.unscored ? ` · ${registerCounts.unscored} not scored yet` : ''}. Click a cell
            to filter the register.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-800">
          <div className="inline-flex border border-stone-500" role="group" aria-label="Score shown">
            {(['inherent', 'residual'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  'h-7 px-2.5 text-xs font-semibold',
                  mode === m ? 'bg-stone-800 text-amber-200' : 'bg-stone-50 text-stone-800 hover:bg-stone-100',
                )}
                aria-pressed={mode === m}
                onClick={() => {
                  onModeChange(m)
                  onSelect(null)
                }}
              >
                {m === 'inherent' ? 'Inherent' : 'Residual'}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={openOnly}
              onChange={(e) => onOpenOnlyChange(e.target.checked)}
            />
            Open only
          </label>
          <label className="inline-flex items-center gap-1.5" title="Impartiality risks (4.1.4) have an inherent score only">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={showImpartiality}
              onChange={(e) => setShowImpartiality(e.target.checked)}
            />
            Include impartiality risks
          </label>
          {selected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-xs')}
              onClick={() => onSelect(null)}
            >
              <X size={12} /> Clear L{selected.likelihood} × S{selected.severity}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row">
        <div className="overflow-x-auto">
          <table className="border-collapse text-center text-xs" aria-label="Likelihood by severity">
            <tbody>
              {[...LEVELS].reverse().map((l) => (
                <tr key={l}>
                  <th
                    scope="row"
                    className="w-28 pr-2 text-right text-[10px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    {l} · {LIKELIHOOD_LABELS[l]}
                  </th>
                  {LEVELS.map((s) => {
                    const k = cellKey(l, s)
                    const n = registerCounts.m.get(k) ?? 0
                    const imp = impCounts.get(k) ?? 0
                    const band = riskBand(l * s) || 'Low'
                    const isSel = selected?.likelihood === l && selected?.severity === s
                    return (
                      <td key={s} className="p-0.5">
                        <button
                          type="button"
                          className={cn(
                            'flex h-12 w-14 flex-col items-center justify-center border text-sm font-bold sm:w-16',
                            riskCellClass[band],
                            isSel ? 'border-stone-900 ring-2 ring-stone-900' : 'border-stone-400/60',
                            n + imp === 0 && 'font-normal opacity-60',
                          )}
                          aria-pressed={isSel}
                          aria-label={`Likelihood ${l}, severity ${s}: ${n} risk(s)${imp ? `, ${imp} impartiality risk(s)` : ''}`}
                          onClick={() => onSelect(isSel ? null : { likelihood: l, severity: s })}
                        >
                          <span>{n || (imp ? '0' : '·')}</span>
                          {imp ? (
                            <span className="text-[10px] font-semibold text-violet-800">+{imp} imp.</span>
                          ) : null}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <td />
                {LEVELS.map((s) => (
                  <th
                    key={s}
                    scope="col"
                    className="px-0.5 pt-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-stone-600"
                  >
                    {s}
                    <br />
                    {SEVERITY_LABELS[s]}
                  </th>
                ))}
              </tr>
              <tr>
                <td />
                <td colSpan={5} className="pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                  Severity →
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-xs text-stone-700">
          <div className="flex flex-wrap gap-2">
            <span className={cn('border px-1.5 py-0.5', riskCellClass.High)}>High 15–25</span>
            <span className={cn('border px-1.5 py-0.5', riskCellClass.Medium)}>Medium 8–14</span>
            <span className={cn('border px-1.5 py-0.5', riskCellClass.Low)}>Low 1–7</span>
          </div>
          <p>
            Opportunities are not plotted. Residual = expected risk after the planned actions.
            {showImpartiality && mode === 'residual'
              ? ' Impartiality risks have no residual likelihood / severity and are hidden in this view.'
              : ''}
          </p>
          {impError ? <p className="text-destructive">Impartiality register: {impError}</p> : null}
          {selected && selectedImpartiality.length ? (
            <div className="border border-violet-300 bg-violet-50/60 p-2">
              <p className="font-semibold text-violet-900">
                Impartiality risks in L{selected.likelihood} × S{selected.severity}
              </p>
              <ul className="mt-1 space-y-0.5">
                {selectedImpartiality.map((r) => (
                  <li key={r.id}>
                    <span className="font-mono text-[11px] text-amber-800">{r.risk_id}</span>{' '}
                    {r.risk_description.length > 120 ? `${r.risk_description.slice(0, 120)}…` : r.risk_description}{' '}
                    <span className="text-stone-500">({r.status || '—'})</span>
                  </li>
                ))}
              </ul>
              <Link to="/general-requirements/impartiality" className="mt-1 inline-block text-violet-800 underline">
                Open the impartiality register
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
