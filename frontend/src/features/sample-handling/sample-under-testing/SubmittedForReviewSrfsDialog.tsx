import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
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
import { isActiveReviewerName } from '../results-under-review/resultsUnderReviewPartitions'
import type { TestAllocationRow } from '../types'
import {
  getUnderTestingSubmittedStatus,
  isSectionApprovedForDisplay,
  UNDER_TESTING_SUBMITTED_STATUS_LABEL,
} from './underTestingSectionStatus'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '—')

const th = cn(limsTableHeadClass, 'border border-stone-700 px-2 py-1.5')
const td = 'border border-[#e7e0d4] px-2 py-1.5 text-xs text-[#292524]'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

function statusBadgeLabel(row: TestAllocationRow): string {
  const status = getUnderTestingSubmittedStatus(row)
  if (status === 'test_report_issued') return 'Issued'
  if (isSectionApprovedForDisplay(row)) return 'Reviewed'
  return 'Under Review'
}

/** Default list order: Under Review → Reviewed → Issued */
function statusSortRank(row: TestAllocationRow): number {
  const badge = statusBadgeLabel(row)
  if (badge === 'Under Review') return 0
  if (badge === 'Reviewed') return 1
  if (badge === 'Issued') return 2
  return 3
}

function compareSubmittedRows(a: TestAllocationRow, b: TestAllocationRow): number {
  const byStatus = statusSortRank(a) - statusSortRank(b)
  if (byStatus !== 0) return byStatus
  const bySrf = (a.srfNumber ?? '').localeCompare(b.srfNumber ?? '', undefined, {
    sensitivity: 'base',
    numeric: true,
  })
  if (bySrf !== 0) return bySrf
  return (a.sectionCode ?? '').localeCompare(b.sectionCode ?? '', undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

function rowMatchesSearch(row: TestAllocationRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const status = getUnderTestingSubmittedStatus(row)
  const haystack = [
    row.srfNumber,
    row.sectionCode,
    row.department,
    row.designation,
    row.isCodeLabel,
    row.assignedEmployeeName,
    row.resultsReviewerName,
    row.sampleDescription,
    row.declaredValue,
    status,
    UNDER_TESTING_SUBMITTED_STATUS_LABEL[status],
    statusBadgeLabel(row),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // Multi-word: every token must appear somewhere in the row.
  return q.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token))
}

export function SubmittedForReviewSrfsDialog({
  open,
  onOpenChange,
  rows,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: TestAllocationRow[]
}) {
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!open) {
      setSearch('')
      setPage(1)
      setJumpTo('')
      setSelectedIds(new Set())
    }
  }, [open])

  const filteredRows = useMemo(() => {
    const q = search.trim()
    const list = q ? rows.filter((r) => rowMatchesSearch(r, q)) : [...rows]
    return list.sort(compareSubmittedRows)
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount))
  }, [pageCount])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

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

  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

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
                Submitted for Review
              </DialogTitle>
            </DialogHeader>

            <div className="relative order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search SRF, section, reviewer…"
                aria-label="Search submitted for review"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className={cn(limsDarkBarSearchClass, 'h-8 pl-9')}
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
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          {rows.length === 0 ? (
            <p className="text-sm text-stone-600">No SRFs have been submitted for review yet.</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-stone-600">No SRFs match your search.</p>
          ) : (
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(th, 'w-10')}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
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
                  <th className={th}>Status</th>
                  <th className={th}>Reviewer</th>
                  <th className={th}>Assigned Employee</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, index) => {
                  const badge = statusBadgeLabel(r)

                  return (
                    <tr
                      key={r.sampleAllocationId}
                      className={index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}
                    >
                      <td className={cn(td, 'text-center')}>
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${r.sectionCode}`}
                          checked={selectedIds.has(r.sampleAllocationId)}
                          onChange={() => toggleRow(r.sampleAllocationId)}
                        />
                      </td>
                      <td className={cn(td, 'text-left font-medium')}>{fmt(r.srfNumber)}</td>
                      <td className={cn(td, 'text-center font-semibold')}>{fmt(r.sectionCode)}</td>
                      <td className={cn(td, 'text-center')}>{fmt(r.department)}</td>
                      <td className={cn(td, 'text-center')} title={r.isCodeLabel ?? undefined}>
                        {fmt(r.isCodeLabel)}
                      </td>
                      <td className={cn(td, 'text-center')}>
                        <span className="inline-block border border-stone-500 bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-800">
                          {badge}
                        </span>
                      </td>
                      <td className={cn(td, 'text-center')}>
                        {isActiveReviewerName(r.resultsReviewerName)
                          ? fmt(r.resultsReviewerName)
                          : '—'}
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
            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-300">
              <span>Selected: {selectedCount}</span>
              {search.trim() ? (
                <span>
                  Showing {filteredRows.length} of {rows.length}
                </span>
              ) : null}
            </div>
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
