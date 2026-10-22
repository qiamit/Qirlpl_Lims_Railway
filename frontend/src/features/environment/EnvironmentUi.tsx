import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react'
import { limsDarkBarGlowStyle, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** Dark LIMS header bar with title, clause and actions; wraps on phones. */
export function EnvHeader({
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
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
              ISO/IEC 17025 · {clause}
            </p>
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
export function EnvPanel({
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

export function MissingMigrationNotice() {
  return (
    <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Environmental monitoring is not set up on this database yet.</p>
      <p className="mt-1 text-[13px]">
        Ask the administrator to apply migration <code>20261026100200_environmental_monitoring.sql</code>.
      </p>
    </div>
  )
}

export function MessageLine({ text, tone = 'info' }: { text: string | null; tone?: 'info' | 'error' | 'ok' }) {
  if (!text) return null
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'border px-3 py-2 text-[13px]',
        tone === 'error' && 'border-red-600/50 bg-red-50 text-red-900',
        tone === 'ok' && 'border-emerald-600/50 bg-emerald-50 text-emerald-900',
        tone === 'info' && 'border-stone-400 bg-stone-50 text-stone-800',
      )}
    >
      {text}
    </p>
  )
}

/** Within / outside limits badge. null = no limit applied. */
export function LimitBadge({ value, compact = false }: { value: boolean | null; compact?: boolean }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap border border-stone-400 bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-600">
        <MinusCircle className="h-3 w-3" /> {compact ? 'N/A' : 'No limit'}
      </span>
    )
  }
  return value ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap border border-emerald-700/40 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
      <CheckCircle2 className="h-3 w-3" /> {compact ? 'OK' : 'Within limits'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap border border-red-700/50 bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
      <AlertTriangle className="h-3 w-3" /> {compact ? 'OUT' : 'Out of limits'}
    </span>
  )
}

/** Native select styled like the LIMS fields; large enough to tap on phones. */
export function EnvSelect({
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
        'h-10 w-full min-w-0 rounded-none border border-stone-500 bg-stone-50 px-2 text-base text-foreground focus:border-amber-600 focus:bg-card focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50 sm:h-8 sm:text-sm',
        className,
      )}
    >
      {children}
    </select>
  )
}

/** Field wrapper with a small caps label. */
export function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Input classes: 16px text on phones (no iOS zoom), compact on desktop. */
export const envInputClass =
  'h-10 rounded-none border border-stone-500 bg-stone-50 text-base shadow-none focus-visible:border-amber-600 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-amber-500/20 sm:h-8 sm:text-sm'

export const envThClass =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200'
export const envTdClass = 'border border-[#e7e0d4] px-2 py-1.5 align-top text-[12.5px] text-[#292524]'
