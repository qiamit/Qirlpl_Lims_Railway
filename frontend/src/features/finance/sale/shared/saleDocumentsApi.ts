import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import { supabase } from '@/lib/supabaseClient'
import type { QuotationRow } from '../quotation/types'

const SALE_KINDS = ['proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt'] as const
export type SaleDocumentKind = (typeof SALE_KINDS)[number]

const cache = new Map<SaleDocumentKind, QuotationRow[]>()

function isSaleKind(kind: DocumentTemplateKind): kind is SaleDocumentKind {
  return (SALE_KINDS as readonly string[]).includes(kind)
}

function storageKey(kind: SaleDocumentKind): string {
  return `lims.saleDocuments.${kind}`
}

function importedFlag(kind: SaleDocumentKind): string {
  return `lims.saleDocuments.${kind}.imported`
}

function readLocalRows(kind: SaleDocumentKind): QuotationRow[] {
  try {
    const raw = localStorage.getItem(storageKey(kind))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as QuotationRow[]) : []
  } catch {
    return []
  }
}

type SaleDocumentDbRow = {
  id: string
  document_kind: string
  document_number: string
  client_id: string | null
  client_name: string
  status: string
  document_date: string
  grand_total: number | string
  payload: QuotationRow
  created_at: string
  updated_at: string
}

function fromDb(row: SaleDocumentDbRow): QuotationRow {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : ({} as QuotationRow)
  return {
    ...payload,
    id: row.id,
    quotation_number: row.document_number,
    quotation_date: String(row.document_date).slice(0, 10),
    client_id: row.client_id,
    client_name: row.client_name,
    status: row.status as QuotationRow['status'],
    grand_total: Number(row.grand_total) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function toDb(kind: SaleDocumentKind, row: QuotationRow) {
  return {
    id: row.id,
    document_kind: kind,
    document_number: row.quotation_number.trim(),
    client_id: row.client_id,
    client_name: row.client_name,
    status: row.status,
    document_date: row.quotation_date || new Date().toISOString().slice(0, 10),
    grand_total: Number(row.grand_total) || 0,
    payload: row,
    created_at: row.created_at ?? new Date().toISOString(),
  }
}

async function queryKind(kind: SaleDocumentKind): Promise<QuotationRow[]> {
  const { data, error } = await supabase
    .from('sale_documents')
    .select(
      'id, document_kind, document_number, client_id, client_name, status, document_date, grand_total, payload, created_at, updated_at',
    )
    .eq('document_kind', kind)
    .order('document_date', { ascending: false })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((row) => fromDb(row as SaleDocumentDbRow))
}

async function insertRows(kind: SaleDocumentKind, rows: QuotationRow[]): Promise<void> {
  for (const row of rows) {
    const payload = toDb(kind, row)
    const { error } = await supabase.from('sale_documents').upsert(payload, { onConflict: 'id' })
    if (error && /sale_documents_kind_number_uidx|duplicate key/i.test(error.message)) {
      const renamed = {
        ...row,
        quotation_number: `${row.quotation_number}-LOCAL`,
      }
      const retry = await supabase.from('sale_documents').upsert(toDb(kind, renamed), { onConflict: 'id' })
      if (retry.error) throw retry.error
      continue
    }
    if (error) throw error
  }
}

export function loadSaleDocumentRows(kind: DocumentTemplateKind): QuotationRow[] {
  if (!isSaleKind(kind)) return []
  return cache.get(kind) ?? readLocalRows(kind)
}

export function rememberSaleDocumentRows(kind: DocumentTemplateKind, rows: QuotationRow[]): void {
  if (!isSaleKind(kind)) return
  cache.set(kind, rows)
}

export async function fetchSaleDocuments(kind: DocumentTemplateKind): Promise<QuotationRow[]> {
  if (!isSaleKind(kind)) return []
  const dbRows = await queryKind(kind)
  const localRows = readLocalRows(kind)
  const seen = new Set(dbRows.map((row) => row.id))
  const missing = localRows.filter((row) => !seen.has(row.id))
  if (missing.length > 0 && localStorage.getItem(importedFlag(kind)) !== '1') {
    await insertRows(kind, missing)
    localStorage.setItem(importedFlag(kind), '1')
    localStorage.removeItem(storageKey(kind))
    const merged = await queryKind(kind)
    cache.set(kind, merged)
    return merged
  }
  if (dbRows.length > 0 || localRows.length === 0) {
    localStorage.setItem(importedFlag(kind), '1')
  }
  cache.set(kind, dbRows)
  return dbRows
}

export async function refreshSaleDocumentCache(): Promise<void> {
  await Promise.all(SALE_KINDS.map((kind) => fetchSaleDocuments(kind)))
}

export async function saveSaleDocument(kind: DocumentTemplateKind, row: QuotationRow): Promise<void> {
  if (!isSaleKind(kind)) throw new Error('This sale document is not stored in the database.')
  const { error } = await supabase.from('sale_documents').upsert(toDb(kind, row), { onConflict: 'id' })
  if (error) {
    if (/sale_documents_kind_number_uidx|duplicate key/i.test(error.message)) {
      throw new Error(`${row.quotation_number} is already used. Choose the next number.`)
    }
    throw error
  }
  const current = cache.get(kind) ?? []
  const next = current.some((item) => item.id === row.id)
    ? current.map((item) => (item.id === row.id ? row : item))
    : [row, ...current]
  cache.set(kind, next)
}

export async function deleteSaleDocuments(kind: DocumentTemplateKind, ids: string[]): Promise<void> {
  if (!isSaleKind(kind) || ids.length === 0) return
  const { error } = await supabase.from('sale_documents').delete().eq('document_kind', kind).in('id', ids)
  if (error) throw error
  const current = cache.get(kind) ?? []
  const drop = new Set(ids)
  cache.set(
    kind,
    current.filter((row) => !drop.has(row.id)),
  )
}
