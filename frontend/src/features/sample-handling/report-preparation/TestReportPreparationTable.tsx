import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FileText, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import type { TestReportPreparationSortKey } from './sortTestReportPreparationRows'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

function SortableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  columnKey: TestReportPreparationSortKey
  sortKey: TestReportPreparationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: TestReportPreparationSortKey) => void
  className?: string
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-1 text-xs font-medium hover:text-foreground transition-colors"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  )
}

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
  sortKey,
  sortDir,
  onSort,
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
  sortKey: TestReportPreparationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: TestReportPreparationSortKey) => void
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
              <col className="w-[12%]" />
              <col className="w-[200px]" />
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
                <SortableHead
                  label="SRF"
                  columnKey="srfNumber"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  className="text-xs [&_button]:justify-start"
                />
                <TableHead className="text-xs text-center">View Sample Details</TableHead>
                <SortableHead
                  label="Client"
                  columnKey="clientName"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  className="text-xs text-center"
                />
                <SortableHead
                  label="IS Code"
                  columnKey="isCode"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  className="text-xs text-center"
                />
                <SortableHead
                  label="Received Date"
                  columnKey="dateReceiving"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  className="text-xs text-center"
                />
                <TableHead className="text-xs text-center">View Results</TableHead>
                <TableHead className="text-xs text-right pr-3">Action</TableHead>
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
                  <TableCell className="align-middle text-right pr-3">
                    <div className="inline-flex flex-col items-stretch gap-1.5 min-w-[148px]">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 justify-center gap-1.5 text-xs font-medium shadow-sm"
                        aria-label={`Prepare report for ${fmt(r.srfNumber)}`}
                        title="Prepare test report (Clause 7.8)"
                        onClick={() => onPrepare(r)}
                        disabled={referbackBusyId === r.id}
                      >
                        <FileText size={14} className="shrink-0" />
                        Prepare Report
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 justify-center gap-1.5 text-xs font-medium border-amber-200/90 bg-amber-50/50 text-amber-950 hover:bg-amber-50 hover:text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100 dark:hover:bg-amber-950/40"
                        aria-label={`Refer back ${fmt(r.srfNumber)} to Results Under Review`}
                        title="Refer back — select section, destination stage, and remark"
                        onClick={() => onReferback(r)}
                        disabled={!canReferback || referbackBusyId === r.id}
                      >
                        <Undo2 size={14} className="shrink-0" />
                        Refer Back
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
