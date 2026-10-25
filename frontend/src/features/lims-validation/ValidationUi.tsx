import type { ReactNode } from 'react'
import { GitCommitHorizontal } from 'lucide-react'
import { appVersionLabel, APP_BUILT_AT } from '@/lib/appVersion'
import { limsDarkBarGlowStyle, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { VALIDATION_MIGRATION } from './validationShared'

/** Dark LIMS header bar with clause, title, running app version and actions. */
export function RegisterHeader({
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
          <div className="flex flex-wrap items-center gap-1.5">
            <AppVersionChip />
            {actions}
          </div>
        </div>
      </div>
    </div>
  )
}

/** "Running version a46340b" chip (build id of this bundle). */
export function AppVersionChip({ className }: { className?: string }) {
  const built = APP_BUILT_AT ? new Date(APP_BUILT_AT) : null
  return (
    <span
      title={built ? `Built ${built.toLocaleString()}` : 'Development build'}
      className={cn(
        'inline-flex h-8 items-center gap-1 border border-amber-500/40 bg-stone-800/80 px-2 font-mono text-[11px] text-amber-100',
        className,
      )}
    >
      <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden font-sans text-[10px] uppercase tracking-wide text-stone-300 sm:inline">Version</span>
      {appVersionLabel()}
    </span>
  )
}

/** Panel with a small dark caption bar. */
export function RegisterPanel({
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

export function MissingRegistersNotice() {
  return (
    <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">The LIMS validation registers are not set up on this database yet.</p>
      <p className="mt-1 text-[13px]">
        Ask the administrator to apply migration <code>{VALIDATION_MIGRATION}</code>.
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

/** Native select styled like the LIMS fields; large enough to tap on phones. */
export function NativeSelect({
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
export function Field({
  label,
  htmlFor,
  children,
  className,
  hint,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
  hint?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-stone-500">{hint}</p> : null}
    </div>
  )
}

const TONES = {
  green: 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
  red: 'border-red-700/50 bg-red-100 text-red-800',
  amber: 'border-amber-700/50 bg-amber-100 text-amber-900',
  blue: 'border-sky-700/40 bg-sky-100 text-sky-900',
  grey: 'border-stone-400 bg-stone-100 text-stone-700',
} as const

export type ChipTone = keyof typeof TONES

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold', TONES[tone])}>
      {children}
    </span>
  )
}

/** Small label / value line used on the phone cards. */
export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="text-[12px] text-stone-700">
      <span className="font-semibold text-stone-500">{label}: </span>
      {value}
    </p>
  )
}
