import type { ReactNode } from 'react'
import { Loader2, PowerOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PLAN_STATUS_LABEL,
  SAMPLING_EXCLUSION_TEXT,
  SAMPLING_OFF_TITLE,
  type SamplingPlanStatus,
  type SamplingSwitch,
} from './shared'

/** Quality Manual exclusion, shown as guidance while sampling is off. */
export function SamplingExclusionGuidance() {
  return (
    <div className="border border-stone-400 bg-[#fffcf7] p-3 text-[13px] text-stone-800">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600">Quality Manual — exclusion</p>
      <p className="mt-1">{SAMPLING_EXCLUSION_TEXT}</p>
    </div>
  )
}

/**
 * Renders the page body only when sampling is switched on in Lab Settings.
 * Otherwise shows "Sampling is not in use" and the Quality Manual exclusion.
 */
export function SamplingGate({ state, children }: { state: SamplingSwitch | null; children: ReactNode }) {
  if (state === null) {
    return (
      <p className="flex items-center gap-2 p-3 text-[13px] text-stone-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking Lab Settings…
      </p>
    )
  }
  if (state === 'on') return <>{children}</>
  return (
    <div className="space-y-3">
      <div className="border-2 border-amber-600 bg-amber-50 p-3 text-amber-950">
        <p className="flex items-center gap-2 font-semibold">
          <PowerOff className="h-4 w-4 shrink-0" /> {SAMPLING_OFF_TITLE}
        </p>
        <p className="mt-1 text-[13px]">
          {state === 'missing' ? (
            <>
              The sampling module is not set up on this database yet. Ask the administrator to apply migration{' '}
              <code>20261101100200_sampling.sql</code>; the Laboratory Director can then switch on "Sampling module in
              use" under Lab Settings → Settings.
            </>
          ) : (
            <>
              The Laboratory Director can switch on "Sampling module in use" under Lab Settings → Settings when the
              laboratory starts sampling. Until then nothing about sampling is recorded or printed on test reports.
            </>
          )}
        </p>
      </div>
      <SamplingExclusionGuidance />
    </div>
  )
}

export function PlanStatusBadge({ status }: { status: SamplingPlanStatus }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold',
        status === 'approved' && 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
        status === 'draft' && 'border-amber-700/50 bg-amber-100 text-amber-900',
        (status === 'superseded' || status === 'withdrawn') && 'border-stone-400 bg-stone-200 text-stone-700',
      )}
    >
      {PLAN_STATUS_LABEL[status] ?? status}
    </span>
  )
}
