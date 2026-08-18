import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { appendReportScopeSuffix } from '@/features/sample-handling/report-preparation/reportScope'
import {
  limsPanelClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { IssuedTestReportRowActions } from './IssuedTestReportRowActions'
import type { IssuedTestReportListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

const thClass = cn(limsTableHeadClass, 'border border-stone-700 !p-2')
const tdClass = 'border border-[#e7e0d4] !p-2 align-middle text-xs text-[#292524]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
export function CompletedResultsTable({
  rows,
  loading,
  error,
  selectedIds,
  actionBusyId,
  onToggle,
  onToggleAll,
  onViewSrf,
  onPrintNabl,
  onPrintNonNabl,
  onDownloadPdfs,
  onEmailToClient,
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
  onPrintNabl: (row: IssuedTestReportListRow) => void
  onPrintNonNabl: (row: IssuedTestReportListRow) => void
  onDownloadPdfs: (row: IssuedTestReportListRow) => void
  onEmailToClient: (row: IssuedTestReportListRow) => void
  onReferbackToPreparation: (row: IssuedTestReportListRow) => void
  onReferbackToResultsReview: (row: IssuedTestReportListRow) => void
  canReferbackToResultsReview: boolean
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(limsPanelClass, 'overflow-hidden bg-[#f7f3eb]')}>
      {error ? <p className="px-4 pt-4 text-sm text-red-700 sm:px-5">{error}</p> : null}

      {loading ? (
        <p className="px-4 py-6 text-sm text-[#78716c] sm:px-5">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            No issued test reports yet. Issue reports from Test Report Preparation after results are
            approved.
          </p>
        </div>
      ) : (
        <Table className={cn(limsTableClass, 'w-max min-w-full table-auto')}>
          <TableHeader>
            <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
              <TableHead className={cn(thClass, 'w-0 whitespace-nowrap text-center')}>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className={cn(thClass, 'w-0 whitespace-nowrap text-left')}>SRF</TableHead>
              <TableHead className={cn(thClass, 'w-full text-center')}>Client</TableHead>
              <TableHead className={cn(thClass, 'w-0 whitespace-nowrap text-center')}>
                Report Number
              </TableHead>
              <TableHead className={cn(thClass, 'w-0 whitespace-nowrap text-center')}>
                ULR Number
              </TableHead>
              <TableHead className={cn(thClass, 'w-0 whitespace-nowrap text-center')}>
                Issued on
              </TableHead>
              <TableHead className={cn(thClass, 'w-0 whitespace-nowrap text-center')}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, index) => {
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
                <TableRow key={r.id} className={index % 2 === 0 ? rowEvenClass : rowOddClass}>
                  <TableCell className={cn(tdClass, 'w-0 whitespace-nowrap text-center')}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${fmt(r.srfNumber)}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className={cn(tdClass, 'w-0 whitespace-nowrap py-2 text-left')}>
                    <div className="flex w-max flex-col items-start gap-0.5">
                      <div className="whitespace-nowrap text-xs font-medium leading-snug">
                        {fmt(r.srfNumber)}
                      </div>
                      <div className="whitespace-nowrap text-[11px] leading-snug text-[#78716c]">
                        {fmt(r.isCodeLabel)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={cn(tdClass, 'w-full text-center')}>
                    <div className="whitespace-nowrap leading-snug">{fmt(r.clientName)}</div>
                  </TableCell>
                  <TableCell className={cn(tdClass, 'w-0 whitespace-nowrap text-center')}>
                    <div className="space-y-0.5 text-xs font-medium leading-snug">
                      {nablReport ? <div className="whitespace-nowrap">{nablReport}</div> : null}
                      {nonNablReport ? (
                        <div className="whitespace-nowrap">{nonNablReport}</div>
                      ) : null}
                      {!nablReport && !nonNablReport ? (
                        <div className="whitespace-nowrap">{fmt(r.reportNumberBase)}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={cn(tdClass, 'w-0 whitespace-nowrap text-center font-medium')}>
                    {r.nablIssuedAt && r.nablUlrNumber ? fmt(r.nablUlrNumber) : '—'}
                  </TableCell>
                  <TableCell
                    className={cn(tdClass, 'w-0 whitespace-nowrap text-center text-[#78716c]')}
                  >
                    {formatDate(r.issuedAt ?? '')}
                  </TableCell>
                  <TableCell className={cn(tdClass, 'min-w-[220px] whitespace-nowrap text-center')}>
                    <IssuedTestReportRowActions
                      row={r}
                      busy={busy}
                      onViewSrf={onViewSrf}
                      onPrintNabl={onPrintNabl}
                      onPrintNonNabl={onPrintNonNabl}
                      onDownloadPdfs={onDownloadPdfs}
                      onEmailToClient={onEmailToClient}
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
      )}
    </div>
  )
}
