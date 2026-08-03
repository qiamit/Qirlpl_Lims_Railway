import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ClientRow } from './types'
import { formatClientAddress, formatClientContact, formatClientContactLines } from './types'

const GRID_TABLE =
  'min-w-[920px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const formatMoney = (value: number | null | undefined) => {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ClientsTable({
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
  rows: ClientRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ClientRow) => void
  onCopy: (row: ClientRow) => void
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
            {searchActive ? 'No clients match your search.' : 'No clients added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">Use &quot;Add New Client&quot; to create your first record.</p>
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
              <TableHead className="sticky left-12 z-10 min-w-[160px] bg-muted/50 text-left text-xs sm:left-14">
                Company Identity
              </TableHead>
              <TableHead className="min-w-[110px] text-center text-xs">Type &amp; Scale</TableHead>
              <TableHead className="min-w-[160px] text-center text-xs">Contact Details</TableHead>
              <TableHead className="min-w-[180px] text-center text-xs">Address</TableHead>
              <TableHead className="min-w-[110px] text-center text-xs">Balance</TableHead>
              <TableHead className="min-w-[96px] text-center text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const contact = formatClientContactLines(r)
              const contactTitle = formatClientContact(r)
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
                      aria-label={`Select ${r.company_name}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell
                    className={`sticky left-12 z-10 align-middle text-left sm:left-14 ${
                      selected ? 'bg-muted' : 'bg-card'
                    }`}
                  >
                    <div className="min-w-[140px] max-w-[240px] space-y-0.5">
                      <p className="truncate font-medium text-foreground" title={r.company_name}>
                        {r.company_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{r.gst_number || '—'}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">{r.company_type}</p>
                      <p className="text-xs text-muted-foreground">{r.company_scale}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5" title={contactTitle}>
                      <p className="text-sm font-medium text-foreground">{contact.name}</p>
                      <p className="break-all text-xs text-muted-foreground">{contact.email}</p>
                      <p className="text-xs text-muted-foreground">{contact.mobile}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div
                      className="mx-auto max-w-[220px] text-xs leading-snug text-muted-foreground line-clamp-3"
                      title={formatClientAddress(r)}
                    >
                      {formatClientAddress(r)}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">{r.balance_type}</p>
                      <p className="text-xs text-muted-foreground">₹ {formatMoney(r.opening_balance)}</p>
                      <p className="text-xs text-muted-foreground">{r.payment_term}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${r.company_name}`}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Copy ${r.company_name}`}
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
