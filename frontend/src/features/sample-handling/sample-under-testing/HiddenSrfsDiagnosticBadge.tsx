import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Info } from 'lucide-react'
import { limsDarkBarBtnClass, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  diagnosticReasonLabel,
  partitionDiagnosticEntries,
  type HiddenSrfDiagnosticEntry,
  type SampleUnderTestingLoadDiagnostics,
} from './sampleUnderTestingDiagnostics'

function formatStage(stage: string | null): string {
  if (!stage?.trim()) return '—'
  return stage
    .trim()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function DiagnosticEntryList({
  entries,
  variant,
}: {
  entries: HiddenSrfDiagnosticEntry[]
  variant: 'hidden' | 'notice'
}) {
  if (entries.length === 0) return null

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li
          key={entry.sampleId}
          className={
            variant === 'hidden'
              ? 'rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/20'
              : 'rounded-lg border border-sky-200/80 bg-sky-50/40 px-3 py-2.5 dark:border-sky-900/50 dark:bg-sky-950/20'
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{entry.srfNumber}</span>
            <Badge variant="outline" className="h-5 text-[10px] font-normal">
              {formatStage(entry.stage)}
            </Badge>
            {entry.sectionCodes.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {entry.sectionCodes.length} section{entry.sectionCodes.length === 1 ? '' : 's'}
                {entry.sectionCodes.length <= 3 ? ` · ${entry.sectionCodes.join(', ')}` : ''}
              </span>
            ) : null}
          </div>
          <ul className="mt-1.5 space-y-1">
            {entry.reasons.map((reason) => (
              <li key={reason} className="text-xs text-muted-foreground leading-snug">
                {diagnosticReasonLabel(reason)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export function HiddenSrfsDiagnosticBadge({
  diagnostics,
  loading,
}: {
  diagnostics: SampleUnderTestingLoadDiagnostics | null
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)

  const { hidden, notices, summary } = useMemo(() => {
    if (!diagnostics) {
      return { hidden: [], notices: [], summary: null as string | null }
    }
    const partitioned = partitionDiagnosticEntries(diagnostics.entries)
    const hiddenCount = partitioned.hidden.length
    const noticeCount = partitioned.notices.length
    const parts: string[] = []
    if (hiddenCount > 0) parts.push(`${hiddenCount} hidden`)
    if (noticeCount > 0) parts.push(`${noticeCount} notice${noticeCount === 1 ? '' : 's'}`)
    const summaryText = parts.length > 0 ? parts.join(' · ') : null
    return { ...partitioned, summary: summaryText }
  }, [diagnostics])

  if (loading || !diagnostics || !summary) return null

  const mismatch =
    diagnostics.totalSentSrfs > diagnostics.visibleSrfsAfterVisibility + hidden.length

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(limsDarkBarBtnClass, 'h-8 gap-1.5')}
        onClick={() => setOpen(true)}
        aria-label="Open SRF diagnostics"
        title="Why sent-for-testing SRF counts may differ from this table"
      >
        <AlertTriangle size={14} className="shrink-0" />
        <span className="text-xs font-medium">SRF diagnostics</span>
        <Badge className="h-5 rounded-none border border-amber-500/40 bg-stone-900/60 px-1.5 text-[10px] font-semibold text-amber-100">
          {summary}
        </Badge>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn(limsDialogClass, 'max-h-[85vh] max-w-lg overflow-y-auto')}>
          <DialogHeader className="border-b border-stone-200 bg-[#f7f3eb] px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-[#1c1917]">
              <Info size={18} className="text-amber-700" />
              Sample Under Testing — SRF diagnostics
            </DialogTitle>
            <DialogDescription className="text-[#57534e]">
              Sent for testing from Test Allocation vs what appears in this table. Use this when an
              SRF seems missing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1 border border-stone-500 bg-[#f7f3eb] px-3 py-2.5 text-xs text-[#57534e]">
              <p>
                <span className="font-medium text-[#1c1917]">{diagnostics.totalSentSrfs}</span> SRF
                {diagnostics.totalSentSrfs === 1 ? '' : 's'} ·{' '}
                <span className="font-medium text-[#1c1917]">{diagnostics.totalSentSections}</span>{' '}
                section{diagnostics.totalSentSections === 1 ? '' : 's'} sent for testing
              </p>
              <p>
                <span className="font-medium text-[#1c1917]">
                  {diagnostics.visibleSrfsAfterVisibility}
                </span>{' '}
                SRF{diagnostics.visibleSrfsAfterVisibility === 1 ? '' : 's'} ·{' '}
                <span className="font-medium text-[#1c1917]">
                  {diagnostics.visibleSectionsAfterVisibility}
                </span>{' '}
                section{diagnostics.visibleSectionsAfterVisibility === 1 ? '' : 's'} shown in this
                table
              </p>
              {mismatch ? (
                <p className="text-amber-800">
                  Counts differ — review hidden entries and notices below.
                </p>
              ) : null}
            </div>

            {hidden.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1c1917]">
                  Not shown in this table
                </h3>
                <DiagnosticEntryList entries={hidden} variant="hidden" />
              </div>
            ) : null}

            {notices.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1c1917]">
                  Shown below — needs attention
                </h3>
                <DiagnosticEntryList entries={notices} variant="notice" />
              </div>
            ) : null}

            {hidden.length === 0 && notices.length === 0 ? (
              <p className="text-sm text-[#57534e]">No SRF diagnostic issues detected.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
