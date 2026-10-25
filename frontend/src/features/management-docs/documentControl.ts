/**
 * Document control (ISO/IEC 17025 8.3): e-approval workflow, periodic review,
 * distribution and read acknowledgements.
 * Database: migration 20261028100000_document_control_and_retention.sql.
 * Before that migration is applied every helper here degrades gracefully:
 * probeDocumentControl() returns false and the pages keep their old behaviour.
 */
import { csvCell } from '@/lib/csv'
import { supabase } from '@/lib/supabaseClient'
import type { ManagementDocStatus, ManagementDocumentRow } from './types'

/** Columns added by the migration (all optional on the row type). */
export const DOC_CONTROL_COLUMNS = [
  'prepared_by_id',
  'prepared_at',
  'reviewed_by_id',
  'reviewed_at',
  'review_comment',
  'approved_by_id',
  'approved_at',
  'approval_comment',
  'review_period_months',
  'next_review_due',
  'last_periodic_review_at',
  'last_periodic_review_by',
  'last_periodic_review_note',
  'distribution_user_ids',
  'distribute_to_all',
  'obsoleted_at',
  'obsoleted_by',
] as const

export type DocControlFields = {
  prepared_by_id?: string | null
  prepared_at?: string | null
  reviewed_by_id?: string | null
  reviewed_at?: string | null
  review_comment?: string | null
  approved_by_id?: string | null
  approved_at?: string | null
  approval_comment?: string | null
  review_period_months?: number | null
  next_review_due?: string | null
  last_periodic_review_at?: string | null
  last_periodic_review_by?: string | null
  last_periodic_review_note?: string | null
  distribution_user_ids?: string[] | null
  distribute_to_all?: boolean | null
  obsoleted_at?: string | null
  obsoleted_by?: string | null
}

type PgError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined

/** Column / table / function of the migration not on this database yet. */
export function isDocControlMissingError(err: PgError): boolean {
  if (!err) return false
  if (['PGRST204', '42703', 'PGRST202', '42883', 'PGRST205', '42P01'].includes(err.code ?? '')) return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    /(app_mgmt_doc_|management_document_acknowledgements|review_period_months|next_review_due|distribution_user_ids|prepared_by_id|reviewed_by_id|approved_by_id)/.test(
      msg,
    ) && (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function docControlErrorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

let probeCache: Promise<boolean> | null = null

/** True when the document-control migration is on this database (cached per page load). */
export function probeDocumentControl(force = false): Promise<boolean> {
  if (!probeCache || force) {
    probeCache = (async () => {
      const { error } = await supabase
        .from('management_documents')
        .select('id, next_review_due, distribution_user_ids')
        .limit(1)
      if (!error) return true
      if (isDocControlMissingError(error)) return false
      // Unknown error (network, permissions): do not switch the new features on.
      return false
    })().catch(() => false)
  }
  return probeCache
}

/**
 * Insert / update that retries without the migration's columns when the
 * database does not have them yet (PGRST204 / 42703).
 */
export async function writeManagementDocument(
  payload: Record<string, unknown>,
  editingId: string | null,
): Promise<{ error: PgError }> {
  const run = async (body: Record<string, unknown>) =>
    editingId
      ? await supabase.from('management_documents').update(body).eq('id', editingId)
      : await supabase.from('management_documents').insert(body)
  const first = await run(payload)
  if (!first.error || !isDocControlMissingError(first.error)) return { error: first.error }
  const stripped = { ...payload }
  for (const k of DOC_CONTROL_COLUMNS) delete stripped[k]
  if (Object.keys(stripped).length === Object.keys(payload).length) return { error: first.error }
  const second = await run(stripped)
  return { error: second.error }
}

// ---------------------------------------------------------------------------
// Workflow RPCs
// ---------------------------------------------------------------------------

async function rpcRow(fn: string, args: Record<string, unknown>): Promise<ManagementDocumentRow> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as ManagementDocumentRow | null
  if (!row) throw new Error('The database did not return the document.')
  return row
}

export function submitForReview(id: string) {
  return rpcRow('app_mgmt_doc_submit', { p_id: id })
}

export function reviewDocument(id: string, accept: boolean, comment: string) {
  return rpcRow('app_mgmt_doc_review', { p_id: id, p_accept: accept, p_comment: comment || null })
}

export function approveDocument(id: string, accept: boolean, comment: string, effectiveDate: string | null) {
  return rpcRow('app_mgmt_doc_approve', {
    p_id: id,
    p_accept: accept,
    p_comment: comment || null,
    p_effective_date: effectiveDate || null,
  })
}

export function startDocumentChange(id: string, changeType: 'revision' | 'issue' | 'amendment') {
  return rpcRow('app_mgmt_doc_start_change', { p_id: id, p_change_type: changeType })
}

export function recordPeriodicReview(id: string, note: string, nextDue: string | null) {
  return rpcRow('app_mgmt_doc_periodic_review', { p_id: id, p_note: note, p_next_due: nextDue || null })
}

export type DocumentAcknowledgement = {
  id: string
  document_id: string
  version: string
  user_id: string
  user_name: string | null
  acknowledged_at: string
}

export async function acknowledgeDocument(id: string): Promise<DocumentAcknowledgement> {
  const { data, error } = await supabase.rpc('app_mgmt_doc_acknowledge', { p_id: id })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as DocumentAcknowledgement
}

export type ReadingListRow = {
  document_id: string
  level: number
  doc_number: string
  title: string
  doc_type: string
  version: string
  issue_date: string | null
  approved_at: string | null
  approved_by: string | null
  file_path: string | null
  distribute_to_all: boolean
  acknowledged_at: string | null
}

export async function fetchReadingList(): Promise<ReadingListRow[]> {
  const { data, error } = await supabase.rpc('app_mgmt_doc_reading_list')
  if (error) throw error
  return (Array.isArray(data) ? data : []) as ReadingListRow[]
}

export async function fetchAcknowledgements(documentId: string, version: string): Promise<DocumentAcknowledgement[]> {
  const { data, error } = await supabase
    .from('management_document_acknowledgements')
    .select('id, document_id, version, user_id, user_name, acknowledged_at')
    .eq('document_id', documentId)
    .eq('version', version)
    .order('acknowledged_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as DocumentAcknowledgement[]
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Same text as public.app_mgmt_doc_version_label(). */
export function versionLabel(row: Pick<ManagementDocumentRow, 'revision_no' | 'issue_no' | 'amendment_no'>): string {
  const n = (v: string | null | undefined) => (v ?? '').trim() || '00'
  return `Rev ${n(row.revision_no)} / Issue ${n(row.issue_no)} / Amd ${n(row.amendment_no)}`
}

/** Laboratory Director or Quality Manager (the database checks again). */
export function isDocumentApprover(designation: string, departmentName: string): boolean {
  const d = designation.trim().toLowerCase()
  const dept = departmentName.trim().toLowerCase()
  return d === 'laboratory director' || (d === 'quality manager' && dept === 'quality assurance')
}

/** Approved documents are read-only once document control is on. */
export function isLockedStatus(status: ManagementDocStatus): boolean {
  return status === 'active' || status === 'obsolete'
}

export type ReviewDueState = 'none' | 'ok' | 'soon' | 'overdue'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Periodic review state of an active document (soon = within 30 days). */
export function reviewDueState(row: Pick<ManagementDocumentRow, 'status'> & DocControlFields): ReviewDueState {
  if (row.status !== 'active' || !row.next_review_due) return 'none'
  const due = row.next_review_due.slice(0, 10)
  const today = todayIso()
  if (due < today) return 'overdue'
  const soon = new Date()
  soon.setDate(soon.getDate() + 30)
  const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
  return due <= soonIso ? 'soon' : 'ok'
}

export type WorkflowStage = 'prepare' | 'review' | 'approve' | 'active' | 'obsolete'

export function workflowStage(row: Pick<ManagementDocumentRow, 'status'> & DocControlFields): WorkflowStage {
  if (row.status === 'obsolete') return 'obsolete'
  if (row.status === 'active') return 'active'
  if (row.status === 'under_review') return row.reviewed_by_id ? 'approve' : 'review'
  return 'prepare'
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Master list of documents (8.3.2 c, d): every level, with control details. */
export function buildMasterListCsv(
  rows: Array<ManagementDocumentRow & DocControlFields>,
  userNames: ReadonlyMap<string, string>,
): string {
  const headers = [
    'Level',
    'Document No',
    'Title',
    'Type',
    'Status',
    'Revision No',
    'Revision Date',
    'Issue No',
    'Issue Date',
    'Amendment No',
    'Amendment Date',
    'Prepared By',
    'Prepared At',
    'Reviewed By',
    'Reviewed At',
    'Approved By',
    'Approved At',
    'Review Period (months)',
    'Next Review Due',
    'Last Periodic Review',
    'Distribution',
    'Withdrawn On',
    'Owner',
    'Remark',
  ]
  const lines = [headers.map(csvCell).join(',')]
  const sorted = [...rows].sort((a, b) => a.level - b.level || a.doc_number.localeCompare(b.doc_number))
  for (const r of sorted) {
    const dist = r.distribute_to_all
      ? 'All staff'
      : (r.distribution_user_ids ?? []).map((id) => userNames.get(id) ?? id).join('; ')
    lines.push(
      [
        r.level,
        r.doc_number,
        r.title,
        r.doc_type,
        r.status,
        r.revision_no,
        r.revision_date ?? '',
        r.issue_no ?? '',
        r.issue_date ?? '',
        r.amendment_no ?? '',
        r.amendment_date ?? '',
        r.prepared_by ?? '',
        r.prepared_at ?? '',
        r.reviewed_by ?? '',
        r.reviewed_at ?? '',
        r.approved_by ?? '',
        r.approved_at ?? '',
        r.review_period_months ?? '',
        r.next_review_due ?? '',
        r.last_periodic_review_at ?? '',
        dist,
        r.obsoleted_at ?? '',
        r.owner_name ?? '',
        r.remark ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
