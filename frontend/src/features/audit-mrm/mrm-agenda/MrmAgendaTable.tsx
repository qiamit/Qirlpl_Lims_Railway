import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass, limsTableBodyToneClass, limsTableHeadClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  formatDate,
  formatPlannedRange,
  mrmStatusLabel,
  type MrmPlanRow,
  type MrmPlanStatus,
} from './types'

const GRID_TABLE =
  'min-w-[980px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function statusBadgeClass(status: MrmPlanStatus) {
  if (status === 'communicated') return 'border-emerald-600 bg-emerald-50 text-emerald-900'
  if (status === 'planned') return 'border-amber-600 bg-amber-50 text-amber-950'
  return 'border-stone-500 bg-stone-100 text-stone-800'
}

export function MrmAgendaTable({
  rows,
  loading,
  selectedIds,
  onToggleAll,
  onToggleOne,
  onEdit,
}: {
  rows: MrmPlanRow[]
  loading: boolean
  selectedIds: Set<string>
  onToggleAll: (checked: boolean) => void
  onToggleOne: (id: string, checked: boolean) => void
  onEdit: (row: MrmPlanRow) => void
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  return (
    <div className={cn(limsPanelClass)}>
      <div className="overflow-x-auto">
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className={cn(limsTableHeadClass, 'hover:bg-stone-800')}>
              <TableHead className="w-10 text-center">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  aria-label="Select all MRM plans"
                  disabled={loading || rows.length === 0}
                />
              </TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Plan ID
              </TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Planned Dates
              </TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Venue
              </TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Chairperson
              </TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Status
              </TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Agenda
              </TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Recipients
              </TableHead>
              <TableHead className="w-16 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Edit
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  Loading MRM plans…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No MRM plans yet. Create a plan to seed ISO 17025 Clause 8.9.2 agenda points.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, idx) => {
                const selected = selectedIds.has(r.id)
                const includedCount = r.agendaItems.filter((a) => a.included).length
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      selected ? 'bg-amber-100/70' : idx % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-white',
                      'hover:bg-amber-50/80',
                    )}
                  >
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={selected}
                        onChange={(e) => onToggleOne(r.id, e.target.checked)}
                        aria-label={`Select ${r.planCode}`}
                      />
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium text-stone-900">
                      {r.planCode}
                    </TableCell>
                    <TableCell className="text-center text-sm text-stone-800">
                      {formatPlannedRange(r.plannedFrom, r.plannedTo)}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-center text-sm text-stone-800" title={r.venue}>
                      {r.venue || '—'}
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate text-center text-sm text-stone-800" title={r.chairperson}>
                      {r.chairperson || '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn('rounded-none text-[10px] font-semibold', statusBadgeClass(r.status))}
                      >
                        {mrmStatusLabel(r.status)}
                      </Badge>
                      {r.communicatedAt ? (
                        <p className="mt-0.5 text-[10px] text-stone-500">
                          {formatDate(r.communicatedAt.slice(0, 10))}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums text-stone-800">
                      {includedCount}/15
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums text-stone-800">
                      {r.recipients.length}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-none border-stone-500 px-2"
                        onClick={() => onEdit(r)}
                        aria-label={`Edit ${r.planCode}`}
                      >
                        <Pencil size={13} />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
