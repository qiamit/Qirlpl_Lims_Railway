import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Pencil, Plus, RefreshCw, Scale, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDateTime } from '@/lib/utils'
import {
  DECISION_RULE_APPLIES_TO_LABELS,
  DECISION_RULE_TYPE_LABELS,
  DECISION_RULE_TYPES,
  MIGRATION_PENDING_MESSAGE,
  deleteDecisionRule,
  fetchDecisionRules,
  saveDecisionRule,
  type DecisionRule,
  type DecisionRuleAppliesTo,
  type DecisionRuleInput,
  type DecisionRuleType,
} from './decisionRules'

/** Starting wording per rule type (ILAC-G8:09/2019); editable before saving. */
const TEMPLATE_STATEMENTS: Record<DecisionRuleType, (w: number) => string> = {
  simple_acceptance: () =>
    'Decision rule: simple acceptance (ILAC-G8:09/2019, 4.2.1). A result is stated as conforming when the measured value is within the specified limit; the measurement uncertainty is not taken into account.',
  guard_band: (w) =>
    `Decision rule: guarded acceptance with guard band w = ${w === 1 ? '' : `${w} × `}U (ILAC-G8:09/2019, 4.2.2), where U is the expanded measurement uncertainty (k = 2, approx. 95 % coverage). A result is stated as conforming only when the measured value is inside the specified limit by at least w; otherwise it is stated as not conforming.`,
  non_binary: (w) =>
    `Decision rule: non-binary statement of conformity with guard band w = ${w === 1 ? '' : `${w} × `}U (ILAC-G8:09/2019, 4.2.3), where U is the expanded measurement uncertainty (k = 2). Pass: measured value inside the limit by at least w. Conditional Pass: inside the limit by less than w. Conditional Fail: outside the limit by less than w. Fail: outside the limit by at least w.`,
}

const APPLIES_TO: DecisionRuleAppliesTo[] = ['both', 'testing', 'calibration']

const EMPTY_INPUT: DecisionRuleInput = {
  code: '',
  name: '',
  ruleType: 'guard_band',
  guardBandFactor: 1,
  statementText: '',
  riskNote: '',
  active: true,
  appliesTo: 'both',
}

function ruleToInput(r: DecisionRule): DecisionRuleInput {
  return {
    code: r.code,
    name: r.name,
    ruleType: r.ruleType,
    guardBandFactor: r.guardBandFactor,
    statementText: r.statementText,
    riskNote: r.riskNote,
    active: r.active,
    appliesTo: r.appliesTo,
  }
}

function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message?: string }).message)
  return 'Something went wrong.'
}

function guardBandText(r: Pick<DecisionRule, 'ruleType' | 'guardBandFactor'>): string {
  if (r.ruleType === 'simple_acceptance') return 'w = 0'
  return `w = ${r.guardBandFactor} × U`
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        active
          ? 'border-emerald-600/50 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-stone-400 bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function RuleDialog({
  open,
  onOpenChange,
  editing,
  readOnly,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: DecisionRule | null
  readOnly: boolean
  onSaved: () => void
}) {
  const [input, setInput] = useState<DecisionRuleInput>(EMPTY_INPUT)
  const [factorText, setFactorText] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const next = editing ? ruleToInput(editing) : { ...EMPTY_INPUT, statementText: TEMPLATE_STATEMENTS.guard_band(1) }
    setInput(next)
    setFactorText(String(next.guardBandFactor))
    setError(null)
  }, [open, editing])

  const set = <K extends keyof DecisionRuleInput>(key: K, value: DecisionRuleInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  const factor = input.ruleType === 'simple_acceptance' ? 0 : Number.parseFloat(factorText)

  const handleSave = async () => {
    setError(null)
    if (!input.code.trim() || !input.name.trim()) {
      setError('Code and name are required.')
      return
    }
    if (!input.statementText.trim()) {
      setError('Statement text is required: it is printed on reports and certificates.')
      return
    }
    if (!Number.isFinite(factor) || factor < 0 || factor > 10) {
      setError('Guard band factor must be a number from 0 to 10.')
      return
    }
    setSaving(true)
    try {
      await saveDecisionRule(editing?.id ?? null, { ...input, guardBandFactor: factor })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      const msg = errorText(err)
      setError(/decision_rules_code_key|duplicate/i.test(msg) ? 'A rule with this code already exists.' : msg)
    } finally {
      setSaving(false)
    }
  }

  const title = readOnly ? 'Decision Rule' : editing ? 'Edit Decision Rule' : 'Add Decision Rule'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'flex w-[min(96vw,44rem)] max-w-3xl flex-col')}
      >
        <DialogHeader className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-left text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogTitle className="relative text-base font-semibold text-white">{title}</DialogTitle>
        </DialogHeader>
        <div className={cn(limsRegistryFormClass, 'min-h-0 flex-1 space-y-3 overflow-y-auto p-4')}>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 space-y-1 sm:col-span-4">
              <Label htmlFor="dr-code">Code</Label>
              <Input
                id="dr-code"
                value={input.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder="DR-GB"
                disabled={readOnly}
              />
            </div>
            <div className="col-span-12 space-y-1 sm:col-span-8">
              <Label htmlFor="dr-name">Name</Label>
              <Input
                id="dr-name"
                value={input.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Guard band w = U"
                disabled={readOnly}
              />
            </div>
            <div className="col-span-12 space-y-1 sm:col-span-6">
              <Label htmlFor="dr-type">Rule type</Label>
              <Select
                value={input.ruleType}
                onValueChange={(v) => {
                  const ruleType = v as DecisionRuleType
                  setInput((prev) => ({ ...prev, ruleType }))
                  if (ruleType === 'simple_acceptance') setFactorText('0')
                  else if (!(Number.parseFloat(factorText) > 0)) setFactorText('1')
                }}
                disabled={readOnly}
              >
                <SelectTrigger id="dr-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECISION_RULE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DECISION_RULE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-6 space-y-1 sm:col-span-3">
              <Label htmlFor="dr-factor">Guard band factor</Label>
              <Input
                id="dr-factor"
                inputMode="decimal"
                value={input.ruleType === 'simple_acceptance' ? '0' : factorText}
                onChange={(e) => setFactorText(e.target.value)}
                disabled={readOnly || input.ruleType === 'simple_acceptance'}
              />
            </div>
            <div className="col-span-6 space-y-1 sm:col-span-3">
              <Label htmlFor="dr-active">Status</Label>
              <Select
                value={input.active ? 'active' : 'inactive'}
                onValueChange={(v) => set('active', v === 'active')}
                disabled={readOnly}
              >
                <SelectTrigger id="dr-active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 space-y-1 sm:col-span-6">
              <Label htmlFor="dr-applies">Applies to</Label>
              <Select
                value={input.appliesTo}
                onValueChange={(v) => set('appliesTo', v as DecisionRuleAppliesTo)}
                disabled={readOnly}
              >
                <SelectTrigger id="dr-applies">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLIES_TO.map((a) => (
                    <SelectItem key={a} value={a}>
                      {DECISION_RULE_APPLIES_TO_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 flex items-end sm:col-span-6">
              <p className="text-[11px] leading-snug text-stone-500">
                {input.ruleType === 'simple_acceptance'
                  ? 'Measurement uncertainty is not used: same answers as before decision rules.'
                  : input.ruleType === 'guard_band'
                    ? `Conforming only when the result is inside the limit by at least w = ${Number.isFinite(factor) ? factor : '?'} × U.`
                    : `Zones of width ${Number.isFinite(factor) ? factor : '?'} × U on each side of the limit give Conditional Pass / Conditional Fail.`}
              </p>
            </div>
            <div className="col-span-12 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="dr-statement">Statement printed on reports and certificates</Label>
                {!readOnly ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 hover:underline"
                    onClick={() =>
                      set('statementText', TEMPLATE_STATEMENTS[input.ruleType](Number.isFinite(factor) ? factor : 1))
                    }
                  >
                    Use ILAC-G8 wording
                  </button>
                ) : null}
              </div>
              <Textarea
                id="dr-statement"
                rows={5}
                value={input.statementText}
                onChange={(e) => set('statementText', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="col-span-12 space-y-1">
              <Label htmlFor="dr-risk">Risk note (false accept / false reject)</Label>
              <Textarea
                id="dr-risk"
                rows={3}
                value={input.riskNote}
                onChange={(e) => set('riskNote', e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
          {editing?.updatedAt ? (
            <p className="text-[11px] text-stone-500">Last changed {formatDateTime(editing.updatedAt)}</p>
          ) : null}
          {error ? (
            <p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 dark:bg-stone-900">
          <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => onOpenChange(false)}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly ? (
            <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function DecisionRulesPage() {
  const { designation, departmentName } = useAuth()
  const canEdit =
    isLaboratoryDirector(designation) ||
    (designation.trim().toLowerCase() === 'quality manager' &&
      departmentName.trim().toLowerCase() === 'quality assurance')

  const [rules, setRules] = useState<DecisionRule[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DecisionRule | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDecisionRules()
      setRules(res.rules)
      setAvailable(res.available)
    } catch (err) {
      setError(errorText(err))
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rules
    return rules.filter((r) =>
      [r.code, r.name, DECISION_RULE_TYPE_LABELS[r.ruleType], r.statementText, DECISION_RULE_APPLIES_TO_LABELS[r.appliesTo]]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rules, search])

  const openNew = () => {
    setEditing(null)
    setMessage(null)
    setDialogOpen(true)
  }
  const openRule = (r: DecisionRule) => {
    setEditing(r)
    setMessage(null)
    setDialogOpen(true)
  }
  const handleDelete = async (r: DecisionRule) => {
    if (!window.confirm(`Delete decision rule ${r.code}? A rule used on an SRF cannot be deleted; set it Inactive instead.`)) return
    setMessage(null)
    try {
      await deleteDecisionRule(r.id)
      setMessage(`Deleted ${r.code}.`)
      await load()
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const actions = (r: DecisionRule) => (
    <div className="flex items-center justify-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-none border-stone-400"
        title={canEdit ? 'Edit' : 'View'}
        aria-label={canEdit ? `Edit ${r.code}` : `View ${r.code}`}
        onClick={() => openRule(r)}
      >
        {canEdit ? <Pencil size={14} /> : <Eye size={14} />}
      </Button>
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-none border-red-400 text-red-700 hover:bg-red-50"
          title="Delete"
          aria-label={`Delete ${r.code}`}
          onClick={() => void handleDelete(r)}
        >
          <Trash2 size={14} />
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className={limsPageShellClass}>
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-4 text-white shadow-sm ring-1 ring-amber-700/20 sm:px-5 md:flex-row md:items-center md:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="relative flex flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <h1 className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold tracking-tight text-white">
            <Scale size={18} className="text-amber-300" />
            Decision Rules
          </h1>
          <div className="w-full md:max-w-md">
            <Input
              placeholder="Search decision rules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={limsDarkBarSearchClass}
            />
          </div>
        </div>
        <div className="relative flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" className={cn('gap-1.5', limsDarkBarBtnClass)} onClick={() => void load()}>
            <RefreshCw size={14} />
            Refresh
          </Button>
          {canEdit ? (
            <Button type="button" className={cn('gap-2', limsPrimaryBtnClass)} onClick={openNew} disabled={!available}>
              <Plus size={16} />
              Add Rule
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn(limsPanelClass, 'space-y-1 p-3 text-[12px] leading-relaxed text-stone-700 dark:text-stone-300')}>
        <p>
          ISO/IEC 17025 7.1.3 and 7.8.6: when the customer asks for a statement of conformity, the decision rule is agreed
          at contract review (SRF) and its statement is printed on the test report or calibration certificate.
          U is the expanded measurement uncertainty of the result (test parameter MU); w = factor × U.
        </p>
        {!canEdit ? (
          <p className="text-stone-500">Only the Laboratory Director or the Quality Manager can change decision rules.</p>
        ) : null}
      </div>

      {!available ? (
        <div className={cn(limsPanelClass, 'p-3 text-sm text-amber-900 dark:text-amber-200')}>{MIGRATION_PENDING_MESSAGE}</div>
      ) : null}
      {error ? <div className={cn(limsPanelClass, 'p-3 text-sm text-red-700')}>{error}</div> : null}
      {message ? <div className={cn(limsPanelClass, 'p-3 text-sm')}>{message}</div> : null}

      {/* Phone: cards */}
      <div className="space-y-2 md:hidden">
        {loading ? <div className={cn(limsPanelClass, 'p-3 text-sm text-stone-500')}>Loading…</div> : null}
        {!loading && filtered.length === 0 ? (
          <div className={cn(limsPanelClass, 'p-3 text-sm text-stone-500')}>No decision rules.</div>
        ) : null}
        {filtered.map((r) => (
          <div key={r.id} className={cn(limsPanelClass, 'space-y-2 p-3')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">{r.code}</p>
                <p className="text-sm font-semibold">{r.name}</p>
              </div>
              <StatusBadge active={r.active} />
            </div>
            <p className="text-[12px] text-stone-600 dark:text-stone-300">
              {DECISION_RULE_TYPE_LABELS[r.ruleType]} · {guardBandText(r)} · {DECISION_RULE_APPLIES_TO_LABELS[r.appliesTo]}
            </p>
            <p className="line-clamp-3 text-[12px] text-stone-500">{r.statementText}</p>
            <div className="flex justify-end">{actions(r)}</div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className={cn(limsPanelClass, 'hidden overflow-x-auto md:block')}>
        <table className={cn(limsTableClass, 'text-sm')}>
          <thead className={limsTableHeadClass}>
            <tr>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Guard band</th>
              <th className="px-2 py-2">Applies to</th>
              <th className="px-2 py-2">Statement</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="bg-lims-paper text-foreground">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-stone-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-stone-500">
                  No decision rules.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-2 py-2 font-semibold">{r.code}</td>
                  <td className="px-2 py-2">{r.name}</td>
                  <td className="whitespace-nowrap px-2 py-2">{DECISION_RULE_TYPE_LABELS[r.ruleType]}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-center">{guardBandText(r)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-center">{DECISION_RULE_APPLIES_TO_LABELS[r.appliesTo]}</td>
                  <td className="max-w-[28rem] px-2 py-2 text-[12px] text-stone-600 dark:text-stone-300">
                    <span className="line-clamp-3" title={r.statementText}>
                      {r.statementText}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <StatusBadge active={r.active} />
                  </td>
                  <td className="px-2 py-2">{actions(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <RuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        readOnly={!canEdit}
        onSaved={() => {
          setMessage('Saved.')
          void load()
        }}
      />
    </div>
  )
}
