/**
 * Tailwind classes of the ring editor in the LIMS stone / amber theme. They
 * replace the old dark chrome and the undefined `card-subtle` / `pill-neutral`
 * classes of the Metallurgy Software (design 3.8).
 */
import { cn } from '@/lib/utils'

/** Replaces the old `card-subtle`: a light bordered box for tool panels. */
export const ringCardClass = 'border border-stone-400 bg-[#fffcf7] p-2.5 text-stone-800 shadow-sm'

export const ringCardTitleClass = 'text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700'

export const ringSectionLabelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'

export const ringHintClass = 'text-[11px] leading-snug text-stone-500'

/** Small square button used inside the tool panels. */
export const ringSmallBtnClass =
  'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-none border border-stone-400 bg-stone-50 px-2 text-xs font-medium text-stone-800 hover:bg-amber-50 hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-40'

/** Wide action inside a tool panel (auto detect, auto draw). */
export const ringWideBtnClass =
  'inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-none border border-amber-600/70 bg-amber-50 px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40'

/** Remove / clear inside a tool panel. */
export const ringDangerBtnClass =
  'inline-flex h-8 items-center justify-center gap-1 rounded-none border border-red-600/50 bg-red-50 px-2.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40'

export function ringToolBtnClass(active: boolean): string {
  return cn(
    'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none border px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
    active
      ? 'border-amber-700 bg-amber-100 text-amber-950 ring-1 ring-amber-600/40'
      : 'border-stone-400 bg-stone-50 text-stone-800 hover:bg-amber-50 hover:text-amber-900',
  )
}

export function ringChoiceBtnClass(active: boolean): string {
  return cn(
    'inline-flex h-8 items-center justify-center rounded-none border px-2 text-xs',
    active
      ? 'border-amber-700 bg-amber-100 font-semibold text-amber-950'
      : 'border-stone-400 bg-stone-50 text-stone-700 hover:bg-amber-50',
  )
}

export type RingVerdict = 'pass' | 'fail' | 'pending'

/** Replaces the old pill-pass / pill-fail / pill-neutral. */
export function ringVerdictPillClass(v: RingVerdict): string {
  return cn(
    'inline-flex items-center gap-1 whitespace-nowrap border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
    v === 'pass' && 'border-emerald-700/50 bg-emerald-100 text-emerald-800',
    v === 'fail' && 'border-red-700/50 bg-red-100 text-red-800',
    v === 'pending' && 'border-stone-400 bg-stone-100 text-stone-600',
  )
}

export const ringInputClass =
  'h-8 w-full min-w-0 rounded-none border border-stone-500 bg-stone-50 px-2 text-sm text-foreground focus-visible:border-amber-600 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20 disabled:opacity-50'
