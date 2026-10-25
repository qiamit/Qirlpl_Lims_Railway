import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/**
 * Soft delete / Recycle Bin (ISO/IEC 17025 7.5.2, 8.4; migration 20261025100000).
 *
 * Existing `.delete()` calls need no change: for a signed-in user the database
 * keeps the row (deleted_at / deleted_by) and hides it from every normal read.
 * The helpers below are optional extras.
 */

export type DeletedTableCount = {
  table_name: string
  label: string
  /** 'soft' = deleted directly; 'line' = only hidden together with a parent. */
  mode: 'soft' | 'line'
  deleted_count: number
  /** Rows deleted on their own (not together with a deleted parent). */
  direct_count: number
}

export type DeletedRow = {
  table_name: string
  row_id: string
  deleted_at: string
  deleted_by: string | null
  deleted_by_name: string | null
  delete_reason: string | null
  summary: Record<string, unknown>
  /** Label of the deleted parent this row belongs to (restore the parent instead). */
  deleted_with: string | null
  total_count: number
}

/** True when the soft-delete RPCs are missing (migration not applied yet). */
export function isSoftDeleteMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'PGRST202' || e.code === '42883') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /app_(deleted_counts|list_deleted|restore_deleted|set_delete_reason|deleted_keys)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

/** Director / Quality Manager: per-table counts of deleted rows. */
export async function fetchDeletedCounts(): Promise<DeletedTableCount[]> {
  const { data, error } = await supabase.rpc('app_deleted_counts')
  if (error) throw error
  return ((data ?? []) as DeletedTableCount[]).map((r) => ({
    ...r,
    deleted_count: Number(r.deleted_count) || 0,
    direct_count: Number(r.direct_count) || 0,
  }))
}

/** Director / Quality Manager: one page of deleted rows of a table, newest first. */
export async function fetchDeletedRows(
  table: string,
  limit: number,
  offset: number,
): Promise<{ rows: DeletedRow[]; total: number }> {
  const { data, error } = await supabase.rpc('app_list_deleted', {
    p_table: table,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  const rows = ((data ?? []) as DeletedRow[]).map((r) => ({
    ...r,
    summary: r.summary && typeof r.summary === 'object' ? r.summary : {},
    total_count: Number(r.total_count) || 0,
  }))
  return { rows, total: rows[0]?.total_count ?? 0 }
}

/**
 * Laboratory Director only: bring a deleted record back (with the child rows
 * that were deleted together with it). Returns the number of rows restored.
 */
export async function restoreDeletedRow(table: string, rowId: string, reason?: string): Promise<number> {
  const { data, error } = await supabase.rpc('app_restore_deleted', {
    p_table: table,
    p_row_id: rowId,
    p_reason: reason?.trim() || null,
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/**
 * Record why a record was deleted. Call right AFTER the `.delete()` succeeded.
 * Only the person who deleted it, within 10 minutes, once. The reason is stored
 * on the row (shown in the Recycle Bin) and on the delete's audit-trail entry.
 * Never throws; resolves true when the reason was stored. (Calling
 * annotateAuditReason / recordReason from '@/lib/auditReason' after a delete
 * also works: the Recycle Bin falls back to the audit-trail reason.)
 */
export async function setDeleteReason(
  table: string,
  rowId: string | ReadonlyArray<string>,
  reason: string,
): Promise<boolean> {
  const ids = [...new Set((typeof rowId === 'string' ? [rowId] : [...rowId]).map((v) => v.trim()).filter(Boolean))]
  const text = reason.trim()
  if (!table || ids.length === 0 || !text) return false
  let all = true
  for (const id of ids) {
    const { data, error } = await supabase.rpc('app_set_delete_reason', {
      p_table: table,
      p_row_id: id,
      p_reason: text,
    })
    if (error) {
      if (!isSoftDeleteMissingError(error)) {
        console.warn('[softDelete] Could not record delete reason', { table, rowId: id, error })
      }
      return false
    }
    if (data !== true) all = false
  }
  return all
}

/**
 * Values of a unique key column (e.g. complaint_id, srf_number) held by deleted
 * records. Numbers of deleted records are not reused, so "next number"
 * generators that look only at visible rows should also skip these:
 *   nextComplaintId(rows, await fetchDeletedKeys('customer_complaints', 'complaint_id'))
 * Never throws: returns [] when the migration is not applied yet or the call
 * fails (the database still refuses a duplicate number on save).
 */
export async function fetchDeletedKeys(table: string, column: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('app_deleted_keys', { p_table: table, p_column: column })
    if (error) {
      if (!isSoftDeleteMissingError(error)) {
        console.warn('[softDelete] Could not read deleted keys', { table, column, error })
      }
      return []
    }
    return Array.isArray(data) ? (data as unknown[]).map((v) => String(v ?? '')).filter(Boolean) : []
  } catch (err) {
    console.warn('[softDelete] Could not read deleted keys', { table, column, err })
    return []
  }
}

/**
 * fetchDeletedKeys as React state for "next number" generators that run while
 * rendering. Re-read whenever `refreshKey` changes (pass the loaded rows so a
 * delete followed by a reload is picked up).
 */
export function useDeletedKeys(table: string, column: string, refreshKey?: unknown): string[] {
  const [keys, setKeys] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    void fetchDeletedKeys(table, column).then((k) => {
      if (!cancelled) setKeys(k)
    })
    return () => {
      cancelled = true
    }
  }, [table, column, refreshKey])
  return keys
}
