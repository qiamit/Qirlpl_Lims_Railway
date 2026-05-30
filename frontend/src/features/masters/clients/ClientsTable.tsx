import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ClientRow } from './types'

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
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No clients added yet.</p>
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
              <TableHead className="text-xs">Company Identity</TableHead>
              <TableHead className="text-xs text-center">Type &amp; Scale</TableHead>
              <TableHead className="text-xs text-center">Contact Details</TableHead>
              <TableHead className="text-xs text-center">Address</TableHead>
              <TableHead className="text-xs text-center">Balance</TableHead>
              <TableHead className="text-xs text-center w-[96px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.company_name}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </TableCell>
                <TableCell className="break-words whitespace-normal">
                  <div className="font-medium">{r.company_name}</div>
                  <div className="text-xs text-muted-foreground">GST: {r.gst_number || '-'}</div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="text-xs">{r.company_type}</div>
                  <div className="text-xs text-muted-foreground">{r.company_scale}</div>
                </TableCell>
                <TableCell className="text-center break-words whitespace-normal">
                  <div className="text-xs">{r.contact_person_name || '-'}</div>
                  <div className="text-xs text-muted-foreground">{r.email || '-'}</div>
                  <div className="text-xs text-muted-foreground">{`${r.country_code || ''} ${r.mobile || ''}`.trim() || '-'}</div>
                </TableCell>
                <TableCell className="text-center break-words whitespace-normal">
                  <div className="text-xs">
                    {[
                      r.address?.trim() ? r.address.trim() : null,
                      r.district?.trim() ? r.district.trim() : null,
                      r.pin_code?.trim() ? r.pin_code.trim() : null,
                      r.state?.trim() ? r.state.trim() : null,
                      r.country?.trim() ? r.country.trim() : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="text-xs">{r.balance_type}</div>
                  <div className="text-xs text-muted-foreground">₹ {formatMoney(r.opening_balance)}</div>
                  <div className="text-xs text-muted-foreground">{r.payment_term}</div>
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
