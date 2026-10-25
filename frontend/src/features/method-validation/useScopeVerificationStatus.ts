import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { isMvMissingError, mvErrorText, type ScopeCoverage, type ScopeVerificationRow } from './methodValidation'

export type ScopeVerificationState = {
  rows: ScopeVerificationRow[]
  /** scope_id -> coverage row (testing and calibration ids never collide: uuids). */
  byScopeId: Map<string, ScopeVerificationRow>
  loading: boolean
  /** Migration 20261027100100 not applied: callers show nothing. */
  missing: boolean
  error: string | null
  reload: () => Promise<void>
}

export async function fetchScopeVerificationStatus(): Promise<
  { rows: ScopeVerificationRow[]; missing: false } | { rows: []; missing: true }
> {
  const { data, error } = await supabase.rpc('method_verification_status_for_scope')
  if (error) {
    if (isMvMissingError(error)) return { rows: [], missing: true }
    throw error
  }
  return { rows: (Array.isArray(data) ? data : []) as ScopeVerificationRow[], missing: false }
}

/**
 * Coverage of the NABL scope by approved method verifications / validations
 * (ISO/IEC 17025 7.2.1.5 / 7.2.2). `reloadKey` re-fetches (e.g. after a save).
 */
export function useScopeVerificationStatus(reloadKey: unknown = 0): ScopeVerificationState {
  const [rows, setRows] = useState<ScopeVerificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchScopeVerificationStatus()
      setRows(res.rows)
      setMissing(res.missing)
      setError(null)
    } catch (err) {
      setError(mvErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchScopeVerificationStatus()
        if (cancelled) return
        setRows(res.rows)
        setMissing(res.missing)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(mvErrorText(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const byScopeId = new Map(rows.map((r) => [r.scope_id, r]))
  return { rows, byScopeId, loading, missing, error, reload }
}

export type ScopeCheckResult = {
  covered: boolean
  coverage: ScopeCoverage
  record_no: string | null
  message: string | null
}

/**
 * Check one (possibly unsaved) scope row before saving it as accredited.
 * Returns null when the RPC is not available (migration not applied).
 */
export async function checkScopeMethod(
  scopeKind: 'testing' | 'calibration',
  method: string,
  parameter: string | null,
  linkedId: string | null = null,
): Promise<ScopeCheckResult | null> {
  const { data, error } = await supabase.rpc('method_verification_check', {
    p_scope_kind: scopeKind,
    p_method: method,
    p_parameter: parameter,
    p_linked_id: linkedId,
  })
  if (error) {
    if (isMvMissingError(error)) return null
    throw error
  }
  const row = (Array.isArray(data) ? data[0] : data) as ScopeCheckResult | undefined
  return row ?? null
}
