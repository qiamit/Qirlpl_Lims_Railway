import type { ReactNode } from 'react'
import { BookMarked, ClipboardList, FileText, Files, Gauge, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { TestAllocationParameterRow } from '../types'
import { resolveSectionSpecificRequirement } from './resolveSectionSpecificRequirement'
import type { IsCodeFileLink } from './fetchSampleSrfViewDetails'

const fmt = (v: unknown) =>
  v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : '—'

export type TestParameterViewExtras = {
  loading: boolean
  isCodeLabel: string | null
  sampleDescription: string | null
  declaredValue: string | null
  isCodeFiles: IsCodeFileLink[]
}

function SectionBlock({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof FileText
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function DetailTile({
  label,
  value,
  wide,
  children,
}: {
  label: string
  value?: string
  wide?: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border border-border/50 bg-background px-3 py-2',
        wide && 'sm:col-span-2',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium leading-snug text-foreground whitespace-pre-wrap break-words">
        {children ?? value}
      </div>
    </div>
  )
}

function ProsePanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-sm leading-relaxed">
      <p className="whitespace-pre-wrap break-words">{children}</p>
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

function SampleAndIsCodeSection({ extras }: { extras: TestParameterViewExtras }) {
  return (
    <SectionBlock icon={BookMarked} title="Sample & IS Code">
      {extras.loading ? (
        <p className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
          Loading sample details…
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              IS Code
            </span>
            <span className="text-base font-semibold tracking-tight">{fmt(extras.isCodeLabel)}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sample Description
              </p>
              <ProsePanel>{fmt(extras.sampleDescription)}</ProsePanel>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Declared Value
              </p>
              <ProsePanel>{fmt(extras.declaredValue)}</ProsePanel>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              IS Code Files
            </p>
            <IsCodeFilesList files={extras.isCodeFiles} />
          </div>
        </div>
      )}
    </SectionBlock>
  )
}

export function TestParameterViewDialog({
  open,
  onOpenChange,
  label,
  parameters,
  extras,
  sectionParameters,
  sectionCode,
  onEditSpecificRequirement,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  parameters: Record<string, unknown>[]
  extras: TestParameterViewExtras
  sectionParameters?: TestAllocationParameterRow[] | null
  sectionCode?: string | null
  onEditSpecificRequirement?: (tp: Record<string, unknown>) => void
}) {
  const titleLabel = label.trim() || '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b border-border/60 bg-muted/20 px-6 py-4 pr-14 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg font-semibold tracking-tight">Test Parameter</DialogTitle>
            <Badge variant="secondary" className="max-w-full truncate font-medium">
              {titleLabel}
            </Badge>
            {sectionCode?.trim() ? (
              <Badge variant="outline" className="font-medium">
                Section {sectionCode.trim()}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        <div className="max-h-[calc(88vh-6rem)] space-y-5 overflow-y-auto px-6 py-5">
          {parameters.length === 0 ? (
            <>
              {!extras.loading ? (
                <p className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
                  No matching test parameter found in Test Parameter directory.
                </p>
              ) : null}
              <SampleAndIsCodeSection extras={extras} />
            </>
          ) : (
            parameters.map((tp, idx) => {
              const tpId = typeof tp.id === 'string' ? tp.id.trim() : ''
              const sectionParam = sectionParameters?.find((p) => p.testParameterId === tpId)
              const displaySpecificRequirement = fmt(
                resolveSectionSpecificRequirement(
                  sectionParam?.sectionSpecOverride,
                  String(tp.specific_requirement ?? ''),
                ),
              )
              const itemName = fmt(tp.item_name)
              const isCode = fmt(extras.isCodeLabel ?? tp.is_code_label)
              const method = fmt(tp.test_method)
              const clause = fmt(tp.clause_no)
              const unit = fmt(tp.unit_value)

              return (
                <div
                  key={tpId || idx}
                  className="overflow-hidden rounded-lg border border-border/60 bg-background"
                >
                  <div className="space-y-3 border-b border-border/60 bg-muted/15 px-4 py-3.5">
                    <div className="flex flex-wrap items-start gap-2">
                      <h3 className="text-base font-semibold tracking-tight text-foreground">
                        {itemName}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <DetailTile label="IS Code" value={isCode} />
                      <DetailTile label="Test Method" value={method} />
                      <DetailTile label="Clause" value={clause} />
                      <DetailTile label="Unit" value={unit} />
                    </div>
                  </div>

                  <div className="space-y-5 px-4 py-4">
                    <SampleAndIsCodeSection extras={extras} />

                    <SectionBlock
                      icon={ClipboardList}
                      title="Requirements"
                      action={
                        onEditSpecificRequirement && tpId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5"
                            aria-label="Edit specified requirement for this section"
                            title="Section-only override (does not change Test Parameter master)"
                            onClick={() => onEditSpecificRequirement(tp)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit Requirement
                          </Button>
                        ) : onEditSpecificRequirement ? (
                          <span className="text-[11px] text-muted-foreground">
                            Link test parameter to enable edit
                          </span>
                        ) : null
                      }
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <DetailTile label="Specified Requirement" value={displaySpecificRequirement} wide />
                        <DetailTile label="Acceptance Criteria" value={fmt(tp.acceptance_criteria)} wide />
                      </div>
                    </SectionBlock>

                    <SectionBlock icon={Gauge} title="Uncertainty">
                      <DetailTile label="Uncertainty (MU)" value={fmt(tp.uncertainty_mu)} />
                    </SectionBlock>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}