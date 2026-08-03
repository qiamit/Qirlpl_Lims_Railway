/** Finance Management · Sale · Quotation types */

export type QuotationStatus =
  | 'Draft'
  | 'Sent'
  | 'Accepted'
  | 'Rejected'
  | 'Expired'
  | 'Converted'

export const QUOTATION_STATUSES: QuotationStatus[] = [
  'Draft',
  'Sent',
  'Accepted',
  'Rejected',
  'Expired',
  'Converted',
]

export type QuotationLineRow = {
  id: string
  quotation_id: string
  line_no: number
  description: string
  hsn_sac: string | null
  quantity: number
  unit: string
  rate: number
  amount: number
}

export type QuotationRow = {
  id: string
  quotation_number: string
  quotation_date: string
  valid_until: string | null
  client_id: string | null
  client_name: string
  contact_person: string | null
  contact_email: string | null
  contact_mobile: string | null
  subject: string | null
  reference_no: string | null
  status: QuotationStatus
  payment_terms: string | null
  remarks: string | null
  discount_percent: number
  discount_amount: number
  gst_percent: number
  gst_amount: number
  subtotal: number
  grand_total: number
  created_at?: string
  updated_at?: string
  line_items?: QuotationLineRow[]
}

export type QuotationLineForm = {
  key: string
  description: string
  hsnSac: string
  quantity: string
  unit: string
  rate: string
}

export type QuotationForm = {
  quotationNumber: string
  quotationDate: string
  validUntil: string
  clientId: string
  clientName: string
  contactPerson: string
  contactEmail: string
  contactMobile: string
  subject: string
  referenceNo: string
  status: QuotationStatus
  paymentTerms: string
  remarks: string
  discountPercent: string
  gstPercent: string
  lines: QuotationLineForm[]
}

export function todayIsoDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function defaultValidUntil(fromDate = todayIsoDate()): string {
  const d = new Date(`${fromDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return todayIsoDate()
  d.setDate(d.getDate() + 30)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function newLineKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyQuotationLine(): QuotationLineForm {
  return {
    key: newLineKey(),
    description: '',
    hsnSac: '',
    quantity: '1',
    unit: 'Nos',
    rate: '0',
  }
}

export function emptyQuotationForm(nextNumber = ''): QuotationForm {
  const quotationDate = todayIsoDate()
  return {
    quotationNumber: nextNumber,
    quotationDate,
    validUntil: defaultValidUntil(quotationDate),
    clientId: '',
    clientName: '',
    contactPerson: '',
    contactEmail: '',
    contactMobile: '',
    subject: '',
    referenceNo: '',
    status: 'Draft',
    paymentTerms: '100 % Advance',
    remarks: '',
    discountPercent: '0',
    gstPercent: '18',
    lines: [emptyQuotationLine()],
  }
}

export function parseMoney(value: string): number {
  const n = Number.parseFloat(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

export function lineAmount(line: QuotationLineForm): number {
  const qty = parseMoney(line.quantity)
  const rate = parseMoney(line.rate)
  return Math.round(qty * rate * 100) / 100
}

export function computeQuotationTotals(form: QuotationForm): {
  subtotal: number
  discountAmount: number
  gstAmount: number
  grandTotal: number
} {
  const subtotal = form.lines.reduce((sum, line) => sum + lineAmount(line), 0)
  const discountPercent = parseMoney(form.discountPercent)
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100
  const taxable = Math.max(0, subtotal - discountAmount)
  const gstPercent = parseMoney(form.gstPercent)
  const gstAmount = Math.round(taxable * (gstPercent / 100) * 100) / 100
  const grandTotal = Math.round((taxable + gstAmount) * 100) / 100
  return { subtotal, discountAmount, gstAmount, grandTotal }
}

export function formatMoney(value: number | null | undefined): string {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = value.slice(0, 10)
  return d || '—'
}

/** Next quotation number: QTN-YYYY-0001 */
export function nextQuotationNumber(existingNumbers: string[]): string {
  const year = new Date().getFullYear()
  const prefix = `QTN-${year}-`
  let max = 0
  for (const n of existingNumbers) {
    if (!n.startsWith(prefix)) continue
    const suffix = Number.parseInt(n.slice(prefix.length), 10)
    if (Number.isFinite(suffix) && suffix > max) max = suffix
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function rowToForm(row: QuotationRow, asCopy = false, nextNumber = ''): QuotationForm {
  const lines =
    row.line_items && row.line_items.length > 0
      ? row.line_items
          .slice()
          .sort((a, b) => a.line_no - b.line_no)
          .map((l) => ({
            key: newLineKey(),
            description: l.description ?? '',
            hsnSac: l.hsn_sac ?? '',
            quantity: String(l.quantity ?? 1),
            unit: l.unit || 'Nos',
            rate: String(l.rate ?? 0),
          }))
      : [emptyQuotationLine()]

  return {
    quotationNumber: asCopy ? nextNumber : row.quotation_number,
    quotationDate: (row.quotation_date ?? todayIsoDate()).slice(0, 10),
    validUntil: row.valid_until ? row.valid_until.slice(0, 10) : '',
    clientId: row.client_id ?? '',
    clientName: row.client_name ?? '',
    contactPerson: row.contact_person ?? '',
    contactEmail: row.contact_email ?? '',
    contactMobile: row.contact_mobile ?? '',
    subject: row.subject ?? '',
    referenceNo: row.reference_no ?? '',
    status: asCopy ? 'Draft' : row.status,
    paymentTerms: row.payment_terms ?? '100 % Advance',
    remarks: row.remarks ?? '',
    discountPercent: String(row.discount_percent ?? 0),
    gstPercent: String(row.gst_percent ?? 18),
    lines,
  }
}
