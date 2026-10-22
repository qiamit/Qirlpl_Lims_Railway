import { cn } from '@/lib/utils'

/**
 * Archive state of an issued report row.
 *  - archived: an archive row exists for the current issue (not hashed yet)
 *  - verified: archive row's snapshot matched its SHA-256 on the last check / print
 *  - failed: archive row did not match its SHA-256
 *  - none: no archive row (issued before the archive, or archive not deployed)
 */
export type IssuedReportArchiveStatus = 'archived' | 'verified' | 'failed' | 'none' | 'checking'

const badgeBase =
  'mt-1 inline-flex items-center whitespace-nowrap border px-1.5 py-px text-[10px] font-medium leading-tight'

export function IssuedReportArchiveBadge({
  status,
  disabled,
  onVerify,
}: {
  status: IssuedReportArchiveStatus | undefined
  disabled?: boolean
  onVerify: () => void
}) {
  if (!status) return null
  if (status === 'verified') {
    return (
      <span
        className={cn(badgeBase, 'border-emerald-300 bg-emerald-50 text-emerald-800')}
        title="Archived issued copy matched its SHA-256 fingerprint. Re-prints use this copy."
      >
        Archived ✓
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span
        className={cn(badgeBase, 'border-red-300 bg-red-50 text-red-800')}
        title="Archived copy failed its integrity check. Re-prints from current records are marked NOT THE ISSUED COPY."
      >
        Integrity failed
      </span>
    )
  }
  if (status === 'none') {
    return (
      <span
        className={cn(badgeBase, 'border-stone-300 bg-stone-50 text-stone-500')}
        title="No archived issued copy. Re-prints are regenerated from current records."
      >
        No archive
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cn(
        badgeBase,
        'border-stone-300 bg-white text-stone-600 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60',
      )}
      disabled={disabled || status === 'checking'}
      title="Archived issued copy on file. Click to verify its SHA-256 fingerprint (also checked on every print)."
      onClick={onVerify}
    >
      {status === 'checking' ? 'Verifying…' : 'Archived – verify'}
    </button>
  )
}
