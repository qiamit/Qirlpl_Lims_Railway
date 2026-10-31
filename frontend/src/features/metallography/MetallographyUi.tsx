import type { ReactNode } from 'react'
import { Clock, DatabaseZap, FlaskConical, Loader2, PowerOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ANALYSIS_STATUS_LABEL,
  CALIBRATION_STATUS_LABEL,
  COMING_LATER_TEXT,
  METALLOGRAPHY_MIGRATION,
  METALLOGRAPHY_OFF_TITLE,
  type AnalysisStatus,
  type CalibrationStatus,
  type MetallographySwitch,
} from './types'

/** Shown while migration 20261102101700 is not applied (any read returned 'missing'). */
export function MetallographyMissingNotice() {
  return (
    <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-semibold">
        <DatabaseZap className="h-4 w-4 shrink-0" /> Metallography is not set up on this database yet.
      </p>
      <p className="mt-1 text-[13px]">
        Ask the administrator to apply migration <code>{METALLOGRAPHY_MIGRATION}</code>. The Laboratory Director can
        then switch the module on in Method Setup → Module settings.
      </p>
    </div>
  )
}

/** "Metallography is not in use" banner (module switched off). */
export function MetallographyOffNotice() {
  return (
    <div className="border-2 border-amber-600 bg-amber-50 p-3 text-amber-950">
      <p className="flex items-center gap-2 font-semibold">
        <PowerOff className="h-4 w-4 shrink-0" /> {METALLOGRAPHY_OFF_TITLE}
      </p>
      <p className="mt-1 text-[13px]">
        The Laboratory Director can switch it on in Method Setup → Module settings.
      </p>
    </div>
  )
}

/**
 * Renders children only when the module is on (pattern of SamplingGate).
 * 'missing' shows MetallographyMissingNotice; 'off' shows the off banner, and
 * with allowWhenOff (Director on Method Setup) the page below it as well.
 */
export function MetallographyGate({
  state,
  allowWhenOff = false,
  children,
}: {
  state: MetallographySwitch | null
  allowWhenOff?: boolean
  children: ReactNode
}) {
  if (state === null) {
    return (
      <p className="flex items-center gap-2 p-3 text-[13px] text-stone-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking metallography settings…
      </p>
    )
  }
  if (state === 'on') return <>{children}</>
  if (state === 'missing') return <MetallographyMissingNotice />
  if (allowWhenOff) {
    return (
      <div className="space-y-3">
        <MetallographyOffNotice />
        {children}
      </div>
    )
  }
  return <MetallographyOffNotice />
}

const badgeBase = 'inline-block whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold'

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  return (
    <span
      className={cn(
        badgeBase,
        status === 'completed' && 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
        status === 'in_progress' && 'border-sky-700/40 bg-sky-100 text-sky-900',
        status === 'superseded' && 'border-stone-400 bg-stone-200 text-stone-700',
        status === 'void' && 'border-red-700/50 bg-red-100 text-red-800 line-through',
      )}
    >
      {ANALYSIS_STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function CalibrationStatusBadge({ status }: { status: CalibrationStatus }) {
  return (
    <span
      className={cn(
        badgeBase,
        status === 'verified' && 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
        status === 'draft' && 'border-amber-700/50 bg-amber-100 text-amber-900',
        status === 'withdrawn' && 'border-stone-400 bg-stone-200 text-stone-700',
      )}
    >
      {CALIBRATION_STATUS_LABEL[status] ?? status}
    </span>
  )
}

/** Amber "Indicative" badge (method not yet validated). */
export function IndicativeBadge() {
  return (
    <span
      className={cn(badgeBase, 'inline-flex items-center gap-1 border-amber-700/50 bg-amber-100 text-amber-900')}
      title="The method is not yet validated: the result is indicative and Non NABL."
    >
      <FlaskConical className="h-3 w-3" /> Indicative
    </span>
  )
}

/** "Coming later" chip for kinds not in AVAILABLE_ANALYSIS_KINDS. */
export function ComingLaterChip() {
  return (
    <span className={cn(badgeBase, 'inline-flex items-center gap-1 border-stone-400 bg-stone-100 font-semibold text-stone-600')}>
      <Clock className="h-3 w-3" /> {COMING_LATER_TEXT}
    </span>
  )
}
