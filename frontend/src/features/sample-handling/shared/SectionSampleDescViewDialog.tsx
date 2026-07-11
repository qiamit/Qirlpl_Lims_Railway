import { useEffect, useState, type ReactNode } from 'react'
import { BookMarked, FileText, Files, ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'
import { loadIsCodeFiles, type IsCodeFileLink } from './fetchSampleSrfViewDetails'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—')

type IsCodeDetails = {
  isNumber: string | null
  revisionYear: string | null
  reaffirmationYear: string | null
  amendmentNumber: string | null
  title: string | null
  aspect: string | null
  remarks: string | null
}

function formatIsCodeLabel(d: IsCodeDetails | null, fallback: string | null | undefined): string {
  if (d?.isNumber?.trim()) {
    const rev = d.revisionYear?.trim()
    return rev ? `${d.isNumber.trim()} : ${rev}` : d.isNumber.trim()
  }
  return fmt(fallback)
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-background px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </p>
    </div>
  )
}

function SectionBlock({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof FileText
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      </div>
      {children}
    </section>
  )
}

function ProsePanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-sm leading-relaxed text-foreground">
      <p className="whitespace-pre-wrap break-words">{children}</p>
    </div>
  )
}

function DetailItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border border-border/50 bg-background px-3 py-2',
        wide && 'sm:col-span-2',
      )}
    >
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium leading-snug text-foreground whitespace-pre-wrap break-words">
        {value}
      </dd>
    </div>
  )
}

function IsCodeFilesList({ files }: { files: IsCodeFileLink[] }) {
  if (files.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/70 bg-muted/10 px-3 py-4 text-center text-sm text-muted-foreground">
        No files uploaded for this IS Code.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-md border border-border/60 bg-background">
      {files.map((f) => (
        <li key={f.file_name} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Files className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate text-sm">{f.file_name}</span>
          </div>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted/50"
            >
              View
            </a>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">—</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SectionSampleDescViewDialog({
  row,
  open,
  onOpenChange,
}: {
  row: TestAllocationRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [isCodeLoading, setIsCodeLoading] = useState(false)
  const [isCodeDetails, setIsCodeDetails] = useState<IsCodeDetails | null>(null)
  const [isCodeFiles, setIsCodeFiles] = useState<IsCodeFileLink[]>([])

  useEffect(() => {
    if (!open || !row) {
      setIsCodeDetails(null)
      setIsCodeFiles([])
      setIsCodeLoading(false)
      return
    }

    const isCodeId = row.isCodeId?.trim() ?? ''
    if (!isCodeId) {
      setIsCodeDetails(null)
      setIsCodeFiles([])
      setIsCodeLoading(false)
      return
    }

    let cancelled = false
    setIsCodeLoading(true)

    void (async () => {
      try {
        const [detailsResult, files] = await Promise.all([
          supabase
            .from('is_codes')
            .select(
              'is_number, revision_year, reaffirmation_year, amendment_number, title, aspect, remarks',
            )
            .eq('id', isCodeId)
            .maybeSingle(),
          loadIsCodeFiles(isCodeId),
        ])

        if (cancelled) return

        const d = detailsResult.data as {
          is_number?: string | null
          revision_year?: string | null
          reaffirmation_year?: string | null
          amendment_number?: string | null
          title?: string | null
          aspect?: string | null
          remarks?: string | null
        } | null

        setIsCodeDetails(
          d
            ? {
                isNumber: d.is_number ?? null,
                revisionYear: d.revision_year ?? null,
                reaffirmationYear: d.reaffirmation_year ?? null,
                amendmentNumber: d.amendment_number ?? null,
                title: d.title ?? null,
                aspect: d.aspect ?? null,
                remarks: d.remarks ?? null,
              }
            : null,
        )
        setIsCodeFiles(files)
      } catch {
        if (!cancelled) {
          setIsCodeDetails(null)
          setIsCodeFiles([])
        }
      } finally {
        if (!cancelled) setIsCodeLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, row])

  const isCodeLabel = formatIsCodeLabel(isCodeDetails, row?.isCodeLabel)
  const sectionCode = row?.sectionCode?.trim() || '—'
  const department = row?.department?.trim() || '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-3 border-b border-border/60 bg-muted/20 px-6 py-4 pr-14 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg font-semibold tracking-tight">Sample Details</DialogTitle>
            {row?.sectionCode?.trim() ? (
              <Badge variant="secondary" className="font-medium">
                Section {sectionCode}
              </Badge>
            ) : null}
            {row?.department?.trim() ? (
              <Badge variant="outline" className="font-medium">
                {department}
              </Badge>
            ) : null}
          </div>
          {row ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <MetaChip label="Section Code" value={sectionCode} />
              <MetaChip label="Department" value={department} />
            </div>
          ) : null}
        </DialogHeader>

        {row ? (
          <div className="max-h-[calc(88vh-9rem)] space-y-6 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <SectionBlock icon={FileText} title="Sample Description">
                <ProsePanel>{fmt(row.sampleDescription)}</ProsePanel>
              </SectionBlock>
              <SectionBlock icon={ScrollText} title="Declared Value">
                <ProsePanel>{fmt(row.declaredValue)}</ProsePanel>
              </SectionBlock>
            </div>

            <SectionBlock icon={BookMarked} title="IS Code">
              {isCodeLoading ? (
                <p className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading IS Code details…
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-3.5 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Code
                    </span>
                    <span className="text-base font-semibold tracking-tight text-foreground">
                      {isCodeLabel}
                    </span>
                    {isCodeDetails?.aspect?.trim() ? (
                      <Badge variant="outline" className="ml-auto font-medium">
                        {isCodeDetails.aspect.trim()}
                      </Badge>
                    ) : null}
                  </div>

                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DetailItem label="Title" value={fmt(isCodeDetails?.title)} wide />
                    <DetailItem label="Reaffirmation" value={fmt(isCodeDetails?.reaffirmationYear)} />
                    <DetailItem label="Amendment" value={fmt(isCodeDetails?.amendmentNumber)} />
                    <DetailItem label="Remarks" value={fmt(isCodeDetails?.remarks)} wide />
                  </dl>

                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      IS Code Files
                    </p>
                    <IsCodeFilesList files={isCodeFiles} />
                  </div>
                </div>
              )}
            </SectionBlock>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
