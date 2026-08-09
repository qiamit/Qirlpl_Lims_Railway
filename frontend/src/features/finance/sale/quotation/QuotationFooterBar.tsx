import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight, Download, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function QuotationFooterBar({
  message,
  loading,
  selectedCount,
  totalCount,
  page,
  pageCount,
  pageSize,
  onPageSizeChange,
  onExport,
  onPrintSelected,
  onDeleteSelected,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  totalCount: number
  page: number
  pageCount: number
  pageSize: number
  onPageSizeChange: (size: number) => void
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col gap-3 relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-3 py-3 shadow-sm sm:px-5 sm:py-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className={cn('gap-1.5', limsDarkBarBtnClass)} onClick={onExport} disabled={loading}>
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm" className={cn('gap-1.5', limsDarkBarBtnClass)}
            onClick={onPrintSelected}
            disabled={loading}
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button
            type="button"
            variant="destructive" size="sm" className={limsDeleteBtnClass}
            onClick={onDeleteSelected}
            disabled={loading || selectionDisabled}
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Delete</span>
          </Button>
          {selectedCount > 0 ? (
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
          ) : null}
          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved') || message.toLowerCase().includes('deleted')
                  ? 'w-full text-sm text-emerald-300 sm:w-auto'
                  : 'w-full text-sm text-red-300 sm:w-auto'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-nowrap items-center justify-start gap-2 overflow-x-auto overscroll-x-contain pb-0.5 sm:justify-end sm:gap-3">
          <p className="shrink-0 whitespace-nowrap text-sm text-stone-300">
            Showing <span className="font-medium text-white">{from}</span>–
            <span className="font-medium text-white">{to}</span> of{' '}
            <span className="font-medium text-white">{totalCount}</span>
          </p>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-[110px] shrink-0')} aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline" size="sm" className={cn('h-8 w-8 shrink-0 px-0', limsDarkBarBtnClass)}
            disabled={page <= 1 || loading}
            onClick={onPrevPage}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="shrink-0 text-sm tabular-nums text-stone-300">
            {page} / {Math.max(pageCount, 1)}
          </span>
          <Button
            type="button"
            variant="outline" size="sm" className={cn('h-8 w-8 shrink-0 px-0', limsDarkBarBtnClass)}
            disabled={page >= pageCount || loading}
            onClick={onNextPage}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </Button>
          <Input
            className={cn(limsDarkBarFieldClass, 'w-14 shrink-0')}
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value)}
            aria-label="Jump to page"
          />
          <Button type="button" variant="outline" size="sm" className={cn('shrink-0', limsDarkBarBtnClass)} onClick={onJumpToGo}>
            Go
          </Button>
        </div>
      </div>
    </div>
  )
}
