import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookmarkPlus, ClipboardCheck, Download, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarBtnClass, limsDialogClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
import { EnvHeader, EnvPanel, EnvSelect, Field, MessageLine, envInputClass, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { DueBadge, SupplierMissingNotice, SupplierNav, SupplierStatusBadge } from '../SupplierUi'
import {
  SUPPLIER_CATEGORY_LABEL,
  SUPPLIER_EVALUATIONS_PATH,
  SUPPLIER_STATUSES,
  SUPPLIER_STATUS_LABEL,
  asArray,
  canManageSuppliers,
  computeScore,
  downloadCsv,
  dueState,
  isSupplierMissingError,
  suggestedDecision,
  supplierErrorText,
  todayIso,
  type ClientOption,
  type CriteriaTemplate,
  type EvaluationCriterion,
  type SupplierApproval,
  type SupplierEvaluation,
  type SupplierStatus,
} from '../supplierShared'

type EvalForm = {
  approvalId: string
  evaluatedOn: string
  period: string
  criteria: EvaluationCriterion[]
  decision: '' | SupplierStatus
  evaluatedBy: string
  remarks: string
}

function defaultPeriod(): string {
  // Indian financial year, e.g. 2026-27.
  const d = new Date()
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
}

const SCORE_LABEL: Record<number, string> = { 1: '1 Poor', 2: '2 Fair', 3: '3 Good', 4: '4 Very good', 5: '5 Excellent' }

export default function SupplierEvaluationsPage() {
  const { designation, departmentName } = useAuth()
  const askReason = useReasonForChange()
  const isDirector = isLaboratoryDirector(designation)
  const canManage = canManageSuppliers(designation, departmentName, isDirector)
  const [params, setParams] = useSearchParams()

  const [approvals, setApprovals] = useState<SupplierApproval[]>([])
  const [evaluations, setEvaluations] = useState<SupplierEvaluation[]>([])
  const [templates, setTemplates] = useState<CriteriaTemplate[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [approvalFilter, setApprovalFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierEvaluation | null>(null)
  const [form, setForm] = useState<EvalForm | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [aRes, eRes, tRes, cRes] = await Promise.all([
        supabase.from('supplier_approvals').select('*').limit(5000),
        supabase.from('supplier_evaluations').select('*').order('evaluated_on', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
        supabase.from('supplier_criteria_templates').select('*'),
        supabase.from('clients').select('id, company_name, company_type').order('company_name').limit(5000),
      ])
      for (const res of [aRes, eRes, tRes]) {
        if (res.error) {
          if (isSupplierMissingError(res.error)) {
            setMissing(true)
            return
          }
          throw res.error
        }
      }
      setMissing(false)
      setApprovals((aRes.data ?? []) as SupplierApproval[])
      setEvaluations(
        ((eRes.data ?? []) as SupplierEvaluation[]).map((e) => ({ ...e, criteria: asArray<EvaluationCriterion>(e.criteria) })),
      )
      setTemplates(
        ((tRes.data ?? []) as CriteriaTemplate[]).map((t) => ({
          ...t,
          criteria: asArray(t.criteria),
          pass_score: Number(t.pass_score),
          conditional_score: Number(t.conditional_score),
        })),
      )
      setClients(cRes.error ? [] : ((cRes.data ?? []) as ClientOption[]))
    } catch (err) {
      setError(supplierErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const clientName = useCallback(
    (id: string) => clients.find((c) => c.id === id)?.company_name ?? 'Unknown / deleted client',
    [clients],
  )
  const approvalById = useMemo(() => new Map(approvals.map((a) => [a.id, a])), [approvals])
  const approvalLabel = useCallback(
    (id: string) => {
      const a = approvalById.get(id)
      return a ? `${clientName(a.client_id)} · ${SUPPLIER_CATEGORY_LABEL[a.category]}` : 'Removed supplier entry'
    },
    [approvalById, clientName],
  )
  const sortedApprovals = useMemo(
    () => [...approvals].sort((a, b) => approvalLabel(a.id).localeCompare(approvalLabel(b.id))),
    [approvals, approvalLabel],
  )
  const templateFor = useCallback(
    (approvalId: string) => templates.find((t) => t.category === approvalById.get(approvalId)?.category),
    [templates, approvalById],
  )

  const dueList = useMemo(
    () =>
      approvals
        .filter((a) => a.status !== 'not_approved')
        .filter((a) => !a.last_evaluated_on || ['overdue', 'soon'].includes(dueState(a.next_evaluation_due, 30)))
        .sort((a, b) => (a.next_evaluation_due ?? '').localeCompare(b.next_evaluation_due ?? '')),
    [approvals],
  )

  const shown = useMemo(
    () => evaluations.filter((e) => !approvalFilter || e.approval_id === approvalFilter),
    [evaluations, approvalFilter],
  )

  const openNew = useCallback(
    (approvalId = '') => {
      const tpl = approvalId ? templateFor(approvalId) : undefined
      setEditing(null)
      setForm({
        approvalId,
        evaluatedOn: todayIso(),
        period: defaultPeriod(),
        criteria: (tpl?.criteria ?? []).map((c) => ({ criterion: c.criterion, weight: Number(c.weight) || 1, score: null })),
        decision: '',
        evaluatedBy: '',
        remarks: '',
      })
      setFormError(null)
      setFormOpen(true)
    },
    [templateFor],
  )

  // Deep link from the Approved Supplier List: ?approval=<id>
  const linked = params.get('approval')
  useEffect(() => {
    if (!linked || loading || missing || approvals.length === 0) return
    if (approvalById.has(linked)) {
      setApprovalFilter(linked)
      if (canManage) openNew(linked)
    }
    const next = new URLSearchParams(params)
    next.delete('approval')
    setParams(next, { replace: true })
  }, [linked, loading, missing, approvals.length, approvalById, canManage, openNew, params, setParams])

  const openEdit = (e: SupplierEvaluation) => {
    setEditing(e)
    setForm({
      approvalId: e.approval_id,
      evaluatedOn: e.evaluated_on,
      period: e.period ?? '',
      criteria: e.criteria.map((c) => ({ criterion: c.criterion, weight: Number(c.weight) || 1, score: c.score ?? null })),
      decision: e.decision ?? '',
      evaluatedBy: e.evaluated_by ?? '',
      remarks: e.remarks ?? '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const setApproval = (approvalId: string) => {
    if (!form) return
    const tpl = templateFor(approvalId)
    const keep = form.criteria.some((c) => c.score !== null)
    setForm({
      ...form,
      approvalId,
      criteria: keep ? form.criteria : (tpl?.criteria ?? []).map((c) => ({ criterion: c.criterion, weight: Number(c.weight) || 1, score: null })),
    })
  }

  const setCriterion = (i: number, patch: Partial<EvaluationCriterion>) => {
    if (!form) return
    setForm({ ...form, criteria: form.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  }

  const score = form ? computeScore(form.criteria) : null
  const suggestion = form ? suggestedDecision(score, templateFor(form.approvalId)) : null

  const save = async () => {
    if (!form) return
    if (!form.approvalId) {
      setFormError('Choose the supplier entry to evaluate.')
      return
    }
    if (form.criteria.length === 0) {
      setFormError('Add at least one criterion.')
      return
    }
    const bad = form.criteria.find((c) => !c.criterion.trim() || !(c.weight > 0) || c.score === null)
    if (bad) {
      setFormError('Every criterion needs a name, a weight above 0 and a score from 1 to 5.')
      return
    }
    const payload = {
      approval_id: form.approvalId,
      evaluated_on: form.evaluatedOn,
      period: form.period.trim() || null,
      criteria: form.criteria.map((c) => ({ criterion: c.criterion.trim(), weight: c.weight, score: c.score })),
      decision: form.decision || null,
      evaluated_by: form.evaluatedBy.trim() || null,
      remarks: form.remarks.trim() || null,
    }
    let reason: string | null = null
    if (editing) {
      reason = await askReason({
        title: 'Reason for changing a supplier evaluation',
        recordLabel: `${approvalLabel(editing.approval_id)} · ${formatDate(editing.evaluated_on)}`,
        quickPicks: ['Score corrected', 'Decision corrected', 'Correction of entry'],
      })
      if (!reason) return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        const { data, error: err } = await supabase.from('supplier_evaluations').update(payload).eq('id', editing.id).select('id')
        if (err) throw err
        if (!data?.length) throw new Error('Not saved (Laboratory Director, Quality Manager or Technical Manager only).')
        if (reason) await recordReason('supplier_evaluations', editing.id, reason)
      } else {
        const { error: err } = await supabase.from('supplier_evaluations').insert(payload)
        if (err) throw err
      }
      setFormOpen(false)
      setMessage(editing ? 'Evaluation updated.' : 'Evaluation saved. The supplier status and next evaluation date were updated.')
      await load()
    } catch (err) {
      setFormError(supplierErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const saveAsTemplate = async () => {
    if (!form) return
    const cat = approvalById.get(form.approvalId)?.category
    if (!cat) return
    const criteria = form.criteria
      .filter((c) => c.criterion.trim() && c.weight > 0)
      .map((c) => ({ criterion: c.criterion.trim(), weight: c.weight }))
    if (criteria.length === 0) return
    const { data, error: err } = await supabase
      .from('supplier_criteria_templates')
      .upsert({ category: cat, criteria }, { onConflict: 'category' })
      .select('category')
    if (err || !data?.length) {
      setFormError(err ? supplierErrorText(err) : 'Template not saved.')
      return
    }
    setFormError(null)
    setMessage(`Criteria saved as the template for ${SUPPLIER_CATEGORY_LABEL[cat]}.`)
    setTemplates((prev) => {
      const old = prev.find((t) => t.category === cat)
      const next: CriteriaTemplate = { category: cat, criteria, pass_score: old?.pass_score ?? 70, conditional_score: old?.conditional_score ?? 50 }
      return [...prev.filter((t) => t.category !== cat), next]
    })
  }

  const remove = async (e: SupplierEvaluation) => {
    const reason = await askReason({
      title: 'Reason for deleting a supplier evaluation',
      recordLabel: `${approvalLabel(e.approval_id)} · ${formatDate(e.evaluated_on)}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('supplier_evaluations').delete().eq('id', e.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? supplierErrorText(err) : 'Not deleted (Laboratory Director only).')
      return
    }
    await recordReason('supplier_evaluations', e.id, reason)
    await load()
  }

  const exportCsv = () => {
    downloadCsv(
      `supplier-evaluations-${todayIso()}.csv`,
      ['Supplier', 'Category', 'Evaluated on', 'Period', 'Score %', 'Decision', 'Criteria', 'Evaluated by', 'Remarks'],
      shown.map((e) => {
        const a = approvalById.get(e.approval_id)
        return [
          a ? clientName(a.client_id) : '',
          a ? SUPPLIER_CATEGORY_LABEL[a.category] : '',
          e.evaluated_on,
          e.period ?? '',
          e.total_score ?? '',
          e.decision ? SUPPLIER_STATUS_LABEL[e.decision] : '',
          e.criteria.map((c) => `${c.criterion} (w${c.weight}): ${c.score}`).join('; '),
          e.evaluated_by ?? '',
          e.remarks ?? '',
        ]
      }),
    )
  }

  const rowActions = (e: SupplierEvaluation, big = false) => (
    <span className="inline-flex gap-1">
      {canManage ? (
        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, big ? 'h-10 w-10' : 'h-7 w-7')} onClick={() => openEdit(e)} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      {isDirector ? (
        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, big ? 'h-10 w-10' : 'h-7 w-7')} onClick={() => void remove(e)} aria-label="Delete">
          <Trash2 className="h-4 w-4 text-red-700" />
        </Button>
      ) : null}
    </span>
  )

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Supplier Evaluation"
        clause="6.6.2"
        subtitle="Evaluate and re-evaluate external providers with the criteria for their category (score 1–5, weighted)."
        actions={
          <>
            {canManage && !missing ? (
              <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => openNew(approvalFilter)}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New evaluation</span>
              </Button>
            ) : null}
            {!missing ? (
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={exportCsv} disabled={shown.length === 0}>
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
              </Button>
            ) : null}
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />
      <SupplierNav current={SUPPLIER_EVALUATIONS_PATH} />
      {missing ? <SupplierMissingNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <>
          <EnvPanel title={`Due for evaluation (${dueList.length})`}>
            {dueList.length === 0 ? (
              <p className="p-2 text-[13px] text-stone-600">No evaluation is due in the next 30 days.</p>
            ) : (
              <ul className="space-y-1">
                {dueList.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-amber-50 px-2 py-1.5 text-[13px]">
                    <span>
                      <span className="font-semibold">{clientName(a.client_id)}</span>{' '}
                      <span className="text-[12px] text-stone-600">{SUPPLIER_CATEGORY_LABEL[a.category]}</span>
                      <span className="ml-2">
                        {a.last_evaluated_on ? <DueBadge date={a.next_evaluation_due} label="Evaluation" /> : <span className="text-[12px] text-amber-900">Never evaluated</span>}
                      </span>
                    </span>
                    {canManage ? (
                      <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-7')} onClick={() => openNew(a.id)}>
                        <ClipboardCheck className="h-3.5 w-3.5" /> Evaluate
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </EnvPanel>

          <EnvPanel
            title={`Evaluations (${shown.length})`}
            right={
              <EnvSelect value={approvalFilter} onChange={setApprovalFilter} ariaLabel="Filter by supplier" className="h-10 max-w-[320px] sm:h-7">
                <option value="">All suppliers</option>
                {sortedApprovals.map((a) => (
                  <option key={a.id} value={a.id}>
                    {approvalLabel(a.id)}
                  </option>
                ))}
              </EnvSelect>
            }
          >
            <div className="space-y-1.5 md:hidden">
              {shown.map((e) => (
                <div key={e.id} className="border border-stone-300 bg-white p-2 text-[13px]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">{approvalLabel(e.approval_id)}</p>
                    <SupplierStatusBadge value={e.decision} />
                  </div>
                  <p className="text-[12px] text-stone-600">
                    {formatDate(e.evaluated_on)}
                    {e.period ? ` · ${e.period}` : ''} · <strong>{e.total_score ?? '—'}%</strong> · {e.evaluated_by ?? '—'}
                  </p>
                  {e.remarks ? <p className="text-[12px]">{e.remarks}</p> : null}
                  <div className="mt-1 flex justify-end">{rowActions(e, true)}</div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={envThClass}>Date</th>
                    <th className={cn(envThClass, 'text-left')}>Supplier · category</th>
                    <th className={envThClass}>Period</th>
                    <th className={envThClass}>Score</th>
                    <th className={envThClass}>Decision</th>
                    <th className={envThClass}>Criteria</th>
                    <th className={envThClass}>By</th>
                    {canManage ? <th className={envThClass}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e, i) => (
                    <tr key={e.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>{formatDate(e.evaluated_on)}</td>
                      <td className={cn(envTdClass, 'font-semibold')}>
                        {approvalLabel(e.approval_id)}
                        {e.remarks ? <span className="block text-[11px] font-normal text-stone-600">{e.remarks}</span> : null}
                      </td>
                      <td className={cn(envTdClass, 'text-center')}>{e.period || '—'}</td>
                      <td className={cn(envTdClass, 'text-center font-semibold')}>{e.total_score ?? '—'}%</td>
                      <td className={cn(envTdClass, 'text-center')}>
                        <SupplierStatusBadge value={e.decision} />
                      </td>
                      <td className={cn(envTdClass, 'text-[11px]')}>
                        {e.criteria.map((c) => (
                          <span key={c.criterion} className="block">
                            {c.criterion}: <strong>{c.score}</strong>
                            <span className="text-stone-500"> ×{c.weight}</span>
                          </span>
                        ))}
                      </td>
                      <td className={envTdClass}>{e.evaluated_by ?? '—'}</td>
                      {canManage ? <td className={cn(envTdClass, 'whitespace-nowrap text-center')}>{rowActions(e)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && shown.length === 0 ? <p className="p-4 text-center text-[13px] text-stone-600">No evaluations recorded yet.</p> : null}
          </EnvPanel>
        </>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => (!open && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-3xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">{editing ? 'Edit evaluation' : 'New supplier evaluation'}</DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                Score each criterion 1 (poor) to 5 (excellent). Score % = Σ(weight × score) ÷ (5 × Σ weight).
              </DialogDescription>
            </DialogHeader>
          </div>
          {form ? (
            <div className="max-h-[78vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Supplier entry *" htmlFor="ef-app" className="sm:col-span-3">
                  <EnvSelect id="ef-app" value={form.approvalId} onChange={setApproval}>
                    <option value="">— Choose supplier · category —</option>
                    {sortedApprovals.map((a) => (
                      <option key={a.id} value={a.id}>
                        {approvalLabel(a.id)} ({SUPPLIER_STATUS_LABEL[a.status]})
                      </option>
                    ))}
                  </EnvSelect>
                </Field>
                <Field label="Evaluated on *" htmlFor="ef-on">
                  <Input id="ef-on" type="date" max={todayIso()} value={form.evaluatedOn} onChange={(e) => setForm({ ...form, evaluatedOn: e.target.value })} className={envInputClass} />
                </Field>
                <Field label="Period" htmlFor="ef-period">
                  <Input id="ef-period" value={form.period} placeholder="e.g. 2026-27" onChange={(e) => setForm({ ...form, period: e.target.value })} className={envInputClass} />
                </Field>
                <Field label="Evaluated by (blank = you)" htmlFor="ef-by">
                  <Input id="ef-by" value={form.evaluatedBy} onChange={(e) => setForm({ ...form, evaluatedBy: e.target.value })} className={envInputClass} />
                </Field>
              </div>

              <div className="border border-stone-400 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 bg-stone-100 px-2 py-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-700">Criteria</p>
                  <span className="flex flex-wrap gap-1">
                    {form.approvalId && canManage ? (
                      <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-7')} onClick={() => void saveAsTemplate()} title="Use this list for future evaluations of this category">
                        <BookmarkPlus className="h-3.5 w-3.5" /> Save as category template
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'h-10 sm:h-7')}
                      onClick={() => setForm({ ...form, criteria: [...form.criteria, { criterion: '', weight: 1, score: null }] })}
                    >
                      <Plus className="h-3.5 w-3.5" /> Criterion
                    </Button>
                  </span>
                </div>
                {form.criteria.length === 0 ? (
                  <p className="p-3 text-[13px] text-stone-600">Choose the supplier entry to load the criteria for its category, or add criteria.</p>
                ) : null}
                <div className="divide-y divide-stone-200">
                  {form.criteria.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 p-2 sm:grid-cols-[1fr_80px_150px_auto]">
                      <Field label={`Criterion ${i + 1}`} htmlFor={`ef-c-${i}`} className="col-span-2 sm:col-span-1">
                        <Input id={`ef-c-${i}`} value={c.criterion} onChange={(e) => setCriterion(i, { criterion: e.target.value })} className={envInputClass} />
                      </Field>
                      <Field label="Weight" htmlFor={`ef-w-${i}`}>
                        <Input id={`ef-w-${i}`} type="number" min={0.5} step={0.5} value={String(c.weight)} onChange={(e) => setCriterion(i, { weight: Number(e.target.value) })} className={envInputClass} />
                      </Field>
                      <Field label="Score *" htmlFor={`ef-s-${i}`}>
                        <EnvSelect id={`ef-s-${i}`} value={c.score === null ? '' : String(c.score)} onChange={(v) => setCriterion(i, { score: v ? Number(v) : null })}>
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {SCORE_LABEL[n]}
                            </option>
                          ))}
                        </EnvSelect>
                      </Field>
                      <Button
                        size="icon"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-10 w-10 sm:h-8 sm:w-8')}
                        onClick={() => setForm({ ...form, criteria: form.criteria.filter((_, j) => j !== i) })}
                        aria-label={`Remove criterion ${i + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="border border-stone-400 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Score</p>
                  <p className="text-2xl font-bold">{score === null ? '—' : `${score}%`}</p>
                  {suggestion ? (
                    <p className="text-[12px]">
                      Suggested: <SupplierStatusBadge value={suggestion} />
                    </p>
                  ) : null}
                </div>
                <Field label="Decision" htmlFor="ef-dec" className="sm:col-span-2">
                  <EnvSelect id="ef-dec" value={form.decision} onChange={(v) => setForm({ ...form, decision: v as '' | SupplierStatus })}>
                    <option value="">Automatic{suggestion ? ` (${SUPPLIER_STATUS_LABEL[suggestion]})` : ''}</option>
                    {SUPPLIER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {SUPPLIER_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </EnvSelect>
                  <p className="text-[11px] text-stone-600">
                    Thresholds for this category: approved ≥ {templateFor(form.approvalId)?.pass_score ?? 70}%, conditional ≥{' '}
                    {templateFor(form.approvalId)?.conditional_score ?? 50}%. The latest evaluation sets the supplier&apos;s status.
                  </p>
                </Field>
              </div>
              <Field label="Remarks / actions agreed with the supplier" htmlFor="ef-rem">
                <Textarea id="ef-rem" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="rounded-none border-stone-500 bg-white text-base sm:text-sm" />
              </Field>
              <MessageLine tone="error" text={formError} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className={limsOutlineBtnClass} onClick={() => setFormOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save evaluation
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
