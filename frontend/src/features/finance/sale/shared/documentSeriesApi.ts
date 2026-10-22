import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

/**
 * Finance document numbering from the database (`document_series`,
 * migration 20261023000002). Until that migration is applied the RPCs are
 * missing, every helper here returns null, and callers keep their old
 * browser-side numbering.
 */

export type DocumentSeriesRow = {
  doc_type: string
  label: string
  prefix: string
  next_number: number
  pad_width: number
  active_prefix: string | null
}

const DOC_TYPE_BY_KIND: Record<string, string> = {
  quotation: 'QUOTATION',
  proformaInvoice: 'PROFORMA',
  invoice: 'TAX_INVOICE',
  creditNote: 'CREDIT_NOTE',
  paymentReceipt: 'PAYMENT_RECEIPT',
}

export function seriesDocType(kind: string): string | null {
  return DOC_TYPE_BY_KIND[kind] ?? null
}

/** RPC or table not on the database yet (migration not applied). */
function isSeriesMissing(error: PostgrestError | null): boolean {
  if (!error) return false
  return (
    error.code === '42883' ||
    error.code === '42P01' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    (/next_document_number|peek_document_number|document_series/i.test(error.message) &&
      /not find|does not exist|schema cache/i.test(error.message))
  )
}

async function callSeriesRpc(fn: 'peek_document_number' | 'next_document_number', kind: string) {
  const docType = seriesDocType(kind)
  if (!docType) return null
  const { data, error } = await supabase.rpc(fn, { p_doc_type: docType })
  if (error) {
    if (isSeriesMissing(error) || error.code === 'P0002') return null
    throw error
  }
  const number = String(data ?? '').trim()
  return number || null
}

/** The number the next save would get, without using it up. */
export function peekDocumentNumber(kind: string): Promise<string | null> {
  return callSeriesRpc('peek_document_number', kind)
}

/** Takes the next number for a new document. Call it when saving, not when opening the form. */
export function allocateDocumentNumber(kind: string): Promise<string | null> {
  return callSeriesRpc('next_document_number', kind)
}

/**
 * Number to store for a new document. When the user kept the previewed
 * number, the database hands out the real one at save time (it may have
 * moved on if someone else saved meanwhile). A number typed by hand is kept.
 */
export async function numberForNewDocument(
  kind: string,
  formNumber: string,
  previewNumber: string | null,
): Promise<string> {
  const typed = formNumber.trim()
  if (!previewNumber || typed !== previewNumber.trim()) return typed
  return (await allocateDocumentNumber(kind)) ?? typed
}

export const DOCUMENT_SERIES_TOKEN_HELP =
  '{YYYY} year, {YY} two-digit year, {FY} financial year such as 26-27'

/** Same token rules as document_series_resolve_prefix() in the database (India time). */
export function resolveSeriesPrefix(template: string, on = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(on)
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? on.getFullYear())
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? on.getMonth() + 1)
  const fy = month >= 4 ? year : year - 1
  const two = (n: number) => String(n % 100).padStart(2, '0')
  return template
    .trim()
    .replaceAll('{YYYY}', String(year))
    .replaceAll('{YY}', two(year))
    .replaceAll('{FY}', `${two(fy)}-${two(fy + 1)}`)
}

export function sampleDocumentNumber(row: Pick<DocumentSeriesRow, 'prefix' | 'pad_width' | 'next_number'>): string {
  const width = Math.min(8, Math.max(1, row.pad_width))
  return `${resolveSeriesPrefix(row.prefix)}${String(Math.max(1, row.next_number)).padStart(width, '0')}`
}

/** null when the table is not on the database yet. */
export async function listDocumentSeries(): Promise<DocumentSeriesRow[] | null> {
  const { data, error } = await supabase
    .from('document_series')
    .select('doc_type, label, prefix, next_number, pad_width, active_prefix')
    .order('doc_type')
  if (error) {
    if (isSeriesMissing(error)) return null
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      doc_type: String(row.doc_type ?? ''),
      label: String(row.label ?? ''),
      prefix: String(row.prefix ?? ''),
      next_number: Number(row.next_number ?? 1) || 1,
      pad_width: Number(row.pad_width ?? 4) || 4,
      active_prefix: row.active_prefix == null ? null : String(row.active_prefix),
    }
  })
}

/**
 * Saves prefix, digits and the next serial for the prefix as it resolves
 * today. The database still never goes below the highest saved number.
 */
export async function saveDocumentSeries(
  row: Pick<DocumentSeriesRow, 'doc_type' | 'prefix' | 'pad_width' | 'next_number'>,
): Promise<void> {
  const { data, error } = await supabase
    .from('document_series')
    .update({
      prefix: row.prefix.trim(),
      pad_width: Math.min(8, Math.max(1, Math.trunc(row.pad_width))),
      next_number: Math.max(1, Math.trunc(row.next_number)),
      active_prefix: resolveSeriesPrefix(row.prefix),
    })
    .eq('doc_type', row.doc_type)
    .select('doc_type')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Only the Laboratory Director can change document numbering.')
  }
}
