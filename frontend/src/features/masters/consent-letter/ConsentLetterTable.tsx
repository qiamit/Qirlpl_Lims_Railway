import { Eye, List, Pencil, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { ConsentLetterListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

const GRID_TABLE =
  'table-fixed min-w-[960px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const cellInnerClass = 'w-full space-y-0.5 p-[1mm]'

const primaryLineClass =
  'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'

const monoLineClass =
  'break-words font-mono text-[12px] font-semibold tabular-nums tracking-tight text-[#1c1917]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const actionBtnClass =
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

const actionDangerBtnClass =
  'rounded-none text-red-700 hover:bg-red-50 hover:text-red-800'

export function ConsentLetterTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onPrint,
  onView,
  onViewTestParameters,
  onEdit,
  onDelete,
  printBusyId,
  viewBusyId,
  deleteBusyId,
}: {
  rows: ConsentLetterListRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onPrint: (row: ConsentLetterListRow) => void
  onView: (row: ConsentLetterListRow) => void
  onViewTestParameters: (row: ConsentLetterListRow) => void
  onEdit: (row: ConsentLetterListRow) => void
  onDelete: (row: ConsentLetterListRow) => void
  printBusyId: string | null
  viewBusyId: string | null
  deleteBusyId: string | null
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
          <p className="text-sm text-[#57534e]">No consent letters generated yet.</p>
          <p className="mt-1 text-xs text-[#78716c]">
            Use &quot;Generate Consent Letter&quot; to create your first record.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[24%]" />
              <col className="w-[16%]" />
              <col className="w-[13%]" />
              <col className="w-[20%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn('w-[3%]', thBase)}>
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
                <TableHead className={cn('w-[14%]', thBase)}>Letter No</TableHead>
                <TableHead className={cn('w-[10%]', thBase)}>Date</TableHead>
                <TableHead className={cn('w-[24%]', thBase)}>Client</TableHead>
                <TableHead className={cn('w-[16%]', thBase)}>IS Code</TableHead>
                <TableHead className={cn('w-[13%]', thBase)}>Test Parameters</TableHead>
                <TableHead className={cn('w-[20%]', thBase)}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedIds.has(r.id)
                const even = index % 2 === 0
                const rowTone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass
                const busy =
                  deleteBusyId === r.id || viewBusyId === r.id || printBusyId === r.id

                return (
                  <TableRow
                    key={r.id}
                    data-state={selected ? 'selected' : undefined}
                    className={cn('group border-[#e7e0d4] transition-colors', rowTone)}
                  >
                    <TableCell className="w-[3%] text-center align-middle">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${fmt(r.consentLetterNo)}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>

                    <TableCell className="w-[14%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={monoLineClass}>{fmt(r.consentLetterNo)}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[10%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={monoLineClass}>{fmt(r.letterDate)}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[24%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={primaryLineClass}>{fmt(r.clientName)}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[16%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={primaryLineClass}>{fmt(r.isCodeLabel)}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[13%] align-middle text-center">
                      <div className="flex w-full items-center justify-center p-[1mm]">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 rounded-none border-stone-500 bg-stone-50 px-2.5 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
                          aria-label={`View test parameters for ${fmt(r.consentLetterNo)}`}
                          title="View test parameters"
                          disabled={r.testParameterNames.length === 0}
                          onClick={() => onViewTestParameters(r)}
                        >
                          <List size={14} />
                          View
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell className="w-[20%] align-middle text-center">
                      <div className="flex w-full items-center justify-center gap-0.5 p-[1mm]">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`View ${fmt(r.consentLetterNo)}`}
                          title="View consent letter"
                          disabled={busy}
                          onClick={() => onView(r)}
                        >
                          <Eye size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Print ${fmt(r.consentLetterNo)}`}
                          title="Print"
                          disabled={busy}
                          onClick={() => onPrint(r)}
                        >
                          <Printer size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label={`Edit ${fmt(r.consentLetterNo)}`}
                          title="Edit"
                          disabled={deleteBusyId === r.id}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionDangerBtnClass}
                          aria-label={`Delete ${fmt(r.consentLetterNo)}`}
                          title="Delete"
                          disabled={busy}
                          onClick={() => onDelete(r)}
                        >
                          <Trash2 size={16} />
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
