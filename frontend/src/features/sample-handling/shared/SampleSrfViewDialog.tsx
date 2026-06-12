import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  fetchSampleSrfViewDetails,
  type SampleSrfViewDetails,
} from '@/features/sample-handling/shared/fetchSampleSrfViewDetails'
import { getSampleWorkflowStatusLabel } from '@/features/sample-handling/sampleWorkflowStatus'
import type { SampleStage } from '@/features/sample-handling/types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 10) : '—'

function fmtStage(details: SampleSrfViewDetails): string {
  return getSampleWorkflowStatusLabel({
    stage: (details.stage ?? 'receiving') as SampleStage,
    sample_receiving_status: details.sampleReceivingStatus,
    status: details.sampleReceivingStatus,
  })
}

function BoolBadge({ value }: { value: boolean | null | undefined }) {
  if (value === true) {
    return (
      <Badge variant="success" className="font-medium">
        Yes
      </Badge>
    )
  }
  if (value === false) {
    return (
      <Badge variant="outline" className="font-medium text-muted-foreground">
        No
      </Badge>
    )
  }
  return <span className="text-sm font-medium text-muted-foreground">—</span>
}

type DetailRow = [string, string] | [string, boolean | null | undefined, 'bool']

function DetailField({ label, value, isBool }: { label: string; value: string; isBool?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/50 bg-background/80 px-3 py-2 shadow-sm">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium leading-snug text-foreground">
        {isBool ? (
          <BoolBadge value={value === 'Yes' ? true : value === 'No' ? false : null} />
        ) : (
          <span className="whitespace-pre-wrap break-words">{value}</span>
        )}
      </dd>
    </div>
  )
}

function DetailFields({ rows, columns = 2 }: { rows: DetailRow[]; columns?: 1 | 2 }) {
  return (
    <dl
      className={cn(
        'grid gap-2',
        columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
      )}
    >
      {rows.map(([label, value, kind]) => {
        const display =
          kind === 'bool'
            ? value === true
              ? 'Yes'
              : value === false
                ? 'No'
                : '—'
            : String(value)
        return (
          <DetailField
            key={label}
            label={label}
            value={display}
            isBool={kind === 'bool'}
          />
        )
      })}
    </dl>
  )
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border/70 bg-card shadow-sm', className)}>
      <div className="border-b border-border/60 bg-muted/25 px-4 py-2.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">{title}</h4>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function IsCodeFilesList({ files }: { files: SampleSrfViewDetails['isCodeFiles'] }) {
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">No files uploaded for this IS Code.</p>
  }
  return (
    <ul className="space-y-1.5">
      {files.map((f) => (
        <li
          key={f.file_name}
          className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background px-3 py-2"
        >
          <span className="truncate text-sm">{f.file_name}</span>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
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

export function SampleSrfViewDialog({
  open,
  onOpenChange,
  sampleId,
  fallbackSrf,
  fallbackClient,
  fallbackIsLabel,
  hideClient = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  fallbackSrf?: string | null
  fallbackClient?: string | null
  fallbackIsLabel?: string | null
  /** Omit client section (e.g. Sample Allocation form). */
  hideClient?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<SampleSrfViewDetails | null>(null)

  useEffect(() => {
    if (!open || !sampleId) {
      setDetails(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    void fetchSampleSrfViewDetails(sampleId, {
      srfNumber: fallbackSrf,
      clientName: fallbackClient,
      isCodeLabel: fallbackIsLabel,
    })
      .then(setDetails)
      .catch((e) => {
        setDetails(null)
        setError(e instanceof Error ? e.message : 'Unable to load sample details')
      })
      .finally(() => setLoading(false))
  }, [open, sampleId, fallbackSrf, fallbackClient, fallbackIsLabel])

  const titleSrf = details?.srfNumber ?? fallbackSrf ?? '—'
  const stageLabel = details ? fmtStage(details) : null
  const receivingStatus = details?.sampleReceivingStatus?.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-3 border-b border-border/60 bg-muted/20 px-6 py-4 pr-12">
          <DialogTitle className="text-base font-semibold leading-tight sm:text-lg">
            {hideClient ? `Sample Details — ${fmt(titleSrf)}` : `SRF Details — ${fmt(titleSrf)}`}
          </DialogTitle>
          {details && (
            <div className="flex flex-wrap items-center gap-2">
              {receivingStatus && (
                <Badge variant="secondary" className="font-medium">
                  {receivingStatus}
                </Badge>
              )}
              {stageLabel && (
                <Badge variant="info" className="font-medium">
                  {stageLabel}
                </Badge>
              )}
              {details.isCodeLabel?.trim() && (
                <Badge variant="outline" className="max-w-full truncate font-medium">
                  IS: {details.isCodeLabel.trim()}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading && <p className="text-sm text-muted-foreground">Loading sample details…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!loading && !error && details && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-4">
                <Section title="SRF & Receiving">
                  <DetailFields
                    columns={2}
                    rows={[
                      ['SRF Number', fmt(details.srfNumber)],
                      ['Referenced SRF', fmt(details.referencedSrfNumber)],
                      ['Report Type', fmt(details.receivingReportType)],
                      ['Date of Receiving', fmtDate(details.dateOfSampleReceiving)],
                      ['Receiving Status', fmt(details.sampleReceivingStatus)],
                      ['Current Stage', stageLabel ?? fmt(details.stage)],
                    ]}
                  />
                </Section>

                {!hideClient && (
                  <Section title="Client">
                    <DetailFields
                      columns={2}
                      rows={[
                        ['Customer', fmt(details.clientName)],
                        ['Client Reference', fmt(details.clientReference)],
                        ['Contact Person', fmt(details.clientContact)],
                        ['Email', fmt(details.clientEmail)],
                        ['Phone', fmt(details.clientPhone)],
                        ['Address', fmt(details.clientAddress)],
                      ]}
                    />
                    {details.clientReferenceUrl && (
                      <p className="mt-3">
                        <a
                          href={details.clientReferenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View client reference document
                        </a>
                      </p>
                    )}
                  </Section>
                )}

                <Section title="IS Code">
                  <p className="mb-3 text-sm font-semibold">{fmt(details.isCodeLabel)}</p>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    IS Code Files
                  </p>
                  <IsCodeFilesList files={details.isCodeFiles} />
                </Section>
              </div>

              <div className="space-y-4">
                <Section title="Sample Identification">
                  <DetailFields
                    columns={2}
                    rows={[
                      ['Sample Code', fmt(details.sampleCode)],
                      ['Sample QR Code', fmt(details.sampleQrCode)],
                      ['Batch Number', fmt(details.batchNumber)],
                      ['Date of Manufacturing', fmtDate(details.dateOfManufacturing)],
                      ['Sample Quantity', fmt(details.sampleQuantity)],
                      ['Shelf Life', fmt(details.shelfLife)],
                      ['Test Required', fmt(details.testRequired)],
                      ['Nature of Sample', fmt(details.natureOfSample)],
                      ['Mode of Disposal', fmt(details.modeOfDisposal)],
                      ['Tentative Date (Required)', fmtDate(details.tentativeDateRequired)],
                      ['Tentative Date (By Lab)', fmtDate(details.tentativeDateByLab)],
                      ['BIS Seal', details.bisSeal, 'bool'],
                      ['IO Signature', details.ioSignature, 'bool'],
                    ]}
                  />
                </Section>

                <Section title="Receiving Review">
                  <DetailFields
                    columns={2}
                    rows={[
                      ['Statement of Conformity', details.statementConformityRequired, 'bool'],
                      ['Witness Test Required', details.witnessTestRequired, 'bool'],
                      ['Competent Person Available', details.competentPersonAvailable, 'bool'],
                      ['Equipment Available', details.equipmentAvailable, 'bool'],
                      ['Can Complete Within Time', details.canCompleteWithinTime, 'bool'],
                      ['Deviation from Methods', details.deviationFromMethods, 'bool'],
                      ['Supporting Docs Required', details.supportingDocsRequired, 'bool'],
                      ['Decision Rule Applied', details.decisionRuleApplied, 'bool'],
                      ['Testing Method Available', details.testingMethodAvailable, 'bool'],
                      ['Sampling Procedure Ref', details.samplingProcedureRef, 'bool'],
                    ]}
                  />
                </Section>
              </div>

              <Section title="Sample Description & Declaration" className="xl:col-span-2">
                <DetailFields
                  columns={2}
                  rows={[
                    ['Sample Description', fmt(details.sampleDescription)],
                    ['Sample Declaration', fmt(details.sampleDeclaration)],
                    ['Any Other Information', fmt(details.anyOtherInformation)],
                  ]}
                />
              </Section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
