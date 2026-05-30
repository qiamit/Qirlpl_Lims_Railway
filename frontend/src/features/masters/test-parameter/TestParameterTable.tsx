import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { AccreditationBodyRow, TestParameterRow } from './types'

const formatMoney = (value: number | null | undefined) => {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return `${v.toFixed(2)}`
}

function formatTestingCondition(
  r: TestParameterRow,
  accreditationBodies: AccreditationBodyRow[],
): string {
  const temp = r.temperature_of_test ? `${r.temperature_of_test} °C` : '—'
  const humidity = r.humidity_of_test ? `${r.humidity_of_test} %` : '—'
  const time = r.testing_time ? `${r.testing_time} Hr` : '—'
  const acc =
    r.under_accreditation_ids?.length && accreditationBodies.length
      ? r.under_accreditation_ids
          .map((id) => accreditationBodies.find((b) => b.id === id)?.name)
          .filter(Boolean)
          .join(', ') || '—'
      : '—'
  return `${temp} | ${humidity} | ${time} | ${acc}`
}

export function TestParameterTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
  onViewFile,
  accreditationBodies = [],
}: {
  rows: TestParameterRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: TestParameterRow) => void
  onCopy: (row: TestParameterRow) => void
  onViewFile?: (row: TestParameterRow) => void
  accreditationBodies?: AccreditationBodyRow[]
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No test parameters added yet.</p>
      ) : (
        <Table>
          <colgroup>
            <col style={{ width: '44px' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '33%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '6%' }} />
          </colgroup>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs text-center">
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
              <TableHead className="text-xs">IS Code</TableHead>
              <TableHead className="text-xs text-center">Name of the Test Parameter</TableHead>
              <TableHead className="text-xs text-center">Test Method</TableHead>
              <TableHead className="text-xs text-center">Specific Requirements</TableHead>
              <TableHead className="text-xs text-center">UOM &amp; Conformity</TableHead>
              <TableHead className="text-xs text-center">Testing Condition</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
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
                <TableCell className="align-top">
                  <div className="font-medium">{r.is_code_label || '-'}</div>
                  <div className="text-xs text-muted-foreground">
                    Rs {formatMoney(r.testing_charges)}
                  </div>
                </TableCell>
                <TableCell className="align-top text-center">
                  <div className="text-xs">{r.item_name || '-'}</div>
                </TableCell>
                <TableCell className="align-top text-center">
                  <div className="text-xs font-medium">{r.test_method || '-'}</div>
                  <div className="text-xs text-muted-foreground">
                    (Cl - {r.clause_no || '-'} | {r.unit_value || '-'})
                  </div>
                </TableCell>
                <TableCell className="align-top text-center">
                  <div className="text-xs">{r.specific_requirement || '-'}</div>
                </TableCell>
                <TableCell className="align-top text-center">
                  <div className="text-xs">UOM: {r.uncertainty_mu || '-'}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.conformity ?? 'Yes'}
                    {onViewFile && (
                      <>
                        {' | '}
                        <button
                          type="button"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          onClick={() => onViewFile(r)}
                        >
                          View File
                        </button>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="align-top text-center">
                  <div className="text-xs break-words max-w-[12rem]">
                    {formatTestingCondition(r, accreditationBodies)}
                  </div>
                </TableCell>
                <TableCell className="text-center">
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
