import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { TestAllocationRow } from '../types'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')

const th = cn(limsTableHeadClass, 'border border-stone-700 px-2 py-1.5')
const td = 'border border-[#e7e0d4] px-2 py-1.5'

export function SrfsInTestingDialog({
  open,
  onOpenChange,
  rows,
  onViewParameters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: TestAllocationRow[]
  onViewParameters?: (row: TestAllocationRow) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set())
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
        r.srfNumber,
        r.sectionCode,
        r.department,
        r.isCodeLabel,
        r.testParameterSummary,
        r.assignedEmployeeName,
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

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.sampleAllocationId))
    setSelectedIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id)
      })
      return next
    })
  }, [rows])

  const filteredIds = useMemo(
    () => filteredRows.map((r) => r.sampleAllocationId),
    [filteredRows],
  )
  const allChecked = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))
  const someChecked = filteredIds.some((id) => selectedIds.has(id))
  const selectedCount = filteredIds.filter((id) => selectedIds.has(id)).length

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filteredIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none',
          'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center gap-2 pr-10 sm:flex-nowrap sm:gap-3">
            <DialogHeader className="shrink-0 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                SRF Sent for Testing
              </DialogTitle>
            </DialogHeader>

            <div className="order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
              <Input
                type="search"
                placeholder="Search"
                aria-label="Search SRFs sent for testing"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(limsDarkBarSearchClass, 'h-8')}
              />
            </div>

            <div className="w-[6.5rem] shrink-0">
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
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
            <p className="text-sm text-stone-600">No SRFs have been sent for testing yet.</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-stone-600">No SRFs match your search.</p>
          ) : (
            <table className="w-full min-w-[860px] border-collapse text-sm">
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
                      onChange={(e) => toggleAllFiltered(e.target.checked)}
                    />
                  </th>
                  <th className={cn(th, 'text-left')}>SRF Number</th>
                  <th className={th}>Section Code</th>
                  <th className={th}>Department</th>
                  <th className={th}>IS Code</th>
                  <th className={th}>Test Parameter</th>
                  <th className={th}>Employee Name</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => {
                  const paramSummary = (r.testParameterSummary ?? '').trim()
                  const hasParameters =
                    paramSummary.length > 0 || (r.testParameterIds?.length ?? 0) > 0

                  return (
                    <tr key={r.sampleAllocationId} className="odd:bg-white/70">
                      <td className={cn(td, 'text-center')}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.sectionCode}`}
                          checked={selectedIds.has(r.sampleAllocationId)}
                          onChange={() => toggleRow(r.sampleAllocationId)}
                        />
                      </td>
                      <td className={cn(td, 'text-left font-medium')}>{fmt(r.srfNumber)}</td>
                      <td className={cn(td, 'text-center')}>{fmt(r.sectionCode)}</td>
                      <td className={cn(td, 'text-center')}>{fmt(r.department)}</td>
                      <td className={cn(td, 'text-center text-xs')} title={r.isCodeLabel ?? undefined}>
                        {fmt(r.isCodeLabel)}
                      </td>
                      <td className={cn(td, 'text-center')}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 rounded-none px-2"
                          aria-label={`View test parameters for ${r.sectionCode}`}
                          title={
                            hasParameters
                              ? paramSummary || 'View allotted test parameters'
                              : 'View test parameters (none allotted yet)'
                          }
                          disabled={!onViewParameters}
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewParameters?.(r)
                          }}
                        >
                          <Eye size={14} />
                          View
                        </Button>
                      </td>
                      <td className={cn(td, 'text-center')}>{fmt(r.assignedEmployeeName)}</td>
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
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
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
