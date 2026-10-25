import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/**
 * Client ids that hold at least one supplier approval with status approved or
 * conditional (ISO/IEC 17025 6.6). Empty when the supplier migration is not
 * applied yet or the read fails; never throws.
 */
export function useApprovedSupplierIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase.from('supplier_approvals').select('client_id').eq('approved', true).limit(5000)
        if (cancelled || error) return
        setIds(new Set((data ?? []).map((r) => String((r as { client_id: string }).client_id))))
      } catch {
        // Supplier tables missing or offline: no badges.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return ids
}
