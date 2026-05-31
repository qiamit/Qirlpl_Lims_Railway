import { Eye, FileText, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function TestReportPreparationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onViewSrf,
  onViewResults,
  onPrepare,
  onReferback,
  referbackBusyId,
  canReferback,
}: {
  rows: ReportPreparationListRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onViewSrf: (row: ReportPreparationListRow) => void
  onViewResults: (row: ReportPreparationListRow) => void
  onPrepare: (row: ReportPreparationListRow) => void
  onReferback: (row: ReportPreparationListRow) => void
  referbackBusyId: string | null
  canReferback: boolean
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
          No SRFs approved and ready for test report yet. Approve all sections in Results Under Review first.
        </p>
      ) : (
        <div className="[&>div]:overflow-hidden">
          <Table className="w-full table-fixed">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[16%]" />
              <col className="w-[120px]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[88px]" />
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
                <TableHead className="text-xs text-center">View Sample Details</TableHead>
                <TableHead className="text-xs text-center">Client</TableHead>
                <TableHead className="text-xs text-center">IS Code</TableHead>
                <TableHead className="text-xs text-center">Received Date</TableHead>
                <TableHead className="text-xs text-center">View Results</TableHead>
                <TableHead className="text-xs text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="align-middle px-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${fmt(r.srfNumber)}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className="align-middle text-left">
                    <div className="line-clamp-2 break-words font-medium leading-snug">{fmt(r.srfNumber)}</div>
                  </TableCell>
                  <TableCell className="align-middle text-center px-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5 text-xs gap-1"
                      aria-label={`View SRF details for ${fmt(r.srfNumber)}`}
                      onClick={() => onViewSrf(r)}
                    >
                      <Eye size={12} />
                      View
                    </Button>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="line-clamp-2 break-words text-xs leading-snug">{fmt(r.clientName)}</div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="line-clamp-2 break-words text-xs leading-snug">{fmt(r.isCodeLabel)}</div>
                  </TableCell>
                  <TableCell className="align-middle text-center text-xs text-muted-foreground">
                    {formatDate(r.dateReceiving ?? '')}
                  </TableCell>
                  <TableCell className="align-middle text-center px-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5 text-xs gap-1"
                      aria-label={`View test results for ${fmt(r.srfNumber)}`}
                      onClick={() => onViewResults(r)}
                    >
                      <Eye size={12} />
                      View
                    </Button>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Prepare report for ${fmt(r.srfNumber)}`}
                        title="Prepare test report"
                        onClick={() => onPrepare(r)}
                        disabled={referbackBusyId === r.id}
                      >
                        <FileText size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Referback ${fmt(r.srfNumber)} to Results Under Review`}
                        title="Refer back — select section(s) to send to Results Under Review"
                        onClick={() => onReferback(r)}
                        disabled={!canReferback || referbackBusyId === r.id}
                      >
                        <Undo2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
