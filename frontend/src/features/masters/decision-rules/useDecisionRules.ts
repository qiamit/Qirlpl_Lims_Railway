import { useEffect, useState } from 'react'
import { fetchDecisionRules, type DecisionRule } from './decisionRules'

/** Loads the decision rules once per mount. Empty (available = false) before the migration. */
export function useDecisionRules(): { rules: DecisionRule[]; loading: boolean; available: boolean } {
  const [rules, setRules] = useState<DecisionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  useEffect(() => {
    let cancelled = false
    void fetchDecisionRules()
      .then((res) => {
        if (cancelled) return
        setRules(res.rules)
        setAvailable(res.available)
      })
      .catch(() => {
        if (!cancelled) setRules([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { rules, loading, available }
}
