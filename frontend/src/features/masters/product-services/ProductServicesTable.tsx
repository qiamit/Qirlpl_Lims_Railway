import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { formatScopeNumber, type NablScopeRow } from './types'

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
  rows: NablScopeRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: NablScopeRow) => void
  onCopy: (row: NablScopeRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No scope entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-auto w-max min-w-full">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs w-[44px] text-center align-middle">
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
                <TableHead className="text-xs text-center align-middle w-[56px]">S.No</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[180px]">Discipline / Group</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[180px]">Materials / Products</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[220px]">Component / Parameter / Test</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[160px]">Test Method</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[120px]">Testing Type</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[100px]">Type of Test</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[88px]">Range Min</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[88px]">Range Max</TableHead>
                <TableHead className="text-xs text-center align-middle min-w-[100px]">Uncertainty</TableHead>
                <TableHead className="text-xs text-center align-middle w-[96px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Select row ${r.s_no}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>

                  <TableCell className="text-center align-middle font-medium">{r.s_no}</TableCell>

                  <TableCell className="text-center align-middle break-words whitespace-normal text-xs">
                    {r.discipline_group}
                  </TableCell>

                  <TableCell className="text-center align-middle break-words whitespace-normal text-xs">
                    {r.materials_products}
                  </TableCell>

                  <TableCell className="text-center align-middle break-words whitespace-normal text-xs">
                    {r.component_parameter}
                  </TableCell>

                  <TableCell className="text-center align-middle break-words whitespace-normal text-xs">
                    {r.test_method_specification}
                  </TableCell>

                  <TableCell className="text-center align-middle text-xs">{r.permanent_testing}</TableCell>

                  <TableCell className="text-center align-middle text-xs">
                    {r.type_of_test?.trim() || '—'}
                  </TableCell>

                  <TableCell className="text-center align-middle text-xs">
                    {formatScopeNumber(r.range_minimum)}
                  </TableCell>

                  <TableCell className="text-center align-middle text-xs">
                    {formatScopeNumber(r.range_maximum)}
                  </TableCell>

                  <TableCell className="text-center align-middle break-words whitespace-normal text-xs">
                    {r.uncertainty?.trim() || '—'}
                  </TableCell>

                  <TableCell className="align-middle">
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
        </div>
      )}
    </div>
  )
}
