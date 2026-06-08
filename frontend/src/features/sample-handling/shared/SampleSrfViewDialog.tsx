import { useEffect, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  fetchSampleSrfViewDetails,
  type SampleSrfViewDetails,
} from '@/features/sample-handling/shared/fetchSampleSrfViewDetails'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 10) : '—'
const fmtBool = (v: boolean | null | undefined) => {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  return '—'
}

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <span className="text-muted-foreground">{label}</span>
          <span className="whitespace-pre-wrap font-medium">{value}</span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      <div className="rounded-md bg-muted/30 border border-border/50 p-3">{children}</div>
    </section>
  )
}

function IsCodeFilesList({ files }: { files: SampleSrfViewDetails['isCodeFiles'] }) {
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">No files uploaded for this IS Code.</p>
  }
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li
          key={f.file_name}
          className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background px-3 py-2"
        >
          <span className="text-sm truncate">{f.file_name}</span>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary hover:underline shrink-0"
            >
              View
            </a>
          ) : (
            <span className="text-xs text-muted-foreground shrink-0">—</span>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {hideClient ? `Sample Details — ${fmt(titleSrf)}` : `SRF Details — ${fmt(titleSrf)}`}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Loading sample details…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && details && (
          <div className="space-y-5 text-sm">
            <Section title="SRF & Receiving">
              <DetailGrid
                rows={[
                  ['SRF Number', fmt(details.srfNumber)],
                  ['Referenced SRF', fmt(details.referencedSrfNumber)],
                  ['Report Type', fmt(details.receivingReportType)],
                  ['Date of Receiving', fmtDate(details.dateOfSampleReceiving)],
                  ['Receiving Status', fmt(details.sampleReceivingStatus)],
                  ['Current Stage', fmt(details.stage)],
                ]}
              />
            </Section>

            {!hideClient && (
              <Section title="Client">
                <DetailGrid
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

            <Section title="Sample Identification">
              <DetailGrid
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
                  ['BIS Seal', fmtBool(details.bisSeal)],
                  ['IO Signature', fmtBool(details.ioSignature)],
                ]}
              />
            </Section>

            <Section title="Sample Description & Declaration">
              <DetailGrid
                rows={[
                  ['Sample Description', fmt(details.sampleDescription)],
                  ['Sample Declaration', fmt(details.sampleDeclaration)],
                  ['Any Other Information', fmt(details.anyOtherInformation)],
                ]}
              />
            </Section>

            <Section title="Receiving Review">
              <DetailGrid
                rows={[
                  ['Statement of Conformity', fmtBool(details.statementConformityRequired)],
                  ['Witness Test Required', fmtBool(details.witnessTestRequired)],
                  ['Competent Person Available', fmtBool(details.competentPersonAvailable)],
                  ['Equipment Available', fmtBool(details.equipmentAvailable)],
                  ['Can Complete Within Time', fmtBool(details.canCompleteWithinTime)],
                  ['Deviation from Methods', fmtBool(details.deviationFromMethods)],
                  ['Supporting Docs Required', fmtBool(details.supportingDocsRequired)],
                  ['Decision Rule Applied', fmtBool(details.decisionRuleApplied)],
                  ['Testing Method Available', fmtBool(details.testingMethodAvailable)],
                  ['Sampling Procedure Ref', fmtBool(details.samplingProcedureRef)],
                ]}
              />
            </Section>

            <Section title="IS Code">
              <p className="text-sm font-medium mb-3">{fmt(details.isCodeLabel)}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">IS Code Files</p>
              <IsCodeFilesList files={details.isCodeFiles} />
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
