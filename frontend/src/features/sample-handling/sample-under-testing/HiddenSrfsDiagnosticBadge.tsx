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
        className="h-8 gap-1.5 border-amber-200/90 bg-amber-50/60 text-amber-950 hover:bg-amber-50 hover:text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-100 dark:hover:bg-amber-950/40"
        onClick={() => setOpen(true)}
        aria-label="Open SRF diagnostics"
        title="Why sent-for-testing SRF counts may differ from this table"
      >
        <AlertTriangle size={14} className="shrink-0" />
        <span className="text-xs font-medium">SRF diagnostics</span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
          {summary}
        </Badge>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info size={18} className="text-muted-foreground" />
              Sample Under Testing — SRF diagnostics
            </DialogTitle>
            <DialogDescription>
              Sent for testing from Test Allocation vs what appears in this table. Use this when an
              SRF seems missing.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground">{diagnostics.totalSentSrfs}</span> SRF
              {diagnostics.totalSentSrfs === 1 ? '' : 's'} ·{' '}
              <span className="font-medium text-foreground">{diagnostics.totalSentSections}</span>{' '}
              section{diagnostics.totalSentSections === 1 ? '' : 's'} sent for testing
            </p>
            <p>
              <span className="font-medium text-foreground">
                {diagnostics.visibleSrfsAfterVisibility}
              </span>{' '}
              SRF{diagnostics.visibleSrfsAfterVisibility === 1 ? '' : 's'} ·{' '}
              <span className="font-medium text-foreground">
                {diagnostics.visibleSectionsAfterVisibility}
              </span>{' '}
              section{diagnostics.visibleSectionsAfterVisibility === 1 ? '' : 's'} shown in this
              table
            </p>
            {mismatch ? (
              <p className="text-amber-800 dark:text-amber-200">
                Counts differ — review hidden entries and notices below.
              </p>
            ) : null}
          </div>

          {hidden.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Not shown in this table
              </h3>
              <DiagnosticEntryList entries={hidden} variant="hidden" />
            </div>
          ) : null}

          {notices.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Shown below — needs attention
              </h3>
              <DiagnosticEntryList entries={notices} variant="notice" />
            </div>
          ) : null}

          {hidden.length === 0 && notices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SRF diagnostic issues detected.</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
