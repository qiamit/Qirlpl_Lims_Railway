import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatDateDisplay, type CrmRow } from './types'

const GRID_TABLE =
  'table-fixed min-w-[1100px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

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
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

export function CrmListTable({
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
  rows: CrmRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: CrmRow) => void
  onCopy: (row: CrmRow) => void
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
          <p className="text-sm text-[#57534e]">
            {searchActive ? 'No CRMs match your search.' : 'No CRMs added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">
              Use &quot;Add CRM&quot; to create your first Certified Reference Material record.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[5%]" />
              <col className="w-[9%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={thBase}>
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
                <TableHead className={thBase}>Sr. No.</TableHead>
                <TableHead className={thBase}>ID No</TableHead>
                <TableHead className={thBase}>CRM Type</TableHead>
                <TableHead className={thBase}>Make</TableHead>
                <TableHead className={thBase}>Year of Purchase</TableHead>
                <TableHead className={thBase}>Traceability From</TableHead>
                <TableHead className={thBase}>Traceability As Per</TableHead>
                <TableHead className={thBase}>Uncertainty</TableHead>
                <TableHead className={thBase}>Valid Up To</TableHead>
                <TableHead className={thBase}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedIds.has(r.id)
                const even = index % 2 === 0
                return (
                  <TableRow
                    key={r.id}
                    data-state={selected ? 'selected' : undefined}
                    className={cn(
                      'border-b border-[#e7e0d4] transition-colors',
                      selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass,
                    )}
                  >
                    <TableCell className="align-middle text-center">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${r.id_no}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={monoLineClass}>{r.s_no}</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={monoLineClass}>{r.id_no || '—'}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={primaryLineClass}>{r.crm_type || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={secondaryLineClass}>{r.make || '—'}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={monoLineClass}>
                        {r.year_of_purchase != null ? r.year_of_purchase : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={secondaryLineClass}>{r.traceability_from || '—'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p className={secondaryLineClass}>{r.traceability_as_per || '—'}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={monoLineClass}>{r.uncertainty || '—'}</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className={monoLineClass}>{formatDateDisplay(r.valid_upto)}</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="inline-flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Edit ${r.id_no}`}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Copy ${r.id_no}`}
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
        </div>
      )}
    </div>
  )
}
