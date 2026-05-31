import { useEffect, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  fetchSampleSrfViewDetails,
  type SampleSrfViewDetails,
} from '@/features/sample-handling/shared/fetchSampleSrfViewDetails'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 10) : '—'

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
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

export function SampleSrfViewDialog({
  open,
  onOpenChange,
  sampleId,
  fallbackSrf,
  fallbackClient,
  fallbackIsLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  fallbackSrf?: string | null
  fallbackClient?: string | null
  fallbackIsLabel?: string | null
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
          <DialogTitle>SRF Details — {fmt(titleSrf)}</DialogTitle>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Loading sample details…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && details && (
          <div className="space-y-5 text-sm">
            <Section title="SRF & Receiving">
              <DetailGrid
                rows={[
                  ['Date of Receiving', fmtDate(details.dateOfSampleReceiving)],
                  ['Receiving Status', fmt(details.sampleReceivingStatus)],
                  ['Current Stage', fmt(details.stage)],
                ]}
              />
            </Section>

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

            <Section title="Sample">
              <DetailGrid
                rows={[
                  ['Sample Code', fmt(details.sampleCode)],
                  ['Sample QR Code', fmt(details.sampleQrCode)],
                  ['Batch Number', fmt(details.batchNumber)],
                  ['Date of Manufacturing', fmtDate(details.dateOfManufacturing)],
                  ['Sample Quantity', fmt(details.sampleQuantity)],
                  ['Test Required', fmt(details.testRequired)],
                  ['Nature of Sample', fmt(details.natureOfSample)],
                  ['Mode of Disposal', fmt(details.modeOfDisposal)],
                  ['Tentative Date (Required)', fmtDate(details.tentativeDateRequired)],
                  ['Tentative Date (By Lab)', fmtDate(details.tentativeDateByLab)],
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

            <Section title="IS Code">
              <p className="text-sm font-medium mb-3">{fmt(details.isCodeLabel)}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">IS Code Files</p>
              {details.isCodeFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No files uploaded for this IS Code.</p>
              ) : (
                <ul className="space-y-2">
                  {details.isCodeFiles.map((f) => (
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
              )}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
