import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { IqcRow } from './types'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

export function IqcTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
  employeeMap,
}: {
  rows: IqcRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: IqcRow, section?: 'calibration') => void
  onCopy: (row: IqcRow) => void
  employeeMap: Record<string, string>
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  const isCalibrationDueSoon = (dateStr: string | null) => {
    if (!dateStr) return false
    const due = new Date(dateStr)
    if (Number.isNaN(due.getTime())) return false
    const now = new Date()
    const diffTime = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays <= 30
  }

  const isCalibrationOverdue = (dateStr: string | null) => {
    if (!dateStr) return false
    const due = new Date(dateStr)
    if (Number.isNaN(due.getTime())) return false
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    return due.getTime() < now.getTime()
  }

  const formatDateToDDMMYYYY = (dateStr: string | null) => formatDate(dateStr)

  const renderStatusBadge = (nextDue: string | null, row: IqcRow) => {
    if (!nextDue) {
      return (
        <button
          type="button"
          onClick={() => onEdit(row, 'calibration')}
          className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          N/A
        </button>
      )
    }

    const overdue = isCalibrationOverdue(nextDue)
    const dueSoon = isCalibrationDueSoon(nextDue)
    
    let statusText = 'Active'
    let statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
    if (overdue) {
      statusText = 'Overdue'
      statusClass = 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30'
    } else if (dueSoon) {
      statusText = 'Due Soon'
      statusClass = 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
    }

    return (
      <button
        type="button"
        onClick={() => onEdit(row, 'calibration')}
        className={`text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded border transition-colors cursor-pointer ${statusClass}`}
      >
        {statusText}
      </button>
    )
  }


  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No IQC standards added yet.</p>
      ) : (
        <div className="[&>div]:overflow-x-auto">
          <Table className="w-full table-fixed min-w-[1200px]">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[22%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[80px]" />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-stone-800 hover:bg-stone-800">
                <TableHead className="px-2 text-center text-xs">
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
                <TableHead className="text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">IQC Master Standard</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Make &amp; Serial</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Location &amp; Custodian</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Cal Frequency</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Last Cal Date</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Next Due</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const status = r.equipment_status ?? 'Active'
                
                let statusBadgeVariant: 'default' | 'secondary' | 'destructive' = 'default'
                if (status === 'In Repair') {
                  statusBadgeVariant = 'destructive'
                } else if (status === 'Idle') {
                  statusBadgeVariant = 'secondary'
                }

                return (
                  <TableRow key={r.id}>
                    <TableCell className="align-middle px-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.equipment_name}`}
                        checked={selectedIds.has(r.id)}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-left">
                      <div className="line-clamp-2 break-words font-medium leading-snug">{r.equipment_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.asset_code}</div>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="text-xs font-medium leading-snug">{r.manufacturer || '-'}</div>
                      <div className="text-xs text-muted-foreground">S/N: {r.serial_number || '-'}</div>
                      <div className="text-[11px] text-muted-foreground/80">Model: {r.model_number || '-'}</div>
                    </TableCell>
                    <TableCell className="align-middle text-center space-y-1">
                      <div className="text-xs font-medium">{r.current_location || '-'}</div>
                      <div className="text-[11px] text-muted-foreground">{employeeMap[r.custodian_employee_id || ''] || '-'}</div>
                      <div className="flex justify-center pt-0.5">
                        <Badge variant={statusBadgeVariant} className="text-[10px] py-0 px-2 h-5">
                          {status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-center text-xs text-muted-foreground">
                      {r.calibration_frequency || 'N/A'}
                    </TableCell>
                    <TableCell className="align-middle text-center font-mono text-xs text-muted-foreground/90">
                      {formatDateToDDMMYYYY(r.last_calibration_date)}
                    </TableCell>
                    <TableCell className="align-middle text-center font-mono text-xs font-semibold text-foreground">
                      {formatDateToDDMMYYYY(r.next_calibration_due)}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {renderStatusBadge(r.next_calibration_due, r)}
                    </TableCell>
                    <TableCell className="align-middle text-center">
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
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
