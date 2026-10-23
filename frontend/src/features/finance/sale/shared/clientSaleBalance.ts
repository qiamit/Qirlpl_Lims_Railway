import type { QuotationRow } from '../quotation/types'
import { dbStatusFor } from './financeRules'
import { loadSaleDocumentRows } from './saleDocumentsApi'

/*
 * The rows come from the sale document cache, which after finance Phase 2
 * is read from finance_tax_invoices, finance_credit_notes and transactions
 * (payment_flow 'in'); before the Phase 2 migrations from sale_documents.
 * Cancelled documents (the Cancel action, which keeps the number, and the
 * Rejected / Expired statuses) do not count, and a receipt settles its amount
 * plus the TDS the customer deducted.
 */

export { loadSaleDocumentRows, refreshSaleDocumentCache } from './saleDocumentsApi'

function sameClient(row: QuotationRow, clientId: string, clientName: string): boolean {
  const id = clientId.trim()
  if (id && row.client_id && row.client_id === id) return true
  const name = clientName.trim().toLowerCase()
  if (!name) return false
  return String(row.client_name ?? '').trim().toLowerCase() === name
}

function rowAmount(row: QuotationRow): number {
  const n = Number(row.grand_total)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function isCounted(row: QuotationRow): boolean {
  return dbStatusFor(String(row.status ?? '')) !== 'cancelled'
}

/** Payment plus TDS deducted by the customer. */
function receiptSettled(row: QuotationRow): number {
  const tds = Number(row.tds_amount ?? 0)
  return rowAmount(row) + (Number.isFinite(tds) ? Math.max(0, tds) : 0)
}

export type ClientLedgerBalance = {
  amount: number
  type: 'Dr' | 'Cr'
}

/**
 * Client outstanding = opening (Masters) + Invoices − Credit Notes − Payment Receipts.
 * Proforma is excluded (not booked).
 */
export function computeClientSaleBalance(opts: {
  clientId: string
  clientName: string
  openingBalance?: number
  openingType?: 'Dr' | 'Cr'
  excludeReceiptId?: string | null
  /** Extra debit (e.g. quotations converted to Invoice in DB). */
  extraDebit?: number
}): ClientLedgerBalance {
  const opening = Math.max(0, Number(opts.openingBalance ?? 0) || 0)
  let signed = opts.openingType === 'Cr' ? -opening : opening
  signed += Math.max(0, Number(opts.extraDebit ?? 0) || 0)

  for (const row of loadSaleDocumentRows('invoice')) {
    if (isCounted(row) && sameClient(row, opts.clientId, opts.clientName)) signed += rowAmount(row)
  }
  for (const row of loadSaleDocumentRows('creditNote')) {
    if (isCounted(row) && sameClient(row, opts.clientId, opts.clientName)) signed -= rowAmount(row)
  }
  for (const row of loadSaleDocumentRows('paymentReceipt')) {
    if (opts.excludeReceiptId && row.id === opts.excludeReceiptId) continue
    if (isCounted(row) && sameClient(row, opts.clientId, opts.clientName)) signed -= receiptSettled(row)
  }

  const rounded = Math.round(signed * 100) / 100
  if (rounded < 0) return { amount: Math.abs(rounded), type: 'Cr' }
  return { amount: Math.abs(rounded), type: 'Dr' }
}

export type ReceiptLedgerSnapshot = {
  opening: ClientLedgerBalance
  received: number
  after: ClientLedgerBalance
}

export function receiptLedgerSnapshot(
  row: QuotationRow,
  openingFromMaster?: { amount: number; type: 'Dr' | 'Cr' },
): ReceiptLedgerSnapshot {
  const opening = computeClientSaleBalance({
    clientId: row.client_id ?? '',
    clientName: row.client_name ?? '',
    openingBalance: openingFromMaster?.amount ?? 0,
    openingType: openingFromMaster?.type === 'Cr' ? 'Cr' : 'Dr',
    excludeReceiptId: row.id,
  })
  const received = rowAmount(row)
  const signed =
    (opening.type === 'Cr' ? -opening.amount : opening.amount) - (isCounted(row) ? receiptSettled(row) : 0)
  const rounded = Math.round(signed * 100) / 100
  const after: ClientLedgerBalance =
    rounded < 0
      ? { amount: Math.abs(rounded), type: 'Cr' }
      : { amount: Math.abs(rounded), type: 'Dr' }
  return { opening, received, after }
}
