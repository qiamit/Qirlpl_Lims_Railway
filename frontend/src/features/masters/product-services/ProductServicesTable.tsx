import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ProductServiceRow } from './types'

const formatMoney = (value: number | null | undefined) => {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatNumber = (value: number | null | undefined) => {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ProductServicesTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: ProductServiceRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ProductServiceRow) => void
  onCopy: (row: ProductServiceRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No items added yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs w-[44px] text-center">
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
              <TableHead className="text-xs">Item Details</TableHead>
              <TableHead className="text-xs text-center">Category &amp; Item Code</TableHead>
              <TableHead className="text-xs text-center">Make</TableHead>
              <TableHead className="text-xs text-center">Tax Details</TableHead>
              <TableHead className="text-xs text-center">Unit &amp; Stock Details</TableHead>
              <TableHead className="text-xs text-center">Price Details</TableHead>
              <TableHead className="text-xs text-center w-[96px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.item_name}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </TableCell>

                <TableCell className="break-words whitespace-normal">
                  <div className="font-medium">{r.item_name}</div>
                  <div className="text-xs text-muted-foreground">{r.item_description || '-'}</div>
                </TableCell>

                <TableCell className="text-center">
                  <div className="text-xs">{r.category}</div>
                  <div className="text-xs text-muted-foreground">{r.item_code}</div>
                </TableCell>

                <TableCell className="text-center">
                  <div className="text-xs">{r.make || '-'}</div>
                  <div className="text-xs text-muted-foreground">{r.serial_model_no || '-'}</div>
                </TableCell>

                <TableCell className="text-center">
                  <div className="text-xs">HSN: {r.hsn_code || '-'}</div>
                  <div className="text-xs text-muted-foreground">GST: {formatNumber(r.gst_rate)} %</div>
                </TableCell>

                <TableCell className="text-center">
                  <div className="text-xs">{r.unit_of_item || '-'}</div>
                  <div className="text-xs text-muted-foreground">Opening: {formatNumber(r.opening_stock)}</div>
                </TableCell>

                <TableCell className="text-center">
                  <div className="text-xs">Sale: Rs {formatMoney(r.sale_price)}</div>
                  <div className="text-xs text-muted-foreground">Purchase: Rs {formatMoney(r.purchase_price)}</div>
                </TableCell>

                <TableCell>
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
