import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, CopyPlus, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import {
  EnvHeader,
  EnvPanel,
  EnvSelect,
  Field,
  MessageLine,
  envInputClass,
  envTdClass,
  envThClass,
} from '@/features/environment/EnvironmentUi'
import { PlanStatusBadge, SamplingGate } from './SamplingUi'
import { canManageSampling, useSamplingSwitch } from './samplingAccess'
import {
  intOrNull,
  isCodeLabel,
  num,
  planLabel,
  samplingErrorText,
  statisticalBasisText,
  type SamplingPlan,
} from './shared'

type IsCodeOption = { id: string; is_number: string | null; revision_year: string | null; title: string | null }

type PlanForm = {
  title: string
  matrix: string
  isCodeId: string
  methodReference: string
  lotSize: string
  sampleSize: string
  acceptanceNumber: string
  rejectionNumber: string
  aql: string
  inspectionLevel: string
  statisticalBasis: string
  locations: string
  frequency: string
  factorsToControl: string
  handlingInstructions: string
  remarks: string
}

const EMPTY_FORM: PlanForm = {
  title: '',
  matrix: '',
  isCodeId: '',
  methodReference: '',
  lotSize: '',
  sampleSize: '',
  acceptanceNumber: '',
  rejectionNumber: '',
  aql: '',
  inspectionLevel: '',
  statisticalBasis: '',
  locations: '',
  frequency: '',
  factorsToControl: '',
  handlingInstructions: '',
  remarks: '',
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

function planToForm(p: SamplingPlan): PlanForm {
  return {
    title: p.title,
    matrix: p.matrix ?? '',
    isCodeId: p.is_code_id ?? '',
    methodReference: p.method_reference ?? '',
    lotSize: str(p.lot_size),
    sampleSize: str(p.sample_size),
    acceptanceNumber: str(p.acceptance_number),
    rejectionNumber: str(p.rejection_number),
    aql: str(p.aql),
    inspectionLevel: p.inspection_level ?? '',
    statisticalBasis: p.statistical_basis ?? '',
    locations: (p.locations ?? []).join('\n'),
    frequency: p.frequency ?? '',
    factorsToControl: p.factors_to_control ?? '',
    handlingInstructions: p.handling_instructions ?? '',
    remarks: p.remarks ?? '',
  }
}

const blank = (s: string) => s.trim() || null

function formToPayload(f: PlanForm) {
  return {
    title: f.title.trim(),
    matrix: blank(f.matrix),
    is_code_id: f.isCodeId || null,
    method_reference: blank(f.methodReference),
    lot_size: intOrNull(f.lotSize),
    sample_size: intOrNull(f.sampleSize),
    acceptance_number: intOrNull(f.acceptanceNumber),
    rejection_number: intOrNull(f.rejectionNumber),
    aql: num(f.aql),
    inspection_level: blank(f.inspectionLevel),
    statistical_basis: blank(f.statisticalBasis),
    locations: f.locations
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    frequency: blank(f.frequency),
    factors_to_control: blank(f.factorsToControl),
    handling_instructions: blank(f.handlingInstructions),
    remarks: blank(f.remarks),
  }
}

function validate(f: PlanForm): string | null {
  if (!f.title.trim()) return 'Title is required.'
  const ints: Array<[string, string]> = [
    ['Lot size', f.lotSize],
    ['Sample size', f.sampleSize],
    ['Acceptance number', f.acceptanceNumber],
    ['Rejection number', f.rejectionNumber],
  ]
  for (const [label, v] of ints) if (v.trim() && num(v) === null) return `${label} must be a number.`
  if (f.aql.trim() && num(f.aql) === null) return 'AQL must be a number.'
  const lot = intOrNull(f.lotSize)
  const n = intOrNull(f.sampleSize)
  const ac = intOrNull(f.acceptanceNumber)
  const re = intOrNull(f.rejectionNumber)
  if (lot !== null && lot <= 0) return 'Lot size must be above 0.'
  if (n !== null && n <= 0) return 'Sample size must be above 0.'
  if (lot !== null && n !== null && n > lot) return 'Sample size cannot exceed the lot size.'
  if (ac !== null && n !== null && ac >= n) return 'Acceptance number must be below the sample size.'
  if (ac !== null && re !== null && re <= ac) return 'Rejection number must be above the acceptance number.'
  const aql = num(f.aql)
  if (aql !== null && (aql <= 0 || aql > 100)) return 'AQL must be between 0 and 100 %.'
  return null
}

/** What approval needs (same checks as the database). */
function approvalProblem(p: SamplingPlan): string | null {
  if (!p.method_reference?.trim() && !p.is_code_id) return 'Record the sampling standard / method reference first.'
  if (p.sample_size == null && !p.statistical_basis?.trim()) return 'Record the statistical basis (sample size or scheme) first.'
  if (!p.factors_to_control?.trim()) return 'Record the factors to be controlled first (7.3.1 c).'
  return null
}

export default function SamplingPlansPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const isDirector = isLaboratoryDirector(designation)
  const canManage = canManageSampling(designation, departmentName, isDirector)
  const switchState = useSamplingSwitch()

  const [plans, setPlans] = useState<SamplingPlan[]>([])
  const [isCodes, setIsCodes] = useState<IsCodeOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SamplingPlan | null>(null)
  const [revising, setRevising] = useState<SamplingPlan | null>(null)
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pRes, iRes] = await Promise.all([
        supabase.from('sampling_plans').select('*').order('plan_no', { ascending: false }).order('version', { ascending: false }),
        supabase.from('is_codes').select('id, is_number, revision_year, title').order('is_number'),
      ])
      if (pRes.error) throw pRes.error
      setPlans((pRes.data ?? []) as SamplingPlan[])
      setIsCodes((iRes.data ?? []) as IsCodeOption[])
    } catch (err) {
      setError(samplingErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (switchState === 'on') void load()
  }, [switchState, load])

  const isCodeById = useMemo(() => new Map(isCodes.map((c) => [c.id, c])), [isCodes])
  const methodText = (p: SamplingPlan) =>
    [p.method_reference?.trim(), p.is_code_id ? isCodeLabel(isCodeById.get(p.is_code_id)) : '']
      .filter(Boolean)
      .join(' · ') || '—'

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return plans.filter(
      (p) =>
        (showOld || p.status === 'draft' || p.status === 'approved') &&
        (!q ||
          `${p.plan_no} ${p.title} ${p.matrix ?? ''} ${p.method_reference ?? ''}`.toLowerCase().includes(q)),
    )
  }, [plans, search, showOld])

  const openNew = () => {
    setEditing(null)
    setRevising(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormOpen(true)
  }
  const openEdit = (p: SamplingPlan) => {
    setEditing(p)
    setRevising(null)
    setForm(planToForm(p))
    setFormError(null)
    setFormOpen(true)
  }
  const openRevise = (p: SamplingPlan) => {
    setEditing(null)
    setRevising(p)
    setForm(planToForm(p))
    setFormError(null)
    setFormOpen(true)
  }

  const save = async () => {
    const problem = validate(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = formToPayload(form)
      if (editing) {
        const { error: err } = await supabase.from('sampling_plans').update(payload).eq('id', editing.id)
        if (err) throw err
        setMessage(`${planLabel(editing)} saved.`)
      } else {
        const { data, error: err } = await supabase
          .from('sampling_plans')
          .insert({ ...payload, supersedes_id: revising?.id ?? null })
          .select('plan_no, version')
          .single()
        if (err) throw err
        setMessage(`${planLabel(data as SamplingPlan)} created as a draft.`)
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setFormError(samplingErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const approve = async (p: SamplingPlan) => {
    const problem = approvalProblem(p)
    if (problem) {
      setMessage(problem)
      return
    }
    const prev = plans.find((x) => x.plan_no === p.plan_no && x.status === 'approved' && x.id !== p.id)
    const ok = window.confirm(
      `Approve ${planLabel(p)}?${prev ? ` ${planLabel(prev)} will be superseded.` : ''} Approved plans cannot be edited.`,
    )
    if (!ok) return
    const { error: err } = await supabase.from('sampling_plans').update({ status: 'approved' }).eq('id', p.id)
    if (err) {
      setMessage(samplingErrorText(err))
      return
    }
    setMessage(`${planLabel(p)} approved.`)
    await load()
  }

  const withdraw = async (p: SamplingPlan) => {
    const reason = await askReason({
      title: `Reason for withdrawing ${planLabel(p)}`,
      recordLabel: p.title,
      description: 'A withdrawn plan stays on record but can no longer be used for new sampling.',
      confirmLabel: 'Withdraw',
      quickPicks: ['Method no longer used', 'Replaced by another plan', 'Customer contract ended'],
    })
    if (!reason) return
    const { error: err } = await supabase.from('sampling_plans').update({ status: 'withdrawn' }).eq('id', p.id)
    if (err) {
      setMessage(samplingErrorText(err))
      return
    }
    await recordReason('sampling_plans', p.id, reason)
    setMessage(`${planLabel(p)} withdrawn.`)
    await load()
  }

  const remove = async (p: SamplingPlan) => {
    if (!window.confirm(`Delete draft ${planLabel(p)}?`)) return
    const { error: err } = await supabase.from('sampling_plans').delete().eq('id', p.id)
    if (err) {
      setMessage(samplingErrorText(err))
      return
    }
    setMessage(`Draft ${planLabel(p)} deleted.`)
    await load()
  }

  const actions = (p: SamplingPlan) =>
    canManage ? (
      <div className="flex flex-wrap justify-center gap-1">
        {p.status === 'draft' ? (
          <>
            <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => openEdit(p)} aria-label={`Edit ${planLabel(p)}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => void approve(p)} aria-label={`Approve ${planLabel(p)}`} title="Approve">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            </Button>
            <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => void remove(p)} aria-label={`Delete ${planLabel(p)}`}>
              <Trash2 className="h-4 w-4 text-red-700" />
            </Button>
          </>
        ) : null}
        {p.status === 'approved' ? (
          <>
            <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => openRevise(p)} aria-label={`New version of ${planLabel(p)}`} title="New version">
              <CopyPlus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => void withdraw(p)} aria-label={`Withdraw ${planLabel(p)}`} title="Withdraw">
              <Ban className="h-4 w-4 text-red-700" />
            </Button>
          </>
        ) : null}
      </div>
    ) : null

  const set = (patch: Partial<PlanForm>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Sampling Plans"
        clause="7.3.1 – 7.3.2"
        subtitle="Sampling plans and methods: statistical basis, locations, frequency and the factors to control."
        actions={
          switchState === 'on' ? (
            <>
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              {canManage ? (
                <Button className={limsPrimaryBtnClass} onClick={openNew}>
                  <Plus className="h-4 w-4" /> New plan
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <SamplingGate state={switchState}>
        <MessageLine tone="error" text={error} />
        <MessageLine text={message} />
        <EnvPanel
          title={`Plans (${visible.length})`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12px] text-amber-100">
                <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} className="h-4 w-4" />
                Show superseded / withdrawn
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search plans"
                className={cn(limsDarkBarSearchClass, 'h-8 w-40 sm:w-56')}
              />
            </div>
          }
        >
          {!canManage ? (
            <p className="mb-2 text-[12px] text-stone-600">
              Plans are prepared and approved by the Laboratory Director, Quality Manager or a Technical Manager.
            </p>
          ) : null}

          {/* Phone: cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((p) => (
              <div key={p.id} className={cn('border border-stone-400 bg-white p-2.5', p.status !== 'draft' && p.status !== 'approved' && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-semibold text-amber-800">{planLabel(p)}</p>
                    <p className="font-semibold text-stone-900">{p.title}</p>
                    <p className="text-[12px] text-stone-600">{p.matrix || '—'}</p>
                  </div>
                  <PlanStatusBadge status={p.status} />
                </div>
                <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-[12.5px]">
                  <dt className="text-stone-500">Method</dt>
                  <dd className="break-words">{methodText(p)}</dd>
                  <dt className="text-stone-500">Statistical basis</dt>
                  <dd>{statisticalBasisText(p) || '—'}</dd>
                  <dt className="text-stone-500">Frequency</dt>
                  <dd>{p.frequency || '—'}</dd>
                </dl>
                <div className="mt-2">{actions(p)}</div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1000px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={envThClass}>Plan</th>
                  <th className={envThClass}>Title / matrix</th>
                  <th className={envThClass}>Standard / method</th>
                  <th className={envThClass}>Statistical basis</th>
                  <th className={envThClass}>Locations / frequency</th>
                  <th className={envThClass}>Factors to control</th>
                  <th className={envThClass}>Status</th>
                  <th className={cn(envThClass, 'w-32')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p, i) => (
                  <tr key={p.id} className={cn(i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]', p.status !== 'draft' && p.status !== 'approved' && 'opacity-60')}>
                    <td className={cn(envTdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>{planLabel(p)}</td>
                    <td className={envTdClass}>
                      <p className="font-semibold">{p.title}</p>
                      {p.matrix ? <p className="text-[11px] text-stone-600">{p.matrix}</p> : null}
                    </td>
                    <td className={envTdClass}>{methodText(p)}</td>
                    <td className={envTdClass}>{statisticalBasisText(p) || '—'}</td>
                    <td className={envTdClass}>
                      {(p.locations ?? []).length ? <p>{(p.locations ?? []).join('; ')}</p> : null}
                      <p className="text-[11px] text-stone-600">{p.frequency || '—'}</p>
                    </td>
                    <td className={cn(envTdClass, 'whitespace-pre-line')}>{p.factors_to_control || '—'}</td>
                    <td className={cn(envTdClass, 'text-center')}>
                      <PlanStatusBadge status={p.status} />
                      {p.approved_at ? (
                        <p className="mt-0.5 text-[10.5px] text-stone-600">
                          {p.approved_by_name || '—'}
                          <br />
                          {formatDateTime(p.approved_at)}
                        </p>
                      ) : null}
                    </td>
                    <td className={cn(envTdClass, 'text-center')}>{actions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && visible.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-stone-600">
              No sampling plans yet{canManage ? ' — add the first plan.' : '.'}
            </p>
          ) : null}
        </EnvPanel>
      </SamplingGate>

      <Dialog open={formOpen} onOpenChange={(o) => (!o && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex max-h-[95dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                {editing ? `Edit ${planLabel(editing)}` : revising ? `New version of ${planLabel(revising)}` : 'New sampling plan'}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                The plan number is given by the system. A plan is a draft until it is approved.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Title *" htmlFor="sp-title" className="sm:col-span-2">
                <Input id="sp-title" className={envInputClass} value={form.title} placeholder="Fresh concrete at site"
                  onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="Matrix / product" htmlFor="sp-matrix">
                <Input id="sp-matrix" className={envInputClass} value={form.matrix} placeholder="Ready-mix concrete"
                  onChange={(e) => set({ matrix: e.target.value })} />
              </Field>
              <Field label="IS code" htmlFor="sp-is">
                <EnvSelect id="sp-is" value={form.isCodeId} onChange={(v) => set({ isCodeId: v })}>
                  <option value="">— None —</option>
                  {isCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[isCodeLabel(c), c.title].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Standard / method reference" htmlFor="sp-method" className="sm:col-span-2">
                <Input id="sp-method" className={envInputClass} value={form.methodReference} placeholder="IS 1199 (Part 1):2018 clause 5"
                  onChange={(e) => set({ methodReference: e.target.value })} />
              </Field>
            </div>

            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Statistical basis (7.3.1 b)</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <Field label="Lot size" htmlFor="sp-lot">
                  <Input id="sp-lot" inputMode="numeric" className={envInputClass} value={form.lotSize} onChange={(e) => set({ lotSize: e.target.value })} />
                </Field>
                <Field label="Sample size n" htmlFor="sp-n">
                  <Input id="sp-n" inputMode="numeric" className={envInputClass} value={form.sampleSize} onChange={(e) => set({ sampleSize: e.target.value })} />
                </Field>
                <Field label="Accept Ac" htmlFor="sp-ac">
                  <Input id="sp-ac" inputMode="numeric" className={envInputClass} value={form.acceptanceNumber} onChange={(e) => set({ acceptanceNumber: e.target.value })} />
                </Field>
                <Field label="Reject Re" htmlFor="sp-re">
                  <Input id="sp-re" inputMode="numeric" className={envInputClass} value={form.rejectionNumber} onChange={(e) => set({ rejectionNumber: e.target.value })} />
                </Field>
                <Field label="AQL %" htmlFor="sp-aql">
                  <Input id="sp-aql" inputMode="decimal" className={envInputClass} value={form.aql} onChange={(e) => set({ aql: e.target.value })} />
                </Field>
                <Field label="Insp. level" htmlFor="sp-level">
                  <Input id="sp-level" className={envInputClass} value={form.inspectionLevel} placeholder="II" onChange={(e) => set({ inspectionLevel: e.target.value })} />
                </Field>
              </div>
              <Field label="Scheme / basis (text)" htmlFor="sp-basis" className="mt-3">
                <Input id="sp-basis" className={envInputClass} value={form.statisticalBasis} placeholder="IS 2500 (Part 1) single sampling, normal inspection"
                  onChange={(e) => set({ statisticalBasis: e.target.value })} />
              </Field>
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Sampling locations (one per line)" htmlFor="sp-loc">
                <Textarea id="sp-loc" rows={3} className="rounded-none border-stone-500 bg-stone-50 text-base sm:text-sm" value={form.locations}
                  onChange={(e) => set({ locations: e.target.value })} />
              </Field>
              <Field label="Frequency" htmlFor="sp-freq">
                <Input id="sp-freq" className={envInputClass} value={form.frequency} placeholder="One set per 50 m³ or part, each pour"
                  onChange={(e) => set({ frequency: e.target.value })} />
              </Field>
              <Field label="Factors to be controlled (7.3.1 c)" htmlFor="sp-factors">
                <Textarea id="sp-factors" rows={3} className="rounded-none border-stone-500 bg-stone-50 text-base sm:text-sm" value={form.factorsToControl}
                  placeholder="Sample within 15 min of discharge; avoid segregation; protect from sun"
                  onChange={(e) => set({ factorsToControl: e.target.value })} />
              </Field>
              <Field label="Containers, preservation, transport" htmlFor="sp-handling">
                <Textarea id="sp-handling" rows={3} className="rounded-none border-stone-500 bg-stone-50 text-base sm:text-sm" value={form.handlingInstructions}
                  onChange={(e) => set({ handlingInstructions: e.target.value })} />
              </Field>
              <Field label="Remarks" htmlFor="sp-remarks" className="sm:col-span-2">
                <Input id="sp-remarks" className={envInputClass} value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
              </Field>
            </div>
            <MessageLine tone="error" text={formError} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className={limsOutlineBtnClass} onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
