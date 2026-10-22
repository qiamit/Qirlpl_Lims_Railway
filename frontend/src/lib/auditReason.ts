import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'

/**
 * Attach a "reason for change" to the caller's latest change of a record
 * (ISO/IEC 17025 clause 7.5.2). Works only for the person who made the change,
 * within 10 minutes of it, once. Returns the number of audit rows annotated
 * (0 = nothing matched). Throws on RPC errors.
 */
export async function annotateAuditReason(table: string, rowId: string, reason: string): Promise<number> {
  const { data, error } = await supabase.rpc('app_annotate_audit', {
    p_table: table,
    p_row_id: rowId,
    p_reason: reason,
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** True when the RPC is missing (audit trail migration not applied yet). */
function isMissingRpcError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'PGRST202' || e.code === '42883') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    msg.includes('app_annotate_audit') &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

/**
 * Record why an already-saved record was changed. Call it right AFTER the save
 * succeeded; pass one row id or several (same reason for each). Never throws:
 * a failure only shows one non-blocking toast, and a missing RPC (migration
 * not applied yet) is ignored with a console warning. Resolves true when every
 * row was annotated.
 */
export async function recordReason(
  table: string,
  rowId: string | number | ReadonlyArray<string | number>,
  reason: string,
): Promise<boolean> {
  const ids = (Array.isArray(rowId) ? rowId : [rowId])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
  const text = reason.trim()
  if (!table || ids.length === 0 || !text) return false

  let unmatched = 0
  let failure: unknown = null
  for (const id of [...new Set(ids)]) {
    try {
      const n = await annotateAuditReason(table, id, text)
      if (n === 0) unmatched += 1
    } catch (err) {
      if (isMissingRpcError(err)) {
        console.warn('[auditReason] app_annotate_audit is not available yet; reason not recorded.', {
          table,
          rowIds: ids,
        })
        return false
      }
      console.warn('[auditReason] Could not record reason for change', { table, rowId: id, err })
      failure ??= err
    }
  }

  if (failure) {
    const msg = failure instanceof Error ? failure.message : (failure as { message?: string })?.message
    toast.warning('Saved, but the reason for change could not be recorded in the audit trail.', {
      description: msg || undefined,
    })
    return false
  }
  if (unmatched > 0) {
    toast.warning('Saved, but the reason could not be attached to the audit trail.', {
      description: 'No recent change by you was found for this record.',
    })
    return false
  }
  return true
}
