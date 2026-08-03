import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  formatDate,
  formatMoney,
  type QuotationRow,
} from './types'

const GRID_TABLE =
  'min-w-[920px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function statusClass(status: string): string {
  switch (status) {
    case 'Accepted':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'Sent':
      return 'bg-sky-50 text-sky-800 ring-sky-200'
    case 'Rejected':
    case 'Expired':
      return 'bg-rose-50 text-rose-800 ring-rose-200'
    case 'Converted':
      return 'bg-violet-50 text-violet-800 ring-violet-200'
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200'
  }
}

export function QuotationTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: QuotationRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: QuotationRow) => void
  onCopy: (row: QuotationRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {error ? <p className="px-3 pt-3 text-sm text-destructive sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No quotations match your search.' : 'No quotations added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Use &quot;Add New Quotation&quot; to create your first record.
            </p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="sticky left-0 z-10 w-12 bg-muted/50 text-center text-xs sm:w-14">
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
              <TableHead className="sticky left-12 z-10 min-w-[140px] bg-muted/50 text-left text-xs sm:left-14">
                Quotation No.
              </TableHead>
              <TableHead className="min-w-[100px] text-center text-xs">Date</TableHead>
              <TableHead className="min-w-[180px] text-left text-xs">Client</TableHead>
              <TableHead className="min-w-[100px] text-center text-xs">Status</TableHead>
              <TableHead className="min-w-[110px] text-center text-xs">Grand Total</TableHead>
              <TableHead className="min-w-[100px] text-center text-xs">Valid Until</TableHead>
              <TableHead className="min-w-[96px] text-center text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = selectedIds.has(r.id)
              return (
                <TableRow key={r.id} data-state={selected ? 'selected' : undefined}>
                  <TableCell
                    className={`sticky left-0 z-10 text-center align-middle ${
                      selected ? 'bg-muted' : 'bg-card'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.quotation_number}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell
                    className={`sticky left-12 z-10 align-middle sm:left-14 ${
                      selected ? 'bg-muted' : 'bg-card'
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">{r.quotation_number}</p>
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm">
                    {formatDate(r.quotation_date)}
                  </TableCell>
                  <TableCell className="align-middle text-sm">
                    <p className="font-medium text-foreground">{r.client_name || '—'}</p>
                    {r.contact_person ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{r.contact_person}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm font-medium tabular-nums">
                    ₹ {formatMoney(r.grand_total)}
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm text-muted-foreground">
                    {formatDate(r.valid_until)}
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${r.quotation_number}`}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Copy ${r.quotation_number}`}
                        onClick={() => onCopy(r)}
                      >
                        <Copy size={16} />
                      </Button>
                    </div>
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
