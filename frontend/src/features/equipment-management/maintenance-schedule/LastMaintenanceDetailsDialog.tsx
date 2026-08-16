import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { MaintenanceChecklistItem } from '@/features/masters/equipment-master/types'
import type { MaintenanceHistoryRecord } from '@/features/masters/equipment-master/maintenanceHistory'
import { sortMaintenanceHistoryNewestFirst } from '@/features/masters/equipment-master/maintenanceHistory'
import { MAINTENANCE_SOURCE_LABELS, type MaintenanceSource } from './types'

export type LastMaintenanceDetails = {
  source: MaintenanceSource
  assetCode: string
  equipmentName: string
  location: string
  frequency: string
  lastMaintenanceDate: string
  nextMaintenanceDate: string
  doneByName: string
  checklist: MaintenanceChecklistItem[]
  history: MaintenanceHistoryRecord[]
}

const GRID_TABLE =
  'table-fixed w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{label}</p>
      <p className="break-words text-sm font-semibold text-stone-900">{value || '—'}</p>
    </div>
  )
}

export function LastMaintenanceDetailsDialog({
  open,
  onOpenChange,
  details,
  loading,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  details: LastMaintenanceDetails | null
  loading?: boolean
  error?: string | null
}) {
  const history = details
    ? sortMaintenanceHistoryNewestFirst(details.history)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Last Maintenance Details
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-600">Loading details…</p>
          ) : error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : details ? (
            <>
              <section className={cn(limsPanelClass, 'bg-white p-4')}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Equipment" value={details.equipmentName} />
                  <Field label="Asset Code" value={details.assetCode} />
                  <Field label="Source" value={MAINTENANCE_SOURCE_LABELS[details.source]} />
                  <Field label="Location" value={details.location} />
                  <Field label="Frequency" value={details.frequency} />
                  <Field
                    label="Last Maintenance"
                    value={
                      details.lastMaintenanceDate
                        ? formatDate(details.lastMaintenanceDate)
                        : '—'
                    }
                  />
                  <Field
                    label="Next Due"
                    value={
                      details.nextMaintenanceDate
                        ? formatDate(details.nextMaintenanceDate)
                        : '—'
                    }
                  />
                  <Field label="Done By" value={details.doneByName} />
                </div>
              </section>

              <section className={cn(limsPanelClass, 'bg-white p-4')}>
                <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                  Checklist
                </h3>
                {details.checklist.length === 0 ? (
                  <p className="text-sm text-stone-500">No checklist recorded for this maintenance.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className={GRID_TABLE}>
                      <TableHeader>
                        <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                          <TableHead className={cn(thBase, 'text-left')}>Check Point</TableHead>
                          <TableHead className={thBase}>Status</TableHead>
                          <TableHead className={cn(thBase, 'text-left')}>Repair If Any</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {details.checklist.map((item, index) => (
                          <TableRow
                            key={`${item.checkPoint}-${index}`}
                            className={index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}
                          >
                            <TableCell className="text-left text-sm text-stone-800">
                              {item.checkPoint || '—'}
                            </TableCell>
                            <TableCell className="text-center text-sm font-semibold text-stone-800">
                              {item.status || '—'}
                            </TableCell>
                            <TableCell className="text-left text-sm text-stone-700">
                              {item.repairIfAny || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              <section className={cn(limsPanelClass, 'bg-white p-4')}>
                <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                  Maintenance History
                </h3>
                {history.length === 0 ? (
                  <p className="text-sm text-stone-500">No prior maintenance history found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className={GRID_TABLE}>
                      <TableHeader>
                        <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                          <TableHead className={thBase}>Date</TableHead>
                          <TableHead className={thBase}>Done By</TableHead>
                          <TableHead className={thBase}>Next Due</TableHead>
                          <TableHead className={thBase}>Checks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((record, index) => (
                          <TableRow
                            key={record.id}
                            className={index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}
                          >
                            <TableCell className="text-center text-sm text-stone-800">
                              {record.conductedOn ? formatDate(record.conductedOn) : '—'}
                            </TableCell>
                            <TableCell className="text-center text-sm text-stone-800">
                              {record.doneByName || record.doneBy || '—'}
                            </TableCell>
                            <TableCell className="text-center text-sm text-stone-800">
                              {record.nextDueDate ? formatDate(record.nextDueDate) : '—'}
                            </TableCell>
                            <TableCell className="text-center text-sm text-stone-800">
                              {record.checklist.length}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-stone-500">No details available.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
