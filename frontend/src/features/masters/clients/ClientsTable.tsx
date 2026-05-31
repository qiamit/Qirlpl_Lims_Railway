import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ClientRow } from './types'
import { formatClientAddress, formatClientContact, formatClientContactLines } from './types'

const formatMoney = (value: number | null | undefined) => {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ClientsTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: ClientRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ClientRow) => void
  onCopy: (row: ClientRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-card overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No clients added yet.</p>
      ) : (
        <div className="[&>div]:overflow-hidden">
        <Table className="w-full table-fixed">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[15%]" />
            <col className="w-[11%]" />
            <col className="w-[17%]" />
            <col className="w-[30%]" />
            <col className="w-[13%]" />
            <col className="w-[80px]" />
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
              <TableHead className="text-left text-xs">Company Identity</TableHead>
              <TableHead className="text-xs text-center">Type &amp; Scale</TableHead>
              <TableHead className="text-xs text-center">Contact Details</TableHead>
              <TableHead className="text-xs text-center">Address</TableHead>
              <TableHead className="text-xs text-center">Balance</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const contact = formatClientContactLines(r)
              const contactTitle = formatClientContact(r)
              return (
              <TableRow key={r.id}>
                <TableCell className="align-middle px-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.company_name}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </TableCell>
                <TableCell className="align-middle text-left">
                  <div className="line-clamp-2 break-words font-medium leading-snug">{r.company_name}</div>
                  <div className="text-xs text-muted-foreground">GST: {r.gst_number || '-'}</div>
                </TableCell>
                <TableCell className="align-middle text-center">
                  <div className="text-xs leading-snug">{r.company_type}</div>
                  <div className="text-xs text-muted-foreground">{r.company_scale}</div>
                </TableCell>
                <TableCell className="align-middle text-center">
                  <div className="text-xs leading-snug" title={contactTitle}>
                    <div className="line-clamp-1 break-words font-medium">{contact.name}</div>
                    <div className="line-clamp-1 break-words text-muted-foreground">{contact.email}</div>
                    <div className="line-clamp-1 break-words">{contact.mobile}</div>
                  </div>
                </TableCell>
                <TableCell className="align-middle text-center">
                  <div
                    className="text-xs leading-snug break-words line-clamp-3"
                    title={formatClientAddress(r)}
                  >
                    {formatClientAddress(r)}
                  </div>
                </TableCell>
                <TableCell className="align-middle text-center">
                  <div className="text-xs leading-snug">{r.balance_type}</div>
                  <div className="text-xs text-muted-foreground">₹ {formatMoney(r.opening_balance)}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{r.payment_term}</div>
                </TableCell>
                <TableCell className="align-middle text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label="Edit" onClick={() => onEdit(r)}>
                      <Pencil size={16} />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Copy" onClick={() => onCopy(r)}>
                      <Copy size={16} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  )
}
