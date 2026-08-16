import { Copy, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  auditTypeLabel,
  formatDate,
  formatProposedRange,
  type AuditPlanRow,
} from './types'

const GRID_TABLE =
  'min-w-[780px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const TH =
  'text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
const stickyEven = 'bg-[#f7f3eb]'
const stickyOdd = 'bg-[#fffcf7]'
const stickySelected = 'bg-[#fde68a]/80'
const stickyHover = 'group-hover:bg-[#f3e9d8]'
const stickySelectedHover = 'group-hover:bg-[#fde68a]/80'

export function AuditPlanTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onView,
  onEdit,
  onCopy,
}: {
  rows: AuditPlanRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onView: (row: AuditPlanRow) => void
  onEdit: (row: AuditPlanRow) => void
  onCopy: (row: AuditPlanRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error ? <p className="px-3 pt-3 text-sm text-destructive sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No audit plans match your search.' : 'No audit plans added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Use &quot;Add New Audit Plan&quot; to create your first record.
            </p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className={`sticky left-0 z-10 w-12 bg-stone-800 sm:w-14 ${TH}`}>
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
              <TableHead
                className={`sticky left-12 z-10 min-w-[110px] bg-stone-800 text-left sm:left-14 ${TH}`}
              >
                Audit ID
              </TableHead>
              <TableHead className={`min-w-[80px] ${TH}`}>Type</TableHead>
              <TableHead className={`min-w-[160px] ${TH}`}>Proposed From–To</TableHead>
              <TableHead className={`min-w-[110px] ${TH}`}>Next Audit Date</TableHead>
              <TableHead className={`min-w-[120px] ${TH}`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const even = index % 2 === 0
              const stickyBg = selected
                ? stickySelected
                : even
                  ? stickyEven
                  : stickyOdd
              const stickyHoverClass = selected ? stickySelectedHover : stickyHover

              return (
                <TableRow
                  key={r.id}
                  data-state={selected ? 'selected' : undefined}
                  className={cn(
                    'group border-b border-[#e7e0d4] transition-colors',
                    selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass,
                  )}
                >
                  <TableCell
                    className={cn(
                      'sticky left-0 z-10 text-center align-middle',
                      stickyBg,
                      stickyHoverClass,
                    )}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.audit_id}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'sticky left-12 z-10 align-middle text-left sm:left-14',
                      stickyBg,
                      stickyHoverClass,
                    )}
                  >
                    <p className="font-mono text-sm font-medium text-foreground" title={r.audit_id}>
                      {r.audit_id}
                    </p>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm text-foreground">{auditTypeLabel(r.audit_type)}</span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm tabular-nums text-foreground">
                      {formatProposedRange(r.proposed_from, r.proposed_to)}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm tabular-nums text-foreground">
                      {formatDate(r.next_audit_date)}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`View team details ${r.audit_id}`}
                        title="View Auditee / Auditor / Criteria"
                        onClick={() => onView(r)}
                      >
                        <Eye size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${r.audit_id}`}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Copy ${r.audit_id}`}
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
