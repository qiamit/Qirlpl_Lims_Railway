import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { appendReportScopeSuffix } from '@/features/sample-handling/report-preparation/reportScope'
import { IssuedTestReportRowActions } from './IssuedTestReportRowActions'
import type { IssuedTestReportListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function CompletedResultsTable({
  rows,
  loading,
  error,
  selectedIds,
  actionBusyId,
  onToggle,
  onToggleAll,
  onViewSrf,
  onDownloadNabl,
  onDownloadNonNabl,
  onReferbackToPreparation,
  onReferbackToResultsReview,
  canReferbackToResultsReview,
}: {
  rows: IssuedTestReportListRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  actionBusyId: string | null
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onViewSrf: (row: IssuedTestReportListRow) => void
  onDownloadNabl: (row: IssuedTestReportListRow) => void
  onDownloadNonNabl: (row: IssuedTestReportListRow) => void
  onReferbackToPreparation: (row: IssuedTestReportListRow) => void
  onReferbackToResultsReview: (row: IssuedTestReportListRow) => void
  canReferbackToResultsReview: boolean
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-card overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No issued test reports yet. Issue reports from Test Report Preparation after results are approved.
        </p>
      ) : (
        <div className="overflow-x-auto [&>div]:overflow-visible">
          <Table className="w-full min-w-[1000px] table-fixed">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[52px]" />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="px-2 text-center text-xs">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="text-left text-xs">SRF</TableHead>
                <TableHead className="text-xs text-center">Client</TableHead>
                <TableHead className="text-xs text-center">IS Code</TableHead>
                <TableHead className="text-xs text-center">Report Number</TableHead>
                <TableHead className="text-xs text-center">ULR Number</TableHead>
                <TableHead className="text-xs text-center">Issued on</TableHead>
                <TableHead className="text-xs text-center">Received Date</TableHead>
                <TableHead className="text-xs text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const busy = actionBusyId === r.id
                const nablReport =
                  r.nablIssuedAt && r.reportNumberBase
                    ? appendReportScopeSuffix(r.reportNumberBase, 'nabl')
                    : null
                const nonNablReport =
                  r.nonNablIssuedAt && r.reportNumberBase
                    ? appendReportScopeSuffix(r.reportNumberBase, 'non_nabl')
                    : null

                return (
                  <TableRow key={r.id}>
                    <TableCell className="align-middle px-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select ${fmt(r.srfNumber)}`}
                        checked={selectedIds.has(r.id)}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-left py-2">
                      <div className="flex flex-col items-start gap-1 min-w-0">
                        <div className="line-clamp-2 break-words font-medium leading-snug text-xs">
                          {fmt(r.srfNumber)}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1.5 -ml-1.5 text-xs gap-1"
                          aria-label={`View SRF details for ${fmt(r.srfNumber)}`}
                          onClick={() => onViewSrf(r)}
                        >
                          <Eye size={12} />
                          View
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="line-clamp-2 break-words text-xs leading-snug">{fmt(r.clientName)}</div>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="line-clamp-2 break-words text-xs leading-snug">{fmt(r.isCodeLabel)}</div>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="space-y-0.5 text-xs leading-snug break-words">
                        {nablReport ? (
                          <div>
                            <span className="text-muted-foreground">NABL: </span>
                            <span className="font-medium">{nablReport}</span>
                          </div>
                        ) : null}
                        {nonNablReport ? (
                          <div>
                            <span className="text-muted-foreground">Non-NABL: </span>
                            <span className="font-medium">{nonNablReport}</span>
                          </div>
                        ) : null}
                        {!nablReport && !nonNablReport ? (
                          <span className="font-medium">{fmt(r.reportNumberBase)}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="line-clamp-2 break-words text-xs font-medium leading-snug">
                        {r.nablIssuedAt && r.nablUlrNumber ? fmt(r.nablUlrNumber) : '—'}
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-center text-xs text-muted-foreground">
                      {formatDate(r.issuedAt ?? '')}
                    </TableCell>
                    <TableCell className="align-middle text-center text-xs text-muted-foreground">
                      {formatDate(r.dateReceiving ?? '')}
                    </TableCell>
                    <TableCell className="align-middle text-center px-1">
                      <IssuedTestReportRowActions
                        row={r}
                        busy={busy}
                        onDownloadNabl={onDownloadNabl}
                        onDownloadNonNabl={onDownloadNonNabl}
                        onReferbackToPreparation={onReferbackToPreparation}
                        onReferbackToResultsReview={onReferbackToResultsReview}
                        canReferbackToResultsReview={canReferbackToResultsReview}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
