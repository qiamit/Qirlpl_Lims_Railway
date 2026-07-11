import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { EquipmentRow } from './types'
import { Badge } from '@/components/ui/badge'

export function EquipmentTable({
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
  rows: EquipmentRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: EquipmentRow, section?: 'calibration' | 'intermediate' | 'maintenance') => void
  onCopy: (row: EquipmentRow) => void
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

  const formatDateToDDMMYYYY = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const [year, month, day] = parts
      if (year.length === 4 && month.length === 2 && day.length === 2) {
        return `${day}-${month}-${year}`
      }
    }
    return dateStr
  }

  const renderScheduleRow = (
    label: string,
    frequency: string | null,
    lastDate: string | null,
    nextDue: string | null,
    sectionKey: 'calibration' | 'intermediate' | 'maintenance',
    row: EquipmentRow
  ) => {
    const freqText = frequency || 'N/A'
    const lastText = formatDateToDDMMYYYY(lastDate)
    const dueText = formatDateToDDMMYYYY(nextDue)
    
    let badge = null
    if (nextDue) {
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
      badge = (
        <button
          type="button"
          onClick={() => onEdit(row, sectionKey)}
          className={`text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded border transition-colors cursor-pointer ${statusClass}`}
        >
          {statusText}
        </button>
      )
    } else {
      badge = (
        <button
          type="button"
          onClick={() => onEdit(row, sectionKey)}
          className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          N/A
        </button>
      )
    }

    return (
      <tr className="border-b border-border/30 last:border-b-0 hover:bg-muted/30 text-[11px]">
        <td className="py-2 font-semibold text-foreground text-left align-middle">{label}</td>
        <td className="py-2 text-muted-foreground text-center align-middle">{freqText}</td>
        <td className="py-2 font-mono text-muted-foreground/90 text-center align-middle">{lastText}</td>
        <td className="py-2 font-mono text-foreground font-semibold text-center align-middle">{dueText}</td>
        <td className="py-2 text-right align-middle">{badge}</td>
      </tr>
    )
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-card overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No equipment added yet.</p>
      ) : (
        <div className="[&>div]:overflow-x-auto">
          <Table className="w-full table-fixed min-w-[1380px]">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[30%]" />
              <col className="w-[80px]" />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/50">
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
                <TableHead className="text-left text-xs">Equipment Identity</TableHead>
                <TableHead className="text-xs text-center">Make &amp; Serial</TableHead>
                <TableHead className="text-xs text-center">Technical Details</TableHead>
                <TableHead className="text-xs text-center">Location &amp; Custodian</TableHead>
                <TableHead className="text-xs text-center">Calibration &amp; Maintenance Status</TableHead>
                <TableHead className="text-xs text-center">Action</TableHead>
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
                    <TableCell className="align-middle text-center">
                      <div className="text-xs leading-snug">
                        <span className="text-muted-foreground">Range: </span>
                        <span className="font-medium">{r.range_capacity || '-'}</span>
                      </div>
                      <div className="text-xs leading-snug mt-0.5">
                        <span className="text-muted-foreground">Least Count: </span>
                        <span className="font-medium">{r.resolution_least_count || '-'}</span>
                      </div>
                      <div className="text-[11px] leading-snug mt-0.5 text-muted-foreground/90 line-clamp-2">
                        <span className="text-muted-foreground">Acceptance: </span>
                        <span>{r.accuracy_acceptance_criteria || '-'}</span>
                      </div>
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
                    <TableCell className="align-middle px-3 py-2 text-center">
                      <div className="min-w-[340px] text-xs">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-border/60 text-[10px] uppercase font-bold text-muted-foreground">
                              <th className="py-1 text-left font-semibold">Type</th>
                              <th className="py-1 text-center font-semibold">Frequency</th>
                              <th className="py-1 text-center font-semibold">Last</th>
                              <th className="py-1 text-center font-semibold">Due</th>
                              <th className="py-1 text-right font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {renderScheduleRow(
                              'Calibration',
                              r.calibration_frequency,
                              r.last_calibration_date,
                              r.next_calibration_due,
                              'calibration',
                              r
                            )}
                            {renderScheduleRow(
                              'Intermediate',
                              r.intermediate_check_frequency,
                              r.last_intermediate_check_date,
                              r.next_intermediate_check_date,
                              'intermediate',
                              r
                            )}
                            {renderScheduleRow(
                              'Maintenance',
                              r.maintenance_schedule_frequency,
                              r.last_maintenance_date,
                              r.next_maintenance_date,
                              'maintenance',
                              r
                            )}
                          </tbody>
                        </table>
                      </div>
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
