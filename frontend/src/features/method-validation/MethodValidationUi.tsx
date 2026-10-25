import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, MinusCircle, ShieldAlert, XCircle } from 'lucide-react'
import { limsDarkBarGlowStyle, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  COVERAGE_LABEL,
  METHOD_VALIDATION_MIGRATION,
  STANDARD_STATUS_LABEL,
  STATUS_LABEL,
  fmtDate,
  reviewState,
  type MvStatus,
  type ScopeCoverage,
  type ScopeVerificationRow,
  type StandardStatus,
} from './methodValidation'

const badgeBase =
  'inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold leading-tight'

/** Dark LIMS header bar with title, clause and actions; wraps on phones. */
export function MvHeader({
  title,
  clause,
  subtitle,
  actions,
}: {
  title: string
  clause: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className={limsPanelClass}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">ISO/IEC 17025 · {clause}</p>
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
            {subtitle ? <p className="text-[11px] text-stone-300">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

/** Panel with a small dark caption bar. */
export function MvPanel({
  title,
  right,
  children,
  className,
}: {
  title: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn(limsPanelClass, className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-stone-500 bg-stone-800 px-3 py-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">{title}</h2>
        {right}
      </div>
      <div className="bg-[#fffcf7] p-2 sm:p-3">{children}</div>
    </section>
  )
}

export function MvMissingMigrationNotice() {
  return (
    <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Method verification / validation is not set up on this database yet.</p>
      <p className="mt-1 text-[13px]">
        Ask the administrator to apply migration <code>{METHOD_VALIDATION_MIGRATION}</code>.
      </p>
    </div>
  )
}

export function MvMessage({ text, tone = 'info' }: { text: string | null; tone?: 'info' | 'error' | 'ok' }) {
  if (!text) return null
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'whitespace-pre-line border px-3 py-2 text-[13px]',
        tone === 'error' && 'border-red-600/50 bg-red-50 text-red-900',
        tone === 'ok' && 'border-emerald-600/50 bg-emerald-50 text-emerald-900',
        tone === 'info' && 'border-stone-400 bg-stone-50 text-stone-800',
      )}
    >
      {text}
    </p>
  )
}

/** Field wrapper with a small caps label. */
export function MvField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Native select styled like the LIMS fields; large enough to tap on phones. */
export function MvSelect({
  value,
  onChange,
  children,
  className,
  id,
  ariaLabel,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  className?: string
  id?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-10 w-full min-w-0 rounded-none border border-stone-500 bg-stone-50 px-2 text-base text-foreground focus:border-amber-600 focus:bg-card focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60 sm:h-8 sm:text-sm',
        className,
      )}
    >
      {children}
    </select>
  )
}

export function MvStatusBadge({ status }: { status: MvStatus }) {
  const tone =
    status === 'approved'
      ? 'border-emerald-700/40 bg-emerald-100 text-emerald-800'
      : status === 'under_review'
        ? 'border-amber-700/50 bg-amber-100 text-amber-900'
        : status === 'superseded'
          ? 'border-stone-400 bg-stone-200 text-stone-600'
          : 'border-sky-700/40 bg-sky-50 text-sky-900'
  return <span className={cn(badgeBase, tone)}>{STATUS_LABEL[status] ?? status}</span>
}

export function PassBadge({ pass }: { pass: boolean | null }) {
  if (pass === null) {
    return (
      <span className={cn(badgeBase, 'border-stone-400 bg-stone-100 text-stone-600')}>
        <MinusCircle className="h-3 w-3" /> —
      </span>
    )
  }
  return pass ? (
    <span className={cn(badgeBase, 'border-emerald-700/40 bg-emerald-100 text-emerald-800')}>
      <CheckCircle2 className="h-3 w-3" /> Pass
    </span>
  ) : (
    <span className={cn(badgeBase, 'border-red-700/50 bg-red-100 text-red-800')}>
      <XCircle className="h-3 w-3" /> Fail
    </span>
  )
}

export function CoverageBadge({ coverage, title }: { coverage: ScopeCoverage; title?: string }) {
  const map: Record<ScopeCoverage, { cls: string; icon: ReactNode }> = {
    verified: { cls: 'border-emerald-700/40 bg-emerald-100 text-emerald-800', icon: <CheckCircle2 className="h-3 w-3" /> },
    expired: { cls: 'border-amber-700/50 bg-amber-100 text-amber-900', icon: <Clock className="h-3 w-3" /> },
    not_fit: { cls: 'border-red-700/50 bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" /> },
    missing: { cls: 'border-red-700/50 bg-red-50 text-red-800', icon: <AlertTriangle className="h-3 w-3" /> },
  }
  const m = map[coverage] ?? map.missing
  return (
    <span className={cn(badgeBase, m.cls)} title={title}>
      {m.icon} {COVERAGE_LABEL[coverage] ?? coverage}
    </span>
  )
}

/**
 * Warning badge for a NABL scope row (testing or calibration) without an
 * approved method verification / validation. Renders nothing when the row is
 * covered or when the status is unknown (migration not applied).
 */
export function ScopeVerificationWarning({ entry }: { entry: ScopeVerificationRow | null | undefined }) {
  if (!entry || entry.coverage === 'verified') return null
  const text =
    entry.coverage === 'missing'
      ? entry.pending_record_no
        ? `Method not verified (${entry.pending_record_no} pending)`
        : 'Method not verified'
      : entry.coverage === 'expired'
        ? `Verification expired ${fmtDate(entry.valid_until)}`
        : 'Method not fit'
  return (
    <span
      className={cn(badgeBase, 'mt-0.5 max-w-full whitespace-normal border-amber-700/60 bg-amber-100 text-amber-900')}
      title={entry.message ?? 'ISO/IEC 17025 7.2.1.5 / 7.2.2'}
    >
      <ShieldAlert className="h-3 w-3 shrink-0" /> {text}
    </span>
  )
}

/** IS code edition status / review due badge (7.2.1.4). Nothing when current and not due. */
export function IsCodeReviewBadge({
  standardStatus,
  nextReviewDue,
  supersededBy,
}: {
  standardStatus?: string | null
  nextReviewDue?: string | null
  supersededBy?: string | null
}) {
  const st = (standardStatus ?? 'current') as StandardStatus
  const review = reviewState(nextReviewDue)
  const items: ReactNode[] = []
  if (st && st !== 'current') {
    items.push(
      <span
        key="st"
        className={cn(
          badgeBase,
          st === 'under_review' ? 'border-amber-700/50 bg-amber-100 text-amber-900' : 'border-red-700/50 bg-red-100 text-red-800',
        )}
        title={supersededBy ? `Superseded by ${supersededBy}` : undefined}
      >
        {STANDARD_STATUS_LABEL[st] ?? st}
        {supersededBy && st === 'superseded' ? ` → ${supersededBy}` : ''}
      </span>,
    )
  }
  if (review === 'overdue' || review === 'due_soon') {
    items.push(
      <span
        key="rv"
        className={cn(
          badgeBase,
          review === 'overdue' ? 'border-red-700/50 bg-red-100 text-red-800' : 'border-amber-700/50 bg-amber-100 text-amber-900',
        )}
        title="Check that this is still the latest valid edition (ISO/IEC 17025 7.2.1.4)"
      >
        <Clock className="h-3 w-3" /> {review === 'overdue' ? 'Review overdue' : 'Review due'} {fmtDate(nextReviewDue)}
      </span>,
    )
  }
  if (items.length === 0) return null
  return <span className="inline-flex flex-wrap items-center justify-center gap-1">{items}</span>
}
