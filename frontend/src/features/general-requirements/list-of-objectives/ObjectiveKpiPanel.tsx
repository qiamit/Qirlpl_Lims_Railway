import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDashed, MinusCircle, Plus, Trash2, TrendingDown, TrendingUp, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MiniTrendBars } from '@/components/lims/MiniTrendBars'
import { limsFieldClass, limsOutlineBtnClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { errorText, isMissingTableError } from '@/lib/missingSchema'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  OBJECTIVE_STATUSES,
  normalizeMeasurement,
  objectiveTrend,
  sortMeasurements,
  suggestObjectiveStatus,
  type ObjectiveMeasurement,
  type ObjectiveStatus,
} from './objectiveKpis'

type ObjectiveRef = { id: string; code: string; title: string }

type Draft = {
  objectiveId: string
  period: string
  periodEnd: string
  target: string
  actual: string
  unit: string
  higherIsBetter: boolean
  status: ObjectiveStatus
  statusTouched: boolean
  remarks: string
}

const STATUS_ICON: Record<ObjectiveStatus, typeof CheckCircle2> = {
  Met: CheckCircle2,
  'Partly met': MinusCircle,
  'Not met': XCircle,
  'Not measured': CircleDashed,
}
const STATUS_TONE: Record<ObjectiveStatus, string> = {
  Met: 'text-emerald-700',
  'Partly met': 'text-amber-800',
  'Not met': 'text-red-700',
  'Not measured': 'text-stone-500',
}

function StatusLabel({ status }: { status: ObjectiveStatus }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', STATUS_TONE[status])}>
      <Icon size={13} aria-hidden />
      {status}
    </span>
  )
}

const n = (v: string): number | null => {
  const t = v.trim()
  if (!t) return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

/**
 * Objective KPIs (ISO/IEC 17025 8.2, gap P3-7): measured values per period
 * and a small trend per objective. Hidden until 20261031100000 is applied.
 */
export function ObjectiveKpiPanel({ objectives }: { objectives: Array<Record<string, unknown>> }) {
  const refs: ObjectiveRef[] = useMemo(
    () =>
      objectives
        .map((o) => ({ id: String(o.id ?? ''), code: String(o.objective_id ?? ''), title: String(o.title ?? '') }))
        .filter((o) => o.id),
    [objectives],
  )
  const [available, setAvailable] = useState(false)
  const [rows, setRows] = useState<ObjectiveMeasurement[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const fetchRows = useCallback(
    () =>
      supabase
        .from('objective_measurements')
        .select('*')
        .order('period_end', { ascending: true, nullsFirst: true }),
    [],
  )

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchRows>>) => {
    const { data, error: err } = res
    if (err) {
      setAvailable(false)
      if (!isMissingTableError(err)) setError(errorText(err))
      return
    }
    setAvailable(true)
    setError(null)
    setRows((data ?? []).map((r) => normalizeMeasurement(r as Record<string, unknown>)))
  }, [])

  const load = useCallback(async () => apply(await fetchRows()), [apply, fetchRows])

  useEffect(() => {
    let cancelled = false
    void fetchRows().then((res) => {
      if (!cancelled) apply(res)
    })
    return () => {
      cancelled = true
    }
  }, [apply, fetchRows])

  const byObjective = useMemo(() => {
    const map = new Map<string, ObjectiveMeasurement[]>()
    for (const m of rows) {
      const list = map.get(m.objective_id)
      if (list) list.push(m)
      else map.set(m.objective_id, [m])
    }
    for (const [k, v] of map) map.set(k, sortMeasurements(v))
    return map
  }, [rows])

  if (!available) {
    return error ? (
      <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
    ) : null
  }

  const startNew = (objectiveId = '') => {
    const last = objectiveId ? byObjective.get(objectiveId)?.at(-1) : undefined
    setDraft({
      objectiveId,
      period: '',
      periodEnd: '',
      target: last?.target == null ? '' : String(last.target),
      actual: '',
      unit: last?.unit ?? '',
      higherIsBetter: last?.higher_is_better ?? true,
      status: 'Not measured',
      statusTouched: false,
      remarks: '',
    })
    setError(null)
  }

  const set = (patch: Partial<Draft>) =>
    setDraft((d) => {
      if (!d) return d
      const next = { ...d, ...patch }
      if (!next.statusTouched) next.status = suggestObjectiveStatus(n(next.target), n(next.actual), next.higherIsBetter)
      return next
    })

  const save = async () => {
    if (!draft) return
    if (!draft.objectiveId || !draft.period.trim()) {
      setError('Choose an objective and enter the period (e.g. 2026-09 or Q3 2026).')
      return
    }
    if ((draft.target.trim() && n(draft.target) === null) || (draft.actual.trim() && n(draft.actual) === null)) {
      setError('Target and actual must be numbers.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('objective_measurements')
      .insert({
        objective_id: draft.objectiveId,
        period: draft.period.trim(),
        period_end: draft.periodEnd || null,
        target: n(draft.target),
        actual: n(draft.actual),
        unit: draft.unit.trim() || null,
        higher_is_better: draft.higherIsBetter,
        status: draft.status,
        remarks: draft.remarks.trim() || null,
      })
      .select('id')
    setSaving(false)
    if (err) {
      setError(errorText(err))
      return
    }
    if (!data || data.length === 0) {
      setError('Not saved: only the Laboratory Director, Quality Manager or a Technical Manager can record objective KPIs.')
      return
    }
    setOpenId(draft.objectiveId)
    setDraft(null)
    await load()
  }

  const remove = async (m: ObjectiveMeasurement) => {
    if (!window.confirm(`Delete the measurement for ${m.period}?`)) return
    const { data, error: err } = await supabase.from('objective_measurements').delete().eq('id', m.id).select('id')
    if (err || !data?.length) {
      setError(err ? errorText(err) : 'Not deleted: only the Laboratory Director, Quality Manager or a Technical Manager can remove KPIs.')
      return
    }
    await load()
  }

  const measured = refs.filter((o) => byObjective.has(o.id))
  const fmt = (v: number | null, unit: string | null) => (v === null ? '—' : `${Number(v.toPrecision(6))}${unit ? ` ${unit}` : ''}`)

  return (
    <section className={cn(limsPanelClass, 'p-3')} aria-label="Objective KPIs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Objective KPIs (ISO/IEC 17025 8.2)</h2>
        <span className="text-xs text-stone-500">Measured value per period against the target</span>
        <Button type="button" className={cn(limsPrimaryBtnClass, 'ml-auto h-7 gap-1 px-3 text-xs')} onClick={() => startNew()}
          disabled={refs.length === 0}>
          <Plus size={13} /> Record measurement
        </Button>
      </div>
      {error ? (
        <p className="mb-2 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {draft ? (
        <div className="mb-3 grid gap-2 border border-stone-400 bg-stone-50 p-3 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="kpi-obj">Objective</Label>
            <select id="kpi-obj" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.objectiveId}
              onChange={(e) => {
                const last = byObjective.get(e.target.value)?.at(-1)
                set({
                  objectiveId: e.target.value,
                  ...(last && !draft.target ? { target: last.target == null ? '' : String(last.target) } : {}),
                  ...(last && !draft.unit ? { unit: last.unit ?? '' } : {}),
                  ...(last ? { higherIsBetter: last.higher_is_better } : {}),
                })
              }}>
              <option value="">Choose…</option>
              {refs.map((o) => (
                <option key={o.id} value={o.id}>{o.code} — {o.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-period">Period</Label>
            <Input id="kpi-period" placeholder="2026-09 / Q3 2026" className={limsFieldClass} value={draft.period}
              onChange={(e) => set({ period: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-end">Period end</Label>
            <Input id="kpi-end" type="date" className={limsFieldClass} value={draft.periodEnd}
              onChange={(e) => set({ periodEnd: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-target">Target</Label>
            <Input id="kpi-target" inputMode="decimal" className={limsFieldClass} value={draft.target}
              onChange={(e) => set({ target: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-actual">Actual</Label>
            <Input id="kpi-actual" inputMode="decimal" className={limsFieldClass} value={draft.actual}
              onChange={(e) => set({ actual: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-unit">Unit</Label>
            <Input id="kpi-unit" placeholder="%, days…" className={limsFieldClass} value={draft.unit}
              onChange={(e) => set({ unit: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-dir">Better when</Label>
            <select id="kpi-dir" className={cn(limsFieldClass, 'w-full px-2 text-sm')}
              value={draft.higherIsBetter ? 'higher' : 'lower'}
              onChange={(e) => set({ higherIsBetter: e.target.value === 'higher' })}>
              <option value="higher">Higher (e.g. on-time %)</option>
              <option value="lower">Lower (e.g. TAT days)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-status">Status</Label>
            <select id="kpi-status" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.status}
              onChange={(e) => set({ status: e.target.value as ObjectiveStatus, statusTouched: true })}>
              {OBJECTIVE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="kpi-remarks">Remarks</Label>
            <Input id="kpi-remarks" className={limsFieldClass} value={draft.remarks}
              onChange={(e) => set({ remarks: e.target.value })} />
          </div>
          <div className="flex items-end justify-end gap-2 sm:col-span-4">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="button" className={limsPrimaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : null}

      {measured.length === 0 ? (
        <p className="text-sm text-stone-600">No measurements recorded yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {measured.map((o) => {
            const list = byObjective.get(o.id) ?? []
            const last = list[list.length - 1]
            const trend = objectiveTrend(list)
            const open = openId === o.id
            return (
              <li key={o.id} className="py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="min-w-[14rem] flex-1 text-left" onClick={() => setOpenId(open ? null : o.id)}
                    aria-expanded={open}>
                    <span className="font-mono text-[11px] text-amber-800">{o.code}</span>{' '}
                    <span className="text-sm font-semibold text-stone-900">{o.title}</span>
                  </button>
                  <MiniTrendBars
                    ariaLabel={`Actual values of ${o.title} by period`}
                    points={list.slice(-12).map((m) => ({ label: m.period, value: m.actual, note: m.status }))}
                    target={last?.target ?? null}
                    height={44}
                  />
                  <div className="w-40 text-xs text-stone-700">
                    <div>
                      Latest {last?.period}: <b>{fmt(last?.actual ?? null, last?.unit ?? null)}</b>
                    </div>
                    <div>Target {fmt(last?.target ?? null, last?.unit ?? null)}</div>
                  </div>
                  <div className="flex w-28 flex-col gap-0.5">
                    {last ? <StatusLabel status={last.status} /> : null}
                    {trend === 'improving' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-stone-600"><TrendingUp size={12} aria-hidden /> Improving</span>
                    ) : trend === 'worsening' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-stone-600"><TrendingDown size={12} aria-hidden /> Worsening</span>
                    ) : null}
                  </div>
                  <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 px-2 text-xs')} onClick={() => startNew(o.id)}>
                    <Plus size={12} /> Add
                  </Button>
                </div>
                {open ? (
                  <table className="mt-2 w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-800 text-[10px] uppercase tracking-wide text-amber-200">
                        <th className="px-2 py-1 text-left">Period</th>
                        <th className="px-2 py-1 text-right">Target</th>
                        <th className="px-2 py-1 text-right">Actual</th>
                        <th className="px-2 py-1 text-left">Status</th>
                        <th className="px-2 py-1 text-left">Remarks</th>
                        <th className="px-2 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((m) => (
                        <tr key={m.id} className="border-t border-stone-200">
                          <td className="px-2 py-1">{m.period}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmt(m.target, m.unit)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmt(m.actual, m.unit)}</td>
                          <td className="px-2 py-1"><StatusLabel status={m.status} /></td>
                          <td className="px-2 py-1 text-stone-600">{m.remarks ?? ''}</td>
                          <td className="px-2 py-1 text-right">
                            <button type="button" className="text-red-700 hover:text-red-900" aria-label={`Delete ${m.period}`}
                              onClick={() => void remove(m)}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
