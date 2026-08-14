import { Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { RetentionStatusBadge } from './RetentionStatusBadge'
import { shouldHighlightRetentionDue } from './sampleRetention'
import type { RetainDisposedListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

const GRID_TABLE =
  'table-fixed min-w-[1080px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const cellInnerClass = 'w-full space-y-0.5 p-[1mm]'

const primaryLineClass =
  'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'

const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'

const monoLineClass =
  'break-words font-mono text-[12px] font-semibold tabular-nums tracking-tight text-[#1c1917]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const actionBtnClass =
  'h-8 gap-1 rounded-none border-stone-500 bg-stone-50 px-2.5 text-xs text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

const ghostBtnClass =
  'h-7 gap-1 rounded-none px-1.5 text-xs text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

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
    <div className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">No issued test reports found.</p>
          <p className="mt-1 text-xs text-[#78716c]">
            Samples appear here after a test report is issued from Test Report Preparation.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto [&>div]:overflow-visible">
          <Table className={GRID_TABLE}>
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[12%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn('w-[3%]', thBase)}>
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
                <TableHead className={cn('w-[20%]', thBase)}>SRF Number</TableHead>
                <TableHead className={cn('w-[14%]', thBase)}>IS Code</TableHead>
                <TableHead className={cn('w-[18%] leading-tight', thBase)}>
                  <span className="block">Report Issue</span>
                  <span className="block font-semibold normal-case tracking-normal text-amber-100/80">
                    / Retention Due
                  </span>
                </TableHead>
                <TableHead className={cn('w-[10%]', thBase)}>Quantity</TableHead>
                <TableHead className={cn('w-[12%]', thBase)}>Date of Disposed</TableHead>
                <TableHead className={cn('w-[11%]', thBase)}>Status</TableHead>
                <TableHead className={cn('w-[12%]', thBase)}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedIds.has(r.id)
                const even = index % 2 === 0
                const rowTone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass
                const dueHighlight = shouldHighlightRetentionDue(r.retentionDueDate)

                return (
                  <TableRow
                    key={r.id}
                    data-state={selected ? 'selected' : undefined}
                    className={cn('group border-[#e7e0d4] transition-colors', rowTone)}
                  >
                    <TableCell className="w-[3%] text-center align-middle">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${fmt(r.srfNumber)}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>

                    <TableCell className="w-[20%] align-middle text-left">
                      <div className={cn(cellInnerClass, 'text-left')}>
                        <p className={monoLineClass}>{fmt(r.srfNumber)}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={ghostBtnClass}
                          aria-label={`View SRF details for ${fmt(r.srfNumber)}`}
                          onClick={() => onViewSrf(r)}
                        >
                          <Eye size={12} />
                          View SRF
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell className="w-[14%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={primaryLineClass}>{fmt(r.isCodeLabel)}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[18%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={secondaryLineClass}>
                          <span className="uppercase tracking-wide text-[#a8a29e]">Issue: </span>
                          {formatDate(r.issuedAt ?? '')}
                        </p>
                        <p className={secondaryLineClass}>
                          <span className="uppercase tracking-wide text-[#a8a29e]">Due: </span>
                          <span
                            className={cn(
                              dueHighlight
                                ? 'font-semibold text-rose-600 animate-retention-due-blink'
                                : 'text-[#57534e]',
                            )}
                          >
                            {formatDate(r.retentionDueDate ?? '')}
                          </span>
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[10%] align-middle text-center">
                      <div className="flex w-full items-center justify-center p-[1mm]">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={ghostBtnClass}
                          aria-label={`View quantity for ${fmt(r.srfNumber)}`}
                          onClick={() => onViewQuantity(r)}
                        >
                          <Eye size={12} />
                          View
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell className="w-[12%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={monoLineClass}>{formatDate(r.disposedAt ?? '')}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[11%] align-middle text-center">
                      <div className="flex w-full items-center justify-center p-[1mm]">
                        <RetentionStatusBadge status={r.retentionStatus} />
                      </div>
                    </TableCell>

                    <TableCell className="w-[12%] align-middle text-center">
                      <div className="flex w-full items-center justify-center p-[1mm]">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={actionBtnClass}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={12} />
                          Record
                        </Button>
                      </div>
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
