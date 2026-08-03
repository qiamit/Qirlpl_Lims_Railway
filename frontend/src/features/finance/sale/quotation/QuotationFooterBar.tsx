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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-5 sm:py-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onExport} disabled={loading}>
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onPrintSelected}
            disabled={loading}
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={onDeleteSelected}
            disabled={loading || selectionDisabled}
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Delete</span>
          </Button>
          {selectedCount > 0 ? (
            <span className="text-xs text-muted-foreground">Selected: {selectedCount}</span>
          ) : null}
          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved') || message.toLowerCase().includes('deleted')
                  ? 'w-full text-sm text-emerald-700 sm:w-auto'
                  : 'w-full text-sm text-destructive sm:w-auto'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-nowrap items-center justify-start gap-2 overflow-x-auto overscroll-x-contain pb-0.5 sm:justify-end sm:gap-3">
          <p className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{from}</span>–
            <span className="font-medium text-foreground">{to}</span> of{' '}
            <span className="font-medium text-foreground">{totalCount}</span>
          </p>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-9 w-[118px] shrink-0" aria-label="Rows per page">
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
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 px-0"
            disabled={page <= 1 || loading}
            onClick={onPrevPage}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {page} / {Math.max(pageCount, 1)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 px-0"
            disabled={page >= pageCount || loading}
            onClick={onNextPage}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </Button>
          <Input
            className="h-9 w-14 shrink-0"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value)}
            aria-label="Jump to page"
          />
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={onJumpToGo}>
            Go
          </Button>
        </div>
      </div>
    </div>
  )
}
