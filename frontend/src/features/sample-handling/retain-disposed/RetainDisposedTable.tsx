import { Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatDate } from '@/lib/utils'
import { RetentionStatusBadge } from './RetentionStatusBadge'
import { shouldHighlightRetentionDue } from './sampleRetention'
import type { RetainDisposedListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

const compactCol = 'w-0 whitespace-nowrap'

export function RetainDisposedTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onViewSrf,
  onViewQuantity,
  onEdit,
}: {
  rows: RetainDisposedListRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onViewSrf: (row: RetainDisposedListRow) => void
  onViewQuantity: (row: RetainDisposedListRow) => void
  onEdit: (row: RetainDisposedListRow) => void
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
          No issued test reports found. Samples appear here after a test report is issued from Test Report
          Preparation.
        </p>
      ) : (
        <div className="overflow-x-auto [&>div]:overflow-visible">
          <Table className="w-full table-auto">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className={cn(compactCol, 'px-1 text-center text-xs')}>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    aria-label="Select all"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="text-left text-xs">SRF Number</TableHead>
                <TableHead className="text-left text-xs">IS Code</TableHead>
                <TableHead className={cn(compactCol, 'text-xs text-center leading-snug')}>
                  <div>Report Issue</div>
                  <div className="font-normal text-muted-foreground">/ Retention Due</div>
                </TableHead>
                <TableHead className={cn(compactCol, 'text-xs text-center')}>Quantity</TableHead>
                <TableHead className={cn(compactCol, 'text-xs text-center')}>Date of Disposed</TableHead>
                <TableHead className={cn(compactCol, 'text-xs text-center')}>Status</TableHead>
                <TableHead className={cn(compactCol, 'text-xs text-center')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={cn(compactCol, 'align-middle px-1 text-center')}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      aria-label={`Select ${fmt(r.srfNumber)}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className="align-middle text-left py-2">
                    <div className="flex flex-col items-start gap-1 min-w-0">
                      <div className="break-words font-medium leading-snug text-xs whitespace-nowrap">
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
                        View SRF
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-left">
                    <div className="text-xs leading-snug font-medium whitespace-nowrap">
                      {fmt(r.isCodeLabel)}
                    </div>
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-center text-xs')}>
                    <div className="space-y-0.5 leading-snug">
                      <div className="text-muted-foreground">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                          Issue:{' '}
                        </span>
                        {formatDate(r.issuedAt ?? '')}
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                          Due:{' '}
                        </span>
                        <span
                          className={cn(
                            shouldHighlightRetentionDue(r.retentionDueDate)
                              ? 'font-semibold text-rose-600 animate-retention-due-blink'
                              : 'text-muted-foreground',
                          )}
                        >
                          {formatDate(r.retentionDueDate ?? '')}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-center px-1')}>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-xs whitespace-nowrap"
                      aria-label={`View quantity for ${fmt(r.srfNumber)}`}
                      onClick={() => onViewQuantity(r)}
                    >
                      <Eye size={12} />
                      View
                    </Button>
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-center text-xs text-muted-foreground')}>
                    {formatDate(r.disposedAt ?? '')}
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-center')}>
                    <RetentionStatusBadge status={r.retentionStatus} />
                  </TableCell>
                  <TableCell className={cn(compactCol, 'align-middle text-center px-1')}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-xs whitespace-nowrap"
                      onClick={() => onEdit(r)}
                    >
                      <Pencil size={12} />
                      Record
                    </Button>
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
