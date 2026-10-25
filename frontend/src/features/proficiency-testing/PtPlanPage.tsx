import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
import { EnvHeader, EnvPanel, EnvSelect, Field, MessageLine, envInputClass, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { PerformanceBadge, PtMissingNotice } from './PtUi'
import {
  PT_PARTICIPATIONS_PATH,
  PT_PLAN_STATUSES,
  PT_PLAN_STATUS_LABEL,
  PT_PLAN_YEARS,
  buildScopeUnits,
  coverageGaps,
  extraUnits,
  gridCell,
  isPtMissingError,
  norm,
  participationDate,
  ptErrorText,
  unitLabel,
  type CalibrationScopeRow,
  type CellState,
  type GridCell,
  type ProviderOption,
  type PtParticipation,
  type PtPlan,
  type PtPlanStatus,
  type PtScopeKind,
  type PtUnit,
  type TestingScopeRow,
} from './ptShared'

type PlanForm = {
  scopeKind: PtScopeKind
  discipline: string
  subDiscipline: string
  plannedYear: string
  providerId: string
  scheme: string
  parameters: string
  status: PtPlanStatus
  remarks: string
}

const CELL_CLASS: Record<CellState, string> = {
  done: 'border-emerald-700/50 bg-emerald-100 text-emerald-900',
  planned: 'border-amber-600/60 bg-amber-100 text-amber-900',
  missed: 'border-red-700/60 bg-red-100 text-red-900',
  none: 'border-stone-300 bg-white text-stone-400',
}

const CELL_LABEL: Record<CellState, string> = {
  done: 'Done',
  planned: 'Planned',
  missed: 'Missed',
  none: '—',
}

function emptyForm(year: number): PlanForm {
  return {
    scopeKind: 'testing',
    discipline: '',
    subDiscipline: '',
    plannedYear: String(year),
    providerId: '',
    scheme: '',
    parameters: '',
    status: 'planned',
    remarks: '',
  }
}

function CellChip({ cell, onClick, label }: { cell: GridCell; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-10 w-full flex-col items-center justify-center border px-1 py-1 text-[11px] font-semibold leading-tight focus:outline-none focus:ring-2 focus:ring-amber-500/40',
        CELL_CLASS[cell.state],
      )}
    >
      {label ? <span className="text-[10px] font-bold text-stone-600">{label}</span> : null}
      <span>{CELL_LABEL[cell.state]}</span>
      {cell.state === 'done' && cell.worst && cell.worst !== 'satisfactory' ? (
        <span className={cn('text-[10px]', cell.worst === 'unsatisfactory' ? 'text-red-700' : 'text-amber-800')}>
          {cell.worst === 'unsatisfactory' ? 'Unsatisfactory' : 'Questionable'}
        </span>
      ) : null}
      {cell.plans.length > 1 || cell.participations.length > 1 ? (
        <span className="text-[10px] font-normal">
          {cell.plans.length} plan · {cell.participations.length} PT
        </span>
      ) : null}
    </button>
  )
}

export default function PtPlanPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const des = designation.trim().toLowerCase()
  const isDirector = isLaboratoryDirector(designation)
  const canManage =
    isDirector ||
    des === 'technical manager' ||
    (des === 'quality manager' && departmentName.trim().toLowerCase() === 'quality assurance')

  const currentYear = new Date().getFullYear()
  const [startYear, setStartYear] = useState(currentYear)
  const years = useMemo(() => Array.from({ length: PT_PLAN_YEARS }, (_, i) => startYear + i), [startYear])
  const [byProduct, setByProduct] = useState(false)
  const [kindFilter, setKindFilter] = useState<'' | PtScopeKind>('')

  const [plans, setPlans] = useState<PtPlan[]>([])
  const [parts, setParts] = useState<PtParticipation[]>([])
  const [testing, setTesting] = useState<TestingScopeRow[]>([])
  const [calibration, setCalibration] = useState<CalibrationScopeRow[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [cellOpen, setCellOpen] = useState<{ unit: PtUnit; year: number } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PtPlan | null>(null)
  const [form, setForm] = useState<PlanForm>(() => emptyForm(currentYear))
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pRes, aRes, tRes, cRes, prRes] = await Promise.all([
        supabase.from('pt_plans').select('*').order('planned_year').order('discipline'),
        supabase
          .from('pt_participations')
          .select('id, plan_id, scope_kind, discipline, sub_discipline, parameter, round_code, scheme_name, provider_name, reported_on, received_on, created_at, performance, status, nc_record_id')
          .order('reported_on', { ascending: false, nullsFirst: false })
          .limit(5000),
        supabase.from('nabl_scope').select('id, discipline_group, materials_products, component_parameter, scope_status').limit(5000),
        supabase.from('calibration_nabl_scope').select('id, discipline_name, group_name, measurand').limit(5000),
        supabase.from('clients').select('id, company_name, company_type').order('company_name').limit(5000),
      ])
      if (pRes.error) {
        if (isPtMissingError(pRes.error)) {
          setMissing(true)
          return
        }
        throw pRes.error
      }
      if (aRes.error) throw aRes.error
      setMissing(false)
      setPlans((pRes.data ?? []) as PtPlan[])
      setParts((aRes.data ?? []) as PtParticipation[])
      // Scope tables are optional for the plan (a lab may hold only one kind).
      setTesting(tRes.error ? [] : ((tRes.data ?? []) as TestingScopeRow[]))
      setCalibration(cRes.error ? [] : ((cRes.data ?? []) as CalibrationScopeRow[]))
      setProviders(prRes.error ? [] : ((prRes.data ?? []) as ProviderOption[]))
    } catch (err) {
      setError(ptErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const scopeUnits = useMemo(() => buildScopeUnits(testing, calibration, byProduct), [testing, calibration, byProduct])
  const units = useMemo(() => {
    const all = [...scopeUnits, ...extraUnits(scopeUnits, [...plans, ...parts])]
    return kindFilter ? all.filter((u) => u.kind === kindFilter) : all
  }, [scopeUnits, plans, parts, kindFilter])

  const grid = useMemo(
    () =>
      units.map((u) => ({
        unit: u,
        cells: years.map((y) => gridCell(u, y, plans, parts, currentYear)),
      })),
    [units, years, plans, parts, currentYear],
  )

  const notPlanned = grid.filter((g) => g.unit.inScope && g.cells.every((c) => c.state === 'none'))
  const gaps = useMemo(() => coverageGaps(units, parts), [units, parts])
  const stats = useMemo(() => {
    const flat = grid.flatMap((g) => g.cells)
    return {
      done: flat.filter((c) => c.state === 'done').length,
      planned: flat.filter((c) => c.state === 'planned').length,
      missed: flat.filter((c) => c.state === 'missed').length,
    }
  }, [grid])

  const periodPlans = useMemo(
    () =>
      plans
        .filter((p) => p.planned_year >= years[0] && p.planned_year <= years[years.length - 1])
        .filter((p) => !kindFilter || p.scope_kind === kindFilter),
    [plans, years, kindFilter],
  )

  const yearOptions = useMemo(() => {
    const set = new Set<number>([currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1])
    for (const p of plans) set.add(Number(p.period_from.slice(0, 4)))
    return [...set].sort((a, b) => a - b)
  }, [plans, currentYear])

  const providerName = (id: string | null) => (id ? providers.find((p) => p.id === id)?.company_name ?? 'Removed provider' : '—')
  const ptProviders = useMemo(() => {
    const isPt = (p: ProviderOption) => (p.company_type ?? '').toLowerCase() === 'pt provider'
    return [...providers.filter(isPt), ...providers.filter((p) => !isPt(p))]
  }, [providers])

  const disciplineOptions = useMemo(
    () => [...new Set(scopeUnits.filter((u) => u.kind === form.scopeKind).map((u) => u.discipline))].sort(),
    [scopeUnits, form.scopeKind],
  )
  const subOptions = useMemo(
    () =>
      [
        ...new Set(
          scopeUnits
            .filter((u) => u.kind === form.scopeKind && u.discipline.toLowerCase() === form.discipline.trim().toLowerCase() && u.sub)
            .map((u) => u.sub),
        ),
      ].sort(),
    [scopeUnits, form.scopeKind, form.discipline],
  )

  const openNew = (unit?: PtUnit, year?: number) => {
    setEditing(null)
    setForm({
      ...emptyForm(year ?? Math.max(currentYear, years[0])),
      ...(unit ? { scopeKind: unit.kind, discipline: unit.discipline, subDiscipline: unit.sub } : {}),
      plannedYear: String(year ?? Math.min(Math.max(currentYear, years[0]), years[years.length - 1])),
    })
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (p: PtPlan) => {
    setEditing(p)
    setForm({
      scopeKind: p.scope_kind,
      discipline: p.discipline,
      subDiscipline: p.sub_discipline ?? '',
      plannedYear: String(p.planned_year),
      providerId: p.planned_provider_id ?? '',
      scheme: p.scheme ?? '',
      parameters: p.parameters ?? '',
      status: p.status,
      remarks: p.remarks ?? '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.discipline.trim()) {
      setFormError('Enter the discipline / group.')
      return
    }
    const year = Number(form.plannedYear)
    const from = editing ? Number(editing.period_from.slice(0, 4)) : startYear
    const to = editing ? Number(editing.period_to.slice(0, 4)) : startYear + PT_PLAN_YEARS - 1
    if (!Number.isInteger(year) || year < from || year > to) {
      setFormError(`Planned year must be within the plan period ${from}–${to}.`)
      return
    }
    const disc = norm(form.discipline)
    const sub = norm(form.subDiscipline)
    const scopeIds =
      form.scopeKind === 'testing'
        ? testing
            .filter((r) => norm(r.discipline_group) === disc && (!sub || norm(r.materials_products) === sub))
            .map((r) => r.id)
        : calibration
            .filter((r) => norm(r.discipline_name) === disc && (!sub || norm(r.group_name) === sub))
            .map((r) => r.id)
    const payload = {
      period_from: editing ? editing.period_from : `${startYear}-01-01`,
      period_to: editing ? editing.period_to : `${startYear + PT_PLAN_YEARS - 1}-12-31`,
      scope_kind: form.scopeKind,
      discipline: form.discipline.trim(),
      sub_discipline: form.subDiscipline.trim(),
      scope_ids: scopeIds,
      planned_year: year,
      planned_provider_id: form.providerId || null,
      scheme: form.scheme.trim() || null,
      parameters: form.parameters.trim() || null,
      status: form.status,
      remarks: form.remarks.trim() || null,
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        const { data, error: err } = await supabase.from('pt_plans').update(payload).eq('id', editing.id).select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director, Quality Manager or Technical Manager only).')
      } else {
        const { error: err } = await supabase.from('pt_plans').insert(payload)
        if (err) throw err
      }
      setFormOpen(false)
      setMessage(editing ? 'Plan row updated.' : 'Plan row added.')
      await load()
    } catch (err) {
      setFormError(ptErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: PtPlan) => {
    const reason = await askReason({
      title: 'Reason for deleting a PT plan row',
      recordLabel: `${p.planned_year} · ${p.discipline}${p.sub_discipline ? ` › ${p.sub_discipline}` : ''}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Sub-discipline removed from scope', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('pt_plans').delete().eq('id', p.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? ptErrorText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('pt_plans', p.id, reason)
    setCellOpen(null)
    await load()
  }

  const cellDetail = cellOpen ? gridCell(cellOpen.unit, cellOpen.year, plans, parts, currentYear) : null

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Proficiency Testing Plan"
        clause="7.7.2"
        subtitle={`${PT_PLAN_YEARS}-year PT / ILC plan by sub-discipline (NABL: every sub-discipline of the scope covered).`}
        actions={
          <>
            {canManage && !missing ? (
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => openNew()}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add plan row</span>
              </Button>
            ) : null}
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />
      {missing ? <PtMissingNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <>
          <EnvPanel title="Plan period">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Period starts" htmlFor="pt-start">
                <EnvSelect id="pt-start" value={String(startYear)} onChange={(v) => setStartYear(Number(v))}>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}–{y + PT_PLAN_YEARS - 1}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Scope" htmlFor="pt-kind">
                <EnvSelect id="pt-kind" value={kindFilter} onChange={(v) => setKindFilter(v as '' | PtScopeKind)}>
                  <option value="">Testing + calibration</option>
                  <option value="testing">Testing</option>
                  <option value="calibration">Calibration</option>
                </EnvSelect>
              </Field>
              <label className="col-span-2 flex min-h-10 items-end gap-2 pb-1.5 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={byProduct} onChange={(e) => setByProduct(e.target.checked)} />
                Testing: one row per material / product group
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
              {(['done', 'planned', 'missed', 'none'] as CellState[]).map((s) => (
                <span key={s} className={cn('border px-2 py-0.5 font-semibold', CELL_CLASS[s])}>
                  {s === 'none' ? 'Not planned' : CELL_LABEL[s]}
                </span>
              ))}
              <span className="ml-auto text-stone-600">
                {stats.done} done · {stats.planned} planned · {stats.missed} missed
              </span>
            </div>
          </EnvPanel>

          <EnvPanel title={`Sub-disciplines × years (${units.length})`}>
            {units.length === 0 && !loading ? (
              <p className="p-4 text-center text-[13px] text-stone-600">
                No scope rows found. Add the NABL scope (testing or calibration) or add plan rows directly.
              </p>
            ) : null}

            <div className="space-y-1.5 md:hidden">
              {grid.map(({ unit, cells }) => (
                <div key={unit.key} className="border border-stone-300 bg-white p-2">
                  <p className="text-[13px] font-semibold">
                    {unitLabel(unit)}{' '}
                    <span className="text-[11px] font-normal uppercase text-stone-500">{unit.kind}</span>
                    {!unit.inScope ? <span className="ml-1 text-[11px] text-amber-800">(not in scope)</span> : null}
                  </p>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {cells.map((c, i) => (
                      <CellChip key={years[i]} cell={c} label={String(years[i])} onClick={() => setCellOpen({ unit, year: years[i] })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={cn(envThClass, 'text-left')}>Discipline › sub-discipline</th>
                    <th className={envThClass}>Scope</th>
                    {years.map((y) => (
                      <th key={y} className={cn(envThClass, 'w-[110px]')}>
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map(({ unit, cells }, i) => (
                    <tr key={unit.key} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={envTdClass} title={unit.items.slice(0, 20).join(', ')}>
                        <span className="font-semibold">{unitLabel(unit)}</span>
                        {!unit.inScope ? <span className="ml-1 text-[11px] text-amber-800">(not in scope)</span> : null}
                        {unit.items.length ? (
                          <span className="block text-[11px] text-stone-500">{unit.items.length} parameter(s) in scope</span>
                        ) : null}
                      </td>
                      <td className={cn(envTdClass, 'text-center text-[11px] uppercase')}>{unit.kind}</td>
                      {cells.map((c, j) => (
                        <td key={years[j]} className={cn(envTdClass, 'p-1')}>
                          <CellChip cell={c} onClick={() => setCellOpen({ unit, year: years[j] })} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </EnvPanel>

          <EnvPanel
            title="Coverage check"
            right={
              gaps.length === 0 && notPlanned.length === 0 && units.length ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All covered
                </span>
              ) : null
            }
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-red-800">
                  No PT in the last {PT_PLAN_YEARS} years ({gaps.length})
                </p>
                {gaps.length === 0 ? (
                  <p className="text-[13px] text-stone-600">Every scope sub-discipline has a PT within {PT_PLAN_YEARS} years.</p>
                ) : (
                  <ul className="space-y-1">
                    {gaps.map(({ unit, last }) => (
                      <li key={unit.key} className="flex items-start gap-2 border border-red-200 bg-red-50 px-2 py-1.5 text-[13px]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                        <span>
                          <span className="font-semibold">{unitLabel(unit)}</span>{' '}
                          <span className="text-[11px] uppercase text-stone-500">{unit.kind}</span>
                          <span className="block text-[12px] text-stone-600">
                            {last ? `Last PT ${formatDate(participationDate(last))} (${last.parameter})` : 'Never participated'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-amber-800">
                  Not in the {years[0]}–{years[years.length - 1]} plan ({notPlanned.length})
                </p>
                {notPlanned.length === 0 ? (
                  <p className="text-[13px] text-stone-600">Every scope sub-discipline has at least one planned PT in this period.</p>
                ) : (
                  <ul className="space-y-1">
                    {notPlanned.map(({ unit }) => (
                      <li key={unit.key} className="flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-amber-50 px-2 py-1.5 text-[13px]">
                        <span>
                          <span className="font-semibold">{unitLabel(unit)}</span>{' '}
                          <span className="text-[11px] uppercase text-stone-500">{unit.kind}</span>
                        </span>
                        {canManage ? (
                          <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-7')} onClick={() => openNew(unit)}>
                            <Plus className="h-3.5 w-3.5" /> Plan
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </EnvPanel>

          <EnvPanel title={`Plan rows ${years[0]}–${years[years.length - 1]} (${periodPlans.length})`}>
            <div className="space-y-1.5 md:hidden">
              {periodPlans.map((p) => (
                <div key={p.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                  <p className="font-semibold">
                    {p.planned_year} · {p.discipline}
                    {p.sub_discipline ? ` › ${p.sub_discipline}` : ''}
                  </p>
                  <p className="text-[12px] text-stone-600">
                    {providerName(p.planned_provider_id)}
                    {p.scheme ? ` · ${p.scheme}` : ''} · {PT_PLAN_STATUS_LABEL[p.status]}
                  </p>
                  {p.parameters ? <p className="text-[12px]">{p.parameters}</p> : null}
                  {canManage ? (
                    <div className="mt-1 flex justify-end gap-1">
                      <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10')} onClick={() => openEdit(p)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isDirector ? (
                        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10')} onClick={() => void remove(p)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-red-700" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={envThClass}>Year</th>
                    <th className={envThClass}>Scope</th>
                    <th className={envThClass}>Discipline › sub-discipline</th>
                    <th className={envThClass}>Parameters</th>
                    <th className={envThClass}>Provider</th>
                    <th className={envThClass}>Scheme</th>
                    <th className={envThClass}>Status</th>
                    {canManage ? <th className={envThClass}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {periodPlans.map((p, i) => (
                    <tr key={p.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(envTdClass, 'text-center font-semibold')}>{p.planned_year}</td>
                      <td className={cn(envTdClass, 'text-center text-[11px] uppercase')}>{p.scope_kind}</td>
                      <td className={envTdClass}>
                        {p.discipline}
                        {p.sub_discipline ? ` › ${p.sub_discipline}` : ''}
                      </td>
                      <td className={cn(envTdClass, 'text-[11.5px]')}>{p.parameters || '—'}</td>
                      <td className={envTdClass}>{providerName(p.planned_provider_id)}</td>
                      <td className={envTdClass}>{p.scheme || '—'}</td>
                      <td className={cn(envTdClass, 'text-center')}>{PT_PLAN_STATUS_LABEL[p.status]}</td>
                      {canManage ? (
                        <td className={cn(envTdClass, 'whitespace-nowrap text-center')}>
                          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} onClick={() => openEdit(p)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isDirector ? (
                            <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'ml-1 h-7 w-7')} onClick={() => void remove(p)} aria-label="Delete">
                              <Trash2 className="h-4 w-4 text-red-700" />
                            </Button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && periodPlans.length === 0 ? (
              <p className="p-4 text-center text-[13px] text-stone-600">No plan rows for this period yet.</p>
            ) : null}
          </EnvPanel>
        </>
      ) : null}

      {/* Cell detail */}
      <Dialog open={cellOpen !== null} onOpenChange={(open) => (!open ? setCellOpen(null) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                {cellOpen ? `${unitLabel(cellOpen.unit)} · ${cellOpen.year}` : ''}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                {cellDetail ? CELL_LABEL[cellDetail.state] : ''} — plan rows and PT rounds for this year.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[70vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            {cellDetail && cellOpen ? (
              <>
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-stone-600">Plan rows</p>
                  {cellDetail.plans.length === 0 ? <p className="text-[13px] text-stone-600">Nothing planned.</p> : null}
                  {cellDetail.plans.map((p) => (
                    <div key={p.id} className="mb-1 flex flex-wrap items-center justify-between gap-2 border border-stone-300 bg-white p-2 text-[13px]">
                      <span>
                        {providerName(p.planned_provider_id)}
                        {p.scheme ? ` · ${p.scheme}` : ''} · <strong>{PT_PLAN_STATUS_LABEL[p.status]}</strong>
                        {p.parameters ? <span className="block text-[12px] text-stone-600">{p.parameters}</span> : null}
                      </span>
                      {canManage ? (
                        <span className="flex gap-1">
                          <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10 sm:h-7 sm:w-7')} onClick={() => { setCellOpen(null); openEdit(p) }} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isDirector ? (
                            <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10 sm:h-7 sm:w-7')} onClick={() => void remove(p)} aria-label="Delete">
                              <Trash2 className="h-4 w-4 text-red-700" />
                            </Button>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-stone-600">PT rounds</p>
                  {cellDetail.participations.length === 0 ? <p className="text-[13px] text-stone-600">No participation recorded.</p> : null}
                  {cellDetail.participations.map((p) => (
                    <div key={p.id} className="mb-1 flex flex-wrap items-center justify-between gap-2 border border-stone-300 bg-white p-2 text-[13px]">
                      <span>
                        <strong>{p.parameter}</strong> · {p.round_code || p.scheme_name || '—'} · {formatDate(participationDate(p))}
                        <span className="block text-[12px] text-stone-600">{p.provider_name || '—'}</span>
                      </span>
                      <PerformanceBadge value={p.performance} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button asChild variant="outline" className={limsOutlineBtnClass}>
                    <Link to={PT_PARTICIPATIONS_PATH}>Open PT participations</Link>
                  </Button>
                  {canManage ? (
                    <Button
                      className={limsPrimaryBtnClass}
                      onClick={() => {
                        const c = cellOpen
                        setCellOpen(null)
                        openNew(c.unit, c.year)
                      }}
                    >
                      <Plus className="h-4 w-4" /> Plan PT for {cellOpen.year}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / edit plan row */}
      <Dialog open={formOpen} onOpenChange={(open) => (!open && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-2xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">{editing ? 'Edit PT plan row' : 'Add PT plan row'}</DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                Plan period{' '}
                {editing
                  ? `${editing.period_from.slice(0, 4)}–${editing.period_to.slice(0, 4)}`
                  : `${startYear}–${startYear + PT_PLAN_YEARS - 1}`}
                . Prefer providers accredited to ISO/IEC 17043.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[75vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <datalist id="pt-plan-disciplines">
              {disciplineOptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <datalist id="pt-plan-subs">
              {subOptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Scope" htmlFor="pf-kind">
                <EnvSelect id="pf-kind" value={form.scopeKind} onChange={(v) => setForm({ ...form, scopeKind: v as PtScopeKind })}>
                  <option value="testing">Testing</option>
                  <option value="calibration">Calibration</option>
                </EnvSelect>
              </Field>
              <Field label="Planned year *" htmlFor="pf-year">
                <EnvSelect id="pf-year" value={form.plannedYear} onChange={(v) => setForm({ ...form, plannedYear: v })}>
                  {(editing
                    ? Array.from(
                        { length: Number(editing.period_to.slice(0, 4)) - Number(editing.period_from.slice(0, 4)) + 1 },
                        (_, i) => Number(editing.period_from.slice(0, 4)) + i,
                      )
                    : years
                  ).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label={form.scopeKind === 'testing' ? 'Discipline / group *' : 'Discipline *'} htmlFor="pf-disc">
                <Input id="pf-disc" list="pt-plan-disciplines" value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} className={envInputClass} />
              </Field>
              <Field label={form.scopeKind === 'testing' ? 'Material / product (optional)' : 'Group'} htmlFor="pf-sub">
                <Input id="pf-sub" list="pt-plan-subs" value={form.subDiscipline} onChange={(e) => setForm({ ...form, subDiscipline: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Planned provider" htmlFor="pf-prov">
                <EnvSelect id="pf-prov" value={form.providerId} onChange={(v) => setForm({ ...form, providerId: v })}>
                  <option value="">— Not decided —</option>
                  {ptProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.company_name}
                      {p.company_type ? ` (${p.company_type})` : ''}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Scheme / programme" htmlFor="pf-scheme">
                <Input id="pf-scheme" value={form.scheme} onChange={(e) => setForm({ ...form, scheme: e.target.value })} className={envInputClass} />
              </Field>
              <Field label="Status" htmlFor="pf-status">
                <EnvSelect id="pf-status" value={form.status} onChange={(v) => setForm({ ...form, status: v as PtPlanStatus })}>
                  {PT_PLAN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PT_PLAN_STATUS_LABEL[s]}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Parameters / measurands" htmlFor="pf-params">
                <Input id="pf-params" value={form.parameters} placeholder="e.g. SiO2, Fe2O3, LOI" onChange={(e) => setForm({ ...form, parameters: e.target.value })} className={envInputClass} />
              </Field>
            </div>
            <Field label="Remarks" htmlFor="pf-rem">
              <Textarea id="pf-rem" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="rounded-none border-stone-500 bg-white text-base sm:text-sm" />
            </Field>
            <MessageLine tone="error" text={formError} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className={limsOutlineBtnClass} onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
