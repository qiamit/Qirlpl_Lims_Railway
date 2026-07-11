import { cn } from '@/lib/utils'
import { retentionStatusLabel, type SampleRetentionStatus } from './sampleRetention'

export function RetentionStatusBadge({ status }: { status: SampleRetentionStatus }) {
  const label = retentionStatusLabel(status)
  const className =
    status === 'retained'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'due'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : status === 'returned'
          ? 'bg-sky-50 text-sky-700 border-sky-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap',
        className,
      )}
    >
      {label}
    </span>
  )
}
