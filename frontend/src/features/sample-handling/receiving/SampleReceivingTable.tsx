import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { SampleRow } from '../types'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '-')

export function SampleReceivingTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: SampleRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: SampleRow) => void
  onCopy: (row: SampleRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No samples in receiving. If you are looking for an SRF (e.g. QI/SRF/260305-01), it may have been moved to Sample Allocation or a later stage—check those modules. You can also clear the search box or go to another page.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs w-[36px] text-center">
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
              <TableHead className="text-xs">SRF Number &amp; Date</TableHead>
              <TableHead className="text-xs text-center">Name of the Customer</TableHead>
              <TableHead className="text-xs text-center">Sample Codes</TableHead>
              <TableHead className="text-xs text-center">Sample Description</TableHead>
              <TableHead className="text-xs text-center">Date for Reporting</TableHead>
              <TableHead className="text-xs text-center">Sample Status</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.srf_number ?? r.sample_code ?? r.id}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </TableCell>
                <TableCell className="break-words">
                  <div className="font-medium">{fmt(r.srf_number)}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(r.date_of_sample_receiving)}</div>
                </TableCell>
                <TableCell className="text-center">{fmt(r.client_name)}</TableCell>
                <TableCell className="text-center">
                  <div>{fmt(r.sample_code)}</div>
                  <div className="text-xs text-muted-foreground">{fmt(r.sample_qr_code)}</div>
                </TableCell>
                <TableCell className="text-center break-words">{fmt(r.sample_description || r.description)}</TableCell>
                <TableCell className="text-center">
                  <div>{fmtDate(r.tentative_date_required)}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(r.tentative_date_by_lab)}</div>
                </TableCell>
                <TableCell className="text-center">{fmt(r.sample_receiving_status || r.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit"
                      disabled={Boolean(r.sample_code != null && String(r.sample_code).trim() !== '' && !r.referback_from_allocation)}
                      onClick={() => onEdit(r)}
                    >
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
