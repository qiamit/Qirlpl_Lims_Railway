import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  DECISION_RULE_TYPE_LABELS,
  ruleHasNoGuardBand,
  decisionRuleLabel,
  decisionRulesFor,
  type DecisionRule,
} from './decisionRules'
import { useDecisionRules } from './useDecisionRules'

const NONE = '__none__'

/**
 * Decision rule picked at contract review (ISO 17025 7.1.3). Shows active rules
 * for the scope plus the currently saved one even if it was set inactive.
 */
export function DecisionRuleSelect({
  id,
  value,
  onChange,
  scope,
  className,
  triggerClassName,
  disabled,
}: {
  id?: string
  value: string
  onChange: (ruleId: string, rule: DecisionRule | null) => void
  scope: 'testing' | 'calibration'
  className?: string
  triggerClassName?: string
  disabled?: boolean
}) {
  const { rules, loading, available } = useDecisionRules()
  const options = useMemo(() => decisionRulesFor(rules, scope, value), [rules, scope, value])
  const selected = options.find((r) => r.id === value) ?? null

  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <Select
        value={value && selected ? value : NONE}
        onValueChange={(v) => {
          const rule = v === NONE ? null : (options.find((r) => r.id === v) ?? null)
          onChange(rule?.id ?? '', rule)
        }}
        disabled={disabled || loading || !available}
      >
        <SelectTrigger id={id} className={cn('w-full', triggerClassName)} aria-label="Decision rule">
          <SelectValue placeholder={loading ? 'Loading…' : 'Select decision rule'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not selected</SelectItem>
          {options.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {decisionRuleLabel(r)}
              {r.active ? '' : ' (inactive)'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!loading && !available ? (
        <p className="text-[11px] text-stone-500">Decision rules: database update pending.</p>
      ) : selected ? (
        <p className="text-[11px] leading-snug text-stone-500" title={selected.statementText}>
          {DECISION_RULE_TYPE_LABELS[selected.ruleType]}
          {ruleHasNoGuardBand(selected.ruleType) ? '' : `, w = ${selected.guardBandFactor} × U`}
        </p>
      ) : null}
    </div>
  )
}
