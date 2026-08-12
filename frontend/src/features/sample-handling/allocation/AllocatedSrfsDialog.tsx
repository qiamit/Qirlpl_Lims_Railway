import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Pencil, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { AllocationRow } from '../types'
import {
  areSampleAllocationActionsLocked,
  getSectionCodesInTestAllocation,
  sampleAllocationEditLockedTitle,
} from './sampleAllocationEditLock'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')
const fmtDate = (v: string | null | undefined) => formatDate(v)
const joinList = (arr: string[]) => arr.filter(Boolean).join(', ') || '—'

const th = cn(limsTableHeadClass, 'border border-stone-700 px-2 py-1.5')
const td = 'border border-[#e7e0d4] px-2 py-1.5 text-sm'

export function AllocatedSrfsDialog({
  open,
  onOpenChange,
  rows,
  selectedIds,
  onToggle,
  onToggleAll,
  sampleAllocationIdsWithTestAllocation,
  onEdit,
  onReferbackToReceiving,
  onSendToTestAllocation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: AllocationRow[]
  selectedIds: Set<string>
  onToggle: (sampleId: string) => void
  onToggleAll: (checked: boolean, sampleIds?: string[]) => void
  sampleAllocationIdsWithTestAllocation?: Set<string>
  onEdit?: (row: AllocationRow) => void
  onReferbackToReceiving?: (row: AllocationRow) => void
  onSendToTestAllocation?: (row: AllocationRow) => void
}) {
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')

  useEffect(() => {
    if (!open) {
      setSearch('')
      setPage(1)
      setJumpTo('')
    }
  }, [open])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.sample.srf_number,
        r.sample.sample_code,
        r.sample.test_report_is_code_label,
        r.sectionCodes.join(' '),
        r.departments.join(' '),
        r.quantities.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount))
  }, [pageCount])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const filteredIds = useMemo(() => filteredRows.map((r) => r.sampleId), [filteredRows])
  const allChecked = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))
  const someChecked = filteredIds.some((id) => selectedIds.has(id))
  const selectedOnFiltered = filteredIds.filter((id) => selectedIds.has(id)).length
  const testAllocIds = sampleAllocationIdsWithTestAllocation ?? new Set<string>()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none',
          'md:left-[268px] md:h-[100dvh] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center gap-2 pr-10 sm:flex-nowrap sm:gap-3">
            <DialogHeader className="shrink-0 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Allocated SRF
              </DialogTitle>
            </DialogHeader>

            <div className="order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
              <Input
                type="search"
                placeholder="Search"
                aria-label="Search allocated SRFs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(limsDarkBarSearchClass, 'h-8')}
              />
            </div>

            <div className="w-[6.5rem] shrink-0">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v))}
              >
                <SelectTrigger
                  className={cn(
                    limsDarkBarFieldClass,
                    'w-full border-amber-500/40 text-amber-100 focus:border-amber-500 focus:bg-stone-900 focus:text-amber-50',
                  )}
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 / Page</SelectItem>
                  <SelectItem value="10">10 / Page</SelectItem>
                  <SelectItem value="20">20 / Page</SelectItem>
                  <SelectItem value="50">50 / Page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <span className="ml-auto text-xs text-stone-300 sm:ml-0">
              {filteredRows.length} SRF{filteredRows.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          {rows.length === 0 ? (
            <p className="text-sm text-stone-600">No allocated SRFs yet.</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-stone-600">No allocated SRFs match your search.</p>
          ) : (
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(th, 'w-10')}>
                    <input
                      type="checkbox"
                      aria-label="Select all filtered"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allChecked && someChecked
                      }}
                      onChange={(e) => onToggleAll(e.target.checked, filteredIds)}
                    />
                  </th>
                  <th className={cn(th, 'text-left')}>SRF Number</th>
                  <th className={th}>Date</th>
                  <th className={th}>IS Code</th>
                  <th className={th}>Section Code</th>
                  <th className={th}>Department</th>
                  <th className={th}>Sample Quantity</th>
                  <th className={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => {
                  const actionsLocked = areSampleAllocationActionsLocked(r, testAllocIds)
                  const lockedSections = getSectionCodesInTestAllocation(r, testAllocIds)
                  const lockTitle = sampleAllocationEditLockedTitle(lockedSections)

                  return (
                    <tr key={r.sampleId} className="odd:bg-white/70">
                      <td className={cn(td, 'text-center')}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.sample.srf_number ?? r.sampleId}`}
                          checked={selectedIds.has(r.sampleId)}
                          onChange={() => onToggle(r.sampleId)}
                        />
                      </td>
                      <td className={cn(td, 'text-left font-medium')}>{fmt(r.sample.srf_number)}</td>
                      <td className={cn(td, 'text-center text-xs')}>
                        {fmtDate(r.sample.date_of_sample_receiving ?? r.sample.collection_date)}
                      </td>
                      <td className={cn(td, 'text-center')}>{fmt(r.sample.test_report_is_code_label)}</td>
                      <td className={cn(td, 'text-center')}>{joinList(r.sectionCodes)}</td>
                      <td className={cn(td, 'text-center text-xs')}>{joinList(r.departments)}</td>
                      <td className={cn(td, 'text-center text-xs')}>{joinList(r.quantities)}</td>
                      <td className={cn(td, 'text-center')}>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-none"
                            aria-label="Edit allocation"
                            title={actionsLocked ? lockTitle : 'Edit section codes and departments'}
                            disabled={actionsLocked || !onEdit}
                            onClick={() => {
                              onOpenChange(false)
                              window.setTimeout(() => onEdit?.(r), 0)
                            }}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-none"
                            aria-label="Refer back to Sample Receiving"
                            title={
                              actionsLocked
                                ? lockTitle
                                : 'Refer back to Sample Receiving'
                            }
                            disabled={actionsLocked || !onReferbackToReceiving}
                            onClick={() => {
                              onOpenChange(false)
                              window.setTimeout(() => onReferbackToReceiving?.(r), 0)
                            }}
                          >
                            <Inbox size={16} className="text-amber-700" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-none"
                            aria-label="Send for Test Allocation"
                            title={
                              actionsLocked
                                ? lockTitle
                                : 'Send for Test Allocation'
                            }
                            disabled={actionsLocked || !onSendToTestAllocation}
                            onClick={() => {
                              onOpenChange(false)
                              window.setTimeout(() => onSendToTestAllocation?.(r), 0)
                            }}
                          >
                            <SendHorizontal size={16} className="text-amber-800" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="relative shrink-0 overflow-hidden border-t-2 border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5">
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-stone-300">Selected: {selectedOnFiltered}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className={cn(limsDarkBarFieldClass, 'w-14 sm:w-16')}
                placeholder="Page"
                value={jumpTo}
                onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label="Jump to page"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={limsDarkBarBtnClass}
                onClick={() => {
                  const n = Number(jumpTo)
                  if (Number.isFinite(n) && n > 0) {
                    setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
                  }
                  setJumpTo('')
                }}
              >
                Jump
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn('h-8 w-8', limsDarkBarBtnClass)}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-xs font-medium text-stone-300">
                Page {page} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn('h-8 w-8', limsDarkBarBtnClass)}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
