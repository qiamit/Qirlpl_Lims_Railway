/**
 * Externally provided products and services (ISO/IEC 17025 6.6).
 * Types and pure helpers shared by the supplier pages.
 * Tables: migration 20261028100300_supplier_management.sql.
 */
import { csvCell } from '@/lib/csv'

export const SUPPLIER_MIGRATION = '20261028100300_supplier_management.sql'

/** Proposed routes (wired in App / routeElements by the integrator). */
export const APPROVED_SUPPLIERS_PATH = '/externally-providers/approved-suppliers'
export const SUPPLIER_EVALUATIONS_PATH = '/externally-providers/evaluations'
export const RECEIPT_INSPECTION_PATH = '/externally-providers/receipt-inspection'
export const SUBCONTRACTING_PATH = '/externally-providers/subcontracting'

export type SupplierCategory =
  | 'calibration_lab'
  | 'crm_supplier'
  | 'pt_provider'
  | 'consumables'
  | 'subcontract_lab'
  | 'it_hosting'
  | 'ai_provider'
  | 'equipment'
  | 'service'
  | 'other'

export type SupplierStatus = 'approved' | 'conditional' | 'suspended' | 'not_approved'
export type ReceiptItemType = 'consumable' | 'crm' | 'equipment' | 'reagent' | 'other'
export type CheckResult = 'pass' | 'fail' | 'na'

export const SUPPLIER_CATEGORIES: readonly SupplierCategory[] = [
  'calibration_lab',
  'crm_supplier',
  'pt_provider',
  'consumables',
  'subcontract_lab',
  'it_hosting',
  'ai_provider',
  'equipment',
  'service',
  'other',
]

export const SUPPLIER_CATEGORY_LABEL: Record<SupplierCategory, string> = {
  calibration_lab: 'Calibration laboratory',
  crm_supplier: 'CRM / reference material',
  pt_provider: 'PT provider',
  consumables: 'Consumables',
  subcontract_lab: 'Subcontract laboratory',
  it_hosting: 'IT / hosting',
  ai_provider: 'AI provider',
  equipment: 'Equipment',
  service: 'Service',
  other: 'Other',
}

/** Categories whose providers are expected to hold an accreditation. */
export const ACCREDITED_CATEGORIES: ReadonlySet<SupplierCategory> = new Set([
  'calibration_lab',
  'crm_supplier',
  'pt_provider',
  'subcontract_lab',
])

export const SUPPLIER_STATUSES: readonly SupplierStatus[] = ['approved', 'conditional', 'suspended', 'not_approved']

export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = {
  approved: 'Approved',
  conditional: 'Conditional',
  suspended: 'Suspended',
  not_approved: 'Not approved',
}

export const SUPPLIER_STATUS_TONE: Record<SupplierStatus, string> = {
  approved: 'border-emerald-700/50 bg-emerald-100 text-emerald-900',
  conditional: 'border-amber-600/60 bg-amber-100 text-amber-900',
  suspended: 'border-red-700/60 bg-red-100 text-red-900',
  not_approved: 'border-stone-400 bg-stone-100 text-stone-700',
}

export const RECEIPT_ITEM_LABEL: Record<ReceiptItemType, string> = {
  consumable: 'Consumable',
  crm: 'CRM / reference material',
  equipment: 'Equipment',
  reagent: 'Reagent / chemical',
  other: 'Other',
}

/** Default receipt checks per item type (editable per record). */
export const RECEIPT_CHECK_TEMPLATES: Record<ReceiptItemType, string[]> = {
  consumable: ['Matches purchase order / specification', 'Packaging intact', 'Quantity correct'],
  crm: [
    'Matches purchase order / specification',
    'Certificate of analysis received (values, uncertainty, traceability)',
    'Packaging and seal intact',
    'Expiry / shelf life acceptable',
    'Storage condition on arrival correct',
  ],
  equipment: [
    'Matches purchase order / specification',
    'No visible damage',
    'Calibration certificate received',
    'Manuals and accessories complete',
    'Installation / functional check done',
  ],
  reagent: [
    'Matches purchase order / grade',
    'Certificate of analysis / SDS received',
    'Container and seal intact',
    'Expiry acceptable',
  ],
  other: ['Matches purchase order / specification', 'Condition acceptable'],
}

export type CriteriaTemplateItem = { criterion: string; weight: number }
export type EvaluationCriterion = { criterion: string; weight: number; score: number | null }
export type ReceiptCheck = { check: string; result: CheckResult; note?: string }

export type CriteriaTemplate = {
  category: SupplierCategory
  criteria: CriteriaTemplateItem[]
  pass_score: number
  conditional_score: number
}

export type SupplierApproval = {
  id: string
  client_id: string
  category: SupplierCategory
  scope: string | null
  accreditation_body: string | null
  accreditation_no: string | null
  accreditation_valid_until: string | null
  approved: boolean
  approved_by: string | null
  approved_on: string | null
  evaluation_interval_months: number
  next_evaluation_due: string | null
  last_evaluated_on: string | null
  last_score: number | null
  status: SupplierStatus
  remarks: string | null
  created_at: string
  updated_at?: string
}

export type SupplierEvaluation = {
  id: string
  approval_id: string
  evaluated_on: string
  period: string | null
  criteria: EvaluationCriterion[]
  total_score: number | null
  decision: SupplierStatus | null
  evaluated_by: string | null
  remarks: string | null
  created_at: string
}

export type ReceiptInspection = {
  id: string
  supplier_id: string
  item_type: ReceiptItemType
  item_description: string
  po_or_invoice_ref: string | null
  received_on: string
  quantity: number | null
  unit: string | null
  batch_lot: string | null
  expiry_date: string | null
  certificate_ref: string | null
  checks: ReceiptCheck[]
  accepted: boolean | null
  supplier_approved_at_receipt: boolean | null
  inspected_by: string | null
  remarks: string | null
  created_at: string
}

export type SubcontractEntry = {
  id: string
  work_description: string
  sample_or_srf_ref: string | null
  customer_id: string | null
  subcontract_lab_id: string
  customer_consent: boolean
  consent_ref: string | null
  consent_on: string | null
  sent_on: string | null
  lab_approved_at_send: boolean | null
  report_received_on: string | null
  report_ref: string | null
  remarks: string | null
  created_at: string
}

export type ClientOption = { id: string; company_name: string; company_type: string | null }

/** True when the supplier tables are not on this database yet. */
export function isSupplierMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    /(supplier_approvals|supplier_evaluations|supplier_criteria_templates|receipt_inspections|subcontracting_register)/.test(msg) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

export function supplierErrorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unknown error'
}

export function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Whole days from today to an ISO date (negative = past). */
export function daysUntil(iso: string | null | undefined, today = todayIso()): number | null {
  if (!iso) return null
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((a - b) / 86_400_000)
}

export type DueState = 'none' | 'ok' | 'soon' | 'overdue'

/** Expiry / due date state: overdue when past, soon within `soonDays`. */
export function dueState(iso: string | null | undefined, soonDays = 30, today = todayIso()): DueState {
  const d = daysUntil(iso, today)
  if (d === null) return 'none'
  if (d < 0) return 'overdue'
  if (d <= soonDays) return 'soon'
  return 'ok'
}

/** Same formula as public.app_supplier_score: weighted percent of the maximum (all 5s = 100). */
export function computeScore(criteria: readonly EvaluationCriterion[]): number | null {
  let sum = 0
  let wsum = 0
  for (const c of criteria) {
    if (!c.criterion.trim() || !(c.weight > 0) || c.score === null) return null
    sum += c.weight * c.score
    wsum += c.weight
  }
  if (wsum === 0) return null
  return Math.round((1000 * sum) / (5 * wsum)) / 10
}

/** Decision the database fills when none is chosen. */
export function suggestedDecision(score: number | null, template: CriteriaTemplate | undefined): SupplierStatus | null {
  if (score === null) return null
  const pass = template?.pass_score ?? 70
  const cond = template?.conditional_score ?? 50
  if (score >= pass) return 'approved'
  if (score >= cond) return 'conditional'
  return 'not_approved'
}

export function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function canManageSuppliers(designation: string, departmentName: string, isDirector: boolean): boolean {
  const des = designation.trim().toLowerCase()
  return (
    isDirector ||
    des === 'technical manager' ||
    (des === 'quality manager' && departmentName.trim().toLowerCase() === 'quality assurance')
  )
}
