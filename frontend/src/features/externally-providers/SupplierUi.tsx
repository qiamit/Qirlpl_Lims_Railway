import { Link } from 'react-router-dom'
import { cn, formatDate } from '@/lib/utils'
import {
  APPROVED_SUPPLIERS_PATH,
  RECEIPT_INSPECTION_PATH,
  SUBCONTRACTING_PATH,
  SUPPLIER_EVALUATIONS_PATH,
  SUPPLIER_MIGRATION,
  SUPPLIER_STATUS_LABEL,
  SUPPLIER_STATUS_TONE,
  dueState,
  type SupplierStatus,
} from './supplierShared'

export function SupplierMissingNotice() {
  return (
    <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950" role="status">
      <p className="font-semibold">Database update pending.</p>
      <p className="mt-1 text-[13px]">
        Supplier management is not set up on this database yet. Ask the administrator to apply migration{' '}
        <code>{SUPPLIER_MIGRATION}</code>.
      </p>
    </div>
  )
}

export function SupplierStatusBadge({ value }: { value: SupplierStatus | null | undefined }) {
  if (!value) {
    return <span className="text-[12px] text-stone-500">—</span>
  }
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold', SUPPLIER_STATUS_TONE[value])}>
      {SUPPLIER_STATUS_LABEL[value]}
    </span>
  )
}

/** Date with an overdue / due-soon badge (accreditation expiry, next evaluation). */
export function DueBadge({
  date,
  label,
  soonDays = 30,
  overdueText,
}: {
  date: string | null | undefined
  label: string
  soonDays?: number
  /** Text for a past date (default "<label> overdue"). */
  overdueText?: string
}) {
  const state = dueState(date, soonDays)
  if (state === 'none') return <span className="text-[12px] text-stone-500">—</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="whitespace-nowrap text-[12px]">{formatDate(date)}</span>
      {state === 'overdue' ? (
        <span className="whitespace-nowrap border border-red-700/60 bg-red-100 px-1 py-0.5 text-[10px] font-bold uppercase text-red-800">
          {overdueText ?? `${label} overdue`}
        </span>
      ) : state === 'soon' ? (
        <span className="whitespace-nowrap border border-amber-600/60 bg-amber-100 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-900">
          {label} due soon
        </span>
      ) : null}
    </span>
  )
}

const LINKS = [
  { to: APPROVED_SUPPLIERS_PATH, label: 'Approved suppliers' },
  { to: SUPPLIER_EVALUATIONS_PATH, label: 'Evaluations' },
  { to: RECEIPT_INSPECTION_PATH, label: 'Receipt inspection' },
  { to: SUBCONTRACTING_PATH, label: 'Subcontracting' },
]

/** Small link row between the four supplier pages. */
export function SupplierNav({ current }: { current: string }) {
  return (
    <nav aria-label="Supplier management" className="flex flex-wrap gap-1.5">
      {LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          aria-current={l.to === current ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 items-center border px-3 text-[12px] font-semibold sm:min-h-8',
            l.to === current
              ? 'border-amber-700 bg-amber-700 text-white'
              : 'border-stone-500 bg-stone-50 text-stone-800 hover:bg-stone-100',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
