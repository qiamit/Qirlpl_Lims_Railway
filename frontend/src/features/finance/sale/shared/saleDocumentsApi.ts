import type { PostgrestError } from '@supabase/supabase-js'
import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import { supabase } from '@/lib/supabaseClient'
import {
  normalizePaymentMethod,
  type PaymentMethod,
  type QuotationLineRow,
  type QuotationRow,
  type QuotationStatus,
} from '../quotation/types'
import { dbStatusFor, isCancelledDocument, parseGstSupplyMode, tdsAmount, type FinanceDbStatus } from './financeRules'

/**
 * Proforma invoices, tax invoices, credit notes and payment receipts.
 *
 * From finance Phase 2 (migrations 20261030100000..300) they live in typed
 * tables, as in Consultancy Pro:
 *   proformaInvoice → finance_proforma_invoices (+ _lines)
 *   invoice         → finance_tax_invoices      (+ _lines)
 *   creditNote      → finance_credit_notes      (+ _lines, invoice_id)
 *   paymentReceipt  → transactions (payment_flow 'in', TDS, invoice_id)
 * The screens keep working with QuotationRow, so this module maps both ways.
 *
 * Until those migrations are applied the typed tables are missing; the
 * module notices that once per page load and keeps using the older single
 * table sale_documents (JSON payload), exactly as before.
 *
 * Records still kept in this browser (localStorage, from before any of this
 * was in the database) are uploaded once to whichever store is in use; a
 * number already taken gets "-LOCAL".
 */

const SALE_KINDS = ['proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt'] as const
export type SaleDocumentKind = (typeof SALE_KINDS)[number]
type HeaderKind = Exclude<SaleDocumentKind, 'paymentReceipt'>

type HeaderTableConfig = {
  table: string
  linesTable: string
  parentFk: string
  numberCol: string
  dateCol: string
  statusCol: string
}

const HEADER_TABLES: Record<HeaderKind, HeaderTableConfig> = {
  proformaInvoice: {
    table: 'finance_proforma_invoices',
    linesTable: 'finance_proforma_invoice_lines',
    parentFk: 'proforma_invoice_id',
    numberCol: 'proforma_number',
    dateCol: 'proforma_date',
    statusCol: 'proforma_status',
  },
  invoice: {
    table: 'finance_tax_invoices',
    linesTable: 'finance_tax_invoice_lines',
    parentFk: 'tax_invoice_id',
    numberCol: 'tax_invoice_number',
    dateCol: 'tax_date',
    statusCol: 'tax_status',
  },
  creditNote: {
    table: 'finance_credit_notes',
    linesTable: 'finance_credit_note_lines',
    parentFk: 'credit_note_id',
    numberCol: 'credit_note_number',
    dateCol: 'credit_note_date',
    statusCol: 'credit_note_status',
  },
}

const MODE_TO_DB: Record<PaymentMethod, string> = {
  Bank: 'bank',
  Cash: 'cash',
  UPI: 'upi',
  Cheque: 'cheque',
  Other: 'other',
}

const MODE_FROM_DB: Record<string, PaymentMethod> = {
  bank: 'Bank',
  neft_rtgs: 'Bank',
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
  card: 'Other',
  other: 'Other',
}

const PAGE = 1000

const cache = new Map<SaleDocumentKind, QuotationRow[]>()

function isSaleKind(kind: DocumentTemplateKind): kind is SaleDocumentKind {
  return (SALE_KINDS as readonly string[]).includes(kind)
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type Extra = Record<string, unknown>
type RawRow = Record<string, unknown> & { id: string; extra?: Extra | null; lines?: RawLine[] | null }
type RawLine = Record<string, unknown> & { id: string; extra?: Extra | null }

function obj(value: unknown): Extra {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Extra) : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function strOrNull(value: unknown): string | null {
  const s = str(value).trim()
  return s ? s : null
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n))
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function isDuplicateNumber(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|already used|_number_uidx|kind_number_uidx/i.test(error.message ?? '')
}

function duplicateNumberError(number: string): Error {
  return new Error(`${number} is already used. Choose the next number.`)
}

/** Table (or its embedded lines table) not on the database yet. */
function isMissingRelation(error: PostgrestError | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST200' ||
    (/finance_|transactions/i.test(error.message) &&
      /does not exist|schema cache|could not find/i.test(error.message))
  )
}

// ---------------------------------------------------------------------------
// Which store: typed tables (Phase 2) or sale_documents (before Phase 2)
// ---------------------------------------------------------------------------

type Store = 'typed' | 'legacy'
let store: Store | null = null
let storeProbe: Promise<Store> | null = null

function detectStore(): Promise<Store> {
  if (store) return Promise.resolve(store)
  if (!storeProbe) {
    storeProbe = (async () => {
      const { error } = await supabase.from('finance_tax_invoices').select('id').limit(1)
      // Any other error (network, permissions) is reported by the real query.
      const found: Store = error && isMissingRelation(error) ? 'legacy' : 'typed'
      store = found
      return found
    })().finally(() => {
      storeProbe = null
    })
  }
  return storeProbe
}

/** 'typed' after the Phase 2 migrations, 'legacy' before them. */
export function saleDocumentStore(): Promise<Store> {
  return detectStore()
}

// ---------------------------------------------------------------------------
// Typed tables → QuotationRow
// ---------------------------------------------------------------------------

function defaultUiStatus(kind: SaleDocumentKind): QuotationStatus {
  if (kind === 'proformaInvoice') return 'Proforma'
  if (kind === 'invoice') return 'Invoice'
  return 'Draft'
}

/** The label the user chose (extra.ui_status), unless the database status was changed elsewhere. */
function uiStatusFor(kind: SaleDocumentKind, dbStatus: string, label: unknown): QuotationStatus {
  const saved = str(label).trim()
  if (saved && dbStatusFor(saved) === dbStatus) return saved as QuotationStatus
  if (dbStatus === 'accepted') return 'Finalized'
  if (dbStatus === 'cancelled') return 'Rejected'
  return defaultUiStatus(kind)
}

function lineFromRaw(parentId: string, raw: RawLine, index: number): QuotationLineRow {
  const extra = obj(raw.extra)
  const quantity = num(raw.qty)
  const rate = num(raw.unit_rate)
  const gross = extra.gross_amount
  return {
    id: raw.id,
    quotation_id: parentId,
    line_no: num(raw.line_no) || index + 1,
    description: str(raw.item_description),
    details: strOrNull(extra.details),
    make: strOrNull(extra.make),
    hsn_sac: strOrNull(raw.hsn_sac),
    item_code: strOrNull(extra.item_code),
    quantity,
    unit: str(raw.unit_of_item) || 'Nos',
    rate,
    amount: gross == null ? round2(quantity * rate) : num(gross),
    discount_percent: num(raw.line_discount_percent),
    gst_percent: num(raw.gst_rate),
    line_remarks: strOrNull(extra.line_remarks),
    delivery_period: strOrNull(extra.delivery_period),
  }
}

function headerFromRaw(kind: HeaderKind, raw: RawRow): QuotationRow {
  const cfg = HEADER_TABLES[kind]
  const extra = obj(raw.extra)
  const charges = obj(extra.charges)
  const lines = (raw.lines ?? []).map((l, i) => lineFromRaw(raw.id, l, i))
  lines.sort((a, b) => a.line_no - b.line_no)
  return {
    id: raw.id,
    quotation_number: str(raw[cfg.numberCol]),
    quotation_date: str(raw[cfg.dateCol]).slice(0, 10),
    valid_until: strOrNull(raw.valid_until_date)?.slice(0, 10) ?? null,
    client_id: strOrNull(raw.client_id),
    client_name: str(raw.client_name).trim() || str(extra.client_name),
    contact_person: strOrNull(extra.contact_person),
    contact_email: strOrNull(extra.contact_email),
    contact_mobile: strOrNull(extra.contact_mobile),
    client_address: strOrNull(extra.client_address),
    client_gst_number: strOrNull(extra.client_gst_number),
    subject: strOrNull(raw.scope_of_work),
    reference_no: strOrNull(extra.reference_no),
    status: uiStatusFor(kind, str(raw[cfg.statusCol]), extra.ui_status),
    payment_terms: strOrNull(raw.terms_and_conditions),
    notes: strOrNull(raw.notes),
    remarks: strOrNull(extra.remarks),
    signature_text: strOrNull(raw.seal_and_sign),
    signature_image_path: strOrNull(extra.signature_image_path),
    discount_percent: num(charges.discount_percent),
    discount_amount: num(charges.discount_amount),
    transportation_charges: num(charges.transportation_charges),
    packaging_charges: num(charges.packaging_charges),
    gst_percent: num(extra.gst_percent),
    gst_amount: num(raw.tax_total),
    subtotal: num(raw.subtotal),
    grand_total: num(raw.grand_total),
    created_at: str(raw.created_at) || undefined,
    updated_at: str(raw.updated_at) || undefined,
    line_items: lines,
    gst_supply_mode: parseGstSupplyMode(raw.gst_supply_mode),
    gst_supply_mode_manual: extra.gst_supply_mode_manual === true,
    invoice_id: strOrNull(raw.invoice_id),
    invoice_reference_no: strOrNull(extra.invoice_reference_no),
    cancelled_at: strOrNull(extra.cancelled_at),
    cancel_reason: strOrNull(extra.cancel_reason),
  }
}

function receiptFromRaw(raw: RawRow): QuotationRow {
  const extra = obj(raw.extra)
  const amount = num(raw.amount)
  const method =
    MODE_FROM_DB[str(raw.mode_of_payment)] ?? normalizePaymentMethod(str(extra.payment_method))
  const dbStatus: FinanceDbStatus = raw.status === 'cancelled' ? 'cancelled' : 'pending'
  const label = str(extra.ui_status).trim()
  const status: QuotationStatus =
    label && (dbStatus === 'cancelled') === (dbStatusFor(label) === 'cancelled')
      ? (label as QuotationStatus)
      : dbStatus === 'cancelled'
        ? 'Rejected'
        : 'Draft'
  const tdsRaw = raw.tds_percent
  return {
    id: raw.id,
    quotation_number: str(raw.receipt_number),
    quotation_date: str(raw.txn_date).slice(0, 10),
    valid_until: null,
    client_id: strOrNull(raw.client_id),
    client_name: str(raw.client_name).trim() || str(extra.client_name),
    contact_person: strOrNull(extra.contact_person),
    contact_email: strOrNull(extra.contact_email),
    contact_mobile: strOrNull(extra.contact_mobile),
    client_address: strOrNull(extra.client_address),
    client_gst_number: strOrNull(extra.client_gst_number),
    subject: strOrNull(raw.description),
    // The receipt screens read the payment method from reference_no.
    reference_no: method,
    status,
    payment_terms: strOrNull(extra.payment_terms),
    notes: strOrNull(raw.notes),
    remarks: strOrNull(extra.remarks),
    signature_text: strOrNull(extra.signature_text),
    signature_image_path: strOrNull(extra.signature_image_path),
    discount_percent: 0,
    discount_amount: 0,
    transportation_charges: 0,
    packaging_charges: 0,
    gst_percent: 0,
    gst_amount: 0,
    subtotal: amount,
    grand_total: amount,
    created_at: str(raw.created_at) || undefined,
    updated_at: str(raw.updated_at) || undefined,
    line_items: [],
    invoice_id: strOrNull(raw.invoice_id),
    invoice_reference_no: strOrNull(extra.invoice_reference_no),
    tds_percent: tdsRaw == null || tdsRaw === '' ? null : num(tdsRaw),
    tds_section: strOrNull(raw.tds_section),
    tds_amount: num(raw.tds_amount),
    tds_taxable_amount: num(raw.tds_taxable_amount),
    cancelled_at: strOrNull(extra.cancelled_at),
    cancel_reason: strOrNull(extra.cancel_reason),
  }
}

async function queryTyped(kind: SaleDocumentKind): Promise<QuotationRow[]> {
  const out: QuotationRow[] = []
  for (let from = 0; ; from += PAGE) {
    let batch: RawRow[]
    if (kind === 'paymentReceipt') {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('payment_flow', 'in')
        .order('txn_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      batch = (data ?? []) as unknown as RawRow[]
      out.push(...batch.map(receiptFromRaw))
    } else {
      const cfg = HEADER_TABLES[kind]
      const { data, error } = await supabase
        .from(cfg.table)
        .select(`*, lines:${cfg.linesTable}(*)`)
        .order(cfg.dateCol, { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      batch = (data ?? []) as unknown as RawRow[]
      out.push(...batch.map((r) => headerFromRaw(kind, r)))
    }
    if (batch.length < PAGE) break
  }
  return out
}

// ---------------------------------------------------------------------------
// QuotationRow → typed tables
// ---------------------------------------------------------------------------

async function existingExtra(table: string, id: string): Promise<Extra> {
  const { data, error } = await supabase.from(table).select('extra').eq('id', id).maybeSingle()
  if (error) throw error
  return obj((data as { extra?: unknown } | null)?.extra)
}

/** Invoice id for a typed invoice number (case-insensitive), or null. */
async function invoiceIdForNumber(reference: string | null | undefined): Promise<string | null> {
  const ref = String(reference ?? '').trim()
  if (!ref) return null
  const { data, error } = await supabase
    .from('finance_tax_invoices')
    .select('id')
    .ilike('tax_invoice_number', escapeLike(ref))
    .limit(1)
  if (error) return null
  const first = (Array.isArray(data) ? data[0] : null) as { id?: string } | null
  return first?.id ?? null
}

/** Supply mode when the screen did not set one (older browser records). */
async function supplyModeFor(row: QuotationRow): Promise<'intra' | 'inter' | null> {
  const known = parseGstSupplyMode(row.gst_supply_mode)
  if (known) return known
  const { data, error } = row.client_id
    ? await supabase.rpc('sale_gst_supply_mode_for_client', { p_client_id: row.client_id })
    : await supabase.rpc('finance_gst_supply_mode_for', {
        p_client_gstin: row.client_gst_number ?? '',
        p_client_state: '',
      })
  if (error) return null
  return parseGstSupplyMode(data)
}

function clientSnapshot(row: QuotationRow): Extra {
  return {
    client_name: row.client_name?.trim() || null,
    contact_person: row.contact_person ?? null,
    contact_email: row.contact_email ?? null,
    contact_mobile: row.contact_mobile ?? null,
    client_address: row.client_address ?? null,
    client_gst_number: row.client_gst_number ?? null,
  }
}

function buildLines(row: QuotationRow, parentFk: string): Array<Record<string, unknown>> {
  return (row.line_items ?? [])
    .filter((l) => String(l.description ?? '').trim().length > 0)
    .map((l, index) => {
      const quantity = num(l.quantity)
      const rate = num(l.rate)
      const gross = l.amount == null ? round2(quantity * rate) : num(l.amount)
      const discount = clampPercent(num(l.discount_percent))
      const gstRate = clampPercent(num(l.gst_percent))
      const taxable = round2(gross * (1 - discount / 100))
      const tax = round2(taxable * (gstRate / 100))
      return {
        id: crypto.randomUUID(),
        [parentFk]: row.id,
        line_no: num(l.line_no) || index + 1,
        item_description: String(l.description ?? '').trim(),
        hsn_sac: l.hsn_sac?.trim() || null,
        unit_of_item: l.unit?.trim() || 'Nos',
        qty: quantity,
        unit_rate: rate,
        line_discount_percent: discount,
        gst_rate: gstRate,
        line_subtotal: taxable,
        line_tax: tax,
        line_total: round2(taxable + tax),
        extra: {
          details: l.details?.trim() || null,
          make: l.make?.trim() || null,
          item_code: l.item_code?.trim() || null,
          line_remarks: l.line_remarks?.trim() || null,
          delivery_period: l.delivery_period?.trim() || null,
          gross_amount: gross,
        },
      }
    })
}

async function saveHeaderTyped(kind: HeaderKind, row: QuotationRow): Promise<QuotationRow> {
  const cfg = HEADER_TABLES[kind]
  const number = row.quotation_number.trim()
  const [extraBefore, supplyMode, invoiceId] = await Promise.all([
    existingExtra(cfg.table, row.id),
    supplyModeFor(row),
    kind === 'creditNote' ? invoiceIdForNumber(row.reference_no) : Promise.resolve(null),
  ])
  const header: Record<string, unknown> = {
    id: row.id,
    [cfg.numberCol]: number,
    [cfg.dateCol]: row.quotation_date || todayIso(),
    valid_until_date: row.valid_until || null,
    client_id: row.client_id || null,
    client_name: row.client_name?.trim() ?? '',
    [cfg.statusCol]: dbStatusFor(row.status),
    gst_supply_mode: supplyMode,
    notes: row.notes ?? null,
    terms_and_conditions: row.payment_terms ?? null,
    scope_of_work: row.subject ?? null,
    seal_and_sign: row.signature_text ?? null,
    subtotal: round2(num(row.subtotal)),
    tax_total: round2(num(row.gst_amount)),
    grand_total: round2(num(row.grand_total)),
    extra: {
      ...extraBefore,
      ...clientSnapshot(row),
      ui_status: row.status,
      reference_no: row.reference_no ?? null,
      remarks: row.remarks ?? null,
      signature_image_path: row.signature_image_path ?? null,
      gst_percent: num(row.gst_percent),
      gst_supply_mode_manual: Boolean(row.gst_supply_mode_manual && parseGstSupplyMode(row.gst_supply_mode)),
      charges: {
        discount_percent: num(row.discount_percent),
        discount_amount: num(row.discount_amount),
        transportation_charges: num(row.transportation_charges),
        packaging_charges: num(row.packaging_charges),
      },
      ...(kind === 'creditNote'
        ? { invoice_reference_no: invoiceId ? (row.reference_no?.trim() ?? null) : null }
        : {}),
    },
  }
  if (kind === 'creditNote') header.invoice_id = invoiceId
  if (row.created_at) header.created_at = row.created_at

  const { error } = await supabase.from(cfg.table).upsert(header, { onConflict: 'id' })
  if (error) {
    if (isDuplicateNumber(error)) throw duplicateNumberError(number)
    throw error
  }

  const lines = buildLines(row, cfg.parentFk)
  if (lines.length > 0) {
    const { error: linesError } = await supabase.from(cfg.linesTable).insert(lines)
    if (linesError) throw linesError
  }
  // Remove the previous lines only after the new ones are stored.
  const keepIds = lines.map((l) => String(l.id))
  let cleanup = supabase.from(cfg.linesTable).delete().eq(cfg.parentFk, row.id)
  if (keepIds.length > 0) cleanup = cleanup.not('id', 'in', `(${keepIds.join(',')})`)
  const { error: cleanupError } = await cleanup
  if (cleanupError) throw cleanupError

  return {
    ...row,
    gst_supply_mode: supplyMode,
    ...(kind === 'creditNote' ? { invoice_id: invoiceId } : {}),
  }
}

async function saveReceiptTyped(row: QuotationRow): Promise<QuotationRow> {
  const number = row.quotation_number.trim()
  const method = normalizePaymentMethod(row.reference_no)
  const amount = Math.max(0, round2(num(row.grand_total)))
  const percentRaw = row.tds_percent == null ? NaN : Number(row.tds_percent)
  const tdsPercent = Number.isFinite(percentRaw) && percentRaw > 0 && percentRaw <= 100 ? percentRaw : null
  const tdsTaxable = tdsPercent == null ? 0 : Math.max(0, round2(num(row.tds_taxable_amount) || amount))
  const tds = tdsPercent == null ? 0 : tdsAmount(tdsTaxable, tdsPercent)
  const invoiceRef = row.invoice_reference_no?.trim() || null
  const [extraBefore, invoiceId] = await Promise.all([
    existingExtra('transactions', row.id),
    invoiceIdForNumber(invoiceRef),
  ])
  const body: Record<string, unknown> = {
    id: row.id,
    payment_flow: 'in',
    receipt_number: number,
    txn_date: row.quotation_date || todayIso(),
    client_id: row.client_id || null,
    client_name: row.client_name?.trim() ?? '',
    invoice_id: invoiceId,
    amount,
    currency: 'INR',
    status: dbStatusFor(row.status) === 'cancelled' ? 'cancelled' : 'completed',
    mode_of_payment: MODE_TO_DB[method],
    tds_percent: tdsPercent,
    tds_section: tdsPercent == null ? null : row.tds_section?.trim().slice(0, 32) || null,
    tds_amount: tds,
    tds_taxable_amount: tdsTaxable,
    description: row.subject ?? null,
    notes: row.notes ?? null,
    extra: {
      ...extraBefore,
      ...clientSnapshot(row),
      ui_status: row.status,
      payment_method: method,
      invoice_reference_no: invoiceRef,
      remarks: row.remarks ?? null,
      payment_terms: row.payment_terms ?? null,
      signature_text: row.signature_text ?? null,
      signature_image_path: row.signature_image_path ?? null,
    },
  }
  if (row.created_at) body.created_at = row.created_at
  const { error } = await supabase.from('transactions').upsert(body, { onConflict: 'id' })
  if (error) {
    if (isDuplicateNumber(error)) throw duplicateNumberError(number)
    throw error
  }
  return {
    ...row,
    invoice_id: invoiceId,
    invoice_reference_no: invoiceRef,
    tds_percent: tdsPercent,
    tds_section: tdsPercent == null ? null : row.tds_section?.trim() || null,
    tds_amount: tds,
    tds_taxable_amount: tdsTaxable,
  }
}

function saveTyped(kind: SaleDocumentKind, row: QuotationRow): Promise<QuotationRow> {
  return kind === 'paymentReceipt' ? saveReceiptTyped(row) : saveHeaderTyped(kind, row)
}

async function deleteTyped(kind: SaleDocumentKind, ids: string[]): Promise<void> {
  if (kind === 'paymentReceipt') {
    const { error } = await supabase.from('transactions').delete().eq('payment_flow', 'in').in('id', ids)
    if (error) throw error
    return
  }
  const { error } = await supabase.from(HEADER_TABLES[kind].table).delete().in('id', ids)
  if (error) throw error
}

/** extra keys of a cancelled document (the database stamps cancelled_at / cancelled_by again). */
function cancelExtra(row: QuotationRow, reason: string, at: string): Extra {
  return {
    ui_status: 'Cancelled',
    cancelled_at: at,
    cancel_reason: reason,
    status_before_cancel: row.status,
  }
}

function noRowCancelled(row: QuotationRow): Error {
  return new Error(`${row.quotation_number || 'The document'} could not be cancelled (no Edit access on this page?).`)
}

/**
 * Cancel = an UPDATE that keeps the row and its number (status cancelled,
 * extra.ui_status 'Cancelled', cancelled_at, cancel_reason). Migration
 * 20261101100000 also turns any DELETE on these tables into the same cancel.
 */
async function cancelTyped(kind: SaleDocumentKind, row: QuotationRow, reason: string, at: string): Promise<QuotationRow> {
  const table = kind === 'paymentReceipt' ? 'transactions' : HEADER_TABLES[kind].table
  const extra = { ...(await existingExtra(table, row.id)), ...cancelExtra(row, reason, at) }
  const query =
    kind === 'paymentReceipt'
      ? supabase.from(table).update({ status: 'cancelled', extra }).eq('id', row.id).eq('payment_flow', 'in')
      : supabase.from(table).update({ [HEADER_TABLES[kind].statusCol]: 'cancelled', extra }).eq('id', row.id)
  const { data, error } = await query.select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw noRowCancelled(row)
  return { ...row, status: 'Cancelled', cancelled_at: at, cancel_reason: reason }
}

// ---------------------------------------------------------------------------
// Legacy store: sale_documents (before the Phase 2 migrations)
// ---------------------------------------------------------------------------

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

function fromLegacy(row: SaleDocumentDbRow): QuotationRow {
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

function toLegacy(kind: SaleDocumentKind, row: QuotationRow) {
  return {
    id: row.id,
    document_kind: kind,
    document_number: row.quotation_number.trim(),
    client_id: row.client_id,
    client_name: row.client_name,
    status: row.status,
    document_date: row.quotation_date || todayIso(),
    grand_total: Number(row.grand_total) || 0,
    payload: row,
    created_at: row.created_at ?? new Date().toISOString(),
  }
}

async function queryLegacy(kind: SaleDocumentKind): Promise<QuotationRow[]> {
  const { data, error } = await supabase
    .from('sale_documents')
    .select(
      'id, document_kind, document_number, client_id, client_name, status, document_date, grand_total, payload, created_at, updated_at',
    )
    .eq('document_kind', kind)
    .order('document_date', { ascending: false })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((row) => fromLegacy(row as SaleDocumentDbRow))
}

async function saveLegacy(kind: SaleDocumentKind, row: QuotationRow): Promise<QuotationRow> {
  const { error } = await supabase.from('sale_documents').upsert(toLegacy(kind, row), { onConflict: 'id' })
  if (error) {
    if (isDuplicateNumber(error)) throw duplicateNumberError(row.quotation_number.trim())
    throw error
  }
  return row
}

async function deleteLegacy(kind: SaleDocumentKind, ids: string[]): Promise<void> {
  const { error } = await supabase.from('sale_documents').delete().eq('document_kind', kind).in('id', ids)
  if (error) throw error
}

async function cancelLegacy(kind: SaleDocumentKind, row: QuotationRow, reason: string, at: string): Promise<QuotationRow> {
  const next: QuotationRow = { ...row, status: 'Cancelled', cancelled_at: at, cancel_reason: reason }
  const { data, error } = await supabase
    .from('sale_documents')
    .update({ status: 'Cancelled', payload: next })
    .eq('document_kind', kind)
    .eq('id', row.id)
    .select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw noRowCancelled(row)
  return next
}

// ---------------------------------------------------------------------------
// Browser records (localStorage) from before the database
// ---------------------------------------------------------------------------

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

async function uploadLocalRows(kind: SaleDocumentKind, rows: QuotationRow[], target: Store): Promise<void> {
  const save = target === 'typed' ? saveTyped : saveLegacy
  for (const row of rows) {
    try {
      await save(kind, row)
    } catch (err) {
      if (!(err instanceof Error) || !/is already used/.test(err.message)) throw err
      await save(kind, { ...row, quotation_number: `${row.quotation_number.trim()}-LOCAL` })
    }
  }
}

// ---------------------------------------------------------------------------
// Public API (same contract as before Phase 2)
// ---------------------------------------------------------------------------

async function queryKind(kind: SaleDocumentKind): Promise<QuotationRow[]> {
  return (await detectStore()) === 'typed' ? queryTyped(kind) : queryLegacy(kind)
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
  const target = await detectStore()
  const dbRows = await queryKind(kind)
  const localRows = readLocalRows(kind)
  const seen = new Set(dbRows.map((row) => row.id))
  const missing = localRows.filter((row) => row && row.id && !seen.has(row.id))
  if (missing.length > 0 && localStorage.getItem(importedFlag(kind)) !== '1') {
    try {
      await uploadLocalRows(kind, missing, target)
    } catch (err) {
      // No Edit right on this page: keep the browser copy for someone who has it.
      const e = err as { code?: string; message?: string }
      if (e?.code !== '42501' && !/row-level security|permission denied/i.test(String(e?.message ?? ''))) throw err
      cache.set(kind, dbRows)
      return dbRows
    }
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

/**
 * Saves one document. Resolves with the row as stored (supply mode, invoice
 * link and TDS filled in), which callers may keep in their list.
 */
export async function saveSaleDocument(kind: DocumentTemplateKind, row: QuotationRow): Promise<QuotationRow> {
  if (!isSaleKind(kind)) throw new Error('This sale document is not stored in the database.')
  const stored = (await detectStore()) === 'typed' ? await saveTyped(kind, row) : await saveLegacy(kind, row)
  const current = cache.get(kind) ?? []
  const next = current.some((item) => item.id === stored.id)
    ? current.map((item) => (item.id === stored.id ? stored : item))
    : [stored, ...current]
  cache.set(kind, next)
  return stored
}

export async function deleteSaleDocuments(kind: DocumentTemplateKind, ids: string[]): Promise<void> {
  if (!isSaleKind(kind) || ids.length === 0) return
  if ((await detectStore()) === 'typed') await deleteTyped(kind, ids)
  else await deleteLegacy(kind, ids)
  const current = cache.get(kind) ?? []
  const drop = new Set(ids)
  cache.set(
    kind,
    current.filter((row) => !drop.has(row.id)),
  )
}

/**
 * Cancels documents instead of deleting them: each keeps its number (GST
 * practice) and stays listed as 'Cancelled'. Rows already cancelled are left
 * as they are. Resolves with the updated rows and the table whose audit entry
 * should carry the reason (recordReason(table, ids, reason)).
 */
export async function cancelSaleDocuments(
  kind: DocumentTemplateKind,
  rows: QuotationRow[],
  reason: string,
): Promise<{ rows: QuotationRow[]; table: string }> {
  if (!isSaleKind(kind)) throw new Error('This sale document is not stored in the database.')
  const typed = (await detectStore()) === 'typed'
  const table = !typed ? 'sale_documents' : kind === 'paymentReceipt' ? 'transactions' : HEADER_TABLES[kind].table
  const at = new Date().toISOString()
  const done: QuotationRow[] = []
  for (const row of rows) {
    if (isCancelledDocument(row.status)) continue
    done.push(typed ? await cancelTyped(kind, row, reason, at) : await cancelLegacy(kind, row, reason, at))
  }
  const byId = new Map(done.map((row) => [row.id, row]))
  cache.set(
    kind,
    (cache.get(kind) ?? []).map((row) => byId.get(row.id) ?? row),
  )
  return { rows: done, table }
}

/** Invoice numbers the user may pick for a receipt or credit note (cancelled ones left out). Empty before Phase 2. */
export function cachedInvoiceNumbers(): string[] {
  return (cache.get('invoice') ?? [])
    .filter((row) => dbStatusFor(row.status) !== 'cancelled')
    .map((row) => row.quotation_number.trim())
    .filter(Boolean)
}
