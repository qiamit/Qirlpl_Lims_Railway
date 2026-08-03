import { useState } from 'react'
import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  rangesFromRow,
  type CalibrationEquipmentRow,
  type EquipmentRangeEntry,
} from './types'

const GRID_TABLE =
  'min-w-[720px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function cellText(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : '—'
}

function withUnit(value: string | null | undefined, unit: string | null | undefined): string {
  const v = (value ?? '').trim()
  const u = (unit ?? '').trim()
  if (!v && !u) return '—'
  if (!v) return u
  if (!u) return v
  return `${v} ${u}`
}

function MeasurementRangesDialog({
  open,
  onOpenChange,
  equipmentName,
  ranges,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName: string
  ranges: EquipmentRangeEntry[]
  title: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:rounded-lg" aria-describedby={undefined}>
        <DialogHeader className="border-b border-border bg-slate-900 px-4 py-3 text-left">
          <DialogTitle className="text-base font-semibold text-white">
            {title} — {equipmentName || 'Equipment'}
          </DialogTitle>
          <p className="text-xs text-teal-200/80">{ranges.length} measurement range(s)</p>
        </DialogHeader>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto bg-[#fafbfc] px-4 py-3">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-semibold">#</th>
                <th className="pb-2 pr-3 font-semibold">Range</th>
                <th className="pb-2 pr-3 font-semibold">Least Count</th>
                <th className="pb-2 font-semibold">Unit</th>
              </tr>
            </thead>
            <tbody>
              {ranges.map((rng, i) => (
                <tr key={rng.id} className="border-b border-border/70 last:border-0">
                  <td className="py-2 pr-3 align-top text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-3 align-top text-foreground">
                    {cellText(rng.rangeCapacity)}
                  </td>
                  <td className="py-2 pr-3 align-top text-foreground">
                    {cellText(rng.resolutionLeastCount)}
                  </td>
                  <td className="py-2 align-top text-foreground">{cellText(rng.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ViewRangesButton({
  equipmentName,
  ranges,
}: {
  equipmentName: string
  ranges: EquipmentRangeEntry[]
}) {
  const [open, setOpen] = useState(false)
  const count = ranges.length

  if (count === 0) {
    return <p className="text-sm text-muted-foreground">—</p>
  }

  if (count === 1) {
    const display = withUnit(ranges[0]!.rangeCapacity, ranges[0]!.unit)
    return (
      <p className="truncate text-sm text-foreground" title={display}>
        {display}
      </p>
    )
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 border-teal-600/40 px-2.5 text-xs font-medium text-teal-800 hover:bg-teal-50"
        onClick={() => setOpen(true)}
        aria-label={`View ${count} ranges for ${equipmentName || 'equipment'}`}
      >
        View Ranges {count}
      </Button>
      <MeasurementRangesDialog
        open={open}
        onOpenChange={setOpen}
        equipmentName={equipmentName}
        ranges={ranges}
        title="Ranges"
      />
    </>
  )
}

function ViewLeastCountButton({
  equipmentName,
  ranges,
}: {
  equipmentName: string
  ranges: EquipmentRangeEntry[]
}) {
  const [open, setOpen] = useState(false)
  const count = ranges.length

  if (count === 0) {
    return <p className="text-sm text-muted-foreground">—</p>
  }

  if (count === 1) {
    const display = withUnit(ranges[0]!.resolutionLeastCount, ranges[0]!.unit)
    return (
      <p className="truncate text-sm text-foreground" title={display}>
        {display}
      </p>
    )
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 border-teal-600/40 px-2.5 text-xs font-medium text-teal-800 hover:bg-teal-50"
        onClick={() => setOpen(true)}
        aria-label={`View ${count} least counts for ${equipmentName || 'equipment'}`}
      >
        View Least Count {count}
      </Button>
      <MeasurementRangesDialog
        open={open}
        onOpenChange={setOpen}
        equipmentName={equipmentName}
        ranges={ranges}
        title="Least Count"
      />
    </>
  )
}

export function CalibrationEquipmentsTable({
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
  rows: CalibrationEquipmentRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: CalibrationEquipmentRow) => void
  onCopy: (row: CalibrationEquipmentRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {error ? <p className="px-3 pt-3 text-sm text-destructive sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive
              ? 'No equipments match your search.'
              : 'No calibration equipments added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Use &quot;Add New Equipment&quot; to create your first record.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="sticky left-0 z-10 w-12 bg-muted/50 text-center text-xs sm:w-14">
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
                <TableHead className="sticky left-12 z-10 min-w-[160px] bg-muted/50 text-left text-xs sm:left-14">
                  Equipment Name
                </TableHead>
                <TableHead className="min-w-[160px] text-center text-xs">
                  Calibration Method
                </TableHead>
                <TableHead className="min-w-[130px] text-center text-xs">Range</TableHead>
                <TableHead className="min-w-[140px] text-center text-xs">Least Count</TableHead>
                <TableHead className="min-w-[96px] text-center text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const selected = selectedIds.has(r.id)
                const ranges = rangesFromRow(r)

                return (
                  <TableRow key={r.id} data-state={selected ? 'selected' : undefined}>
                    <TableCell
                      className={cn(
                        'sticky left-0 z-10 text-center align-middle',
                        selected ? 'bg-muted' : 'bg-card',
                      )}
                    >
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${r.equipment_name || r.asset_code}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'sticky left-12 z-10 align-middle text-left sm:left-14',
                        selected ? 'bg-muted' : 'bg-card',
                      )}
                    >
                      <p
                        className="truncate text-sm font-medium text-foreground"
                        title={r.equipment_name}
                      >
                        {cellText(r.equipment_name)}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <p
                        className="truncate text-sm text-foreground"
                        title={r.calibration_method_label ?? undefined}
                      >
                        {cellText(r.calibration_method_label)}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <ViewRangesButton
                        equipmentName={r.equipment_name || r.asset_code}
                        ranges={ranges}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <ViewLeastCountButton
                        equipmentName={r.equipment_name || r.asset_code}
                        ranges={ranges}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="inline-flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit ${r.asset_code}`}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Copy ${r.asset_code}`}
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
