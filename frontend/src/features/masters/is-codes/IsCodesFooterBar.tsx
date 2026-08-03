import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function IsCodesTableFooterBar({
  message,
  loading,
  selectedCount,
  totalCount,
  page,
  pageCount,
  pageSize,
  onPageSizeChange,
  onImport,
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
  onImport: () => void
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onImport} disabled={loading}>
            <FileUp size={14} />
            Import
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onExport} disabled={loading}>
            <Download size={14} />
            Export
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onPrintSelected} disabled={loading}>
            <Printer size={14} />
            Print
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
            Delete
          </Button>
          {selectedCount > 0 ? (
            <span className="text-xs text-muted-foreground">Selected: {selectedCount}</span>
          ) : null}
          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved') ||
                message.toLowerCase().includes('deleted') ||
                message.toLowerCase().includes('imported')
                  ? 'text-sm text-emerald-700'
                  : 'text-sm text-muted-foreground'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto sm:gap-3">
          <p className="shrink-0 text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{from}</span>–
            <span className="font-medium text-foreground">{to}</span> of{' '}
            <span className="font-medium text-foreground">{totalCount}</span>
          </p>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-9 w-[118px] shrink-0" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 / Page</SelectItem>
              <SelectItem value="10">10 / Page</SelectItem>
              <SelectItem value="20">20 / Page</SelectItem>
              <SelectItem value="50">50 / Page</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label="Jump to page"
            placeholder="Page"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJumpToGo()
            }}
            className="h-9 w-20 shrink-0"
            inputMode="numeric"
          />
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onJumpToGo} disabled={loading}>
            Jump
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onPrevPage}
            disabled={loading || page <= 1}
          >
            <ChevronLeft size={16} />
            <span className="sr-only">Previous page</span>
          </Button>
          <span className="min-w-[5.5rem] shrink-0 text-center text-xs font-medium text-muted-foreground">
            Page {page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onNextPage}
            disabled={loading || page >= pageCount}
          >
            <ChevronRight size={16} />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
