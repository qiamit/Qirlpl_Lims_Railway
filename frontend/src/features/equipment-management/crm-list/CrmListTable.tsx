import { Copy, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsOutlineBtnClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatDateDisplay, formatTraceabilityValidity, type CrmRow } from './types'

const GRID_TABLE =
  'w-max min-w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'whitespace-nowrap bg-stone-800 px-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const primaryLineClass =
  'text-[12.5px] font-semibold tracking-tight text-[#292524]'

const secondaryLineClass = 'text-[11px] font-medium leading-snug text-[#78716c]'

const monoLineClass =
  'whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums tracking-tight text-[#1c1917]'

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
  onViewUncertainty,
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
  onViewUncertainty: (row: CrmRow) => void
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
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn(thBase, 'w-0 px-1.5')}>
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
                <TableHead className={thBase}>ID No</TableHead>
                <TableHead className={cn(thBase, 'min-w-[10rem] whitespace-normal')}>
                  CRM Type
                </TableHead>
                <TableHead className={thBase}>Make</TableHead>
                <TableHead className={thBase}>
                  Date of
                  <span className="mt-0.5 block text-[9px] font-semibold tracking-wide text-amber-200/80">
                    Purchase
                  </span>
                </TableHead>
                <TableHead className={thBase}>
                  Traceability
                  <span className="mt-0.5 block text-[9px] font-semibold tracking-wide text-amber-200/80">
                    Duration
                  </span>
                </TableHead>
                <TableHead className={thBase}>
                  Traceability
                  <span className="mt-0.5 block text-[9px] font-semibold tracking-wide text-amber-200/80">
                    As Per
                  </span>
                </TableHead>
                <TableHead className={thBase}>Uncertainty</TableHead>
                <TableHead className={cn(thBase, 'w-0')}>Action</TableHead>
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
                    <TableCell className="w-0 whitespace-nowrap px-1.5 align-middle text-center">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${r.id_no}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 align-middle text-center">
                      <span className={monoLineClass}>{r.id_no || '—'}</span>
                    </TableCell>
                    <TableCell className="min-w-[10rem] max-w-[16rem] px-2 align-middle text-center">
                      <p className={cn(primaryLineClass, 'text-center')}>{r.crm_type || '—'}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 align-middle text-center">
                      <p className={cn(secondaryLineClass, 'text-center')}>{r.make || '—'}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 align-middle text-center">
                      <span className={monoLineClass}>
                        {formatDateDisplay(r.date_of_purchase)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 align-middle text-center">
                      <div
                        className="leading-tight"
                        title={formatTraceabilityValidity(r.traceability_from, r.valid_upto)}
                      >
                        <span className={cn(monoLineClass, 'block')}>
                          {formatDateDisplay(r.traceability_from)}
                        </span>
                        <span className={cn(monoLineClass, 'mt-0.5 block text-[11px] text-[#57534e]')}>
                          {formatDateDisplay(r.valid_upto)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 align-middle text-center">
                      <p className={cn(secondaryLineClass, 'text-center')}>
                        {r.traceability_as_per || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="w-0 whitespace-nowrap px-2 align-middle text-center">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
                        aria-label={`View uncertainty for ${r.id_no || 'CRM'}`}
                        title="View element-wise uncertainty"
                        onClick={() => onViewUncertainty(r)}
                      >
                        <Eye size={13} />
                        View
                      </Button>
                    </TableCell>
                    <TableCell className="w-0 whitespace-nowrap px-1.5 align-middle text-center">
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
