import { cn } from '@/lib/utils'
import { PT_MIGRATION, PT_PERFORMANCE_LABEL, performanceTone, type PtPerformance } from './ptShared'

export function PtMissingNotice() {
  return (
    <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Proficiency testing is not set up on this database yet.</p>
      <p className="mt-1 text-[13px]">
        Ask the administrator to apply migration <code>{PT_MIGRATION}</code>.
      </p>
    </div>
  )
}

export function PerformanceBadge({ value, compact = false }: { value: PtPerformance | null; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold',
        performanceTone(value),
      )}
    >
      {value ? (compact ? PT_PERFORMANCE_LABEL[value].slice(0, 1) : PT_PERFORMANCE_LABEL[value]) : compact ? '—' : 'Pending'}
    </span>
  )
}
